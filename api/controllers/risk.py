"""
controllers/risk.py
────────────────────
Portfolio Risk Assessment engine.

Four components, weighted into a single overall GREEN/YELLOW/RED score:
  - Position risk  (40%) -- forecast load vs hedged supply, across 4 horizons
  - Price risk     (25%) -- mark-to-market P&L from mtm_results
  - Customer risk  (20%) -- collections delinquency exposure
  - Weather risk   (15%) -- near-term load forecast vs prior-year actuals

calculate_overall_risk() saves the result to risk_scores (one row per day,
upserted via ON DUPLICATE KEY UPDATE, mirrors the mtm_results pattern).
"""

import json
from datetime import date, datetime, timedelta

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from utils.zone_mapping import get_load_zones
from controllers.mtm import _delivery_hours
from controllers.portfolio import get_forecast_data

LOAD_ZONES = get_load_zones()

# GREEN/YELLOW/RED -> 0-100 score, mirrors the convention the price-risk spec
# spells out explicitly; reused everywhere else a status needs a sub-score.
STATUS_SCORE = {"GREEN": 100, "YELLOW": 60, "RED": 20}


def _status_from_score(score: float) -> str:
    if score >= 70:
        return "GREEN"
    if score >= 40:
        return "YELLOW"
    return "RED"


def _seasonal_ranges(start: date, end: date) -> list[tuple[date, date]]:
    """Split [start, end] into contiguous sub-ranges falling in Jun-Aug or Dec-Feb."""
    seasonal_months = {6, 7, 8, 12, 1, 2}
    ranges: list[tuple[date, date]] = []
    range_start = None
    d = start
    while d <= end:
        in_season = d.month in seasonal_months
        if in_season and range_start is None:
            range_start = d
        elif not in_season and range_start is not None:
            ranges.append((range_start, d - timedelta(days=1)))
            range_start = None
        d += timedelta(days=1)
    if range_start is not None:
        ranges.append((range_start, end))
    return ranges


async def _load_vs_supply(db: AsyncSession, start: date, end: date) -> tuple[float, float, int]:
    """Total forecast load MWh, total hedged supply MWh, and hour-count over [start, end]."""
    criteria = {
        "from_date": start.isoformat(),
        "through_date": end.isoformat(),
        "from_he": 1,
        "through_he": 24,
        "zones": LOAD_ZONES,
        "granularity": "hourly",
    }
    data = await get_forecast_data(criteria, db)
    load_total = 0.0
    supply_total = 0.0
    for row in data["rows"]:
        if row["name"] == "Load (Forecast)":
            load_total = row["total"]
        elif row["name"] == "Net Supply":
            supply_total = row["total"]
    return load_total, supply_total, len(data["hours"])


def _horizon_result(load_mwh: float, supply_mwh: float, hours: int, green_max: float, yellow_max: float) -> dict:
    load_mw = load_mwh / hours if hours else 0.0
    supply_mw = supply_mwh / hours if hours else 0.0
    short_pct = ((load_mwh - supply_mwh) / load_mwh * 100) if load_mwh else 0.0

    if short_pct < green_max:
        status = "GREEN"
    elif short_pct <= yellow_max:
        status = "YELLOW"
    else:
        status = "RED"

    return {
        "load_mw": round(load_mw, 2),
        "supply_mw": round(supply_mw, 2),
        "short_pct": round(short_pct, 2),
        "status": status,
        "score": STATUS_SCORE[status],
    }


async def calculate_position_risk(db: AsyncSession) -> dict:
    """Forecast load vs hedged supply across Day/Week/Month/Long-Term horizons."""
    today = date.today()

    # (name, start, end, green_max_pct, yellow_max_pct, weight)
    horizons_def = [
        ("Day Ahead", today + timedelta(days=1), today + timedelta(days=1), 10, 20, 0.40),
        ("Week Ahead", today + timedelta(days=2), today + timedelta(days=7), 20, 30, 0.30),
        ("Month Ahead", today + timedelta(days=8), today + timedelta(days=30), 20, 30, 0.20),
        ("Long Term", today + timedelta(days=31), today + timedelta(days=365), 20, 30, 0.10),
    ]

    details: dict[str, dict] = {}
    weighted_total = 0.0
    total_load_mw = 0.0

    for name, start, end, green_max, yellow_max, weight in horizons_def:
        if name == "Long Term":
            load_mwh = supply_mwh = 0.0
            hours = 0
            for sub_start, sub_end in _seasonal_ranges(start, end):
                l, s, h = await _load_vs_supply(db, sub_start, sub_end)
                load_mwh += l
                supply_mwh += s
                hours += h
        else:
            load_mwh, supply_mwh, hours = await _load_vs_supply(db, start, end)

        horizon = _horizon_result(load_mwh, supply_mwh, hours, green_max, yellow_max)
        horizon["weight"] = weight
        details[name] = horizon
        weighted_total += horizon["score"] * weight
        total_load_mw += horizon["load_mw"]

    if total_load_mw == 0:
        return {
            "score": 50,
            "status": "YELLOW",
            "message": "No position data",
            "details": details,
        }

    score = round(weighted_total, 2)
    return {"score": score, "status": _status_from_score(score), "details": details}


