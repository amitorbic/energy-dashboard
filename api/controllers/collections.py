# =============================================================================
# controllers/collections.py
# Business logic for collections module
# =============================================================================

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func, and_, desc, text
from datetime import date, datetime, timedelta
from typing import Optional, List
import logging

from models.collections import (
    CollectionsAccount,
    CollectionsTimeline,
    CollectionsETF,
    CollectionsPaymentPlan,
    CollectionsApprovalQueue,
    CollectionsEscalationRule,
    CollectionsAgentTool,
    CollectionStage,
    CollectionTrack,
    DelinquencyTier,
    ETFStatus,
    ApprovalStatus,
    ApprovalActionType,
    ActorType,
    EventType,
    Priority,
    PlanStatus,
)

logger = logging.getLogger(__name__)


# =============================================================================
# ACCOUNT CRUD
# =============================================================================


async def get_account(
    db: AsyncSession, account_id: int
) -> Optional[CollectionsAccount]:
    result = await db.execute(
        select(CollectionsAccount).where(CollectionsAccount.id == account_id)
    )
    return result.scalar_one_or_none()


async def get_account_by_esiid(
    db: AsyncSession, esiid: str
) -> Optional[CollectionsAccount]:
    result = await db.execute(
        select(CollectionsAccount).where(CollectionsAccount.esiid == esiid)
    )
    return result.scalar_one_or_none()


