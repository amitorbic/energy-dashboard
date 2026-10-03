import os
from fastapi import HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from utils.jwt_util import verify_token

security = HTTPBearer()

# Endpoints an authenticated-but-pending-password-change user may still call --
# the change-password endpoint itself, plus session endpoints needed to
# complete or abandon the flow. Everything else 403s while the flag is set.
# See migration 045 / controllers/auth.py's must_change_password claim.
_PASSWORD_CHANGE_EXEMPT_PATHS = {
    "/api/auth/change-password",
    "/api/auth/logout",
    "/api/auth/me",
}


async def require_auth(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    """
    JWT auth dependency.  Guarantees:
      1. Token is valid and unexpired.
      2. Token's rep_id matches this deployment's TENANT_REP_ID (defense-in-depth).
         If the token pre-dates multi-tenancy (no rep_id claim), the check is
         skipped so existing sessions continue to work without forced re-login.
      3. If the token carries must_change_password=true, only a small allowlist
         of auth/session endpoints are reachable -- every other protected route
         403s until the password is changed (see change-password's re-issued
         token). Legacy tokens without this claim are unaffected.
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

    if payload.get("must_change_password") and request.url.path not in _PASSWORD_CHANGE_EXEMPT_PATHS:
        raise HTTPException(
            status_code=403,
            detail="Password change required before continuing",
        )

    return payload


async def require_admin(payload: dict = Depends(require_auth)):
    if str(payload.get("role")) not in ("1", "admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return payload


def require_module(module: str):
    """
    Dependency factory: 403s unless the caller's JWT `modules` claim includes
    `module`. Config-based entitlement for this pilot phase -- see
    docs/ORBIC_PRODUCT_MODULARIZATION_SCOPE.md section 15 and
    utils/tenant_module_config.py. Legacy tokens issued before the `modules`
    claim existed have no `modules` key and are always allowed through, so
    old sessions keep working.
    """

    async def _check(payload: dict = Depends(require_auth)):
        modules = payload.get("modules")
        if modules is not None and module not in modules:
            raise HTTPException(
                status_code=403,
                detail=f"The '{module}' module is not included in your ORBIC subscription",
            )
        return payload

    return _check


def require_any_module(*modules: str):
    """
    Like require_module, but passes if the caller has ANY of the listed
    modules -- for the handful of endpoints genuinely shared by two product
    flows (e.g. a commission row edit used by both Sales and Commission
    Audit). Legacy tokens without a `modules` claim are still allowed through.
    """

    async def _check(payload: dict = Depends(require_auth)):
        claim = payload.get("modules")
        if claim is not None and not any(m in claim for m in modules):
            raise HTTPException(
                status_code=403,
                detail=f"None of the required modules ({', '.join(modules)}) are included in your ORBIC subscription",
            )
        return payload

    return _check
