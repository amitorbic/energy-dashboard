from typing import Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from controllers.tdsp_calendar import list_tdsp_calendar_status, upload_tdsp_calendar
from middleware.auth import require_admin
from utils.database import get_db

router = APIRouter(prefix="/admin/tdsp-calendar", tags=["admin"])


@router.get("/status")
async def get_status(
    admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    return await list_tdsp_calendar_status(db)


@router.post("/upload")
async def upload(
    file: UploadFile = File(...),
    format: str = Form(...),
    tdsp_name: str = Form(...),
    year: int = Form(...),
    tdsp_duns: Optional[str] = Form(None),
    admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    return await upload_tdsp_calendar(file, format, tdsp_name, year, tdsp_duns, db)
