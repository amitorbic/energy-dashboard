"""
Tenant product-module entitlements.

Reads `tenant_modules` from the MASTER DB (same engine as
`utils/master_db.py::resolve_tenant`) — entitlements are tenant-level
business state ("which products has this REP purchased"), so they live
alongside `reps`, not in each tenant's own isolated DB.

Fail-open by design: if the master DB is unreachable, the migration hasn't
been run yet, or no rows exist for a rep_id, `get_tenant_modules` returns
None, which callers must treat as "all modules enabled". This mirrors the
existing precedent in `middleware/auth.py` (a JWT without a `rep_id` claim
skips the tenant check rather than locking the user out) and
`master_db.py::resolve_tenant` (unreachable master DB fails to None, not to
an error) — new/existing tenants are never locked out by missing
entitlement data.
"""

from typing import Optional, List
from sqlalchemy import text

from utils.master_db import _MasterSession

ALL_MODULES = ["sales", "operations", "portfolio", "audit"]


async def get_tenant_modules(rep_id: int) -> Optional[List[str]]:
    """
    Return the list of enabled module keys for a rep_id, or None if
    unknown/unreachable — callers must treat None as "all modules enabled".
    """
    if not rep_id:
        return None
    try:
        async with _MasterSession() as db:
            result = await db.execute(
                text(
                    "SELECT module_key FROM tenant_modules "
                    "WHERE rep_id = :rep_id AND enabled = 1"
                ),
                {"rep_id": rep_id},
            )
            rows = result.fetchall()
            if not rows:
                return None
            return [row.module_key for row in rows]
    except Exception:
        # Master DB unreachable, or migration 042 not yet run — fail open.
        return None
