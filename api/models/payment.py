# =============================================================================
# payments/models.py
# SQLAlchemy async models for the payment module
# =============================================================================

from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    DateTime,
    Date,
    Text,
    ForeignKey,
    Enum as SAEnum,
    Boolean,
    JSON,
    SmallInteger,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from utils.database import Base
import enum


class PaymentMethod(str, enum.Enum):
    ACH = "ACH"
    CC = "CC"
    CHECK = "CHECK"
    WIRE = "WIRE"
    OTHER = "OTHER"


class PaymentStatus(str, enum.Enum):
    POSTED = "POSTED"
    BOUNCED = "BOUNCED"
    REVERSED = "REVERSED"
    UNDER_REVIEW = "UNDER_REVIEW"


class PaymentSource(str, enum.Enum):
    PAYMENT_SHEET = "PAYMENT_SHEET"
    BILLING_SHEET = "BILLING_SHEET"
    MANUAL = "MANUAL"


class AppliedTo(str, enum.Enum):
    USAGE = "USAGE"
    ETF = "ETF"
    BOTH = "BOTH"


class ImportStatus(str, enum.Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    COMPLETED_WITH_ERRORS = "COMPLETED_WITH_ERRORS"
    FAILED = "FAILED"


class ImportFileType(str, enum.Enum):
    PAYMENT_SHEET = "PAYMENT_SHEET"
    BILLING_SHEET = "BILLING_SHEET"
    AR_SUMMARY = "AR_SUMMARY"


class InstallmentStatus(str, enum.Enum):
    SCHEDULED = "SCHEDULED"
    PAID = "PAID"
    PARTIAL = "PARTIAL"
    MISSED = "MISSED"
    WAIVED = "WAIVED"


# -----------------------------------------------------------------------------
class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)

    esiid = Column(String(30), nullable=False, index=True)
    account_number = Column(String(100), index=True)
    customer_name = Column(String(255), nullable=False)
    collections_account_id = Column(
        Integer, ForeignKey("collections_accounts.id"), nullable=True
    )

    payment_date = Column(Date, nullable=False)
    received_date = Column(Date, nullable=False)
    amount = Column(Float, nullable=False)
    method = Column(SAEnum(PaymentMethod), nullable=False)
    reference_number = Column(String(100))

    applied_to = Column(SAEnum(AppliedTo), nullable=False, default=AppliedTo.USAGE)
    applied_to_usage = Column(Float, nullable=False, default=0.0)
    applied_to_etf = Column(Float, nullable=False, default=0.0)

    balance_before = Column(Float, nullable=False)
    balance_after = Column(Float, nullable=False)
    usage_balance_before = Column(Float, nullable=False)
    usage_balance_after = Column(Float, nullable=False)
    etf_balance_before = Column(Float, nullable=False, default=0.0)
    etf_balance_after = Column(Float, nullable=False, default=0.0)

    triggered_etf_flag = Column(Boolean, nullable=False, default=False)

    source = Column(SAEnum(PaymentSource), nullable=False)
    import_id = Column(Integer, ForeignKey("payment_imports.id"), nullable=True)
    entered_by = Column(String(100), nullable=False)

    is_bounced = Column(Boolean, nullable=False, default=False)
    bounced_at = Column(DateTime, nullable=True)
    bounce_reason = Column(String(255))
    bounce_notified_at = Column(DateTime, nullable=True)
    reversal_of_payment_id = Column(Integer, ForeignKey("payments.id"), nullable=True)

    status = Column(SAEnum(PaymentStatus), nullable=False, default=PaymentStatus.POSTED)
    notes = Column(Text)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    collections_account = relationship(
        "CollectionsAccount", back_populates="payments", lazy="select"
    )
    import_record = relationship("PaymentImport", back_populates="payments")


# -----------------------------------------------------------------------------
class PaymentImport(Base):
    __tablename__ = "payment_imports"

    id = Column(Integer, primary_key=True, index=True)

    filename = Column(String(500), nullable=False)
    file_type = Column(SAEnum(ImportFileType), nullable=False)
    file_size_bytes = Column(Integer)
    uploaded_by = Column(String(100), nullable=False)
    uploaded_at = Column(DateTime, server_default=func.now())

    status = Column(SAEnum(ImportStatus), nullable=False, default=ImportStatus.PENDING)
    processed_at = Column(DateTime, nullable=True)
    total_rows = Column(Integer, nullable=False, default=0)
    rows_processed = Column(Integer, nullable=False, default=0)
    rows_skipped = Column(Integer, nullable=False, default=0)
    rows_errored = Column(Integer, nullable=False, default=0)

    total_payment_amount = Column(Float, nullable=False, default=0.0)
    accounts_updated = Column(Integer, nullable=False, default=0)
    accounts_resolved = Column(Integer, nullable=False, default=0)
    etf_flags_triggered = Column(Integer, nullable=False, default=0)
    bounced_found = Column(Integer, nullable=False, default=0)

    error_log = Column(JSON, nullable=True)
    preview_data = Column(JSON, nullable=True)

    is_rolled_back = Column(Boolean, nullable=False, default=False)
    rolled_back_by = Column(String(100), nullable=True)
    rolled_back_at = Column(DateTime, nullable=True)
    notes = Column(Text)

    payments = relationship("Payment", back_populates="import_record")


# -----------------------------------------------------------------------------
class PaymentPlanInstallment(Base):
    __tablename__ = "payment_plan_installments"

    id = Column(Integer, primary_key=True, index=True)
    payment_plan_id = Column(
        Integer, ForeignKey("collections_payment_plans.id"), nullable=False
    )
    collections_account_id = Column(
        Integer, ForeignKey("collections_accounts.id"), nullable=False
    )

    installment_number = Column(SmallInteger, nullable=False)
    due_date = Column(Date, nullable=False)
    amount_due = Column(Float, nullable=False)

    payment_id = Column(Integer, ForeignKey("payments.id"), nullable=True)
    paid_date = Column(Date, nullable=True)
    paid_amount = Column(Float, nullable=False, default=0.0)

    status = Column(
        SAEnum(InstallmentStatus), nullable=False, default=InstallmentStatus.SCHEDULED
    )
    missed_notified_at = Column(DateTime, nullable=True)
    grace_period_ends = Column(Date, nullable=True)
    notes = Column(Text)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
