"""
Internal/ops visibility into the shared-reference-data sync pipeline --
NOT customer-facing. Reads reference_sync_source_status (see
migrations/047_create_reference_sync_tables.sql), which is only ever
meaningfully written in the real shared source DB by
scripts/sync_reference_data.py.

Deliberately uses the same `get_db()` dependency every other endpoint
uses -- no new cross-DB connection pattern. That means this endpoint only
returns real data when called against the source/default tenant's own
deployment (whichever one's DB_NAME is the shared source DB); called
against any other REP tenant's app it will simply return an empty table
list, since that tenant's own copy of reference_sync_source_status is
never written to (see the migration file's comment on why that table
still exists there).
"""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.auth import require_admin
from utils.database import get_db
from utils.shared_reference_tables import SHARED_REFERENCE_TABLES

router = APIRouter(prefix="/admin/reference-sync", tags=["admin"])


@router.get("/status")
async def reference_sync_source_status(
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    """
    'When did we last successfully PUSH each shared table to every active
    tenant?' Compare against a tenant's own /portfolio/... or /risk/...
    response `data_as_of` (last successfully RECEIVED) to spot a mismatch
    or a broken pipeline.
    """
    result = await db.execute(
        text(
            "SELECT table_name, last_synced_at, last_source_id, tenants_synced "
            "FROM reference_sync_source_status"
        )
    )
    by_table = {
        row.table_name: {
            "last_synced_at": row.last_synced_at.isoformat() if row.last_synced_at else None,
            "last_source_id": row.last_source_id,
            "tenants_synced": row.tenants_synced,
        }
        for row in result.fetchall()
    }

    return {
        "tables": [
            {
                "table_name": t.name,
                "has_live_trigger": t.has_live_trigger,
                **by_table.get(t.name, {"last_synced_at": None, "last_source_id": 0, "tenants_synced": 0}),
            }
            for t in SHARED_REFERENCE_TABLES
        ]
    }
