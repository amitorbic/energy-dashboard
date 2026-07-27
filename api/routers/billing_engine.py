from typing import Optional
from fastapi import APIRouter, Body, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from utils.database import get_db
from controllers.billing_engine import ingest_867, ingest_810

router = APIRouter(prefix="/billing-engine", tags=["billing-engine"])


VALID_CATEGORIES = {
    "transmission", "distribution", "customer_charge", "metering",
    "surcharge", "tax", "misc", "excluded",
}


@router.get("/charge-mappings")
async def list_charge_mappings(
    tdsp_duns: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    where = "WHERE tdsp_duns = :duns" if tdsp_duns else ""
    rows = await db.execute(text(f"""
        SELECT id, tdsp_duns, charge_code, charge_description,
               billing_category, is_taxable, is_per_unit, is_passthrough,
               notes, created_at
        FROM tdsp_charge_mappings
        {where}
        ORDER BY tdsp_duns IS NULL, tdsp_duns, charge_code
    """), {"duns": tdsp_duns} if tdsp_duns else {})
    cols = ["id", "tdsp_duns", "charge_code", "charge_description",
            "billing_category", "is_taxable", "is_per_unit", "is_passthrough",
            "notes", "created_at"]
    result = []
    for r in rows.fetchall():
        d = dict(zip(cols, r))
        if d["created_at"] is not None:
            d["created_at"] = str(d["created_at"])
        result.append(d)
    return result


@router.post("/charge-mappings", status_code=201)
async def create_charge_mapping(
    body: dict = Body(...),
    db: AsyncSession = Depends(get_db),
):
    cat = body.get("billing_category", "")
    if cat not in VALID_CATEGORIES:
        raise HTTPException(status_code=422, detail=f"billing_category must be one of {sorted(VALID_CATEGORIES)}")
    code = (body.get("charge_code") or "").strip()
    if not code:
        raise HTTPException(status_code=422, detail="charge_code is required")

    duns = body.get("tdsp_duns") or None

    # enforce uniqueness for (tdsp_duns, charge_code)
    dup = await db.execute(text("""
        SELECT id FROM tdsp_charge_mappings
        WHERE charge_code = :code
          AND (tdsp_duns = :duns OR (tdsp_duns IS NULL AND :duns IS NULL))
        LIMIT 1
    """), {"code": code, "duns": duns})
    if dup.fetchone():
        raise HTTPException(status_code=409, detail=f"Mapping for code '{code}' already exists for this TDSP")

    r = await db.execute(text("""
        INSERT INTO tdsp_charge_mappings
          (tdsp_duns, charge_code, charge_description, billing_category,
           is_taxable, is_per_unit, is_passthrough, notes)
        VALUES
          (:duns, :code, :desc, :cat, :taxable, :per_unit, :passthrough, :notes)
    """), {
        "duns":        duns,
        "code":        code,
        "desc":        body.get("charge_description") or None,
        "cat":         cat,
        "taxable":     1 if body.get("is_taxable") else 0,
        "per_unit":    1 if body.get("is_per_unit", True) else 0,
        "passthrough": 1 if body.get("is_passthrough", True) else 0,
        "notes":       body.get("notes") or None,
    })
    await db.commit()
    return {"id": r.lastrowid, "charge_code": code}


@router.put("/charge-mappings/{mapping_id}")
async def update_charge_mapping(
    mapping_id: int,
    body: dict = Body(...),
    db: AsyncSession = Depends(get_db),
):
    cat = body.get("billing_category", "")
    if cat not in VALID_CATEGORIES:
        raise HTTPException(status_code=422, detail=f"billing_category must be one of {sorted(VALID_CATEGORIES)}")

    exists = await db.execute(
        text("SELECT id FROM tdsp_charge_mappings WHERE id = :id"),
        {"id": mapping_id},
    )
    if not exists.fetchone():
        raise HTTPException(status_code=404, detail=f"Mapping {mapping_id} not found")

    pu_raw = body.get("is_per_unit", True)
    per_unit = None if pu_raw is None else (1 if pu_raw else 0)

    await db.execute(text("""
        UPDATE tdsp_charge_mappings
           SET charge_description = :desc,
               billing_category   = :cat,
               is_taxable         = :taxable,
               is_per_unit        = :per_unit,
               is_passthrough     = :passthrough,
               notes              = :notes
         WHERE id = :id
    """), {
        "desc":        body.get("charge_description") or None,
        "cat":         cat,
        "taxable":     1 if body.get("is_taxable") else 0,
        "per_unit":    per_unit,
        "passthrough": 1 if body.get("is_passthrough", True) else 0,
        "notes":       body.get("notes") or None,
        "id":          mapping_id,
    })
    await db.commit()
    return {"id": mapping_id, "status": "updated"}


@router.delete("/charge-mappings/{mapping_id}", status_code=204)
async def delete_charge_mapping(
    mapping_id: int,
    db: AsyncSession = Depends(get_db),
):
    exists = await db.execute(
        text("SELECT id FROM tdsp_charge_mappings WHERE id = :id"),
        {"id": mapping_id},
    )
    if not exists.fetchone():
        raise HTTPException(status_code=404, detail=f"Mapping {mapping_id} not found")

    in_use = await db.execute(
        text("SELECT COUNT(*) FROM edi_810_line_items WHERE mapping_id = :id"),
        {"id": mapping_id},
    )
    count = in_use.scalar() or 0
    if count:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete: {count} line item{'s' if count != 1 else ''} reference this mapping.",
        )

    await db.execute(
        text("DELETE FROM tdsp_charge_mappings WHERE id = :id"),
        {"id": mapping_id},
    )
    await db.commit()


