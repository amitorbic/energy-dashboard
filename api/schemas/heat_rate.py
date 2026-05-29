from pydantic import BaseModel
from datetime import datetime
from typing import List

class HeatRateBase(BaseModel):
    profile_name: str
    market_date: datetime
    value: float

class HeatRateResponse(HeatRateBase):
    id: int
    class Config:
        from_attributes = True

class HeatRateHistoryResponse(HeatRateBase):
    id: int
    uploaded_at: datetime
    class Config:
        from_attributes = True

class HeatRateUploadResponse(BaseModel):
    status: str
    rows_processed: int
    message: str