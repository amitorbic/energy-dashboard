from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from utils.database import get_db
from controllers.portfolio import (
    get_portfolio_summary,
    get_portfolio_by_zone,
    get_portfolio_customers,
    get_open_position,
    get_portfolio_forecast,
    get_load_with_losses,
    get_load_unadjusted,
    get_load_combined,
    get_available_dates,
    get_forecast_data,
    get_dna_forecast_data,
)

router = APIRouter(prefix="/portfolio", tags=["Portfolio"])


@router.get("/summary")
async def portfolio_summary(db: AsyncSession = Depends(get_db)):
    """Total portfolio — customer count, zones, contract types, horizon"""
    return await get_portfolio_summary(db)


@router.get("/by-zone")
async def portfolio_by_zone(db: AsyncSession = Depends(get_db)):
    """Customer count + estimated MW by zone"""
    return await get_portfolio_by_zone(db)


@router.get("/customers")
async def portfolio_customers(
    zone: str = Query(None),
    contract_type: str = Query(None),
    status: str = Query("active"),
    search: str = Query(None),
    page: int = Query(1),
    limit: int = Query(50),
    db: AsyncSession = Depends(get_db),
):
    """Full customer list with filters"""
    return await get_portfolio_customers(
        db, zone, contract_type, status, search, page, limit
    )


@router.get("/open-position")
async def open_position(
    zone: str = Query(None),
    granularity: str = Query("monthly"),  # monthly, weekly, daily
    db: AsyncSession = Depends(get_db),
):
    """Open position = total load through last contract end date"""
    return await get_open_position(db, zone, granularity)


@router.get("/forecast")
async def portfolio_forecast(
    zone: str = Query(None),
    method: str = Query("composite"),  # base, weather, bias, analog, composite
    horizon: str = Query("monthly"),
    db: AsyncSession = Depends(get_db),
):
    """Load forecast using our 5 methods"""
    return await get_portfolio_forecast(db, zone, method, horizon)


@router.get("/load/with-losses")
async def load_with_losses(
    oper_date: str = Query(..., description="YYYY-MM-DD"),
    settlement_run: str = Query("RTM_INITIAL"),
    zone: str | None = Query(None, description="HOUSTON|NORTH|SOUTH|WEST"),
    db: AsyncSession = Depends(get_db),
):
    """Hourly load with losses by zone — from portfolio_load_with_losses."""
    return await get_load_with_losses(db, oper_date, settlement_run, zone)


@router.get("/load/unadjusted")
async def load_unadjusted(
    oper_date: str = Query(..., description="YYYY-MM-DD"),
    settlement_run: str = Query("RTM_INITIAL"),
    zone: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Hourly load without losses by zone — from portfolio_load_unadjusted."""
    return await get_load_unadjusted(db, oper_date, settlement_run, zone)


@router.get("/load/combined")
async def load_combined(
    oper_date: str = Query(..., description="YYYY-MM-DD"),
    settlement_run: str = Query("RTM_INITIAL"),
    db: AsyncSession = Depends(get_db),
):
    """Both load types in one call — used by position screen."""
    return await get_load_combined(db, oper_date, settlement_run)


@router.get("/load/dates")
async def load_available_dates(
    db: AsyncSession = Depends(get_db),
):
    """Distinct processed dates for the date-picker on the position screen."""
    return await get_available_dates(db)


@router.post("/position")
async def portfolio_position(
    criteria: dict,
    db: AsyncSession = Depends(get_db),
):
    print(f"DEBUG portfolio_position called load_type={criteria.get('load_type')}")
    from controllers.portfolio import get_position_data, get_forecast_data

    print(f"DEBUG imported get_forecast_data={get_forecast_data}")

    load_type = criteria.get("load_type", "ERCOT Shape Forecast")

    FORECAST_TYPES = [
        "ERCOT Shape Forecast",
        "DNA Forecast",
        "Minimum Forecast",
        "Maximum Forecast",
        "Forecast Bands",
        "What-If Forecast",
    ]

    ACTUAL_TYPES = [
        "Actual (With Losses)",
        "Actual (Unadjusted)",
    ]

    if load_type == "ERCOT Shape Forecast":
        return await get_forecast_data(criteria, db)
    elif load_type == "DNA Forecast":
        return await get_dna_forecast_data(criteria, db)
    elif load_type in ACTUAL_TYPES:
        return await get_position_data(criteria, db)
    else:
        return await get_forecast_data(criteria, db)
