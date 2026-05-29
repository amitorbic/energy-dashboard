"""
process_settlement.py
─────────────────────
Reads already-ingested ERCOT settlement data from:
  ercot_daioutputheader  / ercot_daioutputinterval  → POSTEDAML_* (load with losses)
  ercot_llsoutputheader  / ercot_llsoutputinterval  → LSEGUNADJ_* (load unadjusted)

Stores 96 x 15-min intervals per zone per day — no aggregation, no math.
Aggregation happens in get_position_data based on granularity selected.

Upserts into:
  portfolio_load_with_losses   (96 rows per zone per day = 384 rows/day)
  portfolio_load_unadjusted    (96 rows per zone per day = 384 rows/day)

Usage:
  python process_settlement.py                          # process ALL unprocessed dates
  python process_settlement.py --date 2026-04-01        # single date
  python process_settlement.py --date 2026-04-01 --run RTM_FINAL2
  python process_settlement.py --reprocess              # force reprocess everything
"""

import argparse
import asyncio
import logging
from decimal import Decimal

import aiomysql
from dotenv import load_dotenv
import os
from utils.zone_mapping import weather_to_load

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

# ── DB config ─────────────────────────────────────────────────────────────────
DB_CONFIG = dict(
    host=os.getenv("DB_HOST", "localhost"),
    port=int(os.getenv("DB_PORT", 3306)),
    user=os.getenv("DB_USER"),
    password=os.getenv("DB_PASSWORD"),
    db=os.getenv("DB_NAME", "u972964962_orbic"),
    charset="utf8mb4",
    autocommit=False,
)


# ── Zone mappings ─────────────────────────────────────────────────────────────
def zone_from_recorder(recorder: str) -> str | None:
    """Extract settlement zone from any saverecorder string."""
    parts = recorder.upper().split("_")
    for part in reversed(parts):
        result = weather_to_load(part)
        if result:
            return result
    return None


def extract_intervals(row) -> list[Decimal]:
    """Extract 96 raw interval values from a DB row — no math, just read."""
    return [Decimal(str(row[i] or 0)) for i in range(96)]


INT_SELECT = """
    SELECT int001,int002,int003,int004,int005,int006,
           int007,int008,int009,int010,int011,int012,
           int013,int014,int015,int016,int017,int018,
           int019,int020,int021,int022,int023,int024,
           int025,int026,int027,int028,int029,int030,
           int031,int032,int033,int034,int035,int036,
           int037,int038,int039,int040,int041,int042,
           int043,int044,int045,int046,int047,int048,
           int049,int050,int051,int052,int053,int054,
           int055,int056,int057,int058,int059,int060,
           int061,int062,int063,int064,int065,int066,
           int067,int068,int069,int070,int071,int072,
           int073,int074,int075,int076,int077,int078,
           int079,int080,int081,int082,int083,int084,
           int085,int086,int087,int088,int089,int090,
           int091,int092,int093,int094,int095,int096
"""


# ── WITH LOSSES (POSTEDAML_* from daioutputheader/interval) ──────────────────


