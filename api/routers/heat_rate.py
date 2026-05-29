from fastapi import APIRouter, File, UploadFile, Depends
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
import os

from utils.database import get_db
from middleware.auth import require_auth
from sqlalchemy import delete,text,select

# Import the controller functions
# Note: I've updated 'get_latest_timestamp' to 'get_last_updated' to match our controller logic
from controllers.heat_rate import (
    upload_heat_rate_data, 
    fetch_heat_rate_dates, 
    get_last_updated
)

router = APIRouter(prefix="/pricing/heat-rate", tags=["Heat-Rate"])

# 1. UPLOAD
@router.post("/upload")
async def upload_heat_rate(
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_db),
    user: dict = Depends(require_auth)
):
    # Calls the controller we built for the 265-column wide format
    return await upload_heat_rate_data(file, session)

# 2. GET ALL DATES
@router.get("/dates")
async def fetch_dates(session: AsyncSession = Depends(get_db)):
    # Calls the controller to get unique dates for the dropdown
    return await fetch_heat_rate_dates(session)

# 3. GET LAST UPDATED
@router.get("/last-updated")
async def get_last_update(db: AsyncSession = Depends(get_db)):
    # 1. Get the single newest timestamp from the history table
    # We use upload_date because that's where your data is stored
    result = await db.execute(
        text("SELECT MAX(upload_date) FROM heat_rates_history")
    )
    latest = result.scalar()

    # 2. Debug print (Check your Uvicorn terminal!)
    print(f"DEBUG: Found latest timestamp: {latest}")

    if not latest:
        return {"latest": None}

    # 3. Return ISO format so JavaScript's new Date() can read it
    return {"latest": latest.isoformat()}

# 4. DOWNLOAD SAMPLE
@router.get("/download-sample")
async def download_sample():
    # Points to the static assets folder
    file_path = "assets/heat_rate_sample.xlsx"
    
    if not os.path.exists(file_path):
        # Professional tip: Use a 404 HTTPException here instead of a simple dict
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Sample file not found on server")
        
    return FileResponse(
        path=file_path, 
        filename="heat_rate_sample.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )