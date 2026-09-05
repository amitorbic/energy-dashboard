"""
ERCOT RTM Settlement Point Prices scraper.

Product: Settlement Point Prices at Resource Nodes, Hubs and Load Zones
(NP6-905-CD), Report Type ID 12301. Unlike LFC/DAM, ERCOT publishes a NEW
file for this product every 15 minutes -- we deliberately do NOT run this
scraper every 15 minutes. Instead it runs ONCE DAILY and, in that single
run, uses the shared engine's mode="all" batch download to grab EVERY file
published for the PREVIOUS US/Central calendar day (~96 files, one per
15-minute interval) in one go, filtering the results table by each file's
own real publish timestamp (parsed from its filename) rather than by
position in the table.

Scheduling: RTM gives full previous-day prices by ~12:30 AM US/Central.
Target run time is 1:00 AM Central (30-min buffer). Same DST-safe approach
as scraper_ercot_dam.py: PM2 runs this HOURLY (cron_restart "0 * * * *" in
ecosystem.rtm.config.js) and the script itself checks the real US/Central
hour via zoneinfo, only actually scraping when it's 1 AM Central; every
other hourly tick logs a note and exits cleanly, not as an error.
"""

import os
import sys
import logging
import asyncio
import urllib.parse
from datetime import datetime, date, timedelta, timezone
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
    "https://www.ercot.com/mp/data-products/data-product-details?id=NP6-905-CD"
)
REPORT_TABLE_SELECTOR = "#reportTable a"

# ── DST-safe scheduling gate ──────────────────────────────────────────────────
CENTRAL_TZ = ZoneInfo("America/Chicago")
TARGET_RUN_HOUR_CT = 1  # 1 AM Central -- 30-min buffer past full-day RTM availability

# ── Database Configuration ───────────────────────────────────────────────────
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = urllib.parse.unquote(os.getenv("DB_PASSWORD", ""))
DB_NAME = os.getenv("DB_NAME")
DB_PORT = int(os.getenv("DB_PORT", "3306"))

INSERT_SQL = """
    INSERT IGNORE INTO ercot_rtm_spp
        (publish_date, publish_time, interval_date, interval_ending_time,
         settlement_point, settlement_point_price)
    VALUES (%s,%s,%s,%s,%s,%s)
"""

# NOTE: field names below are ERCOT's documented NP6-905-CD columns
# (DeliveryDate, DeliveryHour, DeliveryInterval, SettlementPointName,
# SettlementPointPrice). Verify against an actual downloaded sample and
# adjust aliases if reality differs -- same caveat the user flagged for
# this task.
FIELD_ALIASES = {
    "delivery_date": ("deliverydate", "delivery_date", "date"),
    "delivery_hour": ("deliveryhour", "delivery_hour", "hour"),
    "delivery_interval": ("deliveryinterval", "delivery_interval", "interval"),
    "settlement_point": (
        "settlementpointname", "settlement_point_name",
        "settlementpoint", "settlement_point",
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


def parse_int(val):
    if val is None or str(val).strip() == "":
        return None
    try:
        return int(str(val).strip())
    except ValueError:
        return None


def find_val(row: dict, aliases: tuple):
    normalized_row = {str(k).lower().strip(): v for k, v in row.items()}
    for alias in aliases:
        target = str(alias).lower()
        if target in normalized_row and normalized_row[target] is not None:
            return normalized_row[target]
    return None


def compute_interval_ending_time(delivery_hour: int, delivery_interval: int) -> str | None:
    """
    ERCOT's DeliveryHour (1-24, "hour ending" convention) + DeliveryInterval
    (1-4, each a 15-minute slice of that hour) -> a MySQL TIME literal for
    when that interval ends. The last interval of a day is "24:00:00", not
    rolled over to 00:00:00 the next day -- MySQL's TIME type supports
    values past 23:59:59 for exactly this reason, so interval_date stays
    ERCOT's own DeliveryDate with no rollover math needed.
    """
    if delivery_hour is None or delivery_interval is None:
        return None
    minutes = (delivery_hour - 1) * 60 + delivery_interval * 15
    hh, mm = divmod(minutes, 60)
    return f"{hh:02d}:{mm:02d}:00"


def build_db_rows(raw_rows: list[dict], publish_date: date, publish_time) -> list[tuple]:
    db_rows = []
    for r in raw_rows:
        interval_date = parse_delivery_date(find_val(r, FIELD_ALIASES["delivery_date"]))
        delivery_hour = parse_int(find_val(r, FIELD_ALIASES["delivery_hour"]))
        delivery_interval = parse_int(find_val(r, FIELD_ALIASES["delivery_interval"]))
        settlement_point = find_val(r, FIELD_ALIASES["settlement_point"])
        price = safe_float(find_val(r, FIELD_ALIASES["settlement_point_price"]))

        interval_ending_time = compute_interval_ending_time(delivery_hour, delivery_interval)

        if interval_date is None or interval_ending_time is None or not settlement_point:
            continue

        db_rows.append(
            (
                publish_date,
                publish_time,
                interval_date,
                interval_ending_time,
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


# ── Row filter: only files whose real publish timestamp is "yesterday" CT ──
def make_target_date_filter(target_date_ct: date):
    def _filter(file_name: str) -> bool:
        pub_date, _ = engine.parse_filename_timestamp(file_name)
        return pub_date == target_date_ct

    return _filter


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

    yesterday_ct = (now_ct - timedelta(days=1)).date()
    log.info(
        "Central hour %02d:00 matches target -- batch-scraping all RTM files for %s.",
        now_ct.hour,
        yesterday_ct,
    )

    try:
        fetched = await engine.fetch_ercot_files(
            PRODUCT_URL,
            REPORT_TABLE_SELECTOR,
            mode="all",
            row_filter=make_target_date_filter(yesterday_ct),
            max_ip_attempts=engine.MAX_IP_ATTEMPTS,
            max_brightdata_attempts=engine.MAX_BRIGHTDATA_ATTEMPTS,
        )
    except Exception:
        log.exception("Pipeline execution failed (scrape stage -- both tiers exhausted):")
        sys.exit(1)

    if not fetched:
        log.warning("No RTM files matched %s -- nothing to process.", yesterday_ct)
        return

    log.info("Fetched %d file(s) for %s.", len(fetched), yesterday_ct)

    total_inserted = 0
    total_files_ok = 0
    for f in fetched:
        try:
            raw_rows, csv_name, pub_date, pub_time = engine.extract_csv_from_zip(f.zip_bytes)
            db_rows = build_db_rows(raw_rows, pub_date, pub_time)
            if not db_rows:
                log.warning("No valid RTM price rows parsed from %s -- skipping.", csv_name)
                continue
            inserted = await insert_rows(db_rows)
            total_inserted += inserted
            total_files_ok += 1
            log.info("%s -> %d rows committed.", csv_name, inserted)
        except Exception:
            log.exception(
                "Failed to process file %s -- continuing with remaining files.",
                f.file_name,
            )
            continue

    log.info(
        "RTM batch scrape complete for %s. %d/%d file(s) processed, %d total rows committed.",
        yesterday_ct,
        total_files_ok,
        len(fetched),
        total_inserted,
    )


if __name__ == "__main__":
    asyncio.run(main())
