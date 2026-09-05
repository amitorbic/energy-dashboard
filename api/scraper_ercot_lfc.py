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
import re
import sys
import io
import csv
import zipfile
import logging
import asyncio
import smtplib
import traceback
import urllib.parse
from datetime import datetime, date, time as dtime, timezone
from email.mime.text import MIMEText
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

# ── Smart-Save Configuration ─────────────────────────────────────────────────
# 7am/8am Central are the DAM-relevant captures and are always saved. Every
# other hour is only saved if it deviates meaningfully from the last SAVED
# snapshot, so the table stops accumulating ~192 near-identical rows/hour.
CENTRAL_TZ = ZoneInfo("America/Chicago")
SCHEDULED_SAVE_HOURS_CT = (7, 8)  # always-save hours, Central time

# Simple fixed threshold for now -- may later need to vary per portfolio
# (e.g. a customer with heavy exposure to one zone caring about smaller
# moves than the system as a whole), but a single constant is enough today.
DEVIATION_THRESHOLD_PCT = 10.0

# ── Failure Alert Email Configuration ────────────────────────────────────────
# Reuses the same SMTP_HOST/PORT/USER/PASS vars already set in .env for the
# rest of the app (api/utils/email.py) rather than introducing a second SMTP
# secret. ALERT_EMAIL_TO/ALERT_EMAIL_FROM are new and specific to this alert.
ALERT_EMAIL_TO = os.getenv("ALERT_EMAIL_TO", "").strip()
ALERT_EMAIL_FROM = os.getenv("ALERT_EMAIL_FROM", "").strip()
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "465"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")

INSERT_SQL = """
    INSERT IGNORE INTO ercot_lfc_history
        (publish_date, publish_time, delivery_date, hour_ending,
         coast, east, far_west, north, north_central,
         south_central, southern, west, system_total, dst_flag,
         capture_date_ct, capture_hour_ct, save_reason, deviation_pct)
    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
"""

LAST_SNAPSHOT_GROUP_SQL = """
    SELECT capture_date_ct, capture_hour_ct
    FROM ercot_lfc_history
    WHERE capture_date_ct IS NOT NULL AND capture_hour_ct IS NOT NULL
    ORDER BY capture_date_ct DESC, capture_hour_ct DESC, id DESC
    LIMIT 1
"""

