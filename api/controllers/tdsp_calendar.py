"""
Admin upload path for tdsp_meter_read_calendar (migration 040).

Reuses the parsers from scripts/load_tdsp_meter_read_calendar.py (the
manual CLI loader) so the parsing logic lives in one place. This just
swaps the CLI's argparse + raw pymysql connection for a FastAPI upload
endpoint + the app's async SQLAlchemy session, so it can be run from the
browser instead of over SSH.
"""
import io

from fastapi import HTTPException, UploadFile
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from scripts.load_tdsp_meter_read_calendar import _PARSERS

_UPSERT_SQL = text("""
    INSERT INTO tdsp_meter_read_calendar
        (tdsp_name, tdsp_duns, year, bill_cycle, read_date, bill_date, days_serviced, source_file)
    VALUES (:tdsp_name, :tdsp_duns, :year, :bill_cycle, :read_date, :bill_date, :days_serviced, :source_file)
    ON DUPLICATE KEY UPDATE
        tdsp_duns = VALUES(tdsp_duns),
        bill_date = VALUES(bill_date),
        days_serviced = VALUES(days_serviced),
        source_file = VALUES(source_file)
""")


async def upload_tdsp_calendar(
    file: UploadFile,
    fmt: str,
    tdsp_name: str,
    year: int,
    tdsp_duns: str | None,
    db: AsyncSession,
):
    if fmt not in _PARSERS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown format '{fmt}'. Must be one of: {', '.join(_PARSERS)}",
        )

    raw = await file.read()
    try:
        rows = _PARSERS[fmt](io.BytesIO(raw), year)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {e}")

    if not rows:
        raise HTTPException(
            status_code=400,
            detail="No rows parsed from file -- check the format matches the file.",
        )

    try:
        for r in rows:
            await db.execute(_UPSERT_SQL, {
                "tdsp_name": tdsp_name,
                "tdsp_duns": tdsp_duns or None,
                "year": year,
                "bill_cycle": r["bill_cycle"],
                "read_date": r["read_date"],
                "bill_date": r["bill_date"],
                "days_serviced": r["days_serviced"],
                "source_file": file.filename,
            })
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to save calendar rows.")

    cycles = sorted(set(r["bill_cycle"] for r in rows))
    return {
        "tdsp_name": tdsp_name,
        "year": year,
        "rows_parsed": len(rows),
        "bill_cycles": f"{cycles[0]}..{cycles[-1]}" if cycles else None,
    }


async def list_tdsp_calendar_status(db: AsyncSession):
    result = await db.execute(text("""
        SELECT tdsp_name, tdsp_duns, year, COUNT(*) AS rows,
               MIN(read_date) AS earliest, MAX(read_date) AS latest,
               MAX(loaded_at) AS last_loaded, MAX(source_file) AS source_file
        FROM tdsp_meter_read_calendar
        GROUP BY tdsp_name, year
        ORDER BY tdsp_name, year DESC
    """))
    return {"calendars": [dict(r) for r in result.mappings().all()]}
