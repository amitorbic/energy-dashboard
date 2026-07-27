import pandas as pd
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from utils.database import get_db
from pydantic import BaseModel
from typing import Optional
from middleware.auth import require_auth
import io
import numpy as np

router = APIRouter(prefix="/contract-renewal", tags=["contract-renewal"])


# ── Helpers ──────────────────────────────────────────────────────────────────

def _parse_zone(load_profile: Optional[str]) -> str:
    if not load_profile:
        return ""
    parts = load_profile.split("_")
    return parts[1] if len(parts) >= 2 else ""


def _build_summary(row: dict) -> str:
    company = row.get("company_name") or ""
    esi = row.get("premise_id") or ""
    zone = _parse_zone(row.get("load_profile"))
    ctype = row.get("contract_type") or ""
    rate_raw = row.get("contract_rate")
    try:
        rate_str = f"{float(rate_raw) * 100:.2f}¢/kWh" if rate_raw else ""
    except (ValueError, TypeError):
        rate_str = ""
    end_date = row.get("contract_end_date") or ""
    broker_name = row.get("broker_name") or ""
    broker_code = row.get("broker_code") or ""

    esi_part = f" (ESI: {esi})" if esi else ""
    detail_parts = []
    if zone:
        detail_parts.append(zone)
    if ctype:
        detail_parts.append(ctype)
    if rate_str:
        detail_parts.append(f"@ {rate_str}")
    if end_date:
        detail_parts.append(f"expires {end_date}")
    if broker_name and broker_code:
        detail_parts.append(f"broker: {broker_name} ({broker_code})")
    elif broker_name:
        detail_parts.append(f"broker: {broker_name}")

    detail = ", ".join(detail_parts)
    return f"{company}{esi_part} — {detail}" if detail else f"{company}{esi_part}"


def _alias_row(row: dict) -> dict:
    # Build summary from original (unaliased) row before renaming keys
    summary = _build_summary(row)
    d = dict(row)
    d["id"] = d.pop("serial", None)
    d["esi_id"] = d.pop("premise_id", None)
    d["energy_rate"] = d.pop("contract_rate", None)
    d["annual_usage_kwh"] = d.pop("contract_renewal_usage", None)
    d["customer_email"] = d.pop("cust_email", None)
    d["customer_phone"] = d.pop("cust_phone1", None)
    d["broker_id"] = d.pop("broker_code", None)
    d["customer_first_name"] = d.pop("cust_first_name", None)
    d["customer_last_name"] = d.pop("cust_last_name", None)
    d["summary"] = summary
    return d


class ContactUpdate(BaseModel):
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_first_name: Optional[str] = None
    customer_last_name: Optional[str] = None
    billing_address: Optional[str] = None
    billing_city: Optional[str] = None
    billing_state: Optional[str] = None
    billing_zip: Optional[str] = None
    premise_address: Optional[str] = None
    attn: Optional[str] = None


class AdminUpdate(ContactUpdate):
    # Contract terms
    energy_rate: Optional[str] = None
    contract_end_date: Optional[str] = None
    contract_start_date: Optional[str] = None
    load_profile: Optional[str] = None
    contract_type: Optional[str] = None
    plan_group: Optional[str] = None
    annual_usage_kwh: Optional[str] = None
    other_charge: Optional[str] = None
    broker_id: Optional[str] = None
    broker_name: Optional[str] = None
    comm_rate: Optional[str] = None
    # Tax exemptions
    city_tax_exempt: Optional[str] = None
    county_tax_exempt: Optional[str] = None
    state_tax_exempt: Optional[str] = None
    grt_tax_exempt: Optional[int] = None
    puc_tax_exempt: Optional[int] = None
    mtacda_tax_exempt: Optional[str] = None
    spdt_tax_exempt: Optional[str] = None
    spdt2_tax_exempt: Optional[str] = None


# Fields only admins may set — used to detect privilege escalation attempts
# Tax exemption fields are intentionally excluded: editable by any logged-in user.
_ADMIN_ONLY_FIELDS = {
    "energy_rate", "contract_end_date", "contract_start_date", "load_profile",
    "contract_type", "plan_group", "annual_usage_kwh", "other_charge",
    "broker_id", "broker_name", "comm_rate",
}

