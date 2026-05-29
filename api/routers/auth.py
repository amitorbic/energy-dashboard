from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from utils.database import get_db
from models.schemas import LoginRequest, LoginResponse
from controllers.auth import login_user
from middleware.auth import require_auth

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/login", response_model=LoginResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    return await login_user(db, data)

@router.post("/logout")
async def logout(payload: dict = Depends(require_auth)):
    return {"success": True, "message": "Logged out"}

@router.get("/me")
async def get_me(payload: dict = Depends(require_auth)):
    return {
        "user_id":  payload.get("user_id"),
        "username": payload.get("username"),
        "role":     payload.get("role"),
        "email":    payload.get("email")
    }
