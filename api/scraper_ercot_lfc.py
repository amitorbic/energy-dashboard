"""
ERCOT LFC (7-Day Load Forecast) scraper -- Playwright + residential proxy version.

Why this exists: ERCOT sits behind Incapsula/Imperva, which blocks the earlier
curl_cffi-based approach at the very first request -- even with a clean
residential IP. Incapsula's newer rules fingerprint more than TLS/JA3 (header
ordering, HTTP/2 frame behavior, presence of a real JS engine), so a bare HTTP
client gets flagged regardless of IP reputation or User-Agent spoofing.

This version drives a real Chromium browser via Playwright, routed through
your IPRoyal residential proxy, so the traffic looks like an actual browser
because it *is* one. It:
  1. Launches Chromium through the IPRoyal proxy.
  2. Navigates to the ERCOT product page (lets Incapsula's cookie/JS checks
     resolve naturally).
  3. Uses the browser's own `fetch()` (via page.evaluate) to call the
     IceDocListServlet JSON endpoint -- so cookies, header ordering, and
     fingerprint all come from the real browser session.
  4. Downloads the ZIP the same way, extracts the CSV, and hands rows back
     in the same shape your DB-insertion code expects.

Install:
    pip install playwright python-dotenv aiomysql
    playwright install chromium
"""

import os
import sys
import io
import csv
import json
import zipfile
import logging
import asyncio
import base64
import urllib.parse
from datetime import datetime, date, time as dtime, timezone

from patchright.async_api import async_playwright
import aiomysql
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

# ── ERCOT URLs ────────────────────────────────────────────────────────────────
# Note: the old misapp/servlets/IceDocListServlet JSON endpoint (reportTypeId
# 12312, which IS the correct id for NP3-561-CD) now 404s -- it looks to be a
# retired legacy path. The current product page instead renders a results
# table (#reportTable) client-side via JS, which we read directly instead of
# hitting a separate JSON API. This mirrors ERCOT's own working example at
# https://github.com/ercot/api-specs/discussions/58
PRODUCT_URL = (
    "https://www.ercot.com/mp/data-products/data-product-details?id=NP3-561-CD"
)

# ── Database Configuration ───────────────────────────────────────────────────
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = urllib.parse.unquote(os.getenv("DB_PASSWORD", ""))
DB_NAME = os.getenv("DB_NAME")
DB_PORT = int(os.getenv("DB_PORT", "3306"))

# ── IPRoyal Residential Proxy Configuration ──────────────────────────────────
# IPRoyal typically gives you: host, port, username, password (rotating or sticky).
# Set these in your .env file.
PROXY_HOST = os.getenv("PROXY_HOST", "geo.iproyal.com")
PROXY_PORT = os.getenv("PROXY_PORT", "12321")
PROXY_USER = os.getenv("PROXY_USER", "")
PROXY_PASS = os.getenv("PROXY_PASS", "")

INSERT_SQL = """
    INSERT IGNORE INTO ercot_lfc_history
        (publish_date, publish_time, delivery_date, hour_ending,
         coast, east, far_west, north, north_central,
         south_central, southern, west, system_total, dst_flag)
    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
"""

FIELD_ALIASES = {
    "delivery_date": ("deliverydate", "delivery_date", "date"),
    "hour_ending": ("hourending", "hour_ending", "he"),
    "coast": ("coast",),
    "east": ("east",),
    "far_west": ("farwest", "far_west", "fwest"),
    "north": ("north",),
    "north_central": ("northcentral", "north_central", "ncentral"),
    "south_central": ("southcentral", "south_central", "scentral"),
    "southern": ("southern", "south"),
    "west": ("west",),
    "system_total": ("total", "systemtotal", "system_total", "ercot"),
}


# ── Parsing Helpers (unchanged from your version) ────────────────────────────
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


def build_db_rows(raw_rows: list[dict], publish_date: date, publish_time: dtime):
    db_rows = []
    for r in raw_rows:
        delivery_date = parse_delivery_date(find_val(r, FIELD_ALIASES["delivery_date"]))
        hour_ending = parse_hour_ending(find_val(r, FIELD_ALIASES["hour_ending"]))
        if delivery_date is None or hour_ending is None:
            continue

        zones = {
            "coast": safe_float(find_val(r, FIELD_ALIASES["coast"])),
            "east": safe_float(find_val(r, FIELD_ALIASES["east"])),
            "far_west": safe_float(find_val(r, FIELD_ALIASES["far_west"])),
            "north": safe_float(find_val(r, FIELD_ALIASES["north"])),
            "north_central": safe_float(find_val(r, FIELD_ALIASES["north_central"])),
            "south_central": safe_float(find_val(r, FIELD_ALIASES["south_central"])),
            "southern": safe_float(find_val(r, FIELD_ALIASES["southern"])),
            "west": safe_float(find_val(r, FIELD_ALIASES["west"])),
        }
        zones = {k: round(v, 4) if v is not None else None for k, v in zones.items()}

        explicit_total = safe_float(find_val(r, FIELD_ALIASES["system_total"]))
        zone_values = [v for v in zones.values() if v is not None]
        system_total = (
            round(explicit_total, 4)
            if explicit_total is not None
            else (round(sum(zone_values), 4) if zone_values else None)
        )

        db_rows.append(
            (
                publish_date,
                publish_time,
                delivery_date,
                hour_ending,
                zones["coast"],
                zones["east"],
                zones["far_west"],
                zones["north"],
                zones["north_central"],
                zones["south_central"],
                zones["southern"],
                zones["west"],
                system_total,
                None,
            )
        )
    return db_rows


