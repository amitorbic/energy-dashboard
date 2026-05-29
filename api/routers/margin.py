from fastapi import APIRouter, Depends, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from utils.database import get_db
from controllers.margin import upload_margin_matrix

router = APIRouter(prefix="/pricing/margin", tags=["margin"])


@router.post("/upload")
async def upload_margin(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    # The variable name MUST be 'file' to match the frontend
    return await upload_margin_matrix(file, db)

@router.get("/last-updated")
async def get_margin_status(db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("SELECT MAX(upload_date) FROM margin"))
    latest = result.scalar()
    return {"latest": latest.isoformat() if latest else None}

@router.get("/view")
async def view_margin_data(db: AsyncSession = Depends(get_db)):
    # Fetch all rows to display in the frontend table
    result = await db.execute(text("SELECT * FROM margin ORDER BY term ASC"))
    # Convert rows to list of dicts
    rows = [dict(row._mapping) for row in result.all()]
    return rows