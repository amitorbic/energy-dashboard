from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from utils.database import get_db
from controllers.hedging import (
    add_hedge,
    get_hedges,
    get_hedge,
    update_hedge,
    delete_hedge,
    get_hedge_summary,
)

router = APIRouter(prefix="/hedging", tags=["Hedging"])


@router.get("/summary")
async def hedge_summary(
    zone: str = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Portfolio hedge summary — total MW hedged by zone/block/month"""
    return await get_hedge_summary(zone, db)


@router.get("")
async def list_hedges(
    zone: str = Query(None),
    block_type: str = Query(None),
    instrument_type: str = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """List all hedge book entries"""
    return await get_hedges(zone, block_type, instrument_type, db)


@router.post("")
async def create_hedge(data: dict, db: AsyncSession = Depends(get_db)):
    """Add new hedge — deal_number is mandatory"""
    if not data.get("deal_number"):
        raise HTTPException(status_code=400, detail="Deal number is mandatory")
    if not data.get("zone"):
        raise HTTPException(status_code=400, detail="Zone is required")
    if not data.get("delivery_start") or not data.get("delivery_end"):
        raise HTTPException(
            status_code=400, detail="Delivery start and end dates required"
        )
    if not data.get("volume_mw") or float(data.get("volume_mw", 0)) <= 0:
        raise HTTPException(status_code=400, detail="Volume must be greater than 0")
    if not data.get("price") or float(data.get("price", 0)) <= 0:
        raise HTTPException(status_code=400, detail="Price must be greater than 0")
    result = await add_hedge(data, db)
    return result


@router.get("/{hedge_id}")
async def get_one_hedge(hedge_id: int, db: AsyncSession = Depends(get_db)):
    hedge = await get_hedge(hedge_id, db)
    if not hedge:
        raise HTTPException(status_code=404, detail="Hedge not found")
    return hedge


@router.put("/{hedge_id}")
async def edit_hedge(hedge_id: int, data: dict, db: AsyncSession = Depends(get_db)):
    if not data.get("deal_number"):
        raise HTTPException(status_code=400, detail="Deal number is mandatory")
    await update_hedge(hedge_id, data, db)
    return {"status": "updated"}


@router.delete("/{hedge_id}")
async def remove_hedge(hedge_id: int, db: AsyncSession = Depends(get_db)):
    await delete_hedge(hedge_id, db)
    return {"status": "deleted"}