async def calculate_price_risk(db: AsyncSession) -> dict:
    """Mark-to-market P&L vs total portfolio value, from the latest MTM run."""
    calc_date = (await db.execute(text("SELECT MAX(calc_date) FROM mtm_results"))).scalar()

    if not calc_date:
        return {
            "score": 50,
            "status": "YELLOW",
            "message": "No MTM data",
            "total_mtm": 0,
            "mtm_pct": 0,
            "deal_count": 0,
        }

    mtm_row = (
        await db.execute(
            text(
                "SELECT SUM(mtm_value) AS total_mtm, COUNT(*) AS deal_count "
                "FROM mtm_results WHERE calc_date = :d"
            ),
            {"d": calc_date},
        )
    ).mappings().fetchone()
    total_mtm = float(mtm_row["total_mtm"] or 0)
    deal_count = mtm_row["deal_count"] or 0

    hedge_rows = (
        await db.execute(
            text(
                "SELECT volume_mw, price, block_type, delivery_start, delivery_end "
                "FROM hedge_book WHERE delivery_end >= :d"
            ),
            {"d": calc_date},
        )
    ).mappings().fetchall()

    portfolio_value = 0.0
    for h in hedge_rows:
        volume_mw = float(h["volume_mw"] or 0)
        deal_price = float(h["price"] or 0)
        hours = _delivery_hours(h["block_type"], h["delivery_start"], h["delivery_end"])
        portfolio_value += volume_mw * deal_price * hours

    mtm_pct = (total_mtm / portfolio_value * 100) if portfolio_value else 0.0

    if total_mtm > 0:
        status = "GREEN"
    elif mtm_pct >= -5:
        status = "YELLOW"
    else:
        status = "RED"

    return {
        "score": STATUS_SCORE[status],
        "status": status,
        "total_mtm": round(total_mtm, 2),
        "mtm_pct": round(mtm_pct, 2),
        "deal_count": deal_count,
    }


async def calculate_customer_risk(db: AsyncSession) -> dict:
    """Collections delinquency exposure across open (unpaid) accounts."""
    row = (
        await db.execute(
            text(
                """
                SELECT
                    SUM(CASE WHEN is_paid = 0 THEN total_due ELSE 0 END) AS total_at_risk,
                    SUM(CASE WHEN is_paid = 0 AND delinquency_tier = 'CRITICAL' THEN 1 ELSE 0 END) AS critical_count,
                    SUM(CASE WHEN is_paid = 0 AND delinquency_tier = 'HIGH' THEN 1 ELSE 0 END) AS high_count,
                    SUM(CASE WHEN is_paid = 0 THEN 1 ELSE 0 END) AS total_open
                FROM collections_accounts
                """
            )
        )
    ).mappings().fetchone()

    total_open = int(row["total_open"] or 0)
    if not total_open:
        return {
            "score": 100,
            "status": "GREEN",
            "message": "No open collections accounts",
            "total_at_risk": 0,
            "critical_count": 0,
            "high_count": 0,
            "total_open": 0,
            "critical_pct": 0,
        }

    total_at_risk = float(row["total_at_risk"] or 0)
    critical_count = int(row["critical_count"] or 0)
    high_count = int(row["high_count"] or 0)
    critical_pct = critical_count / total_open * 100

    if critical_pct < 5:
        status = "GREEN"
    elif critical_pct <= 15:
        status = "YELLOW"
    else:
        status = "RED"

    score = max(0.0, min(100.0, 100 - critical_pct * 4))

    return {
        "score": round(score, 2),
        "status": status,
        "total_at_risk": round(total_at_risk, 2),
        "critical_count": critical_count,
        "high_count": high_count,
        "total_open": total_open,
        "critical_pct": round(critical_pct, 2),
    }