@router.get("/files")
async def list_edi_files(
    limit: int = Query(50, ge=1, le=200),
    edi_type: Optional[str] = Query(None, description="Filter: 867_03 or 810_02"),
    db: AsyncSession = Depends(get_db),
):
    """Recent EDI file uploads. Used by the upload history panel."""
    where = "WHERE ef.edi_type = :edi_type" if edi_type else ""
    rows = await db.execute(text(f"""
        SELECT ef.id, ef.interchange_control, ef.edi_type,
               ef.tdsp_name, ef.tdsp_duns, ef.file_date,
               ef.original_filename, ef.uploaded_by, ef.status,
               ef.records_found, ef.records_matched, ef.created_at
        FROM edi_files ef
        {where}
        ORDER BY ef.id DESC
        LIMIT :limit
    """), {"edi_type": edi_type, "limit": limit})
    cols = ["id", "interchange_control", "edi_type", "tdsp_name", "tdsp_duns",
            "file_date", "original_filename", "uploaded_by", "status",
            "records_found", "records_matched", "created_at"]
    return [dict(zip(cols, r)) for r in rows.fetchall()]


@router.get("/periods")
async def list_billing_periods(
    status: Optional[str] = Query(None, description="draft/reviewed/approved/invoiced"),
    esi_id: Optional[str] = Query(None, description="Partial ESI ID match"),
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """List billing periods with optional status and ESI ID filters."""
    conditions = ["1=1"]
    params: dict = {"limit": limit, "offset": offset}

    if status:
        conditions.append("bp.status = :status")
        params["status"] = status
    if esi_id:
        conditions.append("bp.esi_id LIKE :esi_id")
        params["esi_id"] = f"%{esi_id.strip()}%"

    where = " AND ".join(conditions)

    rows = await db.execute(text(f"""
        SELECT bp.id, bp.esi_id, bp.service_start, bp.service_end,
               bp.billing_days, bp.usage_kwh, bp.contract_rate, bp.meter_fee,
               bp.has_810, bp.flags, bp.status, bp.created_at,
               COALESCE(ch.tdsp_total, 0)                              AS tdsp_total,
               COALESCE(ch.tdsp_total, 0)
                 + COALESCE(bp.energy_charge, 0)
                 + COALESCE(bp.meter_fee, 0)                           AS total_charge
        FROM billing_periods bp
        LEFT JOIN (
            SELECT billing_period_id, SUM(amount) AS tdsp_total
            FROM billing_period_charges
            WHERE charge_source = 'tdsp'
            GROUP BY billing_period_id
        ) ch ON ch.billing_period_id = bp.id
        WHERE {where}
        ORDER BY bp.created_at DESC
        LIMIT :limit OFFSET :offset
    """), params)

    cols = [
        "id", "esi_id", "service_start", "service_end",
        "billing_days", "usage_kwh", "contract_rate", "meter_fee",
        "has_810", "flags", "status", "created_at",
        "tdsp_total", "total_charge",
    ]
    return [dict(zip(cols, r)) for r in rows.fetchall()]


@router.get("/review/unmatched-esi")
async def review_unmatched_esi(
    limit: int = Query(200, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
):
    """867 ESI IDs that had no active contract at ingest time."""
    rows = await db.execute(text("""
        SELECT u.id, u.esi_id, u.service_start, u.service_end,
               u.usage_kwh, u.tdsp_name, u.created_at,
               ef.original_filename, ef.file_date
        FROM edi_867_usage u
        JOIN edi_files ef ON ef.id = u.edi_file_id
        WHERE u.status = 'no_contract'
        ORDER BY u.created_at DESC
        LIMIT :limit
    """), {"limit": limit})
    cols = ["id", "esi_id", "service_start", "service_end",
            "usage_kwh", "tdsp_name", "created_at",
            "original_filename", "file_date"]
    return [dict(zip(cols, r)) for r in rows.fetchall()]


@router.get("/review/unknown-charges")
async def review_unknown_charges(
    limit: int = Query(200, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
):
    """810 line items with no matching tdsp_charge_mappings row."""
    rows = await db.execute(text("""
        SELECT li.id, li.esi_id, li.charge_code, li.charge_description,
               li.charge_amount, li.tdsp_name, li.service_start, li.service_end,
               li.created_at, ef.original_filename
        FROM edi_810_line_items li
        JOIN edi_files ef ON ef.id = li.edi_file_id
        WHERE li.status = 'unmapped'
        ORDER BY li.created_at DESC
        LIMIT :limit
    """), {"limit": limit})
    cols = ["id", "esi_id", "charge_code", "charge_description",
            "charge_amount", "tdsp_name", "service_start", "service_end",
            "created_at", "original_filename"]
    return [dict(zip(cols, r)) for r in rows.fetchall()]


@router.get("/review/ready-to-bill")
async def review_ready_to_bill(
    limit: int = Query(200, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
):
    """Billing periods that are safe to approve: has 810, has rate, no expired-contract flag."""
    rows = await db.execute(text("""
        SELECT bp.id, bp.esi_id, bp.service_start, bp.service_end,
               bp.billing_days, bp.usage_kwh, bp.contract_rate,
               bp.meter_fee, bp.flags, bp.status, bp.created_at
        FROM billing_periods bp
        WHERE bp.status IN ('draft', 'reviewed')
          AND bp.has_810 = 1
          AND bp.contract_rate IS NOT NULL
          AND (bp.flags IS NULL OR NOT JSON_CONTAINS(bp.flags, '"expired_contract"'))
        ORDER BY bp.service_end DESC
        LIMIT :limit
    """), {"limit": limit})
    cols = ["id", "esi_id", "service_start", "service_end",
            "billing_days", "usage_kwh", "contract_rate",
            "meter_fee", "flags", "status", "created_at"]
    return [dict(zip(cols, r)) for r in rows.fetchall()]


@router.post("/upload/867")
async def upload_867(
    file: UploadFile = File(...),
    uploaded_by: str = "admin",
    db: AsyncSession = Depends(get_db),
):
    content = (await file.read()).decode("utf-8", errors="replace")
    result = await ingest_867(content, file.filename or "867_upload.txt", uploaded_by, db)
    if result.get("status") == "duplicate":
        raise HTTPException(status_code=409, detail=result["message"])
    return result


@router.get("/periods/{period_id}")
async def get_billing_period(
    period_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Single billing period with its charge line items."""
    bp_r = await db.execute(text("""
        SELECT bp.id, bp.esi_id, bp.service_start, bp.service_end,
               bp.billing_days, bp.usage_kwh, bp.contract_rate, bp.meter_fee,
               bp.energy_charge, bp.has_810, bp.flags, bp.status, bp.created_at
        FROM billing_periods bp
        WHERE bp.id = :id
    """), {"id": period_id})
    bp = bp_r.fetchone()
    if not bp:
        raise HTTPException(status_code=404, detail=f"Billing period {period_id} not found")

    cols = ["id", "esi_id", "service_start", "service_end",
            "billing_days", "usage_kwh", "contract_rate", "meter_fee",
            "energy_charge", "has_810", "flags", "status", "created_at"]
    result = dict(zip(cols, bp))
    # coerce date objects to strings for JSON serialisation
    for k in ("service_start", "service_end", "created_at"):
        if result[k] is not None:
            result[k] = str(result[k])

    ch_r = await db.execute(text("""
        SELECT id, charge_source, charge_category, charge_code,
               description, amount, quantity, unit_rate, unit,
               is_taxable, sort_order
        FROM billing_period_charges
        WHERE billing_period_id = :id
        ORDER BY sort_order, id
    """), {"id": period_id})
    charge_cols = ["id", "charge_source", "charge_category", "charge_code",
                   "description", "amount", "quantity", "unit_rate", "unit",
                   "is_taxable", "sort_order"]
    result["charges"] = [dict(zip(charge_cols, r)) for r in ch_r.fetchall()]
    return result


@router.patch("/periods/{period_id}/status")
async def update_period_status(
    period_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    """Advance a billing period through draft → reviewed → approved.
    Transition to 'invoiced' is handled by POST /invoices/generate/{id}."""
    new_status = (body.get("status") or "").strip()
    allowed = {"reviewed", "approved"}
    if new_status not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"status must be one of {sorted(allowed)}",
        )

    bp_r = await db.execute(
        text("SELECT status FROM billing_periods WHERE id = :id"),
        {"id": period_id},
    )
    row = bp_r.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"Billing period {period_id} not found")

    current = row[0]
    transitions = {"draft": "reviewed", "reviewed": "approved"}
    if transitions.get(current) != new_status:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot transition from '{current}' to '{new_status}'",
        )

    if new_status == "approved":
        import json
        flags_r = await db.execute(
            text("SELECT flags FROM billing_periods WHERE id = :id"),
            {"id": period_id},
        )
        flags_raw = flags_r.scalar()
        flags = json.loads(flags_raw) if flags_raw else []
        blocking = [f for f in flags if f in ("expired_contract", "contract_coverage_gap")]
        if blocking:
            raise HTTPException(
                status_code=409,
                detail=f"Cannot approve: period has blocking flag(s): {blocking}. "
                       "Resolve the contract issue before approving.",
            )

    await db.execute(
        text("UPDATE billing_periods SET status = :s WHERE id = :id"),
        {"s": new_status, "id": period_id},
    )
    await db.commit()
    return {"id": period_id, "status": new_status}


@router.post("/upload/810")
async def upload_810(
    file: UploadFile = File(...),
    uploaded_by: str = "admin",
    db: AsyncSession = Depends(get_db),
):
    content = (await file.read()).decode("utf-8", errors="replace")
    result = await ingest_810(content, file.filename or "810_upload.txt", uploaded_by, db)
    if result.get("status") == "duplicate":
        raise HTTPException(status_code=409, detail=result["message"])
    return result
