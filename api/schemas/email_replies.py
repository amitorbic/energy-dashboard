# =============================================================================
# schemas/email_replies.py
# =============================================================================

from pydantic import BaseModel, Field
from typing import Optional, List, Any
from datetime import datetime
from enum import Enum


# ── Enums ─────────────────────────────────────────────────────────────────────


class EmailCategory(str, Enum):
    BILLING = "billing"
    PAYMENT = "payment"
    PRICING = "pricing"
    COMMISSION = "commission"
    COLLECTIONS = "collections"
    CANCELLATION_CLOSURE = "cancellation_closure"
    OTHER = "other"


class DraftStatus(str, Enum):
    DRAFTED = "DRAFTED"
    NO_MATCH_NEEDS_MANUAL_REPLY = "NO_MATCH_NEEDS_MANUAL_REPLY"


class EmailReplyStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    DENIED = "DENIED"
    AUTO_SENT = "AUTO_SENT"


# ── Queue ─────────────────────────────────────────────────────────────────────


class EmailReplyQueueCreate(BaseModel):
    """Written by the external Outlook extractor / email-assistant pipeline,
    once per incoming customer query it processes."""

    query_text: str = Field(..., min_length=1)
    retrieved_context: Optional[Any] = None
    category: EmailCategory
    confidence_score: Optional[float] = None
    draft_status: DraftStatus
    draft_reply: Optional[str] = None


class EmailReplyQueueResponse(BaseModel):
    id: int
    query_text: str
    retrieved_context: Optional[Any]
    category: str
    confidence_score: Optional[float]
    draft_status: str
    draft_reply: Optional[str]
    status: str
    human_reviewed: bool
    reviewed_by: Optional[str]
    reviewed_at: Optional[datetime]
    reviewer_notes: Optional[str]
    sent_reply: Optional[str]
    is_archived: bool
    archived_at: Optional[datetime]
    created_by: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class EmailReplyListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    results: List[EmailReplyQueueResponse]


class EmailReplyReviewRequest(BaseModel):
    decision: EmailReplyStatus  # APPROVED or DENIED
    edited_reply: Optional[str] = None  # reviewer's edited text, if changed from draft_reply
    reviewer_notes: Optional[str] = None


# ── Timeline ──────────────────────────────────────────────────────────────────


class EmailReplyTimelineEntryResponse(BaseModel):
    id: int
    queue_item_id: int
    actor_type: str
    actor_name: str
    event_type: str
    subject: Optional[str]
    body: Optional[str]
    event_metadata: Optional[Any]
    created_at: datetime

    class Config:
        from_attributes = True
