"""
Broker Profile & Admin — exact replication of:
  view_profile.php, change_password.php, download_comm.php,
  signup.php, user.php, edit_user.php, contract_log.php,
  forget_password_list.php, contract_user_upload.php
"""

import hashlib
import os
import random
import string
from datetime import datetime, timedelta
from typing import List, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from utils.email import send_email_async

try:
    import phpserialize
    _HAS_PHPSERIALIZE = True
except ImportError:
    _HAS_PHPSERIALIZE = False


def _md5(s: str) -> str:
    return hashlib.md5(s.encode()).hexdigest()


def _rand_string(n: int = 6) -> str:
    chars = string.ascii_letters + string.digits
    return "".join(random.choices(chars, k=n))


# ---------------------------------------------------------------------------
# View Profile — mirrors view_profile.php
# SELECT * from contract_user WHERE uid=:user_id
# ---------------------------------------------------------------------------

async def get_profile(db: AsyncSession, user_id: int) -> dict:
    row = (await db.execute(
        text("SELECT uid, name, email, broker_id, role FROM contract_user WHERE uid = :uid LIMIT 1"),
        {"uid": user_id},
    )).fetchone()
    if not row:
        return {}
    return {
        "uid":       row.uid,
        "name":      row.name,
        "email":     row.email,
        "broker_id": row.broker_id,
        "role":      str(row.role),
    }


# ---------------------------------------------------------------------------
# Change Password — mirrors change_password.php
# Validates old MD5, updates password + md5_decode (plaintext — PHP pattern)
# ---------------------------------------------------------------------------

async def change_password(
    db: AsyncSession, broker_id: str, email: str, old_pass: str, new_pass: str, confirm_pass: str,
) -> dict:
    if new_pass != confirm_pass:
        return {"success": False, "message": "New passwords do not match"}

    # Verify old password (matches PHP: password LIKE md5(old_pass))
    row = (await db.execute(
        text("SELECT uid FROM contract_user WHERE email = :email AND password = :pwd LIMIT 1"),
        {"email": email, "pwd": _md5(old_pass)},
    )).fetchone()
    if not row:
        return {"success": False, "message": "Old password is incorrect"}

    # UPDATE — replicates PHP: SET password=md5(new), md5_decode=new (plaintext stored as PHP does)
    await db.execute(
        text("""
            UPDATE contract_user
            SET password = :pwd, md5_decode = :plain
            WHERE broker_id = :bid
        """),
        {"pwd": _md5(new_pass), "plain": new_pass, "bid": broker_id},
    )
    await db.commit()
    return {"success": True, "message": "Password updated successfully"}


# ---------------------------------------------------------------------------
# Get pre-filled old password — mirrors change_password.php
# SELECT md5_decode FROM contract_user WHERE broker_id = :broker_id
# PHP pre-fills old_pass field with plaintext from md5_decode
# ---------------------------------------------------------------------------

async def get_current_password_plain(db: AsyncSession, broker_id: str) -> str:
    row = (await db.execute(
        text("SELECT md5_decode FROM contract_user WHERE broker_id = :bid LIMIT 1"),
        {"bid": broker_id},
    )).fetchone()
    return row.md5_decode if row and row.md5_decode else ""


# ---------------------------------------------------------------------------
# Commission email — user's spec: email link to broker's registered email
# SQL mirrors download_comm.php:
#   select c.comm_file_link from comm_vendors c
#   left join broker_new b on b.vendor=c.vendor
#   where broker_code = :broker_id
# Base URL: http://ameripowerpricing.com/
# ---------------------------------------------------------------------------

COMMISSION_BASE_URL = os.getenv("COMMISSION_BASE_URL", "http://ameripowerpricing.com/")


async def send_commission_email(db: AsyncSession, broker_id: str) -> dict:
    # Get commission file link
    comm_row = (await db.execute(
        text("""
            SELECT c.comm_file_link
            FROM comm_vendors c
            LEFT JOIN broker_new b ON b.vendor = c.vendor
            WHERE b.broker_code = :bid
            LIMIT 1
        """),
        {"bid": broker_id},
    )).fetchone()

    if not comm_row or not comm_row[0]:
        return {"success": False, "message": "No commission file found for your account"}

    file_url = COMMISSION_BASE_URL.rstrip("/") + "/" + comm_row[0].lstrip("/")

    # Get broker's registered email
    email_row = (await db.execute(
        text("SELECT email, name FROM contract_user WHERE broker_id = :bid LIMIT 1"),
        {"bid": broker_id},
    )).fetchone()
    if not email_row or not email_row.email:
        return {"success": False, "message": "Could not retrieve your registered email"}

    html = f"""
    <p>Hello {email_row.name},</p>
    <p>Your commission file is ready. Click the link below to download:</p>
    <p><a href="{file_url}">{file_url}</a></p>
    <p>This link was sent securely to your registered email address.</p>
    <p>— Orbic Energy</p>
    """
    await send_email_async(email_row.email, "Your Commission File", html)
    return {"success": True, "message": f"Commission file link emailed to {email_row.email}"}


