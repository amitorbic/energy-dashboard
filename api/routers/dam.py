from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from utils.database import get_db
from controllers.dam import (
    add_dam_entry,
    get_dam_entries,
    delete_dam_entry,
    upload_dam_file,
    get_dam_summary,
)

router = APIRouter(prefix="/dam", tags=["DAM Purchases"])


@router.get("/summary")
async def dam_summary(
    oper_date: str = Query(None),
    db: AsyncSession = Depends(get_db),
):
    return await get_dam_summary(oper_date, db)


@router.get("")
async def list_dam(
    oper_date: str = Query(None),
    location: str = Query(None),
    db: AsyncSession = Depends(get_db),
):
    return await get_dam_entries(oper_date, location, db)


@router.post("")
async def create_dam(data: dict, db: AsyncSession = Depends(get_db)):
    """Manual entry — single hour or full day"""
    if not data.get("oper_date"):
        raise HTTPException(status_code=400, detail="Operating date required")
    if not data.get("location"):
        raise HTTPException(status_code=400, detail="Location required")
    return await add_dam_entry(data, db)


@router.post("/upload")
async def upload_dam(
    file: UploadFile = File(...),
    oper_date: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload DAM spreadsheet — parses volume+price rows per deal"""
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(
            status_code=400, detail="Excel file required (.xlsx or .xls)"
        )
    contents = await file.read()
    return await upload_dam_file(contents, oper_date, db)


@router.delete("/{dam_id}")
async def remove_dam(dam_id: int, db: AsyncSession = Depends(get_db)):
    await delete_dam_entry(dam_id, db)
    return {"status": "deleted"}
