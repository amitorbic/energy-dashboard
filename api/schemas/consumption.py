from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class ConsumptionUploadResponse(BaseModel):
    status: str
    rows: int
    message: Optional[str] = None

class ConsumptionLastUpdated(BaseModel):
    latest: Optional[datetime] = None