# Maps aliased request field names → DB column names
_FIELD_TO_COL = {
    "customer_email":    "cust_email",
    "customer_phone":    "cust_phone1",
    "customer_first_name": "cust_first_name",
    "customer_last_name":  "cust_last_name",
    "billing_address":  "billing_address",
    "billing_city":     "billing_city",
    "billing_state":    "billing_state",
    "billing_zip":      "billing_zip",
    "premise_address":  "premise_address",
    "attn":             "attn",
    # admin-only
    "energy_rate":      "contract_rate",
    "contract_end_date": "contract_end_date",
    "contract_start_date": "contract_start_date",
    "load_profile":     "load_profile",
    "contract_type":    "contract_type",
    "plan_group":       "plan_group",
    "annual_usage_kwh": "contract_renewal_usage",
    "other_charge":     "other_charge",
    "broker_id":        "broker_code",
    "broker_name":      "broker_name",
    "comm_rate":        "comm_rate",
    "city_tax_exempt":  "city_tax_exempt",
    "county_tax_exempt": "county_tax_exempt",
    "state_tax_exempt": "state_tax_exempt",
    "grt_tax_exempt":   "grt_tax_exempt",
    "puc_tax_exempt":   "puc_tax_exempt",
    "mtacda_tax_exempt": "mtacda_tax_exempt",
    "spdt_tax_exempt":  "spdt_tax_exempt",
    "spdt2_tax_exempt": "spdt2_tax_exempt",
}


COLUMN_MAP = {
    "usage": "contract_renewal_usage",
    # contract_rate → add to table or handle separately
}

valid_cols = [
    "cust_id",
    "company_name",
    "cust_first_name",
    "cust_last_name",
    "plan_group",
    "billing_address",
    "billing_city",
    "billing_state",
    "billing_zip",
    "cust_email",
    "cust_fax1",
    "cust_phone1",
    "premise_id",
    "premise_address2",
    "premise_city",
    "premise_state",
    "premise_zip",
    "broker_code",
    "broker_name",
    "comm_rate",
    "contract_end_date",
    "load_profile",
    "contract_renewal_usage",
    "other_charge",
    "bill_mode",
    "contract_type",
    "cust_type",
    "bill_date",
    "city_tax_exempt",
    "county_tax_exempt",
    "mtacda_tax_exempt",
    "spdt_tax_exempt",
    "spdt2_tax_exempt",
    "state_tax_exempt",
    "auto_pay_type",
    "bill_to_id",
    "attn",
    "contract_rate",
    "contract_start_date",
    "premise_address",
    "grt_tax_exempt",
    "puc_tax_exempt",
]


@router.post("/upload")
async def upload_contract_renewal(
    file: UploadFile = File(...), db: AsyncSession = Depends(get_db)
):
    content = await file.read()
    for encoding in ["utf-8", "latin-1", "cp1252"]:
        try:
            raw_text = content.decode(encoding)
            break
        except UnicodeDecodeError:
            continue

    df = pd.read_csv(
        io.StringIO(raw_text),
        sep=",",
        dtype={"premise_id": str, "cust_id": str},
    )

    # Rename mismatched columns
    df = df.rename(columns={"usage": "contract_renewal_usage"})

    # Fill missing columns with None
    for col in valid_cols:
        if col not in df.columns:
            df[col] = None

    df = df[valid_cols]

    # Replace NaN with None
    import numpy as np

    df = df.replace({np.nan: None})

    # ── TRUNCATE BEFORE INSERT — always fresh data ──
    await db.execute(text("TRUNCATE TABLE contract_renewal"))
    await db.commit()

    inserted = 0
    skipped = 0
    for _, row in df.iterrows():
        data = {k: (None if v != v else v) for k, v in row.to_dict().items()}
        try:
            await db.execute(
                text(
                    """
                INSERT INTO contract_renewal (
                    cust_id, company_name, cust_first_name, cust_last_name,
                    plan_group, billing_address, billing_city, billing_state,
                    billing_zip, cust_email, cust_fax1, cust_phone1,
                    premise_id, premise_address2, premise_city, premise_state,
                    premise_zip, broker_code, broker_name, comm_rate,
                    contract_end_date, load_profile, contract_renewal_usage,
                    other_charge, bill_mode, contract_type, cust_type,
                    bill_date, city_tax_exempt, county_tax_exempt,
                    mtacda_tax_exempt, spdt_tax_exempt, spdt2_tax_exempt,
                    state_tax_exempt, auto_pay_type, bill_to_id, attn,
                    contract_rate, contract_start_date, premise_address,
                    grt_tax_exempt, puc_tax_exempt
                ) VALUES (
                    :cust_id, :company_name, :cust_first_name, :cust_last_name,
                    :plan_group, :billing_address, :billing_city, :billing_state,
                    :billing_zip, :cust_email, :cust_fax1, :cust_phone1,
                    :premise_id, :premise_address2, :premise_city, :premise_state,
                    :premise_zip, :broker_code, :broker_name, :comm_rate,
                    :contract_end_date, :load_profile, :contract_renewal_usage,
                    :other_charge, :bill_mode, :contract_type, :cust_type,
                    :bill_date, :city_tax_exempt, :county_tax_exempt,
                    :mtacda_tax_exempt, :spdt_tax_exempt, :spdt2_tax_exempt,
                    :state_tax_exempt, :auto_pay_type, :bill_to_id, :attn,
                    :contract_rate, :contract_start_date, :premise_address,
                    :grt_tax_exempt, :puc_tax_exempt
                )
            """
                ),
                data,
            )
            inserted += 1
        except Exception as e:
            skipped += 1
            if skipped == 1:
                print(f"SKIP ERROR: {e}")

    await db.commit()
    return {"inserted": inserted, "skipped": skipped, "total": len(df)}


