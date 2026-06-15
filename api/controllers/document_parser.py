import json
from datetime import datetime
from typing import Optional, List

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from schemas.document_parser import SaveDocumentRequest


# ── Template operations ───────────────────────────────────────────────────────

async def get_all_templates(db: AsyncSession) -> List[dict]:
    """Return all bill templates ordered by usage (most-used first).
    Used by the Next.js parse route to augment prompts with known provider patterns."""
    result = await db.execute(
        text("SELECT * FROM bill_templates ORDER BY times_used DESC")
    )
    return [dict(r._mapping) for r in result.mappings()]


async def get_template_by_provider(provider_name: str, db: AsyncSession) -> Optional[dict]:
    result = await db.execute(
        text("SELECT * FROM bill_templates WHERE provider_name = :p LIMIT 1"),
        {"p": provider_name},
    )
    row = result.mappings().first()
    return dict(row) if row else None


async def upsert_template(
    provider_name: str,
    sample_fields: dict,
    user_corrections: Optional[dict],
    db: AsyncSession,
) -> int:
    """
    Create or update a bill_templates record after a confirmed extraction.

    confidence_score uses a rolling weighted average:
      - new_score = (old_score * old_uses + accuracy * 100) / (old_uses + 1)
    accuracy = 1.0 - (corrected_fields / total_fields)
    A template with many corrections will trend toward lower confidence.
    """
    if user_corrections:
        corrected = sum(1 for v in user_corrections.values() if v)
        total = max(len(user_corrections), 1)
        accuracy = 1.0 - (corrected / total)
    else:
        accuracy = 1.0

    existing = await get_template_by_provider(provider_name, db)

    if existing:
        old_score = float(existing.get("confidence_score") or 0.0)
        old_uses = int(existing.get("times_used") or 0)
        new_score = round((old_score * old_uses + accuracy * 100) / (old_uses + 1), 2)

        await db.execute(
            text(
                """
                UPDATE bill_templates
                   SET sample_fields    = :sf,
                       confidence_score = :cs,
                       times_used       = times_used + 1,
                       last_updated     = NOW()
                 WHERE id = :id
                """
            ),
            {
                "sf": json.dumps(sample_fields),
                "cs": new_score,
                "id": existing["id"],
            },
        )
        await db.commit()
        return int(existing["id"])
    else:
        result = await db.execute(
            text(
                """
                INSERT INTO bill_templates
                    (provider_name, sample_fields, confidence_score, times_used)
                VALUES
                    (:pn, :sf, :cs, 1)
                """
            ),
            {
                "pn": provider_name,
                "sf": json.dumps(sample_fields),
                "cs": round(accuracy * 100, 2),
            },
        )
        await db.commit()
        return result.lastrowid


# ── Save utility bill ─────────────────────────────────────────────────────────

async def save_bill(payload: SaveDocumentRequest, db: AsyncSession) -> dict:
    f = payload.fields

    provider_name = _str(f.get("provider_name"))
    esi_id = _str(f.get("esid"))
    service_address = _str(f.get("service_address"))

    # Parse bill / due date
    bill_date = _parse_date(str(f.get("due_date") or f.get("bill_date") or ""))

    # Always upsert the template when provider is known
    template_id = payload.template_id
    if provider_name:
        sample = {
            k: v for k, v in f.items()
            if v not in (None, "", []) and k not in ("extra_charges",)
        }
        template_id = await upsert_template(
            provider_name,
            sample,
            payload.user_corrections,
            db,
        )

    result = await db.execute(
        text(
            """
            INSERT INTO parsed_bills
                (esi_id, provider_name, service_address,
                 usage_kwh, kw_demand, energy_rate, total_average_rate,
                 tdsp_charges, taxes, extra_charges,
                 bill_date, service_zip, tdsp_name, pricing_zone,
                 raw_extracted, template_id)
            VALUES
                (:esi_id, :provider_name, :service_address,
                 :usage_kwh, :kw_demand, :energy_rate, :total_average_rate,
                 :tdsp_charges, :taxes, :extra_charges,
                 :bill_date, :service_zip, :tdsp_name, :pricing_zone,
                 :raw_extracted, :template_id)
            """
        ),
        {
            "esi_id": esi_id,
            "provider_name": provider_name,
            "service_address": service_address,
            "usage_kwh": _float(f.get("usage_kwh")),
            "kw_demand": _float(f.get("kw_demand")),
            "energy_rate": _float(f.get("energy_rate")),
            "total_average_rate": _float(f.get("total_average_rate")),
            "tdsp_charges": _float(f.get("tdsp_charges")),
            "taxes": _float(f.get("taxes")),
            "extra_charges": json.dumps(f["extra_charges"]) if f.get("extra_charges") else None,
            "bill_date": bill_date,
            "service_zip": _str(f.get("service_zip")),
            "tdsp_name": _str(f.get("tdsp_name")),
            "pricing_zone": _str(f.get("pricing_zone")),
            "raw_extracted": json.dumps(payload.raw_extracted) if payload.raw_extracted else None,
            "template_id": template_id,
        },
    )
    await db.commit()
    return {"id": result.lastrowid, "template_id": template_id}


