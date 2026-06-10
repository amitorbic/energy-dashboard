from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from utils.database import get_db
from middleware.auth import require_auth
import controllers.enrollment as ctrl
from schemas.enrollment import (
    ActionRequest,
    ApproveRequest,
    DownloadCompletedRequest,
    EditEnrollmentRequest,
    StatusCheckRequest,
    TemplateCreate,
)

router = APIRouter(prefix="/enrollment", tags=["Enrollment"])

_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


# ── upload ────────────────────────────────────────────────────────────────────


@router.post("/upload")
async def upload_enrollment(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    return await ctrl.upload_enrollment(file, db, username=user["username"])


# ── list views ────────────────────────────────────────────────────────────────


@router.get("/view")
async def get_view(
    sort: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    return await ctrl.get_enrollments_view(sort, db)


@router.get("/completed")
async def get_completed(
    sort: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    return await ctrl.get_completed_enrollments(sort, db)


@router.get("/canceled")
async def get_canceled(
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    return await ctrl.get_canceled_enrollments(db)


@router.get("/user-log")
async def get_user_log(
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    return await ctrl.get_user_log(db)


@router.get("/stats")
async def get_stats(
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    return await ctrl.get_stats(db)


@router.get("/list")
async def get_list(
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    return await ctrl.get_enrollment_list(db)


# ── reports ───────────────────────────────────────────────────────────────────


@router.get("/reports/comparison")
async def get_comparison(
    start: Optional[str] = Query(None),
    end:   Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    return await ctrl.get_comparison(start, end, db)


@router.get("/reports/pending-confirmations")
async def get_pending_confirmations(
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    return await ctrl.get_pending_confirmations(search, db)


@router.get("/reports/no-confirmations")
async def get_no_confirmations(
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    return await ctrl.get_no_confirmations(db)


@router.get("/reports/template-comparison")
async def get_template_comparison(
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    return await ctrl.get_template_comparison(db)


@router.get("/reports/checked")
async def get_checked(
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    return await ctrl.get_checked(db)


@router.get("/reports/non-billed")
async def get_non_billed(
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    return await ctrl.get_non_billed(db)


# ── downloads ─────────────────────────────────────────────────────────────────


@router.get("/download/completed")
async def download_completed(
    start: str = Query(...),
    end:   str = Query(...),
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    data = await ctrl.download_completed(start, end, db)
    return Response(
        content=data,
        media_type=_XLSX,
        headers={
            "Content-Disposition":
                f"attachment; filename=Completed_enrollment_{start}_{end}.xlsx"
        },
    )


@router.get("/download/pending")
async def download_pending(
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    data = await ctrl.download_pending(db)
    return Response(
        content=data,
        media_type=_XLSX,
        headers={
            "Content-Disposition": "attachment; filename=Pending_Enrollments.xlsx"
        },
    )


# ── templates ─────────────────────────────────────────────────────────────────


@router.get("/brokers")
async def get_brokers(
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    return await ctrl.get_brokers_for_dropdown(db)


@router.get("/templates")
async def get_templates(
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    return await ctrl.get_templates(search, db)


@router.post("/templates")
async def create_template(
    payload: TemplateCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    return await ctrl.create_template(payload, db)


@router.put("/templates/{sid}")
async def update_template(
    sid: int,
    payload: TemplateCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    return await ctrl.update_template(sid, payload, db)


@router.delete("/templates/{sid}")
async def delete_template(
    sid: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    return await ctrl.delete_template(sid, db)


# ── confirmation actions ──────────────────────────────────────────────────────


@router.patch("/confirmation/{sid}/dismiss")
async def dismiss_confirmation(
    sid: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    return await ctrl.dismiss_confirmation(sid, db)


# ── per-ESID actions (must be after all literal-segment routes) ───────────────


@router.get("/{esid}/edit")
async def get_enrollment_for_edit(
    esid: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    row = await ctrl.get_enrollment_by_esid(esid, db)
    if not row:
        raise HTTPException(status_code=404, detail="Enrollment not found")
    return row


@router.patch("/{esid}/edit")
async def edit_enrollment(
    esid: str,
    payload: EditEnrollmentRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    return await ctrl.edit_enrollment_record(
        esid, payload, db, username=user["username"]
    )


@router.patch("/{esid}/status")
async def status_check(
    esid: str,
    payload: StatusCheckRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    return await ctrl.status_check_enrollment(
        esid, payload, db,
        username=user["username"],
        role=int(user.get("role", 0)),
    )


@router.patch("/{esid}/clear")
async def clear_enrollment(
    esid: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    return await ctrl.clear_enrollment_record(esid, db)


@router.patch("/{esid}/additional-esid-check")
async def toggle_additional_esid(
    esid: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    return await ctrl.toggle_additional_esid_check(
        esid, db, username=user["username"]
    )


@router.patch("/{esid}/approve")
async def approve_enrollment(
    esid: str,
    payload: ApproveRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    return await ctrl.approve_enrollment(esid, payload, db)


@router.patch("/{esid}/action")
async def action_enrollment(
    esid: str,
    payload: ActionRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    return await ctrl.action_enrollment(esid, payload, db)


@router.get("/{esid}/log")
async def get_log(
    esid: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_auth),
):
    return await ctrl.get_enrollment_log(esid, db)
