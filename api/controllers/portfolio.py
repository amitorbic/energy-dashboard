from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
import sqlalchemy as sa
from utils.zone_mapping import weather_to_load, get_zone_mapping_from_db


def extract_zone(load_profile: str) -> str:
    """Extract zone from load profile string e.g. BUSLOLF_COAST_IDR → COAST"""
    if not load_profile:
        return "UNKNOWN"
    parts = load_profile.split("_")
    return parts[1] if len(parts) > 1 else "UNKNOWN"


async def get_portfolio_summary(db: AsyncSession):
    result = await db.execute(text("""
    SELECT
        COUNT(*)                                                        as total_customers,
        SUM(CASE WHEN CONVERT(status USING utf8mb4)        = 'active'  THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN CONVERT(status USING utf8mb4)        = 'expired' THEN 1 ELSE 0 END) as expired,
        SUM(CASE WHEN CONVERT(contract_type USING utf8mb4) = 'Fix'     THEN 1 ELSE 0 END) as fixed,
        SUM(CASE WHEN CONVERT(contract_type USING utf8mb4) = 'LMP'     THEN 1 ELSE 0 END) as lmp,
        SUM(CASE WHEN CONVERT(contract_type USING utf8mb4) = 'MTM'     THEN 1 ELSE 0 END) as mtm,
        MIN(CASE WHEN contract_end_date >= CURDATE() THEN contract_end_date END) as earliest_end,
        MAX(contract_end_date)                                          as latest_end,
        COUNT(DISTINCT zone)                                            as zones_count
       FROM portfolio_view
     """))
    row = result.mappings().fetchone()
    return dict(row) if row else {}


async def get_portfolio_by_zone(db: AsyncSession):
    result = await db.execute(text("""
        SELECT
            zone,
            COUNT(*)                                               as customers,
            SUM(CASE WHEN CONVERT(status USING utf8mb4) = 'active'  THEN 1 ELSE 0 END) as active,
            SUM(CASE WHEN CONVERT(status USING utf8mb4) = 'expired' THEN 1 ELSE 0 END) as expired,
            SUM(CASE WHEN CONVERT(contract_type USING utf8mb4) = 'Fix' THEN 1 ELSE 0 END) as fixed,
            SUM(CASE WHEN CONVERT(contract_type USING utf8mb4) = 'LMP' THEN 1 ELSE 0 END) as lmp,
            SUM(CAST(REPLACE(REPLACE(COALESCE(usage_kwh,'0'),'$',''),',','') 
                AS DECIMAL(12,4)))                                 as total_usage_kwh,
            MIN(contract_end_date)                                 as earliest_end,
            MAX(contract_end_date)                                 as latest_end
        FROM portfolio_view
        WHERE CONVERT(zone USING utf8mb4) != 'UNKNOWN'
        GROUP BY zone
        ORDER BY customers DESC
    """))
    return [dict(row) for row in result.mappings()]


async def get_portfolio_customers(
    db: AsyncSession,
    zone: str = None,
    contract_type: str = None,
    status: str = "active",
    search: str = None,
    page: int = 1,
    limit: int = 50,
):
    conditions = []
    params = {}

    if status:
        conditions.append("status = :status")
        params["status"] = status

    if zone:
        conditions.append("zone = :zone")
        params["zone"] = zone

    if contract_type:
        conditions.append("contract_type = :contract_type")
        params["contract_type"] = contract_type

    if search:
        conditions.append("""
            (company_name LIKE :search
            OR CAST(premise_id AS CHAR) LIKE :search
            OR cust_id LIKE :search)
        """)
        params["search"] = f"%{search}%"

    where = "WHERE " + " AND ".join(conditions) if conditions else ""

    # Total count
    count_result = await db.execute(
        text(f"SELECT COUNT(*) as total FROM portfolio_view {where}"), params
    )
    total = count_result.scalar()

    # Paginated data
    offset = (page - 1) * limit
    params["limit"] = limit
    params["offset"] = offset

    result = await db.execute(
        text(f"""
        SELECT
            cust_id,
            company_name,
            CAST(premise_id AS CHAR)  as premise_id,
            zone,
            load_profile,
            contract_type,
            contract_rate,
            contract_end_date,
            usage_kwh,
            broker_code,
            status
        FROM portfolio_view
        {where}
        ORDER BY contract_end_date ASC
        LIMIT :limit OFFSET :offset
    """),
        params,
    )

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit,
        "data": [dict(row) for row in result.mappings()],
    }


