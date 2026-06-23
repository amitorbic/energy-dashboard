from sqlalchemy import Column, Integer, String, Text
from utils.database import Base


class Enrollment(Base):
    __tablename__ = "enrollment"

    esid                      = Column(String(100), primary_key=True)
    batch_no                  = Column(String(100), nullable=False)
    company_name              = Column(String(200), nullable=False)
    broker_code               = Column(String(100), nullable=False)
    email_id                  = Column(String(100), nullable=False)
    zone                      = Column(String(100), nullable=False)
    contract_rate             = Column(String(100), nullable=False)        # stored ×100, display ÷100
    contract_term             = Column(String(100), nullable=False)
    commission                = Column(String(100), nullable=False)
    contract_start_date       = Column(String(100), nullable=False)        # MM/DD/YYYY string
    contract_end_date         = Column(String(100), nullable=False)        # MM/DD/YYYY string
    meter_fees                = Column(String(100), nullable=False)
    meter_fee_check           = Column(Integer, nullable=False, default=0)
    tax_exempt1               = Column(String(100), nullable=False)
    tax_exempt2               = Column(String(100), nullable=False)
    tax_exempt3               = Column(String(100), nullable=False)
    tax_exempt4               = Column(String(100), nullable=False)
    tax_exempt5               = Column(String(100), nullable=False)
    tax_exempt6               = Column(String(100), nullable=False)
    tax_exempt7               = Column(String(100), nullable=False)
    tax_exempt8               = Column(String(100), nullable=False)
    zip                       = Column(String(100), nullable=False, default='0')
    date_added                = Column(Integer, nullable=False)            # Unix timestamp INT
    enrolled_status           = Column(Integer, nullable=False, default=0)
    load_profile_isigma       = Column(String(100), nullable=False)
    billed_30                 = Column(Integer, nullable=False, default=0)
    type                      = Column(String(100), nullable=False)        # always 'enrollment'
    enroll_check              = Column(Integer, nullable=False, default=0) # 0=pending 1=admin-cleared
    tax_exempt_check          = Column(Integer, nullable=False, default=0)
    tax_exempt_comment        = Column(String(255), nullable=False)
    enrollment_status         = Column(String(100), nullable=False)        # e.g. 'Completed-01/15/2025'
    enrollment_status_comment = Column(String(255), nullable=False)
    enrollment_cleared        = Column(Integer, nullable=False, default=0)
    additional_esid_check     = Column(Integer, nullable=False, default=0)
    comparison_comment        = Column(String(255), nullable=False)
    cleared_comment           = Column(String(255), nullable=False)
    contract_rate_check       = Column(Integer, nullable=False, default=0)
    commission_check          = Column(Integer, nullable=False, default=0)
    contract_term_check       = Column(Integer, nullable=False, default=0)
    broker_code_check         = Column(Integer, nullable=False, default=0)
    certificate_check         = Column(Integer, nullable=False, default=0)
    districts_cnp             = Column(String(255), nullable=False)
    cnp_check                 = Column(Integer, nullable=False, default=0)
    compare_check             = Column(Integer, nullable=False, default=0)
    status                    = Column(Integer, nullable=False, default=1)


class ConfirmationLog(Base):
    __tablename__ = "confirmation_log"

    sid                = Column(Integer, primary_key=True, autoincrement=True)
    esiid              = Column(Text, default=None)
    customer_name      = Column(String(255), nullable=False)
    broker_code        = Column(String(10), nullable=False)
    broker_name        = Column(String(255), nullable=False)
    start_date         = Column(String(255), nullable=False)              # MM/DD/YYYY string
    volumes            = Column(String(5000), nullable=False)             # PHP-serialized → decode with phpserialize
    total_volume       = Column(String(255), nullable=False)
    term               = Column(String(255), nullable=False)
    esid_count         = Column(String(255), nullable=False)
    contract_rate      = Column(String(255), nullable=False)
    commission         = Column(String(255), nullable=False)
    mill               = Column(String(255), nullable=False)
    comment            = Column(String(5000), nullable=False)
    date_modified      = Column(String(10), nullable=False)               # Unix timestamp stored as varchar
    type_of_contract   = Column(String(255), nullable=False)
    ap_quote           = Column(String(10), nullable=False)
    comment_mail       = Column(String(255), default=None)
    custom_sid         = Column(String(100), nullable=False, default='0')
    bne_sid            = Column(String(100), nullable=False, default='0')
    enroll_check       = Column(Integer, nullable=False, default=0)
    customer_email     = Column(String(255), nullable=False)
    tax_exempt         = Column(String(255), nullable=False)              # 'Residential' or 'Certificate'
    meter_fees         = Column(String(100), nullable=False, default='0')
    comment_enrollment = Column(String(255), nullable=False)
    lmp                = Column(Integer, nullable=False, default=0)
    sent_by            = Column(String(100), nullable=False)
    compare_check      = Column(Integer, nullable=False, default=0)
    contract_no        = Column(String(255), default=None)


class EnrollmentLog(Base):
    __tablename__ = "enrollment_log"

    sid           = Column(Integer, primary_key=True, autoincrement=True)
    esid          = Column(String(100), default=None)
    user          = Column(String(100), default=None)
    date_modified = Column(String(100), default=None)                     # Unix timestamp stored as varchar
    num_esid      = Column(Integer, default=None)
    comments      = Column(String(1000), default=None)


class AdditionalEsidTemplate(Base):
    __tablename__ = "additional_esid_template"

    sid               = Column(Integer, primary_key=True, autoincrement=True)
    customer_name     = Column(String(255), nullable=False)
    contract_rate     = Column(String(255), nullable=False)
    commission        = Column(String(255), nullable=False)
    broker_code       = Column(String(255), nullable=False)
    meter_fee         = Column(String(255), nullable=False)
    tax_exempt        = Column(String(255), nullable=False)               # 'Residential' or 'Certificate'
    contract_end_date = Column(String(100), nullable=False)


class BrokerNew(Base):
    __tablename__ = "broker_new"

    sid                = Column(Integer, primary_key=True, autoincrement=True)
    broker_code        = Column(String(255), nullable=False)
    company_name       = Column(String(256), nullable=False)
    confirmation_email = Column(String(255), default=None)
    confirmation_flag  = Column(Integer, default=None)
