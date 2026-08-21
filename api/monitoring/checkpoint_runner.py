"""
monitoring/checkpoint_runner.py
─────────────────────────────────
Nightly sanity checks for the forecast engine ("layer cake"). Each checkpoint
scores itself GREEN / YELLOW / RED and the result is upserted into
forecast_checkpoints (one row per checkpoint_id per run_date).

Checkpoint 1 — 7-Day Mirror Test
  Our ERCOT Shape forecast (portfolio_load_annual x ercot_shape_loadzone)
  vs the LFC-scaled forecast (ercot_lfc_history x customer_share) for the
  next 7 days — the same two branches Layer 4 in get_forecast_data()
  chooses between. Large disagreement between them means one of the two
  inputs has drifted.

Checkpoint 2 — Historical Backtest
  Rebuilds the Layer-1 DNA baseline from ercot_load_history using only data
  strictly before a randomly chosen date (bounded to the range that
  ercot_load_history actually has data for, minus a 30-day buffer from the
  most recent date), then compares the reconstructed ERCOT-wide day total
  against the actual total for that date.

Checkpoint 3 — Energy Balance Sanity
  Implied annual growth rate between forecast_growth_factors' base year
  (2025) and 2035 — catches a corrupted/mis-scaled growth build.

Checkpoint 4 — Portfolio Ratio Check
  Current portfolio annual MWh as a share of ERCOT's 2025 annual MWh,
  compared against the same ratio from portfolio_load_annual's prior year
  (if available) to catch runaway growth/shrink in the customer_share input.

Run: python monitoring/checkpoint_runner.py
"""

import asyncio
import json
import logging
import os
import random
import statistics
import sys
import urllib.parse
from datetime import date, timedelta
from decimal import Decimal

import aiomysql
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from utils.zone_mapping import DB_COL_TO_ZONE, weather_to_load, get_load_zones

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

DB_CONFIG = dict(
    host=os.getenv("DB_HOST", "localhost"),
    port=int(os.getenv("DB_PORT", 3306)),
    user=os.getenv("DB_USER", "root"),
    password=urllib.parse.unquote(os.getenv("DB_PASSWORD", "")),
    db=os.getenv("DB_NAME"),
    charset="utf8mb4",
    autocommit=False,
)
if not DB_CONFIG["db"]:
    raise SystemExit("ERROR: DB_NAME environment variable is not set. Set it before running this script.")

BASE_YEAR = 2025
GROWTH_END_YEAR = 2035
GROWTH_EXPONENT_YEARS = 9  # (year10/year1)^(1/9) - 1, per spec

OUTLIER_THRESHOLD = 3.0
WEATHER_COLS = list(DB_COL_TO_ZONE.keys())  # coast, east, far_west, north, north_central, south_central, southern, west

CHECKPOINT_NAMES = {
    1: "7-Day Mirror Test",
    2: "Historical Backtest",
    3: "Energy Balance Sanity",
    4: "Portfolio Ratio Check",
}


def to_float(val) -> float:
    if val is None:
        return 0.0
    if isinstance(val, Decimal):
        return float(val)
    return float(val)


def remove_outliers(values: list[float]) -> list[float]:
    if len(values) < 4:
        return values
    mean = statistics.mean(values)
    stdev = statistics.stdev(values)
    if stdev == 0:
        return values
    return [v for v in values if abs(v - mean) <= OUTLIER_THRESHOLD * stdev]


def grade(score: float, green_max: float, yellow_max: float) -> str:
    if score <= green_max:
        return "GREEN"
    if score <= yellow_max:
        return "YELLOW"
    return "RED"


