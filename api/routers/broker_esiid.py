"""
Broker ESIID Lookup router — prefix /api/broker/esiid
POST /broker/esiid/lookup → JSON array of matching records (≤10)
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from middleware.auth import require_auth
from utils.database import get_db
from sqlalchemy.ext.asyncio import AsyncSession
from controllers.broker_esiid import esiid_lookup

router = APIRouter(prefix="/broker/esiid", tags=["broker-esiid"])


class EsiidLookupRequest(BaseModel):
    tdsp: str = ""
    city: str = ""
    zipcode: str = ""
    search_type: str = "address"   # "address" | "esiid" | "multiple_esiid"
    ser_text: str = ""


@router.post("/lookup")
async def lookup(
    req: EsiidLookupRequest,
    payload: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    results = await esiid_lookup(
        db=db,
        tdsp=req.tdsp,
        city=req.city,
        zipcode=req.zipcode,
        search_type=req.search_type,
        ser_text=req.ser_text,
    )
    return results
