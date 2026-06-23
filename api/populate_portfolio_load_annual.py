"""
populate_portfolio_load_annual.py
──────────────────────────────────
Populates portfolio_load_annual table:

  2024 → backcast:
         portfolio_zone_2024 = portfolio_zone_2025 
                               × (ercot_zone_2024_total / ercot_zone_2025_total)
         Source: ercot_load_history for 2024 actuals
                 ercot_forecast_loadzone for 2025 base

  2025 → directly from customer_forecast_dates
         (current active contracts annual MWh by load zone)

  2026+ → customer_forecast_dates + future_forecast_dates
          filtered by forecast_end_date >= Jan 1 of that year

Run:
  python populate_portfolio_load_annual.py
  python populate_portfolio_load_annual.py --year 2025  # single year
"""

import argparse
import asyncio
import logging
from datetime import date

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

# Weather zone columns in ercot_load_history → load zone mapping
WEATHER_TO_LOAD = {
    "coast":         "HOUSTON",
    "east":          "NORTH",
    "far_west":      "WEST",
    "north":         "NORTH",
    "north_central": "NORTH",
    "south_central": "SOUTH",
    "southern":      "SOUTH",
    "west":          "WEST",
}

LOAD_ZONES = ["HOUSTON", "NORTH", "SOUTH", "WEST"]
BASE_YEAR  = 2025


async def get_portfolio_2025(conn) -> dict[str, float]:
    """Get current portfolio annual MWh from customer_forecast_dates."""
    async with conn.cursor() as cur:
        await cur.execute("""
            SELECT load_zone, SUM(annual_kwh) / 1000.0
            FROM   customer_forecast_dates
            WHERE  load_zone   IS NOT NULL
              AND  annual_kwh  IS NOT NULL
              AND  forecast_end_date >= %s
            GROUP  BY load_zone
        """, (f"{BASE_YEAR}-01-01",))
        rows = await cur.fetchall()

    result = {z: 0.0 for z in LOAD_ZONES}
    for row in rows:
        if row[0] in LOAD_ZONES:
            result[row[0]] = float(row[1] or 0)

    # Add future contracts active in 2025
    async with conn.cursor() as cur:
        await cur.execute("""
            SELECT load_zone, SUM(annual_kwh) / 1000.0
            FROM   future_forecast_dates
            WHERE  load_zone            IS NOT NULL
              AND  annual_kwh           IS NOT NULL
              AND  forecast_start_date  <= %s
              AND  forecast_end_date    >= %s
            GROUP  BY load_zone
        """, (f"{BASE_YEAR}-12-31", f"{BASE_YEAR}-01-01"))
        rows = await cur.fetchall()

    for row in rows:
        if row[0] in LOAD_ZONES:
            result[row[0]] = result.get(row[0], 0.0) + float(row[1] or 0)

    log.info("Portfolio 2025 annual MWh:")
    for zone, mwh in result.items():
        log.info("  %-8s  %.2f MWh", zone, mwh)

    return result


async def get_ercot_annual_by_loadzone(conn, year: int,
                                        use_history: bool = True) -> dict[str, float]:
    """
    Get ERCOT annual total by load zone for a given year.
    use_history=True  → ercot_load_history (actuals)
    use_history=False → ercot_forecast_loadzone (forecast)
    """
    result = {z: 0.0 for z in LOAD_ZONES}

    if use_history:
        # Sum weather zones from ercot_load_history → aggregate to load zone
        for wz_col, load_zone in WEATHER_TO_LOAD.items():
            async with conn.cursor() as cur:
                await cur.execute(f"""
                    SELECT SUM({wz_col})
                    FROM   ercot_load_history
                    WHERE  YEAR(oper_date) = %s
                      AND  {wz_col} IS NOT NULL
                """, (year,))
                row = await cur.fetchone()
                val = float(row[0] or 0)
                result[load_zone] = result.get(load_zone, 0.0) + val
    else:
        # Use ercot_forecast_loadzone
        async with conn.cursor() as cur:
            await cur.execute("""
                SELECT SUM(houston), SUM(north), SUM(south), SUM(west)
                FROM   ercot_forecast_loadzone
                WHERE  year = %s
            """, (year,))
            row = await cur.fetchone()
            result["HOUSTON"] = float(row[0] or 0)
            result["NORTH"]   = float(row[1] or 0)
            result["SOUTH"]   = float(row[2] or 0)
            result["WEST"]    = float(row[3] or 0)

    return result


