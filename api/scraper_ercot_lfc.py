"""
ERCOT 7-Day Load Forecast Scraper (Official ERCOT Public API)
────────────────────────────────────────────────────────────
Fetches the Seven-Day Load Forecast by Weather Zone report (np3-561-cd)
from the ERCOT Public API and loads it into: ercot_lfc_history

Auth flow (fresh every run — id_token is valid ~1 hour):
  POST https://idp.ercot.com/connect/token   → id_token (Bearer)

Report call:
  GET https://api.ercot.com/api/public-reports/np3-561-cd

Credentials (api/.env):
  ERCOT_USERNAME=
  ERCOT_PASSWORD=
  ERCOT_SUBSCRIPTION_KEY=

Run: python scraper_ercot_lfc.py
"""

"""
ERCOT 7-Day Load Forecast Scraper (Official ERCOT Public API)
────────────────────────────────────────────────────────────
Fetches the Seven-Day Load Forecast by Weather Zone report (np3-561-cd / np3-565-cd)
from the ERCOT Public API and loads it into: ercot_lfc_history

Routes network traffic through IPRoyal Proxies using curl_cffi to match browser TLS fingerprints.
"""

"""
ERCOT 7-Day Load Forecast Scraper (Official ERCOT Public API)
────────────────────────────────────────────────────────────
Fetches the Seven-Day Load Forecast by Weather Zone report (np3-565-cd)
from the ERCOT Public API and loads it into: ercot_lfc_history

Routes traffic through proxy using curl_cffi Session for persistent TLS & cookies.
"""

"""
ERCOT 7-Day Load Forecast Scraper (Official ERCOT Public API)
────────────────────────────────────────────────────────────
Fetches the Seven-Day Load Forecast by Weather Zone report (np3-565-cd)
from the ERCOT Public API and loads it into: ercot_lfc_history

Routes traffic through proxy using curl_cffi Session for persistent TLS & cookies.
"""

"""
ERCOT 7-Day Load Forecast Scraper (Direct Public Web Portal)
────────────────────────────────────────────────────────────
Downloads the latest 7-Day Load Forecast by Weather Zone (NP3-561-CD) 
directly from ERCOT's public data archive and loads it into: ercot_lfc_history

No OAuth tokens, API subscription keys, or B2C login required.
"""

"""
ERCOT 7-Day Load Forecast Scraper (Direct Public Web Portal)
────────────────────────────────────────────────────────────
Downloads the latest 7-Day Load Forecast by Weather Zone (NP3-561-CD) 
directly from ERCOT's public data archive and loads it into: ercot_lfc_history
"""

import os
import sys
import io
import csv
import zipfile
import logging
import asyncio
from datetime import datetime, date, time as dtime

from curl_cffi import requests
import aiomysql
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

PRODUCT_PAGE_URL = (
    "https://www.ercot.com/mp/data-products/data-product-details?id=NP3-561-CD"
)
ARCHIVE_LIST_URL = "https://www.ercot.com/content/api/archives/NP3-561-CD"

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME")
DB_PORT = int(os.getenv("DB_PORT", "3306"))

REQUEST_TIMEOUT = 30

PROXY_HOST = os.getenv("PROXY_HOST", "geo.iproyal.com")
PROXY_PORT = os.getenv("PROXY_PORT", "12321")
PROXY_URL = f"http://{PROXY_HOST}:{PROXY_PORT}"

# Reads USE_PROXY from env (default false unless specified)
USE_PROXY = os.getenv("USE_PROXY", "false").lower() == "true"
PROXIES = {"http": PROXY_URL, "https": PROXY_URL} if USE_PROXY else None

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


class ErcotScrapeError(Exception):
    pass


