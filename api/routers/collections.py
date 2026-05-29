# =============================================================================
# routers/collections.py
# =============================================================================

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional, List
from datetime import date
import pandas as pd
import io
import tempfile
import os
import json
from sqlalchemy import text

from utils.database import get_db
from models.collections import (
    CollectionsAccount,
    CollectionsTimeline,
    CollectionsApprovalQueue,
    CollectionsETF,
    ActorType,
    ApprovalStatus,
)
from schemas.collections import (
    CollectionsAccountCreate,
    CollectionsAccountUpdate,
    CollectionsAccountResponse,
    CollectionsAccountListRow,
    CollectionsListResponse,
    TimelineEntryResponse,
    AddNoteRequest,
    StageChangeRequest,
    ApprovalQueueResponse,
    ApprovalReviewRequest,
    RequestApprovalRequest,
    ARRExposureRow,
    AgingBucketRow,
    CollectionsDashboardSummary,
    DNPNoticeRequest,
    DNPExecuteRequest,
    DemandLetterRequest,
    ETFDetailResponse,
    ETFNegotiationUpdate,
    ARImportPreviewResponse,
    ARImportCommitResponse,
)
from controllers.collections import (
    get_account,
    get_account_by_esiid,
    list_accounts,
    create_account,
    update_account,
    change_stage,
    send_dnp_notice,
    execute_dnp,
    get_pending_approvals,
    review_approval,
    get_timeline,
    add_note,
    get_arr_exposure,
    get_aging_buckets,
    get_dashboard_summary,
    update_etf_status,
    process_ar_import,
)

TEMP_UPLOAD_DIR = os.path.join(tempfile.gettempdir(), "ameripower_uploads")
os.makedirs(TEMP_UPLOAD_DIR, exist_ok=True)
router = APIRouter(prefix="/api/collections", tags=["collections"])


# =============================================================================
# DASHBOARD
# =============================================================================


@router.get("/dashboard", response_model=CollectionsDashboardSummary)
async def dashboard(db: AsyncSession = Depends(get_db)):
    data = await get_dashboard_summary(db)
    return CollectionsDashboardSummary(**data)


# =============================================================================
# ACCOUNTS — LIST
# =============================================================================


