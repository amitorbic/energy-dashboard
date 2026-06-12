from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from utils.database import get_db
from middleware.auth import require_auth
from controllers.broker_home import get_market_data, get_portfolio

router = APIRouter(prefix="/broker/home", tags=["broker-home"])


@router.get("/market-data")
async def market_data(
    payload: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    return await get_market_data(db)


@router.get("/portfolio")
async def portfolio(
    payload: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    broker_id = str(payload.get("broker_id", ""))
    role = str(payload.get("role", ""))
    return await get_portfolio(db, broker_id, role)