# ---------------------------------------------------------------------------
# Admin — Get All Users — mirrors user.php
# SELECT * FROM contract_user + comm_vendors JOIN per row
# ---------------------------------------------------------------------------

async def get_all_users(db: AsyncSession) -> List[dict]:
    rows = (await db.execute(
        text("SELECT uid, name, email, md5_decode, broker_id, role, old_password FROM contract_user ORDER BY name ASC"),
    )).fetchall()

    users = []
    for row in rows:
        # Check if password was changed (md5_decode vs old_password)
        changed = (row.md5_decode or "") != (row.old_password or "")

        # Commission file link for this user
        comm_row = (await db.execute(
            text("""
                SELECT c.comm_file_link
                FROM comm_vendors c
                LEFT JOIN broker_new b ON b.vendor = c.vendor
                WHERE b.broker_code = :bid
                LIMIT 1
            """),
            {"bid": row.broker_id},
        )).fetchone()
        comm_link = comm_row[0] if comm_row else ""

        users.append({
            "uid":          row.uid,
            "name":         row.name,
            "email":        row.email,
            "password":     row.md5_decode or "",
            "broker_id":    row.broker_id,
            "role":         str(row.role),
            "pwd_changed":  changed,
            "comm_link":    comm_link or "",
        })
    return users


# ---------------------------------------------------------------------------
# Admin — Create User — mirrors signup.php
# INSERT into contract_user (email,name,password,md5_decode,broker_id,role) values(...)
# role hardcoded '2' (PHP)
# ---------------------------------------------------------------------------

async def create_user(
    db: AsyncSession, name: str, brokerid: str, email: str, password: str,
) -> dict:
    # Check duplicate (mirrors PHP: broker_id OR email exists)
    existing = (await db.execute(
        text("SELECT uid FROM contract_user WHERE broker_id = :bid OR email = :email LIMIT 1"),
        {"bid": brokerid, "email": email},
    )).fetchone()
    if existing:
        return {"success": False, "message": "Broker ID or email already exists"}

    await db.execute(
        text("""
            INSERT INTO contract_user (email, name, password, md5_decode, broker_id, role)
            VALUES (:email, :name, :pwd, :plain, :bid, '2')
        """),
        {"email": email, "name": name, "pwd": _md5(password), "plain": password, "bid": brokerid},
    )
    await db.commit()
    return {"success": True, "message": "User created successfully"}


# ---------------------------------------------------------------------------
# Admin — Update User — mirrors edit_user.php
# UPDATE contract_user SET name=, email=, password=, md5_decode=, broker_id=
# WHERE broker_id = :target_broker_id
# ---------------------------------------------------------------------------

async def update_user(
    db: AsyncSession, target_broker_id: str, name: str, email: str, password: str,
) -> dict:
    # Email uniqueness check (skip self)
    existing = (await db.execute(
        text("SELECT broker_id FROM contract_user WHERE email = :email AND broker_id != :bid LIMIT 1"),
        {"email": email, "bid": target_broker_id},
    )).fetchone()
    if existing:
        return {"success": False, "message": "Email already in use by another user"}

    await db.execute(
        text("""
            UPDATE contract_user
            SET name = :name, email = :email, password = :pwd, md5_decode = :plain
            WHERE broker_id = :bid
        """),
        {"name": name, "email": email, "pwd": _md5(password), "plain": password, "bid": target_broker_id},
    )
    await db.commit()
    return {"success": True, "message": "User updated successfully"}


# ---------------------------------------------------------------------------
# Admin — Upload Users from Excel — mirrors contract_user_upload.php
# Excel cols (1-indexed): B=broker_id, C=name
# Email from broker_new.pricing_email (phpserialize, first comma-split)
# Generates random 6-char password
# Skips existing broker_ids
# ---------------------------------------------------------------------------

