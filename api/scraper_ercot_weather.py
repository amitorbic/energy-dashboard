"""
ERCOT Weather scraper -- WEEKLY job, two independent data sources.

Standalone from scraper_ercot_lfc.py / scraper_ercot_dam.py / scraper_ercot_rtm.py
-- shares only the browser/proxy engine (ercot_scraper_engine.py) and general
conventions, no other file is touched or imported by this one.

SOURCE 1 (primary) -- ERCOT's own "7-Day Temperature Forecast by City" PDF,
a human-meteorologist-curated High/Low forecast per city (NOT NP6-970-CD --
that product was tried first and confirmed to be the WRONG data source: a
real-time LMP price feed, not a temperature forecast at all. The downloaded
sample file had filename prefix "RTDLMPRNLZHUBNP6970" and 26,952 price rows,
which is why it produced 0 parsed temperature rows). Dashboard page (context
only, not what's scraped): ercot.com/gridmktinfo/dashboards/weatherforecast.
The actual PDF lives at a predictable, date-based URL under a FIXED (not
date-based, despite appearances) folder path:
  https://www.ercot.com/files/docs/2021/11/22/temperature-template-MM.DD.YY.pdf
Published once daily; not always up yet if checked mid-day, so each run
tries today's date and falls back up to PDF_BACKFILL_DAYS-1 prior days.
Fetched via the same Tier 1 IPRoyal (aiohttp) / Tier 2 Bright Data
(Patchright CDP, in-browser fetch()) two-tier pattern already used in
scraper_ercot_market_prices.py, reusing ercot_scraper_engine.py's
PROXY_*/BRIGHTDATA_* constants.

CAVEAT: this sandbox cannot reach ERCOT's site directly for verification
either (confirmed: direct requests to the PDF URL above return HTTP 403,
Incapsula-blocked from this environment's datacenter IP), so the exact PDF
text layout below is built from the sample content the user pasted from
their own confirmed working fetch, not independently re-verified here.
Parsing assumes: (1) a header line per region containing "15yr Norm", 7
"Ddd M/D" date tokens, and "Yesterday", in that fixed column order; (2) each
city's block is a city-name line followed (within a few lines) by a "Low"
line and a "High" line, each with exactly 9 numbers in
[15yr Norm, day1..day7, Yesterday] order. If the real PDF differs, adjust
CITY_MATCHERS / the Low-High-line parsing in parse_temperature_pdf().

SOURCE 2 (secondary) -- Open-Meteo forecast API (api.open-meteo.com/v1/forecast),
a forecast-mode sibling of api/ingest_weather.py's historical archive-api
integration: same 8 zone codes/coordinates, same hourly variables
(temperature_2m, relative_humidity_2m, wind_speed_10m, cloud_cover), just
the forecast endpoint instead of the archive endpoint. Provides wind/humidity/
cloud-cover (which ERCOT's own product doesn't include) plus an independent
temperature cross-check. No proxy/browser automation needed -- plain public
JSON API, no API key, not behind Incapsula.

Scheduling: PM2 runs this WEEKLY (cron_restart in ecosystem.weather.config.js)
rather than hourly, so unlike LFC/DAM/RTM there is no self-gating "is this the
target hour?" check here -- every PM2-triggered run does real work.
"""

import os
import re
import io
import sys
import base64
import logging
import asyncio
import urllib.parse
from datetime import datetime, date, timedelta, timezone
from zoneinfo import ZoneInfo

import aiohttp
import aiomysql
import pdfplumber
from dotenv import load_dotenv
from patchright.async_api import async_playwright

load_dotenv()

# IMPORTANT: load_dotenv() must run before this import. ercot_scraper_engine.py
# reads PROXY_*/BRIGHTDATA_* into module-level constants via os.getenv() at
# import time -- importing it before .env is loaded silently caches empty
# strings for the whole process lifetime (a real production bug found and
# fixed once already in scraper_ercot_lfc.py/scraper_ercot_dam.py/
# scraper_ercot_rtm.py). Do not reorder these two statements.
import ercot_scraper_engine as engine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

