"""
populate_customer_forecast_dates.py
─────────────────────────────────────
Derives customer_forecast_dates from contract_renewal.

Forecast end date rules:
  - future end date (>= today)  → use as-is
  - expired end date (< today)  → today + 15 days
  - null / unparseable end date → today + 15 days

Run after every contract_renewal upload:
  python populate_customer_forecast_dates.py
"""

import asyncio
import logging
from datetime import date, datetime, timedelta
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


def parse_end_date(date_str: str) -> date | None:
    if not date_str or not date_str.strip():
        return None
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%-m/%-d/%Y"):
        try:
            return datetime.strptime(date_str.strip(), fmt).date()
        except ValueError:
            continue
    return None


def get_forecast_end_date(end_date_str: str) -> date:
    """
    Future end date  → use as-is
    Expired/null     → today + 15 days
    """
    today = date.today()
    today_plus_15 = today + timedelta(days=15)
    end_date = parse_end_date(end_date_str)

    if end_date is None or end_date < today:
        return today_plus_15
    return end_date


async def populate(conn):
    today = date.today()

    # Fetch all contracts
    async with conn.cursor() as cur:
        await cur.execute("""
            SELECT premise_id, load_profile, contract_renewal_usage, contract_end_date
            FROM   contract_renewal
            WHERE  premise_id IS NOT NULL
              AND  premise_id != ''
        """)
        contracts = await cur.fetchall()

    log.info("Contracts fetched: %d", len(contracts))

    upserted = 0
    skipped = 0
    batch = []

    for row in contracts:
        esid = (row[0] or "").strip()
        load_profile = (row[1] or "").strip()
        usage_str = (row[2] or "").strip()
        end_date_str = (row[3] or "").strip()

        if not esid:
            skipped += 1
            continue

        # Parse fields
        parts = load_profile.upper().split("_") if load_profile else []
        weather_zone = next((p for p in parts if weather_to_load(p)), None)
        load_zone = weather_to_load(weather_zone) if weather_zone else None
        contract_end_date = parse_end_date(end_date_str)
        forecast_end_date = get_forecast_end_date(end_date_str)

        # Parse annual kWh
        try:
            annual_kwh = Decimal(usage_str.replace(",", "")) if usage_str else None
        except Exception:
            annual_kwh = None

        batch.append(
            (
                esid,
                str(contract_end_date) if contract_end_date else None,
                str(forecast_end_date),
                load_profile or None,
                annual_kwh,
                load_zone,
                weather_zone,
            )
        )

        if len(batch) >= 500:
            async with conn.cursor() as cur:
                await cur.executemany(
                    """
                    INSERT INTO customer_forecast_dates
                        (esid, contract_end_date, forecast_end_date,
                         load_profile, annual_kwh, load_zone, weather_zone)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        contract_end_date = VALUES(contract_end_date),
                        forecast_end_date = VALUES(forecast_end_date),
                        load_profile      = VALUES(load_profile),
                        annual_kwh        = VALUES(annual_kwh),
                        load_zone         = VALUES(load_zone),
                        weather_zone      = VALUES(weather_zone),
                        updated_at        = CURRENT_TIMESTAMP
                """,
                    batch,
                )
                upserted += cur.rowcount
            batch = []

    if batch:
        async with conn.cursor() as cur:
            await cur.executemany(
                """
                INSERT INTO customer_forecast_dates
                    (esid, contract_end_date, forecast_end_date,
                     load_profile, annual_kwh, load_zone, weather_zone)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    contract_end_date = VALUES(contract_end_date),
                    forecast_end_date = VALUES(forecast_end_date),
                    load_profile      = VALUES(load_profile),
                    annual_kwh        = VALUES(annual_kwh),
                    load_zone         = VALUES(load_zone),
                    weather_zone      = VALUES(weather_zone),
                    updated_at        = CURRENT_TIMESTAMP
            """,
                batch,
            )
            upserted += cur.rowcount

    await conn.commit()
    log.info("Done — upserted=%d  skipped=%d", upserted, skipped)

    # Summary
    async with conn.cursor() as cur:
        await cur.execute("""
            SELECT load_zone, COUNT(*) as customers,
                   SUM(annual_kwh) as total_kwh,
                   SUM(annual_kwh) / 1000 as total_mwh
            FROM   customer_forecast_dates
            WHERE  load_zone IS NOT NULL
            GROUP  BY load_zone
            ORDER  BY load_zone
        """)
        rows = await cur.fetchall()

    log.info("Summary by load zone:")
    for r in rows:
        log.info(
            "  %-8s  customers=%d  annual_kwh=%s  annual_mwh=%s", r[0], r[1], r[2], r[3]
        )


async def main():
    pool = await aiomysql.create_pool(**DB_CONFIG, minsize=1, maxsize=3)
    async with pool.acquire() as conn:
        await populate(conn)
    pool.close()
    await pool.wait_closed()


if __name__ == "__main__":
    asyncio.run(main())
