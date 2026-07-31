from sqlalchemy import (
    Column, Integer, String, Text, Date, Numeric,
    JSON, TIMESTAMP, ForeignKey, Enum,
)
from sqlalchemy.sql import func
from utils.database import Base


class EdiFile(Base):
    __tablename__ = "edi_files"

    id                    = Column(Integer, primary_key=True, autoincrement=True)
    # H-row first field — file-level dedup key.  See note in migration.
    interchange_control   = Column(String(50), nullable=False, unique=True)
    edi_type              = Column(Enum("867_03", "810_02"), nullable=False)
    tdsp_name             = Column(String(200), nullable=True)
    tdsp_duns             = Column(String(20), nullable=True)
    file_date             = Column(Date, nullable=True)
    original_filename     = Column(String(255), nullable=False)
    uploaded_by           = Column(String(100), nullable=False)
    status                = Column(Enum("pending", "processed", "error"), nullable=False, default="pending")
    records_found         = Column(Integer, nullable=False, default=0)
    records_matched       = Column(Integer, nullable=False, default=0)
    error_detail          = Column(Text, nullable=True)
    raw_content           = Column(Text, nullable=True)  # LONGTEXT in migration
    created_at            = Column(TIMESTAMP, server_default=func.now())


class Edi867Usage(Base):
    __tablename__ = "edi_867_usage"

    id                       = Column(Integer, primary_key=True, autoincrement=True)
    edi_file_id              = Column(Integer, ForeignKey("edi_files.id"), nullable=False)
    esi_id                   = Column(String(30), nullable=False)
    document_tracking_number = Column(String(100), nullable=False, unique=True)  # per-ESI dedup key
    tdsp_name                = Column(String(200), nullable=True)
    tdsp_duns                = Column(String(20), nullable=True)
    meter_number             = Column(String(50), nullable=True)
    service_start            = Column(Date, nullable=False)
    service_end              = Column(Date, nullable=False)
    billing_days             = Column(Integer, nullable=False, default=0)
    usage_kwh                = Column(Numeric(12, 4), nullable=True)   # SU row, Meter_Type=KHMON
    kw_demand                = Column(Numeric(12, 4), nullable=True)   # SU row, Meter_Type=K4MON/K1MON
    ptd_code                 = Column(String(5), nullable=True)        # SU / PL / BD
    reading_type_code        = Column(String(5), nullable=True)        # QD=actual / KA=estimated
    is_estimated             = Column(Integer, nullable=False, default=0)
    meter_type               = Column(String(10), nullable=True)       # KHMON / K4MON / K1MON
    raw_segments             = Column(JSON, nullable=True)
    status                   = Column(
        Enum("unmatched", "matched", "no_contract"), nullable=False, default="unmatched"
    )
    # use_alter=True: circular FK with billing_periods — emitted as ALTER TABLE in migration
    billing_period_id        = Column(
        Integer,
        ForeignKey("billing_periods.id", use_alter=True, name="fk_867_billing_period"),
        nullable=True,
    )
    created_at               = Column(TIMESTAMP, server_default=func.now())


class Edi810LineItem(Base):
    __tablename__ = "edi_810_line_items"

    id                       = Column(Integer, primary_key=True, autoincrement=True)
    edi_file_id              = Column(Integer, ForeignKey("edi_files.id"), nullable=False)
    esi_id                   = Column(String(30), nullable=False)
    tdsp_name                = Column(String(200), nullable=True)
    tdsp_duns                = Column(String(20), nullable=True)
    # Per-ESI invoice identifier (Document_Tracking_Number in 810 EDI).
    # NOT unique: all charge lines for one ESI/period share this value.
    # User spec called this "tdsp_invoice_number".
    document_tracking_number = Column(String(100), nullable=False)
    original_document_id     = Column(String(100), nullable=True)   # cross-ref to TDSP's own 867 tracking number
    document_sub_purpose     = Column(Enum("MONTH", "FINAL"), nullable=False, default="MONTH")
    service_start            = Column(Date, nullable=False)
    service_end              = Column(Date, nullable=False)
    line_item_number         = Column(Integer, nullable=True)
    charge_code              = Column(String(20), nullable=False)
    charge_description       = Column(String(255), nullable=True)
    charge_amount            = Column(Numeric(12, 2), nullable=False, default=0)
    charge_rate              = Column(Numeric(12, 6), nullable=True)    # Rate_Line_Item_Charge
    charge_quantity          = Column(Numeric(12, 4), nullable=True)    # Quantity_Line_Item_Charge
    charge_unit              = Column(String(10), nullable=True)        # K1 / KH / EA / RA
    registered_quantity      = Column(Numeric(12, 4), nullable=True)    # Registered_Quantity_Line_Item_Charge (RA rows)
    charge_comments          = Column(String(255), nullable=True)
    utility_rate_class       = Column(String(10), nullable=True)        # D0 / B0 / A0 / DC / R8
    invoice_total_amount     = Column(Numeric(12, 2), nullable=True)    # ESI invoice total (repeated on every line)
    mapping_id               = Column(Integer, ForeignKey("tdsp_charge_mappings.id"), nullable=True)
    billing_period_id        = Column(Integer, ForeignKey("billing_periods.id"), nullable=True)
    status                   = Column(
        Enum("unmapped", "mapped", "excluded"), nullable=False, default="unmapped"
    )
    created_at               = Column(TIMESTAMP, server_default=func.now())