CENTRAL_TZ = ZoneInfo("America/Chicago")

# ── Database Configuration (reuses existing DB_* env vars) ──────────────────
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = urllib.parse.unquote(os.getenv("DB_PASSWORD", ""))
DB_NAME = os.getenv("DB_NAME")
DB_PORT = int(os.getenv("DB_PORT", "3306"))


def get_central_capture_time() -> tuple[date, "datetime.time"]:
    """(date, time) of *now* in US/Central, DST-safe via zoneinfo -- same
    pattern as scraper_ercot_lfc.py's get_central_capture_time()."""
    now_ct = datetime.now(timezone.utc).astimezone(CENTRAL_TZ)
    return now_ct.date(), now_ct.time().replace(microsecond=0)


# ══════════════════════════════════════════════════════════════════════════
# SOURCE 1: ERCOT "7-Day Temperature Forecast by City" PDF
# ══════════════════════════════════════════════════════════════════════════
PDF_URL_FMT = (
    "https://www.ercot.com/files/docs/2021/11/22/"
    "temperature-template-{mm}.{dd}.{yy}.pdf"
)
PDF_BACKFILL_DAYS = 3  # try today, then up to 2 prior days (PDF isn't
# always up yet when checked mid-day, per user's own confirmed testing)

PDF_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

# 8 established ERCOT weather-zone codes (matching ingest_weather.py /
# weather_forecast exactly) -> the case-insensitive regex used to find that
# city's block in the PDF's extracted text, and the display name stored in
# the `city` column. Only these 8 are extracted -- other cities in the PDF
# (Lubbock, Corpus Christi, RGV/Brownsville/McAllen, etc.) are ignored, per
# the established 8-zone convention used across this project.
CITY_MATCHERS = {
    "COAST": re.compile(r"houston.*(bush|intercontinental)", re.IGNORECASE),
    "NCENT": re.compile(r"dallas[\s\-/]*f(?:or)?t\.?\s*worth", re.IGNORECASE),
    "NORTH": re.compile(r"wichita\s+falls", re.IGNORECASE),
    "SOUTH": re.compile(r"san\s+antonio", re.IGNORECASE),
    "SCENT": re.compile(r"austin.*camp\s*mabry", re.IGNORECASE),
    "EAST": re.compile(r"\btyler\b", re.IGNORECASE),
    "FWEST": re.compile(r"\bmidland\b", re.IGNORECASE),
    "WEST": re.compile(r"\babilene\b", re.IGNORECASE),
}
CITY_DISPLAY_NAMES = {
    "COAST": "Houston (Bush Intercontinental)",
    "NCENT": "Dallas-Fort Worth",
    "NORTH": "Wichita Falls",
    "SOUTH": "San Antonio",
    "SCENT": "Austin (Camp Mabry)",
    "EAST": "Tyler",
    "FWEST": "Midland",
    "WEST": "Abilene",
}

# A header date token, e.g. "Fri 9/4" -- 7 of these (year-less) define the
# forecast_date for each of the 7 middle columns on every city's Low/High
# line, in the fixed [15yr Norm, day1..day7, Yesterday] column order
# confirmed from the user's own sample PDF content.
_DATE_TOKEN_RE = re.compile(
    r"\b(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+(\d{1,2})/(\d{1,2})\b", re.IGNORECASE
)
_NUMBER_RE = re.compile(r"-?\d+(?:\.\d+)?")


# ── Tier 1: plain aiohttp through the IPRoyal proxy ─────────────────────────
async def _fetch_pdf_via_proxy(url: str, attempts: int) -> "bytes | None":
    """Returns PDF bytes on HTTP 200, None on HTTP 404 (not published yet
    for this date -- not a failure, caller tries an earlier date), or
    raises after exhausting `attempts` on any other status/network error."""
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
                    headers={"User-Agent": PDF_USER_AGENT},
                    timeout=aiohttp.ClientTimeout(total=30),
                ) as resp:
                    if resp.status == 200:
                        return await resp.read()
                    if resp.status == 404:
                        return None
                    raise RuntimeError(f"HTTP {resp.status}")
        except Exception as e:
            last_error = e
            log.warning("[Tier 1 attempt %d/%d] %s failed: %s", attempt, attempts, url, e)
            continue

    raise RuntimeError(f"Tier 1 exhausted after {attempts} attempts: {last_error}")


