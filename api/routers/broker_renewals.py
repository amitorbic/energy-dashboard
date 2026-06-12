from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.auth import require_auth
from utils.database import get_db
from controllers.broker_renewals import (
    change_company_name,
    get_active_renewals,
    get_brokers,
    upload_renewal_offer,
)

router = APIRouter(prefix="/broker/renewals", tags=["broker-renewals"])


@router.get("/brokers")
async def brokers(
    payload: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    return await get_brokers(db)


@router.get("/active")
async def active_renewals(
    broker_id: str = "",
    search: str = "",
    payload: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """
    Mirrors active_renewals.php / renewal_custom.php.
    Admin may pass broker_id query param to view another broker's data.
    Non-admin always uses their own broker_id from JWT.
    """
    effective_broker_id = (
        broker_id if (broker_id and str(payload.get("role", "")) == "1")
        else str(payload.get("broker_id", ""))
    )
    return await get_active_renewals(db, effective_broker_id, search)


@router.post("/change-company-name")
async def change_company(
    body: dict,
    payload: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    return await change_company_name(
        db,
        esiid=str(body.get("esiid", "")),
        cname=str(body.get("cname", "")),
    )


@router.post("/upload-offer")
async def upload_offer(
    file: UploadFile = File(...),
    payload: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    content = await file.read()
    return await upload_renewal_offer(db, content)
