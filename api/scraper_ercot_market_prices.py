"""
ERCOT daily market-prices scraper -- RTM/DAM Settlement Point Prices and DAM
Ancillary Service (capacity) Clearing Prices.

Unlike the MIS "cdr" ZIP products (LFC/DAM-SPP-ZIP/RTM-SPP-ZIP), these three
reports are plain, directly server-rendered HTML pages under
https://www.ercot.com/content/cdr/html/ -- no ZIP, no "#reportTable" results
listing, no per-file publish-timestamp filename to parse. As of the time this
script was written these pages are NOT behind Incapsula's JS challenge when
reached through a normal residential-class IP (confirmed by direct fetch from
outside this project's own network); they only 403/Incapsula-redirect when
reached from a datacenter-class IP, which is exactly the same failure mode
the rest of this project's Bright Data/IPRoyal setup already exists to work
around. So this script keeps the project's two-tier defense-in-depth, but
right-sized for a much simpler target:

  Tier 1 (primary): plain aiohttp GET routed through the existing IPRoyal
                     proxy (PROXY_HOST/PORT/USER/PASS), a handful of retries
                     with a fresh connection each time. Expected to succeed
                     essentially every run.
  Tier 2 (fallback): Bright Data Browser API over CDP (Patchright), same
                     BRIGHTDATA_USER/PASS/HOST as ercot_scraper_engine.py.
                     No selector-wait needed -- these are plain server-
                     rendered pages, so this tier just navigates and reads
                     page.content(), then parses it with the same
                     pandas.read_html()-based logic as Tier 1.

This script does NOT modify and does NOT import any private helper from
ercot_scraper_engine.py -- it only reads the already-public PROXY_*/
BRIGHTDATA_* constants from that module so credentials aren't duplicated.

NOTE: because every direct-fetch attempt made while writing this script hit
Incapsula from this environment's own (datacenter-class) IP, the exact live
HTML table structure could not be independently re-verified here. Column
names below are exactly what the user specified from their own confirmed,
already-working direct fetch -- but see the parsing helpers for the
defensive fallbacks (multiple date/time formats, "which table has the
expected header" search) added specifically because that live verification
step wasn't possible from here.

DATA SOURCES (all three fetched once daily, ~1:00 AM US/Central):
  1. RTM Settlement Point Prices  -- .../{YYYYMMDD}_real_time_spp.html
     Wide table: Oper Day, Interval Ending, + 15 HB_*/LZ_* price columns.
     Melted to long format -> ercot_rtm_settlement_prices.
  2. DAM Settlement Point Prices  -- .../{YYYYMMDD}_dam_spp.html
     Wide table: Oper Day, Hour Ending, + the same 15 HB_*/LZ_* columns.
     Melted to long format -> ercot_dam_settlement_prices.
  3. DAM Clearing Prices for Capacity -- .../{YYYYMMDD}_dam_mcpc.html
     Wide table: Oper Day, Hour Ending, + NON-SPIN/REG-DOWN/REG-UP/RRS/ECRS.
     Melted to long format -> ercot_dam_capacity_prices.

SCHEDULING: same DST-safe pattern as the other ERCOT scrapers -- PM2 runs
this hourly (ecosystem.market-prices.config.js, cron_restart "0 * * * *")
and the script itself only does real work when the actual US/Central hour
is 1 AM; every other hourly tick logs a note and exits cleanly.

BACKFILL / SELF-HEALING: the source site keeps ~5 days of history per report
(confirmed: 5 "History" links shown on the page). Each run checks, for each
of the 3 tables, the primary target date PLUS the 4 days before it -- for any
of those 5 dates that don't already have rows in the DB, it fetches and
inserts them. This gives natural recovery from a failed run without needing
the failure-alert email machinery the hourly LFC scraper has.
"""

import os
import re
import io
import sys
import logging
import asyncio
import urllib.parse
from datetime import datetime, date, timedelta, timezone
from zoneinfo import ZoneInfo

import aiohttp
import aiomysql
import pandas as pd
from dotenv import load_dotenv
from patchright.async_api import async_playwright

load_dotenv()

import ercot_scraper_engine as engine  # read-only: reuse PROXY_*/BRIGHTDATA_* constants only

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

