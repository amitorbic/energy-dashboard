from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from utils.database import get_db
from middleware.auth import require_auth
import controllers.billing as ctrl
import controllers.billing_test as ctrl_test
from schemas.billing import BillingCommentSave, RecipientCreate, SendEmailRequest

router = APIRouter(prefix="/billing", tags=["Billing"])


# ── upload ────────────────────────────────────────────────────────────────────


@router.post("/upload")
async def upload_billing_extract(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    if not file.filename.endswith((".xls", ".xlsx")):
        raise HTTPException(status_code=400, detail="Only .xls or .xlsx files accepted")
    upload_id = await ctrl.parse_and_load(file, db, uploaded_by=user["username"])
    return {"message": "Upload successful", "upload_id": upload_id}


# ── exceptions ────────────────────────────────────────────────────────────────


@router.get("/exceptions/last")
async def get_last_exceptions(
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    rows = await ctrl.get_last_exceptions(db)
    return [dict(r._mapping) for r in rows]


@router.get("/exceptions/{upload_date}")
async def get_exceptions_by_date(
    upload_date: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    rows = await ctrl.get_exceptions_by_date(upload_date, db)
    return [dict(r._mapping) for r in rows]


# ── comments ──────────────────────────────────────────────────────────────────


@router.post("/comments/save")
async def save_comments(
    payload: BillingCommentSave,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    return await ctrl.save_comments(payload, db, commented_by=user["username"])


# ── upload history ────────────────────────────────────────────────────────────


@router.get("/history")
async def get_upload_history(
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    rows = await ctrl.get_upload_history(db)
    return [dict(r._mapping) for r in rows]


# ── email recipients ──────────────────────────────────────────────────────────


@router.get("/recipients")
async def get_recipients(
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    rows = await ctrl.get_recipients(db)
    return [dict(r._mapping) for r in rows]


@router.post("/recipients/add")
async def add_recipient(
    payload: RecipientCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    return await ctrl.add_recipient(payload, db)


@router.post("/send-email")
async def send_email(
    payload: SendEmailRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    return await ctrl.send_billing_email(payload.upload_id, db)


@router.patch("/recipients/{recipient_id}/toggle")
async def toggle_recipient(
    recipient_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    return await ctrl.toggle_recipient(recipient_id, db)


@router.delete("/recipients/{recipient_id}")
async def delete_recipient(
    recipient_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    return await ctrl.delete_recipient(recipient_id, db)


@router.post("/rerun-checks")
async def rerun_checks(
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    return await ctrl.rerun_checks(db)


# ── php-style test (billing_test.py) ─────────────────────────────────────────


@router.post("/test/run")
async def run_php_style_test(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    if not file.filename.endswith((".xls", ".xlsx")):
        raise HTTPException(status_code=400, detail="Only .xls or .xlsx files accepted")
    rows = await ctrl_test.run_php_checks(file, db)
    counts = {k: len(v) for k, v in rows.items()}
    return {"counts": counts, "rows": rows}


@router.get("/php-comparison/{upload_id}")
async def get_php_comparison(
    upload_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    row = (
        await db.execute(
            text("SELECT * FROM billing_php_comparison WHERE upload_id = :uid"),
            {"uid": upload_id},
        )
    ).fetchone()
    if not row:
        return {}
    return dict(row._mapping)
