# =============================================================================
# schemas/collections.py
# =============================================================================

from pydantic import BaseModel, Field
from typing import Optional, List, Any
from datetime import date, datetime
from enum import Enum


# ── Enums ─────────────────────────────────────────────────────────────────────


class CollectionTrack(str, Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"


class CollectionStage(str, Enum):
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


class DelinquencyTier(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class ETFStatus(str, Enum):
    NONE = "NONE"
    PENDING = "PENDING"
    NEGOTIATING = "NEGOTIATING"
    WAIVED = "WAIVED"
    COLLECTED = "COLLECTED"


class Priority(str, Enum):
    LOW = "LOW"
    NORMAL = "NORMAL"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class ApprovalStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    DENIED = "DENIED"
    EXPIRED = "EXPIRED"
    CANCELLED = "CANCELLED"


class ApprovalActionType(str, Enum):
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


# ── Account ───────────────────────────────────────────────────────────────────


class CollectionsAccountCreate(BaseModel):
    customer_name: str
    account_number: str
    esiid: str
    premise_address: str = ""
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    track: CollectionTrack
    stage: CollectionStage
    usage_balance: float = 0.0
    etf_amount: float = 0.0
    due_date: date
    invoice_number: Optional[str] = None
    broker_id: Optional[int] = None
    broker_name: Optional[str] = None
    assigned_to: Optional[str] = None
    priority: Priority = Priority.NORMAL


class CollectionsAccountUpdate(BaseModel):
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    stage: Optional[CollectionStage] = None
    usage_balance: Optional[float] = None
    etf_amount: Optional[float] = None
    etf_status: Optional[ETFStatus] = None
    days_overdue: Optional[int] = None
    assigned_to: Optional[str] = None
    priority: Optional[Priority] = None
    is_flagged: Optional[bool] = None
    flag_reason: Optional[str] = None
    is_disputed: Optional[bool] = None
    notes: Optional[str] = None


class CollectionsAccountResponse(BaseModel):
    id: int
    customer_name: str
    account_number: str
    esiid: str
    premise_address: str
    customer_email: Optional[str]
    customer_phone: Optional[str]
    broker_id: Optional[int]
    broker_name: Optional[str]
    track: str
    stage: str
    usage_balance: float
    etf_amount: float
    etf_status: str
    etf_flag: bool
    total_due: float
    amount_paid: float
    last_payment_date: Optional[date]
    last_payment_amount: Optional[float]
    days_overdue: int
    due_date: date
    delinquency_score: int
    delinquency_tier: str
    is_paid: bool
    is_legal: bool
    is_dnp_active: bool
    is_mvo: bool
    is_disputed: bool
    is_payment_plan: bool
    is_flagged: bool
    flag_reason: Optional[str]
    dnp_notice_sent_at: Optional[datetime]
    dnp_eligible_after: Optional[date]
    assigned_to: Optional[str]
    priority: str
    demand_letter_type: str
    demand_letter_sent_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    resolved_at: Optional[datetime]

    class Config:
        from_attributes = True


class CollectionsAccountListRow(BaseModel):
    """Compact row for list/dashboard views"""

    id: int
    customer_name: str
    account_number: str
    esiid: str
    track: str
    stage: str
    total_due: float
    usage_balance: float
    etf_amount: float
    etf_flag: bool
    days_overdue: int
    delinquency_tier: str
    is_paid: bool
    is_legal: bool
    is_dnp_active: bool
    is_flagged: bool
    broker_name: Optional[str]
    assigned_to: Optional[str]
    priority: str
    created_at: datetime

    class Config:
        from_attributes = True


class CollectionsListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    results: List[CollectionsAccountListRow]


# ── Timeline ──────────────────────────────────────────────────────────────────


class TimelineEntryResponse(BaseModel):
    id: int
    account_id: int
    actor_type: str
    actor_name: str
    event_type: str
    subject: Optional[str]
    body: Optional[str]
    event_metadata: Optional[Any]
    created_at: datetime

    class Config:
        from_attributes = True


class AddNoteRequest(BaseModel):
    note: str = Field(..., min_length=1)
    is_internal: bool = True


# ── Stage change ──────────────────────────────────────────────────────────────


class StageChangeRequest(BaseModel):
    new_stage: CollectionStage
    reason: str = Field(..., min_length=1)


# ── ETF ───────────────────────────────────────────────────────────────────────


class ETFDetailResponse(BaseModel):
    id: int
    account_id: int
    original_amount: float
    current_amount: float
    collected_amount: float
    contract_end_date: Optional[date]
    actual_end_date: Optional[date]
    months_remaining: Optional[int]
    status: str
    negotiation_log: Optional[Any]
    waived_by: Optional[str]
    waived_at: Optional[datetime]
    waived_reason: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class ETFNegotiationUpdate(BaseModel):
    offered_amount: float = Field(..., ge=0)
    notes: Optional[str] = None


# ── Approval Queue ────────────────────────────────────────────────────────────


class ApprovalQueueResponse(BaseModel):
    id: int
    account_id: int
    action_type: str
    case_summary: str
    case_data: Any
    recommended_action: Optional[str]
    risk_level: str
    puc_compliant: Optional[bool]
    puc_notes: Optional[str]
    status: str
    reviewed_by: Optional[str]
    reviewed_at: Optional[datetime]
    reviewer_notes: Optional[str]
    expires_at: datetime
    created_by: str
    created_at: datetime
    # Joined account fields
    customer_name: Optional[str] = None
    esiid: Optional[str] = None
    track: Optional[str] = None
    stage: Optional[str] = None
    total_due: Optional[float] = None
    days_overdue: Optional[int] = None
    delinquency_tier: Optional[str] = None
    broker_name: Optional[str] = None

    class Config:
        from_attributes = True


class ApprovalReviewRequest(BaseModel):
    decision: ApprovalStatus  # APPROVED or DENIED
    reviewer_notes: Optional[str] = None


class RequestApprovalRequest(BaseModel):
    action_type: ApprovalActionType
    case_summary: str
    recommended_action: Optional[str] = None
    risk_level: DelinquencyTier = DelinquencyTier.MEDIUM
    expires_hours: int = 24


# ── ARR / Reporting ───────────────────────────────────────────────────────────


class ARRExposureRow(BaseModel):
    track: str
    stage: str
    delinquency_tier: str
    account_count: int
    total_usage_due: float
    total_etf_due: float
    total_at_risk: float
    etf_open_count: int
    avg_days_overdue: float
    max_days_overdue: int


class AgingBucketRow(BaseModel):
    track: str
    bucket_1_30: float
    bucket_31_60: float
    bucket_61_90: float
    bucket_91_120: float
    bucket_120_plus: float
    total_due: float
    account_count: int


class CollectionsDashboardSummary(BaseModel):
    total_accounts: int
    total_at_risk: float
    active_track_count: int
    inactive_track_count: int
    pending_approvals: int
    etf_open_count: int
    critical_accounts: int
    resolved_this_month: int
    aging: List[AgingBucketRow]
    by_stage: List[dict]


# ── DNP specific ──────────────────────────────────────────────────────────────


class DNPNoticeRequest(BaseModel):
    """Staff confirms they want to queue a DNP notice for approval"""

    reason: str = Field(..., min_length=1)


class DNPExecuteRequest(BaseModel):
    """Human executes DNP after approval — irreversible"""

    confirmed: bool = Field(..., description="Must be True to execute")
    executed_by: str
    notes: Optional[str] = None


# ── Demand Letter ─────────────────────────────────────────────────────────────


class DemandLetterRequest(BaseModel):
    letter_type: str  # WITH_ETF or WITHOUT_ETF
    notes: Optional[str] = None


# ── Import (AR sheet) ─────────────────────────────────────────────────────────


class ARImportRow(BaseModel):
    row_number: int
    esiid: str
    account_number: Optional[str]
    customer_name: str
    track: str
    stage: str
    total_due: float
    usage_balance: float
    days_overdue: int
    action: str  # CREATE | UPDATE | SKIP | ERROR
    warning: Optional[str]
    error: Optional[str]


class ARImportPreviewResponse(BaseModel):
    import_id: int
    filename: str
    total_rows: int
    create_count: int
    update_count: int
    skip_count: int
    error_count: int
    rows: List[ARImportRow]


class ARImportCommitResponse(BaseModel):
    import_id: int
    status: str
    created: int
    updated: int
    skipped: int
    errors: List[dict]