@router.get("/accounts", response_model=CollectionsListResponse)
async def list_collections_accounts(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    track: Optional[str] = Query(None),
    stage: Optional[str] = Query(None),
    tier: Optional[str] = Query(None),
    assigned_to: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    etf_flag: Optional[bool] = Query(None),
    is_legal: Optional[bool] = Query(None),
    is_flagged: Optional[bool] = Query(None),
    days_min: Optional[int] = Query(None),
    days_max: Optional[int] = Query(None),
    broker_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    total, rows = await list_accounts(
        db=db,
        page=page,
        page_size=page_size,
        track=track,
        stage=stage,
        tier=tier,
        assigned_to=assigned_to,
        search=search,
        etf_flag=etf_flag,
        is_legal=is_legal,
        is_flagged=is_flagged,
        days_min=days_min,
        days_max=days_max,
        broker_id=broker_id,
    )
    return CollectionsListResponse(
        total=total,
        page=page,
        page_size=page_size,
        results=[CollectionsAccountListRow.model_validate(r) for r in rows],
    )


# =============================================================================
# ACCOUNTS — SINGLE
# =============================================================================


@router.get("/accounts/{account_id}", response_model=CollectionsAccountResponse)
async def get_collections_account(
    account_id: int,
    db: AsyncSession = Depends(get_db),
):
    account = await get_account(db, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


@router.get("/accounts/esiid/{esiid}", response_model=CollectionsAccountResponse)
async def get_account_by_esiid_route(
    esiid: str,
    db: AsyncSession = Depends(get_db),
):
    account = await get_account_by_esiid(db, esiid)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


# =============================================================================
# ACCOUNTS — CREATE / UPDATE
# =============================================================================


@router.post("/accounts", response_model=CollectionsAccountResponse, status_code=201)
async def create_collections_account(
    payload: CollectionsAccountCreate,
    db: AsyncSession = Depends(get_db),
):
    account = await create_account(db, payload.model_dump(), "system")
    return account


@router.patch("/accounts/{account_id}", response_model=CollectionsAccountResponse)
async def update_collections_account(
    account_id: int,
    payload: CollectionsAccountUpdate,
    db: AsyncSession = Depends(get_db),
):
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    account = await update_account(db, account_id, data, "system")
    return account


# =============================================================================
# STAGE CHANGE
# =============================================================================


@router.post("/accounts/{account_id}/stage", response_model=CollectionsAccountResponse)
async def change_account_stage(
    account_id: int,
    payload: StageChangeRequest,
    db: AsyncSession = Depends(get_db),
):
    account = await change_stage(
        db=db,
        account_id=account_id,
        new_stage=payload.new_stage,
        reason=payload.reason,
        changed_by="system",
    )
    return account


# =============================================================================
# TIMELINE
# =============================================================================


@router.get(
    "/accounts/{account_id}/timeline", response_model=List[TimelineEntryResponse]
)
async def get_account_timeline(
    account_id: int,
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    entries = await get_timeline(db, account_id, limit)
    return entries


@router.post("/accounts/{account_id}/notes", response_model=TimelineEntryResponse)
async def add_account_note(
    account_id: int,
    payload: AddNoteRequest,
    db: AsyncSession = Depends(get_db),
):
    entry = await add_note(db, account_id, payload.note, "system")
    return entry


# =============================================================================
# DNP WORKFLOW
# =============================================================================


@router.post("/accounts/{account_id}/dnp-notice", response_model=ApprovalQueueResponse)
async def request_dnp_notice(
    account_id: int,
    payload: DNPNoticeRequest,
    db: AsyncSession = Depends(get_db),
):
    """Queue DNP notice for human approval. PUC 10-day rule enforced."""
    approval = await send_dnp_notice(db, account_id, payload.reason, "system")
    account = await get_account(db, account_id)
    result = ApprovalQueueResponse.model_validate(approval)
    result.customer_name = account.customer_name
    result.esiid = account.esiid
    result.track = account.track
    result.stage = account.stage
    result.total_due = account.total_due
    result.days_overdue = account.days_overdue
    result.delinquency_tier = account.delinquency_tier
    return result


@router.post(
    "/accounts/{account_id}/dnp-execute", response_model=CollectionsAccountResponse
)
async def execute_dnp_action(
    account_id: int,
    payload: DNPExecuteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Execute DNP. HUMAN ONLY. PUC eligibility date enforced."""
    if not payload.confirmed:
        raise HTTPException(status_code=400, detail="Must confirm=true to execute DNP")
    account = await execute_dnp(db, account_id, payload.executed_by, payload.notes)
    return account


# =============================================================================
# ETF
# =============================================================================


@router.get("/accounts/{account_id}/etf", response_model=ETFDetailResponse)
async def get_etf_detail(
    account_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CollectionsETF).where(CollectionsETF.account_id == account_id)
    )
    etf = result.scalar_one_or_none()
    if not etf:
        raise HTTPException(status_code=404, detail="No ETF record for this account")
    return etf


@router.patch("/accounts/{account_id}/etf", response_model=CollectionsAccountResponse)
async def update_etf(
    account_id: int,
    new_status: str = Query(..., description="WAIVED | COLLECTED | NEGOTIATING"),
    notes: Optional[str] = Query(None),
    amount: Optional[float] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    account = await update_etf_status(
        db, account_id, new_status, "system", notes, amount
    )
    return account


# =============================================================================
# APPROVAL QUEUE
# =============================================================================


@router.get("/approvals", response_model=CollectionsListResponse)
async def list_approvals(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    risk_level: Optional[str] = Query(None),
    action_type: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    total, rows = await get_pending_approvals(
        db, page, page_size, risk_level, action_type
    )
    enriched = []
    for r in rows:
        account = await get_account(db, r.account_id)
        item = ApprovalQueueResponse.model_validate(r)
        if account:
            item.customer_name = account.customer_name
            item.esiid = account.esiid
            item.track = account.track
            item.stage = account.stage
            item.total_due = account.total_due
            item.days_overdue = account.days_overdue
            item.delinquency_tier = account.delinquency_tier
            item.broker_name = account.broker_name
        enriched.append(item)

    return {"total": total, "page": page, "page_size": page_size, "results": enriched}


@router.patch("/approvals/{approval_id}", response_model=ApprovalQueueResponse)
async def review_approval_action(
    approval_id: int,
    payload: ApprovalReviewRequest,
    db: AsyncSession = Depends(get_db),
):
    approval = await review_approval(
        db=db,
        approval_id=approval_id,
        decision=payload.decision,
        reviewed_by="system",
        reviewer_notes=payload.reviewer_notes,
    )
    return approval


# =============================================================================
# ARR / REPORTING
# =============================================================================


@router.get("/reports/arr-exposure", response_model=List[ARRExposureRow])
async def arr_exposure(db: AsyncSession = Depends(get_db)):
    rows = await get_arr_exposure(db)
    return [ARRExposureRow(**r) for r in rows]


@router.get("/reports/aging", response_model=List[AgingBucketRow])
async def aging_report(db: AsyncSession = Depends(get_db)):
    rows = await get_aging_buckets(db)
    return [AgingBucketRow(**r) for r in rows]


@router.get("/reports/etf-open")
async def etf_open_report(db: AsyncSession = Depends(get_db)):
    from controllers.collections import get_etf_open

    return await get_etf_open(db)


# =============================================================================
# AR SHEET IMPORT (weekly)
# =============================================================================


@router.post("/import/ar-sheet", response_model=ARImportCommitResponse)
async def import_ar_sheet(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    if not file.filename.endswith((".xlsx", ".xls", ".csv")):
        raise HTTPException(status_code=400, detail="File must be .xlsx, .xls, or .csv")

    content = await file.read()
    try:
        if file.filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        else:
            df = pd.read_excel(io.BytesIO(content))
        rows = df.to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse file: {e}")

    stats = await process_ar_import(db, rows, "system")

    return ARImportCommitResponse(
        import_id=0,
        status="COMPLETED" if not stats["errors"] else "COMPLETED_WITH_ERRORS",
        created=stats["created"],
        updated=stats["updated"],
        skipped=stats["skipped"],
        errors=stats["errors"],
    )
