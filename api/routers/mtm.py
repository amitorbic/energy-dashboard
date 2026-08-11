from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from utils.database import get_db
from controllers.mtm import (
    get_mtm_summary,
    get_mtm_by_deal,
    calculate_mtm,
    upload_market_prices,
    get_market_prices,
)

router = APIRouter(prefix="/mtm", tags=["MTM"])


@router.get("/summary")
async def mtm_summary(db: AsyncSession = Depends(get_db)):
    """MTM by zone, total P&L, count of deals — for the latest calculated date."""
    return await get_mtm_summary(db)


@router.get("/by-deal")
async def mtm_by_deal(
    calc_date: str = Query(None, description="YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
):
    """MTM per deal with all details."""
    return await get_mtm_by_deal(db, calc_date)


@router.get("/prices")
async def mtm_prices(
    price_date: str = Query(..., description="YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
):
    """Market prices already entered for a date."""
    return await get_market_prices(db, price_date)


@router.post("/calculate")
async def mtm_calculate(data: dict, db: AsyncSession = Depends(get_db)):
    """Run MTM for all open deals as of price_date, save to mtm_results."""
    price_date = data.get("price_date")
    if not price_date:
        raise HTTPException(status_code=400, detail="price_date is required")
    return await calculate_mtm(db, price_date)


@router.post("/prices/upload")
async def mtm_prices_upload(prices: list[dict], db: AsyncSession = Depends(get_db)):
    """Manual price upload."""
    if not prices:
        raise HTTPException(status_code=400, detail="No prices provided")
    return await upload_market_prices(db, prices)
