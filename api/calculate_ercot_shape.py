"""
calculate_ercot_shape.py
─────────────────────────
Calculates shape factors from ingested ERCOT forecast data.

Shape hierarchy (per zone):
  monthly_shape = month_total / annual_total      (% of year this month is)
  daily_shape   = day_total   / month_total       (% of month this day is)
  hourly_shape  = hour_value  / day_total         (% of day this hour is)

Writes to:
  ercot_shape_weatherzone
  ercot_shape_loadzone

Usage:
  python calculate_ercot_shape.py                 # calculate all years
  python calculate_ercot_shape.py --year 2025     # single year
  python calculate_ercot_shape.py --weatherzone   # only weather zones
  python calculate_ercot_shape.py --loadzone      # only load zones
"""

import argparse
import asyncio
import logging
from decimal import Decimal, ROUND_HALF_UP

import aiomysql
from dotenv import load_dotenv
import os
from utils.zone_mapping import get_all_weather_zones, get_load_zones, DB_COL_TO_ZONE

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


def safe_divide(numerator, denominator) -> Decimal:
    """Divide safely — return 0 if denominator is 0."""
    if not denominator or denominator == 0:
        return Decimal("0")
    return Decimal(str(numerator)) / Decimal(str(denominator))


# ── Weather Zone Shape ────────────────────────────────────────────────────────


async def calculate_weatherzone_shape(conn, year: int):
    log.info("Calculating weather zone shape for year=%d", year)

    for col, zone_label in DB_COL_TO_ZONE.items():
        col_net = f"{col}_net"  # coast → coast_net

        # Step 1 — Annual total for this zone/year
        async with conn.cursor() as cur:
            await cur.execute(
                f"""
                SELECT SUM({col})
                FROM   ercot_forecast_weatherzone
                WHERE  year = %s
            """,
                (year,),
            )
            row = await cur.fetchone()
            annual_total = Decimal(str(row[0] or 0))

        if annual_total == 0:
            log.warning("  No data for zone=%s year=%d", zone_label, year)
            continue

        log.info("  Zone=%-6s  annual_total=%s", zone_label, annual_total)

        # Step 2 — Monthly totals
        async with conn.cursor() as cur:
            await cur.execute(
                f"""
                SELECT month, SUM({col}) as month_total
                FROM   ercot_forecast_weatherzone
                WHERE  year = %s
                GROUP  BY month
                ORDER  BY month
            """,
                (year,),
            )
            monthly_rows = await cur.fetchall()

        monthly_totals = {int(r[0]): Decimal(str(r[1] or 0)) for r in monthly_rows}

        # Step 3 — Daily totals
        async with conn.cursor() as cur:
            await cur.execute(
                f"""
                SELECT month, day, SUM({col}) as day_total
                FROM   ercot_forecast_weatherzone
                WHERE  year = %s
                GROUP  BY month, day
                ORDER  BY month, day
            """,
                (year,),
            )
            daily_rows = await cur.fetchall()

        daily_totals = {
            (int(r[0]), int(r[1])): Decimal(str(r[2] or 0)) for r in daily_rows
        }

        # Step 4 — Fetch all hourly rows for this zone/year
        async with conn.cursor() as cur:
            await cur.execute(
                f"""
                SELECT oper_date, year, month, day, hour, {col}
                FROM   ercot_forecast_weatherzone
                WHERE  year = %s
                ORDER  BY oper_date, hour
            """,
                (year,),
            )
            hourly_rows = await cur.fetchall()

        # Step 5 — Calculate and upsert shape factors
        upserted = 0
        batch = []

        for row in hourly_rows:
            oper_date, yr, month, day, hour, val = row
            val = Decimal(str(val or 0))
            month_tot = monthly_totals.get(int(month), Decimal("0"))
            day_tot = daily_totals.get((int(month), int(day)), Decimal("0"))

            monthly_shape = safe_divide(month_tot, annual_total)
            daily_shape = safe_divide(day_tot, month_tot)
            hourly_shape = safe_divide(val, day_tot)

            batch.append(
                (
                    str(oper_date),
                    int(yr),
                    int(month),
                    int(day),
                    int(hour),
                    zone_label,
                    str(hourly_shape),
                    str(daily_shape),
                    str(monthly_shape),
                )
            )

            if len(batch) >= 1000:
                async with conn.cursor() as cur:
                    await cur.executemany(
                        """
                        INSERT INTO ercot_shape_weatherzone
                            (oper_date, year, month, day, hour, weather_zone,
                             hourly_shape, daily_shape, monthly_shape)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                        ON DUPLICATE KEY UPDATE
                            hourly_shape=VALUES(hourly_shape),
                            daily_shape=VALUES(daily_shape),
                            monthly_shape=VALUES(monthly_shape),
                            loaded_at=CURRENT_TIMESTAMP
                    """,
                        batch,
                    )
                    upserted += cur.rowcount
                batch = []

        if batch:
            async with conn.cursor() as cur:
                await cur.executemany(
                    """
                    INSERT INTO ercot_shape_weatherzone
                        (oper_date, year, month, day, hour, weather_zone,
                         hourly_shape, daily_shape, monthly_shape)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON DUPLICATE KEY UPDATE
                        hourly_shape=VALUES(hourly_shape),
                        daily_shape=VALUES(daily_shape),
                        monthly_shape=VALUES(monthly_shape),
                        loaded_at=CURRENT_TIMESTAMP
                """,
                    batch,
                )
                upserted += cur.rowcount

        await conn.commit()
        log.info("  Zone=%-6s  upserted=%d", zone_label, upserted)