# ── Checkpoint 1 — 7-Day Mirror Test ────────────────────────────────────────
async def checkpoint_1_mirror_test(conn) -> dict:
    zones = get_load_zones()
    today = date.today()
    start, end = today, today + timedelta(days=7)
    year = today.year

    async with conn.cursor() as cur:
        await cur.execute(
            "SELECT load_zone, annual_mwh FROM portfolio_load_annual WHERE year = %s",
            (year,),
        )
        portfolio_annual = {r[0]: to_float(r[1]) for r in await cur.fetchall()}

    async with conn.cursor() as cur:
        await cur.execute(
            "SELECT load_zone, MAX(base_total) FROM forecast_growth_factors "
            "WHERE base_year = %s GROUP BY load_zone",
            (BASE_YEAR,),
        )
        ercot_zone_annual = {r[0]: to_float(r[1]) for r in await cur.fetchall()}

    customer_share = {
        z: (portfolio_annual.get(z, 0.0) / ercot_zone_annual[z])
        if ercot_zone_annual.get(z)
        else 0.0
        for z in zones
    }

    # Our ERCOT Shape forecast, by delivery day
    async with conn.cursor() as cur:
        await cur.execute(
            """
            SELECT oper_date, load_zone, hourly_shape, daily_shape, monthly_shape
            FROM   ercot_shape_loadzone
            WHERE  oper_date BETWEEN %s AND %s
            """,
            (start, end),
        )
        shape_rows = await cur.fetchall()

    our_by_date: dict[date, float] = {}
    for oper_date, load_zone, hourly_shape, daily_shape, monthly_shape in shape_rows:
        if hourly_shape is None or daily_shape is None or monthly_shape is None:
            continue
        annual = portfolio_annual.get(load_zone, 0.0)
        if not annual:
            continue
        mwh = annual * to_float(hourly_shape) * to_float(daily_shape) * to_float(monthly_shape)
        our_by_date[oper_date] = our_by_date.get(oper_date, 0.0) + mwh

    # LFC-scaled forecast, by delivery day (mirrors Layer 4 in get_forecast_data)
    async with conn.cursor() as cur:
        await cur.execute(
            """
            SELECT delivery_date, hour_ending,
                   AVG(coast), AVG(east), AVG(far_west), AVG(north),
                   AVG(north_central), AVG(south_central), AVG(southern), AVG(west)
            FROM   ercot_lfc_history
            WHERE  delivery_date BETWEEN %s AND %s
            GROUP  BY delivery_date, hour_ending
            """,
            (start, end),
        )
        lfc_rows = await cur.fetchall()

    lfc_by_date: dict[date, float] = {}
    for row in lfc_rows:
        delivery_date = row[0]
        col_vals = dict(zip(WEATHER_COLS, row[2:]))
        grouped = {z: 0.0 for z in zones}
        for db_col, val in col_vals.items():
            if val is None:
                continue
            lz = weather_to_load(DB_COL_TO_ZONE[db_col])
            if lz in grouped:
                grouped[lz] += to_float(val)
        hour_mwh = sum(grouped[z] * customer_share.get(z, 0.0) for z in zones)
        lfc_by_date[delivery_date] = lfc_by_date.get(delivery_date, 0.0) + hour_mwh

    common_dates = sorted(set(our_by_date) & set(lfc_by_date))
    deviations = []
    per_day = []
    for d in common_dates:
        our_mwh = our_by_date[d]
        lfc_mwh = lfc_by_date[d]
        if lfc_mwh:
            dev = abs(our_mwh - lfc_mwh) / lfc_mwh * 100
            deviations.append(dev)
        else:
            dev = None
        per_day.append({
            "date": d.isoformat(),
            "our_forecast_mwh": round(our_mwh, 2),
            "lfc_forecast_mwh": round(lfc_mwh, 2),
            "deviation_pct": round(dev, 2) if dev is not None else None,
        })

    if not deviations:
        return {
            "status": "RED",
            "score": None,
            "threshold_green": 5.0,
            "threshold_red": 10.0,
            "message": "No overlapping shape/LFC forecast data available for the next 7 days.",
            "details": {"days": per_day},
        }

    avg_deviation = statistics.mean(deviations)
    status = grade(avg_deviation, 5.0, 10.0)
    return {
        "status": status,
        "score": round(avg_deviation, 4),
        "threshold_green": 5.0,
        "threshold_red": 10.0,
        "message": f"Avg deviation {avg_deviation:.2f}% across {len(deviations)} day(s).",
        "details": {"days": per_day},
    }