LAST_SNAPSHOT_TOTALS_SQL = """
    SELECT delivery_date, hour_ending, system_total
    FROM ercot_lfc_history
    WHERE capture_date_ct = %s AND capture_hour_ct = %s
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


# ERCOT's real publish timestamp (already US/Central) is embedded in the CSV
# filename inside the ZIP, e.g.:
#   cdr.00012312.0000000000000000.20260823.103000.LFCWEATHERNP3561.csv
# Same pattern the historical-backfill script (ingest_lfc.py) uses.
FILENAME_RE = re.compile(
    r"cdr\.\d+\.\d+\.(\d{8})\.(\d{6})\d*\.LFCWEATHER", re.IGNORECASE
)


def parse_filename(fname: str) -> tuple[date | None, dtime | None]:
    m = FILENAME_RE.search(fname)
    if not m:
        return None, None
    d = m.group(1)  # 20260823
    t = m.group(2)  # 103000
    pub_date = date(int(d[:4]), int(d[4:6]), int(d[6:8]))
    pub_time = dtime(int(t[:2]), int(t[2:4]), int(t[4:6]))
    return pub_date, pub_time


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
async def insert_rows(
    db_rows: list[tuple],
    capture_date_ct: date,
    capture_hour_ct: int,
    save_reason: str,
    deviation_pct: float | None,
) -> int:
    if not DB_NAME:
        raise ValueError("DB_NAME is not configured in .env")

    full_rows = [
        row + (capture_date_ct, capture_hour_ct, save_reason, deviation_pct)
        for row in db_rows
    ]

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
            for i in range(0, len(full_rows), 500):
                batch = full_rows[i : i + 500]
                await cur.executemany(INSERT_SQL, batch)
                inserted += cur.rowcount
        await conn.commit()
        return inserted
    finally:
        conn.close()


# ── Smart-Save: baseline lookup + deviation check ────────────────────────────
def get_central_capture_time() -> tuple[date, int]:
    """(date, hour) of *now* in US/Central, DST-safe via zoneinfo."""
    now_ct = datetime.now(timezone.utc).astimezone(CENTRAL_TZ)
    return now_ct.date(), now_ct.hour


async def get_last_saved_totals() -> dict[tuple[date, int], float] | None:
    """
    system_total per (delivery_date, hour_ending) for the most recently
    SAVED snapshot group (by capture_date_ct/capture_hour_ct) -- i.e. the
    baseline the new scrape should be compared against. Returns None if
    there is no previous saved snapshot to compare against yet.
    """
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
        async with conn.cursor() as cur:
            await cur.execute(LAST_SNAPSHOT_GROUP_SQL)
            group = await cur.fetchone()
            if not group:
                return None
            last_date, last_hour = group

            await cur.execute(LAST_SNAPSHOT_TOTALS_SQL, (last_date, last_hour))
            rows = await cur.fetchall()
        return {
            (delivery_date, hour_ending): float(system_total)
            for delivery_date, hour_ending, system_total in rows
            if system_total is not None
        }
    finally:
        conn.close()


def compute_max_deviation(
    db_rows: list[tuple], baseline: dict[tuple[date, int], float]
) -> float | None:
    """
    Max abs % deviation of this run's system_total vs. the baseline,
    across every (delivery_date, hour_ending) pair present in both. Returns
    None if there are no matching pairs to compare (can't evaluate).
    """
    max_dev = None
    for row in db_rows:
        delivery_date, hour_ending, new_total = row[2], row[3], row[12]
        if new_total is None:
            continue
        old_total = baseline.get((delivery_date, hour_ending))
        if not old_total:  # guards both None and 0
            continue
        dev = abs(new_total - old_total) / old_total * 100
        if max_dev is None or dev > max_dev:
            max_dev = dev
    return max_dev


def send_failure_alert(central_hour: int, error: BaseException) -> None:
    """Best-effort email alert when both scrape tiers are exhausted. Never
    raises -- a failed alert must not mask or replace the original failure."""
    if not ALERT_EMAIL_TO:
        log.warning("ALERT_EMAIL_TO not set -- skipping failure alert email.")
        return
    if not SMTP_HOST or not SMTP_USER or not SMTP_PASS:
        log.warning(
            "SMTP_HOST/SMTP_USER/SMTP_PASS not fully configured -- skipping "
            "failure alert email."
        )
        return

    is_critical = central_hour in SCHEDULED_SAVE_HOURS_CT
    subject = (
        f"{'[CRITICAL - DAM HOUR]' if is_critical else '[ERCOT Scraper Failure]'} "
        f"ERCOT LFC scraper failed at {central_hour:02d}:00 Central"
    )
    tb = "".join(traceback.format_exception(type(error), error, error.__traceback__))
    body = (
        f"ERCOT LFC scraper run failed -- both IPRoyal and Bright Data tiers exhausted.\n\n"
        f"Timestamp (UTC): {datetime.now(timezone.utc).isoformat()}\n"
        f"Central-time hour of failed run: {central_hour}\n"
        f"DAM-critical hour (7/8 CT): {'YES' if is_critical else 'no'}\n\n"
        f"Last error:\n{tb}"
    )

    from_addr = ALERT_EMAIL_FROM or SMTP_USER
    msg = MIMEText(body, "plain")
    msg["From"] = from_addr
    msg["To"] = ALERT_EMAIL_TO
    msg["Subject"] = subject

    try:
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT) as server:
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(from_addr, [ALERT_EMAIL_TO], msg.as_string())
        log.info("Failure alert email sent to %s", ALERT_EMAIL_TO)
    except Exception:
        log.exception("Failed to send failure alert email (non-fatal):")


# ── Browser-driven fetch & extraction ─────────────────────────────────────────
# Actual browser/proxy/Bright Data logic now lives in ercot_scraper_engine.py,
# shared by every ERCOT product scraper. Only the LFC-specific retry-budget
# policy (boost retries for the 7am/8am DAM-critical hours) stays here.
MAX_IP_ATTEMPTS_CRITICAL = 15  # 7am/8am CT (DAM-relevant) -- worth more retries
MAX_BRIGHTDATA_ATTEMPTS_CRITICAL = 5  # 7am/8am CT (DAM-relevant) -- worth more retries

REPORT_TABLE_SELECTOR = "#reportTable a"


async def fetch_latest_zip_and_parse(
    is_critical_hour: bool = False,
) -> tuple[list[dict], date, dtime]:
    # 7am/8am CT is the DAM-relevant capture -- worth burning more retries on.
    max_ip_attempts = (
        MAX_IP_ATTEMPTS_CRITICAL if is_critical_hour else engine.MAX_IP_ATTEMPTS
    )
    max_brightdata_attempts = (
        MAX_BRIGHTDATA_ATTEMPTS_CRITICAL
        if is_critical_hour
        else engine.MAX_BRIGHTDATA_ATTEMPTS
    )

    fetched = await engine.fetch_ercot_files(
        PRODUCT_URL,
        REPORT_TABLE_SELECTOR,
        mode="latest",
        max_ip_attempts=max_ip_attempts,
        max_brightdata_attempts=max_brightdata_attempts,
    )
    zip_bytes = fetched[0].zip_bytes

    rows = []
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
        csv_files = [f for f in z.namelist() if f.lower().endswith(".csv")]
        if not csv_files:
            raise FileNotFoundError("No CSV file found inside downloaded ZIP.")

        csv_name = csv_files[0]
        log.info("Reading CSV target inside zip archive: %s", csv_name)

        publish_date, publish_time = parse_filename(csv_name)
        if publish_date is None or publish_time is None:
            log.warning(
                "Could not parse ERCOT publish timestamp from CSV filename %r "
                "-- falling back to current UTC time for publish_date/publish_time.",
                csv_name,
            )
            publish_date = datetime.now(timezone.utc).date()
            publish_time = datetime.now(timezone.utc).time().replace(microsecond=0)

        with z.open(csv_name) as f:
            text_file = io.TextIOWrapper(f, encoding="utf-8-sig")
            reader = csv.DictReader(text_file)
            for row in reader:
                rows.append(row)

    return rows, publish_date, publish_time


# ── Orchestrator Main Execution Loop ──────────────────────────────────────────
async def main():
    capture_date_ct, capture_hour_ct = get_central_capture_time()
    is_critical_hour = capture_hour_ct in SCHEDULED_SAVE_HOURS_CT
    log.info(
        "Run captured at %s %02d:00 Central%s",
        capture_date_ct,
        capture_hour_ct,
        " (DAM-critical hour)" if is_critical_hour else "",
    )

    try:
        raw_rows, pub_date, pub_time = await fetch_latest_zip_and_parse(is_critical_hour)
    except Exception as e:
        log.exception("Pipeline execution failed (scrape stage -- both tiers exhausted):")
        send_failure_alert(capture_hour_ct, e)
        sys.exit(1)

    try:
        log.info("Successfully extracted %d raw records from CSV.", len(raw_rows))

        db_rows = build_db_rows(raw_rows, pub_date, pub_time)
        log.info("Normalized rows matching schema: %d records.", len(db_rows))

        if not db_rows:
            log.warning("No valid forecast lines remained after parsing filters.")
            return

        # ── Smart-save decision ──────────────────────────────────────────────
        if capture_hour_ct == 7:
            save_reason, deviation_pct, should_save = "scheduled_7am", None, True
        elif capture_hour_ct == 8:
            save_reason, deviation_pct, should_save = "scheduled_8am", None, True
        else:
            baseline = await get_last_saved_totals()
            max_dev = compute_max_deviation(db_rows, baseline) if baseline else None
            if baseline is None or max_dev is None:
                # No prior saved snapshot (or nothing comparable in it) --
                # can't evaluate deviation without a baseline, so save.
                save_reason, deviation_pct, should_save = (
                    "no_baseline_fallback",
                    None,
                    True,
                )
            elif max_dev >= DEVIATION_THRESHOLD_PCT:
                save_reason, deviation_pct, should_save = (
                    "deviation_triggered",
                    round(max_dev, 2),
                    True,
                )
            else:
                save_reason, deviation_pct, should_save = None, None, False
                log.info(
                    "Deviation %.2f%% below threshold (%.1f%%) -- skipping DB save for this hour.",
                    max_dev,
                    DEVIATION_THRESHOLD_PCT,
                )

        if should_save:
            inserted = await insert_rows(
                db_rows, capture_date_ct, capture_hour_ct, save_reason, deviation_pct
            )
            log.info(
                "Database transaction complete. %d new records committed (save_reason=%s).",
                inserted,
                save_reason,
            )

    except Exception:
        log.exception("Pipeline execution failed (processing/save stage):")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