# ── ERCOT report URLs ─────────────────────────────────────────────────────────
RTM_URL_FMT = "https://www.ercot.com/content/cdr/html/{ymd}_real_time_spp.html"
DAM_SPP_URL_FMT = "https://www.ercot.com/content/cdr/html/{ymd}_dam_spp.html"
DAM_MCPC_URL_FMT = "https://www.ercot.com/content/cdr/html/{ymd}_dam_mcpc.html"

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

# 15 HB_*/LZ_* settlement-point columns shared by the RTM and DAM SPP reports.
SPP_SETTLEMENT_POINTS = [
    "HB_BUSAVG", "HB_HOUSTON", "HB_HUBAVG", "HB_NORTH", "HB_PAN",
    "HB_SOUTH", "HB_WEST",
    "LZ_AEN", "LZ_CPS", "LZ_HOUSTON", "LZ_LCRA", "LZ_NORTH",
    "LZ_RAYBN", "LZ_SOUTH", "LZ_WEST",
]
MCPC_SERVICE_TYPES = ["NON-SPIN", "REG-DOWN", "REG-UP", "RRS", "ECRS"]

# ── DST-safe scheduling gate ──────────────────────────────────────────────────
CENTRAL_TZ = ZoneInfo("America/Chicago")
TARGET_RUN_HOUR_CT = 1  # 1 AM Central -- RTM's tightest constraint
HISTORY_WINDOW_DAYS = 5  # site keeps ~5 days of "History" links per report

# ── Database Configuration ───────────────────────────────────────────────────
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = urllib.parse.unquote(os.getenv("DB_PASSWORD", ""))
DB_NAME = os.getenv("DB_NAME")
DB_PORT = int(os.getenv("DB_PORT", "3306"))

RTM_INSERT_SQL = """
    INSERT IGNORE INTO ercot_rtm_settlement_prices
        (capture_date, capture_time, operating_date, interval_ending,
         settlement_point, price)
    VALUES (%s,%s,%s,%s,%s,%s)
"""
DAM_SPP_INSERT_SQL = """
    INSERT IGNORE INTO ercot_dam_settlement_prices
        (capture_date, capture_time, operating_date, hour_ending,
         settlement_point, price)
    VALUES (%s,%s,%s,%s,%s,%s)
"""
DAM_MCPC_INSERT_SQL = """
    INSERT IGNORE INTO ercot_dam_capacity_prices
        (capture_date, capture_time, operating_date, hour_ending,
         ancillary_service_type, price)
    VALUES (%s,%s,%s,%s,%s,%s)
"""


# ── Tier 1: plain aiohttp through the IPRoyal proxy ──────────────────────────
async def _fetch_via_proxy(url: str, attempts: int = 5) -> str:
    if not (engine.PROXY_USER and engine.PROXY_PASS):
        raise RuntimeError("No PROXY_USER/PROXY_PASS configured -- cannot use Tier 1.")

    proxy_url = f"http://{engine.PROXY_HOST}:{engine.PROXY_PORT}"
    proxy_auth = aiohttp.BasicAuth(engine.PROXY_USER, engine.PROXY_PASS)

    last_error = None
    for attempt in range(1, attempts + 1):
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    url,
                    proxy=proxy_url,
                    proxy_auth=proxy_auth,
                    headers={"User-Agent": USER_AGENT},
                    timeout=aiohttp.ClientTimeout(total=30),
                ) as resp:
                    if resp.status == 200:
                        return await resp.text()
                    raise RuntimeError(f"HTTP {resp.status}")
        except Exception as e:
            last_error = e
            log.warning("[Tier 1 attempt %d/%d] %s failed: %s", attempt, attempts, url, e)
            continue

    raise RuntimeError(f"Tier 1 exhausted after {attempts} attempts: {last_error}")