# ── MySQL Async Ingestion (unchanged) ─────────────────────────────────────────
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


# ── Browser-driven fetch & extraction ─────────────────────────────────────────
MAX_IP_ATTEMPTS = 8  # how many fresh proxy IPs to try before giving up
TABLE_WAIT_MS = 20_000  # per-attempt wait -- a bad/blocked IP fails fast,
# no need to wait the full 45s on every retry


async def _try_one_attempt(attempt_num: int, proxy_config, run_headless):
    """
    One full attempt: launch a fresh browser (which draws a NEW IPRoyal exit
    IP by default, since no _session- is pinned in the proxy password), try
    to reach the real results table. Returns (rows_html_info) on success,
    raises on failure so the caller can retry with a new IP.
    """
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            channel="chrome",
            headless=run_headless,
            proxy=proxy_config,
        )
        context = await browser.new_context(
            viewport={"width": 1366, "height": 768},
            locale="en-US",
        )
        page = await context.new_page()

        try:
            ip_resp = await page.goto(
                "https://api.ipify.org?format=json", timeout=20_000
            )
            ip_body = await ip_resp.text()
            log.info("[Attempt %d] Exit IP: %s", attempt_num, ip_body.strip())
        except Exception as e:
            log.warning("[Attempt %d] Could not verify exit IP: %s", attempt_num, e)

        log.info("[Attempt %d] Navigating to ERCOT product portal...", attempt_num)
        resp = await page.goto(
            PRODUCT_URL, wait_until="domcontentloaded", timeout=60_000
        )
        log.info(
            "[Attempt %d] Initial navigation status: %s",
            attempt_num,
            resp.status if resp else "no response",
        )

        try:
            await page.wait_for_selector("#reportTable a", timeout=TABLE_WAIT_MS)
        except Exception as e:
            await browser.close()
            raise RuntimeError(
                f"[Attempt {attempt_num}] Table never appeared (likely blocked IP)."
            ) from e

        first_link = page.locator("#reportTable a").first
        download_url = await first_link.get_attribute("href")
        row_text = (await first_link.inner_text()).strip()

        if not download_url:
            await browser.close()
            raise ValueError(
                f"[Attempt {attempt_num}] Found table but no href on first link."
            )
        if not download_url.startswith("http"):
            download_url = f"https://www.ercot.com{download_url}"

        file_name = row_text or "latest.zip"
        log.info(
            "[Attempt %d] SUCCESS -- found file link: %s (%s)",
            attempt_num,
            download_url,
            file_name,
        )

        publish_date = datetime.now(timezone.utc).date()
        publish_time = datetime.now(timezone.utc).time().replace(microsecond=0)

        log.info("[Attempt %d] Downloading ZIP...", attempt_num)
        dl_resp = await context.request.get(download_url)
        if dl_resp.status != 200:
            await browser.close()
            raise RuntimeError(
                f"[Attempt {attempt_num}] ZIP download failed: HTTP {dl_resp.status}"
            )

        zip_bytes = await dl_resp.body()
        await browser.close()
        return zip_bytes, publish_date, publish_time


async def fetch_latest_zip_and_parse() -> tuple[list[dict], date, dtime]:
    proxy_config = None
    if PROXY_USER and PROXY_PASS:
        proxy_config = {
            "server": f"http://{PROXY_HOST}:{PROXY_PORT}",
            "username": PROXY_USER,
            "password": PROXY_PASS,
        }
    else:
        log.warning("No PROXY_USER/PROXY_PASS set -- launching without a proxy.")

    run_headless = os.getenv("HEADLESS", "false").strip().lower() != "false"

    last_error = None
    zip_bytes = publish_date = publish_time = None

    for attempt in range(1, MAX_IP_ATTEMPTS + 1):
        try:
            zip_bytes, publish_date, publish_time = await _try_one_attempt(
                attempt, proxy_config, run_headless
            )
            break  # got a clean IP through -- stop retrying
        except Exception as e:
            last_error = e
            log.warning("Attempt %d/%d failed: %s", attempt, MAX_IP_ATTEMPTS, e)
            if attempt < MAX_IP_ATTEMPTS:
                log.info("Retrying with a fresh proxy IP...")
            continue

    if zip_bytes is None:
        raise RuntimeError(
            f"All {MAX_IP_ATTEMPTS} proxy IP attempts were blocked. "
            f"Last error: {last_error}"
        ) from last_error

    rows = []
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
        csv_files = [f for f in z.namelist() if f.lower().endswith(".csv")]
        if not csv_files:
            raise FileNotFoundError("No CSV file found inside downloaded ZIP.")

        log.info("Reading CSV target inside zip archive: %s", csv_files[0])
        with z.open(csv_files[0]) as f:
            text_file = io.TextIOWrapper(f, encoding="utf-8-sig")
            reader = csv.DictReader(text_file)
            for row in reader:
                rows.append(row)

    return rows, publish_date, publish_time


# ── Orchestrator Main Execution Loop ──────────────────────────────────────────
async def main():
    try:
        raw_rows, pub_date, pub_time = await fetch_latest_zip_and_parse()
        log.info("Successfully extracted %d raw records from CSV.", len(raw_rows))

        db_rows = build_db_rows(raw_rows, pub_date, pub_time)
        log.info("Normalized rows matching schema: %d records.", len(db_rows))

        if db_rows:
            inserted = await insert_rows(db_rows)
            log.info(
                "Database transaction complete. %d new records committed.", inserted
            )
        else:
            log.warning("No valid forecast lines remained after parsing filters.")

    except Exception:
        log.exception("Pipeline execution failed:")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
