"""
Auth and database tests for the deployment-per-tenant model.

Under this model each running instance connects to exactly one database
(DB_NAME env var) and serves exactly one tenant (TENANT_REP_ID env var).
There is no per-request routing; isolation is structural, not logic-dependent.

Tests verify:
  - get_db() yields a session connected to the DB_NAME database
  - require_auth rejects tokens whose rep_id differs from TENANT_REP_ID
  - require_auth accepts tokens that pre-date multi-tenancy (no rep_id claim)
  - get_engine_for_db() cache is stable (same object returned on repeat calls)

Run from api/:
    pytest tests/test_tenant_isolation.py -v

Requirements:
  - DB_USER / DB_PASSWORD / DB_HOST / DB_PORT env vars must point to a MySQL
    server where DB_NAME exists.
  - TENANT_REP_ID must be set (or defaults to 0).
"""

import os
import pytest
import pytest_asyncio
from unittest.mock import patch

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.asyncio(loop_scope="module")


# ── Database tests ────────────────────────────────────────────────────────────

async def test_get_db_yields_async_session():
    """get_db() must yield an AsyncSession (no request context needed)."""
    from utils.database import get_db
    async for db in get_db():
        assert isinstance(db, AsyncSession)


async def test_get_db_connects_to_configured_db():
    """Session must be connected to the database named in DB_NAME."""
    from utils.database import get_db
    expected_db = os.getenv("DB_NAME", "u972964962_orbic")
    async for db in get_db():
        row = await db.execute(text("SELECT DATABASE()"))
        actual_db = row.scalar()
    assert actual_db == expected_db, (
        f"get_db() connected to '{actual_db}', expected '{expected_db}'"
    )


async def test_get_engine_for_db_cache_is_stable():
    """get_engine_for_db() must return the same engine object on repeat calls."""
    from utils.database import get_engine_for_db
    db_name = os.getenv("DB_NAME", "u972964962_orbic")
    eng1 = get_engine_for_db(db_name)
    eng2 = get_engine_for_db(db_name)
    assert eng1 is eng2, "Engine cache is not stable — creates new engine on every call"


# ── Auth / rep_id cross-check tests ──────────────────────────────────────────

async def test_jwt_rep_id_mismatch_raises_403():
    """require_auth must reject a token whose rep_id differs from TENANT_REP_ID."""
    from fastapi import HTTPException
    from fastapi.security import HTTPAuthorizationCredentials
    from middleware.auth import require_auth
    from utils.jwt_util import create_token

    # Token claims rep_id=1; deployment is configured as rep_id=2
    token = create_token(
        user_id=99, username="testuser", role="user", email="t@t.com", rep_id=1
    )
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

    with patch.dict(os.environ, {"TENANT_REP_ID": "2"}):
        with pytest.raises(HTTPException) as exc_info:
            await require_auth(credentials=creds)
    assert exc_info.value.status_code == 403


async def test_jwt_rep_id_match_succeeds():
    """require_auth must accept a token whose rep_id matches TENANT_REP_ID."""
    from fastapi.security import HTTPAuthorizationCredentials
    from middleware.auth import require_auth
    from utils.jwt_util import create_token

    token = create_token(
        user_id=1, username="admin", role="1", email="a@a.com", rep_id=1
    )
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

    with patch.dict(os.environ, {"TENANT_REP_ID": "1"}):
        payload = await require_auth(credentials=creds)
    assert payload["user_id"] == 1
    assert payload["rep_id"] == 1


async def test_jwt_without_rep_id_skips_tenant_check():
    """Tokens issued before multi-tenancy (no rep_id claim) must still authenticate."""
    from fastapi.security import HTTPAuthorizationCredentials
    from middleware.auth import require_auth
    from utils.jwt_util import create_token

    token = create_token(
        user_id=1, username="legacy", role="admin", email="l@l.com"
        # no rep_id kwarg → claim absent from token
    )
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

    with patch.dict(os.environ, {"TENANT_REP_ID": "1"}):
        payload = await require_auth(credentials=creds)
    assert payload["user_id"] == 1
    assert "rep_id" not in payload
