"""
Fire-and-forget trigger for the event-driven leg of the shared-reference-
data sync (see api/scripts/sync_reference_data.py).

Called by a scraper immediately AFTER it has already committed new rows
to a SHARED_REFERENCE_TABLES table -- this is the one line added to each
scraper for this feature. It never touches how a scraper scrapes, parses,
or decides what to save; it only reacts to a write that already happened.

Runs the sync as a blocking subprocess and only logs a failure -- it never
raises, so a sync problem can never take down a scraper run whose own
data write already succeeded.
"""
import logging
import os
import subprocess
import sys

log = logging.getLogger(__name__)

_API_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_SYNC_SCRIPT = os.path.join(_API_DIR, "scripts", "sync_reference_data.py")


def trigger_incremental_sync(tables: list[str]) -> None:
    if not tables:
        return
    cmd = [sys.executable, _SYNC_SCRIPT, "--mode", "incremental"]
    for t in tables:
        cmd += ["--table", t]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            log.error(
                "Reference-data sync failed (tables=%s): %s",
                tables, result.stderr.strip(),
            )
        else:
            log.info("Reference-data sync triggered for %s.", tables)
    except Exception:
        log.exception(
            "Reference-data sync trigger raised for tables=%s -- the scraper's "
            "own write already succeeded, continuing.",
            tables,
        )