@router.get("/list")
async def list_renewal(
    search: str | None = None,
    status: str | None = None,
    broker_code: str | None = None,
    expiry_filter: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    q = (search or "").strip()
    has_search = len(q) >= 3
    has_expiry = expiry_filter in ("expiring", "expired")

    if not has_search and not has_expiry:
        return {"rows": [], "total": 0}

    conditions = ["(cr.account_type != 'default' OR cr.account_type IS NULL)"]
    params: dict = {}

    if has_search:
        conditions.append(
            "(cr.company_name LIKE :q OR cr.premise_id LIKE :q"
            " OR cr.cust_id LIKE :q OR cr.cust_email LIKE :q OR cr.broker_code LIKE :q)"
        )
        params["q"] = f"%{q}%"

    if status:
        conditions.append("cr.status = :status")
        params["status"] = status

    if broker_code:
        conditions.append("cr.broker_code = :broker_code")
        params["broker_code"] = broker_code

    if expiry_filter == "expired":
        conditions.append("DATEDIFF(cr.contract_end_date, CURDATE()) < 0")
    elif expiry_filter == "expiring":
        conditions.append("DATEDIFF(cr.contract_end_date, CURDATE()) BETWEEN 0 AND 60")

    where = " AND ".join(conditions)

    result = await db.execute(
        text(f"""
            SELECT cr.serial, cr.cust_id, cr.company_name, cr.premise_id,
                   cr.broker_code, cr.broker_name, cr.contract_end_date,
                   cr.contract_rate, cr.contract_renewal_usage,
                   cr.load_profile, cr.cust_email, cr.cust_phone1, cr.status
            FROM contract_renewal cr
            INNER JOIN (
                SELECT premise_id, MAX(serial) AS max_serial
                FROM contract_renewal
                WHERE (account_type != 'default' OR account_type IS NULL)
                GROUP BY premise_id
            ) latest ON cr.premise_id = latest.premise_id
                    AND cr.serial = latest.max_serial
            WHERE {where}
            ORDER BY cr.company_name ASC
        """),
        params,
    )
    rows = [dict(r) for r in result.mappings().all()]
    return {"rows": rows, "total": len(rows)}


@router.get("/counts")
async def get_renewal_counts(db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("""
        SELECT
            COUNT(CASE WHEN DATEDIFF(contract_end_date, CURDATE()) BETWEEN 0 AND 60 THEN 1 END) AS expiring_soon,
            COUNT(CASE WHEN DATEDIFF(contract_end_date, CURDATE()) < 0 THEN 1 END) AS expired,
            COUNT(*) AS total
        FROM (
            SELECT cr.contract_end_date
            FROM contract_renewal cr
            INNER JOIN (
                SELECT premise_id, MAX(serial) AS max_serial
                FROM contract_renewal
                WHERE (account_type != 'default' OR account_type IS NULL)
                GROUP BY premise_id
            ) latest ON cr.premise_id = latest.premise_id
                    AND cr.serial = latest.max_serial
            WHERE (cr.account_type != 'default' OR cr.account_type IS NULL)
        ) deduped
    """))
    row = dict(result.mappings().fetchone() or {})
    return {
        "expiring_soon": row.get("expiring_soon") or 0,
        "expired": row.get("expired") or 0,
        "total": row.get("total") or 0,
    }


@router.get("/contracts/{premise_id}")
async def get_contracts_by_premise(premise_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("""
            SELECT serial, cust_id, status, account_type, contract_type, contract_rate,
                   contract_end_date, contract_start_date,
                   contract_renewal_usage AS term,
                   broker_code, broker_name, batch_no, plan_group, plan_id,
                   other_charge, created_at
            FROM contract_renewal
            WHERE premise_id = :premise_id
            ORDER BY created_at DESC
        """),
        {"premise_id": premise_id},
    )
    rows = []
    for r in result.mappings().all():
        row = dict(r)
        if row.get("created_at") and not isinstance(row["created_at"], str):
            row["created_at"] = row["created_at"].isoformat()
        rows.append(row)
    return {"contracts": rows, "total": len(rows)}


@router.get("/{id}")
async def get_renewal(id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("SELECT * FROM contract_renewal WHERE serial = :id"),
        {"id": id},
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail=f"Record {id} not found")
    return _alias_row(dict(row))


@router.put("/{id}")
async def update_renewal_contact(
    id: int,
    body: AdminUpdate,
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(require_auth),
):
    is_admin = str(payload.get("role")) == "1"
    changed_by = payload.get("username") or payload.get("email") or "unknown"

    # 1 — Confirm record exists and snapshot old values
    old_result = await db.execute(
        text("SELECT * FROM contract_renewal WHERE serial = :id"), {"id": id}
    )
    old_row = old_result.mappings().first()
    if not old_row:
        raise HTTPException(status_code=404, detail=f"Record {id} not found")
    old = dict(old_row)

    # 2 — Determine which request fields are actually set (non-None)
    raw = body.__dict__
    submitted = {k: v for k, v in raw.items() if v is not None}

    # 3 — Role guard: non-admins may not submit admin-only fields
    if not is_admin:
        attempted_admin = set(submitted) & _ADMIN_ONLY_FIELDS
        if attempted_admin:
            raise HTTPException(
                status_code=403,
                detail=f"Admin role required to update: {', '.join(sorted(attempted_admin))}",
            )
        # Restrict to contact fields only
        allowed = set(_FIELD_TO_COL) - _ADMIN_ONLY_FIELDS
        submitted = {k: v for k, v in submitted.items() if k in allowed}

    if not submitted:
        # Nothing to update — return current record
        return _alias_row(old)

    # 4 — Build UPDATE dynamically from submitted fields
    set_clauses = ", ".join(
        f"{_FIELD_TO_COL[f]} = :{f}" for f in submitted if f in _FIELD_TO_COL
    )
    params = {**submitted, "id": id}
    await db.execute(
        text(f"UPDATE contract_renewal SET {set_clauses} WHERE serial = :id"),
        params,
    )
    await db.commit()

    # 5 — Audit log: one row per field that actually changed
    log_rows = []
    for field, new_val in submitted.items():
        col = _FIELD_TO_COL.get(field)
        if not col:
            continue
        old_val = old.get(col)
        if str(old_val or "") != str(new_val or ""):
            log_rows.append({
                "contract_serial": id,
                "field_name": field,
                "old_value": str(old_val) if old_val is not None else None,
                "new_value": str(new_val) if new_val is not None else None,
                "changed_by": changed_by,
            })

    if log_rows:
        await db.execute(
            text("""
                INSERT INTO customer_edit_log
                    (contract_serial, field_name, old_value, new_value, changed_by)
                VALUES
                    (:contract_serial, :field_name, :old_value, :new_value, :changed_by)
            """),
            log_rows,
        )
        await db.commit()

    # 6 — Return updated record
    result = await db.execute(
        text("SELECT * FROM contract_renewal WHERE serial = :id"), {"id": id}
    )
    return _alias_row(dict(result.mappings().first()))


# ── Addon charge attachment endpoints ─────────────────────────────────────────

@router.get("/addon-types")
async def list_active_addon_types(
    _: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Return all active addon charge types with their current rate — used to
    populate the attach dropdown on the contract edit page."""
    r = await db.execute(text("""
        SELECT t.id, t.code, t.description, t.calculation_basis, t.is_taxable,
               r.rate, r.effective_from
        FROM addon_charge_types t
        LEFT JOIN addon_charge_type_rates r
               ON r.addon_type_id = t.id AND r.effective_to IS NULL
        WHERE t.is_active = 1
        ORDER BY t.code
    """))
    return [
        {
            "id":                  row[0],
            "code":                row[1],
            "description":         row[2],
            "calculation_basis":   row[3],
            "is_taxable":          bool(row[4]),
            "current_rate":        float(row[5]) if row[5] is not None else None,
            "rate_effective_from": str(row[6]) if row[6] is not None else None,
        }
        for row in r.fetchall()
    ]


@router.get("/{serial}/addon-charges")
async def list_contract_addon_charges(
    serial: int,
    _: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """List addon types attached to a contract, including any that have since
    been deactivated (shown flagged, not auto-removed)."""
    exists = await db.execute(
        text("SELECT serial FROM contract_renewal WHERE serial = :s"), {"s": serial}
    )
    if not exists.fetchone():
        raise HTTPException(status_code=404, detail=f"Contract {serial} not found")

    r = await db.execute(text("""
        SELECT t.id, t.code, t.description, t.calculation_basis,
               t.is_taxable, t.is_active,
               rate.rate, rate.effective_from
        FROM contract_addon_charges ca
        JOIN addon_charge_types t ON ca.addon_type_id = t.id
        LEFT JOIN addon_charge_type_rates rate
               ON rate.addon_type_id = t.id AND rate.effective_to IS NULL
        WHERE ca.contract_serial = :serial
        ORDER BY t.code
    """), {"serial": serial})
    return [
        {
            "addon_type_id":       row[0],
            "code":                row[1],
            "description":         row[2],
            "calculation_basis":   row[3],
            "is_taxable":          bool(row[4]),
            "is_active":           bool(row[5]),
            "current_rate":        float(row[6]) if row[6] is not None else None,
            "rate_effective_from": str(row[7]) if row[7] is not None else None,
        }
        for row in r.fetchall()
    ]


@router.post("/{serial}/addon-charges", status_code=201)
async def attach_addon_charge(
    serial: int,
    body: dict,
    payload: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    exists = await db.execute(
        text("SELECT serial FROM contract_renewal WHERE serial = :s"), {"s": serial}
    )
    if not exists.fetchone():
        raise HTTPException(status_code=404, detail=f"Contract {serial} not found")

    addon_type_id = body.get("addon_type_id")
    if addon_type_id is None:
        raise HTTPException(status_code=400, detail="addon_type_id is required")
    try:
        addon_type_id = int(addon_type_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="addon_type_id must be an integer")

    type_r = await db.execute(
        text("SELECT id, code, is_active FROM addon_charge_types WHERE id = :id"),
        {"id": addon_type_id},
    )
    type_row = type_r.fetchone()
    if not type_row:
        raise HTTPException(status_code=404, detail=f"Addon type {addon_type_id} not found")
    if not type_row[2]:
        raise HTTPException(
            status_code=400,
            detail=f"Addon type '{type_row[1]}' is inactive and cannot be attached",
        )

    try:
        await db.execute(text("""
            INSERT INTO contract_addon_charges (contract_serial, addon_type_id)
            VALUES (:serial, :addon_type_id)
        """), {"serial": serial, "addon_type_id": addon_type_id})
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        if "1062" in str(e.orig) or "Duplicate entry" in str(e.orig):
            raise HTTPException(
                status_code=409,
                detail=f"'{type_row[1]}' is already attached to this contract",
            )
        raise

    return await list_contract_addon_charges(serial=serial, _=payload, db=db)


@router.delete("/{serial}/addon-charges/{addon_type_id}", status_code=200)
async def detach_addon_charge(
    serial: int,
    addon_type_id: int,
    payload: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    exists = await db.execute(
        text("SELECT serial FROM contract_renewal WHERE serial = :s"), {"s": serial}
    )
    if not exists.fetchone():
        raise HTTPException(status_code=404, detail=f"Contract {serial} not found")

    r = await db.execute(text("""
        DELETE FROM contract_addon_charges
        WHERE contract_serial = :serial AND addon_type_id = :addon_type_id
    """), {"serial": serial, "addon_type_id": addon_type_id})
    await db.commit()

    if r.rowcount == 0:
        raise HTTPException(status_code=404, detail="This addon type is not attached to this contract")

    return await list_contract_addon_charges(serial=serial, _=payload, db=db)
