from fastapi import APIRouter, File, UploadFile, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from utils.database import get_db
from controllers.charges import update_manual_charges
from middleware.auth import require_auth

from sqlalchemy import text

router = APIRouter(prefix="/pricing/charges", tags=["charges"])

@router.post("/tdsp/update")
async def update_tdsp(charges: dict, db: AsyncSession = Depends(get_db)):
    return await update_manual_charges("tdsp", "prior_tdsp", charges, db)

@router.post("/supplier/update")
async def update_supplier(charges: dict, db: AsyncSession = Depends(get_db)):
    # CHANGE THIS: Use "txu" and "prior_txu" to match your DB
    return await update_manual_charges("txu", "prior_txu", charges, db)
@router.get("/tdsp/values")
async def get_tdsp(db: AsyncSession = Depends(get_db)):
    res = await db.execute(text("SELECT profile, value FROM tdsp"))
    return {row.profile: row.value for row in res.all()}

# routes/charges.py

@router.get("/tdsp/last-updated")
async def get_tdsp_status(db: AsyncSession = Depends(get_db)):
    # Finds the latest timestamp among all profiles
    result = await db.execute(text("SELECT MAX(upload_date) FROM tdsp"))
    latest = result.scalar()
    return {"latest": latest.isoformat() if latest else None}
@router.get("/supplier/values")
async def get_supplier(db: AsyncSession = Depends(get_db)):
    # Use 'txu' as the table name since that is what we agreed on for existing data
    res = await db.execute(text("SELECT profile, value FROM txu"))
    return {row.profile: row.value for row in res.all()}

@router.get("/supplier/last-updated")
async def get_supplier_status(db: AsyncSession = Depends(get_db)):
    # Finds the latest timestamp for the supplier table
    result = await db.execute(text("SELECT MAX(upload_date) FROM txu"))
    latest = result.scalar()
    return {"latest": latest.isoformat() if latest else None}