import os
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from utils.jwt_util import verify_token

security = HTTPBearer()


async def require_auth(
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    """
    JWT auth dependency.  Two guarantees:
      1. Token is valid and unexpired.
      2. Token's rep_id matches this deployment's TENANT_REP_ID (defense-in-depth).
         If the token pre-dates multi-tenancy (no rep_id claim), the check is
         skipped so existing sessions continue to work without forced re-login.
    """
    payload = verify_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    token_rep_id  = payload.get("rep_id")
    tenant_rep_id = int(os.getenv("TENANT_REP_ID", "0")) or None

    if token_rep_id is not None and tenant_rep_id is not None:
        if token_rep_id != tenant_rep_id:
            raise HTTPException(
                status_code=403,
                detail="Token issued for a different tenant",
            )

    return payload


async def require_admin(payload: dict = Depends(require_auth)):
    if str(payload.get("role")) not in ("1", "admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return payload
