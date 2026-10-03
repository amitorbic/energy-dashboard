"""
Commission module router
All routes registered under /api prefix in main.py

Usage in main.py:
    from routers.commission import router as commission_router
    app.include_router(commission_router, prefix="/api")
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from utils.database import get_db
from sqlalchemy import text
from datetime import datetime
from controllers.commission import (
    upload_commission_file,
    get_commission_data,
    update_commission_row,
    delete_commission_row,
    delete_commission_month,
    upload_payment_summary,
    get_adjustments,
    add_adjustment,
    delete_adjustment,
    calculate_commission,
    get_review_summary,
    get_summary_months,
    get_user_log,
    get_vendor_dropdown,
    get_months_dropdown,
    add_manual_payment,
    send_commission_emails,
    download_commission_file,
    _current_month_short,
    generate_payment_sheet,
)
from fastapi.responses import StreamingResponse
import io as _io
from middleware.auth import require_module, require_any_module

router = APIRouter(prefix="/commission", tags=["Commission"])

# Commission is a mixed-ownership router: most endpoints are Sales, but
# /exceptions is the Commission Audit view and /data/{sid} is a shared
# mutation used by both the Sales edit flow and the Audit exception-fix
# flow. Gated per-endpoint below rather than at the router level -- see
# docs/ORBIC_PRODUCT_MODULARIZATION_SCOPE.md.
_sales = Depends(require_module("sales"))
_audit = Depends(require_module("audit"))
_sales_or_audit = Depends(require_any_module("sales", "audit"))


# ---------------------------------------------------------------------------
# Static routes first (before /{id} dynamic routes)
# ---------------------------------------------------------------------------

# -- Dropdowns / helpers


@router.get("/vendors", dependencies=[_sales])
async def list_vendors(db: AsyncSession = Depends(get_db)):
    return await get_vendor_dropdown(db)


@router.get("/months", dependencies=[_sales])
async def list_months(db: AsyncSession = Depends(get_db)):
    return await get_months_dropdown(db)


# -- Upload commission file


@router.post("/upload", dependencies=[_sales])
async def upload_commission(
    file: UploadFile = File(...),
    start_date: str = Form(...),
    end_date: str = Form(...),
    uid: int = Form(...),
    user_name: str = Form(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload monthly commission Excel file.
    Pre-checks duplicate month and missing brokers.
    """
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(
            status_code=400, detail="Only Excel files (.xlsx, .xls) are accepted"
        )

    file_bytes = await file.read()
    result = await upload_commission_file(
        file_bytes,
        file.filename or "file.xls",
        start_date,
        end_date,
        uid,
        user_name,
        db,
    )
    # Auto-calculate using the end_date month from upload form
    # end_date format MM/DD/YYYY → convert to YYYY-MM
    try:
        from datetime import datetime as dt

        end_dt = dt.strptime(end_date, "%m/%d/%Y")
        month_param = end_dt.strftime("%Y-%m")
    except ValueError:
        month_param = None
    await calculate_commission(uid, user_name, db, month_param)
    return result


# -- View data


@router.get("/data", dependencies=[_sales])
async def view_data(
    vendor: Optional[str] = Query(None),
    vendors: Optional[list[str]] = Query(None),
    from_month: Optional[str] = Query(None),
    to_month: Optional[str] = Query(None),
    quick_period: Optional[int] = Query(None),
    audit_mode: Optional[str] = Query(None),
    mon_count: int = Query(6),
    db: AsyncSession = Depends(get_db),
):
    return await get_commission_data(
        db, vendor, vendors, from_month, to_month, quick_period, audit_mode, mon_count
    )


# -- Delete entire month (step 3 in flow — clear last month before recalc)


