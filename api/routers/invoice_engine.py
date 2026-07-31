from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from utils.database import get_db
from controllers.invoice_engine import generate_invoice, get_invoice, get_invoice_by_period

router = APIRouter(prefix="/billing-engine", tags=["billing-engine"])


@router.get("/invoices")
async def list_invoices(
    status: Optional[str] = Query(None, description="draft/sent/paid"),
    esi_id: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """List invoices with optional filters."""
    conditions = ["1=1"]
    params: dict = {"limit": limit, "offset": offset}
    if status:
        conditions.append("i.status = :status")
        params["status"] = status
    if esi_id:
        conditions.append("i.esi_id LIKE :esi_id")
        params["esi_id"] = f"%{esi_id.strip()}%"

    where = " AND ".join(conditions)
    rows = await db.execute(text(f"""
        SELECT i.id, i.invoice_number, i.billing_period_id, i.esi_id,
               i.invoice_date, i.due_date, i.total_amount,
               i.supplier_charge, i.tdsp_total, i.tax_total,
               i.status, i.sent_at, i.paid_at, i.created_at
        FROM invoices i
        WHERE {where}
        ORDER BY i.id DESC
        LIMIT :limit OFFSET :offset
    """), params)
    cols = [
        "id", "invoice_number", "billing_period_id", "esi_id",
        "invoice_date", "due_date", "total_amount",
        "supplier_charge", "tdsp_total", "tax_total",
        "status", "sent_at", "paid_at", "created_at",
    ]
    result = []
    for r in rows.fetchall():
        d = dict(zip(cols, r))
        for k in ("invoice_date", "due_date", "sent_at", "paid_at", "created_at"):
            if d[k] is not None:
                d[k] = str(d[k])
        result.append(d)
    return result


@router.get("/invoices/by-esi/{esi_id}")
async def api_list_invoices_by_esi(
    esi_id: str,
    db: AsyncSession = Depends(get_db),
):
    """All invoices for a specific ESI ID, any status.

    Staff-facing (customer profile Bills tab, admin full-edit view) --
    shows the complete invoice history, not just posted+. If a separate
    customer self-service portal is added later, that surface should get
    its own status-filtered endpoint rather than reusing this one.
    """
    rows = await db.execute(text("""
        SELECT i.id, i.invoice_number, i.billing_period_id, i.esi_id,
               i.invoice_date, i.due_date, i.total_amount,
               i.status, i.sent_at, i.paid_at, i.created_at,
               bp.service_start, bp.service_end
        FROM invoices i
        LEFT JOIN billing_periods bp ON bp.id = i.billing_period_id
        WHERE i.esi_id = :esi_id
        ORDER BY i.invoice_date DESC, i.id DESC
    """), {"esi_id": esi_id})
    cols = [
        "id", "invoice_number", "billing_period_id", "esi_id",
        "invoice_date", "due_date", "total_amount",
        "status", "sent_at", "paid_at", "created_at",
        "service_start", "service_end",
    ]
    result = []
    for row in rows.fetchall():
        d = dict(zip(cols, row))
        for k in ("invoice_date", "due_date", "sent_at", "paid_at",
                   "created_at", "service_start", "service_end"):
            if d[k] is not None:
                d[k] = str(d[k])
        result.append(d)
    return result


@router.post("/invoices/{invoice_id}/post")
async def api_post_invoice(
    invoice_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Transition an invoice from 'draft' to 'posted'.

    'posted' is the gate before 'sent' -- an invoice must be posted before
    it can be marked sent (enforced wherever that transition is built)."""
    r = await db.execute(
        text("SELECT status FROM invoices WHERE id = :id"),
        {"id": invoice_id},
    )
    row = r.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"Invoice {invoice_id} not found")

    current = row[0]
    if current != "draft":
        raise HTTPException(
            status_code=409,
            detail=f"Cannot post invoice: status is '{current}', must be 'draft'",
        )

    await db.execute(
        text("UPDATE invoices SET status = 'posted' WHERE id = :id"),
        {"id": invoice_id},
    )
    await db.commit()
    return {"id": invoice_id, "status": "posted"}


@router.get("/invoices/by-period/{billing_period_id}")
async def api_get_invoice_by_period(
    billing_period_id: int,
    db: AsyncSession = Depends(get_db),
):
    inv = await get_invoice_by_period(billing_period_id, db)
    if not inv:
        raise HTTPException(
            status_code=404,
            detail=f"No invoice for billing_period {billing_period_id}",
        )
    return inv


@router.post("/invoices/generate/{billing_period_id}")
async def api_generate_invoice(
    billing_period_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await generate_invoice(billing_period_id, db)
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result["reason"])
    return result


@router.get("/invoices/{invoice_id}")
async def api_get_invoice(
    invoice_id: int,
    db: AsyncSession = Depends(get_db),
):
    inv = await get_invoice(invoice_id, db)
    if not inv:
        raise HTTPException(status_code=404, detail=f"Invoice {invoice_id} not found")
    return inv