# ── Tier 2: Bright Data Browser API (fallback) ───────────────────────────────
async def _fetch_via_brightdata(url: str) -> str:
    if not (engine.BRIGHTDATA_USER and engine.BRIGHTDATA_PASS):
        raise RuntimeError(
            "BRIGHTDATA_USER/BRIGHTDATA_PASS not set in .env -- cannot use Tier 2."
        )

    ws_endpoint = f"wss://{engine.BRIGHTDATA_USER}:{engine.BRIGHTDATA_PASS}@{engine.BRIGHTDATA_HOST}"

    async with async_playwright() as p:
        log.info("[Bright Data] Connecting to remote browser for %s...", url)
        browser = await p.chromium.connect_over_cdp(ws_endpoint, timeout=60_000)
        context = browser.contexts[0] if browser.contexts else await browser.new_context()
        page = await context.new_page()

        try:
            resp = await page.goto(url, wait_until="domcontentloaded", timeout=60_000)
            # Plain server-rendered page -- no results table/selector to wait
            # for, unlike the MIS product pages the shared engine handles.
            html = await page.content()
        finally:
            await browser.close()

        if resp is None or resp.status != 200:
            raise RuntimeError(
                f"[Bright Data] fetch failed for {url}: "
                f"HTTP {resp.status if resp else 'no response'}"
            )
        return html


async def fetch_page(url: str) -> str:
    """Tier 1 (IPRoyal) with Tier 2 (Bright Data) fallback."""
    if engine.PROXY_USER and engine.PROXY_PASS:
        try:
            return await _fetch_via_proxy(url)
        except Exception as e:
            log.warning("Tier 1 exhausted for %s (%s) -- falling back to Bright Data.", url, e)
    else:
        log.warning("No PROXY_USER/PROXY_PASS configured -- skipping Tier 1 for %s.", url)

    return await _fetch_via_brightdata(url)


# ── HTML table parsing ───────────────────────────────────────────────────────
def _read_tables(html: str) -> list[pd.DataFrame]:
    return pd.read_html(io.StringIO(html))


def _find_data_table(tables: list[pd.DataFrame], period_col_candidates: tuple) -> pd.DataFrame:
    """Some ERCOT cdr pages render more than one <table> on the page (e.g. a
    title/legend table alongside the real data table) -- pick the one whose
    header actually contains the period column we're looking for, rather
    than assuming the data table is always tables[0]."""
    for df in tables:
        cols = [str(c).strip() for c in df.columns]
        if any(any(cand.lower() in c.lower() for cand in period_col_candidates) for c in cols):
            df = df.copy()
            df.columns = cols
            return df
    raise ValueError(
        f"No table with expected column(s) {period_col_candidates} found on page."
    )


def _melt_wide_table(
    df: pd.DataFrame, date_col: str, period_col: str, value_columns: list, var_name: str
) -> pd.DataFrame:
    present = [c for c in value_columns if c in df.columns]
    missing = set(value_columns) - set(present)
    if missing:
        log.warning("Expected column(s) missing from parsed table: %s", sorted(missing))
    if date_col not in df.columns or period_col not in df.columns:
        raise ValueError(f"Expected columns {date_col!r}/{period_col!r} not found in table.")
    return df.melt(
        id_vars=[date_col, period_col], value_vars=present, var_name=var_name, value_name="price"
    )


# ── Value parsing helpers ────────────────────────────────────────────────────
def parse_oper_day(val) -> "date | None":
    s = str(val).strip()
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%m-%d-%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def parse_interval_ending(val) -> "str | None":
    """RTM's 'Interval Ending' column -- HH:MM (or HH:MM:SS), including
    '24:00' for the day's last interval (ERCOT's own hour-ending convention;
    MySQL TIME supports values past 23:59:59, so no rollover math needed).
    Also accepts a bare HHMM digit rendering (e.g. "15", "930", "2400"),
    since pandas.read_html silently casts a pure-digit column to int/float,
    which drops the colon and any leading zero -- this report's live HTML
    could not be independently re-verified from this environment (see
    module docstring), so both shapes are accepted rather than assuming
    one exact rendering."""
    s = str(val).strip()
    if not s or s.lower() == "nan":
        return None

    m = re.match(r"^(\d{1,2}):(\d{2})(?::(\d{2}))?$", s)
    if m:
        hh, mm, ss = int(m.group(1)), int(m.group(2)), int(m.group(3) or 0)
        return f"{hh:02d}:{mm:02d}:{ss:02d}"

    try:
        digits = str(int(float(s)))
    except ValueError:
        return None
    digits = digits.zfill(4)
    if len(digits) != 4:
        return None
    hh, mm = int(digits[:2]), int(digits[2:])
    if hh > 24 or mm > 59:
        return None
    return f"{hh:02d}:{mm:02d}:00"


