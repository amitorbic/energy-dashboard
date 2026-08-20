from datetime import date, timedelta

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text


async def get_latest_checkpoints(db: AsyncSession) -> dict:
    """Most recent result per checkpoint_id (from the latest run_date each has)."""
    result = await db.execute(
        text("""
            SELECT fc.checkpoint_id, fc.checkpoint_name, fc.run_date, fc.status,
                   fc.score, fc.threshold_green, fc.threshold_red, fc.message,
                   fc.details, fc.created_at
            FROM   forecast_checkpoints fc
            INNER JOIN (
                SELECT checkpoint_id, MAX(run_date) AS max_run_date
                FROM   forecast_checkpoints
                GROUP  BY checkpoint_id
            ) latest
              ON fc.checkpoint_id = latest.checkpoint_id
             AND fc.run_date = latest.max_run_date
            ORDER BY fc.checkpoint_id
        """)
    )
    rows = [dict(r) for r in result.mappings()]

    return {
        "checkpoints": rows,
        "overall_status": _overall_status([r["status"] for r in rows]),
    }


async def get_checkpoint_history(db: AsyncSession, days: int = 30) -> dict:
    """Last N days of results for all checkpoints, for the trend charts."""
    since = date.today() - timedelta(days=days)
    result = await db.execute(
        text("""
            SELECT checkpoint_id, checkpoint_name, run_date, status, score,
                   threshold_green, threshold_red, message, details, created_at
            FROM   forecast_checkpoints
            WHERE  run_date >= :since
            ORDER  BY checkpoint_id, run_date
        """),
        {"since": since},
    )
    rows = [dict(r) for r in result.mappings()]

    by_checkpoint: dict[int, list[dict]] = {}
    for row in rows:
        by_checkpoint.setdefault(row["checkpoint_id"], []).append(row)

    return {"days": days, "since": since.isoformat(), "history": by_checkpoint}


def _overall_status(statuses: list[str]) -> str:
    if not statuses:
        return "UNKNOWN"
    if "RED" in statuses:
        return "RED"
    if "YELLOW" in statuses:
        return "YELLOW"
    return "GREEN"
