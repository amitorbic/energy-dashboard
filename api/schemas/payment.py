# =============================================================================
# payments/schemas.py
# Pydantic v2 request/response schemas
# =============================================================================

from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Any
from datetime import date, datetime
from decimal import Decimal
from enum import Enum


# ── Enums (mirror models) ─────────────────────────────────────────────────────


class PaymentMethod(str, Enum):
    ACH = "ACH"
    CC = "CC"
    CHECK = "CHECK"
    WIRE = "WIRE"
    OTHER = "OTHER"


class PaymentStatus(str, Enum):
    POSTED = "POSTED"
    BOUNCED = "BOUNCED"
    REVERSED = "REVERSED"
    UNDER_REVIEW = "UNDER_REVIEW"


class PaymentSource(str, Enum):
    PAYMENT_SHEET = "PAYMENT_SHEET"
    BILLING_SHEET = "BILLING_SHEET"
    MANUAL = "MANUAL"


class AppliedTo(str, Enum):
    USAGE = "USAGE"
    ETF = "ETF"
    BOTH = "BOTH"


class ImportFileType(str, Enum):
    PAYMENT_SHEET = "PAYMENT_SHEET"
    BILLING_SHEET = "BILLING_SHEET"
    AR_SUMMARY = "AR_SUMMARY"


# ── Manual Payment Entry ──────────────────────────────────────────────────────


class PaymentCreate(BaseModel):
    """Staff manually records a payment"""

    esiid: str = Field(..., min_length=1, max_length=30)
    account_number: Optional[str] = None
    payment_date: date
    received_date: date
    amount: Decimal = Field(..., gt=0, decimal_places=2)
    method: PaymentMethod
    reference_number: Optional[str] = None
    applied_to: AppliedTo = AppliedTo.USAGE
    # If BOTH: specify split. If only USAGE or ETF, full amount goes there.
    applied_to_etf: Optional[Decimal] = Field(default=None, ge=0, decimal_places=2)
    notes: Optional[str] = None

    @field_validator("applied_to_etf")
    @classmethod
    def validate_etf_split(cls, v, info):
        if info.data.get("applied_to") == AppliedTo.BOTH and v is None:
            raise ValueError("applied_to_etf is required when applied_to is BOTH")
        if info.data.get("applied_to") != AppliedTo.BOTH and v is not None and v > 0:
            raise ValueError(
                "applied_to_etf should only be set when applied_to is BOTH"
            )
        return v


class PaymentResponse(BaseModel):
    id: int
    esiid: str
    account_number: Optional[str]
    customer_name: str
    collections_account_id: Optional[int]

    payment_date: date
    received_date: date
    amount: float
    method: PaymentMethod
    reference_number: Optional[str]

    applied_to: AppliedTo
    applied_to_usage: float
    applied_to_etf: float

    balance_before: float
    balance_after: float
    usage_balance_before: float
    usage_balance_after: float
    etf_balance_before: float
    etf_balance_after: float

    triggered_etf_flag: bool
    source: PaymentSource
    import_id: Optional[int]
    entered_by: str

    is_bounced: bool
    bounced_at: Optional[datetime]
    bounce_reason: Optional[str]

    status: PaymentStatus
    notes: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# ── Bounce Recording ──────────────────────────────────────────────────────────


class PaymentBounceUpdate(BaseModel):
    bounce_reason: str = Field(..., min_length=1)
    notes: Optional[str] = None


# ── Import / Upload ───────────────────────────────────────────────────────────


class ImportPreviewRow(BaseModel):
    """One row shown in the pre-commit preview"""

    row_number: int
    esiid: str
    account_number: Optional[str]
    customer_name: str
    payment_date: str
    amount: float
    method: str
    # What will happen
    action: str  # "NEW_PAYMENT" | "UPDATE_BALANCE" | "ETF_FLAG" | "RESOLVE"
    current_balance: Optional[float]
    balance_after: Optional[float]
    etf_flag_will_trigger: bool
    warning: Optional[str]  # e.g. "Account in legal — review before posting"
    error: Optional[str]  # row-level error — will be skipped


