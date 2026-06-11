from typing import Optional
from fastapi import APIRouter, Depends, File, Form, UploadFile
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.auth import require_auth
from utils.consumer_database import get_consumer_db
from utils.jwt_util import create_token
from controllers.consumer import (
    login_consumer,
    list_users,
    create_user,
    update_user,
    toggle_user_status,
    upload_meters_excel,
    get_all_logs,
    list_meters,
    add_esiid,
    submit_request,
)

router = APIRouter(prefix="/consumer", tags=["consumer"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    login: str
    password: str


class CreateUserRequest(BaseModel):
    name: str
    password: str
    email: str


class UpdateUserRequest(BaseModel):
    name: str
    email: str
    password: Optional[str] = None


class AddEsiidRequest(BaseModel):
    uid: int
    esid: str
    service_address: str
    unit_number: str = ""
    city: str
    zip: str


class MeterRequestPayload(BaseModel):
    srs: list[int]
    action: str          # "add" | "cancel"
    timing: str          # "same_day" | "first_available" | "custom"
    custom_date: Optional[str] = None
    contact_name: str
    contact_phone: str
    contact_email: str
    comments: str = ""


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

@router.post("/auth/login")
async def consumer_login(
    data: LoginRequest,
    db: AsyncSession = Depends(get_consumer_db),
):
    user = await login_consumer(db, data.login, data.password)
    token = create_token(
        user_id=user["uid"],
        username=user["name"],
        role=str(user["role"]),
        email=user["email"],
    )
    return {
        "success": True,
        "token": token,
        "user_id": user["uid"],
        "username": user["name"],
        "role": user["role"],
        "email": user["email"],
    }


@router.get("/auth/me")
async def consumer_me(payload: dict = Depends(require_auth)):
    return {
        "user_id": payload.get("user_id"),
        "username": payload.get("username"),
        "role": payload.get("role"),
        "email": payload.get("email"),
    }


# ---------------------------------------------------------------------------
# Admin — users
# ---------------------------------------------------------------------------

@router.get("/admin/users")
async def admin_list_users(
    db: AsyncSession = Depends(get_consumer_db),
    payload: dict = Depends(require_auth),
):
    return await list_users(db)


@router.post("/admin/users")
async def admin_create_user(
    data: CreateUserRequest,
    db: AsyncSession = Depends(get_consumer_db),
    payload: dict = Depends(require_auth),
):
    return await create_user(db, data.name, data.password, data.email)


@router.put("/admin/users/{uid}")
async def admin_update_user(
    uid: int,
    data: UpdateUserRequest,
    db: AsyncSession = Depends(get_consumer_db),
    payload: dict = Depends(require_auth),
):
    await update_user(db, uid, data.name, data.password, data.email)
    return {"success": True}


@router.patch("/admin/users/{uid}/status")
async def admin_toggle_status(
    uid: int,
    db: AsyncSession = Depends(get_consumer_db),
    payload: dict = Depends(require_auth),
):
    new_status = await toggle_user_status(db, uid)
    return {"success": True, "status": new_status}


# ---------------------------------------------------------------------------
# Admin — Excel upload
# ---------------------------------------------------------------------------

@router.post("/admin/upload")
async def admin_upload(
    uid: int = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_consumer_db),
    payload: dict = Depends(require_auth),
):
    count = await upload_meters_excel(db, uid, file)
    return {"success": True, "inserted": count}


# ---------------------------------------------------------------------------
# Admin — logs
# ---------------------------------------------------------------------------

@router.get("/admin/logs")
async def admin_logs(
    db: AsyncSession = Depends(get_consumer_db),
    payload: dict = Depends(require_auth),
):
    return await get_all_logs(db)


# ---------------------------------------------------------------------------
# Customer — meters
# ---------------------------------------------------------------------------

@router.get("/meters")
async def customer_meters(
    db: AsyncSession = Depends(get_consumer_db),
    payload: dict = Depends(require_auth),
):
    uid = payload.get("user_id")
    return await list_meters(db, uid)


@router.post("/meters/esiid")
async def customer_add_esiid(
    data: AddEsiidRequest,
    db: AsyncSession = Depends(get_consumer_db),
    payload: dict = Depends(require_auth),
):
    admin_name = payload.get("username", "Admin")
    await add_esiid(
        db,
        uid=data.uid,
        admin_name=admin_name,
        esid=data.esid,
        service_address=data.service_address,
        unit_number=data.unit_number,
        city=data.city,
        zip_code=data.zip,
    )
    return {"success": True}


@router.post("/meters/request")
async def customer_submit_request(
    data: MeterRequestPayload,
    db: AsyncSession = Depends(get_consumer_db),
    payload: dict = Depends(require_auth),
):
    uid = payload.get("user_id")
    customer_name = payload.get("username", "Customer")
    await submit_request(
        db,
        uid=uid,
        srs=data.srs,
        action=data.action,
        timing=data.timing,
        custom_date=data.custom_date,
        contact_name=data.contact_name,
        contact_phone=data.contact_phone,
        contact_email=data.contact_email,
        comments=data.comments,
        customer_name=customer_name,
    )
    return {"success": True}
