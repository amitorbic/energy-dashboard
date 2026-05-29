from pydantic import BaseModel, EmailStr
from typing import Optional, List, Any
from datetime import date, datetime


# ── Upload Log ────────────────────────────────────────────────────────────────


class BillingUploadLogOut(BaseModel):
    id: int
    upload_date: date
    filename: str
    uploaded_by: str
    total_rows: int
    email_sent: int
    created_at: datetime

    class Config:
        from_attributes = True


# ── Exception Log ─────────────────────────────────────────────────────────────


class BillingExceptionRow(BaseModel):
    """Single check's exception list — list of flagged customer dicts."""

    cust_id: Optional[str] = None
    bill_no: Optional[str] = None
    company_name: Optional[str] = None
    cust_name: Optional[str] = None
    extra: Optional[Any] = None  # check-specific fields (rate, balance, etc.)


class BillingExceptionLogOut(BaseModel):
    id: int
    upload_id: int
    upload_date: date
    row_type: str

    check_tax_zero: Optional[str] = None
    check_kh_qty_energy_zero: Optional[str] = None
    check_kh_qty_metered_mismatch: Optional[str] = None
    check_residential_puc_grt_city: Optional[str] = None
    check_residential_tax_exempt: Optional[str] = None
    check_mcpe_bills: Optional[str] = None
    check_lmp_rate_range: Optional[str] = None
    check_sub_only_no_master: Optional[str] = None
    check_commercial_tdsp: Optional[str] = None
    check_residential_price_low: Optional[str] = None
    check_residential_price_high: Optional[str] = None
    check_commercial_price_high: Optional[str] = None
    check_commercial_price_low: Optional[str] = None
    check_negative_balance: Optional[str] = None
    check_zero_usage: Optional[str] = None
    check_partial_payment: Optional[str] = None
    check_zero_meter_fee: Optional[str] = None
    check_first_bill: Optional[str] = None
    check_final_bill: Optional[str] = None
    check_master_sub_final: Optional[str] = None
    check_state_tax_100: Optional[str] = None
    check_credit_card_final: Optional[str] = None
    check_autopay_balance: Optional[str] = None
    check_wrong_meter_fee: Optional[str] = None
    check_renewal_energy_high: Optional[str] = None
    check_paid_amount_variance: Optional[str] = None
    check_single_bill_under_100: Optional[str] = None
    check_multi_contract_invoice: Optional[str] = None
    check_old_autopay_balance: Optional[str] = None
    check_deposit_charges: Optional[str] = None
    check_first_bill_going_final: Optional[str] = None
    check_potential_final: Optional[str] = None
    check_difference_one_day: Optional[str] = None
    check_different_due_date: Optional[str] = None
    check_master_sub_autopay_type: Optional[str] = None
    check_master_sub_bill_mode: Optional[str] = None

    created_at: datetime

    class Config:
        from_attributes = True


# ── Comments (save per check per upload) ──────────────────────────────────────


class BillingCommentSave(BaseModel):
    upload_id: int
    # one field per check — only send the ones the user typed
    check_tax_zero: Optional[str] = None
    check_kh_qty_energy_zero: Optional[str] = None
    check_kh_qty_metered_mismatch: Optional[str] = None
    check_residential_puc_grt_city: Optional[str] = None
    check_residential_tax_exempt: Optional[str] = None
    check_mcpe_bills: Optional[str] = None
    check_lmp_rate_range: Optional[str] = None
    check_sub_only_no_master: Optional[str] = None
    check_commercial_tdsp: Optional[str] = None
    check_residential_price_low: Optional[str] = None
    check_residential_price_high: Optional[str] = None
    check_commercial_price_high: Optional[str] = None
    check_commercial_price_low: Optional[str] = None
    check_negative_balance: Optional[str] = None
    check_zero_usage: Optional[str] = None
    check_partial_payment: Optional[str] = None
    check_zero_meter_fee: Optional[str] = None
    check_first_bill: Optional[str] = None
    check_final_bill: Optional[str] = None
    check_master_sub_final: Optional[str] = None
    check_state_tax_100: Optional[str] = None
    check_credit_card_final: Optional[str] = None
    check_autopay_balance: Optional[str] = None
    check_wrong_meter_fee: Optional[str] = None
    check_renewal_energy_high: Optional[str] = None
    check_paid_amount_variance: Optional[str] = None
    check_single_bill_under_100: Optional[str] = None
    check_multi_contract_invoice: Optional[str] = None
    check_old_autopay_balance: Optional[str] = None
    check_deposit_charges: Optional[str] = None
    check_first_bill_going_final: Optional[str] = None
    check_potential_final: Optional[str] = None
    check_difference_one_day: Optional[str] = None
    check_different_due_date: Optional[str] = None
    check_master_sub_autopay_type: Optional[str] = None
    check_master_sub_bill_mode: Optional[str] = None


# ── Email Recipients ──────────────────────────────────────────────────────────


class RecipientCreate(BaseModel):
    name: str
    email: EmailStr


class RecipientOut(BaseModel):
    id: int
    name: str
    email: str
    active: int
    created_at: datetime

    class Config:
        from_attributes = True


# ── Send Email ────────────────────────────────────────────────────────────────


class SendEmailRequest(BaseModel):
    upload_id: int