# ── Checkpoint 2 — Historical Backtest ──────────────────────────────────────
async def checkpoint_2_backtest(conn) -> dict:
    async with conn.cursor() as cur:
        await cur.execute("SELECT MIN(oper_date), MAX(oper_date) FROM ercot_load_history")
        min_date, max_date = await cur.fetchone()

    if not min_date or not max_date:
        return {
            "status": "RED",
            "score": None,
            "threshold_green": 5.0,
            "threshold_red": 10.0,
            "message": "No ercot_load_history data available to backtest against.",
            "details": {},
        }

    upper_bound = max_date - timedelta(days=30)
    if upper_bound < min_date:
        upper_bound = min_date

    days_range = (upper_bound - min_date).days
    backtest_date = min_date + timedelta(days=random.randint(0, days_range)) if days_range > 0 else min_date
    days_back = (date.today() - backtest_date).days
    month = backtest_date.month
    dow = backtest_date.weekday()  # 0=Monday..6=Sunday, matches MySQL WEEKDAY()

    select_cols = ", ".join(WEATHER_COLS)
    async with conn.cursor() as cur:
        await cur.execute(
            f"""
            SELECT hour_ending, {select_cols}
            FROM   ercot_load_history
            WHERE  oper_date < %s
              AND  MONTH(oper_date) = %s
              AND  WEEKDAY(oper_date) = %s
            """,
            (backtest_date, month, dow),
        )
        rows = await cur.fetchall()

    groups: dict[tuple, list[float]] = {}
    for row in rows:
        hour_ending = int(row[0])
        for i, col in enumerate(WEATHER_COLS):
            val = row[1 + i]
            if val is None:
                continue
            groups.setdefault((col, hour_ending), []).append(to_float(val))

    forecast_total = 0.0
    for (_col, _he), values in groups.items():
        clean = remove_outliers(values)
        if clean:
            forecast_total += statistics.mean(clean)

    async with conn.cursor() as cur:
        await cur.execute(
            f"""
            SELECT ercot_total, {select_cols}
            FROM   ercot_load_history
            WHERE  oper_date = %s
            """,
            (backtest_date,),
        )
        actual_rows = await cur.fetchall()

    actual_total = 0.0
    for row in actual_rows:
        ercot_total = row[0]
        if ercot_total is not None:
            actual_total += to_float(ercot_total)
        else:
            actual_total += sum(to_float(v) for v in row[1:] if v is not None)

    details = {
        "backtest_date": backtest_date.isoformat(),
        "days_back": days_back,
        "forecast_mwh": round(forecast_total, 2),
        "actual_mwh": round(actual_total, 2),
        "sample_hours_with_actuals": len(actual_rows),
    }

    if not actual_total:
        return {
            "status": "RED",
            "score": None,
            "threshold_green": 5.0,
            "threshold_red": 10.0,
            "message": f"No actual ercot_load_history data found for backtest date {backtest_date.isoformat()}.",
            "details": details,
        }

    deviation = abs(forecast_total - actual_total) / actual_total * 100
    status = grade(deviation, 5.0, 10.0)
    return {
        "status": status,
        "score": round(deviation, 4),
        "threshold_green": 5.0,
        "threshold_red": 10.0,
        "message": f"DNA backtest for {backtest_date.isoformat()} deviated {deviation:.2f}% from actual.",
        "details": details,
    }


# ── Checkpoint 3 — Energy Balance Sanity ────────────────────────────────────
async def checkpoint_3_energy_balance(conn) -> dict:
    async with conn.cursor() as cur:
        await cur.execute(
            "SELECT load_zone, MAX(base_total) FROM forecast_growth_factors "
            "WHERE base_year = %s GROUP BY load_zone",
            (BASE_YEAR,),
        )
        year1_by_zone = {r[0]: to_float(r[1]) for r in await cur.fetchall()}

    async with conn.cursor() as cur:
        await cur.execute(
            "SELECT load_zone, year_total FROM forecast_growth_factors WHERE forecast_year = %s",
            (GROWTH_END_YEAR,),
        )
        year10_by_zone = {r[0]: to_float(r[1]) for r in await cur.fetchall()}

    year1_total = sum(year1_by_zone.values())
    year10_total = sum(year10_by_zone.values())

    details = {
        "base_year": BASE_YEAR,
        "end_year": GROWTH_END_YEAR,
        "year1_total_mwh": round(year1_total, 2),
        "year10_total_mwh": round(year10_total, 2),
    }

    if not year1_total or not year10_total:
        return {
            "status": "RED",
            "score": None,
            "threshold_green": None,
            "threshold_red": None,
            "message": f"Missing forecast_growth_factors data for {BASE_YEAR} or {GROWTH_END_YEAR}.",
            "details": details,
        }

    annual_growth_rate = (year10_total / year1_total) ** (1 / GROWTH_EXPONENT_YEARS) - 1

    if 0.01 <= annual_growth_rate <= 0.15:
        status = "GREEN"
    elif 0.005 <= annual_growth_rate <= 0.20:
        status = "YELLOW"
    else:
        status = "RED"

    return {
        "status": status,
        "score": round(annual_growth_rate, 4),
        "threshold_green": 0.15,
        "threshold_red": 0.20,
        "message": f"Implied annual growth rate {annual_growth_rate * 100:.2f}% ({BASE_YEAR}->{GROWTH_END_YEAR}).",
        "details": details,
    }