async def get_open_position(
    db: AsyncSession,
    zone: str = None,
    granularity: str = "monthly",
):
    """
    Open position = estimated MW load through each contract end date
    Groups by month showing how much load expires each period
    """
    zone_filter = "AND zone = :zone" if zone else ""
    params = {}
    if zone:
        params["zone"] = zone

    if granularity == "monthly":
        result = await db.execute(
            text(f"""
            SELECT
                DATE_FORMAT(contract_end_date, '%Y-%m') as period,
                zone,
                COUNT(*)                                as customers_expiring,
                SUM(CAST(REPLACE(REPLACE(usage_kwh, '$', ''), ',', '')
                    AS DECIMAL(12,4))) / 1000           as estimated_mw,
                contract_type
            FROM portfolio_view
            WHERE CONVERT(status USING utf8mb4) = 'active'
            AND contract_end_date >= CURDATE()
            {zone_filter}
            GROUP BY DATE_FORMAT(contract_end_date, '%Y-%m'), zone, contract_type
            ORDER BY period, zone
        """),
            params,
        )

    elif granularity == "yearly":
        result = await db.execute(
            text(f"""
            SELECT
                YEAR(contract_end_date)                 as period,
                zone,
                COUNT(*)                                as customers_expiring,
                SUM(CAST(REPLACE(REPLACE(usage_kwh, '$', ''), ',', '')
                    AS DECIMAL(12,4))) / 1000           as estimated_mw,
                contract_type
            FROM portfolio_view
            WHERE CONVERT(status USING utf8mb4) = 'active'
            AND contract_end_date >= CURDATE()
            {zone_filter}
            GROUP BY YEAR(contract_end_date), zone, contract_type
            ORDER BY period, zone
        """),
            params,
        )

    else:  # weekly
        result = await db.execute(
            text(f"""
            SELECT
                DATE_FORMAT(contract_end_date, '%Y-%u') as period,
                zone,
                COUNT(*)                                as customers_expiring,
                SUM(CAST(REPLACE(REPLACE(usage_kwh, '$', ''), ',', '')
                    AS DECIMAL(12,4))) / 1000           as estimated_mw,
                contract_type
            FROM portfolio_view
            WHERE CONVERT(status USING utf8mb4) = 'active'
            AND contract_end_date >= CURDATE()
            {zone_filter}
            GROUP BY DATE_FORMAT(contract_end_date, '%Y-%u'), zone, contract_type
            ORDER BY period, zone
        """),
            params,
        )

    rows = [dict(row) for row in result.mappings()]

    # Also return cumulative active position (load that stays on books)
    cumulative = await db.execute(
        text(f"""
        SELECT
            zone,
            COUNT(*)                                    as total_active,
            SUM(CAST(REPLACE(REPLACE(usage_kwh, '$', ''), ',', '')
                AS DECIMAL(12,4))) / 1000               as total_mw,
            MIN(contract_end_date)                      as first_expiry,
            MAX(contract_end_date)                      as last_expiry
        FROM portfolio_view
        WHERE CONVERT(status USING utf8mb4) = 'active'
        AND contract_end_date >= CURDATE()
        {zone_filter}
        GROUP BY zone
        ORDER BY total_mw DESC
    """),
        params,
    )

    return {
        "expiry_schedule": rows,
        "current_position": [dict(r) for r in cumulative.mappings()],
        "as_of": date.today().isoformat(),
        "granularity": granularity,
    }


async def get_portfolio_forecast(
    db: AsyncSession,
    zone: str = None,
    method: str = "composite",
    horizon: str = "monthly",
):
    """
    Pull forecast patterns for active portfolio zones
    Returns expected load by zone/month based on historical patterns
    """
    zone_filter = "AND zone = :zone" if zone else ""
    params = {}
    if zone:
        params["zone"] = zone

    # Get active zones in portfolio
    zones_result = await db.execute(
        text(f"""
        SELECT DISTINCT zone
        FROM portfolio_view
        WHERE CONVERT(status USING utf8mb4) = 'active'
        {zone_filter}
    """),
        params,
    )
    active_zones = [row[0] for row in zones_result]

    if not active_zones:
        return {"forecast": [], "method": method}

    # Pull patterns for these zones
    zone_list = "','".join(active_zones)
    pattern_result = await db.execute(text(f"""
        SELECT
            zone,
            month_num,
            day_type,
            hour_ending,
            avg_mw,
            p10_mw,
            p50_mw,
            p90_mw,
            temp_coeff,
            base_temp_f,
            yoy_growth_pct,
            sample_days
        FROM ercot_load_patterns
        WHERE zone IN ('{zone_list}')
        AND day_type IN ('Mon','Tue','Wed','Thu','Fri')
        ORDER BY zone, month_num, hour_ending
    """))

    patterns = [dict(row) for row in pattern_result.mappings()]

    # Monthly summary — avg peak hour per zone per month
    monthly_summary = {}
    for p in patterns:
        key = f"{p['zone']}_{p['month_num']}"
        if key not in monthly_summary:
            monthly_summary[key] = {
                "zone": p["zone"],
                "month": p["month_num"],
                "peak_avg_mw": 0,
                "offpeak_avg": 0,
                "p90_mw": 0,
                "count": 0,
            }
        # Peak hours HE07-HE22
        if 7 <= p["hour_ending"] <= 22:
            monthly_summary[key]["peak_avg_mw"] += float(p["avg_mw"] or 0)
            monthly_summary[key]["p90_mw"] += float(p["p90_mw"] or 0)
            monthly_summary[key]["count"] += 1
        else:
            monthly_summary[key]["offpeak_avg"] += float(p["avg_mw"] or 0)

    # Average across hours
    for key, v in monthly_summary.items():
        if v["count"] > 0:
            v["peak_avg_mw"] = round(v["peak_avg_mw"] / v["count"], 2)
            v["p90_mw"] = round(v["p90_mw"] / v["count"], 2)
            v["offpeak_avg"] = round(v["offpeak_avg"] / max(8, 1), 2)

    return {
        "method": method,
        "horizon": horizon,
        "active_zones": active_zones,
        "monthly_forecast": list(monthly_summary.values()),
        "pattern_count": len(patterns),
    }


