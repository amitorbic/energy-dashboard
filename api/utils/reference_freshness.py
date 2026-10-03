"""
Read-side helper for forecast-producing endpoints to report how current
their underlying SHARED_REFERENCE_TABLES data is.

Deliberately NOT a stale/fresh judgment call (no threshold math, no
boolean) -- see SCOPE clarifications on the reference-data sync task.
It just surfaces the real last_synced_at this tenant's OWN DB has
recorded for each table it read, via the same `db` session the endpoint
already has (reference_sync_state lives in every tenant's own DB --
see migrations/047_create_reference_sync_tables.sql -- so this never
opens a new connection).

A human (or a future monitoring check) compares this tenant-side
last_updated against the source-side last_synced_at from
GET /api/admin/reference-sync/status to spot a broken pipeline.
"""
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def get_freshness(db: AsyncSession, tables: list[str]) -> dict:
    """
    Returns:
        {
          "data_as_of": "<iso timestamp of the OLDEST last_synced_at among
                          `tables`, i.e. the weakest link>" | null,
          "sources": {
            "<table>": {"last_updated": "<iso timestamp>" | null},
            ...
          }
        }

    A null last_updated means this table has never been synced to this
    tenant yet (no row in reference_sync_state) -- surfaced as null, not
    hidden, so the frontend/caller can show "never synced" rather than a
    misleadingly plausible-looking timestamp.
    """
    if not tables:
        return {"data_as_of": None, "sources": {}}

    placeholders = ", ".join(f":t{i}" for i in range(len(tables)))
    result = await db.execute(
        text(
            "SELECT table_name, last_synced_at FROM reference_sync_state "
            f"WHERE table_name IN ({placeholders})"
        ),
        {f"t{i}": t for i, t in enumerate(tables)},
    )
    rows = {r[0]: r[1] for r in result.fetchall()}

    sources = {}
    timestamps = []
    for t in tables:
        ts = rows.get(t)
        sources[t] = {"last_updated": ts.isoformat() if ts else None}
        if ts:
            timestamps.append(ts)

    return {
        "data_as_of": min(timestamps).isoformat() if timestamps else None,
        "sources": sources,
    }
