from datetime import date, datetime
from dateutil.relativedelta import relativedelta
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

FIELDS = [
    "hb_houston", "hb_north", "hb_south", "hb_west",
    "lz_houston", "lz_north", "lz_south", "lz_west",
]


def _avg(total: float, count: int) -> float:
    """Mirrors PHP: $count != 0 ? round($total / $count, 2) : 0"""
    return round(total / count, 2) if count != 0 else 0


async def _fetch(db: AsyncSession, query: str, params: dict) -> list:
    result = await db.execute(text(query), params)
    return [dict(row._mapping) for row in result.fetchall()]


def _calc(rows: list) -> dict:
    """Sum all 8 fields across rows, return averages keyed by field name."""
    totals = {f: 0.0 for f in FIELDS}
    count = 0
    for row in rows:
        for f in FIELDS:
            totals[f] += float(row.get(f) or 0)
        count += 1
    return {f: _avg(totals[f], count) for f in FIELDS}


async def get_market_data(db: AsyncSession) -> dict:
    """
    Mirrors home.php date logic + all 6 SQL blocks exactly.

    PHP date logic (lines 61-64):
      $todate   = date("m/d/Y");
      $strdate  = strtotime(date("m/d/Y", strtotime($todate)) . " 15 year");
      $date     = date("m/d/Y", $strdate);     → MM/DD/YYYY  e.g. 06/11/2041
      $showdate = date("d-M",   $strdate);     → DD-Mon      e.g. 11-Jun
    """
    target    = date.today() + relativedelta(years=15)
    date_str  = target.strftime("%m/%d/%Y")   # matches PHP date("m/d/Y")
    show_date = target.strftime("%d-%b")       # matches PHP date("d-M")

    # ── SQL1: RT Peak — interval_ending BETWEEN 615 AND 2200 ──────────────
    rows1 = await _fetch(db,
        "SELECT * FROM ercot_data "
        "WHERE oper_day LIKE :d AND interval_ending BETWEEN 615 AND 2200",
        {"d": date_str},
    )
    rt_peak = _calc(rows1)

    # ── SQL2: RT All-day — interval_ending BETWEEN 15 AND 2400 ────────────
    rows2 = await _fetch(db,
        "SELECT * FROM ercot_data "
        "WHERE oper_day LIKE :d AND interval_ending BETWEEN 15 AND 2400",
        {"d": date_str},
    )
    rt_all = _calc(rows2)

    # ── SQL5: RT Off-peak — UNION of 2215-2400 and 15-600 ─────────────────
    rows5 = await _fetch(db,
        "SELECT * FROM ercot_data "
        "WHERE oper_day LIKE :d1 AND interval_ending BETWEEN 2215 AND 2400 "
        "UNION "
        "SELECT * FROM ercot_data "
        "WHERE oper_day LIKE :d2 AND interval_ending BETWEEN 15 AND 600",
        {"d1": date_str, "d2": date_str},
    )
    rt_offpeak = _calc(rows5)

    # ── SQL11: DAM Peak — interval_ending BETWEEN 7 AND 22 ────────────────
    rows11 = await _fetch(db,
        "SELECT * FROM day_ahead_data "
        "WHERE oper_day LIKE :d AND interval_ending BETWEEN 7 AND 22",
        {"d": date_str},
    )
    dam_peak = _calc(rows11)

    # ── SQL21: DAM All-day — interval_ending BETWEEN 1 AND 24 ─────────────
    # NOTE: PHP line 196 has a copy-paste bug:
    #   $hub_north_avg21 = round($hub_houston21 / $count21, 2)
    # hub_north for DAM all-day uses hub_houston totals. Replicated exactly.
    rows21 = await _fetch(db,
        "SELECT * FROM day_ahead_data "
        "WHERE oper_day LIKE :d AND interval_ending BETWEEN 1 AND 24",
        {"d": date_str},
    )
    dam_all_raw = _calc(rows21)
    # Replicate PHP bug: dam_all hb_north uses hb_houston value
    dam_all = {**dam_all_raw, "hb_north": dam_all_raw["hb_houston"]}

    # ── SQL51: DAM Off-peak — UNION of 23-24 and 1-6 ──────────────────────
    rows51 = await _fetch(db,
        "SELECT * FROM day_ahead_data "
        "WHERE oper_day LIKE :d1 AND interval_ending BETWEEN 23 AND 24 "
        "UNION "
        "SELECT * FROM day_ahead_data "
        "WHERE oper_day LIKE :d2 AND interval_ending BETWEEN 1 AND 6",
        {"d1": date_str, "d2": date_str},
    )
    dam_offpeak = _calc(rows51)

    # ── Last updated — select date_modified from log where type='ercot' ───
    log_row = await db.execute(
        text("SELECT date_modified FROM log WHERE type = 'ercot' LIMIT 1")
    )
    log = log_row.fetchone()
    last_updated = str(log[0]) if log else ""

    return {
        "show_date":    show_date,
        "last_updated": last_updated,
        "rt": {
            "all":     rt_all,
            "peak":    rt_peak,
            "offpeak": rt_offpeak,
        },
        "dam": {
            "all":     dam_all,
            "peak":    dam_peak,
            "offpeak": dam_offpeak,
        },
    }


# ── Portfolio Dashboard ────────────────────────────────────────────────────