class ImportPreviewResponse(BaseModel):
    """Returned after file upload, before commit"""

    import_id: int
    filename: str
    file_type: ImportFileType
    total_rows: int
    valid_rows: int
    error_rows: int
    warning_rows: int
    total_amount: float
    etf_flags_to_trigger: int
    accounts_to_resolve: int
    rows: List[ImportPreviewRow]


class ImportCommitResponse(BaseModel):
    """Returned after confirming the import"""

    import_id: int
    status: str
    rows_processed: int
    rows_skipped: int
    rows_errored: int
    total_payment_amount: float
    accounts_updated: int
    accounts_resolved: int
    etf_flags_triggered: int
    bounced_found: int
    errors: List[dict]


class ImportSummaryResponse(BaseModel):
    id: int
    filename: str
    file_type: ImportFileType
    uploaded_by: str
    uploaded_at: datetime
    status: str
    total_rows: int
    rows_processed: int
    rows_errored: int
    total_payment_amount: float
    accounts_updated: int
    accounts_resolved: int
    etf_flags_triggered: int
    is_rolled_back: bool

    class Config:
        from_attributes = True


# ── Ledger / List views ───────────────────────────────────────────────────────


class PaymentLedgerRow(BaseModel):
    """Compact row for the payments ledger page"""

    id: int
    esiid: str
    customer_name: str
    payment_date: date
    amount: float
    method: PaymentMethod
    applied_to: AppliedTo
    balance_after: float
    usage_balance_after: float
    etf_balance_after: float
    triggered_etf_flag: bool
    status: PaymentStatus
    source: PaymentSource
    entered_by: str
    created_at: datetime

    class Config:
        from_attributes = True


class PaymentListParams(BaseModel):
    """Query params for the payments list endpoint"""

    page: int = 1
    page_size: int = 50
    esiid: Optional[str] = None
    account_number: Optional[str] = None
    customer_name: Optional[str] = None
    status: Optional[PaymentStatus] = None
    source: Optional[PaymentSource] = None
    method: Optional[PaymentMethod] = None
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    bounced_only: bool = False
    etf_flag_only: bool = False


class PaymentListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    results: List[PaymentLedgerRow]


# ── Balance Summary ───────────────────────────────────────────────────────────


class AccountBalanceSummary(BaseModel):
    """What the UI shows in the balance panel for any account"""

    esiid: str
    account_number: Optional[str]
    customer_name: str
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
    last_payment_method: Optional[str]
    last_payment_status: Optional[str]

    days_overdue: int
    delinquency_tier: str

    is_payment_plan: bool
    active_plan_id: Optional[int]
    next_installment_due: Optional[date]
    next_installment_amount: Optional[float]


# ── Payment Plan ──────────────────────────────────────────────────────────────


class PaymentPlanOption(BaseModel):
    """One option the LLM calculated"""

    num_installments: int
    installment_amount: float
    frequency: str
    first_payment_due: date
    total_amount: float
    notes: str  # LLM reasoning for this option


class PaymentPlanCalculateResponse(BaseModel):
    """LLM returns 2-3 options for human to pick from"""

    account_id: int
    usage_balance: float
    etf_amount: float
    etf_flag: bool
    options: List[PaymentPlanOption]
    llm_reasoning: str


class PaymentPlanApprove(BaseModel):
    """Human picks an option and approves"""

    selected_option_index: int = Field(..., ge=0, le=2)
    reviewer_notes: Optional[str] = None


class InstallmentResponse(BaseModel):
    id: int
    installment_number: int
    due_date: date
    amount_due: float
    paid_date: Optional[date]
    paid_amount: float
    status: str
    missed_notified_at: Optional[datetime]

    class Config:
        from_attributes = True


# ── Daily Summary (for dashboard) ────────────────────────────────────────────


class DailyPaymentSummary(BaseModel):
    date: date
    total_received: float
    payment_count: int
    by_method: dict  # {ACH: 5000, CC: 1200, ...}
    by_source: dict  # {PAYMENT_SHEET: 4000, MANUAL: 2200}
    etf_flags_triggered: int
    bounced_count: int
    bounced_amount: float
    accounts_resolved: int
