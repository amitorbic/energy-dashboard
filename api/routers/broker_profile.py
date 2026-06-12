"""
Broker Profile & Admin router — prefix /api/broker/profile
All endpoints require require_auth. Admin endpoints additionally check role==1.
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel

from middleware.auth import require_auth
from utils.database import get_db
from sqlalchemy.ext.asyncio import AsyncSession

from controllers.broker_profile import (
    get_profile,
    change_password,
    get_current_password_plain,
    send_commission_email,
    get_all_users,
    create_user,
    update_user,
    upload_users,
    get_forgot_list,
    get_contract_log,
)

router = APIRouter(prefix="/broker/profile", tags=["broker-profile"])


def _require_admin(payload: dict) -> None:
    if str(payload.get("role", "")) != "1":
        raise HTTPException(status_code=403, detail="Admin only")


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------

@router.get("/me")
async def profile_me(
    payload: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    user_id = payload.get("user_id") or payload.get("sub")
    return await get_profile(db, int(user_id))


@router.get("/old-password")
async def old_password(
    payload: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Returns plaintext password from md5_decode — mirrors change_password.php pre-fill."""
    broker_id = payload.get("broker_id", "")
    plain = await get_current_password_plain(db, broker_id)
    return {"old_password": plain}


class ChangePasswordRequest(BaseModel):
    old_pass:     str
    new_pass:     str
    confirm_pass: str


@router.post("/change-password")
async def change_pwd(
    req: ChangePasswordRequest,
    payload: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    broker_id = payload.get("broker_id", "")
    email     = payload.get("email", "")
    return await change_password(db, broker_id, email, req.old_pass, req.new_pass, req.confirm_pass)


# ---------------------------------------------------------------------------
# Commission
# ---------------------------------------------------------------------------

@router.post("/commission-email")
async def commission_email(
    payload: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    broker_id = payload.get("broker_id", "")
    return await send_commission_email(db, broker_id)


# ---------------------------------------------------------------------------
# Admin — Users
# ---------------------------------------------------------------------------

@router.get("/admin/users")
async def list_users(
    payload: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(payload)
    return await get_all_users(db)


class CreateUserRequest(BaseModel):
    name:     str
    brokerid: str
    email:    str
    password: str


@router.post("/admin/users/create")
async def create_user_endpoint(
    req: CreateUserRequest,
    payload: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(payload)
    return await create_user(db, req.name, req.brokerid, req.email, req.password)


class UpdateUserRequest(BaseModel):
    target_broker_id: str
    name:             str
    email:            str
    password:         str


@router.post("/admin/users/update")
async def update_user_endpoint(
    req: UpdateUserRequest,
    payload: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(payload)
    return await update_user(db, req.target_broker_id, req.name, req.email, req.password)


# ---------------------------------------------------------------------------
# Admin — Upload Users
# ---------------------------------------------------------------------------

@router.post("/admin/users/upload")
async def upload_users_endpoint(
    file: UploadFile = File(...),
    payload: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(payload)
    file_bytes = await file.read()
    return await upload_users(db, file_bytes)


# ---------------------------------------------------------------------------
# Admin — Forgot Password List
# ---------------------------------------------------------------------------

@router.get("/admin/forgot-list")
async def forgot_list(
    payload: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(payload)
    return await get_forgot_list(db)


# ---------------------------------------------------------------------------
# Admin — Contract Log
# ---------------------------------------------------------------------------

@router.get("/admin/contract-log")
async def contract_log(
    vendor_id: str = "",
    com_name:  str = "",
    str_date:  str = "",
    end_date:  str = "",
    payload: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(payload)
    return await get_contract_log(db, vendor_id, com_name, str_date, end_date)