async def list_accounts(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 50,
    track: Optional[str] = None,
    stage: Optional[str] = None,
    tier: Optional[str] = None,
    assigned_to: Optional[str] = None,
    search: Optional[str] = None,
    etf_flag: Optional[bool] = None,
    is_legal: Optional[bool] = None,
    is_flagged: Optional[bool] = None,
    days_min: Optional[int] = None,
    days_max: Optional[int] = None,
    broker_id: Optional[int] = None,
) -> tuple[int, list]:
    filters = [CollectionsAccount.is_paid == False]

    if track:
        filters.append(CollectionsAccount.track == track)
    if stage:
        filters.append(CollectionsAccount.stage == stage)
    if tier:
        filters.append(CollectionsAccount.delinquency_tier == tier)
    if assigned_to:
        filters.append(CollectionsAccount.assigned_to == assigned_to)
    if etf_flag is not None:
        filters.append(CollectionsAccount.etf_flag == etf_flag)
    if is_legal is not None:
        filters.append(CollectionsAccount.is_legal == is_legal)
    if is_flagged is not None:
        filters.append(CollectionsAccount.is_flagged == is_flagged)
    if broker_id:
        filters.append(CollectionsAccount.broker_id == broker_id)
    if days_min is not None:
        filters.append(CollectionsAccount.days_overdue >= days_min)
    if days_max is not None:
        filters.append(CollectionsAccount.days_overdue <= days_max)
    if search:
        filters.append(
            CollectionsAccount.customer_name.ilike(f"%{search}%")
            | CollectionsAccount.esiid.ilike(f"%{search}%")
            | CollectionsAccount.account_number.ilike(f"%{search}%")
        )

    where = and_(*filters)
    total = (
        await db.execute(select(func.count(CollectionsAccount.id)).where(where))
    ).scalar() or 0

    rows = (
        (
            await db.execute(
                select(CollectionsAccount)
                .where(where)
                .order_by(
                    desc(CollectionsAccount.delinquency_score),
                    desc(CollectionsAccount.days_overdue),
                )
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        .scalars()
        .all()
    )

    return total, rows


async def create_account(
    db: AsyncSession, data: dict, created_by: str
) -> CollectionsAccount:
    account = CollectionsAccount(**data)
    account.delinquency_score = _calc_score(
        data.get("days_overdue", 0),
        data.get("total_due", 0),
        data.get("track", "INACTIVE"),
    )
    account.delinquency_tier = _score_to_tier(account.delinquency_score)
    account.total_due = data.get("usage_balance", 0) + data.get("etf_amount", 0)
    db.add(account)
    await db.flush()

    await _write_timeline(
        db=db,
        account_id=account.id,
        actor_type=ActorType.SYSTEM,
        actor_name=created_by,
        event_type=EventType.NOTE_ADDED,
        subject="Account added to collections",
        body=f"Track: {data.get('track')} · Stage: {data.get('stage')} · Balance: ${data.get('usage_balance', 0):,.2f}",
    )

    await db.commit()
    await db.refresh(account)
    return account


async def update_account(
    db: AsyncSession, account_id: int, data: dict, updated_by: str
) -> CollectionsAccount:
    account = await get_account(db, account_id)
    if not account:
        raise ValueError(f"Account {account_id} not found")

    for key, value in data.items():
        if value is not None and hasattr(account, key):
            setattr(account, key, value)

    account.updated_at = datetime.utcnow()

    if "usage_balance" in data or "etf_amount" in data:
        account.total_due = account.usage_balance + (
            account.etf_amount
            if account.etf_status not in ("WAIVED", "COLLECTED")
            else 0
        )
        account.delinquency_score = _calc_score(
            account.days_overdue, account.total_due, account.track
        )
        account.delinquency_tier = _score_to_tier(account.delinquency_score)

    await db.commit()
    await db.refresh(account)
    return account


# =============================================================================
# STAGE TRANSITIONS
# =============================================================================


async def change_stage(
    db: AsyncSession,
    account_id: int,
    new_stage: str,
    reason: str,
    changed_by: str,
    actor_type: ActorType = ActorType.HUMAN,
) -> CollectionsAccount:
    account = await get_account(db, account_id)
    if not account:
        raise ValueError(f"Account {account_id} not found")

    old_stage = account.stage
    account.stage = new_stage
    account.stage_entered_at = datetime.utcnow()
    account.stage_updated_by = changed_by
    account.updated_at = datetime.utcnow()

    # Update flags based on stage
    if new_stage == CollectionStage.IN_LEGAL:
        account.is_legal = True
    if new_stage == CollectionStage.DNP_ACTIVE:
        account.is_dnp_active = True
    if new_stage == CollectionStage.MVO:
        account.is_mvo = True
        account.is_dnp_active = False
    if new_stage == CollectionStage.RESOLVED:
        account.is_paid = True
        account.resolved_at = datetime.utcnow()

    await _write_timeline(
        db=db,
        account_id=account_id,
        actor_type=actor_type,
        actor_name=changed_by,
        event_type=EventType.STAGE_CHANGED,
        subject=f"Stage changed: {old_stage} → {new_stage}",
        body=reason,
        metadata={"from_stage": old_stage, "to_stage": new_stage},
    )

    await db.commit()
    await db.refresh(account)
    return account


# =============================================================================
# DNP WORKFLOW
# =============================================================================


async def send_dnp_notice(
    db: AsyncSession,
    account_id: int,
    reason: str,
    requested_by: str,
) -> CollectionsApprovalQueue:
    """
    Queue DNP notice for human approval.
    Enforces PUC 10-day rule — sets dnp_eligible_after.
    """
    account = await get_account(db, account_id)
    if not account:
        raise ValueError(f"Account {account_id} not found")

    # PUC rule: notice must be sent 10 days before disconnect
    eligible_after = date.today() + timedelta(days=10)
    account.dnp_notice_sent_at = datetime.utcnow()
    account.dnp_eligible_after = eligible_after

    case_data = {
        "customer_name": account.customer_name,
        "esiid": account.esiid,
        "account_number": account.account_number,
        "total_due": account.total_due,
        "days_overdue": account.days_overdue,
        "track": account.track,
        "stage": account.stage,
        "dnp_eligible_after": str(eligible_after),
        "puc_rule": "PUCT Subst. R. 25.480 — 10-day advance notice required",
    }

    approval = CollectionsApprovalQueue(
        account_id=account_id,
        action_type=ApprovalActionType.SEND_DNP_NOTICE,
        case_summary=(
            f"{account.customer_name} (ESIID: {account.esiid}) is {account.days_overdue} days overdue "
            f"with ${account.total_due:,.2f} outstanding. Requesting DNP notice. "
            f"Per PUC rules, disconnect cannot occur before {eligible_after}."
        ),
        case_data=case_data,
        recommended_action=f"Send DNP notice today. Earliest disconnect date: {eligible_after}.",
        risk_level=DelinquencyTier.HIGH,
        puc_compliant=True,
        puc_notes=f"10-day notice rule satisfied if sent today. Eligible after: {eligible_after}",
        expires_at=datetime.utcnow() + timedelta(hours=24),
        created_by=requested_by,
    )
    db.add(approval)

    await _write_timeline(
        db=db,
        account_id=account_id,
        actor_type=ActorType.HUMAN,
        actor_name=requested_by,
        event_type=EventType.APPROVAL_REQUESTED,
        subject="DNP notice queued for approval",
        body=reason,
        metadata={"action": "SEND_DNP_NOTICE", "eligible_after": str(eligible_after)},
    )

    await db.commit()
    await db.refresh(approval)
    return approval


async def execute_dnp(
    db: AsyncSession,
    account_id: int,
    executed_by: str,
    notes: Optional[str] = None,
) -> CollectionsAccount:
    """
    Execute DNP — HUMAN ONLY. Checks PUC eligibility date first.
    """
    account = await get_account(db, account_id)
    if not account:
        raise ValueError(f"Account {account_id} not found")

    # Hard PUC check
    if account.dnp_eligible_after and date.today() < account.dnp_eligible_after:
        raise ValueError(
            f"PUC violation: DNP cannot be executed until {account.dnp_eligible_after}. "
            f"Today is {date.today()}."
        )

    account.is_dnp_active = True
    account.dnp_executed_at = datetime.utcnow()
    account.dnp_executed_by = executed_by
    account.stage = CollectionStage.DNP_ACTIVE
    account.stage_entered_at = datetime.utcnow()
    account.updated_at = datetime.utcnow()

    await _write_timeline(
        db=db,
        account_id=account_id,
        actor_type=ActorType.HUMAN,
        actor_name=executed_by,
        event_type=EventType.DNP_EXECUTED,
        subject="DNP executed — power temporarily disconnected",
        body=notes or "DNP executed by staff.",
        metadata={"executed_by": executed_by, "date": str(date.today())},
    )

    await db.commit()
    await db.refresh(account)
    return account


# =============================================================================
# APPROVAL QUEUE
# =============================================================================


async def get_pending_approvals(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
    risk_level: Optional[str] = None,
    action_type: Optional[str] = None,
) -> tuple[int, list]:
    filters = [
        CollectionsApprovalQueue.status == ApprovalStatus.PENDING,
        CollectionsApprovalQueue.expires_at > datetime.utcnow(),
    ]
    if risk_level:
        filters.append(CollectionsApprovalQueue.risk_level == risk_level)
    if action_type:
        filters.append(CollectionsApprovalQueue.action_type == action_type)

    where = and_(*filters)
    total = (
        await db.execute(select(func.count(CollectionsApprovalQueue.id)).where(where))
    ).scalar() or 0

    rows = (
        (
            await db.execute(
                select(CollectionsApprovalQueue)
                .where(where)
                .order_by(
                    desc(CollectionsApprovalQueue.risk_level),
                    CollectionsApprovalQueue.created_at,
                )
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        .scalars()
        .all()
    )

    return total, rows


async def review_approval(
    db: AsyncSession,
    approval_id: int,
    decision: str,
    reviewed_by: str,
    reviewer_notes: Optional[str] = None,
) -> CollectionsApprovalQueue:
    result = await db.execute(
        select(CollectionsApprovalQueue).where(
            CollectionsApprovalQueue.id == approval_id
        )
    )
    approval = result.scalar_one_or_none()
    if not approval:
        raise ValueError(f"Approval {approval_id} not found")
    if approval.status != ApprovalStatus.PENDING:
        raise ValueError(f"Approval already {approval.status}")

    approval.status = decision
    approval.reviewed_by = reviewed_by
    approval.reviewed_at = datetime.utcnow()
    approval.reviewer_notes = reviewer_notes

    event = (
        EventType.APPROVAL_GRANTED
        if decision == "APPROVED"
        else EventType.APPROVAL_DENIED
    )

    await _write_timeline(
        db=db,
        account_id=approval.account_id,
        actor_type=ActorType.HUMAN,
        actor_name=reviewed_by,
        event_type=event,
        subject=f"Approval {decision.lower()}: {approval.action_type}",
        body=reviewer_notes or "",
        metadata={"approval_id": approval_id, "action_type": approval.action_type},
    )

    await db.commit()
    await db.refresh(approval)
    return approval


# =============================================================================
# TIMELINE
# =============================================================================


async def get_timeline(
    db: AsyncSession,
    account_id: int,
    limit: int = 50,
) -> list:
    result = await db.execute(
        select(CollectionsTimeline)
        .where(CollectionsTimeline.account_id == account_id)
        .order_by(desc(CollectionsTimeline.created_at))
        .limit(limit)
    )
    return result.scalars().all()


async def add_note(
    db: AsyncSession,
    account_id: int,
    note: str,
    added_by: str,
    actor_type: ActorType = ActorType.HUMAN,
) -> CollectionsTimeline:
    entry = await _write_timeline(
        db=db,
        account_id=account_id,
        actor_type=actor_type,
        actor_name=added_by,
        event_type=EventType.NOTE_ADDED,
        subject="Note added",
        body=note,
    )
    await db.commit()
    return entry


# =============================================================================
# ARR / REPORTING
# =============================================================================


async def get_arr_exposure(db: AsyncSession) -> list:
    result = await db.execute(
        text("SELECT * FROM v_arr_exposure ORDER BY total_at_risk DESC")
    )
    return [dict(row._mapping) for row in result]


async def get_aging_buckets(db: AsyncSession) -> list:
    result = await db.execute(text("SELECT * FROM v_aging_buckets"))
    return [dict(row._mapping) for row in result]


async def get_etf_open(db: AsyncSession) -> list:
    result = await db.execute(text("SELECT * FROM v_etf_open LIMIT 100"))
    return [dict(row._mapping) for row in result]


async def get_dashboard_summary(db: AsyncSession) -> dict:
    total_q = await db.execute(
        select(func.count(CollectionsAccount.id)).where(
            CollectionsAccount.is_paid == False
        )
    )
    total = total_q.scalar() or 0

    at_risk_q = await db.execute(
        select(func.sum(CollectionsAccount.total_due)).where(
            CollectionsAccount.is_paid == False
        )
    )
    at_risk = at_risk_q.scalar() or 0.0

    active_q = await db.execute(
        select(func.count(CollectionsAccount.id)).where(
            CollectionsAccount.track == "ACTIVE", CollectionsAccount.is_paid == False
        )
    )
    inactive_q = await db.execute(
        select(func.count(CollectionsAccount.id)).where(
            CollectionsAccount.track == "INACTIVE", CollectionsAccount.is_paid == False
        )
    )
    pending_q = await db.execute(
        select(func.count(CollectionsApprovalQueue.id)).where(
            CollectionsApprovalQueue.status == "PENDING",
            CollectionsApprovalQueue.expires_at > datetime.utcnow(),
        )
    )
    etf_q = await db.execute(
        select(func.count(CollectionsAccount.id)).where(
            CollectionsAccount.etf_flag == True, CollectionsAccount.is_paid == False
        )
    )
    critical_q = await db.execute(
        select(func.count(CollectionsAccount.id)).where(
            CollectionsAccount.delinquency_tier == "CRITICAL",
            CollectionsAccount.is_paid == False,
        )
    )

    # Resolved this month
    first_of_month = date.today().replace(day=1)
    resolved_q = await db.execute(
        select(func.count(CollectionsAccount.id)).where(
            CollectionsAccount.resolved_at >= first_of_month
        )
    )

    aging = await get_aging_buckets(db)

    # By stage counts
    stage_q = await db.execute(
        select(
            CollectionsAccount.stage,
            func.count(CollectionsAccount.id),
            func.sum(CollectionsAccount.total_due),
        )
        .where(CollectionsAccount.is_paid == False)
        .group_by(CollectionsAccount.stage)
    )
    by_stage = [
        {"stage": r[0], "count": r[1], "total_due": float(r[2] or 0)} for r in stage_q
    ]

    return {
        "total_accounts": total,
        "total_at_risk": float(at_risk),
        "active_track_count": active_q.scalar() or 0,
        "inactive_track_count": inactive_q.scalar() or 0,
        "pending_approvals": pending_q.scalar() or 0,
        "etf_open_count": etf_q.scalar() or 0,
        "critical_accounts": critical_q.scalar() or 0,
        "resolved_this_month": resolved_q.scalar() or 0,
        "aging": aging,
        "by_stage": by_stage,
    }


# =============================================================================
# ETF
# =============================================================================


async def update_etf_status(
    db: AsyncSession,
    account_id: int,
    new_status: str,
    updated_by: str,
    notes: Optional[str] = None,
    amount: Optional[float] = None,
) -> CollectionsAccount:
    account = await get_account(db, account_id)
    if not account:
        raise ValueError(f"Account {account_id} not found")

    account.etf_status = new_status
    if new_status == "WAIVED":
        account.etf_flag = False
        event = EventType.ETF_WAIVED
    elif new_status == "COLLECTED":
        account.etf_flag = False
        if amount:
            account.amount_paid += amount
        event = EventType.ETF_COLLECTED
    else:
        event = EventType.ETF_NEGOTIATION_STARTED

    account.total_due = account.usage_balance + (
        account.etf_amount if new_status not in ("WAIVED", "COLLECTED") else 0
    )
    account.updated_at = datetime.utcnow()

    await _write_timeline(
        db=db,
        account_id=account_id,
        actor_type=ActorType.HUMAN,
        actor_name=updated_by,
        event_type=event,
        subject=f"ETF status updated to {new_status}",
        body=notes or "",
        metadata={"new_status": new_status, "amount": amount},
    )

    await db.commit()
    await db.refresh(account)
    return account


# =============================================================================
# AR IMPORT (weekly sheet)
# =============================================================================


async def process_ar_import(
    db: AsyncSession,
    rows: list,
    uploaded_by: str,
) -> dict:
    """
    Process weekly AR summary sheet.
    Creates new accounts or updates existing ones by ESIID.
    Does not overwrite stage or timeline — only updates balances + days_overdue.
    """
    stats = {"created": 0, "updated": 0, "skipped": 0, "errors": []}

    for i, row in enumerate(rows):
        try:
            esiid = str(row.get("esiid", "")).strip()
            if not esiid:
                stats["skipped"] += 1
                continue

            existing = await get_account_by_esiid(db, esiid)

            if existing:
                # Update balances only — preserve stage and timeline
                existing.usage_balance = float(
                    row.get("usage_balance", existing.usage_balance)
                )
                existing.days_overdue = int(
                    row.get("days_overdue", existing.days_overdue)
                )
                existing.total_due = existing.usage_balance + (
                    existing.etf_amount
                    if existing.etf_status not in ("WAIVED", "COLLECTED")
                    else 0
                )
                existing.delinquency_score = _calc_score(
                    existing.days_overdue, existing.total_due, existing.track
                )
                existing.delinquency_tier = _score_to_tier(existing.delinquency_score)
                existing.updated_at = datetime.utcnow()
                stats["updated"] += 1

            else:
                # Determine track from stage
                stage = str(row.get("stage", "EMAIL_OUTREACH")).upper()
                track = (
                    "ACTIVE"
                    if stage in ("REMINDER", "DNP_NOTICE", "DNP_ACTIVE")
                    else "INACTIVE"
                )

                new_account = CollectionsAccount(
                    customer_name=str(row.get("customer_name", "")),
                    account_number=str(row.get("account_number", esiid)),
                    esiid=esiid,
                    premise_address=str(row.get("premise_address", "")),
                    track=track,
                    stage=stage,
                    usage_balance=float(row.get("usage_balance", 0)),
                    etf_amount=float(row.get("etf_amount", 0)),
                    days_overdue=int(row.get("days_overdue", 0)),
                    due_date=date.today(),
                    broker_name=row.get("broker_name"),
                )
                new_account.total_due = (
                    new_account.usage_balance + new_account.etf_amount
                )
                new_account.delinquency_score = _calc_score(
                    new_account.days_overdue, new_account.total_due, track
                )
                new_account.delinquency_tier = _score_to_tier(
                    new_account.delinquency_score
                )
                db.add(new_account)
                stats["created"] += 1

        except Exception as e:
            stats["errors"].append(
                {"row": i + 2, "esiid": row.get("esiid", ""), "error": str(e)}
            )
            logger.warning(f"AR import row {i+2} error: {e}")

    await db.commit()
    return stats


# =============================================================================
# HELPERS
# =============================================================================


def _calc_score(days_overdue: int, amount: float, track: str) -> int:
    if days_overdue <= 10:
        days_score = 5
    elif days_overdue <= 30:
        days_score = 15
    elif days_overdue <= 60:
        days_score = 30
    elif days_overdue <= 90:
        days_score = 40
    else:
        days_score = 50

    if amount <= 500:
        amt_score = 5
    elif amount <= 2000:
        amt_score = 10
    elif amount <= 5000:
        amt_score = 20
    elif amount <= 10000:
        amt_score = 25
    else:
        amt_score = 30

    track_score = 20 if track == "INACTIVE" else 10
    return days_score + amt_score + track_score


def _score_to_tier(score: int) -> str:
    if score >= 80:
        return "CRITICAL"
    elif score >= 60:
        return "HIGH"
    elif score >= 35:
        return "MEDIUM"
    else:
        return "LOW"


async def _write_timeline(
    db: AsyncSession,
    account_id: int,
    actor_type: ActorType,
    actor_name: str,
    event_type: EventType,
    subject: Optional[str] = None,
    body: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> CollectionsTimeline:
    entry = CollectionsTimeline(
        account_id=account_id,
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