async def get_position_data(criteria: dict, db: AsyncSession):
    from datetime import date, timedelta

    from_date = criteria.get("from_date", date.today().isoformat())
    through_date = criteria.get("through_date", from_date)
    from_he = int(criteria.get("from_he", 1))
    through_he = int(criteria.get("through_he", 24))
    zones = criteria.get("zones", ["HOUSTON", "NORTH", "SOUTH", "WEST"])
    load_type = criteria.get("load_type", "Forecast")
    granularity = criteria.get("granularity", "hourly")
    settlement_run = criteria.get("settlement_run", "RTM_FINAL2")
    use_actuals = load_type in ["Actual (With Losses)", "Actual (Unadjusted)"]

    start = date.fromisoformat(from_date)
    end = date.fromisoformat(through_date)

    # ── Source table ──────────────────────────────────────────────────────────
    load_table = (
        "portfolio_load_unadjusted"
        if load_type == "Actual (Unadjusted)"
        else "portfolio_load_with_losses"
    )

    # ── Build hour labels ─────────────────────────────────────────────────────
    hours = []
    d = start
    while d <= end:
        he_start = from_he if d == start else 1
        he_end = through_he if d == end else 24

        if granularity == "fifteen_min":
            for he in range(he_start, he_end + 1):
                for q in range(1, 5):
                    hours.append(f"{d.strftime('%m/%d')} HE{str(he).zfill(2)} Q{q}")
        elif granularity == "hourly":
            for he in range(he_start, he_end + 1):
                hours.append(f"{d.strftime('%m/%d')} HE{str(he).zfill(2)}")
        elif granularity == "daily":
            hours.append(d.strftime("%m/%d"))
        elif granularity == "monthly":
            label = d.strftime("%b %Y")
            if label not in hours:
                hours.append(label)

        d += timedelta(days=1)

    n = len(hours)
    zone_load = {z: [0.0] * n for z in zones}

    # ── Load from portfolio tables ────────────────────────────────────────────
    if use_actuals:
        d = start
        hour_offset = 0

        while d <= end:
            he_start = from_he if d == start else 1
            he_end = through_he if d == end else 24
            int_start = (he_start - 1) * 4 + 1
            int_end = he_end * 4

            result = await db.execute(
                text(f"""
                SELECT interval_ending, settlement_zone, mwh
                FROM   {load_table}
                WHERE  oper_date       = :oper_date
                  AND  settlement_run  = :settlement_run
                  AND  interval_ending BETWEEN :int_start AND :int_end
                ORDER  BY settlement_zone, interval_ending
            """),
                {
                    "oper_date": str(d),
                    "settlement_run": settlement_run,
                    "int_start": int_start,
                    "int_end": int_end,
                },
            )

            for row in result.fetchall():
                interval_ending = int(row[0])
                zone = row[1]
                val = float(row[2])

                if zone not in zones:
                    continue

                he = (interval_ending - 1) // 4 + 1  # 1-24
                q = (interval_ending - 1) % 4  # 0-3

                if granularity == "fifteen_min":
                    pos = hour_offset + (he - he_start) * 4 + q
                    if pos < n:
                        zone_load[zone][pos] += val

                elif granularity == "hourly":
                    pos = hour_offset + (he - he_start)
                    if pos < n:
                        zone_load[zone][pos] += val

                elif granularity == "daily":
                    pos = hour_offset
                    if pos < n:
                        zone_load[zone][pos] += val

                elif granularity == "monthly":
                    label = d.strftime("%b %Y")
                    if label in hours:
                        pos = hours.index(label)
                        zone_load[zone][pos] += val

            if granularity == "fifteen_min":
                hour_offset += (he_end - he_start + 1) * 4
            elif granularity == "hourly":
                hour_offset += he_end - he_start + 1
            elif granularity == "daily":
                hour_offset += 1

            d += timedelta(days=1)

    # ── Hedged supply ─────────────────────────────────────────────────────────
    hedge_result = await db.execute(
        text("""
        SELECT zone, location, block_type, volume_mw
        FROM   hedge_book
        WHERE  delivery_start <= :end_date
          AND  delivery_end   >= :start_date
    """),
        {"start_date": from_date, "end_date": through_date},
    )
    hedges = [dict(r) for r in hedge_result.mappings()]

    all_locations = [
        "HB_HOUSTON",
        "HB_NORTH",
        "HB_SOUTH",
        "HB_WEST",
        "LZ_HOUSTON",
        "LZ_NORTH",
        "LZ_SOUTH",
        "LZ_WEST",
    ]

    def hedge_mw_for_location(location, hour_idx):
        he = (hour_idx % 24) + 1
        total = 0.0
        for h in hedges:
            if h.get("location") != location:
                continue
            bt = h["block_type"]
            if bt == "7x24":
                total += float(h["volume_mw"])
            elif bt in ("7x16", "5x16") and 7 <= he <= 22:
                total += float(h["volume_mw"])
            elif bt == "7x8" and (he <= 6 or he >= 23):
                total += float(h["volume_mw"])
        return total

    loc_supply = {
        loc: [hedge_mw_for_location(loc, i) for i in range(n)] for loc in all_locations
    }
    zone_supply = {
        z: [loc_supply[f"HB_{z}"][i] + loc_supply[f"LZ_{z}"][i] for i in range(n)]
        for z in zones
    }
    total_supply = [sum(zone_supply[z][i] for z in zones) for i in range(n)]
    total_load = [sum(zone_load[z][i] for z in zones) for i in range(n)]

    # ── Build rows ─────────────────────────────────────────────────────────────
    rows = [
        {
            "name": "Net Position",
            "total": round(sum(total_supply) - sum(total_load), 3),
            "hours": [round(total_supply[i] - total_load[i], 3) for i in range(n)],
            "type": "net",
        },
        {
            "name": (
                "Load (Unadjusted)"
                if load_type == "Actual (Unadjusted)"
                else "Load (With Losses)"
            ),
            "total": round(sum(total_load), 3),
            "hours": [round(v, 3) for v in total_load],
            "type": "header",
        },
        *[
            {
                "name": z,
                "total": round(sum(zone_load[z]), 3),
                "hours": [round(v, 3) for v in zone_load[z]],
                "type": "zone",
            }
            for z in zones
        ],
        {
            "name": "Net Supply",
            "total": round(sum(total_supply), 3),
            "hours": [round(v, 3) for v in total_supply],
            "type": "supply",
        },
        *[
            {
                "name": f"HB_{z} Net Supply",
                "total": round(sum(loc_supply[f"HB_{z}"]), 3),
                "hours": [round(v, 3) for v in loc_supply[f"HB_{z}"]],
                "type": "supply",
            }
            for z in zones
        ],
        *[
            {
                "name": f"LZ_{z} Net Supply",
                "total": round(sum(loc_supply[f"LZ_{z}"]), 3),
                "hours": [round(v, 3) for v in loc_supply[f"LZ_{z}"]],
                "type": "supply",
            }
            for z in zones
        ],
        {
            "name": "Net by Zone",
            "total": round(sum(total_supply) - sum(total_load), 3),
            "hours": [round(total_supply[i] - total_load[i], 3) for i in range(n)],
            "type": "net",
        },
        *[
            {
                "name": f"{z} Net",
                "total": round(sum(zone_supply[z]) - sum(zone_load[z]), 3),
                "hours": [
                    round(zone_supply[z][i] - zone_load[z][i], 3) for i in range(n)
                ],
                "type": "net_zone",
            }
            for z in zones
        ],
    ]

    return {"rows": rows, "hours": hours, "criteria": criteria}


