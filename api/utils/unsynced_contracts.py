"""
Counts of contract_renewal rows the Portfolio sync skips, grouped by reason.
Logic lives in the contract_renewal_unsynced SQL view (migration 053); the
reconcile script queries the same view.
"""
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

REASONS = ("premise_id_null", "load_profile_null", "end_date_null", "end_date_unparseable")


async def get_unsynced_summary(db: AsyncSession) -> dict:
    """
    Returns {"available": bool, "total": int, "by_reason": {reason: n}}.
    available=False when the view (migration 053) or sync-state table is missing,
    or the tenant is not a full tenant (contract_renewal never syncs there, so
    "unsynced" has no meaning).
    """
    empty = {"available": False, "total": 0, "by_reason": {r: 0 for r in REASONS}}
    try:
        state = (await db.execute(
            text("SELECT is_full_tenant FROM portfolio_contracts_sync_state WHERE id = 1")
        )).fetchone()
        if not state or not state.is_full_tenant:
            return empty
        rows = (await db.execute(
            text("SELECT reason, COUNT(*) AS n FROM contract_renewal_unsynced GROUP BY reason")
        )).fetchall()
    except Exception:
        await db.rollback()
        return empty
    by_reason = {r: 0 for r in REASONS}
    for r in rows:
        by_reason[r.reason] = int(r.n)
    return {"available": True, "total": sum(by_reason.values()), "by_reason": by_reason}
