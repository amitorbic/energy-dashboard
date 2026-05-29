from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    DateTime,
    Date,
    Text,
    Boolean,
    JSON,
    SmallInteger,
    Enum as SAEnum,
    ForeignKey,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from utils.database import Base
import enum


# =============================================================================
# ENUMS
# =============================================================================


class CollectionTrack(str, enum.Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"


class CollectionStage(str, enum.Enum):
    REMINDER = "REMINDER"
    DNP_NOTICE = "DNP_NOTICE"
    DNP_ACTIVE = "DNP_ACTIVE"
    MVO = "MVO"
    EMAIL_OUTREACH = "EMAIL_OUTREACH"
    CHASING = "CHASING"
    DEMAND_SENT = "DEMAND_SENT"
    IN_LEGAL = "IN_LEGAL"
    RESOLVED = "RESOLVED"
    WRITTEN_OFF = "WRITTEN_OFF"


class DelinquencyTier(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class ETFStatus(str, enum.Enum):
    NONE = "NONE"
    PENDING = "PENDING"
    NEGOTIATING = "NEGOTIATING"
    WAIVED = "WAIVED"
    COLLECTED = "COLLECTED"


class DemandLetterType(str, enum.Enum):
    NONE = "NONE"
    WITH_ETF = "WITH_ETF"
    WITHOUT_ETF = "WITHOUT_ETF"


class Priority(str, enum.Enum):
    LOW = "LOW"
    NORMAL = "NORMAL"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class ActorType(str, enum.Enum):
    HUMAN = "HUMAN"
    LLM_AGENT = "LLM_AGENT"
    SYSTEM = "SYSTEM"


class EventType(str, enum.Enum):
    EMAIL_SENT = "EMAIL_SENT"
    EMAIL_BOUNCED = "EMAIL_BOUNCED"
    CALL_MADE = "CALL_MADE"
    CALL_ATTEMPTED = "CALL_ATTEMPTED"
    LETTER_SENT = "LETTER_SENT"
    PAYMENT_RECEIVED = "PAYMENT_RECEIVED"
    PAYMENT_PARTIAL = "PAYMENT_PARTIAL"
    PAYMENT_BOUNCED = "PAYMENT_BOUNCED"
    PAYMENT_PLAN_OFFERED = "PAYMENT_PLAN_OFFERED"
    PAYMENT_PLAN_ACCEPTED = "PAYMENT_PLAN_ACCEPTED"
    PAYMENT_PLAN_MISSED = "PAYMENT_PLAN_MISSED"
    STAGE_CHANGED = "STAGE_CHANGED"
    TRACK_CHANGED = "TRACK_CHANGED"
    DNP_NOTICE_SENT = "DNP_NOTICE_SENT"
    DNP_EXECUTED = "DNP_EXECUTED"
    DNP_RESTORED = "DNP_RESTORED"
    MVO_EXECUTED = "MVO_EXECUTED"
    DEMAND_LETTER_SENT = "DEMAND_LETTER_SENT"
    LEGAL_FILED = "LEGAL_FILED"
    ETF_FLAGGED = "ETF_FLAGGED"
    ETF_NEGOTIATION_STARTED = "ETF_NEGOTIATION_STARTED"
    ETF_WAIVED = "ETF_WAIVED"
    ETF_COLLECTED = "ETF_COLLECTED"
    BROKER_NOTIFIED = "BROKER_NOTIFIED"
    BROKER_RESPONDED = "BROKER_RESPONDED"
    AGENT_NOTE = "AGENT_NOTE"
    AGENT_ESCALATION = "AGENT_ESCALATION"
    APPROVAL_REQUESTED = "APPROVAL_REQUESTED"
    APPROVAL_GRANTED = "APPROVAL_GRANTED"
    APPROVAL_DENIED = "APPROVAL_DENIED"
    ACCOUNT_FLAGGED = "ACCOUNT_FLAGGED"
    ACCOUNT_DISPUTED = "ACCOUNT_DISPUTED"
    ACCOUNT_RESOLVED = "ACCOUNT_RESOLVED"
    ACCOUNT_WRITTEN_OFF = "ACCOUNT_WRITTEN_OFF"
    NOTE_ADDED = "NOTE_ADDED"


class ApprovalActionType(str, enum.Enum):
    SEND_DNP_NOTICE = "SEND_DNP_NOTICE"
    EXECUTE_DNP = "EXECUTE_DNP"
    EXECUTE_MVO = "EXECUTE_MVO"
    SEND_DEMAND_LETTER = "SEND_DEMAND_LETTER"
    MOVE_TO_LEGAL = "MOVE_TO_LEGAL"
    OFFER_PAYMENT_PLAN = "OFFER_PAYMENT_PLAN"
    WAIVE_ETF = "WAIVE_ETF"
    APPLY_LATE_FEE = "APPLY_LATE_FEE"
    WRITE_OFF_ACCOUNT = "WRITE_OFF_ACCOUNT"
    CONTACT_BROKER = "CONTACT_BROKER"
    OVERRIDE_ESCALATION_RULE = "OVERRIDE_ESCALATION_RULE"


class ApprovalStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    DENIED = "DENIED"
    EXPIRED = "EXPIRED"
    CANCELLED = "CANCELLED"


class PlanStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    PENDING_APPROVAL = "PENDING_APPROVAL"
    APPROVED = "APPROVED"
    OFFERED = "OFFERED"
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"
    DEFAULTED = "DEFAULTED"
    CANCELLED = "CANCELLED"


# =============================================================================
# COLLECTIONS ACCOUNT
# =============================================================================


class CollectionsAccount(Base):
    __tablename__ = "collections_accounts"

    id = Column(Integer, primary_key=True, index=True)
    customer_name = Column(String(255), nullable=False)
    account_number = Column(String(100), nullable=False, index=True)
    esiid = Column(String(30), nullable=False, index=True)
    premise_address = Column(String(500), nullable=False, default="")
    customer_email = Column(String(255), nullable=True)
    customer_phone = Column(String(50), nullable=True)
    broker_id = Column(Integer, nullable=True)
    broker_name = Column(String(255), nullable=True)
    broker_notified_at = Column(DateTime, nullable=True)
    broker_last_contact = Column(DateTime, nullable=True)
    track = Column(SAEnum(CollectionTrack), nullable=False)
    stage = Column(SAEnum(CollectionStage), nullable=False)
    stage_entered_at = Column(DateTime, server_default=func.now())
    stage_updated_by = Column(String(100), nullable=True)
    usage_balance = Column(Float, nullable=False, default=0.0)
    usage_balance_updated = Column(DateTime, nullable=True)
    etf_amount = Column(Float, nullable=False, default=0.0)
    etf_status = Column(SAEnum(ETFStatus), nullable=False, default=ETFStatus.NONE)
    etf_flag = Column(Boolean, nullable=False, default=False)
    etf_notes = Column(Text, nullable=True)
    total_due = Column(Float, nullable=False, default=0.0)
    amount_paid = Column(Float, nullable=False, default=0.0)
    last_payment_date = Column(Date, nullable=True)
    last_payment_amount = Column(Float, nullable=True)
    days_overdue = Column(Integer, nullable=False, default=0)
    due_date = Column(Date, nullable=False, default=func.current_date())
    invoice_date = Column(Date, nullable=True)
    invoice_number = Column(String(100), nullable=True)
    delinquency_score = Column(Integer, nullable=False, default=0)
    delinquency_tier = Column(
        SAEnum(DelinquencyTier), nullable=False, default=DelinquencyTier.LOW
    )
    is_paid = Column(Boolean, nullable=False, default=False)
    is_legal = Column(Boolean, nullable=False, default=False)
    is_dnp_active = Column(Boolean, nullable=False, default=False)
    is_mvo = Column(Boolean, nullable=False, default=False)
    is_disputed = Column(Boolean, nullable=False, default=False)
    is_payment_plan = Column(Boolean, nullable=False, default=False)
    is_flagged = Column(Boolean, nullable=False, default=False)
    flag_reason = Column(String(255), nullable=True)
    dnp_notice_sent_at = Column(DateTime, nullable=True)
    dnp_eligible_after = Column(Date, nullable=True)
    dnp_executed_at = Column(DateTime, nullable=True)
    dnp_executed_by = Column(String(100), nullable=True)
    assigned_to = Column(String(100), nullable=True)
    priority = Column(SAEnum(Priority), nullable=False, default=Priority.NORMAL)
    demand_letter_type = Column(
        SAEnum(DemandLetterType), nullable=False, default=DemandLetterType.NONE
    )
    demand_letter_sent_at = Column(DateTime, nullable=True)
    demand_letter_sent_by = Column(String(100), nullable=True)
    demand_letter_path = Column(String(500), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    resolved_at = Column(DateTime, nullable=True)
    written_off_at = Column(DateTime, nullable=True)
    written_off_by = Column(String(100), nullable=True)
    written_off_amount = Column(Float, nullable=True)

    timeline = relationship(
        "CollectionsTimeline", back_populates="account", cascade="all, delete-orphan"
    )
    etf_detail = relationship(
        "CollectionsETF",
        back_populates="account",
        uselist=False,
        cascade="all, delete-orphan",
    )
    payment_plans = relationship(
        "CollectionsPaymentPlan", back_populates="account", cascade="all, delete-orphan"
    )
    approval_queue = relationship(
        "CollectionsApprovalQueue",
        back_populates="account",
        cascade="all, delete-orphan",
    )
    payments = relationship("Payment", back_populates="collections_account")


# =============================================================================
# ACTIVITY TIMELINE
# =============================================================================


class CollectionsTimeline(Base):
    __tablename__ = "collections_timeline"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(
        Integer, ForeignKey("collections_accounts.id"), nullable=False, index=True
    )
    actor_type = Column(SAEnum(ActorType), nullable=False)
    actor_name = Column(String(100), nullable=False)
    event_type = Column(SAEnum(EventType), nullable=False, index=True)
    subject = Column(String(500), nullable=True)
    body = Column(Text, nullable=True)
    event_metadata = Column(JSON, nullable=True)
    approval_queue_id = Column(Integer, nullable=True)
    payment_plan_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), index=True)

    account = relationship("CollectionsAccount", back_populates="timeline")


# =============================================================================
# ETF DETAIL
# =============================================================================


class CollectionsETF(Base):
    __tablename__ = "collections_etf"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(
        Integer, ForeignKey("collections_accounts.id"), nullable=False, unique=True
    )
    original_amount = Column(Float, nullable=False)
    current_amount = Column(Float, nullable=False)
    collected_amount = Column(Float, nullable=False, default=0.0)
    contract_end_date = Column(Date, nullable=True)
    actual_end_date = Column(Date, nullable=True)
    months_remaining = Column(Integer, nullable=True)
    status = Column(SAEnum(ETFStatus), nullable=False, default=ETFStatus.PENDING)
    negotiation_log = Column(JSON, nullable=True)
    waived_by = Column(String(100), nullable=True)
    waived_at = Column(DateTime, nullable=True)
    waived_reason = Column(Text, nullable=True)
    collected_by = Column(String(100), nullable=True)
    collected_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    account = relationship("CollectionsAccount", back_populates="etf_detail")


# =============================================================================
# PAYMENT PLAN
# =============================================================================


class CollectionsPaymentPlan(Base):
    __tablename__ = "collections_payment_plans"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("collections_accounts.id"), nullable=False)
    total_amount = Column(Float, nullable=False)
    num_installments = Column(SmallInteger, nullable=False)
    installment_amount = Column(Float, nullable=False)
    frequency = Column(String(20), nullable=False, default="MONTHLY")
    first_payment_due = Column(Date, nullable=True)
    next_due_date = Column(Date, nullable=True)
    calculated_by = Column(String(100), nullable=False, default="llm_agent")
    calculated_at = Column(DateTime, server_default=func.now())
    llm_reasoning = Column(Text, nullable=True)
    approved_by = Column(String(100), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    offered_to_customer_at = Column(DateTime, nullable=True)
    accepted_by_customer_at = Column(DateTime, nullable=True)
    status = Column(SAEnum(PlanStatus), nullable=False, default=PlanStatus.DRAFT)
    installments = Column(JSON, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    account = relationship("CollectionsAccount", back_populates="payment_plans")


# =============================================================================
# APPROVAL QUEUE
# =============================================================================


class CollectionsApprovalQueue(Base):
    __tablename__ = "collections_approval_queue"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(
        Integer, ForeignKey("collections_accounts.id"), nullable=False, index=True
    )
    action_type = Column(SAEnum(ApprovalActionType), nullable=False, index=True)
    case_summary = Column(Text, nullable=False)
    case_data = Column(JSON, nullable=False)
    recommended_action = Column(Text, nullable=True)
    risk_level = Column(
        SAEnum(DelinquencyTier), nullable=False, default=DelinquencyTier.MEDIUM
    )
    puc_compliant = Column(Boolean, nullable=True)
    puc_notes = Column(Text, nullable=True)
    status = Column(
        SAEnum(ApprovalStatus),
        nullable=False,
        default=ApprovalStatus.PENDING,
        index=True,
    )
    reviewed_by = Column(String(100), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    reviewer_notes = Column(Text, nullable=True)
    expires_at = Column(DateTime, nullable=False)
    created_by = Column(String(100), nullable=False, default="llm_agent")
    created_at = Column(DateTime, server_default=func.now(), index=True)

    account = relationship("CollectionsAccount", back_populates="approval_queue")


# =============================================================================
# ESCALATION RULES
# =============================================================================


class CollectionsEscalationRule(Base):
    __tablename__ = "collections_escalation_rules"

    id = Column(Integer, primary_key=True, index=True)
    rule_name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    applies_to_track = Column(String(20), nullable=False, default="BOTH")
    min_days_overdue = Column(Integer, nullable=True)
    max_days_overdue = Column(Integer, nullable=True)
    min_amount = Column(Float, nullable=True)
    max_amount = Column(Float, nullable=True)
    from_stage = Column(String(50), nullable=True)
    action_type = Column(String(100), nullable=False)
    auto_execute = Column(Boolean, nullable=False, default=False)
    priority_override = Column(String(20), nullable=True)
    is_puc_rule = Column(Boolean, nullable=False, default=False)
    puc_rule_reference = Column(String(255), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_by = Column(String(100), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


# =============================================================================
# AGENT TOOLS
# =============================================================================


class CollectionsAgentTool(Base):
    __tablename__ = "collections_agent_tools"

    id = Column(Integer, primary_key=True, index=True)
    tool_name = Column(String(100), nullable=False, unique=True)
    description = Column(Text, nullable=False)
    applies_to_track = Column(String(20), nullable=False, default="BOTH")
    is_enabled = Column(Boolean, nullable=False, default=True)
    requires_approval = Column(Boolean, nullable=False, default=True)
    is_irreversible = Column(Boolean, nullable=False, default=False)
    human_only = Column(Boolean, nullable=False, default=False)
    audit_required = Column(Boolean, nullable=False, default=True)
    max_calls_per_account = Column(SmallInteger, nullable=False, default=1)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