async def upload_users(db: AsyncSession, file_bytes: bytes) -> dict:
    import io
    try:
        import openpyxl
    except ImportError:
        return {"success": False, "message": "openpyxl not installed"}

    wb = openpyxl.load_workbook(io.BytesIO(file_bytes))
    ws = wb.active
    inserted = 0
    skipped = 0
    errors = []

    for i, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        broker_id = str(row[1]).strip() if len(row) > 1 and row[1] else ""
        name      = str(row[2]).strip() if len(row) > 2 and row[2] else ""
        if not broker_id:
            continue

        # Check if broker_id exists
        existing = (await db.execute(
            text("SELECT uid FROM contract_user WHERE broker_id = :bid LIMIT 1"),
            {"bid": broker_id},
        )).fetchone()
        if existing:
            skipped += 1
            continue

        # Get email from broker_new.pricing_email
        email_row = (await db.execute(
            text("SELECT pricing_email FROM broker_new WHERE broker_code = :bid LIMIT 1"),
            {"bid": broker_id},
        )).fetchone()

        first_email = ""
        if email_row and email_row.pricing_email:
            raw = email_row.pricing_email
            try:
                if _HAS_PHPSERIALIZE:
                    decoded = phpserialize.loads(raw.encode() if isinstance(raw, str) else raw)
                    if isinstance(decoded, dict):
                        email_str = decoded.get(0, b"")
                        email_str = email_str.decode() if isinstance(email_str, bytes) else str(email_str)
                    else:
                        email_str = decoded.decode() if isinstance(decoded, bytes) else str(decoded)
                else:
                    email_str = raw
                first_email = email_str.split(",")[0].strip()
            except Exception:
                first_email = raw.split(",")[0].strip() if "," in raw else raw.strip()

        if not first_email:
            errors.append(f"Row {i}: no email found for broker_id {broker_id}")
            continue

        password = _rand_string(6)
        await db.execute(
            text("""
                INSERT INTO contract_user (email, name, password, md5_decode, broker_id, role)
                VALUES (:email, :name, :pwd, :plain, :bid, '3')
            """),
            {"email": first_email, "name": name, "pwd": _md5(password), "plain": password, "bid": broker_id},
        )
        inserted += 1

    await db.commit()
    return {
        "success":  True,
        "message":  f"Inserted {inserted} users, skipped {skipped} duplicates",
        "inserted": inserted,
        "skipped":  skipped,
        "errors":   errors,
    }


# ---------------------------------------------------------------------------
# Admin — Forgot Password List — mirrors forget_password_list.php
# SELECT * from forget_pasword
# clearity: 0=pending, 1=green, 2=yellow, 3=red
# ---------------------------------------------------------------------------

async def get_forgot_list(db: AsyncSession) -> List[dict]:
    rows = (await db.execute(
        text("SELECT sid, email_id, name, time, clearity FROM forget_pasword ORDER BY sid DESC"),
    )).fetchall()
    return [
        {
            "sid":       row.sid,
            "email_id":  row.email_id,
            "name":      row.name,
            "time":      row.time,
            "clearity":  row.clearity,
        }
        for row in rows
    ]


# ---------------------------------------------------------------------------
# Admin — Contract Log — mirrors contract_log.php
# contr_date stored as Unix timestamp (PHP strtotime)
# Default: last 7 days
# ---------------------------------------------------------------------------

async def get_contract_log(
    db: AsyncSession,
    vendor_id: str = "",
    com_name: str = "",
    str_date: str = "",
    end_date: str = "",
) -> dict:
    # Broker list for dropdown
    brokers_rows = (await db.execute(
        text("SELECT broker_id, name FROM contract_user ORDER BY name ASC"),
    )).fetchall()
    brokers = [{"broker_id": r.broker_id, "name": r.name} for r in brokers_rows]

    # Date range → Unix timestamps (mirrors PHP strtotime)
    try:
        ts_end = int(datetime.strptime(end_date, "%Y-%m-%d").timestamp()) if end_date else int(datetime.now().timestamp())
    except Exception:
        ts_end = int(datetime.now().timestamp())

    try:
        ts_start = int(datetime.strptime(str_date, "%Y-%m-%d").timestamp()) if str_date else int((datetime.now() - timedelta(days=7)).timestamp())
    except Exception:
        ts_start = int((datetime.now() - timedelta(days=7)).timestamp())

    params: dict = {"ts_start": ts_start, "ts_end": ts_end}
    conditions = ["contr_date BETWEEN :ts_start AND :ts_end"]

    # vendor_id filter — PHP replaces ___ back to space: str_replace('___',' ',$_POST['vendor_id'])
    if vendor_id:
        broker_name = vendor_id.replace("___", " ")
        conditions.append("broker_name LIKE :vendor")
        params["vendor"] = f"%{broker_name}%"

    if com_name:
        conditions.append("company_name LIKE :com_name")
        params["com_name"] = f"%{com_name}%"

    where = " AND ".join(conditions)
    logs_rows = (await db.execute(
        text(f"SELECT sr, broker_name, company_name, contr_date, contr_date1 FROM contract_log WHERE {where} ORDER BY sr DESC"),
        params,
    )).fetchall()

    logs = [
        {
            "sr":           row.sr,
            "broker_name":  row.broker_name,
            "company_name": row.company_name,
            "contr_date":   row.contr_date,
            "contr_date1":  row.contr_date1 or "",
        }
        for row in logs_rows
    ]
    return {"brokers": brokers, "logs": logs}
