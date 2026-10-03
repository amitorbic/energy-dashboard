"""
Backend module-entitlement gating tests.

require_module()/require_any_module() (middleware/auth.py) are the
dependency factories applied per-router (most modules, via include_router's
dependencies=[...] in main.py) or per-endpoint (routers/commission.py's
mixed sales/audit ownership) to enforce TENANT_MODULES entitlements at the
API boundary -- see docs/ORBIC_PRODUCT_MODULARIZATION_SCOPE.md section 15.

Tests verify the same fail-open rules as the JWT's `modules` claim:
  - a token missing the required module is rejected (403)
  - a token carrying the required module is accepted
  - a legacy token with no `modules` claim at all is always accepted
    (pre-dates the modules claim, must keep working per docs section 17)
  - require_any_module accepts if the token has ANY of the listed modules

Run from api/:
    pytest tests/test_module_gating.py -v
"""

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from middleware.auth import require_module, require_any_module
from utils.jwt_util import create_token

pytestmark = pytest.mark.asyncio(loop_scope="module")


def _creds(modules=None):
    extra = {"modules": modules} if modules is not None else None
    token = create_token(
        user_id=1, username="u", role="user", email="u@u.com", extra_claims=extra
    )
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


# ── require_module ───────────────────────────────────────────────────────────

async def test_require_module_allows_entitled_tenant():
    check = require_module("sales")
    payload = await check(payload=await _payload(_creds(["sales", "operations"])))
    assert payload["user_id"] == 1


async def test_require_module_denies_unentitled_tenant():
    check = require_module("audit")
    with pytest.raises(HTTPException) as exc_info:
        await check(payload=await _payload(_creds(["sales"])))
    assert exc_info.value.status_code == 403


async def test_require_module_allows_legacy_jwt_without_modules_claim():
    """A token pre-dating the modules claim has no 'modules' key at all -- must pass."""
    check = require_module("portfolio")
    payload = await check(payload=await _payload(_creds(modules=None)))
    assert payload["user_id"] == 1


async def test_require_module_denies_empty_modules_list():
    """An explicit empty list (all-unknown TENANT_MODULES never produces this,
    but defend the boundary anyway) is NOT the same as a missing claim."""
    check = require_module("sales")
    with pytest.raises(HTTPException) as exc_info:
        await check(payload=await _payload(_creds(modules=[])))
    assert exc_info.value.status_code == 403


# ── require_any_module (commission.py's dual-use endpoints) ────────────────

async def test_require_any_module_allows_either_side():
    check = require_any_module("sales", "audit")
    payload = await check(payload=await _payload(_creds(["audit"])))
    assert payload["user_id"] == 1
    payload = await check(payload=await _payload(_creds(["sales"])))
    assert payload["user_id"] == 1


async def test_require_any_module_denies_neither_side():
    check = require_any_module("sales", "audit")
    with pytest.raises(HTTPException) as exc_info:
        await check(payload=await _payload(_creds(["operations", "portfolio"])))
    assert exc_info.value.status_code == 403


async def test_require_any_module_allows_legacy_jwt_without_modules_claim():
    check = require_any_module("sales", "audit")
    payload = await check(payload=await _payload(_creds(modules=None)))
    assert payload["user_id"] == 1


# ── helper: reuse require_auth to turn credentials into a payload, exactly
#    as FastAPI's Depends() chain would ────────────────────────────────────

async def _payload(creds: HTTPAuthorizationCredentials):
    from middleware.auth import require_auth
    return await require_auth(credentials=creds)