# ── Zone extraction helpers ───────────────────────────────────────────────────


_LOAD_QUERY = """
SELECT
    interval_ending,
    settlement_zone,
    mwh,
    settlement_run,
    loaded_at
FROM {table}
WHERE oper_date      = :oper_date
  AND settlement_run = :settlement_run
  {zone_filter}
ORDER BY settlement_zone, interval_ending
"""


async def get_load_with_losses(
    db,
    oper_date: str,
    settlement_run: str = "RTM_INITIAL",
    zone: Optional[str] = None,
) -> dict:
    """
    Returns hourly load-with-losses for all 4 zones (or a single zone).

    Response shape:
    {
      "oper_date": "2026-04-01",
      "settlement_run": "RTM_INITIAL",
      "zones": {
        "HOUSTON": [mwh_he01, ..., mwh_he24],
        "NORTH":   [...],
        "SOUTH":   [...],
        "WEST":    [...],
      },
      "daily_totals": { "HOUSTON": 123.4, ... },
      "has_data": True
    }
    """
    zone_filter = "AND settlement_zone = :zone" if zone else ""
    sql = _LOAD_QUERY.format(
        table="portfolio_load_with_losses", zone_filter=zone_filter
    )
    params = {"oper_date": oper_date, "settlement_run": settlement_run}
    if zone:
        params["zone"] = zone

    result = await db.execute(sa.text(sql), params)
    rows = result.mappings().all()

    return _shape_load_response(oper_date, settlement_run, rows)


async def get_load_unadjusted(
    db,
    oper_date: str,
    settlement_run: str = "RTM_INITIAL",
    zone: Optional[str] = None,
) -> dict:
    """
    Same shape as get_load_with_losses but from portfolio_load_unadjusted.
    """
    zone_filter = "AND settlement_zone = :zone" if zone else ""
    sql = _LOAD_QUERY.format(table="portfolio_load_unadjusted", zone_filter=zone_filter)
    params = {"oper_date": oper_date, "settlement_run": settlement_run}
    if zone:
        params["zone"] = zone

    result = await db.execute(sa.text(sql), params)
    rows = result.mappings().all()

    return _shape_load_response(oper_date, settlement_run, rows)


async def get_load_combined(
    db,
    oper_date: str,
    settlement_run: str = "RTM_INITIAL",
) -> dict:
    """
    Returns BOTH load types in one call — used by position screen summary card.

    Response shape:
    {
      "oper_date": "...",
      "settlement_run": "...",
      "with_losses":   { zones: {...}, daily_totals: {...}, has_data: bool },
      "unadjusted":    { zones: {...}, daily_totals: {...}, has_data: bool },
    }
    """
    wl = await get_load_with_losses(db, oper_date, settlement_run)
    ua = await get_load_unadjusted(db, oper_date, settlement_run)
    return {
        "oper_date": oper_date,
        "settlement_run": settlement_run,
        "with_losses": wl,
        "unadjusted": ua,
    }


async def get_available_dates(db) -> list[dict]:
    """
    Returns distinct (oper_date, settlement_run) pairs that have been processed.
    Used by the date-picker on the position screen.
    """
    sql = """
    SELECT DISTINCT oper_date, settlement_run, MAX(loaded_at) AS loaded_at
    FROM   portfolio_load_with_losses
    GROUP  BY oper_date, settlement_run
    ORDER  BY oper_date DESC, settlement_run
    LIMIT  365
    """
    result = await db.execute(sa.text(sql))
    rows = result.mappings().all()
    return [
        {
            "oper_date": str(r["oper_date"]),
            "settlement_run": r["settlement_run"],
            "loaded_at": str(r["loaded_at"]),
        }
        for r in rows
    ]