# ── Tier 2: Bright Data Browser API (fallback) ──────────────────────────────
_BRIGHTDATA_PDF_FETCH_JS = """
async (url) => {
    const res = await fetch(url, { credentials: "include" });
    if (res.status === 404) return { status: 404, data: null };
    if (res.status !== 200) return { status: res.status, data: null };
    const buf = await res.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buf);
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(
            null, bytes.subarray(i, i + chunkSize)
        );
    }
    return { status: res.status, data: btoa(binary) };
}
"""


async def _fetch_pdf_via_brightdata(url: str) -> "bytes | None":
    """Bright Data Browser API fallback (Tier 2). IMPORTANT: uses the
    page's own in-browser fetch() (page.evaluate), NOT context.request.get()
    -- the latter issues the HTTP call from this machine's own network,
    bypassing Bright Data's network entirely and hitting an already-blocked
    IP directly. This exact bug has already been found and fixed once in
    ercot_scraper_engine.py; do not reintroduce it here."""
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
            # Navigate to ERCOT's own domain first so the in-browser fetch()
            # below carries a same-origin referrer/cookie jar, rather than
            # firing from a blank page.
            await page.goto(
                "https://www.ercot.com/", wait_until="domcontentloaded", timeout=60_000
            )
            result = await page.evaluate(_BRIGHTDATA_PDF_FETCH_JS, url)
        finally:
            await browser.close()

    if result["status"] == 404:
        return None
    if result["status"] != 200 or not result["data"]:
        raise RuntimeError(f"[Bright Data] PDF fetch failed for {url}: HTTP {result['status']}")
    return base64.b64decode(result["data"])


async def fetch_pdf_bytes(url: str) -> "bytes | None":
    """Tier 1 (IPRoyal) with Tier 2 (Bright Data) fallback. Returns None
    only once both tiers agree the file isn't published yet (HTTP 404) --
    the caller tries an earlier date in that case."""
    if engine.PROXY_USER and engine.PROXY_PASS:
        try:
            return await _fetch_pdf_via_proxy(url, attempts=engine.MAX_IP_ATTEMPTS)
        except Exception as e:
            log.warning("Tier 1 exhausted for %s (%s) -- falling back to Bright Data.", url, e)
    else:
        log.warning("No PROXY_USER/PROXY_PASS configured -- skipping Tier 1 for %s.", url)

    last_error = None
    for bd_attempt in range(1, engine.MAX_BRIGHTDATA_ATTEMPTS + 1):
        try:
            return await _fetch_pdf_via_brightdata(url)
        except Exception as e:
            last_error = e
            log.warning(
                "Bright Data attempt %d/%d failed for %s: %s",
                bd_attempt, engine.MAX_BRIGHTDATA_ATTEMPTS, url, e,
            )
    raise RuntimeError(f"All IPRoyal and Bright Data attempts failed for {url}: {last_error}")


# ── PDF parsing ──────────────────────────────────────────────────────────────
def parse_pdf_filename_date(url: str) -> "date | None":
    """MM.DD.YY straight from the PDF's own filename -- the real publish
    date, NOT datetime.now(), same lesson enforced on every other scraper
    in this project."""
    m = re.search(r"temperature-template-(\d{2})\.(\d{2})\.(\d{2})\.pdf", url)
    if not m:
        return None
    mm, dd, yy = (int(g) for g in m.groups())
    return date(2000 + yy, mm, dd)


def _infer_forecast_year(month: int, day: int, publish_date: date) -> int:
    """Header date tokens (e.g. "Fri 9/4") carry no year -- infer it from
    the PDF's own publish date, correcting for a Dec/Jan rollover at the
    edges of the 7-day window."""
    candidate = date(publish_date.year, month, day)
    if (candidate - publish_date).days > 200:
        candidate = date(publish_date.year - 1, month, day)
    elif (candidate - publish_date).days < -200:
        candidate = date(publish_date.year + 1, month, day)
    return candidate.year


