import hashlib
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from models.schemas import LoginRequest, LoginResponse
from utils.jwt_util import create_token
from utils.tenant_module_config import get_configured_modules

# MD5 is a known-weak hash. Flagged as a real security concern but explicitly
# out of scope here -- changing it touches every existing login/user row.
# Tracked as a follow-up, not addressed by this change.


def md5_hash(password: str) -> str:
    """Match PHP MD5 password hashing."""
    return hashlib.md5(password.encode()).hexdigest()


async def login_user(
    db: AsyncSession,
    data: LoginRequest,
    rep_id: int,
    company_name: str = "",
) -> LoginResponse:
    """
    Authenticate user against the tenant's users table.
    rep_id and company_name come from request.state (hostname-resolved before this call).
    """
    hashed = md5_hash(data.password)
    result = await db.execute(
        text("""
            SELECT uid, name, email, role, must_change_password
            FROM users
            WHERE (name = :login OR email = :login)
            AND password = :password
            LIMIT 1
        """),
        {"login": data.login, "password": hashed},
    )
    user = result.fetchone()

    if not user:
        return LoginResponse(success=False, message="Invalid login or password")

    # Config-based entitlements for this phase -- see
    # docs/ORBIC_PRODUCT_MODULARIZATION_SCOPE.md section 15. Missing/empty
    # TENANT_MODULES, "enterprise", or an all-unknown value all fail open to
    # every module, never a lockout. See utils/tenant_module_config.py.
    modules = get_configured_modules()
    must_change_password = bool(user.must_change_password)

    token = create_token(
        user_id=user.uid,
        username=user.name,
        role=str(user.role),
        email=user.email,
        rep_id=rep_id,
        extra_claims={
            "company_name": company_name,
            "modules": modules,
            "must_change_password": must_change_password,
        },
    )
    return LoginResponse(
        success=True,
        token=token,
        user_id=user.uid,
        username=user.name,
        role=user.role,
        email=user.email,
        rep_id=rep_id,
        company_name=company_name,
        modules=modules,
        must_change_password=must_change_password,
    )


async def change_password(
    db: AsyncSession,
    user_id: int,
    current_password: str,
    new_password: str,
    rep_id: int,
    company_name: str = "",
) -> LoginResponse:
    """
    Verify the caller's current password, set the new one, and clear
    must_change_password. Returns a freshly-issued token/LoginResponse
    (must_change_password=false) so the frontend never holds a token that
    still claims a pending password change after a successful change --
    see require_auth's pending-change gate in middleware/auth.py.
    """
    result = await db.execute(
        text("SELECT uid, name, email, role FROM users WHERE uid = :uid AND password = :password LIMIT 1"),
        {"uid": user_id, "password": md5_hash(current_password)},
    )
    user = result.fetchone()
    if not user:
        return LoginResponse(success=False, message="Current password is incorrect")

    await db.execute(
        text("UPDATE users SET password = :password, must_change_password = 0 WHERE uid = :uid"),
        {"password": md5_hash(new_password), "uid": user_id},
    )
    await db.commit()

    modules = get_configured_modules()
    token = create_token(
        user_id=user.uid,
        username=user.name,
        role=str(user.role),
        email=user.email,
        rep_id=rep_id,
        extra_claims={
            "company_name": company_name,
            "modules": modules,
            "must_change_password": False,
        },
    )
    return LoginResponse(
        success=True,
        token=token,
        user_id=user.uid,
        username=user.name,
        role=user.role,
        email=user.email,
        rep_id=rep_id,
        company_name=company_name,
        modules=modules,
        must_change_password=False,
        message="Password updated successfully",
    )
