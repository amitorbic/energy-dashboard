"""
Shared ERCOT scraping engine -- Patchright + real Chrome + residential
proxy / Bright Data fallback.

Extracted from scraper_ercot_lfc.py (the original, battle-tested LFC
scraper) so every ERCOT product-specific scraper (LFC, DAM, RTM, ...)
can reuse the exact same browser-driven download technique instead of
re-implementing it:

  1. Launch a real Chrome (via Patchright) through the IPRoyal
     residential proxy (Tier 1). Each attempt draws a fresh exit IP
     since no `_session-` is pinned in the proxy password, so a bad/
     blocked IP is simply abandoned by retrying with a new browser
     launch.
  2. Navigate to the product's page and let Incapsula's cookie/JS
     checks resolve naturally, then wait for the caller-supplied
     "success selector" (e.g. "#reportTable a") to appear.
  3. Collect one (mode="latest") or many (mode="all", optionally
     filtered) file links from the results table, and download each
     ZIP via the browser's own request context so cookies/fingerprint
     come from the real session.
  4. If every IPRoyal attempt fails, fall back to Bright Data's
     Browser API (Tier 2) -- a remote, already-unblocked Chrome
     reached over CDP. IMPORTANT: on this tier, ZIP downloads MUST use
     the page's own in-browser fetch() (via page.evaluate), NOT
     context.request.get() -- the latter issues the HTTP call from
     this machine's own network, bypassing Bright Data's network
     entirely and hitting an already-blocked IP directly. This was a
     real bug found and fixed once already; do not reintroduce it.

CSV/ZIP content parsing (column names, DB schema) stays in each
product-specific caller -- this module only gets the raw ZIP bytes for
whichever file(s) matched.
"""

import os
import re
import io
import csv
import base64
import zipfile
import logging
from dataclasses import dataclass
from datetime import date, datetime, time as dtime, timezone
from typing import Callable, Optional

from patchright.async_api import async_playwright

log = logging.getLogger(__name__)

# ── IPRoyal Residential Proxy Configuration ──────────────────────────────────
PROXY_HOST = os.getenv("PROXY_HOST", "geo.iproyal.com")
PROXY_PORT = os.getenv("PROXY_PORT", "12321")
PROXY_USER = os.getenv("PROXY_USER", "")
PROXY_PASS = os.getenv("PROXY_PASS", "")

# ── Bright Data Browser API Configuration (fallback tier) ───────────────────
BRIGHTDATA_USER = os.getenv("BRIGHTDATA_USER", "")
BRIGHTDATA_PASS = os.getenv("BRIGHTDATA_PASS", "")
BRIGHTDATA_HOST = os.getenv("BRIGHTDATA_HOST", "brd.superproxy.io:9222")

# ── Default retry budgets -- callers may override per run (e.g. a boosted
#    budget for a deadline-critical hour vs. these normal defaults) ─────────
MAX_IP_ATTEMPTS = 8
MAX_BRIGHTDATA_ATTEMPTS = 2

TABLE_WAIT_MS = 20_000  # IPRoyal tier: per-attempt selector wait -- a bad/
# blocked IP fails fast, no need to wait the full timeout on every retry
BRIGHTDATA_TABLE_WAIT_MS = 45_000  # Bright Data's unlocking process takes
# longer, so it gets a longer selector wait than the IPRoyal tier

RowFilter = Callable[[str], bool]


@dataclass
class FetchedFile:
    zip_bytes: bytes
    file_name: str


# ── Generic ERCOT MIS filename timestamp parsing ─────────────────────────────
# ERCOT's real publish timestamp (already US/Central) is embedded in the
# downloaded file's name for every MIS "cdr" product, e.g.:
#   cdr.00012312.0000000000000000.20260823.103000.LFCWEATHERNP3561.csv
#   cdr.00012331.0000000000000000.20260823.150312.DAMSPPNP4190.csv
# This generic pattern (no product-specific suffix requirement) lets any
# caller reuse the same parsing instead of duplicating the regex.
DEFAULT_FILENAME_RE = re.compile(
    r"cdr\.\d+\.\d+\.(\d{8})\.(\d{6})\d*\.", re.IGNORECASE
)


