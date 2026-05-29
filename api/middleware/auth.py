from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from utils.jwt_util import verify_token

security = HTTPBearer()

async def require_auth(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """JWT auth dependency — add to any protected route with Depends(require_auth)."""
    payload = verify_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return payload

async def require_admin(payload: dict = Depends(require_auth)):
    if str(payload.get("role")) not in ("1", "admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return payload
