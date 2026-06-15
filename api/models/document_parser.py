from sqlalchemy import (
    Column, Integer, String, Float, Boolean, Date,
    TIMESTAMP, JSON, ForeignKey, Enum as SAEnum,
)
from sqlalchemy.sql import func
from utils.database import Base
import enum


class PricingType(str, enum.Enum):
    fixed = "fixed"
    index = "index"


class BillTemplate(Base):
    """
    Learned extraction patterns per utility provider.
    Built up automatically as users confirm/correct parsed bills.
    """
    __tablename__ = "bill_templates"

    id = Column(Integer, primary_key=True, autoincrement=True)
    provider_name = Column(String(255), nullable=False, unique=True)
    field_map = Column(JSON, nullable=True)      # where fields appear on this provider's bill
    sample_fields = Column(JSON, nullable=True)  # example extracted values (few-shot context)
    confidence_score = Column(Float, default=0.0)
    times_used = Column(Integer, default=0)
    last_updated = Column(
        TIMESTAMP,
        server_default=func.now(),
        onupdate=func.now(),
    )


class ParsedBill(Base):
    """Utility bill data extracted via AI Vision."""
    __tablename__ = "parsed_bills"

    id = Column(Integer, primary_key=True, autoincrement=True)
    esi_id = Column(String(20), nullable=True, index=True)
    provider_name = Column(String(255), nullable=True)
    service_address = Column(String(500), nullable=True)
    usage_kwh = Column(Float, nullable=True)
    kw_demand = Column(Float, nullable=True)
    energy_rate = Column(Float, nullable=True)         # $/kWh — REP supply rate
    tdsp_rate = Column(Float, nullable=True)           # $/kWh — TDSP delivery rate
    total_average_rate = Column(Float, nullable=True)  # $/kWh — total bill ÷ kWh
    energy_charges = Column(Float, nullable=True)      # $ — REP supply subtotal
    tdsp_charges = Column(Float, nullable=True)        # $ — TDSP delivery subtotal
    taxes = Column(Float, nullable=True)
    extra_charges = Column(JSON, nullable=True)        # non-standard line items
    bill_date = Column(Date, nullable=True)
    service_zip = Column(String(10), nullable=True)    # extracted from service address
    tdsp_name = Column(String(255), nullable=True)     # derived from ESI ID prefix or zip
    pricing_zone = Column(String(50), nullable=True)   # ERCOT zone: North/South/West/Houston
    raw_extracted = Column(JSON, nullable=True)   # full AI response for audit
    template_id = Column(
        Integer,
        ForeignKey("bill_templates.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at = Column(TIMESTAMP, server_default=func.now())


class ParsedContract(Base):
    """Competitor contract competitive intelligence, extracted via AI."""
    __tablename__ = "parsed_contracts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    competitor_name = Column(String(255), nullable=True, index=True)
    rate = Column(Float, nullable=True)
    contract_term_months = Column(Integer, nullable=True)
    early_termination_fee = Column(String(255), nullable=True)
    auto_renewal = Column(Boolean, nullable=True)
    capacity_charges = Column(String(255), nullable=True)
    swing_limits = Column(String(255), nullable=True)
    pricing_type = Column(SAEnum(PricingType), nullable=True)
    hidden_charges = Column(JSON, nullable=True)  # list of non-obvious fee items
    what_is_missing = Column(JSON, nullable=True) # ORBIC advantages not present here
    raw_extracted = Column(JSON, nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.now())
