from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.auth import require_admin, require_auth
from utils.database import get_db
from controllers.billing_engine import recompute_billing_period

router = APIRouter(prefix="/admin", tags=["admin"])

# Values that satisfy "non-blank" but clearly aren't a real reason -- rejected
# so the required-reason gate on Unpost can't be rubber-stamped through.
_PLACEHOLDER_REASONS = {
    "n/a", "na", "none", "test", "testing", "asdf", "xxx", "xx", "x", "-",
    ".", "idk", "unpost", "reason", "why", "because", "n a", "placeholder",
    "todo", "tbd", "unknown", "na.", "n/a.", "asd", "qwerty", "123", "abc",
}


async def _audit(db: AsyncSession, admin: dict, action: str, flag: str) -> None:
    """Write one row to user_log -- same pattern as admin_addon_types._audit."""
    await db.execute(text(
        "INSERT INTO user_log (uid, user_name, broker_name, action, date, flag) "
        "VALUES (:uid, :uname, NULL, :action, :date, :flag)"
    ), {
        "uid":    admin.get("user_id") or admin.get("sub") or 0,
        "uname":  admin.get("username") or admin.get("email") or "admin",
        "action": action,
        "date":   str(int(datetime.utcnow().timestamp())),
        "flag":   flag,
    })


# ── Part A: delete pre-billing EDI records ────────────────────────────────────

@router.delete("/edi-files/{edi_file_id}", status_code=200)
async def delete_edi_file(
    edi_file_id: int,
    admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    exists = await db.execute(
        text("SELECT original_filename FROM edi_files WHERE id = :id"),
        {"id": edi_file_id},
    )
    row = exists.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"EDI file {edi_file_id} not found")
    filename = row[0]

    billed_867 = await db.execute(text(
        "SELECT COUNT(*) FROM edi_867_usage "
        "WHERE edi_file_id = :id AND billing_period_id IS NOT NULL"
    ), {"id": edi_file_id})
    billed_810 = await db.execute(text(
        "SELECT COUNT(*) FROM edi_810_line_items "
        "WHERE edi_file_id = :id AND billing_period_id IS NOT NULL"
    ), {"id": edi_file_id})
    n_867 = billed_867.scalar() or 0
    n_810 = billed_810.scalar() or 0
    if n_867 or n_810:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Cannot delete: {n_867 + n_810} record(s) from this file are already "
                f"linked to a billing period. Revert the billing period(s) first."
            ),
        )

    await db.execute(text("DELETE FROM edi_810_line_items WHERE edi_file_id = :id"), {"id": edi_file_id})
    await db.execute(text("DELETE FROM edi_867_usage WHERE edi_file_id = :id"), {"id": edi_file_id})
    await db.execute(text("DELETE FROM edi_files WHERE id = :id"), {"id": edi_file_id})

    await _audit(db, admin, f"edi_file_delete: id={edi_file_id} file={filename}", "edi_delete")
    await db.commit()
    return {"id": edi_file_id, "status": "deleted"}


@router.delete("/edi-867-usage/{usage_id}", status_code=200)
async def delete_edi_867_usage(
    usage_id: int,
    admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    r = await db.execute(text(
        "SELECT esi_id, billing_period_id FROM edi_867_usage WHERE id = :id"
    ), {"id": usage_id})
    row = r.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"edi_867_usage {usage_id} not found")
    esi_id, billing_period_id = row
    if billing_period_id is not None:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Cannot delete: this record is linked to billing_period "
                f"{billing_period_id}. Revert the billing period first."
            ),
        )

    await db.execute(text("DELETE FROM edi_867_usage WHERE id = :id"), {"id": usage_id})
    await _audit(db, admin, f"edi_867_usage_delete: id={usage_id} esi={esi_id}", "edi_delete")
    await db.commit()
    return {"id": usage_id, "status": "deleted"}