async def process_with_losses(
    conn, oper_date: str, settlement_run: str, repcode: str, qsecode: str
) -> int:
    upserted = 0

    async with conn.cursor(aiomysql.DictCursor) as cur:
        await cur.execute(
            """
            SELECT h.uiddaioutputheader,
                   CONVERT(h.saverecorder USING utf8mb4) as saverecorder
            FROM   ercot_daioutputheader h
            WHERE  CONVERT(h.saverecorder USING utf8mb4) LIKE 'POSTEDAML%%'
              AND  CONVERT(h.repcode      USING utf8mb4) = %s
              AND  h.oper_date      = %s
              AND  h.settlement_run = %s
            """,
            (repcode, oper_date, settlement_run),
        )
        headers = await cur.fetchall()

    if not headers:
        log.debug("  No POSTEDAML headers for %s/%s", oper_date, settlement_run)
        return 0

    for hdr in headers:
        uid = hdr["uiddaioutputheader"]
        recorder = hdr["saverecorder"]
        zone = zone_from_recorder(recorder)

        if not zone:
            log.debug("  Cannot map zone for recorder=%s", recorder)
            continue

        async with conn.cursor() as cur:
            await cur.execute(
                INT_SELECT + """
                FROM   ercot_daioutputinterval
                WHERE  uiddaioutputheader = %s
                  AND  oper_date          = %s
                  AND  settlement_run     = %s
                  AND  spi               = 900
                LIMIT 1
                """,
                (uid, oper_date, settlement_run),
            )
            int_row = await cur.fetchone()

        if not int_row:
            log.warning("  No interval row for uid=%s", uid)
            continue

        intervals = extract_intervals(int_row)

        async with conn.cursor() as cur:
            for i, val in enumerate(intervals):
                await cur.execute(
                    """
                    INSERT INTO portfolio_load_with_losses
                        (oper_date, interval_ending, settlement_zone, mwh, settlement_run)
                    VALUES (%s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        mwh       = VALUES(mwh),
                        loaded_at = CURRENT_TIMESTAMP
                    """,
                    (oper_date, i + 1, zone, val, settlement_run),
                )
                upserted += cur.rowcount

    log.info(
        "  WITH_LOSSES  date=%s  run=%-14s  upserted=%d",
        oper_date,
        settlement_run,
        upserted,
    )
    return upserted


# ── UNADJUSTED (LSEGUNADJ_* from llsoutputheader/interval) ───────────────────


async def process_unadjusted(
    conn, oper_date: str, settlement_run: str, repcode: str, qsecode: str
) -> int:
    upserted = 0

    async with conn.cursor(aiomysql.DictCursor) as cur:
        await cur.execute(
            """
            SELECT h.uidllsoutputheader,
                   CONVERT(h.saverecorder USING utf8mb4) as saverecorder
            FROM   ercot_llsoutputheader h
            WHERE  CONVERT(h.saverecorder USING utf8mb4) LIKE 'LSEGUNADJ%%'
              AND  CONVERT(h.repcode      USING utf8mb4) = %s
              AND  h.oper_date      = %s
              AND  h.settlement_run = %s
            """,
            (repcode, oper_date, settlement_run),
        )
        headers = await cur.fetchall()

    if not headers:
        log.debug("  No LSEGUNADJ headers for %s/%s", oper_date, settlement_run)
        return 0

    # Accumulate intervals per zone — sum across all profiles in same zone
    zone_intervals: dict[str, list[Decimal]] = {
        z: [Decimal("0")] * 96 for z in ("HOUSTON", "NORTH", "SOUTH", "WEST")
    }

    for hdr in headers:
        uid = hdr["uidllsoutputheader"]
        recorder = hdr["saverecorder"]
        zone = zone_from_recorder(recorder)

        if not zone:
            log.debug("  Cannot map zone for recorder=%s", recorder)
            continue

        async with conn.cursor() as cur:
            await cur.execute(
                INT_SELECT + """
                FROM   ercot_llsoutputinterval
                WHERE  uidllsoutputheader = %s
                  AND  oper_date          = %s
                  AND  settlement_run     = %s
                  AND  spi               = 900
                LIMIT 1
                """,
                (uid, oper_date, settlement_run),
            )
            int_row = await cur.fetchone()

        if not int_row:
            continue

        intervals = extract_intervals(int_row)
        for i, val in enumerate(intervals):
            zone_intervals[zone][i] += val

    # Upsert aggregated zone intervals
    async with conn.cursor() as cur:
        for zone, intervals in zone_intervals.items():
            for i, val in enumerate(intervals):
                await cur.execute(
                    """
                    INSERT INTO portfolio_load_unadjusted
                        (oper_date, interval_ending, settlement_zone, mwh, settlement_run)
                    VALUES (%s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        mwh       = VALUES(mwh),
                        loaded_at = CURRENT_TIMESTAMP
                    """,
                    (oper_date, i + 1, zone, val, settlement_run),
                )
                upserted += cur.rowcount

    log.info(
        "  UNADJUSTED   date=%s  run=%-14s  upserted=%d",
        oper_date,
        settlement_run,
        upserted,
    )
    return upserted


