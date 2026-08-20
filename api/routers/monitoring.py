from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from utils.database import get_db
from controllers.monitoring import get_latest_checkpoints, get_checkpoint_history

router = APIRouter(prefix="/monitoring", tags=["Monitoring"])


@router.get("/checkpoints")
async def monitoring_checkpoints(db: AsyncSession = Depends(get_db)):
    """Latest result per forecast-engine checkpoint."""
    return await get_latest_checkpoints(db)


@router.get("/checkpoints/history")
async def monitoring_checkpoints_history(
    days: int = Query(30),
    db: AsyncSession = Depends(get_db),
):
    """Last N days of checkpoint results, for trend charts."""
    return await get_checkpoint_history(db, days)
