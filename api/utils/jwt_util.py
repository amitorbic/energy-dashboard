import os
from datetime import datetime, timedelta
from typing import Optional
from jose import jwt, JWTError
from dotenv import load_dotenv

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "ameripower-secret-change-in-production")
ALGORITHM  = "HS256"

ROLE_EXPIRY = {"1": 8, "2": 24, "3": 24, "admin": 8, "manager": 24, "user": 24}

def create_token(
    user_id: int,
    username: str,
    role: str,
    email: str,
    rep_id: Optional[int] = None,
    extra_claims: dict = None,
) -> str:
    hours = ROLE_EXPIRY.get(str(role), 24)
    payload = {
        "user_id":  user_id,
        "username": username,
        "role":     role,
        "email":    email,
        "exp":      datetime.utcnow() + timedelta(hours=hours),
        "iat":      datetime.utcnow()
    }
    if rep_id is not None:
        payload["rep_id"] = rep_id
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def verify_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None

def decode_token(token: str) -> Optional[dict]:
    return verify_token(token)
