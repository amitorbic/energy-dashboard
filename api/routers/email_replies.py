# =============================================================================
# routers/email_replies.py
# =============================================================================

import os
from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List

from middleware.auth import require_auth
from utils.database import get_db
from schemas.email_replies import (
    EmailReplyQueueCreate,
    EmailReplyQueueResponse,
    EmailReplyListResponse,
    EmailReplyReviewRequest,
    EmailReplyTimelineEntryResponse,
)
from controllers.email_replies import (
    get_queue_item,
    list_queue,
    create_queue_item,
    review_queue_item,
    get_timeline,
)

router = APIRouter(prefix="/email-replies", tags=["email-replies"])


async def require_pipeline_key(x_pipeline_key: str = Header(...)):
    """
    Shared-secret gate for the external Outlook extractor / email-assistant
    pipeline, which has no staff JWT to present. There is no existing
    machine-to-machine auth pattern anywhere else in this codebase to reuse
    (the ERCOT scrapers avoid the problem entirely by writing straight to
    MySQL instead of calling the API) -- this is a minimal, single-purpose
    stand-in for one. Set EMAIL_PIPELINE_API_KEY in this deployment's .env.
    """
    expected = os.getenv("EMAIL_PIPELINE_API_KEY")
    if not expected or x_pipeline_key != expected:
        raise HTTPException(status_code=401, detail="Invalid pipeline key")


# =============================================================================
# QUEUE — LIST / DETAIL
# =============================================================================


@router.get("/queue", response_model=EmailReplyListResponse)
async def list_email_reply_queue(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    include_archived: bool = Query(False),
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    total, rows = await list_queue(
        db, page, page_size, status, category, include_archived
    )
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "results": [EmailReplyQueueResponse.model_validate(r) for r in rows],
    }


@router.get("/queue/{item_id}", response_model=EmailReplyQueueResponse)
async def get_email_reply_queue_item(
    item_id: int,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    item = await get_queue_item(db, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Queue item not found")
    return item


# =============================================================================
# QUEUE — CREATE (called by the external email pipeline)
# =============================================================================


@router.post(
    "/queue",
    response_model=EmailReplyQueueResponse,
    status_code=201,
    dependencies=[Depends(require_pipeline_key)],
)
async def create_email_reply_queue_item(
    payload: EmailReplyQueueCreate,
    db: AsyncSession = Depends(get_db),
):
    """
    Ingestion endpoint for the Outlook extractor / email-assistant pipeline.
    One call per incoming customer query it processes -- either a drafted
    reply or a NO_MATCH abstention. Always lands in status=PENDING; nothing
    is ever sent from this endpoint.
    """
    item = await create_queue_item(db, payload.model_dump(), created_by="llm_agent")
    return item


# =============================================================================
# QUEUE — REVIEW (approve / deny / edit)
# =============================================================================


@router.patch("/queue/{item_id}", response_model=EmailReplyQueueResponse)
async def review_email_reply_queue_item(
    item_id: int,
    payload: EmailReplyReviewRequest,
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    reviewed_by = user.get("username") or user.get("email") or "unknown"
    try:
        item = await review_queue_item(
            db=db,
            item_id=item_id,
            decision=payload.decision.value,
            reviewed_by=reviewed_by,
            edited_reply=payload.edited_reply,
            reviewer_notes=payload.reviewer_notes,
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return item


# =============================================================================
# TIMELINE
# =============================================================================


@router.get(
    "/queue/{item_id}/timeline", response_model=List[EmailReplyTimelineEntryResponse]
)
async def get_email_reply_timeline(
    item_id: int,
    limit: int = Query(50, ge=1, le=200),
    user: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    return await get_timeline(db, item_id, limit)
