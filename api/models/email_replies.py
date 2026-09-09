# =============================================================================
# models/email_replies.py
# =============================================================================

from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    DateTime,
    Text,
    Boolean,
    JSON,
    ForeignKey,
    Enum as SAEnum,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from utils.database import Base
import enum


# =============================================================================
# ENUMS
# =============================================================================


class EmailCategory(str, enum.Enum):
    BILLING = "billing"
    PAYMENT = "payment"
    PRICING = "pricing"
    COMMISSION = "commission"
    COLLECTIONS = "collections"
    CANCELLATION_CLOSURE = "cancellation_closure"
    OTHER = "other"


class DraftStatus(str, enum.Enum):
    DRAFTED = "DRAFTED"
    NO_MATCH_NEEDS_MANUAL_REPLY = "NO_MATCH_NEEDS_MANUAL_REPLY"


class EmailReplyStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    DENIED = "DENIED"
    AUTO_SENT = "AUTO_SENT"


class EmailActorType(str, enum.Enum):
    HUMAN = "HUMAN"
    LLM_AGENT = "LLM_AGENT"
    SYSTEM = "SYSTEM"


class EmailEventType(str, enum.Enum):
    DRAFT_CREATED = "DRAFT_CREATED"
    NO_MATCH_ABSTAINED = "NO_MATCH_ABSTAINED"
    APPROVED = "APPROVED"
    DENIED = "DENIED"
    EDITED = "EDITED"
    AUTO_SENT = "AUTO_SENT"
    ARCHIVED = "ARCHIVED"
    NOTE_ADDED = "NOTE_ADDED"


# =============================================================================
# APPROVAL QUEUE
# =============================================================================


class EmailReplyApprovalQueue(Base):
    __tablename__ = "email_reply_approval_queue"

    id = Column(Integer, primary_key=True, index=True)
    query_text = Column(Text, nullable=False)
    retrieved_context = Column(
        JSON, nullable=True
    )  # full retrieval context for audit: conversation_ids, similarity scores, matched reply text
    category = Column(SAEnum(EmailCategory), nullable=False, index=True)
    confidence_score = Column(Float, nullable=True)
    draft_status = Column(SAEnum(DraftStatus), nullable=False, index=True)
    draft_reply = Column(Text, nullable=True)
    status = Column(
        SAEnum(EmailReplyStatus),
        nullable=False,
        default=EmailReplyStatus.PENDING,
        index=True,
    )
    human_reviewed = Column(Boolean, nullable=False, default=False)
    reviewed_by = Column(String(100), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    reviewer_notes = Column(Text, nullable=True)
    sent_reply = Column(Text, nullable=True)
    is_archived = Column(Boolean, nullable=False, default=False)
    archived_at = Column(DateTime, nullable=True)
    created_by = Column(String(100), nullable=False, default="llm_agent")
    created_at = Column(DateTime, server_default=func.now(), index=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    timeline = relationship(
        "EmailReplyTimeline",
        back_populates="queue_item",
        cascade="all, delete-orphan",
    )


# =============================================================================
# ACTIVITY TIMELINE
# =============================================================================


class EmailReplyTimeline(Base):
    __tablename__ = "email_reply_timeline"

    id = Column(Integer, primary_key=True, index=True)
    queue_item_id = Column(
        Integer,
        ForeignKey("email_reply_approval_queue.id"),
        nullable=False,
        index=True,
    )
    actor_type = Column(SAEnum(EmailActorType), nullable=False)
    actor_name = Column(String(100), nullable=False)
    event_type = Column(SAEnum(EmailEventType), nullable=False, index=True)
    subject = Column(String(500), nullable=True)
    body = Column(Text, nullable=True)
    event_metadata = Column(JSON, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), index=True)

    queue_item = relationship("EmailReplyApprovalQueue", back_populates="timeline")
