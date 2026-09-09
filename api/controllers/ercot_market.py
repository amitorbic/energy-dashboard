from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# The 4 hub settlement points line up with the portfolio's HOUSTON/NORTH/SOUTH/WEST
# zones; used as the default point set when the caller doesn't ask for one specific
# settlement point (DAM/RTM tables also carry load-zone (LZ_*) and DC-tie points).
DEFAULT_HUB_POINTS = ("HB_HOUSTON", "HB_NORTH", "HB_SOUTH", "HB_WEST")


async def get_ercot_7day_forecast(db: AsyncSession):
    """
    Latest published ERCOT 7-day Load Forecast by Weather Zone (LFC), straight
    from ercot_lfc_history -- system-wide, not scaled to the portfolio.
    ERCOT re-publishes this forecast multiple times a day for the same
    delivery hours, so only the most-recent publish per (delivery_date,
    hour_ending) is kept, same dedup pattern used in get_forecast_data().
    """
    latest_result = await db.execute(text("SELECT MAX(publish_date) FROM ercot_lfc_history"))
    latest_publish_date = latest_result.scalar()
    if not latest_publish_date:
        return {"as_of_publish_date": None, "delivery_dates": [], "forecast": []}

    result = await db.execute(text("""
        SELECT delivery_date, hour_ending, coast, east, far_west, north,
               north_central, south_central, southern, west, system_total,
               publish_date, publish_time
        FROM ercot_lfc_history
        WHERE publish_date >= :latest_publish_date - INTERVAL 1 DAY
        ORDER BY delivery_date, hour_ending, publish_date DESC, publish_time DESC
    """), {"latest_publish_date": latest_publish_date})
    rows = result.mappings().fetchall()

    latest_by_hour = {}
    for row in rows:
        key = (row["delivery_date"], row["hour_ending"])
        if key not in latest_by_hour:
            latest_by_hour[key] = row

    forecast = [
        {
            "delivery_date": str(delivery_date),
            "hour_ending": hour_ending,
            "coast": float(v["coast"] or 0),
            "east": float(v["east"] or 0),
            "far_west": float(v["far_west"] or 0),
            "north": float(v["north"] or 0),
            "north_central": float(v["north_central"] or 0),
            "south_central": float(v["south_central"] or 0),
            "southern": float(v["southern"] or 0),
            "west": float(v["west"] or 0),
            "system_total": float(v["system_total"] or 0),
        }
        for (delivery_date, hour_ending), v in sorted(latest_by_hour.items())
    ]

    return {
        "as_of_publish_date": str(latest_publish_date),
        "delivery_dates": sorted({f["delivery_date"] for f in forecast}),
        "forecast": forecast,
    }


async def get_ercot_dam_prices(db: AsyncSession, settlement_point: str = None):
    """
    Most recent day's ERCOT Day-Ahead Market settlement point prices
    (ercot_dam_settlement_prices), one row per hour. Defaults to the 4 trading
    hubs when no settlement_point is given.
    """
    latest_result = await db.execute(text("SELECT MAX(operating_date) FROM ercot_dam_settlement_prices"))
    latest_date = latest_result.scalar()
    if not latest_date:
        return {"operating_date": None, "prices": []}

    params = {"operating_date": latest_date}
    point_filter = ""
    if settlement_point:
        point_filter = "AND CONVERT(settlement_point USING utf8mb4) = :point"
        params["point"] = settlement_point.strip().upper()
        default_points_filter = ""
    else:
        default_points_filter = "AND settlement_point IN :default_points"
        params["default_points"] = DEFAULT_HUB_POINTS

    result = await db.execute(text(f"""
        SELECT settlement_point, hour_ending, price
        FROM ercot_dam_settlement_prices
        WHERE operating_date = :operating_date
        {point_filter}
        {default_points_filter}
        ORDER BY settlement_point, hour_ending
    """), params)
    rows = [dict(r) for r in result.mappings()]
    for r in rows:
        r["price"] = float(r["price"]) if r["price"] is not None else None

    return {"operating_date": str(latest_date), "prices": rows}


async def get_ercot_rtm_prices(db: AsyncSession, settlement_point: str = None):
    """
    Most recent day's ERCOT Real-Time Market settlement point prices
    (ercot_rtm_settlement_prices), averaged from 15-min intervals up to one
    row per hour (avg/min/max) so it's the same shape/granularity as the DAM
    prices above. Defaults to the 4 trading hubs when no settlement_point is
    given.
    """
    latest_result = await db.execute(text("SELECT MAX(operating_date) FROM ercot_rtm_settlement_prices"))
    latest_date = latest_result.scalar()
    if not latest_date:
        return {"operating_date": None, "prices": []}

    params = {"operating_date": latest_date}
    point_filter = ""
    if settlement_point:
        point_filter = "AND CONVERT(settlement_point USING utf8mb4) = :point"
        params["point"] = settlement_point.strip().upper()
        default_points_filter = ""
    else:
        default_points_filter = "AND settlement_point IN :default_points"
        params["default_points"] = DEFAULT_HUB_POINTS

    # interval_ending is the END of each 15-min interval, so the 4 intervals
    # for hour-ending N end at N-1:15, N-1:30, N-1:45, N:00 -- HOUR() would
    # split that group of 4 across two different hour buckets (3 landing in
    # HOUR N-1, 1 in HOUR N) and wouldn't line up with DAM's 1-24 hour_ending
    # convention. This maps each interval to the hour_ending it belongs to
    # instead, e.g. both 00:15:00 and 01:00:00 -> hour_ending 1.
    hour_ending_expr = "FLOOR((TIME_TO_SEC(interval_ending) - 1) / 3600) + 1"
    result = await db.execute(text(f"""
        SELECT settlement_point, {hour_ending_expr} AS hour_ending,
               AVG(price) AS avg_price, MIN(price) AS min_price, MAX(price) AS max_price
        FROM ercot_rtm_settlement_prices
        WHERE operating_date = :operating_date
        {point_filter}
        {default_points_filter}
        GROUP BY settlement_point, {hour_ending_expr}
        ORDER BY settlement_point, hour_ending
    """), params)
    rows = [dict(r) for r in result.mappings()]
    for r in rows:
        r["avg_price"] = round(float(r["avg_price"]), 2) if r["avg_price"] is not None else None
        r["min_price"] = round(float(r["min_price"]), 2) if r["min_price"] is not None else None
        r["max_price"] = round(float(r["max_price"]), 2) if r["max_price"] is not None else None

    return {"operating_date": str(latest_date), "prices": rows}
