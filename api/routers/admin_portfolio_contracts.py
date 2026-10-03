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
import io
import os
from datetime import datetime

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.auth import require_admin
from utils.database import get_db
from utils.tenant_module_config import get_configured_modules
from utils.tenant_modules import ALL_MODULES

router = APIRouter(prefix="/admin/portfolio-contracts", tags=["admin"])

_STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")

# company_name/broker_code are no longer part of the upload path (removed at
# the user's request) -- they still exist on the table and keep populating
# for source='synced' rows via the contract_renewal triggers, untouched below.
_REQUIRED_COLS = ["esi_id", "load_profile", "contract_rate", "annual_volume", "contract_type", "contract_end_date"]
_OPTIONAL_COLS = ["contract_start_date"]
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


def _parse_date(raw) -> str | None:
    if raw is None or (isinstance(raw, float) and raw != raw):
        return None
    raw = str(raw).strip()
    if not raw:
        return None
    for fmt in ("%m/%d/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


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


@router.post("/upload")
async def upload_portfolio_contracts(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(require_admin),
):
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

    results = []
    inserted = 0
    updated = 0
    errors = 0
    for idx, row in df.iterrows():
        line_no = idx + 2  # header is line 1
        data = row.to_dict()
        row_errors = []
        for col in _REQUIRED_COLS:
            if not data.get(col) or not str(data[col]).strip():
                row_errors.append(f"{col} is required")
        parsed_end_date = _parse_date(data.get("contract_end_date"))
        if data.get("contract_end_date") and not parsed_end_date:
            row_errors.append(f"contract_end_date '{data['contract_end_date']}' is not a valid date (expected MM/DD/YYYY or YYYY-MM-DD)")

        # contract_start_date is optional -- blank/missing defaults to today
        # (contract treated as already active); if provided, used as-is,
        # future dates included.
        raw_start = data.get("contract_start_date")
        if raw_start and str(raw_start).strip():
            parsed_start_date = _parse_date(raw_start)
            if not parsed_start_date:
                row_errors.append(f"contract_start_date '{raw_start}' is not a valid date (expected MM/DD/YYYY or YYYY-MM-DD)")
        else:
            parsed_start_date = datetime.now().strftime("%Y-%m-%d")

        if row_errors:
            errors += 1
            results.append({"line": line_no, "esi_id": data.get("esi_id"), "status": "error", "errors": row_errors})
            continue

        params = {
            "esi_id": str(data["esi_id"]).strip(),
            "load_profile": str(data["load_profile"]).strip(),
            "contract_rate": str(data["contract_rate"]).strip(),
            "annual_volume": str(data["annual_volume"]).strip(),
            "contract_type": str(data["contract_type"]).strip(),
            "contract_start_date": parsed_start_date,
            "contract_end_date": parsed_end_date,
        }

        existing = await db.execute(
            text("SELECT id FROM portfolio_contracts WHERE esi_id = :esi_id AND source = 'upload'"),
            {"esi_id": params["esi_id"]},
        )
        existing_row = existing.fetchone()
        if existing_row:
            await db.execute(
                text(
                    """
                    UPDATE portfolio_contracts
                    SET load_profile = :load_profile, contract_rate = :contract_rate,
                        annual_volume = :annual_volume, contract_type = :contract_type,
                        contract_start_date = :contract_start_date, contract_end_date = :contract_end_date
                    WHERE id = :id
                    """
                ),
                {**params, "id": existing_row.id},
            )
            updated += 1
            results.append({"line": line_no, "esi_id": params["esi_id"], "status": "updated"})
        else:
            await db.execute(
                text(
                    """
                    INSERT INTO portfolio_contracts
                        (esi_id, load_profile, contract_rate, annual_volume, contract_type,
                         contract_start_date, contract_end_date, source)
                    VALUES
                        (:esi_id, :load_profile, :contract_rate, :annual_volume, :contract_type,
                         :contract_start_date, :contract_end_date, 'upload')
                    """
                ),
                params,
            )
            inserted += 1
            results.append({"line": line_no, "esi_id": params["esi_id"], "status": "inserted"})

    await db.commit()
    return {
        "inserted": inserted,
        "updated": updated,
        "errors": errors,
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
                    "contract_type": c.contract_type, "company_name": c.company_name,
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
