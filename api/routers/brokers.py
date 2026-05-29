from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from utils.database import get_db
from controllers.brokers import (
    create_broker,
    get_brokers,
    get_broker,
    update_broker,
    update_broker_status,
    delete_broker,
)

router = APIRouter(prefix="/brokers", tags=["Brokers"])


@router.post("")
async def add_broker(data: dict, db: AsyncSession = Depends(get_db)):
    sid = await create_broker(data, db)
    return {"id": sid}


@router.get("")
async def list_brokers(db: AsyncSession = Depends(get_db)):
    return await get_brokers(db)


@router.get("/logs")
async def get_logs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("SELECT * FROM broker_logs ORDER BY sent_at DESC LIMIT 500")
    )
    return [dict(row) for row in result.mappings()]


@router.get("/dropdown")
async def get_broker_dropdown(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text(
            "SELECT sid, broker_code, company_name FROM broker_new WHERE regular_status != 'inactive' ORDER BY company_name"
        )
    )
    return [dict(row) for row in result.mappings()]


@router.get("/{sid}")
async def get_one(sid: int, db: AsyncSession = Depends(get_db)):
    broker = await get_broker(sid, db)
    if not broker:
        raise HTTPException(status_code=404, detail="Broker not found")
    return broker


@router.put("/{sid}")
async def edit_broker(sid: int, data: dict, db: AsyncSession = Depends(get_db)):
    await update_broker(sid, data, db)
    return {"status": "updated"}


@router.patch("/{sid}/status")
async def toggle_status(sid: int, data: dict, db: AsyncSession = Depends(get_db)):
    await update_broker_status(sid, data.get("status"), db)
    return {"status": "updated"}


@router.delete("/{sid}")
async def remove_broker(sid: int, db: AsyncSession = Depends(get_db)):
    await delete_broker(sid, db)
    return {"status": "deleted"}