def parse_filename_timestamp(
    fname: str, pattern: "re.Pattern[str] | None" = None
) -> tuple[date | None, dtime | None]:
    m = (pattern or DEFAULT_FILENAME_RE).search(fname)
    if not m:
        return None, None
    d = m.group(1)
    t = m.group(2)
    pub_date = date(int(d[:4]), int(d[4:6]), int(d[6:8]))
    pub_time = dtime(int(t[:2]), int(t[2:4]), int(t[4:6]))
    return pub_date, pub_time


def extract_csv_from_zip(
    zip_bytes: bytes, filename_pattern: "re.Pattern[str] | None" = None
) -> tuple[list[dict], str, date, dtime]:
    """
    Opens a downloaded ZIP, reads the first CSV inside, and parses the real
    ERCOT publish_date/publish_time from that CSV's own filename. Falls back
    to the current UTC time (with a logged warning) only if the filename
    doesn't match the expected timestamp pattern -- this should be a rare
    edge case, not the normal path.

    Returns (rows, csv_name, publish_date, publish_time).
    """
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
        csv_files = [f for f in z.namelist() if f.lower().endswith(".csv")]
        if not csv_files:
            raise FileNotFoundError("No CSV file found inside downloaded ZIP.")

        csv_name = csv_files[0]
        publish_date, publish_time = parse_filename_timestamp(csv_name, filename_pattern)
        if publish_date is None or publish_time is None:
            log.warning(
                "Could not parse ERCOT publish timestamp from filename %r "
                "-- falling back to current UTC time for publish_date/publish_time.",
                csv_name,
            )
            publish_date = datetime.now(timezone.utc).date()
            publish_time = datetime.now(timezone.utc).time().replace(microsecond=0)

        rows = []
        with z.open(csv_name) as f:
            text_file = io.TextIOWrapper(f, encoding="utf-8-sig")
            reader = csv.DictReader(text_file)
            for row in reader:
                rows.append(row)

    return rows, csv_name, publish_date, publish_time


# ── Row/link collection (shared by both tiers) ───────────────────────────────
async def _collect_matching_links(
    page, success_selector: str, mode: str, row_filter: Optional[RowFilter]
) -> list[tuple[str, str]]:
    """Returns a list of (download_url, file_name) tuples. mode="latest"
    returns at most one entry (the first match, mirroring the original
    `.first` behavior); mode="all" returns every match for which
    row_filter(file_name) is True (or every match, if row_filter is None)."""
    locator = page.locator(success_selector)

    if mode == "latest":
        first = locator.first
        href = await first.get_attribute("href")
        if not href:
            return []
        text = (await first.inner_text()).strip()
        if not href.startswith("http"):
            href = f"https://www.ercot.com{href}"
        return [(href, text or "download.zip")]

    count = await locator.count()
    matched = []
    for i in range(count):
        link = locator.nth(i)
        href = await link.get_attribute("href")
        if not href:
            continue
        text = (await link.inner_text()).strip()
        if not href.startswith("http"):
            href = f"https://www.ercot.com{href}"
        file_name = text or "download.zip"
        if row_filter is None or row_filter(file_name):
            matched.append((href, file_name))
    return matched