@router.delete("/edi-810-line-items/{line_item_id}", status_code=200)
async def delete_edi_810_line_item(
    line_item_id: int,
    admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    r = await db.execute(text(
        "SELECT esi_id, billing_period_id FROM edi_810_line_items WHERE id = :id"
    ), {"id": line_item_id})
    row = r.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"edi_810_line_items {line_item_id} not found")
    esi_id, billing_period_id = row
    if billing_period_id is not None:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Cannot delete: this record is linked to billing_period "
                f"{billing_period_id}. Revert the billing period first."
            ),
        )

    await db.execute(text("DELETE FROM edi_810_line_items WHERE id = :id"), {"id": line_item_id})
    await _audit(db, admin, f"edi_810_line_item_delete: id={line_item_id} esi={esi_id}", "edi_delete")
    await db.commit()
    return {"id": line_item_id, "status": "deleted"}


# ── Part B: revert a billing period back to draft ─────────────────────────────

async def _revert_one(db: AsyncSession, admin: dict, billing_period_id: int) -> dict:
    """Core revert logic, shared by the single-item and bulk-revert endpoints.

    Both HTTPExceptions below (404, 409) are raised before any write
    statement runs, so the bulk-revert loop can catch them per-item and
    keep going without needing to roll back a partial write.
    """
    bp = await db.execute(
        text("SELECT id, esi_id, status FROM billing_periods WHERE id = :id"),
        {"id": billing_period_id},
    )
    bp_row = bp.fetchone()
    if not bp_row:
        raise HTTPException(status_code=404, detail=f"Billing period {billing_period_id} not found")
    _, esi_id, bp_status = bp_row

    inv = await db.execute(text(
        "SELECT id, invoice_number, status FROM invoices WHERE billing_period_id = :id"
    ), {"id": billing_period_id})
    inv_row = inv.fetchone()

    if inv_row and inv_row[2] in ("sent", "paid"):
        raise HTTPException(
            status_code=409,
            detail=(
                f"Cannot revert: invoice {inv_row[1]} has already been "
                f"{inv_row[2]}. Reverting is blocked once an invoice has gone out."
            ),
        )

    invoice_number_deleted = None
    if inv_row:
        invoice_number_deleted = inv_row[1]
        await db.execute(text("DELETE FROM invoices WHERE id = :id"), {"id": inv_row[0]})

    charges_count = await db.execute(text(
        "SELECT COUNT(*) FROM billing_period_charges WHERE billing_period_id = :id"
    ), {"id": billing_period_id})
    charges_wiped = charges_count.scalar() or 0
    await db.execute(text(
        "DELETE FROM billing_period_charges WHERE billing_period_id = :id"
    ), {"id": billing_period_id})

    await db.execute(text(
        "UPDATE billing_periods SET status = 'draft' WHERE id = :id"
    ), {"id": billing_period_id})

    recomputed = await recompute_billing_period(db, billing_period_id)

    action = (
        f"billing_revert: billing_period_id={billing_period_id} esi={esi_id} "
        f"prior_status={bp_status} invoice_deleted={invoice_number_deleted or 'none'} "
        f"charges_wiped={charges_wiped} tdsp_charges_restored={recomputed['tdsp_charges_restored']}"
    )
    await _audit(db, admin, action, "billing_revert")

    return {
        "id":                     billing_period_id,
        "status":                 "draft",
        "invoice_deleted":        invoice_number_deleted,
        "charges_wiped":          charges_wiped,
        "recomputed":             recomputed,
    }


