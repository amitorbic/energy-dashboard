"""
Database layer — single-tenant, deployment-per-tenant model.

Each deployed instance connects to exactly one database, identified by the
DB_NAME env var.  There is no per-request tenant lookup; the database is
fixed for the lifetime of the process.

Every FastAPI route that declares `db: AsyncSession = Depends(get_db)` gets a
session connected to this instance's database.

get_engine_for_db() is retained as a utility for provision_tenant.py and tests.

Backward-compatible exports kept for standalone scripts:
  engine  →  this instance's engine  (api/scripts/*)
  Base    →  declarative base         (api/models/*)
"""

import os
from typing import Dict

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from dotenv import load_dotenv

load_dotenv()

_DB_USER     = os.getenv("DB_USER", "root")
_DB_PASSWORD = os.getenv("DB_PASSWORD", "")
_DB_HOST     = os.getenv("DB_HOST", "localhost")
_DB_PORT     = os.getenv("DB_PORT", "3306")

# Used only for the backward-compat `engine` export below
_DEFAULT_DB  = os.getenv("DB_NAME", "u972964962_orbic")

Base = declarative_base()

# ── Engine + session-factory cache ──────────────────────────────────────────

_engine_cache:  Dict[str, AsyncEngine]   = {}
_factory_cache: Dict[str, sessionmaker]  = {}


def _build_url(db_name: str) -> str:
    return (
        f"mysql+aiomysql://{_DB_USER}:{_DB_PASSWORD}"
        f"@{_DB_HOST}:{_DB_PORT}/{db_name}?charset=utf8mb4"
    )


def get_engine_for_db(db_name: str) -> AsyncEngine:
    """
    Return (and lazily create) the cached AsyncEngine for db_name.
    Safe to call from any async or sync context — dict read/write is
    protected by CPython's GIL; a rare double-create on first concurrent
    hit for the same new tenant is benign (both engines are identical,
    the first is just garbage-collected).
    """
    if db_name not in _engine_cache:
        eng = create_async_engine(
            _build_url(db_name),
            echo=False,
            pool_pre_ping=True,
            connect_args={"charset": "utf8mb4"},
        )
        _engine_cache[db_name]  = eng
        _factory_cache[db_name] = sessionmaker(
            eng, class_=AsyncSession, expire_on_commit=False
        )
    return _engine_cache[db_name]


# ── Single-tenant FastAPI dependency ────────────────────────────────────────
# One engine and session factory for this deployment's fixed DB_NAME.
# Created once at import time; all requests share the same pool.

_tenant_engine  = get_engine_for_db(_DEFAULT_DB)
_tenant_factory = _factory_cache[_DEFAULT_DB]


async def get_db():
    """
    FastAPI dependency — yields an AsyncSession for this instance's database.

    No request context needed; the target DB is fixed by DB_NAME in .env.
    All existing `Depends(get_db)` call-sites work unchanged.
    """
    async with _tenant_factory() as db:
        try:
            yield db
        finally:
            await db.close()


# ── Helpers ──────────────────────────────────────────────────────────────────

async def get_single_value(db: AsyncSession, query: str, params: dict = {}):
    """Replaces PHP getSingleValue() — returns first col of first row."""
    result = await db.execute(text(query), params)
    row = result.fetchone()
    return row[0] if row else None


# ── Backward-compat exports for standalone scripts ───────────────────────────
# api/scripts/migrate_parsed_bills_v*.py and create_document_parser_tables.py
# import `engine` and/or `Base` directly.  They pass DB_NAME via the env var,
# which is what _DEFAULT_DB reads, so nothing breaks.

engine = get_engine_for_db(_DEFAULT_DB)

# AsyncSessionLocal is NOT re-exported — no file imports it from here
# (migrate_prior_heat_rates.py defines its own local copy via DATABASE_URL).