class TdspChargeMapping(Base):
    __tablename__ = "tdsp_charge_mappings"

    id                 = Column(Integer, primary_key=True, autoincrement=True)
    # NULL = universal mapping (applies to all TDSPs).
    # MySQL UNIQUE(tdsp_duns, charge_code) does NOT catch duplicate (NULL, code) pairs —
    # application layer must enforce uniqueness for universal rows before INSERT.
    tdsp_duns          = Column(String(20), nullable=True, default=None)
    charge_code        = Column(String(20), nullable=False)
    charge_description = Column(String(255), nullable=True)
    billing_category   = Column(
        Enum(
            "transmission", "distribution", "customer_charge", "metering",
            "surcharge", "tax", "misc", "excluded",
        ),
        nullable=False,
    )
    is_per_unit        = Column(Integer, nullable=False, default=1)   # 1=variable (rate×qty), 0=flat
    is_passthrough     = Column(Integer, nullable=False, default=1)
    notes              = Column(String(500), nullable=True)
    created_at         = Column(TIMESTAMP, server_default=func.now())
    updated_at         = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())


class BillingPeriod(Base):
    __tablename__ = "billing_periods"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    esi_id        = Column(String(30), nullable=False)
    edi_867_id    = Column(Integer, ForeignKey("edi_867_usage.id"), nullable=False)
    service_start = Column(Date, nullable=False)
    service_end   = Column(Date, nullable=False)
    billing_days  = Column(Integer, nullable=False, default=0)
    usage_kwh     = Column(Numeric(12, 4), nullable=True)
    kw_demand     = Column(Numeric(12, 4), nullable=True)
    # Direct copy from contract_renewal.contract_rate — already in $/kWh (e.g. 0.0586), NO division needed.
    contract_rate = Column(Numeric(10, 6), nullable=True)
    # Parsed from contract_renewal.other_charge (strip '$', cast to decimal in Step 2 matching logic).
    meter_fee     = Column(Numeric(10, 2), nullable=True)
    has_810       = Column(Integer, nullable=False, default=0)
    flags         = Column(JSON, nullable=True)
    status        = Column(
        Enum("draft", "reviewed", "approved", "invoiced"), nullable=False, default="draft"
    )
    created_at    = Column(TIMESTAMP, server_default=func.now())
    updated_at    = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())


class BillingPeriodCharge(Base):
    __tablename__ = "billing_period_charges"

    id                   = Column(Integer, primary_key=True, autoincrement=True)
    billing_period_id    = Column(Integer, ForeignKey("billing_periods.id"), nullable=False)
    charge_source        = Column(Enum("supplier", "tdsp", "tax", "adjustment"), nullable=False)
    charge_category      = Column(String(50), nullable=True)
    charge_code          = Column(String(20), nullable=True)
    description          = Column(String(255), nullable=False)
    amount               = Column(Numeric(12, 2), nullable=False, default=0)
    quantity             = Column(Numeric(12, 4), nullable=True)
    unit_rate            = Column(Numeric(10, 6), nullable=True)
    unit                 = Column(String(10), nullable=True)
    edi_810_line_item_id = Column(Integer, ForeignKey("edi_810_line_items.id"), nullable=True)
    sort_order           = Column(Integer, nullable=False, default=0)
    created_at           = Column(TIMESTAMP, server_default=func.now())


class Invoice(Base):
    __tablename__ = "invoices"

    id                = Column(Integer, primary_key=True, autoincrement=True)
    # Format: B + YYMMDD + 4-digit daily sequence, e.g. B2607050001
    # Sequence = COUNT(*) of invoices on that date + 1, zero-padded to 4 digits.
    invoice_number    = Column(String(20), nullable=False, unique=True)
    billing_period_id = Column(Integer, ForeignKey("billing_periods.id"), nullable=False, unique=True)  # 1:1
    esi_id            = Column(String(30), nullable=False)
    invoice_date      = Column(Date, nullable=False)
    due_date          = Column(Date, nullable=True)
    total_amount      = Column(Numeric(12, 2), nullable=False, default=0)
    supplier_charge   = Column(Numeric(12, 2), nullable=False, default=0)
    tdsp_total        = Column(Numeric(12, 2), nullable=False, default=0)
    tax_total         = Column(Numeric(12, 2), nullable=False, default=0)
    status            = Column(Enum("draft", "posted", "sent", "paid", "void"), nullable=False, default="draft")
    sent_at           = Column(TIMESTAMP, nullable=True)
    paid_at           = Column(TIMESTAMP, nullable=True)
    created_at        = Column(TIMESTAMP, server_default=func.now())
    updated_at        = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
