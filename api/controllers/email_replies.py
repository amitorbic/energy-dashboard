# =============================================================================
# controllers/email_replies.py
# Business logic for the email-reply approval queue
# =============================================================================

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, desc
from datetime import datetime
from typing import Optional

from models.email_replies import (
    EmailReplyApprovalQueue,
    EmailReplyTimeline,
    DraftStatus,
    EmailReplyStatus,
    EmailActorType,
    EmailEventType,
)


# =============================================================================
# QUEUE — READ
# =============================================================================


async def get_queue_item(
    db: AsyncSession, item_id: int
) -> Optional[EmailReplyApprovalQueue]:
    result = await db.execute(
        select(EmailReplyApprovalQueue).where(EmailReplyApprovalQueue.id == item_id)
    )
    return result.scalar_one_or_none()


async def list_queue(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
    status: Optional[str] = None,
    category: Optional[str] = None,
    include_archived: bool = False,
) -> tuple[int, list]:
    filters = []
    if not include_archived:
        filters.append(EmailReplyApprovalQueue.is_archived == False)
    if status:
        filters.append(EmailReplyApprovalQueue.status == status)
    if category:
        filters.append(EmailReplyApprovalQueue.category == category)

    where = and_(*filters) if filters else True
    total = (
        await db.execute(
            select(func.count(EmailReplyApprovalQueue.id)).where(where)
        )
    ).scalar() or 0

    rows = (
        (
            await db.execute(
                select(EmailReplyApprovalQueue)
                .where(where)
                .order_by(desc(EmailReplyApprovalQueue.created_at))
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        .scalars()
        .all()
    )

    return total, rows


# =============================================================================
# QUEUE — CREATE (called by the external email pipeline)
# =============================================================================


async def create_queue_item(
    db: AsyncSession,
    data: dict,
    created_by: str = "llm_agent",
) -> EmailReplyApprovalQueue:
    """
    One row per incoming customer query the pipeline processes. Always
    lands in status=PENDING regardless of draft_status -- a NO_MATCH
    abstention still needs a human to write the reply by hand, it's just
    not offering a draft to start from.
    """
    item = EmailReplyApprovalQueue(
        query_text=data["query_text"],
        retrieved_context=data.get("retrieved_context"),
        category=data["category"],
        confidence_score=data.get("confidence_score"),
        draft_status=data["draft_status"],
        draft_reply=data.get("draft_reply"),
        status=EmailReplyStatus.PENDING,
        created_by=created_by,
    )
    db.add(item)
    await db.flush()

    is_abstention = item.draft_status == DraftStatus.NO_MATCH_NEEDS_MANUAL_REPLY
    await _write_timeline(
        db=db,
        queue_item_id=item.id,
        actor_type=EmailActorType.LLM_AGENT,
        actor_name=created_by,
        event_type=(
            EmailEventType.NO_MATCH_ABSTAINED
            if is_abstention
            else EmailEventType.DRAFT_CREATED
        ),
        subject="No match -- needs manual reply" if is_abstention else "Draft reply created",
        body=item.draft_reply,
        metadata={"category": item.category, "confidence_score": item.confidence_score},
    )

    await db.commit()
    await db.refresh(item)
    return item


# =============================================================================
# QUEUE — REVIEW (approve / deny / edit)
# =============================================================================


async def review_queue_item(
    db: AsyncSession,
    item_id: int,
    decision: str,
    reviewed_by: str,
    edited_reply: Optional[str] = None,
    reviewer_notes: Optional[str] = None,
) -> EmailReplyApprovalQueue:
    item = await get_queue_item(db, item_id)
    if not item:
        raise ValueError(f"Queue item {item_id} not found")
    if item.status != EmailReplyStatus.PENDING:
        raise ValueError(f"Queue item already {item.status}")

    was_edited = (
        decision == EmailReplyStatus.APPROVED.value
        and edited_reply is not None
        and edited_reply != item.draft_reply
    )

    item.status = decision
    item.human_reviewed = True
    item.reviewed_by = reviewed_by
    item.reviewed_at = datetime.utcnow()
    item.reviewer_notes = reviewer_notes
    if decision == EmailReplyStatus.APPROVED.value:
        item.sent_reply = edited_reply if edited_reply is not None else item.draft_reply

    if was_edited:
        await _write_timeline(
            db=db,
            queue_item_id=item_id,
            actor_type=EmailActorType.HUMAN,
            actor_name=reviewed_by,
            event_type=EmailEventType.EDITED,
            subject="Reviewer edited draft before sending",
            body=edited_reply,
        )

    event = (
        EmailEventType.APPROVED
        if decision == EmailReplyStatus.APPROVED.value
        else EmailEventType.DENIED
    )
    await _write_timeline(
        db=db,
        queue_item_id=item_id,
        actor_type=EmailActorType.HUMAN,
        actor_name=reviewed_by,
        event_type=event,
        subject=f"Reply {decision.lower()}",
        body=reviewer_notes or "",
    )

    await db.commit()
    await db.refresh(item)
    return item


# =============================================================================
# TIMELINE
# =============================================================================


async def get_timeline(
    db: AsyncSession,
    item_id: int,
    limit: int = 50,
) -> list:
    result = await db.execute(
        select(EmailReplyTimeline)
        .where(EmailReplyTimeline.queue_item_id == item_id)
        .order_by(desc(EmailReplyTimeline.created_at))
        .limit(limit)
    )
    return result.scalars().all()


# =============================================================================
# HELPERS
# =============================================================================


async def _write_timeline(
    db: AsyncSession,
    queue_item_id: int,
    actor_type: EmailActorType,
    actor_name: str,
    event_type: EmailEventType,
    subject: Optional[str] = None,
    body: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> EmailReplyTimeline:
    entry = EmailReplyTimeline(
        queue_item_id=queue_item_id,
        actor_type=actor_type,
        actor_name=actor_name,
        event_type=event_type,
        subject=subject,
        body=body,
        event_metadata=metadata,
    )
    db.add(entry)
    await db.flush()
    return entry