# ── Tier 1: IPRoyal residential proxy ─────────────────────────────────────────
async def _try_one_attempt(
    attempt_num: int,
    proxy_config,
    run_headless: bool,
    product_url: str,
    success_selector: str,
    mode: str,
    row_filter: Optional[RowFilter],
) -> list[FetchedFile]:
    """One full attempt: launch a fresh browser (which draws a NEW IPRoyal
    exit IP by default, since no _session- is pinned in the proxy password),
    try to reach the real results table, and download every matched file.
    Raises on failure so the caller can retry with a new IP."""
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
            product_url, wait_until="domcontentloaded", timeout=60_000
        )
        log.info(
            "[Attempt %d] Initial navigation status: %s",
            attempt_num,
            resp.status if resp else "no response",
        )

        try:
            await page.wait_for_selector(success_selector, timeout=TABLE_WAIT_MS)
        except Exception as e:
            await browser.close()
            raise RuntimeError(
                f"[Attempt {attempt_num}] Table never appeared (likely blocked IP)."
            ) from e

        matched = await _collect_matching_links(page, success_selector, mode, row_filter)
        if not matched:
            await browser.close()
            raise ValueError(
                f"[Attempt {attempt_num}] Found table but no matching file link(s)."
            )

        log.info(
            "[Attempt %d] SUCCESS -- found %d matching file(s).",
            attempt_num,
            len(matched),
        )

        fetched: list[FetchedFile] = []
        for download_url, file_name in matched:
            log.info("[Attempt %d] Downloading %s...", attempt_num, file_name)
            dl_resp = await context.request.get(download_url)
            if dl_resp.status != 200:
                await browser.close()
                raise RuntimeError(
                    f"[Attempt {attempt_num}] ZIP download failed for "
                    f"{file_name}: HTTP {dl_resp.status}"
                )
            fetched.append(FetchedFile(zip_bytes=await dl_resp.body(), file_name=file_name))

        await browser.close()
        return fetched