def _parse_end_date(s: str):
    """Parse MM/DD/YYYY strings from contract_renewal.contract_end_date."""
    if not s or s == "12/31/1969":
        return None
    try:
        return datetime.strptime(s.strip(), "%m/%d/%Y").date()
    except Exception:
        return None


async def get_portfolio(db: AsyncSession, broker_id: str, role: str) -> dict:
    """
    Broker portfolio summary for the home dashboard.

    Data sources:
      contract_renewal  → active companies + ESIIDs
      renewal_offer     → pipeline (priced but not yet active)
      contract_user     → broker count (admin only)
    """
    today = date.today()
    is_admin = str(role) == "1"

    # Scoping helpers
    if is_admin:
        scope_cr = ""
        scope_ro = ""
        params: dict = {}
    else:
        scope_cr = "WHERE broker_code = :bid"
        scope_ro = "WHERE broker_code = :bid"
        params = {"bid": broker_id}

    # ── 1. Total distinct active companies ──────────────────────────────────
    r = await db.execute(
        text(f"SELECT COUNT(DISTINCT company_name) FROM contract_renewal {scope_cr}"),
        params,
    )
    total_companies: int = r.scalar() or 0

    # ── 2. Total active ESIIDs (non-empty, non-Array premise_id) ───────────
    if is_admin:
        r2 = await db.execute(
            text("SELECT COUNT(*) FROM contract_renewal "
                 "WHERE premise_id != '' AND premise_id != 'Array'")
        )
    else:
        r2 = await db.execute(
            text("SELECT COUNT(*) FROM contract_renewal "
                 "WHERE broker_code = :bid AND premise_id != '' AND premise_id != 'Array'"),
            params,
        )
    total_esiids: int = r2.scalar() or 0

    # ── 3. Upcoming renewals — parse contract_end_date, group by company ───
    if is_admin:
        dates_res = await db.execute(
            text("SELECT DISTINCT company_name, contract_end_date FROM contract_renewal")
        )
    else:
        dates_res = await db.execute(
            text("SELECT DISTINCT company_name, contract_end_date "
                 "FROM contract_renewal WHERE broker_code = :bid"),
            params,
        )

    # Earliest end_date per company
    seen: dict[str, date] = {}
    for row in dates_res.fetchall():
        cname = row[0] or ""
        d = _parse_end_date(row[1] or "")
        if not cname or d is None:
            continue
        if cname not in seen or d < seen[cname]:
            seen[cname] = d

    expiring_30 = 0
    expiring_90 = 0
    upcoming = []
    for cname, end_d in sorted(seen.items(), key=lambda x: x[1]):
        days_left = (end_d - today).days
        if 0 <= days_left <= 30:
            expiring_30 += 1
        if 0 <= days_left <= 90:
            expiring_90 += 1
        if days_left >= 0:
            upcoming.append({
                "company":   cname,
                "end_date":  end_d.strftime("%m/%d/%Y"),
                "days_left": days_left,
            })

    upcoming_list = upcoming[:8]  # top 8 soonest

    # ── 4 & 5. Pipeline from renewal_offer (table may not exist yet) ──────────
    pipeline_active = 0
    pipeline_expired = 0
    recent_pipeline: list = []
    try:
        if is_admin:
            pipe_res = await db.execute(
                text("SELECT COUNT(DISTINCT com_name), "
                     "SUM(CASE WHEN text = 'has expired' THEN 1 ELSE 0 END) "
                     "FROM renewal_offer")
            )
        else:
            pipe_res = await db.execute(
                text("SELECT COUNT(DISTINCT com_name), "
                     "SUM(CASE WHEN text = 'has expired' THEN 1 ELSE 0 END) "
                     "FROM renewal_offer WHERE broker_code = :bid"),
                params,
            )
        pr = pipe_res.fetchone()
        pipeline_total: int = int(pr[0] or 0)
        pipeline_expired = int(pr[1] or 0)
        pipeline_active = pipeline_total - pipeline_expired

        if is_admin:
            recent_res = await db.execute(
                text("SELECT broker_name, com_name, start_date, text "
                     "FROM renewal_offer ORDER BY start_date DESC LIMIT 8")
            )
        else:
            recent_res = await db.execute(
                text("SELECT broker_name, com_name, start_date, text "
                     "FROM renewal_offer WHERE broker_code = :bid "
                     "ORDER BY start_date DESC LIMIT 8"),
                params,
            )
        recent_pipeline = [
            {
                "broker_name": r[0] or "",
                "company":     r[1] or "",
                "start_date":  r[2] or "",
                "status":      r[3] or "",
            }
            for r in recent_res.fetchall()
        ]
    except Exception:
        # renewal_offer table doesn't exist — pipeline stays empty; rollback to keep session clean
        await db.rollback()

    # ── 6. Admin only: total broker user count ─────────────────────────────
    broker_count = None
    if is_admin:
        bc = await db.execute(
            text("SELECT COUNT(*) FROM contract_user WHERE role != '1'")
        )
        broker_count = int(bc.scalar() or 0)

    return {
        "total_companies":   total_companies,
        "total_esiids":      total_esiids,
        "expiring_30":       expiring_30,
        "expiring_90":       expiring_90,
        "pipeline_active":   pipeline_active,
        "pipeline_expired":  pipeline_expired,
        "upcoming_renewals": upcoming_list,
        "recent_pipeline":   recent_pipeline,
        "broker_count":      broker_count,
    }
