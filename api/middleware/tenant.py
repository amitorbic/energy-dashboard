"""
TenantMiddleware — resolves the current tenant on every incoming HTTP request
and stores the result on request.state before any route handler runs.

Resolution order:
  1. Parse subdomain from Host header  (e.g. "orbic.ameripower.com" → "orbic")
  2. Check in-memory cache (60-second TTL per subdomain)
  3. On cache miss: query master DB via utils.master_db.resolve_tenant()
  4. If still unresolved: fall back to DEFAULT_TENANT env var
  5. If nothing resolves: return 503 — tenant unknown

After this middleware runs, every handler can read:
  request.state.rep_id   (int)
  request.state.db_name  (str)
"""

import os
import time
from typing import Dict, Tuple, Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from utils.master_db import resolve_tenant

# Subdomain to (rep_id, db_name, company_name, cached_at) — shared across coroutines in one worker
_cache: Dict[str, Tuple[int, str, str, float]] = {}
_CACHE_TTL = int(os.getenv("TENANT_CACHE_TTL", "60"))

# Fallback for local dev where Host is "localhost:8001"
_DEFAULT_TENANT = os.getenv("DEFAULT_TENANT", "orbic")


def _extract_subdomain(host: str) -> str:
    """
    "orbic.ameripower.com:8001" → "orbic"
    "localhost:8001"            → "localhost"
    "127.0.0.1"                 → "127.0.0.1"
    """
    host = host.split(":")[0]   # strip port
    parts = host.split(".")
    return parts[0] if parts else host


async def _lookup(subdomain: str) -> Optional[Tuple[int, str, str]]:
    """Return (rep_id, db_name, company_name) from cache or master DB, or None."""
    now = time.monotonic()
    cached = _cache.get(subdomain)
    if cached and (now - cached[3]) < _CACHE_TTL:
        return cached[0], cached[1], cached[2]

    result = await resolve_tenant(subdomain)
    if result:
        _cache[subdomain] = (result[0], result[1], result[2], now)
    return result


class TenantMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # CORS preflight — let it through without a tenant so CORS headers are added
        if request.method == "OPTIONS":
            return await call_next(request)

        host = request.headers.get("host", "")
        subdomain = _extract_subdomain(host)

        result = await _lookup(subdomain)

        # Unknown subdomain (e.g. "localhost") → try DEFAULT_TENANT
        if result is None and subdomain != _DEFAULT_TENANT:
            result = await _lookup(_DEFAULT_TENANT)

        if result is None:
            return JSONResponse(
                status_code=503,
                content={"detail": f"Tenant not found for host '{host}'"},
            )

        rep_id, db_name, company_name = result
        request.state.rep_id       = rep_id
        request.state.db_name      = db_name
        request.state.company_name = company_name

        return await call_next(request)