# ── Internal helper ───────────────────────────────────────────────────────────

ZONES = ("HOUSTON", "NORTH", "SOUTH", "WEST")


def _shape_load_response(oper_date: str, settlement_run: str, rows) -> dict:
    """Pivot flat DB rows into zone → 24-element array."""
    # Initialise with zeros — position screen shows 0 when no data, not null
    zones: dict[str, list[float]] = {z: [0.0] * 96 for z in ZONES}

    for row in rows:
        z = row["settlement_zone"]
        ie = int(row["interval_ending"])
        print(f"DEBUG z={z} ie={ie} len={len(zones.get(z, []))}")
        if z in zones and 1 <= ie <= 96:
            zones[z][ie - 1] = float(row["mwh"])

    daily_totals = {z: round(sum(v), 4) for z, v in zones.items()}
    has_data = any(t > 0 for t in daily_totals.values())

    return {
        "oper_date": str(oper_date),
        "settlement_run": settlement_run,
        "zones": zones,
        "daily_totals": daily_totals,
        "has_data": has_data,
    }


async def get_forecast_data(criteria: dict, db: AsyncSession) -> dict:
    print("DEBUG get_forecast_data called")
    """
    ERCOT shape-based forecast for position screen.
    Returns same structure as get_position_data for seamless integration.
    """
    from datetime import date, timedelta

    from_date = criteria.get("from_date", date.today().isoformat())
    through_date = criteria.get("through_date", from_date)
    from_he = int(criteria.get("from_he", 1))
    through_he = int(criteria.get("through_he", 24))
    zones = criteria.get("zones", ["HOUSTON", "NORTH", "SOUTH", "WEST"])
    granularity = criteria.get("granularity", "hourly")
    forecast_year = criteria.get("forecast_year", date.today().year)

    start = date.fromisoformat(from_date)
    end = date.fromisoformat(through_date)

    # ── Step 1: Query active contracts ────────────────────────────────────────
    result = await db.execute(
        text("""
       SELECT esid, load_zone, annual_kwh, forecast_end_date, weather_zone
       FROM   customer_forecast_dates
       WHERE  load_zone      IS NOT NULL
        AND  annual_kwh     IS NOT NULL
        AND  forecast_end_date >= :forecast_date
 
       UNION ALL
 
       SELECT esid, load_zone, annual_kwh, forecast_end_date, weather_zone
       FROM   future_forecast_dates
        WHERE  load_zone            IS NOT NULL
      AND  annual_kwh           IS NOT NULL
      AND  forecast_start_date  <= :forecast_date
      AND  forecast_end_date    >= :forecast_date
"""),
        {"forecast_date": str(start)},
    )
    contracts = result.fetchall()
    print(f"DEBUG contracts found={len(contracts)}")

    # ── Step 2: Aggregate annual MWh per load_zone AND weather_zone ──────────
    zone_annual_mwh: dict[str, float] = {
        "HOUSTON": 0.0,
        "NORTH": 0.0,
        "SOUTH": 0.0,
        "WEST": 0.0,
    }
    weatherzone_annual_mwh: dict[str, float] = {}

    for row in contracts:
        load_zone = row[1]
        annual_kwh = float(row[2] or 0)
        weather_zone = row[4]

        if load_zone in zones:
            zone_annual_mwh[load_zone] += annual_kwh / 1000.0

        if weather_zone:
            weatherzone_annual_mwh[weather_zone] = (
                weatherzone_annual_mwh.get(weather_zone, 0.0) + annual_kwh / 1000.0
            )

    # ── Step 3: Build hour labels ─────────────────────────────────────────────
    hours = []
    d = start
    while d <= end:
        he_start = from_he if d == start else 1
        he_end = through_he if d == end else 24

        if granularity == "fifteen_min":
            for he in range(he_start, he_end + 1):
                for q in range(1, 5):
                    hours.append(f"{d.strftime('%m/%d')} HE{str(he).zfill(2)} Q{q}")
        elif granularity == "hourly":
            for he in range(he_start, he_end + 1):
                hours.append(f"{d.strftime('%m/%d')} HE{str(he).zfill(2)}")
        elif granularity == "daily":
            hours.append(d.strftime("%m/%d"))
        elif granularity == "monthly":
            label = d.strftime("%b %Y")
            if label not in hours:
                hours.append(label)

        d += timedelta(days=1)

    n = len(hours)
    zone_load = {z: [0.0] * n for z in zones}

    # ── Step 4: Apply shape factors ───────────────────────────────────────────
    # Fetch all shape rows for the date range in one query
    shape_result = await db.execute(
        text("""
        SELECT oper_date, month, day, hour,
               load_zone, hourly_shape, daily_shape, monthly_shape
        FROM   ercot_shape_loadzone
        WHERE  oper_date BETWEEN :start_date AND :end_date
          AND  load_zone IN :zones
        ORDER  BY load_zone, oper_date, hour
    """),
        {
            "start_date": str(start),
            "end_date": str(end),
            "zones": tuple(zones),
        },
    )
    shape_rows = shape_result.fetchall()
    print(f"DEBUG shape_rows found={len(shape_rows)}")

    # Build shape lookup: (oper_date, hour, load_zone) → (hourly, daily, monthly)
    shape_lookup: dict[tuple, tuple] = {}
    for row in shape_rows:
        key = (str(row[0]), int(row[3]), row[4])
        shape_lookup[key] = (
            float(row[5] or 0),  # hourly_shape
            float(row[6] or 0),  # daily_shape
            float(row[7] or 0),  # monthly_shape
        )

    # Apply shapes to annual MWh
    d = start
    hour_offset = 0

    while d <= end:
        he_start = from_he if d == start else 1
        he_end = through_he if d == end else 24

        for zone in zones:
            annual_mwh = zone_annual_mwh.get(zone, 0.0)
            if annual_mwh == 0:
                continue

            for he in range(he_start, he_end + 1):
                key = (str(d), he, zone)
                shapes = shape_lookup.get(key)
                if not shapes:
                    continue

                hourly_shape, daily_shape, monthly_shape = shapes

                # hourly_mwh = annual × monthly_shape × daily_shape × hourly_shape
                hourly_mwh = annual_mwh * monthly_shape * daily_shape * hourly_shape

                if granularity == "fifteen_min":
                    # 15-min = hourly / 4
                    for q in range(4):
                        pos = hour_offset + (he - he_start) * 4 + q
                        if pos < n:
                            zone_load[zone][pos] += hourly_mwh / 4

                elif granularity == "hourly":
                    pos = hour_offset + (he - he_start)
                    if pos < n:
                        zone_load[zone][pos] += hourly_mwh

                elif granularity == "daily":
                    pos = hour_offset
                    if pos < n:
                        zone_load[zone][pos] += hourly_mwh

                elif granularity == "monthly":
                    label = d.strftime("%b %Y")
                    if label in hours:
                        pos = hours.index(label)
                        zone_load[zone][pos] += hourly_mwh

        if granularity == "fifteen_min":
            hour_offset += (he_end - he_start + 1) * 4
        elif granularity == "hourly":
            hour_offset += he_end - he_start + 1
        elif granularity == "daily":
            hour_offset += 1

        d += timedelta(days=1)

    # ── Step 5: Hedged supply (same as get_position_data) ─────────────────────
    hedge_result = await db.execute(
        text("""
        SELECT zone, location, block_type, volume_mw
        FROM   hedge_book
        WHERE  delivery_start <= :end_date
          AND  delivery_end   >= :start_date
    """),
        {"start_date": from_date, "end_date": through_date},
    )
    hedges = [dict(r) for r in hedge_result.mappings()]

    all_locations = [
        "HB_HOUSTON",
        "HB_NORTH",
        "HB_SOUTH",
        "HB_WEST",
        "LZ_HOUSTON",
        "LZ_NORTH",
        "LZ_SOUTH",
        "LZ_WEST",
    ]

    def hedge_mw_for_location(location, hour_idx):
        he = (hour_idx % 24) + 1
        total = 0.0
        for h in hedges:
            if h.get("location") != location:
                continue
            bt = h["block_type"]
            if bt == "7x24":
                total += float(h["volume_mw"])
            elif bt in ("7x16", "5x16") and 7 <= he <= 22:
                total += float(h["volume_mw"])
            elif bt == "7x8" and (he <= 6 or he >= 23):
                total += float(h["volume_mw"])
        return total

    loc_supply = {
        loc: [hedge_mw_for_location(loc, i) for i in range(n)] for loc in all_locations
    }
    zone_supply = {
        z: [loc_supply[f"HB_{z}"][i] + loc_supply[f"LZ_{z}"][i] for i in range(n)]
        for z in zones
    }
    total_supply = [sum(zone_supply[z][i] for z in zones) for i in range(n)]
    total_load = [sum(zone_load[z][i] for z in zones) for i in range(n)]

    # ── Step 6: Build rows ────────────────────────────────────────────────────
    rows = [
        {
            "name": "Net Position",
            "total": round(sum(total_supply) - sum(total_load), 3),
            "hours": [round(total_supply[i] - total_load[i], 3) for i in range(n)],
            "type": "net",
        },
        {
            "name": "Load (Forecast)",
            "total": round(sum(total_load), 3),
            "hours": [round(v, 3) for v in total_load],
            "type": "header",
        },
        *[
            {
                "name": z,
                "total": round(sum(zone_load[z]), 3),
                "hours": [round(v, 3) for v in zone_load[z]],
                "type": "zone",
            }
            for z in zones
        ],
        {
            "name": "Net Supply",
            "total": round(sum(total_supply), 3),
            "hours": [round(v, 3) for v in total_supply],
            "type": "supply",
        },
        *[
            {
                "name": f"HB_{z} Net Supply",
                "total": round(sum(loc_supply[f"HB_{z}"]), 3),
                "hours": [round(v, 3) for v in loc_supply[f"HB_{z}"]],
                "type": "supply",
            }
            for z in zones
        ],
        *[
            {
                "name": f"LZ_{z} Net Supply",
                "total": round(sum(loc_supply[f"LZ_{z}"]), 3),
                "hours": [round(v, 3) for v in loc_supply[f"LZ_{z}"]],
                "type": "supply",
            }
            for z in zones
        ],
        {
            "name": "Net by Zone",
            "total": round(sum(total_supply) - sum(total_load), 3),
            "hours": [round(total_supply[i] - total_load[i], 3) for i in range(n)],
            "type": "net",
        },
        *[
            {
                "name": f"{z} Net",
                "total": round(sum(zone_supply[z]) - sum(zone_load[z]), 3),
                "hours": [
                    round(zone_supply[z][i] - zone_load[z][i], 3) for i in range(n)
                ],
                "type": "net_zone",
            }
            for z in zones
        ],
    ]

    return {
        "rows": rows,
        "hours": hours,
        "criteria": criteria,
        "zone_annual_mwh": zone_annual_mwh,  # for debug/display
        "active_contracts": len([r for r in contracts if True]),  # count
    }