def parse_hour_ending(val) -> "int | None":
    """DAM's 'Hour Ending' column -- accepts a bare integer (1-24) or an
    'HH:MM' style value (e.g. '01:00'); either way we only need the hour."""
    m = re.match(r"^\s*(\d{1,2})", str(val))
    if not m:
        return None
    return int(m.group(1))


def parse_price(val) -> "float | None":
    try:
        return round(float(str(val).replace(",", "").strip()), 4)
    except (ValueError, TypeError):
        return None


# ── Database helpers ─────────────────────────────────────────────────────────
async def _db_connect():
    if not DB_NAME:
        raise ValueError("DB_NAME is not configured in .env")
    return await aiomysql.connect(
        host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PASSWORD,
        db=DB_NAME, autocommit=False,
    )


async def date_has_rows(table: str, date_col: str, target_date: date) -> bool:
    conn = await _db_connect()
    try:
        async with conn.cursor() as cur:
            await cur.execute(f"SELECT 1 FROM `{table}` WHERE `{date_col}`=%s LIMIT 1", (target_date,))
            return (await cur.fetchone()) is not None
    finally:
        conn.close()


async def insert_rows(insert_sql: str, rows: list) -> int:
    if not rows:
        return 0
    conn = await _db_connect()
    try:
        inserted = 0
        async with conn.cursor() as cur:
            for i in range(0, len(rows), 500):
                batch = rows[i : i + 500]
                await cur.executemany(insert_sql, batch)
                inserted += cur.rowcount
        await conn.commit()
        return inserted
    finally:
        conn.close()


# ── Per-report processors ────────────────────────────────────────────────────
async def process_rtm_date(target_date: date, capture_date: date, capture_time) -> int:
    if await date_has_rows("ercot_rtm_settlement_prices", "operating_date", target_date):
        log.info("RTM %s already present -- skipping.", target_date)
        return 0

    url = RTM_URL_FMT.format(ymd=target_date.strftime("%Y%m%d"))
    try:
        html = await fetch_page(url)
        df = _find_data_table(_read_tables(html), ("Interval Ending",))
        long_df = _melt_wide_table(df, "Oper Day", "Interval Ending", SPP_SETTLEMENT_POINTS, "settlement_point")
    except Exception:
        log.exception("RTM fetch/parse failed for %s -- skipping this date.", target_date)
        return 0

    rows = []
    for _, r in long_df.iterrows():
        op_date = parse_oper_day(r["Oper Day"])
        interval_ending = parse_interval_ending(r["Interval Ending"])
        if op_date is None or interval_ending is None:
            continue
        rows.append(
            (capture_date, capture_time, op_date, interval_ending,
             str(r["settlement_point"]).strip(), parse_price(r["price"]))
        )

    if not rows:
        log.warning("No valid RTM rows parsed for %s.", target_date)
        return 0

    inserted = await insert_rows(RTM_INSERT_SQL, rows)
    log.info("RTM %s -> %d rows committed.", target_date, inserted)
    return inserted


async def process_dam_spp_date(target_date: date, capture_date: date, capture_time) -> int:
    if await date_has_rows("ercot_dam_settlement_prices", "operating_date", target_date):
        log.info("DAM SPP %s already present -- skipping.", target_date)
        return 0

    url = DAM_SPP_URL_FMT.format(ymd=target_date.strftime("%Y%m%d"))
    try:
        html = await fetch_page(url)
        df = _find_data_table(_read_tables(html), ("Hour Ending",))
        long_df = _melt_wide_table(df, "Oper Day", "Hour Ending", SPP_SETTLEMENT_POINTS, "settlement_point")
    except Exception:
        log.exception("DAM SPP fetch/parse failed for %s -- skipping this date.", target_date)
        return 0

    rows = []
    for _, r in long_df.iterrows():
        op_date = parse_oper_day(r["Oper Day"])
        hour_ending = parse_hour_ending(r["Hour Ending"])
        if op_date is None or hour_ending is None:
            continue
        rows.append(
            (capture_date, capture_time, op_date, hour_ending,
             str(r["settlement_point"]).strip(), parse_price(r["price"]))
        )

    if not rows:
        log.warning("No valid DAM SPP rows parsed for %s.", target_date)
        return 0

    inserted = await insert_rows(DAM_SPP_INSERT_SQL, rows)
    log.info("DAM SPP %s -> %d rows committed.", target_date, inserted)
    return inserted


