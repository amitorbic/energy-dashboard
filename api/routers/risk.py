from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from utils.database import get_db
from controllers.risk import (
    calculate_overall_risk,
    calculate_position_risk,
    calculate_price_risk,
    calculate_customer_risk,
    calculate_weather_risk,
    get_risk_history,
)

router = APIRouter(prefix="/risk", tags=["Risk"])


@router.get("/current")
async def risk_current(db: AsyncSession = Depends(get_db)):
    """Fresh overall risk calculation across all four components, saved to risk_scores."""
    return await calculate_overall_risk(db)


@router.get("/history")
async def risk_history(
    days: int = Query(30, description="Number of days of history to return"),
    db: AsyncSession = Depends(get_db),
):
    """Last N days of saved risk_scores rows."""
    return await get_risk_history(db, days)


@router.get("/position")
async def risk_position(db: AsyncSession = Depends(get_db)):
    """Position risk only: forecast load vs hedged supply across horizons."""
    return await calculate_position_risk(db)


@router.get("/price")
async def risk_price(db: AsyncSession = Depends(get_db)):
    """Price risk only: mark-to-market P&L vs portfolio value."""
    return await calculate_price_risk(db)


@router.get("/customer")
async def risk_customer(db: AsyncSession = Depends(get_db)):
    """Customer risk only: collections delinquency exposure."""
    return await calculate_customer_risk(db)


@router.get("/weather")
async def risk_weather(db: AsyncSession = Depends(get_db)):
    """Weather risk only: next-7-day load forecast vs prior year."""
    return await calculate_weather_risk(db)
