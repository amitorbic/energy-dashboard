import hashlib
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from models.schemas import LoginRequest, LoginResponse
from utils.jwt_util import create_token

def md5_hash(password: str) -> str:
    """Match PHP MD5 password hashing."""
    return hashlib.md5(password.encode()).hexdigest()

async def login_user(db: AsyncSession, data: LoginRequest) -> LoginResponse:
    """
    Authenticate user against users table.
    Matches PHP: SELECT * FROM users WHERE (name LIKE '$login' OR email LIKE '$login')
                 AND password LIKE MD5('$pass')
    """
    hashed = md5_hash(data.password)
    result = await db.execute(
        text("""
            SELECT uid, name, email, role
            FROM users
            WHERE (name = :login OR email = :login)
            AND password = :password
            LIMIT 1
        """),
        {"login": data.login, "password": hashed}
    )
    user = result.fetchone()

    if not user:
        return LoginResponse(success=False, message="Invalid login or password")

    token = create_token(
        user_id=user.uid,
        username=user.name,
        role=str(user.role),
        email=user.email
    )
    return LoginResponse(
        success=True,
        token=token,
        user_id=user.uid,
        username=user.name,
        role=user.role,
        email=user.email
    )
