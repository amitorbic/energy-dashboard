"""
build_layer2_growth.py
───────────────────────
Layer 2 — Growth Filter
Calculates year-over-year growth factors from ercot_forecast_loadzone.

Base year: 2025
Formula:   growth_factor = year_X_total / base_2025_total  (per load zone)

Usage:
  python build_layer2_growth.py           # all zones all years
  python build_layer2_growth.py --zone HOUSTON
  python build_layer2_growth.py --year 2030
"""

import argparse
import asyncio
import logging
from decimal import Decimal

import aiomysql
from dotenv import load_dotenv
import os

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

DB_CONFIG = dict(
    host=os.getenv("DB_HOST", "localhost"),
    port=int(os.getenv("DB_PORT", 3306)),
    user=os.getenv("DB_USER"),
    password=os.getenv("DB_PASSWORD"),
    db=os.getenv("DB_NAME"),
    charset="utf8mb4",
    autocommit=False,
)
if not DB_CONFIG["db"]:
    raise SystemExit("ERROR: DB_NAME environment variable is not set. Set it before running this script.")

BASE_YEAR = 2025
LOAD_ZONES = ["HOUSTON", "NORTH", "SOUTH", "WEST"]
ZONE_TO_COL = {
    "HOUSTON": "houston",
    "NORTH": "north",
    "SOUTH": "south",
    "WEST": "west",
}


async def build_growth_factors(conn, zones: list[str], year_filter: int | None):
    # Get available years
    async with conn.cursor() as cur:
        await cur.execute(
            "SELECT DISTINCT year FROM ercot_forecast_loadzone ORDER BY year"
        )
        rows = await cur.fetchall()
        all_years = [r[0] for r in rows]

    if year_filter:
        years = [y for y in all_years if y == year_filter]
    else:
        years = all_years

    if not years:
        log.error("No matching years found in ercot_forecast_loadzone")
        return

    log.info("Years to process: %s", years)
    log.info("Base year: %d", BASE_YEAR)

    for zone in zones:
        col = ZONE_TO_COL[zone]

        # Get base year total
        async with conn.cursor() as cur:
            await cur.execute(
                f"""
                SELECT SUM({col})
                FROM   ercot_forecast_loadzone
                WHERE  year = %s
            """,
                (BASE_YEAR,),
            )
            row = await cur.fetchone()
            base_total = Decimal(str(row[0] or 0))

        if base_total == 0:
            log.warning("No base year data for zone=%s year=%d", zone, BASE_YEAR)
            continue

        log.info("Zone=%-8s  base_total_2025=%s", zone, base_total)

        batch = []
        for year in years:
            # Get year total
            async with conn.cursor() as cur:
                await cur.execute(
                    f"""
                    SELECT SUM({col})
                    FROM   ercot_forecast_loadzone
                    WHERE  year = %s
                """,
                    (year,),
                )
                row = await cur.fetchone()
                year_total = Decimal(str(row[0] or 0))

            if year_total == 0:
                log.warning("  No data for zone=%s year=%d", zone, year)
                continue

            growth_factor = round(year_total / base_total, 6)

            batch.append(
                (
                    zone,
                    int(year),
                    BASE_YEAR,
                    str(base_total),
                    str(year_total),
                    float(growth_factor),
                )
            )

            log.info(
                "  year=%d  year_total=%s  growth_factor=%.6f",
                year,
                year_total,
                float(growth_factor),
            )

        if batch:
            async with conn.cursor() as cur:
                await cur.executemany(
                    """
                    INSERT INTO forecast_growth_factors
                        (load_zone, forecast_year, base_year,
                         base_total, year_total, growth_factor)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        base_total    = VALUES(base_total),
                        year_total    = VALUES(year_total),
                        growth_factor = VALUES(growth_factor),
                        built_at      = CURRENT_TIMESTAMP
                """,
                    batch,
                )
            await conn.commit()
            log.info("Zone=%-8s  upserted=%d", zone, len(batch))


async def main(args):
    pool = await aiomysql.create_pool(**DB_CONFIG, minsize=1, maxsize=3)

    async with pool.acquire() as conn:
        zones = [args.zone.upper()] if args.zone else LOAD_ZONES
        await build_growth_factors(conn, zones, args.year)

    pool.close()
    await pool.wait_closed()
    log.info("Layer 2 growth factors complete.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--zone", help="Single load zone (HOUSTON|NORTH|SOUTH|WEST)")
    parser.add_argument("--year", type=int, help="Single forecast year")
    args = parser.parse_args()
    asyncio.run(main(args))