# ── Save competitor contract ──────────────────────────────────────────────────

async def save_contract(payload: SaveDocumentRequest, db: AsyncSession) -> dict:
    f = payload.fields

    pricing_type_raw = str(f.get("pricing_type") or "").strip().lower()
    pricing_type = pricing_type_raw if pricing_type_raw in ("fixed", "index") else None

    auto_renewal_raw = f.get("auto_renewal")
    if isinstance(auto_renewal_raw, bool):
        auto_renewal = auto_renewal_raw
    elif isinstance(auto_renewal_raw, str):
        auto_renewal = auto_renewal_raw.lower() in ("yes", "true", "1")
    else:
        auto_renewal = None

    result = await db.execute(
        text(
            """
            INSERT INTO parsed_contracts
                (competitor_name, rate, contract_term_months, early_termination_fee,
                 auto_renewal, capacity_charges, swing_limits, pricing_type,
                 hidden_charges, what_is_missing, raw_extracted)
            VALUES
                (:competitor_name, :rate, :contract_term_months, :early_termination_fee,
                 :auto_renewal, :capacity_charges, :swing_limits, :pricing_type,
                 :hidden_charges, :what_is_missing, :raw_extracted)
            """
        ),
        {
            "competitor_name": _str(f.get("competitor_name")),
            "rate": _float(f.get("rate")),
            "contract_term_months": _int(f.get("contract_term_months")),
            "early_termination_fee": _str(f.get("early_termination_fee")),
            "auto_renewal": auto_renewal,
            "capacity_charges": _str(f.get("capacity_charges")),
            "swing_limits": _str(f.get("swing_limits")),
            "pricing_type": pricing_type,
            "hidden_charges": _json(f.get("hidden_charges")),
            "what_is_missing": _json(f.get("what_is_missing")),
            "raw_extracted": json.dumps(payload.raw_extracted) if payload.raw_extracted else None,
        },
    )
    await db.commit()
    return {"id": result.lastrowid}


# ── List / get ────────────────────────────────────────────────────────────────

async def list_bills(limit: int, offset: int, db: AsyncSession) -> List[dict]:
    result = await db.execute(
        text(
            """
            SELECT pb.*,
                   bt.confidence_score AS template_confidence,
                   bt.times_used       AS template_uses
              FROM parsed_bills pb
              LEFT JOIN bill_templates bt ON pb.template_id = bt.id
             ORDER BY pb.created_at DESC
             LIMIT :limit OFFSET :offset
            """
        ),
        {"limit": limit, "offset": offset},
    )
    return [dict(r._mapping) for r in result.mappings()]


async def list_contracts(limit: int, offset: int, db: AsyncSession) -> List[dict]:
    result = await db.execute(
        text(
            "SELECT * FROM parsed_contracts ORDER BY created_at DESC LIMIT :limit OFFSET :offset"
        ),
        {"limit": limit, "offset": offset},
    )
    return [dict(r._mapping) for r in result.mappings()]


async def get_bill(record_id: int, db: AsyncSession) -> Optional[dict]:
    result = await db.execute(
        text("SELECT * FROM parsed_bills WHERE id = :id"), {"id": record_id}
    )
    row = result.mappings().first()
    return dict(row) if row else None


async def get_contract(record_id: int, db: AsyncSession) -> Optional[dict]:
    result = await db.execute(
        text("SELECT * FROM parsed_contracts WHERE id = :id"), {"id": record_id}
    )
    row = result.mappings().first()
    return dict(row) if row else None


# ── Type coercions ────────────────────────────────────────────────────────────

def _str(v) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def _float(v) -> Optional[float]:
    if v is None or v == "":
        return None
    try:
        return float(str(v).replace("$", "").replace(",", "").strip())
    except (ValueError, TypeError):
        return None


def _int(v) -> Optional[int]:
    if v is None or v == "":
        return None
    try:
        return int(str(v).strip())
    except (ValueError, TypeError):
        return None


def _parse_date(s: str):
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m-%d-%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _json(v) -> Optional[str]:
    if v is None:
        return None
    if isinstance(v, str):
        return v or None
    try:
        return json.dumps(v)
    except (TypeError, ValueError):
        return None