def extract_forecast_dates(text: str, publish_date: date) -> list[date]:
    matches = _DATE_TOKEN_RE.findall(text)
    if len(matches) < 7:
        return []
    dates = []
    for mm, dd in matches[:7]:
        month, day = int(mm), int(dd)
        year = _infer_forecast_year(month, day, publish_date)
        dates.append(date(year, month, day))
    return dates


def parse_temperature_pdf(pdf_bytes: bytes, publish_date: date) -> list[tuple]:
    """Returns rows matching ercot_weather_zone_temp:
    (publish_date, weather_zone, city, forecast_date, low_f, high_f,
     normal_low_f, normal_high_f)."""
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        full_text = "\n".join(page.extract_text() or "" for page in pdf.pages)

    forecast_dates = extract_forecast_dates(full_text, publish_date)
    if len(forecast_dates) < 7:
        log.warning(
            "Could not find 7 forecast-date header tokens in PDF text -- "
            "layout may not match what this parser assumes (see module "
            "docstring caveat). Aborting Source 1 parse for this file."
        )
        return []

    lines = full_text.splitlines()
    rows = []
    for zone, matcher in CITY_MATCHERS.items():
        city_line_idx = next(
            (i for i, line in enumerate(lines) if matcher.search(line)), None
        )
        if city_line_idx is None:
            log.warning("City for zone %s not found in PDF text -- skipping.", zone)
            continue

        low_nums = high_nums = None
        for j in range(city_line_idx, min(city_line_idx + 6, len(lines))):
            line = lines[j].strip()
            if low_nums is None and re.match(r"(?i)^low\b", line):
                low_nums = [float(x) for x in _NUMBER_RE.findall(line)]
            elif high_nums is None and re.match(r"(?i)^high\b", line):
                high_nums = [float(x) for x in _NUMBER_RE.findall(line)]
            if low_nums is not None and high_nums is not None:
                break

        if not low_nums or not high_nums or len(low_nums) < 9 or len(high_nums) < 9:
            log.warning(
                "Zone %s: Low/High lines missing or malformed near line %d "
                "-- skipping.", zone, city_line_idx,
            )
            continue

        normal_low_f, normal_high_f = round(low_nums[0], 1), round(high_nums[0], 1)
        city_name = CITY_DISPLAY_NAMES[zone]
        for i, forecast_date in enumerate(forecast_dates):
            rows.append(
                (
                    publish_date,
                    zone,
                    city_name,
                    forecast_date,
                    round(low_nums[1 + i], 1),
                    round(high_nums[1 + i], 1),
                    normal_low_f,
                    normal_high_f,
                )
            )
    return rows


INSERT_ERCOT_TEMP_SQL = """
    INSERT IGNORE INTO ercot_weather_zone_temp
        (publish_date, weather_zone, city, forecast_date, low_f, high_f,
         normal_low_f, normal_high_f)
    VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
"""


async def insert_ercot_temp_rows(db_rows: list[tuple]) -> int:
    if not db_rows:
        return 0
    if not DB_NAME:
        raise ValueError("DB_NAME is not configured in .env")

    conn = await aiomysql.connect(
        host=DB_HOST, port=DB_PORT, user=DB_USER,
        password=DB_PASSWORD, db=DB_NAME, autocommit=False,
    )
    try:
        inserted = 0
        async with conn.cursor() as cur:
            for i in range(0, len(db_rows), 500):
                batch = db_rows[i : i + 500]
                await cur.executemany(INSERT_ERCOT_TEMP_SQL, batch)
                inserted += cur.rowcount
        await conn.commit()
        return inserted
    finally:
        conn.close()