@router.post("/billing-periods/{billing_period_id}/revert")
async def revert_billing_period(
    billing_period_id: int,
    admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await _revert_one(db, admin, billing_period_id)
    await db.commit()
    return result


@router.post("/billing-periods/bulk-revert")
async def bulk_revert_billing_periods(
    body: dict = Body(...),
    admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Bulk revert -- reuses _revert_one() in a loop. One failed item (404
    not found, or 409 because its invoice is already sent/paid) does not
    stop the batch; it's recorded as a skip with a reason and the loop
    continues. All successful items are committed together at the end.
    """
    raw_ids = body.get("billing_period_ids")
    if not isinstance(raw_ids, list) or not raw_ids:
        raise HTTPException(status_code=422, detail="billing_period_ids must be a non-empty list")

    results = []
    for raw_id in raw_ids:
        bp_id = int(raw_id)
        try:
            r = await _revert_one(db, admin, bp_id)
            results.append({"id": bp_id, "success": True, "status": r["status"], "invoice_deleted": r["invoice_deleted"]})
        except HTTPException as e:
            results.append({"id": bp_id, "success": False, "reason": e.detail})

    await db.commit()

    return {
        "results":   results,
        "succeeded": sum(1 for r in results if r["success"]),
        "skipped":   sum(1 for r in results if not r["success"]),
    }


# ── Unpost: admin-only correction path for an already-sent invoice ────────────

@router.post("/invoices/{invoice_id}/unpost")
async def unpost_invoice(
    invoice_id: int,
    body: dict = Body(...),
    admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    The one deliberate backdoor for correcting a 'sent' invoice. Sets the
    invoice back to 'draft' and its billing_period back to 'invoiced' --
    the state Revert expects, since Revert gates purely on invoice.status
    (not billing_period.status). That's what lets the existing revert
    endpoint apply to this period afterward, completely unmodified.

    Deliberately narrower than Revert's own block: only 'sent' is a valid
    source state. 'paid' is explicitly excluded -- once an invoice is paid,
    it must never be unpostable through this way.

    Requires a genuine free-text reason (server-side gate, mirrors the
    frontend's type-to-confirm friction) -- this is a deliberately
    high-friction correction path, not a routine one, so a blank or
    placeholder reason is rejected outright.
    """
    reason = str(body.get("reason") or "").strip()
    if len(reason) < 10 or reason.lower().strip(".") in _PLACEHOLDER_REASONS:
        raise HTTPException(
            status_code=422,
            detail=(
                "A specific reason (at least 10 characters, not a placeholder) "
                "is required to unpost an invoice."
            ),
        )

    r = await db.execute(text(
        "SELECT invoice_number, status, billing_period_id FROM invoices WHERE id = :id"
    ), {"id": invoice_id})
    row = r.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"Invoice {invoice_id} not found")
    invoice_number, status, billing_period_id = row

    if status != "sent":
        raise HTTPException(
            status_code=409,
            detail=(
                f"Cannot unpost: invoice {invoice_number} is '{status}', not 'sent'. "
                f"Only a sent invoice can be unposted -- paid invoices are never "
                f"unpostable this way."
            ),
        )

    await db.execute(text(
        "UPDATE invoices SET status = 'draft', sent_at = NULL WHERE id = :id"
    ), {"id": invoice_id})
    await db.execute(text(
        "UPDATE billing_periods SET status = 'invoiced' WHERE id = :id"
    ), {"id": billing_period_id})

    action = (
        f"invoice_unpost: invoice_id={invoice_id} invoice_number={invoice_number} "
        f"billing_period_id={billing_period_id} prior_status=sent new_status=draft "
        f'reason="{reason}" -- sent-bill correction path, distinct from a normal revert'
    )
    await _audit(db, admin, action, "invoice_unpost")
    await db.commit()

    return {
        "id":                 invoice_id,
        "invoice_number":     invoice_number,
        "billing_period_id":  billing_period_id,
        "status":             "draft",
    }


# ── Part D: /billing/corrections search -- global Revert/Unpost entry point ───

VALID_CORRECTION_STATUSES = {
    "draft", "reviewed", "approved", "invoiced",  # billing_period statuses
    "posted", "sent", "paid", "void",             # invoice statuses
}


@router.get("/billing-corrections")
async def search_billing_corrections(
    esi_id: Optional[str] = Query(None),
    bill_number: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD, matched against service_end"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD, matched against service_start"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    Search across billing_periods + their invoice (if any) for the global
    /billing/corrections page. Effective status is the invoice's status
    once one exists (draft/posted/sent/paid/void), falling back to the
    billing_period's own status (draft/reviewed/approved/invoiced) before
    an invoice is generated -- this is what the status filter matches.

    Read-only and gated by require_auth only (not require_admin) so any
    logged-in staff member can search; the actual Revert/Unpost mutation
    endpoints stay require_admin, and the frontend hides those buttons for
    non-admins.
    """
    if status and status not in VALID_CORRECTION_STATUSES:
        raise HTTPException(status_code=422, detail=f"status must be one of {sorted(VALID_CORRECTION_STATUSES)}")

    conditions = ["1=1"]
    params: dict = {"limit": limit, "offset": offset}

    if esi_id:
        conditions.append("bp.esi_id LIKE :esi_id")
        params["esi_id"] = f"%{esi_id.strip()}%"
    if bill_number:
        conditions.append("i.invoice_number LIKE :bill_number")
        params["bill_number"] = f"%{bill_number.strip()}%"
    if status:
        conditions.append("COALESCE(i.status, bp.status) = :status")
        params["status"] = status
    if date_from:
        conditions.append("bp.service_end >= :date_from")
        params["date_from"] = date_from
    if date_to:
        conditions.append("bp.service_start <= :date_to")
        params["date_to"] = date_to

    where = " AND ".join(conditions)

    rows = await db.execute(text(f"""
        SELECT bp.id, bp.esi_id, bp.service_start, bp.service_end, bp.status,
               bp.energy_charge, bp.meter_fee,
               i.id, i.invoice_number, i.status, i.total_amount,
               COALESCE(ch.tdsp_total, 0), COALESCE(cc.charges_count, 0)
        FROM billing_periods bp
        LEFT JOIN invoices i ON i.billing_period_id = bp.id
        LEFT JOIN (
            SELECT billing_period_id, SUM(amount) AS tdsp_total
            FROM billing_period_charges
            WHERE charge_source = 'tdsp'
            GROUP BY billing_period_id
        ) ch ON ch.billing_period_id = bp.id
        LEFT JOIN (
            SELECT billing_period_id, COUNT(*) AS charges_count
            FROM billing_period_charges
            GROUP BY billing_period_id
        ) cc ON cc.billing_period_id = bp.id
        WHERE {where}
        ORDER BY bp.id DESC
        LIMIT :limit OFFSET :offset
    """), params)
    raw = rows.fetchall()

    # Resolve customer name/company for just the ESI IDs on this page --
    # contract_renewal isn't linked by FK, so this is a small follow-up
    # query rather than a join, preferring an 'active' contract row.
    esi_ids = sorted({r[1] for r in raw if r[1]})
    customer_by_esi: dict = {}
    if esi_ids:
        placeholders = ", ".join(f":esi_{i}" for i in range(len(esi_ids)))
        cr_params = {f"esi_{i}": eid for i, eid in enumerate(esi_ids)}
        cr_rows = await db.execute(text(f"""
            SELECT premise_id, company_name, cust_first_name, cust_last_name
            FROM contract_renewal
            WHERE premise_id IN ({placeholders})
            ORDER BY (status = 'active') DESC, serial DESC
        """), cr_params)
        for premise_id, company, first, last in cr_rows.fetchall():
            if premise_id in customer_by_esi:
                continue  # first row per esi_id is the best-ranked one
            customer_by_esi[premise_id] = company or " ".join(p for p in (first, last) if p) or None

    result = []
    for (bp_id, esi_id_, svc_start, svc_end, bp_status,
         energy_charge, meter_fee,
         inv_id, invoice_number, inv_status, total_amount, tdsp_total, charges_count) in raw:
        amount = (
            float(total_amount) if total_amount is not None
            else float(energy_charge or 0) + float(meter_fee or 0) + float(tdsp_total or 0)
        )
        result.append({
            "billing_period_id": bp_id,
            "invoice_id":        inv_id,
            "invoice_number":    invoice_number,
            "esi_id":            esi_id_,
            "customer_name":     customer_by_esi.get(esi_id_),
            "service_start":     str(svc_start) if svc_start else None,
            "service_end":       str(svc_end) if svc_end else None,
            "amount":            amount,
            "charges_count":     charges_count,
            "status":            inv_status or bp_status,
        })
    return result