# ── Step 1: Discover Latest Archive ──────────────────────────────────────────
def get_latest_archive_url(session: requests.Session) -> str:
    log.info("Loading ERCOT product page to initialize session...")

    # 1. Warm-up request to the product page
    landing_headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
    }

    resp_landing = session.get(
        PRODUCT_PAGE_URL, headers=landing_headers, timeout=REQUEST_TIMEOUT
    )
    if resp_landing.status_code != 200:
        log.warning(
            "Product landing page returned status: %d", resp_landing.status_code
        )

    # 2. Query the content archives endpoint with full browser AJAX context
    log.info("Fetching archive directory listing...")
    api_headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": PRODUCT_PAGE_URL,
        "Origin": "https://www.ercot.com",
        "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
    }

    resp = session.get(ARCHIVE_LIST_URL, headers=api_headers, timeout=REQUEST_TIMEOUT)
    if resp.status_code != 200:
        raise ErcotScrapeError(
            f"Failed to fetch archive listing ({resp.status_code}): {resp.text[:200]}"
        )

    payload = resp.json()
    docs = payload.get("archives", []) or payload.get("docs", [])
    if not docs:
        raise ErcotScrapeError("No document archives found for NP3-561-CD")

    latest_doc = docs[0]
    download_endpoint = latest_doc.get("endpoint") or latest_doc.get("url")

    if not download_endpoint.startswith("http"):
        download_endpoint = f"https://www.ercot.com{download_endpoint}"

    log.info("Latest archive found: %s", latest_doc.get("name", download_endpoint))
    return download_endpoint


# ── Step 2: Download & Unzip CSV ──────────────────────────────────────────────
def download_and_extract_csv(session: requests.Session, url: str) -> list[dict]:
    log.info("Downloading zip archive...")
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Referer": PRODUCT_PAGE_URL,
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
    }

    resp = session.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
    if resp.status_code != 200:
        raise ErcotScrapeError(f"Failed to download archive file ({resp.status_code})")

    rows = []
    with zipfile.ZipFile(io.BytesIO(resp.content)) as z:
        csv_files = [f for f in z.namelist() if f.lower().endswith(".csv")]
        if not csv_files:
            raise ErcotScrapeError("No CSV found inside downloaded zip archive")

        target_file = csv_files[0]
        log.info("Extracting %s...", target_file)

        with z.open(target_file) as f:
            reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))
            cleaned_headers = {
                k: k.strip().lower().replace(" ", "_").replace("-", "_")
                for k in reader.fieldnames
                if k
            }

            for raw_row in reader:
                normalized_row = {}
                for orig_key, clean_key in cleaned_headers.items():
                    normalized_row[clean_key] = raw_row[orig_key]
                rows.append(normalized_row)

    log.info("Extracted %d forecast rows from CSV.", len(rows))
    return rows


# ── Step 3: Parsing & Transformation ──────────────────────────────────────────
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
    s = str(val).strip()
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%Y%m%d", "%d-%b-%Y"):
        try:
            return datetime.strptime(s, fmt).date()
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
    for alias in aliases:
        if alias in row and row[alias] is not None:
            return row[alias]
    return None


def build_db_rows(raw_rows: list[dict], publish_date: date, publish_time: dtime):
    db_rows = []
    for r in raw_rows:
        deliv_date_raw = find_val(r, FIELD_ALIASES["delivery_date"])
        he_raw = find_val(r, FIELD_ALIASES["hour_ending"])

        delivery_date = parse_delivery_date(deliv_date_raw)
        hour_ending = parse_hour_ending(he_raw)

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

        explicit_total = safe_float(find_val(r, FIELD_ALIASES["system_total"]))
        zone_values = [v for v in zones.values() if v is not None]
        system_total = (
            explicit_total
            if explicit_total is not None
            else (sum(zone_values) if zone_values else None)
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


# ── Step 4: Database Insert ───────────────────────────────────────────────────
async def insert_rows(db_rows: list[tuple]) -> int:
    if not DB_NAME:
        raise ErcotScrapeError("DB_NAME environment variable is not set.")

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


# ── Execution ─────────────────────────────────────────────────────────────────
async def run():
    now = datetime.now()
    publish_date = now.date()
    publish_time = now.time().replace(microsecond=0)

    with requests.Session(impersonate="chrome120", proxies=PROXIES) as session:
        archive_url = get_latest_archive_url(session)
        raw_rows = download_and_extract_csv(session, archive_url)

    db_rows = build_db_rows(raw_rows, publish_date, publish_time)
    inserted = await insert_rows(db_rows)
    log.info("Rows successfully inserted into ercot_lfc_history: %d", inserted)


def main():
    try:
        asyncio.run(run())
    except Exception as e:
        log.error("Execution failed: %s", e)
        sys.exit(1)


if __name__ == "__main__":
    main()
