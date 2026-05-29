from fastapi import APIRouter, File, UploadFile, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from utils.database import get_db
# Remove unused schema imports if not strictly needed for the logic
from controllers.gas_strip import upload_gas_strip_data, fetch_dates, download_sample,get_last_updated_timestamp
from middleware.auth import require_auth

router = APIRouter(prefix="/pricing/gas-strip", tags=["Gas Strip"])

@router.post("/upload")
async def upload_gas_strip(
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_db),
    user: dict = Depends(require_auth)  # ← add this
):
    return await upload_gas_strip_data(file, session)

@router.get("/dates")
async def get_dates(session: AsyncSession = Depends(get_db)):
    return await fetch_dates(session)

@router.get("/download-sample")
async def download_sample_file():
    return download_sample() # Removed await as it returns FileResponse directly

@router.get("/last-updated")
async def get_last_update(session: AsyncSession = Depends(get_db)):
    return await get_last_updated_timestamp(session)