# ── Tier 2: Bright Data Browser API (fallback) ───────────────────────────────
_BRIGHTDATA_FETCH_JS = """
async (url) => {
    const res = await fetch(url, { credentials: "include" });
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


async def _try_brightdata_attempt(
    attempt_num: int,
    product_url: str,
    success_selector: str,
    mode: str,
    row_filter: Optional[RowFilter],
) -> list[FetchedFile]:
    """Connect to Bright Data's already-running, already-unblocked remote
    Chrome via CDP over WebSocket -- no local browser launch, no local
    proxy config. Bright Data handles the unblocking on their end."""
    if not BRIGHTDATA_USER or not BRIGHTDATA_PASS:
        raise RuntimeError(
            "BRIGHTDATA_USER/BRIGHTDATA_PASS not set in .env -- get the "
            "password from https://brightdata.com/cp/web_access/ercot_scraper"
        )

    ws_endpoint = f"wss://{BRIGHTDATA_USER}:{BRIGHTDATA_PASS}@{BRIGHTDATA_HOST}"

    async with async_playwright() as p:
        log.info(
            "[Bright Data attempt %d] Connecting to remote browser...", attempt_num
        )
        browser = await p.chromium.connect_over_cdp(ws_endpoint, timeout=60_000)

        # CDP-connected browsers already have a default context -- reuse it
        # rather than creating a new one.
        context = (
            browser.contexts[0] if browser.contexts else await browser.new_context()
        )
        page = await context.new_page()

        log.info(
            "[Bright Data attempt %d] Navigating to ERCOT product portal...",
            attempt_num,
        )
        # Bright Data recommends generous timeouts (60-120s) since their
        # unlocking process (solving challenges, retrying internally) takes
        # longer than a plain proxy connection.
        resp = await page.goto(
            product_url, wait_until="domcontentloaded", timeout=120_000
        )
        log.info(
            "[Bright Data attempt %d] Initial navigation status: %s",
            attempt_num,
            resp.status if resp else "no response",
        )

        try:
            await page.wait_for_selector(success_selector, timeout=BRIGHTDATA_TABLE_WAIT_MS)
        except Exception as e:
            await browser.close()
            raise RuntimeError(
                f"[Bright Data attempt {attempt_num}] Table never appeared."
            ) from e

        matched = await _collect_matching_links(page, success_selector, mode, row_filter)
        if not matched:
            await browser.close()
            raise ValueError(
                f"[Bright Data attempt {attempt_num}] Found table but no matching file link(s)."
            )

        log.info(
            "[Bright Data attempt %d] SUCCESS -- found %d matching file(s).",
            attempt_num,
            len(matched),
        )

        fetched: list[FetchedFile] = []
        for download_url, file_name in matched:
            log.info("[Bright Data attempt %d] Downloading %s...", attempt_num, file_name)
            # IMPORTANT: context.request.get() issues the HTTP call from your own
            # local machine's network, NOT through Bright Data's remote browser --
            # that's fine for a locally-launched+proxied browser (IPRoyal path),
            # but for a CDP-connected remote browser it bypasses Bright Data's
            # network entirely, hitting your already-blocked IP directly (this is
            # exactly what caused the 403 on the ZIP download despite the page
            # itself loading fine). Use the page's own in-browser fetch() instead,
            # so the download genuinely goes through Bright Data's network.
            zip_b64_result = await page.evaluate(_BRIGHTDATA_FETCH_JS, download_url)

            if zip_b64_result["status"] != 200 or not zip_b64_result["data"]:
                await browser.close()
                raise RuntimeError(
                    f"[Bright Data attempt {attempt_num}] ZIP download failed for "
                    f"{file_name}: HTTP {zip_b64_result['status']}"
                )

            fetched.append(
                FetchedFile(
                    zip_bytes=base64.b64decode(zip_b64_result["data"]),
                    file_name=file_name,
                )
            )

        await browser.close()
        return fetched


# ── Orchestrator: Tier 1 (IPRoyal) with Tier 2 (Bright Data) fallback ───────
async def fetch_ercot_files(
    product_url: str,
    success_selector: str,
    *,
    mode: str = "latest",
    row_filter: Optional[RowFilter] = None,
    max_ip_attempts: int = MAX_IP_ATTEMPTS,
    max_brightdata_attempts: int = MAX_BRIGHTDATA_ATTEMPTS,
) -> list[FetchedFile]:
    """
    Generic entry point for any ERCOT product-specific scraper.

    mode="latest"  -> only the first row's file is downloaded (one
                       FetchedFile returned) -- e.g. LFC, DAM: one file
                       published per run, always take the newest.
    mode="all"     -> every row whose file_name passes row_filter(file_name)
                       is downloaded in this same browser session -- e.g.
                       RTM: one page load, filter down to yesterday's ~96
                       15-minute files, download them all in one run.

    max_ip_attempts / max_brightdata_attempts let callers use a boosted
    retry budget for deadline-critical runs and a normal budget otherwise,
    without this module needing to know what "critical" means for any
    given product.
    """
    if mode not in ("latest", "all"):
        raise ValueError(f"mode must be 'latest' or 'all', got {mode!r}")

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
    fetched: list[FetchedFile] | None = None

    # ── Tier 1: IPRoyal (cheap, works most hours) ────────────────────────────
    if proxy_config is None:
        log.warning(
            "No IPRoyal proxy configured -- skipping Tier 1, going straight to Bright Data."
        )
    else:
        for attempt in range(1, max_ip_attempts + 1):
            try:
                fetched = await _try_one_attempt(
                    attempt, proxy_config, run_headless,
                    product_url, success_selector, mode, row_filter,
                )
                break
            except Exception as e:
                last_error = e
                log.warning(
                    "IPRoyal attempt %d/%d failed: %s", attempt, max_ip_attempts, e
                )
                if attempt < max_ip_attempts:
                    log.info("Retrying with a fresh proxy IP...")
                continue

    # ── Tier 2: Bright Data (fallback, only used when IPRoyal is exhausted) ─
    if fetched is None:
        log.warning(
            "All %d IPRoyal attempts failed -- falling back to Bright Data Browser API.",
            max_ip_attempts,
        )
        for bd_attempt in range(1, max_brightdata_attempts + 1):
            try:
                fetched = await _try_brightdata_attempt(
                    bd_attempt, product_url, success_selector, mode, row_filter,
                )
                break
            except Exception as e:
                last_error = e
                log.warning(
                    "Bright Data attempt %d/%d failed: %s",
                    bd_attempt,
                    max_brightdata_attempts,
                    e,
                )
                continue

    if fetched is None:
        raise RuntimeError(
            f"All IPRoyal AND Bright Data attempts failed. Last error: {last_error}"
        ) from last_error

    return fetched