async def run_ercot_temp_source() -> int:
    log.info("Source 1: ERCOT 7-Day Temperature Forecast PDF starting.")
    now_ct = datetime.now(timezone.utc).astimezone(CENTRAL_TZ).date()

    pdf_bytes = None
    pdf_url = None
    for delta in range(PDF_BACKFILL_DAYS):
        target = now_ct - timedelta(days=delta)
        url = PDF_URL_FMT.format(
            mm=f"{target.month:02d}", dd=f"{target.day:02d}", yy=f"{target.year % 100:02d}"
        )
        log.info("Trying PDF for %s: %s", target, url)
        pdf_bytes = await fetch_pdf_bytes(url)
        if pdf_bytes is not None:
            pdf_url = url
            break
        log.info("PDF not yet published for %s (HTTP 404) -- trying an earlier date.", target)

    if pdf_bytes is None:
        log.warning(
            "No temperature-forecast PDF found for the last %d day(s) -- "
            "nothing to parse this run.", PDF_BACKFILL_DAYS,
        )
        return 0

    publish_date = parse_pdf_filename_date(pdf_url)
    if publish_date is None:
        log.warning("Could not parse publish date from PDF URL %s -- skipping.", pdf_url)
        return 0
    log.info("Parsing PDF published %s (%s).", publish_date, pdf_url)

    db_rows = parse_temperature_pdf(pdf_bytes, publish_date)
    log.info("Normalized rows matching schema: %d records.", len(db_rows))

    if not db_rows:
        log.warning(
            "No valid temperature rows parsed from PDF -- see module "
            "docstring caveat; verify against the real downloaded file."
        )
        return 0

    inserted = await insert_ercot_temp_rows(db_rows)
    log.info("ercot_weather_zone_temp: %d new rows committed.", inserted)
    return inserted


# ══════════════════════════════════════════════════════════════════════════
# SOURCE 2: Open-Meteo Forecast API (wind/humidity/cloud + temp cross-check)
# ══════════════════════════════════════════════════════════════════════════
OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_FORECAST_DAYS = 16
OPEN_METEO_PAST_DAYS = 3  # mirrors NP6-970-CD's ~3-days-back window

# Same 8 zone codes/coordinates as api/ingest_weather.py -- do not diverge
# (these are short codes, distinct from WEATHER_ZONE_COLUMNS above).
ZONES = {
    "COAST": {"lat": 29.9902, "lon": -95.3368},   # Houston Hobby (KHOU)
    "NCENT": {"lat": 32.8998, "lon": -97.0403},   # Dallas Fort Worth (KDFW)
    "NORTH": {"lat": 33.9822, "lon": -98.4918},   # Wichita Falls (KSPS)
    "SOUTH": {"lat": 29.5337, "lon": -98.4698},   # San Antonio (KSAT)
    "SCENT": {"lat": 30.1945, "lon": -97.6699},   # Austin Bergstrom (KAUS)
    "EAST": {"lat": 32.3541, "lon": -95.4024},    # Tyler (KTYR)
    "FWEST": {"lat": 31.9425, "lon": -102.2019},  # Midland (KMAF)
    "WEST": {"lat": 32.4113, "lon": -99.6819},    # Abilene (KABI)
}

INSERT_FORECAST_SQL = """
    INSERT IGNORE INTO weather_forecast
        (capture_date, capture_time, zone, forecast_date, forecast_hour,
         temperature_f, humidity_pct, wind_speed_mph, cloud_cover_pct)
    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
"""


async def fetch_open_meteo_forecast(session, lat: float, lon: float) -> dict:
    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": "temperature_2m,relative_humidity_2m,wind_speed_10m,cloud_cover",
        "temperature_unit": "fahrenheit",
        "wind_speed_unit": "mph",
        "timezone": "America/Chicago",
        "past_days": OPEN_METEO_PAST_DAYS,
        "forecast_days": OPEN_METEO_FORECAST_DAYS,
    }
    async with session.get(
        OPEN_METEO_FORECAST_URL, params=params, timeout=aiohttp.ClientTimeout(total=60)
    ) as resp:
        if resp.status != 200:
            text = await resp.text()
            raise Exception(f"HTTP {resp.status}: {text[:200]}")
        return await resp.json()


