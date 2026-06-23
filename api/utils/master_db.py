"""
Master database engine — holds only the `reps` table.

This is NOT a tenant DB. It's the routing directory: given a subdomain,
it returns the (rep_id, db_name) pair for that tenant.

Configured via MASTER_DB_NAME env var (default: ameripower_master).
Run api/migrations/001_create_reps_table.sql before first use.
"""

import os
from typing import Optional, Tuple
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
from dotenv import load_dotenv

load_dotenv()

_DB_USER     = os.getenv("DB_USER", "root")
_DB_PASSWORD = os.getenv("DB_PASSWORD", "")
_DB_HOST     = os.getenv("DB_HOST", "localhost")
_DB_PORT     = os.getenv("DB_PORT", "3306")
_MASTER_DB   = os.getenv("MASTER_DB_NAME", "ameripower_master")

_MASTER_URL = (
    f"mysql+aiomysql://{_DB_USER}:{_DB_PASSWORD}@{_DB_HOST}:{_DB_PORT}"
    f"/{_MASTER_DB}?charset=utf8mb4"
)

_master_engine = create_async_engine(
    _MASTER_URL,
    echo=False,
    pool_pre_ping=True,
    pool_size=2,          # master DB only handles reps lookups — keep pool tiny
    max_overflow=2,
    connect_args={"charset": "utf8mb4"},
)
_MasterSession = sessionmaker(_master_engine, class_=AsyncSession, expire_on_commit=False)


async def resolve_tenant(subdomain: str) -> Optional[Tuple[int, str, str]]:
    """
    Look up (rep_id, db_name, company_name) for a given subdomain.
    Returns None if the subdomain isn't registered or the master DB is unavailable.
    """
    try:
        async with _MasterSession() as db:
            result = await db.execute(
                text(
                    "SELECT rep_id, db_name, company_name FROM reps "
                    "WHERE subdomain = :sub AND status = 'active' "
                    "LIMIT 1"
                ),
                {"sub": subdomain},
            )
            row = result.fetchone()
            return (row.rep_id, row.db_name, row.company_name) if row else None
    except Exception:
        # Master DB unreachable (e.g. first boot before migration runs).
        # Caller falls back to DEFAULT_TENANT env var.
        return None
