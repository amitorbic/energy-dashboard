from pydantic import BaseModel
from typing import Optional, Any, Dict, List
from datetime import date, datetime


# ── Template ──────────────────────────────────────────────────────────────────

class BillTemplateOut(BaseModel):
    id: int
    provider_name: str
    field_map: Optional[Any] = None
    sample_fields: Optional[Any] = None
    confidence_score: float
    times_used: int
    last_updated: Optional[datetime] = None

    class Config:
        from_attributes = True


# ── Generic save (called from Next.js frontend) ───────────────────────────────

class SaveDocumentRequest(BaseModel):
    doc_type: str                                      # "utility_bill" | "contract"
    fields: Dict[str, Any]                             # user-confirmed field values
    filename: Optional[str] = None
    raw_extracted: Optional[Any] = None               # full AI JSON response
    template_id: Optional[int] = None                 # matched template, if any
    user_corrections: Optional[Dict[str, bool]] = None # field_key -> was_corrected


# ── Response: parsed bill ─────────────────────────────────────────────────────

class ParsedBillOut(BaseModel):
    id: int
    esi_id: Optional[str] = None
    provider_name: Optional[str] = None
    service_address: Optional[str] = None
    usage_kwh: Optional[float] = None
    kw_demand: Optional[float] = None
    energy_rate: Optional[float] = None
    total_average_rate: Optional[float] = None
    tdsp_charges: Optional[float] = None
    taxes: Optional[float] = None
    extra_charges: Optional[Any] = None
    bill_date: Optional[date] = None
    template_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ── Response: parsed contract ─────────────────────────────────────────────────

class ParsedContractOut(BaseModel):
    id: int
    competitor_name: Optional[str] = None
    rate: Optional[float] = None
    contract_term_months: Optional[int] = None
    early_termination_fee: Optional[str] = None
    auto_renewal: Optional[bool] = None
    capacity_charges: Optional[str] = None
    swing_limits: Optional[str] = None
    pricing_type: Optional[str] = None
    hidden_charges: Optional[Any] = None
    what_is_missing: Optional[Any] = None
    created_at: datetime

    class Config:
        from_attributes = True