async def process_dam_mcpc_date(target_date: date, capture_date: date, capture_time) -> int:
    if await date_has_rows("ercot_dam_capacity_prices", "operating_date", target_date):
        log.info("DAM MCPC %s already present -- skipping.", target_date)
        return 0

    url = DAM_MCPC_URL_FMT.format(ymd=target_date.strftime("%Y%m%d"))
    try:
        html = await fetch_page(url)
        df = _find_data_table(_read_tables(html), ("Hour Ending",))
        long_df = _melt_wide_table(df, "Oper Day", "Hour Ending", MCPC_SERVICE_TYPES, "ancillary_service_type")
    except Exception:
        log.exception("DAM MCPC fetch/parse failed for %s -- skipping this date.", target_date)
        return 0

    rows = []
    for _, r in long_df.iterrows():
        op_date = parse_oper_day(r["Oper Day"])
        hour_ending = parse_hour_ending(r["Hour Ending"])
        if op_date is None or hour_ending is None:
            continue
        rows.append(
            (capture_date, capture_time, op_date, hour_ending,
             str(r["ancillary_service_type"]).strip(), parse_price(r["price"]))
        )

    if not rows:
        log.warning("No valid DAM MCPC rows parsed for %s.", target_date)
        return 0

    inserted = await insert_rows(DAM_MCPC_INSERT_SQL, rows)
    log.info("DAM MCPC %s -> %d rows committed.", target_date, inserted)
    return inserted


# ── Orchestrator ──────────────────────────────────────────────────────────────
async def main():
    now_ct = datetime.now(timezone.utc).astimezone(CENTRAL_TZ)
    force_run = os.getenv("FORCE_RUN", "").strip().lower() == "true"
    if force_run:
        log.warning("FORCE_RUN=true -- bypassing the Central-hour gate (manual test run).")
    elif now_ct.hour != TARGET_RUN_HOUR_CT:
        log.info(
            "Current Central hour is %02d:00 (target is %02d:00) -- not this "
            "hour's scheduled run, exiting cleanly.",
            now_ct.hour,
            TARGET_RUN_HOUR_CT,
        )
        return

    capture_date = now_ct.date()
    capture_time = now_ct.time().replace(microsecond=0)

    # RTM is final by ~12:30 AM CT for the PREVIOUS calendar day. DAM SPP/MCPC
    # for "today's" delivery day were published yesterday afternoon (2:30 PM
    # CT settlement) and are fully available well before this 1 AM run.
    rtm_primary = now_ct.date() - timedelta(days=1)
    dam_primary = now_ct.date()

    rtm_dates = [rtm_primary - timedelta(days=i) for i in range(HISTORY_WINDOW_DAYS)]
    dam_dates = [dam_primary - timedelta(days=i) for i in range(HISTORY_WINDOW_DAYS)]

    log.info(
        "Central hour %02d:00 matches target -- checking RTM %s (+%d backfill "
        "days) and DAM %s (+%d backfill days).",
        now_ct.hour, rtm_primary, HISTORY_WINDOW_DAYS - 1, dam_primary, HISTORY_WINDOW_DAYS - 1,
    )

    total = 0
    for d in rtm_dates:
        total += await process_rtm_date(d, capture_date, capture_time)
    for d in dam_dates:
        total += await process_dam_spp_date(d, capture_date, capture_time)
    for d in dam_dates:
        total += await process_dam_mcpc_date(d, capture_date, capture_time)

    log.info("Market-prices scrape run complete. %d total rows committed.", total)


if __name__ == "__main__":
    asyncio.run(main())
