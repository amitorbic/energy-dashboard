import pandas as pd
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
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
_ADMIN_ONLY_FIELDS = {
    "energy_rate", "contract_end_date", "contract_start_date", "load_profile",
    "contract_type", "plan_group", "annual_usage_kwh", "other_charge",
    "broker_id", "broker_name", "comm_rate",
    "city_tax_exempt", "county_tax_exempt", "state_tax_exempt",
    "grt_tax_exempt", "puc_tax_exempt", "mtacda_tax_exempt",
    "spdt_tax_exempt", "spdt2_tax_exempt",
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
async def list_renewal(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text(
            """
        SELECT serial, cust_id, company_name, premise_id, broker_code, broker_name,
               contract_end_date, contract_rate, contract_renewal_usage,
               load_profile, cust_email, cust_phone1
        FROM contract_renewal
        ORDER BY company_name ASC
    """
        )
    )
    rows = [dict(r) for r in result.mappings().all()]
    return {"rows": rows, "total": len(rows)}


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
