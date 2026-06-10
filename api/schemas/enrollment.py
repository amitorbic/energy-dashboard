from pydantic import BaseModel
from typing import List, Literal, Optional


# ── Shared ────────────────────────────────────────────────────────────────────

class MessageResponse(BaseModel):
    message: str


# ── Enrollment row (view, completed, canceled, checked, non-billed) ───────────

class EnrollmentOut(BaseModel):
    esid: str
    batch_no: str
    company_name: str
    broker_code: str
    email_id: str
    zone: str
    contract_rate: str            # stored ×100 in DB; controller returns raw, frontend divides
    contract_term: str
    commission: str
    contract_start_date: str      # MM/DD/YYYY
    contract_end_date: str        # MM/DD/YYYY
    meter_fees: str
    meter_fee_check: int
    tax_exempt1: str
    tax_exempt2: str
    tax_exempt3: str
    tax_exempt4: str
    tax_exempt5: str
    tax_exempt6: str
    tax_exempt7: str
    tax_exempt8: str
    zip: str
    date_added: int               # Unix timestamp INT — frontend formats to MM/DD/YYYY
    enrolled_status: int
    load_profile_isigma: str
    billed_30: int
    type: str
    enroll_check: int
    tax_exempt_check: int
    tax_exempt_comment: str
    enrollment_status: str
    enrollment_status_comment: str
    enrollment_cleared: int
    additional_esid_check: int
    comparison_comment: str
    cleared_comment: str
    contract_rate_check: int
    commission_check: int
    contract_term_check: int
    broker_code_check: int
    certificate_check: int
    districts_cnp: str
    cnp_check: int
    compare_check: int
    status: int

    class Config:
        from_attributes = True


# ── Enrollment log row ────────────────────────────────────────────────────────

class EnrollmentLogOut(BaseModel):
    sid: int
    esid: Optional[str] = None
    user: Optional[str] = None
    date_modified: Optional[str] = None   # Unix ts varchar — frontend formats
    num_esid: Optional[int] = None
    comments: Optional[str] = None

    class Config:
        from_attributes = True


# ── Dashboard stats ───────────────────────────────────────────────────────────

class EnrollmentStatsOut(BaseModel):
    total_confirmations: int       # confirmation_log WHERE type New/Addition
    total_enrollments: int         # enrollment WHERE type='enrollment'
    enrollments_checked: int       # enrollment WHERE enroll_check=1
    enrollments_unchecked: int     # enrollment WHERE enroll_check=0
    confirmations_unchecked: int   # confirmation_log WHERE enroll_check=0 AND type New/Addition


# ── Enrollment/Confirmation comparison row ────────────────────────────────────
# Mirrors the SELECT in enrollment_report.php lines 285-293.
# Both enrollment and confirmation_log fields are present.

class ComparisonRowOut(BaseModel):
    # — from enrollment —
    esid: str
    company_name: str
    broker_code: str
    enrol_comm: str                # enrollment.commission aliased
    contract_rate: str             # enrollment.contract_rate (÷100 for display)
    contract_term: str
    zone: str
    email_id: str
    enrollment_status: str
    enrolled_status: int
    billed_30: int
    load_profile_isigma: str
    enrollment_meter: str          # enrollment.meter_fees aliased
    meter_fee_check: int
    tax_exempt_check: int
    tax_exempt1: str
    tax_exempt2: str
    tax_exempt3: str
    tax_exempt4: str
    tax_exempt5: str
    tax_exempt6: str
    tax_exempt7: str
    tax_exempt8: str
    comparison_comment: str
    certificate_check: int
    contract_term_check: int
    contract_rate_check: int
    commission_check: int
    contract_start_date: str
    date_added: int
    # — from confirmation_log —
    sid: Optional[int] = None
    customer_name: Optional[str] = None
    conf_comm: Optional[str] = None           # confirmation_log.commission aliased
    contract_rate_comm: Optional[str] = None  # confirmation_log.contract_rate aliased
    term: Optional[str] = None
    profiles: Optional[List[str]] = None      # decoded from volumes (phpserialize)
    date_modified: Optional[str] = None       # Unix ts varchar
    start_date: Optional[str] = None
    confirmation_meter: Optional[str] = None  # confirmation_log.meter_fees aliased
    tax_exempt: Optional[str] = None
    customer_email: Optional[str] = None
    # — computed by controller —
    remarks: str = ""
    flag_remarks: int = 0          # 0 or 1, mirrors PHP $flag_remarks
    clean_record_flag: int = 0     # 1 = green row
    billed_flag: int = 0           # 1 = orange row
    tax_error: int = 0             # 0=ok 1=mismatch 2=certificate-needs-check
    tax_error_certificate: int = 0
    tax_certificate: int = 0


