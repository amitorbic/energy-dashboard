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

import os
import sys
import logging
import time
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

# ── Config ────────────────────────────────────────────────────────────────────
ERCOT_USERNAME = os.getenv("ERCOT_USERNAME")
ERCOT_PASSWORD = os.getenv("ERCOT_PASSWORD")
ERCOT_SUBSCRIPTION_KEY = os.getenv("ERCOT_SUBSCRIPTION_KEY")

ERCOT_CLIENT_ID = os.getenv("ERCOT_CLIENT_ID", "fec253ea-0d06-4272-a5e6-b478baeecd70")
TOKEN_URL = "https://ercotb2c.b2clogin.com/ercotb2c.onmicrosoft.com/B2C_1_PUBAPI-ROPC-FLOW/oauth2/v2.0/token"
REPORT_URL = (
    "https://api.ercot.com/api/public-reports/np3-565-cd/lf_by_model_weather_zone"
)

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME")
DB_PORT = int(os.getenv("DB_PORT", "3306"))

REQUEST_TIMEOUT = 30  # seconds

# ── Proxy Configuration ───────────────────────────────────────────────────────
PROXY_USER = os.getenv("PROXY_USER", "dm84v36MRalRCroU_country-us_state-texas")
PROXY_PASS = os.getenv("PROXY_PASS", "YOUR_ACTUAL_PASSWORD_HERE")
PROXY_HOST = os.getenv("PROXY_HOST", "geo.iproyal.com")  # Do NOT include ://
PROXY_PORT = os.getenv("PROXY_PORT", "12321")

PROXY_URL = f"http://{PROXY_USER}:{PROXY_PASS}@{PROXY_HOST}:{PROXY_PORT}"
PROXIES = {"http": PROXY_URL, "https": PROXY_URL}

INSERT_SQL = """
    INSERT IGNORE INTO ercot_lfc_history
        (publish_date, publish_time, delivery_date, hour_ending,
         coast, east, far_west, north, north_central,
         south_central, southern, west, system_total, dst_flag)
    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
"""

FIELD_ALIASES = {
    "delivery_date": ("deliveryDate", "DeliveryDate", "delivery_date"),
    "hour_ending": ("hourEnding", "HourEnding", "hour_ending"),
    "coast": ("coast", "Coast"),
    "east": ("east", "East"),
    "far_west": ("farWest", "FarWest", "far_west"),
    "north": ("north", "North"),
    "north_central": ("northCentral", "NorthCentral", "north_central"),
    "south_central": ("southCentral", "SouthCentral", "south_central"),
    "southern": ("southern", "Southern"),
    "west": ("west", "West"),
}


class ErcotApiError(Exception):
    pass


# ── Auth Phase ────────────────────────────────────────────────────────────────
def get_access_token() -> str:
    if not (ERCOT_USERNAME and ERCOT_PASSWORD and ERCOT_SUBSCRIPTION_KEY):
        raise ErcotApiError(
            "Missing ERCOT_USERNAME / ERCOT_PASSWORD / ERCOT_SUBSCRIPTION_KEY in .env"
        )

    log.info("Requesting ERCOT access token via Proxy...")
    resp = requests.post(
        TOKEN_URL,
        params={
            "grant_type": "password",
            "username": ERCOT_USERNAME,
            "password": ERCOT_PASSWORD,
            "scope": f"openid {ERCOT_CLIENT_ID} offline_access",
            "client_id": ERCOT_CLIENT_ID,
            "response_type": "id_token",
        },
        headers={"Ocp-Apim-Subscription-Key": ERCOT_SUBSCRIPTION_KEY},
        timeout=REQUEST_TIMEOUT,
        impersonate="chrome120",
        proxies=PROXIES,
    )
    if resp.status_code != 200:
        raise ErcotApiError(f"Auth failed ({resp.status_code}): {resp.text[:300]}")

    token = resp.json().get("id_token")
    if not token:
        raise ErcotApiError("Auth response did not contain id_token")

    log.info("Successfully acquired valid ERCOT ID token.")
    return token


