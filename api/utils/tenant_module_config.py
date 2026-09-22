"""
TENANT_MODULES environment-based product-module configuration.

Config-based entitlements for this phase, per
docs/ORBIC_PRODUCT_MODULARIZATION_SCOPE.md section 15: a master-DB-backed
tenant_modules table already exists (api/utils/tenant_modules.py, migration
042) but its only intended caller (middleware/tenant.py's TenantMiddleware)
is never registered in api/main.py, so master-DB-at-request-time is not a
verified, working pattern in this app today. This reads TENANT_MODULES the
same way every other per-tenant setting is already read here (os.getenv --
see TENANT_COMPANY_NAME, TENANT_REP_ID, TENANT_LOGO_URL, etc.) -- no
master-DB dependency, no migration, no new mechanism.

Rules:
  - Missing or empty TENANT_MODULES -> all modules enabled.
  - "enterprise" anywhere in the list -> all modules enabled.
  - Unknown module names are ignored and logged, never raised -- a
    misconfigured value must never lock a tenant out.
"""

import logging
import os

from utils.tenant_modules import ALL_MODULES

logger = logging.getLogger(__name__)


def get_configured_modules() -> list[str]:
    """
    Parse TENANT_MODULES for this deployed instance. Always returns a
    non-empty list drawn from ALL_MODULES (fail-open on any misconfiguration).
    """
    raw = os.getenv("TENANT_MODULES", "")
    keys = [k.strip().lower() for k in raw.split(",") if k.strip()]

    if not keys or "enterprise" in keys:
        return list(ALL_MODULES)

    known = [k for k in keys if k in ALL_MODULES]
    unknown = [k for k in keys if k not in ALL_MODULES]
    if unknown:
        logger.warning(
            "TENANT_MODULES contains unknown module name(s), ignoring: %s",
            ", ".join(unknown),
        )

    # Every listed key was unknown -- fail open rather than lock the tenant out.
    return known if known else list(ALL_MODULES)
