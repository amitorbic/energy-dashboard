from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.auth import require_admin
from utils.database import get_db
from controllers.billing_engine import recompute_billing_period

router = APIRouter(prefix="/admin", tags=["admin"])


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

@router.post("/billing-periods/{billing_period_id}/revert")
async def revert_billing_period(
    billing_period_id: int,
    admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
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
    await db.commit()

    return {
        "id":                     billing_period_id,
        "status":                 "draft",
        "invoice_deleted":        invoice_number_deleted,
        "charges_wiped":          charges_wiped,
        "recomputed":             recomputed,
    }


# ── Unpost: admin-only correction path for an already-sent invoice ────────────

@router.post("/invoices/{invoice_id}/unpost")
async def unpost_invoice(
    invoice_id: int,
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
    it must never be unpostable through this path.
    """
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
        f"-- sent-bill correction path, distinct from a normal revert"
    )
    await _audit(db, admin, action, "invoice_unpost")
    await db.commit()

    return {
        "id":                 invoice_id,
        "invoice_number":     invoice_number,
        "billing_period_id":  billing_period_id,
        "status":             "draft",
    }
