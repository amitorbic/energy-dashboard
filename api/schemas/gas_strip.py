from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List

class GasStripUpload(BaseModel):
    date: datetime
    value: float

class GasStripResponse(BaseModel):
    id: int
    date: datetime
    value: float
    class Config:
        from_attributes = True

class GasStripHistoryResponse(BaseModel):
    id: int
    date: datetime
    value: float
    uploaded_at: datetime
    class Config:
        from_attributes = True

class UploadResponse(BaseModel):
    success: bool
    rows_saved: int
    message: str