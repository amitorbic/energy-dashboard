"""
ERCOT DAM Settlement Point Prices scraper.

Product: DAM Settlement Point Prices (NP4-190-CD), Report Type ID 12331.
Published once daily, after the Day-Ahead Market closes (~2:30 PM
US/Central). Grabs the LATEST published file only, via the shared
browser/proxy/Bright Data engine in ercot_scraper_engine.py.

Scheduling: this isn't a DAM-deadline-timed job the way the LFC 7am/8am
captures are, so it uses the engine's normal (non-boosted) retry budgets.
PM2 runs this script HOURLY (cron_restart "0 * * * *" in
ecosystem.dam.config.js) rather than a single fixed UTC cron time, because
the VPS runs in UTC and US/Central shifts between CDT/CST across DST twice
a year -- a hardcoded UTC time would drift wrong. Instead the script itself
checks the real US/Central hour via zoneinfo (same pattern as
scraper_ercot_lfc.py's get_central_capture_time()) and only actually
scrapes when it's 3 PM Central (a 30-min buffer past DAM settlement);
every other hourly tick logs a note and exits cleanly, not as an error.
"""

import os
import sys
import logging
import asyncio
import urllib.parse
from datetime import datetime, date, timezone
from zoneinfo import ZoneInfo

import aiomysql
from dotenv import load_dotenv

load_dotenv()

import ercot_scraper_engine as engine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

# ── ERCOT URL ─────────────────────────────────────────────────────────────────
PRODUCT_URL = (
    "https://www.ercot.com/mp/data-products/data-product-details?id=NP4-190-CD"
)
REPORT_TABLE_SELECTOR = "#reportTable a"

# ── DST-safe scheduling gate ──────────────────────────────────────────────────
CENTRAL_TZ = ZoneInfo("America/Chicago")
TARGET_RUN_HOUR_CT = 15  # 3 PM Central -- 30-min buffer past DAM settlement (2:30 PM CT)

# ── Database Configuration ───────────────────────────────────────────────────
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = urllib.parse.unquote(os.getenv("DB_PASSWORD", ""))
DB_NAME = os.getenv("DB_NAME")
DB_PORT = int(os.getenv("DB_PORT", "3306"))

INSERT_SQL = """
    INSERT IGNORE INTO ercot_dam_spp
        (publish_date, publish_time, delivery_date, hour_ending,
         settlement_point, settlement_point_price)
    VALUES (%s,%s,%s,%s,%s,%s)
"""

# NOTE: field names below are ERCOT's documented NP4-190-CD columns
# (DeliveryDate, HourEnding, SettlementPoint, SettlementPointPrice).
# Verify against an actual downloaded sample and adjust aliases if reality
# differs -- same caveat the user flagged for this task.
FIELD_ALIASES = {
    "delivery_date": ("deliverydate", "delivery_date", "date"),
    "hour_ending": ("hourending", "hour_ending", "he"),
    "settlement_point": (
        "settlementpoint", "settlement_point", "settlementpointname",
    ),
    "settlement_point_price": (
        "settlementpointprice", "settlement_point_price", "spp", "price",
    ),
}


# ── Parsing Helpers (same conventions as scraper_ercot_lfc.py) ──────────────
def safe_float(val):
    if val is None:
        return None
    try:
        return float(str(val).replace(",", "").strip())
    except (ValueError, TypeError):
        return None


def parse_delivery_date(val):
    if not val:
        return None
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%Y%m%d", "%d-%b-%Y"):
        try:
            return datetime.strptime(str(val).strip(), fmt).date()
        except ValueError:
            continue
    return None


def parse_hour_ending(val):
    if not val:
        return None
    s = str(val).strip()
    if ":" in s:
        s = s.split(":")[0]
    try:
        return int(s)
    except ValueError:
        return None


def find_val(row: dict, aliases: tuple):
    normalized_row = {str(k).lower().strip(): v for k, v in row.items()}
    for alias in aliases:
        target = str(alias).lower()
        if target in normalized_row and normalized_row[target] is not None:
            return normalized_row[target]
    return None


def build_db_rows(raw_rows: list[dict], publish_date: date, publish_time) -> list[tuple]:
    db_rows = []
    for r in raw_rows:
        delivery_date = parse_delivery_date(find_val(r, FIELD_ALIASES["delivery_date"]))
        hour_ending = parse_hour_ending(find_val(r, FIELD_ALIASES["hour_ending"]))
        settlement_point = find_val(r, FIELD_ALIASES["settlement_point"])
        price = safe_float(find_val(r, FIELD_ALIASES["settlement_point_price"]))

        if delivery_date is None or hour_ending is None or not settlement_point:
            continue

        db_rows.append(
            (
                publish_date,
                publish_time,
                delivery_date,
                hour_ending,
                str(settlement_point).strip(),
                round(price, 4) if price is not None else None,
            )
        )
    return db_rows


# ── MySQL Async Ingestion ────────────────────────────────────────────────────
async def insert_rows(db_rows: list[tuple]) -> int:
    if not DB_NAME:
        raise ValueError("DB_NAME is not configured in .env")

    conn = await aiomysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        db=DB_NAME,
        autocommit=False,
    )
    try:
        inserted = 0
        async with conn.cursor() as cur:
            for i in range(0, len(db_rows), 500):
                batch = db_rows[i : i + 500]
                await cur.executemany(INSERT_SQL, batch)
                inserted += cur.rowcount
        await conn.commit()
        return inserted
    finally:
        conn.close()


# ── Fetch + extract ───────────────────────────────────────────────────────────
async def fetch_latest_zip_and_parse():
    fetched = await engine.fetch_ercot_files(
        PRODUCT_URL,
        REPORT_TABLE_SELECTOR,
        mode="latest",
        max_ip_attempts=engine.MAX_IP_ATTEMPTS,
        max_brightdata_attempts=engine.MAX_BRIGHTDATA_ATTEMPTS,
    )
    zip_bytes = fetched[0].zip_bytes

    rows, csv_name, publish_date, publish_time = engine.extract_csv_from_zip(zip_bytes)
    log.info("Reading CSV target inside zip archive: %s", csv_name)
    return rows, publish_date, publish_time


# ── Orchestrator Main Execution Loop ──────────────────────────────────────────
async def main():
    now_ct = datetime.now(timezone.utc).astimezone(CENTRAL_TZ)
    if now_ct.hour != TARGET_RUN_HOUR_CT:
        log.info(
            "Current Central hour is %02d:00 (target is %02d:00) -- not this "
            "hour's scheduled run, exiting cleanly.",
            now_ct.hour,
            TARGET_RUN_HOUR_CT,
        )
        return

    log.info(
        "Central hour %02d:00 matches target -- starting DAM SPP scrape.",
        now_ct.hour,
    )

    try:
        raw_rows, pub_date, pub_time = await fetch_latest_zip_and_parse()
    except Exception:
        log.exception("Pipeline execution failed (scrape stage -- both tiers exhausted):")
        sys.exit(1)

    try:
        log.info("Successfully extracted %d raw records from CSV.", len(raw_rows))

        db_rows = build_db_rows(raw_rows, pub_date, pub_time)
        log.info("Normalized rows matching schema: %d records.", len(db_rows))

        if not db_rows:
            log.warning("No valid DAM price rows remained after parsing filters.")
            return

        inserted = await insert_rows(db_rows)
        log.info(
            "Database transaction complete. %d new records committed.", inserted
        )

    except Exception:
        log.exception("Pipeline execution failed (processing/save stage):")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
