"""
Admin surface for the standalone portfolio_contracts table (migration 048).

Two ways data gets in, gated by portfolio_contracts_sync_state.is_full_tenant:
  - Portfolio-only tenants (is_full_tenant=0): staff upload a spreadsheet here
    (POST /upload). Upsert-by-esi_id, not destructive TRUNCATE -- unlike the
    existing contract_renewal bulk upload, re-uploading a corrected file
    doesn't wipe every other row first.
  - Full-4-module tenants (is_full_tenant=1): rows come ONLY from the
    contract_renewal sync triggers (see migration 048). POST /upload is
    blocked server-side once upgraded -- not just hidden in the frontend nav,
    per explicit requirement: hiding a nav link is not access control.

POST /upgrade is the ONLY way is_full_tenant flips to 1. It is a deliberate,
staff-run action (not inferred from TENANT_MODULES at login/request time) so
the discrepancy-check-then-clear-and-replace sequence happens at a known,
controlled moment. It:
  1. Refuses if TENANT_MODULES isn't actually configured for the full
     platform yet (upgrading the data model ahead of the entitlement would
     silently point Portfolio at contract data before the tenant is
     supposed to have Sales/Operations/Audit at all).
  2. Refuses if already upgraded (idempotent no-op returns 409, not a
     duplicate upgrade).
  3. Diffs every existing source='upload' row against what contract_renewal
     would sync for that esi_id, logging every differing field to
     portfolio_contract_upgrade_discrepancies BEFORE touching any data.
  4. Deletes the source='upload' rows and bulk-backfills source='synced'
     rows from contract_renewal (the triggers only fire on FUTURE writes --
     this is the one-time catch-up for everything already in the table).
  5. Flips is_full_tenant=1, records upgraded_at/upgraded_by.
All in one transaction: a failure partway through leaves the tenant exactly
as it was before the call, not half-migrated.
"""
import asyncio
import io
import logging
import os
import uuid
from datetime import datetime, date, timedelta
from decimal import Decimal

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.auth import require_admin
from utils.contract_type_utils import sync_map_contract_type
from utils.contract_upload_validation import (
    DATE_FORMATS_MDY, LoadProfileMasterUnavailable, load_valid_profiles, parse_date, validate_contract_row_detailed,
)
from utils.database import get_db
from utils.unsynced_contracts import get_unsynced_summary
from utils.tenant_module_config import get_configured_modules
from utils.tenant_modules import ALL_MODULES
from utils.zone_mapping import weather_to_load

router = APIRouter(prefix="/admin/portfolio-contracts", tags=["admin"])

logger = logging.getLogger("portfolio_upload")
try:  # also keep the full traceback in a file, not only the console
    from logging.handlers import RotatingFileHandler
    _log_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "logs")
    os.makedirs(_log_dir, exist_ok=True)
    _fh = RotatingFileHandler(os.path.join(_log_dir, "portfolio_upload_errors.log"), maxBytes=2_000_000, backupCount=3, encoding="utf-8")
    _fh.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logger.addHandler(_fh)
except OSError:
    pass

_STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")

# company_name/broker_code are no longer part of the upload path (removed at
# the user's request) -- they still exist on the table and keep populating
# for source='synced' rows via the contract_renewal triggers, untouched below.
_REQUIRED_COLS = ["esi_id", "load_profile", "contract_rate", "annual_volume", "contract_type", "contract_end_date"]
_OPTIONAL_COLS = ["contract_start_date"]
# _ALLOWED_TYPES and normalization live in utils/contract_type_utils.py so
# they are shared with the contract_renewal upload and enrollment paths.
_ALL_UPLOAD_COLS = ["esi_id", "load_profile", "contract_rate", "annual_volume", "contract_type", "contract_start_date", "contract_end_date"]