@router.delete("/data/month", dependencies=[_sales])
async def delete_month_data(
    month: str = Query(...),
    uid: int = Query(...),
    user_name: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    return await delete_commission_month(month, uid, user_name, db)


# -- Upload payment summary


@router.post("/payments/upload", dependencies=[_sales])
async def upload_payments(
    file: UploadFile = File(...),
    uid: int = Form(...),
    user_name: str = Form(...),
    month: str = Form(None),  # e.g. '2026-12'
    db: AsyncSession = Depends(get_db),
):
    file_bytes = await file.read()
    return await upload_payment_summary(
        file_bytes, file.filename or "file.xls", month, uid, user_name, db
    )


@router.get("/payment-sheet/download", dependencies=[_sales])
async def download_payment_sheet(
    month: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    file_bytes, filename = await generate_payment_sheet(month, db)
    return StreamingResponse(
        _io.BytesIO(file_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# -- Adjustments


@router.get("/adjustments", dependencies=[_sales])
async def list_adjustments(db: AsyncSession = Depends(get_db)):
    return await get_adjustments(db)


@router.post("/adjustments", dependencies=[_sales])
async def create_adjustment(
    data: dict,
    uid: int = Query(...),
    user_name: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    return await add_adjustment(data, uid, user_name, db)


@router.get("/exceptions", dependencies=[_audit])
async def commission_exceptions(
    month: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    if not month:
        month_pattern = datetime.now().strftime("%Y-%m-%%")
    else:
        month_pattern = f"{month}-%"
    from controllers.commission import get_commission_exceptions

    return await get_commission_exceptions(db, month_pattern)


@router.delete("/adjustments/{sid}", dependencies=[_sales])
async def remove_adjustment(
    sid: int,
    uid: int = Query(...),
    user_name: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    return await delete_adjustment(sid, uid, user_name, db)


# -- Calculate commission


@router.post("/calculate", dependencies=[_sales])
async def run_calculate_commission(
    data: dict,
    db: AsyncSession = Depends(get_db),
):
    uid = data.get("uid", 0)
    user_name = data.get("user_name", "")
    month = data.get("month")  # e.g. '2026-04' from frontend
    return await calculate_commission(uid, user_name, db, month)


# -- Summary months dropdown


@router.get("/summary/months", dependencies=[_sales])
async def summary_months(db: AsyncSession = Depends(get_db)):
    from controllers.commission import get_summary_months

    return await get_summary_months(db)


# -- Review summary


@router.get("/summary", dependencies=[_sales])
async def review_summary(
    vendor: Optional[str] = Query(None),
    month: Optional[str] = Query(None),
    full_history: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    return await get_review_summary(db, vendor, month, full_history)


@router.post("/summary/payment", dependencies=[_sales])
async def manual_payment(
    data: dict,
    db: AsyncSession = Depends(get_db),
):
    return await add_manual_payment(
        vendor=data["vendor"],
        amount=float(data["amount"]),
        comments=data.get("comments", ""),
        entry_type=data.get("entry_type", "payment"),
        uid=data.get("uid", 0),
        user_name=data.get("user_name", ""),
        db=db,
    )


@router.get("/summary/history/{vendor}", dependencies=[_sales])
async def full_history(
    vendor: str,
    db: AsyncSession = Depends(get_db),
):
    return await get_review_summary(db, vendor=vendor, full_history=True)


# -- User log


@router.get("/logs/user", dependencies=[_sales])
async def user_log(
    limit: int = Query(500),
    db: AsyncSession = Depends(get_db),
):
    return await get_user_log(db, limit)


# -- Email commission files
@router.post("/email", dependencies=[_sales])
async def email_commission(
    data: dict,
    db: AsyncSession = Depends(get_db),
):
    vendor_ids = data.get("vendor_ids", [])
    month_label = data.get("month", _current_month_short())
    # Convert '2026-04' → 'Apr-26' if needed
    if month_label and "-" in month_label and len(month_label) == 7:
        try:
            from datetime import datetime

            dt = datetime.strptime(month_label, "%Y-%m")
            month_label = dt.strftime("%b-%y")
        except ValueError:
            pass
    uid = data.get("uid", 0)
    user_name = data.get("user_name", "")
    return await send_commission_emails(vendor_ids, month_label, uid, user_name, db)


# -- Download single broker commission file
@router.get("/download/{vendor}", dependencies=[_sales])
async def download_file(
    vendor: str,
    month: str = Query(None),
    db: AsyncSession = Depends(get_db),
):
    month_label = month or _current_month_short()
    # Convert '2026-04' → 'Apr-26' if needed
    if month_label and "-" in month_label and len(month_label) == 7:
        try:
            from datetime import datetime

            dt = datetime.strptime(month_label, "%Y-%m")
            month_label = dt.strftime("%b-%y")
        except ValueError:
            pass
    file_bytes, filename = await download_commission_file(vendor, month_label, db)
    return StreamingResponse(
        _io.BytesIO(file_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# -- Email log for commission
@router.get("/logs/email", dependencies=[_sales])
async def email_log(
    limit: int = Query(500),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text(
            "SELECT * FROM broker_logs WHERE email_type = 'commission' "
            "ORDER BY sid DESC LIMIT :limit"
        ),
        {"limit": limit},
    )
    return [dict(row) for row in result.mappings()]


# -- Dynamic routes LAST


@router.put("/data/{sid}", dependencies=[_sales_or_audit])
async def edit_row(
    sid: int,
    data: dict,
    uid: int = Query(...),
    user_name: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    return await update_commission_row(sid, data, uid, user_name, db)


@router.delete("/data/{sid}", dependencies=[_sales_or_audit])
async def delete_row(
    sid: int,
    uid: int = Query(...),
    user_name: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    return await delete_commission_row(sid, uid, user_name, db)