# ── Confirmations pending enrollments row ────────────────────────────────────
# Mirrors confirmations_report_enrollment.php — confirmation_log rows with no
# matching enrollment.

class PendingConfirmationOut(BaseModel):
    sid: int
    date_modified: str             # Unix ts varchar — frontend formats
    customer_name: str
    broker_name: str
    contract_rate: str
    commission: str
    term: str
    meter_fees: str
    profiles: List[str]            # decoded from volumes (phpserialize)
    tax_exempt: str
    start_date: str
    esid_count: str
    comment_enrollment: str


# ── Enrollments with no confirmations row ────────────────────────────────────
# Mirrors view_clear_enrollments.php ?unchecked=1 mode.

class NoConfirmationOut(BaseModel):
    esid: str
    date_added: int                # Unix timestamp INT
    company_name: str
    broker_code: str
    contract_rate: str
    commission: str
    contract_term: str
    contract_start_date: str
    contract_end_date: str
    meter_fees: str
    enrollment_status: str
    enrollment_status_comment: str
    email_id: str
    comparison_comment: str
    clean_record_flag: int = 0
    billed_flag: int = 0


# ── Template comparison row ───────────────────────────────────────────────────
# Mirrors template_enrollment_report.php JOIN enrollment + additional_esid_template.

class TemplateComparisonRowOut(BaseModel):
    # — from enrollment —
    esid: str
    broker_code: str
    enrol_comm: str
    contract_rate: str
    contract_term: str
    meter_fees: str
    contract_start_date: str
    comparison_comment: str
    commission_check: int
    contract_rate_check: int
    # — from additional_esid_template —
    sid: Optional[int] = None
    customer_name: Optional[str] = None
    template_comm: Optional[str] = None
    contract_rate_template: Optional[str] = None
    tax_exempt: Optional[str] = None
    contract_end_date: Optional[str] = None
    meter_fee: Optional[str] = None
    # — computed —
    remarks: str = ""
    flag_remarks: int = 0
    clean_record_flag: int = 0
    billed_flag: int = 0
    tax_error: int = 0


# ── Additional ESI template ───────────────────────────────────────────────────

class TemplateOut(BaseModel):
    sid: int
    customer_name: str
    contract_rate: str
    commission: str
    broker_code: str
    broker_name: Optional[str] = None   # joined from broker_new
    meter_fee: str
    tax_exempt: str                      # 'Residential' or 'Certificate'
    contract_end_date: str

    class Config:
        from_attributes = True


class TemplateCreate(BaseModel):
    customer_name: str
    contract_rate: str
    commission: str
    broker_code: str
    meter_fee: str
    tax_exempt: str                      # 'Residential' or 'Certificate'
    contract_end_date: str


# ── Edit enrollment (edit_enrollment.php) ────────────────────────────────────

class EditEnrollmentRequest(BaseModel):
    company_name: str
    broker_code: str
    contract_rate: str             # entered as display value (÷100); controller stores ×100
    commission: str
    contract_start_date: str       # MM/DD/YYYY
    contract_end_date: str         # MM/DD/YYYY
    zone: str
    meter_fees: str
    company_name_old: str          # used to detect change for enrollment_log entry
    contract_end_date_old: str     # used to detect change for enrollment_log entry


# ── Enrollment status check (enrollment_status_check.php) ────────────────────

class StatusCheckRequest(BaseModel):
    # Radio values: 'None','Scheduled','Switch Hold on ESI ID','Pending permit',
    #               'Cancelled','Cancelled By Customer','Completed'
    radio1: str
    txtdate: Optional[str] = None      # date for Scheduled status
    txtdate1: Optional[str] = None     # date for Completed status
    # Comment radio: 'None','Notify broker','Follow up broker',
    #                'Notified Customer','Account Re-enrolled','Cancelled by Customer'
    comment: Optional[str] = None
    comment_others: Optional[str] = None   # 'on' if Others checkbox checked
    txtarea: Optional[str] = None          # textarea text when comment_others=='on'
    radio3: Optional[str] = None           # 'Active with another provider' checkbox
    comment_active: Optional[str] = None
    archive: Optional[bool] = None         # Move to Archive checkbox
    status_old: Optional[str] = None       # previous status for log comparison


# ── clear_enrollment_report.php: type = 'confirmation' or 'template' ─────────

class ApproveRequest(BaseModel):
    sid: Optional[int] = None      # confirmation_log.sid — required when type='confirmation'
    type: str                       # 'confirmation' or 'template'


# ── delete_enrollment.php: type = 'delete' (soft) or 'update' (admin clear) ──

class ActionRequest(BaseModel):
    type: Literal["delete", "update"]


# ── Download completed enrollments date range ─────────────────────────────────

class DownloadCompletedRequest(BaseModel):
    start: str    # date string — strtotime() equivalent applied in controller
    end: str      # date string