# ── Checkpoint 4 — Portfolio Ratio Check ────────────────────────────────────
async def checkpoint_4_portfolio_ratio(conn) -> dict:
    async with conn.cursor() as cur:
        await cur.execute("SELECT SUM(annual_kwh) FROM customer_forecast_dates")
        row = await cur.fetchone()
        current_portfolio_mwh = to_float(row[0]) / 1000.0 if row and row[0] is not None else 0.0

    async with conn.cursor() as cur:
        await cur.execute(
            "SELECT load_zone, MAX(base_total) FROM forecast_growth_factors "
            "WHERE base_year = %s GROUP BY load_zone",
            (BASE_YEAR,),
        )
        ercot_annual_2025 = sum(to_float(r[1]) for r in await cur.fetchall())

    details = {
        "current_portfolio_mwh": round(current_portfolio_mwh, 2),
        "ercot_annual_mwh_2025": round(ercot_annual_2025, 2),
    }

    if not ercot_annual_2025:
        return {
            "status": "RED",
            "score": None,
            "threshold_green": None,
            "threshold_red": None,
            "message": f"Missing forecast_growth_factors base_year={BASE_YEAR} data.",
            "details": details,
        }

    ratio = current_portfolio_mwh / ercot_annual_2025
    details["ratio"] = round(ratio, 6)

    baseline_year = date.today().year - 1
    async with conn.cursor() as cur:
        await cur.execute(
            "SELECT SUM(annual_mwh) FROM portfolio_load_annual WHERE year = %s",
            (baseline_year,),
        )
        row = await cur.fetchone()
        historical_portfolio_mwh = to_float(row[0]) if row and row[0] is not None else 0.0

    async with conn.cursor() as cur:
        await cur.execute(
            "SELECT SUM(year_total) FROM forecast_growth_factors WHERE forecast_year = %s",
            (baseline_year,),
        )
        row = await cur.fetchone()
        historical_ercot_mwh = to_float(row[0]) if row and row[0] is not None else 0.0

    details["baseline_year"] = baseline_year
    details["historical_portfolio_mwh"] = round(historical_portfolio_mwh, 2)
    details["historical_ercot_mwh"] = round(historical_ercot_mwh, 2)

    if not historical_portfolio_mwh or not historical_ercot_mwh:
        return {
            "status": "GREEN",
            "score": round(ratio, 4),
            "threshold_green": 50.0,
            "threshold_red": 50.0,
            "message": f"No historical baseline available for {baseline_year} — reporting current ratio only.",
            "details": details,
        }

    historical_ratio = historical_portfolio_mwh / historical_ercot_mwh
    details["historical_ratio"] = round(historical_ratio, 6)
    drift_pct = abs(ratio - historical_ratio) / historical_ratio * 100
    details["drift_pct"] = round(drift_pct, 2)

    status = "GREEN" if drift_pct <= 50.0 else "RED"
    return {
        "status": status,
        "score": round(ratio, 4),
        "threshold_green": 50.0,
        "threshold_red": 50.0,
        "message": f"Portfolio/ERCOT ratio drifted {drift_pct:.2f}% from the {baseline_year} baseline.",
        "details": details,
    }


CHECKPOINT_FUNCS = {
    1: checkpoint_1_mirror_test,
    2: checkpoint_2_backtest,
    3: checkpoint_3_energy_balance,
    4: checkpoint_4_portfolio_ratio,
}


# ── Persist + orchestrate ────────────────────────────────────────────────────
UPSERT_SQL = """
    INSERT INTO forecast_checkpoints
        (checkpoint_id, checkpoint_name, run_date, status, score,
         threshold_green, threshold_red, message, details)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
    ON DUPLICATE KEY UPDATE
        status          = VALUES(status),
        score           = VALUES(score),
        threshold_green = VALUES(threshold_green),
        threshold_red   = VALUES(threshold_red),
        message         = VALUES(message),
        details         = VALUES(details),
        created_at      = CURRENT_TIMESTAMP
"""


async def run_checkpoint(conn, checkpoint_id: int, run_date: date):
    name = CHECKPOINT_NAMES[checkpoint_id]
    try:
        result = await CHECKPOINT_FUNCS[checkpoint_id](conn)
    except Exception as e:
        log.exception("Checkpoint %d (%s) failed", checkpoint_id, name)
        result = {
            "status": "RED",
            "score": None,
            "threshold_green": None,
            "threshold_red": None,
            "message": f"Checkpoint failed: {e}",
            "details": {},
        }

    async with conn.cursor() as cur:
        await cur.execute(
            UPSERT_SQL,
            (
                checkpoint_id,
                name,
                run_date,
                result["status"],
                result["score"],
                result["threshold_green"],
                result["threshold_red"],
                result["message"],
                json.dumps(result["details"], default=str),
            ),
        )
    await conn.commit()

    log.info("Checkpoint %d [%s] -> %s  %s", checkpoint_id, name, result["status"], result["message"])
    return result


async def run():
    run_date = date.today()
    conn = await aiomysql.connect(**DB_CONFIG)
    try:
        for checkpoint_id in (1, 2, 3, 4):
            await run_checkpoint(conn, checkpoint_id, run_date)
    finally:
        conn.close()

    log.info("Forecast checkpoint run complete for %s.", run_date.isoformat())


def main():
    try:
        asyncio.run(run())
    except Exception as e:
        log.error("Checkpoint runner failed: %s", e)
        sys.exit(1)


if __name__ == "__main__":
    main()
