from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from utils.database import get_db
from controllers.ercot_market import (
    get_ercot_7day_forecast,
    get_ercot_dam_prices,
    get_ercot_rtm_prices,
)

router = APIRouter(prefix="/ercot", tags=["ERCOT Market"])


@router.get("/forecast/7day")
async def ercot_7day_forecast(db: AsyncSession = Depends(get_db)):
    """Latest published ERCOT 7-day Load Forecast by Weather Zone (system-wide)."""
    return await get_ercot_7day_forecast(db)


@router.get("/prices/dam")
async def ercot_dam_prices(
    settlement_point: str = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Most recent day's ERCOT DAM settlement point prices, hourly."""
    return await get_ercot_dam_prices(db, settlement_point)


@router.get("/prices/rtm")
async def ercot_rtm_prices(
    settlement_point: str = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Most recent day's ERCOT RTM settlement point prices, averaged hourly."""
    return await get_ercot_rtm_prices(db, settlement_point)