"""
get_dna_forecast_data
──────────────────────
Add this function to controllers/portfolio.py

DNA Forecast logic:
  1. Get portfolio annual MWh from portfolio_load_annual for forecast year
  2. Get ERCOT annual total from forecast_growth_factors for forecast year
  3. customer_share = portfolio_annual_mwh / ercot_year_total
  4. Get DNA avg_load from forecast_baseline_dna (weather zone/month/dow/hour)
  5. Sum weather zones → load zone
  6. hourly_mwh = dna_avg_load × customer_share
  
  Note: growth is already embedded in customer_share since both numerator
  (portfolio_load_annual) and denominator (ercot year_total) are year-specific
"""

from datetime import date, timedelta
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from utils.zone_mapping import get_weather_zones_for_load, get_load_zones


async def get_dna_forecast_data(criteria: dict, db: AsyncSession) -> dict:
    from_date = criteria.get("from_date", date.today().isoformat())
    through_date = criteria.get("through_date", from_date)
    from_he = int(criteria.get("from_he", 1))
    through_he = int(criteria.get("through_he", 24))
    zones = criteria.get("zones", ["HOUSTON", "NORTH", "SOUTH", "WEST"])
    granularity = criteria.get("granularity", "hourly")

    start = date.fromisoformat(from_date)
    end = date.fromisoformat(through_date)

    # ── Step 1: Build hour labels ─────────────────────────────────────────────
    hours = []
    d = start
    while d <= end:
        he_start = from_he if d == start else 1
        he_end = through_he if d == end else 24

        if granularity == "fifteen_min":
            for he in range(he_start, he_end + 1):
                for q in range(1, 5):
                    hours.append(f"{d.strftime('%m/%d')} HE{str(he).zfill(2)} Q{q}")
        elif granularity == "hourly":
            for he in range(he_start, he_end + 1):
                hours.append(f"{d.strftime('%m/%d')} HE{str(he).zfill(2)}")
        elif granularity == "daily":
            hours.append(d.strftime("%m/%d"))
        elif granularity == "monthly":
            label = d.strftime("%b %Y")
            if label not in hours:
                hours.append(label)
        d += timedelta(days=1)

    n = len(hours)
    zone_load = {z: [0.0] * n for z in zones}

    # ── Step 2: Fetch DNA avg_load for all dates in range ─────────────────────
    # Fetch all 8 weather zones at once
    dna_result = await db.execute(text("""
        SELECT weather_zone, month, day_of_week, hour_ending, avg_load
        FROM   forecast_baseline_dna
        ORDER  BY weather_zone, month, day_of_week, hour_ending
    """))
    dna_rows = dna_result.fetchall()

    # Build lookup: (weather_zone, month, day_of_week, hour_ending) → avg_load
    dna_lookup: dict[tuple, float] = {}
    for row in dna_rows:
        key = (row[0], int(row[1]), int(row[2]), int(row[3]))
        dna_lookup[key] = float(row[4] or 0)

    # ── Step 3: Fetch portfolio annual MWh + ERCOT totals per year ───────────
    # Get all years in the forecast range
    forecast_years = list(set(range(start.year, end.year + 1)))

    # Portfolio annual MWh per year per load zone
    pla_result = await db.execute(
        text("""
        SELECT year, load_zone, annual_mwh
        FROM   portfolio_load_annual
        WHERE  year IN :years
          AND  load_zone IN :zones
    """),
        {"years": tuple(forecast_years), "zones": tuple(zones)},
    )

    portfolio_annual: dict[tuple, float] = {}
    for row in pla_result.fetchall():
        portfolio_annual[(int(row[0]), row[1])] = float(row[2] or 0)

    # ERCOT annual totals per year per load zone (from growth factors)
    gf_result = await db.execute(
        text("""
        SELECT forecast_year, load_zone, year_total
        FROM   forecast_growth_factors
        WHERE  forecast_year IN :years
          AND  load_zone IN :zones
    """),
        {"years": tuple(forecast_years), "zones": tuple(zones)},
    )

    ercot_annual: dict[tuple, float] = {}
    for row in gf_result.fetchall():
        ercot_annual[(int(row[0]), row[1])] = float(row[2] or 0)

    # ── Step 4: Calculate customer_share per year per load zone ──────────────
    # customer_share = portfolio_annual_mwh / ercot_year_total
    customer_share: dict[tuple, float] = {}
    for year in forecast_years:
        for zone in zones:
            portfolio = portfolio_annual.get((year, zone), 0.0)
            ercot = ercot_annual.get((year, zone), 0.0)
            if ercot > 0:
                customer_share[(year, zone)] = portfolio / ercot
            else:
                customer_share[(year, zone)] = 0.0

    # ── Step 5: Apply DNA + customer_share to each hour ──────────────────────
    d = start
    hour_offset = 0

    while d <= end:
        he_start = from_he if d == start else 1
        he_end = through_he if d == end else 24
        month = d.month
        dow = d.weekday()  # 0=Monday, 6=Sunday
        year = d.year

        for zone in zones:
            share = customer_share.get((year, zone), 0.0)
            if share == 0:
                continue

            # Sum weather zones that map to this load zone
            weather_zones = get_weather_zones_for_load(zone)

            for he in range(he_start, he_end + 1):
                # Sum DNA avg_load across all weather zones for this load zone
                dna_total = 0.0
                for wz in weather_zones:
                    dna_key = (wz, month, dow, he)
                    dna_total += dna_lookup.get(dna_key, 0.0)

                hourly_mwh = dna_total * share

                if granularity == "fifteen_min":
                    for q in range(4):
                        pos = hour_offset + (he - he_start) * 4 + q
                        if pos < n:
                            zone_load[zone][pos] += hourly_mwh / 4

                elif granularity == "hourly":
                    pos = hour_offset + (he - he_start)
                    if pos < n:
                        zone_load[zone][pos] += hourly_mwh

                elif granularity == "daily":
                    pos = hour_offset
                    if pos < n:
                        zone_load[zone][pos] += hourly_mwh

                elif granularity == "monthly":
                    label = d.strftime("%b %Y")
                    if label in hours:
                        pos = hours.index(label)
                        zone_load[zone][pos] += hourly_mwh

        if granularity == "fifteen_min":
            hour_offset += (he_end - he_start + 1) * 4
        elif granularity == "hourly":
            hour_offset += he_end - he_start + 1
        elif granularity == "daily":
            hour_offset += 1

        d += timedelta(days=1)

    # ── Step 6: Hedged supply ─────────────────────────────────────────────────
    hedge_result = await db.execute(
        text("""
        SELECT zone, location, block_type, volume_mw
        FROM   hedge_book
        WHERE  delivery_start <= :end_date
          AND  delivery_end   >= :start_date
    """),
        {"start_date": from_date, "end_date": through_date},
    )
    hedges = [dict(r) for r in hedge_result.mappings()]

    all_locations = [
        "HB_HOUSTON",
        "HB_NORTH",
        "HB_SOUTH",
        "HB_WEST",
        "LZ_HOUSTON",
        "LZ_NORTH",
        "LZ_SOUTH",
        "LZ_WEST",
    ]

    def hedge_mw_for_location(location, hour_idx):
        he = (hour_idx % 24) + 1
        total = 0.0
        for h in hedges:
            if h.get("location") != location:
                continue
            bt = h["block_type"]
            if bt == "7x24":
                total += float(h["volume_mw"])
            elif bt in ("7x16", "5x16") and 7 <= he <= 22:
                total += float(h["volume_mw"])
            elif bt == "7x8" and (he <= 6 or he >= 23):
                total += float(h["volume_mw"])
        return total

    loc_supply = {
        loc: [hedge_mw_for_location(loc, i) for i in range(n)] for loc in all_locations
    }
    zone_supply = {
        z: [loc_supply[f"HB_{z}"][i] + loc_supply[f"LZ_{z}"][i] for i in range(n)]
        for z in zones
    }
    total_supply = [sum(zone_supply[z][i] for z in zones) for i in range(n)]
    total_load = [sum(zone_load[z][i] for z in zones) for i in range(n)]

    # ── Step 7: Build rows ────────────────────────────────────────────────────
    rows = [
        {
            "name": "Net Position",
            "total": round(sum(total_supply) - sum(total_load), 3),
            "hours": [round(total_supply[i] - total_load[i], 3) for i in range(n)],
            "type": "net",
        },
        {
            "name": "Load (DNA Forecast)",
            "total": round(sum(total_load), 3),
            "hours": [round(v, 3) for v in total_load],
            "type": "header",
        },
        *[
            {
                "name": z,
                "total": round(sum(zone_load[z]), 3),
                "hours": [round(v, 3) for v in zone_load[z]],
                "type": "zone",
            }
            for z in zones
        ],
        {
            "name": "Net Supply",
            "total": round(sum(total_supply), 3),
            "hours": [round(v, 3) for v in total_supply],
            "type": "supply",
        },
        *[
            {
                "name": f"HB_{z} Net Supply",
                "total": round(sum(loc_supply[f"HB_{z}"]), 3),
                "hours": [round(v, 3) for v in loc_supply[f"HB_{z}"]],
                "type": "supply",
            }
            for z in zones
        ],
        *[
            {
                "name": f"LZ_{z} Net Supply",
                "total": round(sum(loc_supply[f"LZ_{z}"]), 3),
                "hours": [round(v, 3) for v in loc_supply[f"LZ_{z}"]],
                "type": "supply",
            }
            for z in zones
        ],
        {
            "name": "Net by Zone",
            "total": round(sum(total_supply) - sum(total_load), 3),
            "hours": [round(total_supply[i] - total_load[i], 3) for i in range(n)],
            "type": "net",
        },
        *[
            {
                "name": f"{z} Net",
                "total": round(sum(zone_supply[z]) - sum(zone_load[z]), 3),
                "hours": [
                    round(zone_supply[z][i] - zone_load[z][i], 3) for i in range(n)
                ],
                "type": "net_zone",
            }
            for z in zones
        ],
    ]

    return {
        "rows": rows,
        "hours": hours,
        "criteria": criteria,
        "customer_share": {
            f"{y}_{z}": round(v, 6) for (y, z), v in customer_share.items()
        },
        "zone_annual_mwh": {
            z: portfolio_annual.get((start.year, z), 0.0) for z in zones
        },
    }