async def calculate_weather_risk(db: AsyncSession) -> dict:
    """Next-7-day LFC load forecast vs the same calendar week last year."""
    today = date.today()
    start = today + timedelta(days=1)
    end = today + timedelta(days=7)
    prior_start = start - timedelta(days=365)
    prior_end = end - timedelta(days=365)

    lfc_avg = (
        await db.execute(
            text(
                "SELECT AVG(system_total) FROM ercot_lfc_history "
                "WHERE delivery_date BETWEEN :s AND :e"
            ),
            {"s": start.isoformat(), "e": end.isoformat()},
        )
    ).scalar()

    prior_avg = (
        await db.execute(
            text(
                "SELECT AVG(ercot_total) FROM ercot_load_history "
                "WHERE oper_date BETWEEN :s AND :e"
            ),
            {"s": prior_start.isoformat(), "e": prior_end.isoformat()},
        )
    ).scalar()

    if lfc_avg is None or prior_avg is None or float(prior_avg) == 0:
        return {
            "score": 50,
            "status": "YELLOW",
            "message": "No weather/load data",
            "lfc_avg_mw": round(float(lfc_avg), 2) if lfc_avg is not None else 0,
            "prior_year_avg_mw": round(float(prior_avg), 2) if prior_avg else 0,
            "deviation_pct": 0,
        }

    lfc_avg = float(lfc_avg)
    prior_avg = float(prior_avg)
    deviation_pct = (lfc_avg - prior_avg) / prior_avg * 100
    abs_dev = abs(deviation_pct)

    if abs_dev < 10:
        status = "GREEN"
    elif abs_dev <= 20:
        status = "YELLOW"
    else:
        status = "RED"

    score = max(0.0, min(100.0, 100 - abs_dev * 3))

    return {
        "score": round(score, 2),
        "status": status,
        "lfc_avg_mw": round(lfc_avg, 2),
        "prior_year_avg_mw": round(prior_avg, 2),
        "deviation_pct": round(deviation_pct, 2),
    }


async def calculate_overall_risk(db: AsyncSession) -> dict:
    """Run all four components, weight them into one score, and persist it."""
    position = await calculate_position_risk(db)
    price = await calculate_price_risk(db)
    customer = await calculate_customer_risk(db)
    weather = await calculate_weather_risk(db)

    overall_score = round(
        position["score"] * 0.40
        + price["score"] * 0.25
        + customer["score"] * 0.20
        + weather["score"] * 0.15,
        2,
    )
    overall_status = "GREEN" if overall_score >= 70 else "YELLOW" if overall_score >= 40 else "RED"

    today = date.today()
    calculated_at = datetime.now()
    details = {"position": position, "price": price, "customer": customer, "weather": weather}

    await db.execute(
        text(
            """
            INSERT INTO risk_scores (
                score_date, overall_score, overall_status,
                position_score, position_status,
                price_score, price_status,
                customer_score, customer_status,
                weather_score, weather_status,
                details
            ) VALUES (
                :score_date, :overall_score, :overall_status,
                :position_score, :position_status,
                :price_score, :price_status,
                :customer_score, :customer_status,
                :weather_score, :weather_status,
                :details
            )
            ON DUPLICATE KEY UPDATE
                overall_score    = VALUES(overall_score),
                overall_status   = VALUES(overall_status),
                position_score   = VALUES(position_score),
                position_status  = VALUES(position_status),
                price_score      = VALUES(price_score),
                price_status     = VALUES(price_status),
                customer_score   = VALUES(customer_score),
                customer_status  = VALUES(customer_status),
                weather_score    = VALUES(weather_score),
                weather_status   = VALUES(weather_status),
                details          = VALUES(details),
                calculated_at    = CURRENT_TIMESTAMP
            """
        ),
        {
            "score_date": today.isoformat(),
            "overall_score": overall_score,
            "overall_status": overall_status,
            "position_score": position["score"],
            "position_status": position["status"],
            "price_score": price["score"],
            "price_status": price["status"],
            "customer_score": customer["score"],
            "customer_status": customer["status"],
            "weather_score": weather["score"],
            "weather_status": weather["status"],
            "details": json.dumps(details, default=str),
        },
    )
    await db.commit()

    return {
        "score_date": today.isoformat(),
        "overall_score": overall_score,
        "overall_status": overall_status,
        "position": position,
        "price": price,
        "customer": customer,
        "weather": weather,
        "calculated_at": calculated_at.isoformat(),
    }


async def get_risk_history(db: AsyncSession, days: int = 30) -> list:
    """Last N days of saved risk_scores rows, oldest first."""
    rows = (
        await db.execute(
            text(
                """
                SELECT score_date, overall_score, overall_status,
                       position_score, position_status,
                       price_score, price_status,
                       customer_score, customer_status,
                       weather_score, weather_status,
                       calculated_at
                FROM risk_scores
                WHERE score_date >= :since
                ORDER BY score_date ASC
                """
            ),
            {"since": (date.today() - timedelta(days=days)).isoformat()},
        )
    ).mappings().fetchall()
    return [dict(r) for r in rows]
