from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from utils.database import get_db
from controllers.broker_auth import broker_login, broker_forgot_password
from middleware.auth import require_auth

router = APIRouter(prefix="/broker/auth", tags=["broker-auth"])


class BrokerLoginRequest(BaseModel):
    login: str
    password: str


class BrokerForgotRequest(BaseModel):
    email: str
    name: str


@router.post("/login")
async def login(data: BrokerLoginRequest, db: AsyncSession = Depends(get_db)):
    return await broker_login(db, data.login, data.password)


@router.post("/logout")
async def logout(payload: dict = Depends(require_auth)):
    # JWT is stateless — client drops the token; server confirms
    return {"success": True, "message": "Logged out"}


@router.get("/me")
async def get_me(payload: dict = Depends(require_auth)):
    return {
        "user_id":   payload.get("user_id"),
        "username":  payload.get("username"),
        "role":      payload.get("role"),
        "email":     payload.get("email"),
        "broker_id": payload.get("broker_id"),
    }


@router.post("/forgot-password")
async def forgot_password(
    data: BrokerForgotRequest, db: AsyncSession = Depends(get_db)
):
    return await broker_forgot_password(db, data.email, data.name)