# ── Discover unprocessed dates ────────────────────────────────────────────────


async def get_pending_dates(conn) -> list[tuple[str, str]]:
    async with conn.cursor(aiomysql.DictCursor) as cur:
        await cur.execute("""
            SELECT DISTINCT h.oper_date, h.settlement_run
            FROM   ercot_daioutputheader h
            WHERE  NOT EXISTS (
                SELECT 1 FROM portfolio_load_with_losses p
                WHERE  p.oper_date      = h.oper_date
                  AND  p.settlement_run = h.settlement_run
            )
            ORDER BY h.oper_date, h.settlement_run
            """)
        rows = await cur.fetchall()
    return [(r["oper_date"].strftime("%Y-%m-%d"), r["settlement_run"]) for r in rows]


async def get_repcode(conn) -> tuple[str, str]:
    async with conn.cursor(aiomysql.DictCursor) as cur:
        await cur.execute(
            "SELECT repcode, qsecode FROM ercot_daioutputheader "
            "WHERE repcode IS NOT NULL LIMIT 1"
        )
        row = await cur.fetchone()
        if not row:
            raise RuntimeError("No rows in ercot_daioutputheader — ingest first.")
        return row["repcode"], row["qsecode"]


# ── Main ──────────────────────────────────────────────────────────────────────


async def main(args):
    pool = await aiomysql.create_pool(**DB_CONFIG, minsize=1, maxsize=3)

    async with pool.acquire() as conn:
        repcode, qsecode = await get_repcode(conn)
        log.info("REP  repcode=%s  qsecode=%s", repcode, qsecode)

        if args.date:
            run = args.run or "RTM_INITIAL"
            work_list = [(args.date, run)]
            log.info("Single-date mode: %s / %s", args.date, run)
        elif args.reprocess:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute(
                    "SELECT DISTINCT oper_date, settlement_run "
                    "FROM ercot_daioutputheader ORDER BY oper_date, settlement_run"
                )
                rows = await cur.fetchall()
            work_list = [
                (r["oper_date"].strftime("%Y-%m-%d"), r["settlement_run"]) for r in rows
            ]
            log.info("Reprocess mode: %d date/run combos", len(work_list))
        else:
            work_list = await get_pending_dates(conn)
            log.info("Auto mode: %d unprocessed date/run combos", len(work_list))

        if not work_list:
            log.info("Nothing to process.")
            pool.close()
            await pool.wait_closed()
            return

        total_losses = total_unadj = 0
        for oper_date, settlement_run in work_list:
            log.info("Processing %s  run=%s", oper_date, settlement_run)
            try:
                n1 = await process_with_losses(
                    conn, oper_date, settlement_run, repcode, qsecode
                )
                n2 = await process_unadjusted(
                    conn, oper_date, settlement_run, repcode, qsecode
                )
                await conn.commit()
                total_losses += n1
                total_unadj += n2
            except Exception as exc:
                await conn.rollback()
                log.error("FAILED %s/%s — %s", oper_date, settlement_run, exc)
                if args.date:
                    raise

    pool.close()
    await pool.wait_closed()
    log.info(
        "Done — with_losses upserted=%d  unadjusted upserted=%d",
        total_losses,
        total_unadj,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", help="Single oper_date (YYYY-MM-DD)")
    parser.add_argument("--run", help="settlement_run", default=None)
    parser.add_argument("--reprocess", action="store_true")
    args = parser.parse_args()
    asyncio.run(main(args))