async def upsert_year(conn, year: int, zone_mwh: dict[str, float], source: str):
    """Upsert annual MWh for a given year."""
    async with conn.cursor() as cur:
        for zone, mwh in zone_mwh.items():
            if mwh > 0:
                await cur.execute("""
                    INSERT INTO portfolio_load_annual
                        (year, load_zone, annual_mwh, source)
                    VALUES (%s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        annual_mwh = VALUES(annual_mwh),
                        source     = VALUES(source),
                        loaded_at  = CURRENT_TIMESTAMP
                """, (year, zone, round(mwh, 4), source))
    await conn.commit()
    log.info("Year=%d  source=%-12s  zones=%s",
             year, source,
             {z: round(v, 2) for z, v in zone_mwh.items() if v > 0})


async def populate(conn, year_filter: int | None):
    today = date.today()

    # ── 2025 — directly from customer_forecast_dates ──────────────────────────
    if not year_filter or year_filter == 2025:
        portfolio_2025 = await get_portfolio_2025(conn)
        await upsert_year(conn, 2025, portfolio_2025, "customer_db")

    # ── 2024 — backcast from ercot_load_history ───────────────────────────────
    if not year_filter or year_filter == 2024:
        portfolio_2025 = await get_portfolio_2025(conn)

        ercot_2024 = await get_ercot_annual_by_loadzone(conn, 2024, use_history=True)
        ercot_2025 = await get_ercot_annual_by_loadzone(conn, 2025, use_history=False)

        portfolio_2024 = {}
        for zone in LOAD_ZONES:
            e2024 = ercot_2024.get(zone, 0.0)
            e2025 = ercot_2025.get(zone, 0.0)
            if e2025 > 0:
                ratio = e2024 / e2025
                portfolio_2024[zone] = portfolio_2025.get(zone, 0.0) * ratio
            else:
                portfolio_2024[zone] = 0.0

        log.info("Backcast ratios 2024/2025:")
        for zone in LOAD_ZONES:
            e24 = ercot_2024.get(zone, 0)
            e25 = ercot_2025.get(zone, 0)
            ratio = e24/e25 if e25 > 0 else 0
            log.info("  %-8s  ercot_2024=%12.0f  ercot_2025=%12.0f  ratio=%.4f",
                     zone, e24, e25, ratio)

        await upsert_year(conn, 2024, portfolio_2024, "backcast")

    # ── 2026+ — customer_forecast_dates filtered by year ─────────────────────
    future_years = [y for y in range(2026, 2045)
                    if not year_filter or year_filter == y]

    for year in future_years:
        jan1 = f"{year}-01-01"
        dec31 = f"{year}-12-31"

        async with conn.cursor() as cur:
            await cur.execute("""
                SELECT load_zone, SUM(annual_kwh) / 1000.0
                FROM   customer_forecast_dates
                WHERE  load_zone IS NOT NULL
                  AND  annual_kwh IS NOT NULL
                  AND  forecast_end_date >= %s
                GROUP  BY load_zone
            """, (jan1,))
            rows = await cur.fetchall()

        zone_mwh = {z: 0.0 for z in LOAD_ZONES}
        for row in rows:
            if row[0] in LOAD_ZONES:
                zone_mwh[row[0]] = float(row[1] or 0)

        # Add future contracts
        async with conn.cursor() as cur:
            await cur.execute("""
                SELECT load_zone, SUM(annual_kwh) / 1000.0
                FROM   future_forecast_dates
                WHERE  load_zone IS NOT NULL
                  AND  annual_kwh IS NOT NULL
                  AND  forecast_start_date <= %s
                  AND  forecast_end_date   >= %s
                GROUP  BY load_zone
            """, (dec31, jan1))
            rows = await cur.fetchall()

        for row in rows:
            if row[0] in LOAD_ZONES:
                zone_mwh[row[0]] = zone_mwh.get(row[0], 0.0) + float(row[1] or 0)

        if any(v > 0 for v in zone_mwh.values()):
            await upsert_year(conn, year, zone_mwh, "customer_db")


async def main(args):
    pool = await aiomysql.create_pool(**DB_CONFIG, minsize=1, maxsize=3)
    async with pool.acquire() as conn:
        await populate(conn, args.year)
    pool.close()
    await pool.wait_closed()

    log.info("Done. Verify:")
    log.info("  SELECT year, load_zone, annual_mwh, source")
    log.info("  FROM portfolio_load_annual ORDER BY year, load_zone;")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, help="Single year to populate")
    args = parser.parse_args()
    asyncio.run(main(args))