# ── Report Fetching Phase ─────────────────────────────────────────────────────
def fetch_forecast_rows(id_token: str) -> list[dict]:
    headers = {
        "Authorization": f"Bearer {id_token}",
        "Ocp-Apim-Subscription-Key": ERCOT_SUBSCRIPTION_KEY,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Referer": "https://apiexplorer.ercot.com/",
        "Origin": "https://apiexplorer.ercot.com",
    }

    all_rows = []
    page = 1
    total_pages = 1

    while page <= total_pages:
        time.sleep(2.5)  # Enforce rate-limit buffering

        log.info(f"Fetching report page {page} of {total_pages} via Proxy...")
        resp = requests.get(
            REPORT_URL,
            headers=headers,
            params={"page": page, "size": 1000},
            timeout=REQUEST_TIMEOUT,
            impersonate="chrome120",
            proxies=PROXIES,
        )
        if resp.status_code != 200:
            log.error(
                "Report fetch failed on page %d — Status: %d", page, resp.status_code
            )
            log.error("Response snippet: %s", resp.text[:300])
            raise ErcotApiError(f"Report fetch failed ({resp.status_code})")

        payload = resp.json()
        fields = payload.get("fields", [])
        data = payload.get("data", [])

        col_index = {}
        for canonical, aliases in FIELD_ALIASES.items():
            idx = None
            for i, f in enumerate(fields):
                name = f.get("name") if isinstance(f, dict) else f
                if name in aliases:
                    idx = i
                    break
            col_index[canonical] = idx

        for record in data:
            all_rows.append(
                {
                    key: record[idx] if idx is not None else None
                    for key, idx in col_index.items()
                }
            )

        meta = payload.get("_meta") or {}
        total_pages = meta.get("totalPages", 1) or 1
        page += 1

    log.info("Successfully fetched a total of %d records.", len(all_rows))
    return all_rows


# ── Parsing Helpers ───────────────────────────────────────────────────────────
def safe_float(val):
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def parse_delivery_date(val):
    if isinstance(val, date):
        return val
    s = str(val).strip()
    for fmt in ("%Y-%m-%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def parse_hour_ending(val):
    s = str(val).strip()
    if ":" in s:
        s = s.split(":")[0]
    try:
        return int(s)
    except ValueError:
        return None


def build_db_rows(raw_rows: list[dict], publish_date: date, publish_time: dtime):
    db_rows = []
    for r in raw_rows:
        delivery_date = parse_delivery_date(r.get("delivery_date"))
        hour_ending = parse_hour_ending(r.get("hour_ending"))
        if delivery_date is None or hour_ending is None:
            continue

        zones = {
            "coast": safe_float(r.get("coast")),
            "east": safe_float(r.get("east")),
            "far_west": safe_float(r.get("far_west")),
            "north": safe_float(r.get("north")),
            "north_central": safe_float(r.get("north_central")),
            "south_central": safe_float(r.get("south_central")),
            "southern": safe_float(r.get("southern")),
            "west": safe_float(r.get("west")),
        }
        zone_values = [v for v in zones.values() if v is not None]
        system_total = sum(zone_values) if zone_values else None

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
                None,  # dst_flag
            )
        )
    return db_rows


# ── DB Insertion ──────────────────────────────────────────────────────────────
async def insert_rows(db_rows: list[tuple]) -> int:
    if not DB_NAME:
        raise ErcotApiError("DB_NAME environment variable is not set.")

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


# ── Execution Entry ───────────────────────────────────────────────────────────
async def run():
    now = datetime.now()
    publish_date = now.date()
    publish_time = now.time().replace(microsecond=0)

    token = get_access_token()
    raw_rows = fetch_forecast_rows(token)

    db_rows = build_db_rows(raw_rows, publish_date, publish_time)
    inserted = await insert_rows(db_rows)
    log.info("Rows inserted: %d", inserted)


def main():
    try:
        asyncio.run(run())
    except ErcotApiError as e:
        log.error("ERCOT scrape failed: %s", e)
        sys.exit(1)
    except Exception as e:
        log.error("Unexpected error: %s", e)
        sys.exit(1)


if __name__ == "__main__":
    main()
