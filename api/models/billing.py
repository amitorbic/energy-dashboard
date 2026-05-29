from sqlalchemy import Column, Integer, String, Text, Date, SmallInteger, TIMESTAMP
from sqlalchemy.sql import func
from utils.database import Base


class BillingUploadLog(Base):
    __tablename__ = "billing_upload_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    upload_date = Column(Date, nullable=False, unique=True)
    filename = Column(String(255), nullable=False)
    uploaded_by = Column(String(100), nullable=False)
    total_rows = Column(Integer, nullable=False, default=0)
    email_sent = Column(Integer, nullable=False, default=0)  # 0 | 1
    created_at = Column(TIMESTAMP, server_default=func.now())


class BillingExceptionLog(Base):
    __tablename__ = "billing_exception_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    upload_id = Column(Integer, nullable=False)
    upload_date = Column(Date, nullable=False)
    row_type = Column(String(20), nullable=False)  # 'exception' | 'comment'

    # ── 36 checks ────────────────────────────────────────────────────────────
    check_tax_zero = Column(Text, default=None)
    check_kh_qty_energy_zero = Column(Text, default=None)
    check_kh_qty_metered_mismatch = Column(Text, default=None)
    check_residential_puc_grt_city = Column(Text, default=None)
    check_residential_tax_exempt = Column(Text, default=None)
    check_mcpe_bills = Column(Text, default=None)
    check_lmp_rate_range = Column(Text, default=None)
    check_sub_only_no_master = Column(Text, default=None)
    check_commercial_tdsp = Column(Text, default=None)
    check_residential_price_low = Column(Text, default=None)
    check_residential_price_high = Column(Text, default=None)
    check_commercial_price_high = Column(Text, default=None)
    check_commercial_price_low = Column(Text, default=None)
    check_negative_balance = Column(Text, default=None)
    check_zero_usage = Column(Text, default=None)
    check_partial_payment = Column(Text, default=None)
    check_zero_meter_fee = Column(Text, default=None)
    check_first_bill = Column(Text, default=None)
    check_final_bill = Column(Text, default=None)
    check_master_sub_final = Column(Text, default=None)
    check_state_tax_100 = Column(Text, default=None)
    check_credit_card_final = Column(Text, default=None)
    check_autopay_balance = Column(Text, default=None)
    check_wrong_meter_fee = Column(Text, default=None)
    check_renewal_energy_high = Column(Text, default=None)
    check_paid_amount_variance = Column(Text, default=None)
    check_single_bill_under_100 = Column(Text, default=None)
    check_multi_contract_invoice = Column(Text, default=None)
    check_old_autopay_balance = Column(Text, default=None)
    check_deposit_charges = Column(Text, default=None)
    check_first_bill_going_final = Column(Text, default=None)
    check_potential_final = Column(Text, default=None)
    check_difference_one_day = Column(Text, default=None)
    check_different_due_date = Column(Text, default=None)
    check_master_sub_autopay_type = Column(Text, default=None)
    check_master_sub_bill_mode = Column(Text, default=None)

    created_at = Column(TIMESTAMP, server_default=func.now())


class BillingEmailRecipient(Base):
    __tablename__ = "billing_email_recipients"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    email = Column(String(150), nullable=False, unique=True)
    active = Column(Integer, nullable=False, default=1)  # 0 | 1
    created_at = Column(TIMESTAMP, server_default=func.now())