# ── Load Zone Shape ───────────────────────────────────────────────────────────


async def calculate_loadzone_shape(conn, year: int):
    log.info("Calculating load zone shape for year=%d", year)

    for zone_label in get_load_zones():
        col = zone_label.lower()  # column name matches zone name in table
        # zone = zone_label.lower()

        # Annual total
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
            annual_total = Decimal(str(row[0] or 0))

        if annual_total == 0:
            log.warning("  No data for zone=%s year=%d", zone_label, year)
            continue

        log.info("  Zone=%-8s  annual_total=%s", zone_label, annual_total)

        # Monthly totals
        async with conn.cursor() as cur:
            await cur.execute(
                f"""
                SELECT month, SUM({col}) as month_total
                FROM   ercot_forecast_loadzone
                WHERE  year = %s
                GROUP  BY month
            """,
                (year,),
            )
            monthly_rows = await cur.fetchall()

        monthly_totals = {int(r[0]): Decimal(str(r[1] or 0)) for r in monthly_rows}

        # Daily totals
        async with conn.cursor() as cur:
            await cur.execute(
                f"""
                SELECT month, day, SUM({col}) as day_total
                FROM   ercot_forecast_loadzone
                WHERE  year = %s
                GROUP  BY month, day
            """,
                (year,),
            )
            daily_rows = await cur.fetchall()

        daily_totals = {
            (int(r[0]), int(r[1])): Decimal(str(r[2] or 0)) for r in daily_rows
        }

        # Hourly rows
        async with conn.cursor() as cur:
            await cur.execute(
                f"""
                SELECT oper_date, year, month, day, hour, {col}
                FROM   ercot_forecast_loadzone
                WHERE  year = %s
                ORDER  BY oper_date, hour
            """,
                (year,),
            )
            hourly_rows = await cur.fetchall()

        upserted = 0
        batch = []

        for row in hourly_rows:
            oper_date, yr, month, day, hour, val = row
            val = Decimal(str(val or 0))
            month_tot = monthly_totals.get(int(month), Decimal("0"))
            day_tot = daily_totals.get((int(month), int(day)), Decimal("0"))

            monthly_shape = safe_divide(month_tot, annual_total)
            daily_shape = safe_divide(day_tot, month_tot)
            hourly_shape = safe_divide(val, day_tot)

            batch.append(
                (
                    str(oper_date),
                    int(yr),
                    int(month),
                    int(day),
                    int(hour),
                    zone_label,
                    str(hourly_shape),
                    str(daily_shape),
                    str(monthly_shape),
                )
            )

            if len(batch) >= 1000:
                async with conn.cursor() as cur:
                    await cur.executemany(
                        """
                        INSERT INTO ercot_shape_loadzone
                            (oper_date, year, month, day, hour, load_zone,
                             hourly_shape, daily_shape, monthly_shape)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                        ON DUPLICATE KEY UPDATE
                            hourly_shape=VALUES(hourly_shape),
                            daily_shape=VALUES(daily_shape),
                            monthly_shape=VALUES(monthly_shape),
                            loaded_at=CURRENT_TIMESTAMP
                    """,
                        batch,
                    )
                    upserted += cur.rowcount
                batch = []

        if batch:
            async with conn.cursor() as cur:
                await cur.executemany(
                    """
                    INSERT INTO ercot_shape_loadzone
                        (oper_date, year, month, day, hour, load_zone,
                         hourly_shape, daily_shape, monthly_shape)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON DUPLICATE KEY UPDATE
                        hourly_shape=VALUES(hourly_shape),
                        daily_shape=VALUES(daily_shape),
                        monthly_shape=VALUES(monthly_shape),
                        loaded_at=CURRENT_TIMESTAMP
                """,
                    batch,
                )
                upserted += cur.rowcount

        await conn.commit()
        log.info("  Zone=%-8s  upserted=%d", zone_label, upserted)


# ── Main ──────────────────────────────────────────────────────────────────────


async def main(args):
    pool = await aiomysql.create_pool(**DB_CONFIG, minsize=1, maxsize=3)

    async with pool.acquire() as conn:
        # Get available years
        if args.year:
            years = [args.year]
        else:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT DISTINCT year FROM ercot_forecast_weatherzone ORDER BY year"
                )
                rows = await cur.fetchall()
                years = [r[0] for r in rows]

        log.info("Years to process: %s", years)

        for year in years:
            if not args.loadzone_only:
                await calculate_weatherzone_shape(conn, year)
            if not args.weatherzone_only:
                await calculate_loadzone_shape(conn, year)

    pool.close()
    await pool.wait_closed()
    log.info("Shape calculation complete.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, help="Single year to process")
    parser.add_argument("--weatherzone", dest="loadzone_only", action="store_true")
    parser.add_argument("--loadzone", dest="weatherzone_only", action="store_true")
    args = parser.parse_args()
    asyncio.run(main(args))
