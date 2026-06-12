import hashlib
import os
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from utils.jwt_util import create_token
from utils.email import send_email_async


def md5_hash(password: str) -> str:
    """Matches PHP md5() used in index.php login query."""
    return hashlib.md5(password.encode()).hexdigest()


async def broker_login(db: AsyncSession, login: str, password: str) -> dict:
    """
    Mirrors index.php POST handler:
      SELECT * FROM contract_user
      WHERE (email LIKE '{login}' OR name LIKE '{login}')
      AND password LIKE '{md5(pass)}'
    Session fields mapped to JWT claims:
      user_id, name, broker_id, broker_emailid, role
    """
    hashed = md5_hash(password)
    result = await db.execute(
        text("""
            SELECT uid, name, email, broker_id, role
            FROM contract_user
            WHERE (email = :login OR name = :login)
            AND password = :password
            LIMIT 1
        """),
        {"login": login, "password": hashed},
    )
    user = result.fetchone()

    if not user:
        return {"success": False, "message": "Wrong login/password, Please try again"}

    # Check commission file — mirrors header1.php (non-admin only)
    has_commission = False
    if str(user.role) != "1":
        comm = await db.execute(
            text("""
                SELECT c.comm_file_link
                FROM comm_vendors c
                LEFT JOIN broker_new b ON b.vendor = c.vendor
                WHERE b.broker_code = :bid
                LIMIT 1
            """),
            {"bid": user.broker_id},
        )
        comm_row = comm.fetchone()
        has_commission = bool(comm_row and comm_row[0])

    token = create_token(
        user_id=user.uid,
        username=user.name,
        role=str(user.role),
        email=user.email,
        extra_claims={"broker_id": user.broker_id},
    )
    return {
        "success":        True,
        "token":          token,
        "user_id":        user.uid,
        "username":       user.name,
        "role":           str(user.role),
        "email":          user.email,
        "broker_id":      user.broker_id,
        "has_commission": has_commission,
    }


async def broker_forgot_password(db: AsyncSession, email: str, name: str) -> dict:
    """
    Mirrors forget_password.php POST handler:
      - Validates email exists in contract_user
      - Notifies admin via email (replaces hardcoded narendra@ with env CONSUMER_NOTIFY_EMAIL)
      - Returns 'We will soon contact you'
    """
    result = await db.execute(
        text("SELECT uid FROM contract_user WHERE email = :email LIMIT 1"),
        {"email": email},
    )
    user = result.fetchone()

    if not user:
        return {"success": False, "message": "Email not found in our records"}

    admin_email = os.getenv("CONSUMER_NOTIFY_EMAIL", "amit@enertsol.com")
    html = f"""
    <p>A broker has requested a password reset on the Orbic portal.</p>
    <p><strong>Email:</strong> {email}</p>
    <p><strong>Username:</strong> {name}</p>
    """
    await send_email_async(admin_email, "Broker Password Reset Request", html)

    return {"success": True, "message": "We will soon contact you"}