# Same visibility gate the AFTER INSERT/UPDATE triggers use -- a
# contract_renewal row that wouldn't be visible in the old portfolio_view
# isn't a valid sync candidate either.
_SYNC_CANDIDATES_SQL = """
    SELECT serial, premise_id AS esi_id, load_profile, contract_rate,
           contract_renewal_usage AS annual_volume,
           STR_TO_DATE(contract_end_date, '%m/%d/%Y') AS contract_end_date,
           contract_type, company_name, broker_code
    FROM contract_renewal
    WHERE premise_id IS NOT NULL
      AND load_profile IS NOT NULL
      AND STR_TO_DATE(contract_end_date, '%m/%d/%Y') IS NOT NULL
"""

_DIFF_FIELDS = ["load_profile", "contract_rate", "annual_volume", "contract_end_date", "contract_type", "company_name", "broker_code"]


def _extract_zones(load_profile: str):
    """Return (weather_zone, load_zone) from a load_profile string, or (None, None)."""
    if not load_profile:
        return None, None
    parts = load_profile.upper().split("_")
    weather_zone = next((p for p in parts if weather_to_load(p)), None)
    load_zone = weather_to_load(weather_zone) if weather_zone else None
    return weather_zone, load_zone


def _forecast_end_date(end_date_str: str) -> str:
    """Return forecast_end_date: future dates as-is, expired/null → today + 15 days."""
    today = date.today()
    raw = _parse_date(end_date_str)
    if raw:
        d = datetime.strptime(raw, "%Y-%m-%d").date()
        if d >= today:
            return raw
    return (today + timedelta(days=15)).strftime("%Y-%m-%d")


_parse_date = parse_date


async def _get_sync_state(db: AsyncSession) -> dict:
    result = await db.execute(
        text("SELECT is_full_tenant, upgraded_at, upgraded_by FROM portfolio_contracts_sync_state WHERE id = 1")
    )
    row = result.fetchone()
    if not row:
        return {"is_full_tenant": 0, "upgraded_at": None, "upgraded_by": None}
    return {"is_full_tenant": row.is_full_tenant, "upgraded_at": row.upgraded_at, "upgraded_by": row.upgraded_by}


