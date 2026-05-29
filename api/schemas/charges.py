from pydantic import BaseModel
from typing import Dict

class ChargeUpdateSchema(BaseModel):
    # This expects a dictionary where the key is a string (profile) 
    # and the value is a float (the rate)
    charges: Dict[str, float]

class ChargeResponse(BaseModel):
    profile: str
    value: float

    class Config:
        from_attributes = True