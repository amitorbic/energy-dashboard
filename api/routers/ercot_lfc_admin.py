import asyncio
import logging
import sys
import time
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from middleware.auth import require_admin

router = APIRouter(prefix="/admin/ercot-lfc", tags=["admin"])

log = logging.getLogger("uvicorn")

SCRAPER_PATH = Path(__file__).resolve().parent.parent / "scraper_ercot_lfc.py"
SCRAPER_CWD = SCRAPER_PATH.parent

TRIGGER_COOLDOWN_SECONDS = 300  # 5 minutes -- guards against double-click / accidental repeat triggers

_last_trigger_at: float | None = None
_trigger_lock = asyncio.Lock()


async def _run_scraper_in_background(triggered_by: str) -> None:
    log.info("[ercot-lfc manual-trigger] subprocess starting (triggered_by=%s)", triggered_by)
    proc = await asyncio.create_subprocess_exec(
        sys.executable,
        str(SCRAPER_PATH),
        cwd=str(SCRAPER_CWD),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()

    if proc.returncode == 0:
        log.info(
            "[ercot-lfc manual-trigger] completed OK (triggered_by=%s)",
            triggered_by,
        )
    else:
        log.error(
            "[ercot-lfc manual-trigger] FAILED (triggered_by=%s, exit_code=%s) stderr tail: %s",
            triggered_by,
            proc.returncode,
            stderr.decode(errors="replace")[-2000:],
        )


@router.post("/trigger")
async def trigger_lfc_scrape(admin: dict = Depends(require_admin)):
    """Manually kick off an ad-hoc ERCOT LFC scrape (e.g. during an extreme
    weather event) without waiting for the next PM2 cron slot. Runs
    scraper_ercot_lfc.py as-is, unmodified, in the background -- the caller
    gets an immediate "started" response instead of blocking through the
    scraper's multi-minute fetch+retry cycle; check server logs for the
    eventual OK/FAILED outcome."""
    global _last_trigger_at

    async with _trigger_lock:
        now = time.monotonic()
        if _last_trigger_at is not None:
            elapsed = now - _last_trigger_at
            if elapsed < TRIGGER_COOLDOWN_SECONDS:
                raise HTTPException(
                    status_code=429,
                    detail=(
                        "A manual LFC trigger already ran recently. "
                        f"Try again in {round(TRIGGER_COOLDOWN_SECONDS - elapsed)}s."
                    ),
                )
        _last_trigger_at = now

    triggered_by = (
        admin.get("username") or admin.get("email") or f"user_id={admin.get('user_id')}"
    )
    log.info("[ercot-lfc manual-trigger] requested by %s", triggered_by)

    asyncio.create_task(_run_scraper_in_background(triggered_by))

    return {
        "status": "started",
        "message": "ERCOT LFC scrape triggered manually. Check server logs for the result.",
        "triggered_by": triggered_by,
    }