@router.get("/status")
async def portfolio_contracts_status(
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    state = await _get_sync_state(db)
    counts = await db.execute(
        text("SELECT source, COUNT(*) AS n FROM portfolio_contracts GROUP BY source")
    )
    by_source = {row.source: row.n for row in counts.fetchall()}
    return {
        "is_full_tenant": bool(state["is_full_tenant"]),
        "upgraded_at": state["upgraded_at"].isoformat() if state["upgraded_at"] else None,
        "upgraded_by": state["upgraded_by"],
        "rows_by_source": {"upload": by_source.get("upload", 0), "synced": by_source.get("synced", 0)},
        "duplicate_upload_esis": await _count_duplicate_upload_esis(db),
        "unsynced_contracts": await get_unsynced_summary(db),
    }


@router.get("/template")
async def download_template(admin: dict = Depends(require_admin)):
    path = os.path.join(_STATIC_DIR, "portfolio_contracts_template.csv")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Template file not found")
    return FileResponse(path, filename="portfolio_contracts_template.csv", media_type="text/csv")


@router.get("/sample")
async def download_sample(admin: dict = Depends(require_admin)):
    path = os.path.join(_STATIC_DIR, "portfolio_contracts_sample.csv")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Sample file not found")
    return FileResponse(path, filename="portfolio_contracts_sample.csv", media_type="text/csv")


def _validate_row(idx: int, data: dict, valid_profiles: frozenset[str]) -> tuple[list[dict], dict | None]:
    """Validate one CSV row via the shared validator (also used by contract_renewal).

    strict_esi: any whitespace in the ESI ID rejects the row (nothing is trimmed).
    """
    problems, parsed = validate_contract_row_detailed(
        data, valid_profiles=valid_profiles, strict_esi=True,
        date_formats=DATE_FORMATS_MDY, start_date_formats=DATE_FORMATS_MDY)
    if problems:
        return problems, None
    return [], {k: parsed[k] for k in (
        "esi_id", "load_profile", "contract_rate", "annual_volume",
        "contract_type", "contract_start_date", "contract_end_date",
    )}


_BATCH = 500


def _chunks(seq: list, n: int = _BATCH):
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


def _values_sql(prefix: str, n_rows: int, cols: list[str]) -> str:
    return ",".join("(" + ",".join(f":{prefix}{i}_{c}" for c in cols) + ")" for i in range(n_rows))


def _flat(prefix: str, rows: list[dict], cols: list[str]) -> dict:
    return {f"{prefix}{i}_{c}": r[c] for i, r in enumerate(rows) for c in cols}


_PC_COLS = ["esi_id", "load_profile", "contract_rate", "annual_volume", "contract_type",
            "contract_start_date", "contract_end_date"]


async def _existing_upload_ids(db: AsyncSession, esis: list[str]) -> dict[str, int]:
    """esi_id (upper-cased, like the case-insensitive column) -> id of its source='upload' row."""
    found: dict[str, int] = {}
    for chunk in _chunks(esis):
        ph = ",".join(f":e{i}" for i in range(len(chunk)))
        res = await db.execute(
            text(f"SELECT esi_id, MIN(id) AS id FROM portfolio_contracts "
                 f"WHERE source = 'upload' AND esi_id IN ({ph}) GROUP BY esi_id"),
            {f"e{i}": v for i, v in enumerate(chunk)},
        )
        for r in res:
            found[str(r.esi_id).strip().upper()] = r.id
    return found


async def _count_duplicate_upload_esis(db: AsyncSession) -> int:
    """Number of ESIs that have more than one source='upload' row (should always be 0)."""
    res = await db.execute(text(
        "SELECT COUNT(*) FROM (SELECT esi_id FROM portfolio_contracts WHERE source = 'upload' "
        "GROUP BY esi_id HAVING COUNT(*) > 1) d"))
    return int(res.scalar() or 0)


async def _duplicate_upload_esis(db: AsyncSession, esis: list[str]) -> list[str]:
    """
    ESIs (from this upload) that now have more than one source='upload' row. A locking read
    (LOCK IN SHARE MODE) is used on purpose: a plain read only sees this transaction's snapshot and would
    miss rows another request committed meanwhile, which is exactly the case this guards.
    """
    dups: list[str] = []
    for chunk in _chunks(esis):
        ph = ",".join(f":e{i}" for i in range(len(chunk)))
        res = await db.execute(
            text(f"SELECT esi_id FROM portfolio_contracts WHERE source = 'upload' AND esi_id IN ({ph}) "
                 f"GROUP BY esi_id HAVING COUNT(*) > 1 LOCK IN SHARE MODE"),
            {f"e{i}": v for i, v in enumerate(chunk)},
        )
        dups.extend(str(r.esi_id) for r in res)
    return dups


async def _write_contracts(db: AsyncSession, parsed_rows: list[dict]) -> tuple[int, int, list[dict]]:
    """Set-based replacement for the old one-row-at-a-time lookup + INSERT/UPDATE."""
    existing = await _existing_upload_ids(db, [p["esi_id"] for p in parsed_rows])
    new_rows = [p for p in parsed_rows if p["esi_id"].strip().upper() not in existing]
    upd_rows = [{**p, "id": existing[p["esi_id"].strip().upper()]} for p in parsed_rows
                if p["esi_id"].strip().upper() in existing]

    for chunk in _chunks(new_rows):
        await db.execute(
            text(f"INSERT INTO portfolio_contracts ({', '.join(_PC_COLS)}, source) VALUES "
                 + ",".join("(" + ",".join(f":n{i}_{c}" for c in _PC_COLS) + ", 'upload')" for i in range(len(chunk)))),
            _flat("n", chunk, _PC_COLS),
        )
    # Existing rows: INSERT ... ON DUPLICATE KEY UPDATE on the primary key, i.e. one batched UPDATE.
    upd_cols = ["id"] + _PC_COLS
    for chunk in _chunks(upd_rows):
        await db.execute(
            text(f"INSERT INTO portfolio_contracts ({', '.join(upd_cols)}, source) VALUES "
                 + ",".join("(" + ",".join(f":u{i}_{c}" for c in upd_cols) + ", 'upload')" for i in range(len(chunk)))
                 + " ON DUPLICATE KEY UPDATE load_profile = VALUES(load_profile), "
                   "contract_rate = VALUES(contract_rate), annual_volume = VALUES(annual_volume), "
                   "contract_type = VALUES(contract_type), contract_start_date = VALUES(contract_start_date), "
                   "contract_end_date = VALUES(contract_end_date)"),
            _flat("u", chunk, upd_cols),
        )

    results = [{"esi_id": p["esi_id"],
                "status": "updated" if p["esi_id"].strip().upper() in existing else "inserted"}
               for p in parsed_rows]
    return len(new_rows), len(upd_rows), results


async def _sync_forecast_tables_bulk(db: AsyncSession, parsed_rows: list[dict]) -> None:
    """
    Same rules as the old per-row _sync_forecast_tables, applied in batches:
      Future (with a start date) -> future_forecast_dates upsert, delete from customer_forecast_dates.
      any other type             -> customer_forecast_dates upsert (expiry rule), delete from future_forecast_dates.
    Each ESI appears once per upload (duplicates are rejected), so batching cannot change the result.
    """
    future: list[dict] = []
    customer: list[dict] = []
    for p in parsed_rows:
        weather_zone, load_zone = _extract_zones(p["load_profile"])
        try:
            kwh = Decimal(str(p["annual_volume"]).replace(",", "")) if p["annual_volume"] else None
        except Exception:
            kwh = None
        base = {"esid": p["esi_id"], "lp": p["load_profile"], "kwh": kwh, "lz": load_zone, "wz": weather_zone}
        if p["contract_type"] == "Future":
            if not p["contract_start_date"]:
                continue
            future.append({**base, "start": p["contract_start_date"], "end": p["contract_end_date"]})
        else:
            customer.append({**base, "cend": p["contract_end_date"],
                             "fend": _forecast_end_date(p["contract_end_date"])})

    fcols = ["esid", "start", "end", "lp", "kwh", "lz", "wz"]
    for chunk in _chunks(future):
        await db.execute(text(
            "INSERT INTO future_forecast_dates (esid, forecast_start_date, forecast_end_date, "
            "load_profile, annual_kwh, load_zone, weather_zone, source) VALUES "
            + ",".join("(" + ",".join(f":f{i}_{c}" for c in fcols) + ", 'portfolio_upload')" for i in range(len(chunk)))
            + " ON DUPLICATE KEY UPDATE forecast_start_date = VALUES(forecast_start_date), "
              "forecast_end_date = VALUES(forecast_end_date), load_profile = VALUES(load_profile), "
              "annual_kwh = VALUES(annual_kwh), load_zone = VALUES(load_zone), "
              "weather_zone = VALUES(weather_zone), source = 'portfolio_upload'"),
            _flat("f", chunk, fcols))
        ph = ",".join(f":d{i}" for i in range(len(chunk)))
        await db.execute(text(f"DELETE FROM customer_forecast_dates WHERE esid IN ({ph})"),
                         {f"d{i}": r["esid"] for i, r in enumerate(chunk)})

    ccols = ["esid", "cend", "fend", "lp", "kwh", "lz", "wz"]
    for chunk in _chunks(customer):
        await db.execute(text(
            "INSERT INTO customer_forecast_dates (esid, contract_end_date, forecast_end_date, "
            "load_profile, annual_kwh, load_zone, weather_zone) VALUES "
            + _values_sql("c", len(chunk), ccols)
            + " ON DUPLICATE KEY UPDATE contract_end_date = VALUES(contract_end_date), "
              "forecast_end_date = VALUES(forecast_end_date), load_profile = VALUES(load_profile), "
              "annual_kwh = VALUES(annual_kwh), load_zone = VALUES(load_zone), "
              "weather_zone = VALUES(weather_zone), updated_at = CURRENT_TIMESTAMP"),
            _flat("c", chunk, ccols))
        ph = ",".join(f":d{i}" for i in range(len(chunk)))
        await db.execute(text(f"DELETE FROM future_forecast_dates WHERE esid IN ({ph})"),
                         {f"d{i}": r["esid"] for i, r in enumerate(chunk)})


async def _acquire_upload_lock(db: AsyncSession):
    """
    Returns (connection, lock_name) when this request holds the per-database upload lock,
    or None when another upload holds it. GET_LOCK(name, 0) never waits. The lock belongs to
    the MySQL session of a dedicated connection, so a crashed or killed process frees it as
    soon as MySQL notices the connection is gone; no stale lock row can be left behind.
    """
    conn = await db.bind.connect()
    try:
        name = (await conn.execute(text("SELECT CONCAT('pu:', MD5(DATABASE()))"))).scalar()
        got = (await conn.execute(text("SELECT GET_LOCK(:n, 0)"), {"n": name})).scalar()
    except BaseException:
        await _drop_connection(conn)
        raise
    if got != 1:
        await conn.close()
        return None
    return conn, name


async def _drop_connection(conn) -> None:
    # invalidate() closes the real DB connection instead of returning it to the pool,
    # so a lock that is still held cannot survive on a pooled connection.
    try:
        await conn.invalidate()
    except Exception:
        pass
    try:
        await conn.close()
    except Exception:
        pass


async def _release_upload_lock(lock) -> None:
    conn, name = lock
    try:
        await asyncio.shield(conn.execute(text("SELECT RELEASE_LOCK(:n)"), {"n": name}))
    except BaseException:
        pass
    finally:
        await _drop_connection(conn)


@router.post("/upload")
async def upload_portfolio_contracts(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    """Wrapper: one upload at a time per tenant database (MySQL GET_LOCK, taken on its own
    connection). Any unexpected failure is logged in full server-side (with a reference id)
    and returned as a short clean message. No SQL or stack trace reaches the browser."""
    lock = await _acquire_upload_lock(db)
    if lock is None:
        raise HTTPException(status_code=409, detail="Another upload is still running. Wait for it to finish.")
    try:
        return await _upload_portfolio_contracts(file, db)
    except HTTPException:
        raise
    except Exception:
        try:
            await db.rollback()
        except Exception:
            pass
        ref = uuid.uuid4().hex[:8].upper()
        logger.exception("portfolio contract upload failed (ref %s, file %r)", ref, getattr(file, "filename", None))
        raise HTTPException(
            status_code=500,
            detail=f"The upload could not be completed because of a server error. Nothing was confirmed as imported. "
                   f"Please quote reference {ref} to support.",
        )
    finally:
        await _release_upload_lock(lock)


async def _upload_portfolio_contracts(file: UploadFile, db: AsyncSession):
    state = await _get_sync_state(db)
    if state["is_full_tenant"]:
        raise HTTPException(
            status_code=409,
            detail="This tenant is on the full platform — contract data now syncs automatically.",
        )

    content = await file.read()
    raw_text = None
    for encoding in ["utf-8", "latin-1", "cp1252"]:
        try:
            raw_text = content.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    if raw_text is None:
        raise HTTPException(status_code=400, detail="Could not decode file as text (tried utf-8, latin-1, cp1252)")

    try:
        df = pd.read_csv(io.StringIO(raw_text), sep=",", dtype=str)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not parse CSV: {exc}")

    missing_cols = [c for c in _REQUIRED_COLS if c not in df.columns]
    if missing_cols:
        raise HTTPException(status_code=400, detail=f"Missing required column(s): {', '.join(missing_cols)}")
    for col in _OPTIONAL_COLS:
        if col not in df.columns:
            df[col] = None
    df = df[_ALL_UPLOAD_COLS]
    df = df.where(pd.notnull(df), None)

    try:
        valid_profiles = await load_valid_profiles(db)
    except LoadProfileMasterUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    # ── Pass 1: validate every row. Nothing is inserted until ALL rows pass. ──
    validation_errors: list[dict] = []
    parsed_rows: list[dict] = []
    for idx, row in df.iterrows():
        data = row.to_dict()
        probs, params = _validate_row(idx, data, valid_profiles)
        if probs:
            # "line"/"row" = spreadsheet row as Excel shows it (header = row 1, first data row = 2)
            line = idx + 2
            validation_errors.append({
                "line": line,
                "row": line,
                "esi_id": str(data.get("esi_id") or ""),
                "errors": [p["message"] for p in probs],
                "problems": [{"row": line, **p} for p in probs],
            })
        else:
            parsed_rows.append(params)

    # Same ESI ID on more than one row: reject the whole file (Portfolio upload only).
    # Compared case-insensitively, like the database column.
    rows_by_esi: dict[str, list[int]] = {}
    for idx, esi in df["esi_id"].items():
        if esi is not None and str(esi).strip():
            rows_by_esi.setdefault(str(esi).strip().upper(), []).append(idx + 2)
    dup_problems: dict[int, dict] = {}
    for esi_key, lines in rows_by_esi.items():
        if len(lines) < 2:
            continue
        shown = ", ".join(str(n) for n in lines[:-1]) + f" and {lines[-1]}"
        for n in lines:
            dup_problems[n] = {
                "row": n, "column": "esi_id", "value": esi_key, "code": "esi_duplicate",
                "message": f"This ESI ID appears more than once in the file (rows {shown}). "
                           "Each ESI ID can appear only once.",
                "fix": "Keep one row for this ESI ID and delete or correct the others.",
            }
    if dup_problems:
        by_line = {r["line"]: r for r in validation_errors}
        for n, prob in dup_problems.items():
            entry = by_line.get(n)
            if entry is None:
                entry = {"line": n, "row": n, "esi_id": str(df["esi_id"].iloc[n - 2] or ""),
                         "errors": [], "problems": []}
                by_line[n] = entry
            entry["errors"].append(prob["message"])
            entry["problems"].append(prob)
        validation_errors = [by_line[k] for k in sorted(by_line)]

    if validation_errors:
        return {
            "accepted": False,
            "total_rows": len(df),
            "error_count": len(validation_errors),
            "problem_count": sum(len(r["problems"]) for r in validation_errors),
            "invalid_rows": validation_errors,
        }

    # ── Pass 2: all rows valid — set-based insert/update and forecast sync, one commit. ──
    inserted, updated, results = await _write_contracts(db, parsed_rows)
    await _sync_forecast_tables_bulk(db, parsed_rows)

    # Safety net: never commit if any ESI of this upload would end up with two upload rows.
    dups = await _duplicate_upload_esis(db, [r["esi_id"] for r in parsed_rows])
    if dups:
        await db.rollback()
        ref = uuid.uuid4().hex[:8].upper()
        logger.error("portfolio contract upload rolled back: %d ESI(s) would have duplicate upload rows "
                     "(ref %s, file %r, first: %s)", len(dups), ref, getattr(file, "filename", None), dups[:5])
        raise HTTPException(
            status_code=409,
            detail=f"The upload was cancelled and nothing was imported, because it would have created "
                   f"duplicate contracts. This usually means two uploads ran at the same time. "
                   f"Wait a minute, check the Portfolio page, then try again. Please quote reference {ref} to support.",
        )

    await db.commit()
    return {
        "accepted": True,
        "inserted": inserted,
        "updated": updated,
        "total_rows": len(df),
        "rows": results,
    }


@router.post("/upgrade")
async def upgrade_to_full_sync(
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    state = await _get_sync_state(db)
    if state["is_full_tenant"]:
        raise HTTPException(status_code=409, detail="This tenant has already been upgraded to full-platform sync.")

    configured = set(get_configured_modules())
    if configured != set(ALL_MODULES):
        raise HTTPException(
            status_code=400,
            detail=(
                "This tenant's TENANT_MODULES is not configured for the full platform "
                f"(currently: {', '.join(sorted(configured))}). Set TENANT_MODULES=enterprise "
                "(or all four modules) before running this upgrade."
            ),
        )

    try:
        upload_rows = (
            await db.execute(
                text(
                    "SELECT esi_id, load_profile, contract_rate, annual_volume, "
                    "contract_end_date, contract_type, company_name, broker_code "
                    "FROM portfolio_contracts WHERE source = 'upload'"
                )
            )
        ).fetchall()

        candidates = (await db.execute(text(_SYNC_CANDIDATES_SQL))).fetchall()
        # Best sync candidate per esi_id = the one with the latest contract_end_date
        # (the "current" segment) -- contract_renewal can carry multiple historical
        # segments per esi_id; the upload path only ever tracked one row per esi_id.
        best_candidate: dict[str, object] = {}
        for c in candidates:
            existing = best_candidate.get(c.esi_id)
            if existing is None or c.contract_end_date > existing.contract_end_date:
                best_candidate[c.esi_id] = c

        discrepancy_count = 0
        for u in upload_rows:
            match = best_candidate.get(u.esi_id)
            if match is None:
                await db.execute(
                    text(
                        "INSERT INTO portfolio_contract_upgrade_discrepancies "
                        "(esi_id, field_name, old_value, new_value) VALUES (:esi_id, 'esi_id', :old, NULL)"
                    ),
                    {"esi_id": u.esi_id, "old": u.esi_id},
                )
                discrepancy_count += 1
                continue
            for field in _DIFF_FIELDS:
                old_val = getattr(u, field)
                new_val = getattr(match, field)
                if str(old_val) != str(new_val):
                    await db.execute(
                        text(
                            "INSERT INTO portfolio_contract_upgrade_discrepancies "
                            "(esi_id, field_name, old_value, new_value) VALUES (:esi_id, :field, :old, :new)"
                        ),
                        {"esi_id": u.esi_id, "field": field, "old": str(old_val) if old_val is not None else None, "new": str(new_val) if new_val is not None else None},
                    )
                    discrepancy_count += 1

        await db.execute(text("DELETE FROM portfolio_contracts WHERE source = 'upload'"))
        cleared = len(upload_rows)

        for c in candidates:
            await db.execute(
                text(
                    """
                    INSERT INTO portfolio_contracts
                        (esi_id, load_profile, contract_rate, annual_volume, contract_end_date,
                         contract_type, company_name, broker_code, source, synced_from_serial)
                    VALUES
                        (:esi_id, :load_profile, :contract_rate, :annual_volume, :contract_end_date,
                         :contract_type, :company_name, :broker_code, 'synced', :serial)
                    ON DUPLICATE KEY UPDATE
                        esi_id = VALUES(esi_id), load_profile = VALUES(load_profile),
                        contract_rate = VALUES(contract_rate), annual_volume = VALUES(annual_volume),
                        contract_end_date = VALUES(contract_end_date), contract_type = VALUES(contract_type),
                        company_name = VALUES(company_name), broker_code = VALUES(broker_code), source = 'synced'
                    """
                ),
                {
                    "esi_id": c.esi_id, "load_profile": c.load_profile, "contract_rate": c.contract_rate,
                    "annual_volume": c.annual_volume, "contract_end_date": c.contract_end_date,
                    # normalize legacy types (Default->MTM, NULL+past->MTM, NULL+future->Fix, etc.)
                    "contract_type": sync_map_contract_type(c.contract_type, str(c.contract_end_date) if c.contract_end_date else None),
                    "company_name": c.company_name,
                    "broker_code": c.broker_code, "serial": c.serial,
                },
            )

        admin_email = admin.get("email")
        await db.execute(
            text(
                "UPDATE portfolio_contracts_sync_state "
                "SET is_full_tenant = 1, upgraded_at = NOW(), upgraded_by = :email WHERE id = 1"
            ),
            {"email": admin_email},
        )

        await db.commit()
    except Exception:
        await db.rollback()
        raise

    return {
        "upgraded": True,
        "discrepancies_found": discrepancy_count,
        "upload_rows_cleared": cleared,
        "synced_rows_backfilled": len(candidates),
    }


@router.get("/upgrade-report")
async def upgrade_discrepancy_report(
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    result = await db.execute(
        text(
            "SELECT esi_id, field_name, old_value, new_value, detected_at "
            "FROM portfolio_contract_upgrade_discrepancies ORDER BY detected_at DESC, id DESC"
        )
    )
    return {
        "discrepancies": [
            {
                "esi_id": row.esi_id,
                "field_name": row.field_name,
                "old_value": row.old_value,
                "new_value": row.new_value,
                "detected_at": row.detected_at.isoformat() if row.detected_at else None,
            }
            for row in result.fetchall()
        ]
    }