def parse_open_meteo_rows(
    zone: str, data: dict, capture_date: date, capture_time
) -> list[tuple]:
    rows = []
    hourly = data.get("hourly", {})
    times = hourly.get("time", [])
    temps = hourly.get("temperature_2m", [])
    humid = hourly.get("relative_humidity_2m", [])
    wind = hourly.get("wind_speed_10m", [])
    cloud = hourly.get("cloud_cover", [])

    def safe(lst, idx):
        try:
            v = lst[idx]
            return round(float(v), 1) if v is not None else None
        except (IndexError, TypeError, ValueError):
            return None

    for i, ts in enumerate(times):
        try:
            # ts format: "2026-09-08T00:00" -- hour 0-23, convert to ERCOT's
            # own hour-ending convention (1-24) for consistency with Source 1.
            forecast_date = date.fromisoformat(ts[:10])
            forecast_hour = int(ts[11:13]) + 1
            rows.append(
                (
                    capture_date,
                    capture_time,
                    zone,
                    forecast_date,
                    forecast_hour,
                    safe(temps, i),
                    safe(humid, i),
                    safe(wind, i),
                    safe(cloud, i),
                )
            )
        except Exception:
            continue
    return rows


async def insert_open_meteo_rows(db_rows: list[tuple]) -> int:
    if not db_rows:
        return 0
    if not DB_NAME:
        raise ValueError("DB_NAME is not configured in .env")

    conn = await aiomysql.connect(
        host=DB_HOST, port=DB_PORT, user=DB_USER,
        password=DB_PASSWORD, db=DB_NAME, autocommit=False,
    )
    try:
        inserted = 0
        async with conn.cursor() as cur:
            for i in range(0, len(db_rows), 500):
                batch = db_rows[i : i + 500]
                await cur.executemany(INSERT_FORECAST_SQL, batch)
                inserted += cur.rowcount
        await conn.commit()
        return inserted
    finally:
        conn.close()


async def run_open_meteo_source(capture_date: date, capture_time) -> int:
    log.info("Source 2: Open-Meteo forecast API starting (%d zones).", len(ZONES))
    total_inserted = 0
    errors = 0

    async with aiohttp.ClientSession() as session:
        for zone, coords in ZONES.items():
            try:
                data = await fetch_open_meteo_forecast(session, coords["lat"], coords["lon"])
                rows = parse_open_meteo_rows(zone, data, capture_date, capture_time)
                if not rows:
                    log.warning("Zone %s: no forecast rows parsed.", zone)
                    continue
                inserted = await insert_open_meteo_rows(rows)
                total_inserted += inserted
                log.info("Zone %s: %d rows committed.", zone, inserted)
            except Exception:
                log.exception(
                    "Zone %s: fetch/parse/insert failed -- continuing with "
                    "remaining zones.",
                    zone,
                )
                errors += 1
            await asyncio.sleep(0.5)  # be polite to the free API

    log.info(
        "Open-Meteo source complete. %d total rows committed, %d zone(s) errored.",
        total_inserted,
        errors,
    )
    return total_inserted


# ── Orchestrator Main Execution Loop ────────────────────────────────────────
async def main():
    capture_date, capture_time = get_central_capture_time()
    log.info("Weekly weather scrape starting at %s %s Central.", capture_date, capture_time)

    ercot_ok = False
    open_meteo_ok = False

    try:
        await run_ercot_temp_source()
        ercot_ok = True
    except Exception:
        log.exception(
            "ERCOT NP6-970-CD source failed (scrape or processing stage):"
        )

    try:
        await run_open_meteo_source(capture_date, capture_time)
        open_meteo_ok = True
    except Exception:
        log.exception("Open-Meteo source failed:")

    log.info(
        "Weekly weather scrape complete. ERCOT temp source: %s. Open-Meteo source: %s.",
        "OK" if ercot_ok else "FAILED",
        "OK" if open_meteo_ok else "FAILED",
    )

    if not ercot_ok and not open_meteo_ok:
        log.error("Both weather data sources failed this run.")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
