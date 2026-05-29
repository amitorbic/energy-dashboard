"""
ERCOT Analog Day Forecast
Base: Apr 9, 2026 actual
Method: Find weather-similar Thursdays in last 12 months
        Calculate swing from those analog days
        Apply swing to Apr 9 actual → Apr 16 forecast

Run: python forecast_analog.py
"""

import os
import asyncio
from datetime import date, timedelta
from dotenv import load_dotenv
import aiomysql
import urllib.request
import json


load_dotenv()

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "u972964962_orbic")
DB_PORT = int(os.getenv("DB_PORT", "3306"))

# ── Inputs ─────────────────────────────────────────────────────────────────────
BASE_DATE = date(2026, 4, 9)  # last Thursday — our anchor
FORECAST_DATE = date(2026, 4, 16)  # Thursday we want to forecast

ZONES = ["COAST", "EAST", "FWEST", "NORTH", "NCENT", "SOUTH", "SCENT", "WEST"]

# How many analog days to use
TOP_N_ANALOGS = 5

# Search window — last 12 months from forecast date
LOOKBACK_DAYS = 365

# Temperature similarity threshold — within X degrees F avg across zones
TEMP_THRESHOLD = 5.0

# ── Apr 9 actual (pasted directly) ────────────────────────────────────────────
APR9_ACTUAL = {
    1: 46245.16,
    2: 44408.78,
    3: 43215.49,
    4: 42604.69,
    5: 42873.62,
    6: 44456.78,
    7: 47184.58,
    8: 48354.37,
    9: 48982.06,
    10: 49783.92,
    11: 51096.68,
    12: 52371.43,
    13: 53732.34,
    14: 55346.00,
    15: 56590.24,
    16: 57857.90,
    17: 58861.09,
    18: 58825.25,
    19: 57612.54,
    20: 56077.01,
    21: 55354.09,
    22: 54361.22,
    23: 51891.93,
    24: 49477.23,
}


async def main():
    conn = await aiomysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        db=DB_NAME,
        autocommit=False,
    )
    print(f"\n{'='*70}")
    print(f"  Analog Day Forecast — {FORECAST_DATE} (Thursday)")
    print(f"  Base: {BASE_DATE} actual | Lookback: {LOOKBACK_DAYS} days")
    print(f"{'='*70}")

    # ── Step 1: Get Apr 16 weather per zone per hour ───────────────────────────
    ZONE_COORDS = {
        "COAST": (29.9902, -95.3368),
        "NCENT": (32.8998, -97.0403),
        "NORTH": (33.9822, -98.4918),
        "SOUTH": (29.5337, -98.4698),
        "SCENT": (30.1945, -97.6699),
        "EAST": (32.3541, -95.4024),
        "FWEST": (31.9425, -102.2019),
        "WEST": (32.4113, -99.6819),
    }

    apr16_weather = {}
    for zone, (lat, lon) in ZONE_COORDS.items():
        url = (
            f"https://archive-api.open-meteo.com/v1/archive"
            f"?latitude={lat}&longitude={lon}"
            f"&hourly=temperature_2m"
            f"&temperature_unit=fahrenheit"
            f"&timezone=America%2FChicago"
            f"&start_date=2026-04-16&end_date=2026-04-16"
        )
        with urllib.request.urlopen(url, timeout=15) as r:
            data = json.loads(r.read())
        temps = data["hourly"]["temperature_2m"]
        apr16_weather[zone] = {h + 1: float(temps[h]) for h in range(24)}

    # Apr 16 avg temp per zone (daily average)
    apr16_avg_temp = {z: sum(apr16_weather[z].values()) / 24 for z in apr16_weather}
    print(f"\n  Apr 16 Avg Temps by Zone:")
    for z, t in apr16_avg_temp.items():
        print(f"    {z:<8} {t:.1f}°F")

    # ── Step 2: Find analog days ───────────────────────────────────────────────
    # Search: Thursdays in last 12 months with similar weather to Apr 16
    search_start = FORECAST_DATE - timedelta(days=LOOKBACK_DAYS)
    search_end = FORECAST_DATE - timedelta(days=7)  # exclude last week

    async with conn.cursor() as cur:
        await cur.execute(
            """
            SELECT DISTINCT weather_date
            FROM weather_history
            WHERE weather_date BETWEEN %s AND %s
              AND DAYOFWEEK(weather_date) = 5  -- Thursday = 5
            ORDER BY weather_date DESC
        """,
            (search_start, search_end),
        )
        thursday_dates = [row[0] for row in await cur.fetchall()]

    print(f"\n  Found {len(thursday_dates)} Thursdays in lookback window")

    # Get avg daily temp per zone for each Thursday
    analog_candidates = []

    for d in thursday_dates:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                SELECT zone, AVG(temperature) as avg_temp
                FROM weather_history
                WHERE weather_date = %s
                GROUP BY zone
            """,
                (d,),
            )
            trows = await cur.fetchall()

        day_temps = {row[0]: float(row[1]) for row in trows if row[1]}

        # Calculate temperature similarity score
        # Sum of absolute differences across all zones
        temp_diff = 0
        zone_count = 0
        for z in ZONES:
            if z in day_temps and z in apr16_avg_temp:
                temp_diff += abs(day_temps[z] - apr16_avg_temp[z])
                zone_count += 1

        if zone_count == 0:
            continue

        avg_diff = temp_diff / zone_count

        # Only consider days within threshold
        if avg_diff <= TEMP_THRESHOLD * 2:  # relaxed threshold to get enough analogs
            analog_candidates.append(
                {"date": d, "temp_diff": avg_diff, "temps": day_temps}
            )

    # Sort by temperature similarity
    analog_candidates.sort(key=lambda x: x["temp_diff"])
    top_analogs = analog_candidates[:TOP_N_ANALOGS]

    print(f"\n  Top {len(top_analogs)} Analog Days (closest weather to Apr 16):")
    print(f"  {'Date':<14} {'Temp Diff':>10} {'Avg Temp NCENT':>15}")
    print(f"  {'─'*45}")
    for a in top_analogs:
        ncent_temp = a["temps"].get("NCENT", 0)
        print(f"  {str(a['date']):<14} {a['temp_diff']:>9.2f}°F {ncent_temp:>14.1f}°F")

    if not top_analogs:
        print("  ⚠️  No analog days found — widening search")
        top_analogs = analog_candidates[:5] if analog_candidates else []

    # ── Step 3: Get actual load for each analog day ────────────────────────────
    # Also get load for BASE_DATE week (to calculate swing)
    # Swing = analog_actual[h] / base_week_actual[h]
    # We use Apr 9 actual as base

    print(f"\n  Calculating swings vs Apr 9 base...")

    analog_swings = {}  # hour → list of swings

    for analog in top_analogs:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                SELECT hour_ending, ercot_total
                FROM ercot_load_history
                WHERE oper_date = %s
                ORDER BY hour_ending
            """,
                (analog["date"],),
            )
            lrows = await cur.fetchall()

        if not lrows:
            print(f"    No load data for {analog['date']} — skipping")
            continue

        analog_load = {row[0]: float(row[1]) for row in lrows}

        print(f"    {analog['date']} — {len(lrows)} hours loaded")

        for hour in range(1, 25):
            if hour not in analog_load or hour not in APR9_ACTUAL:
                continue
            base = APR9_ACTUAL[hour]
            analog_val = analog_load[hour]

            if base > 0:
                swing = analog_val / base
                if hour not in analog_swings:
                    analog_swings[hour] = []
                analog_swings[hour].append(swing)

    # ── Step 4: Apply average swing to Apr 9 actual ────────────────────────────
    print(f"\n{'─'*70}")
    print(
        f"  {'HE':<4} {'Apr9 Base':>10} {'Avg Swing':>10} "
        f"{'Apr16 Fcst':>12} {'LFC Ref':>10} {'Diff%':>8}"
    )
    print(f"  {'─'*60}")

    # Apr 16 LFC for reference
    apr16_lfc = {
        1: 49075.94,
        2: 47133.88,
        3: 45950.83,
        4: 45246.50,
        5: 45315.94,
        6: 46631.97,
        7: 49142.07,
        8: 50315.47,
        9: 51585.29,
        10: 53556.53,
        11: 55627.23,
        12: 57777.45,
        13: 59841.58,
        14: 61925.58,
        15: 63362.02,
        16: 64788.60,
        17: 65785.64,
        18: 65771.61,
        19: 64196.61,
        20: 62285.01,
        21: 61652.68,
        22: 59985.32,
        23: 57142.09,
        24: 53793.26,
    }

    our_forecast = {}
    peak_mw = 0
    peak_hour = 0

    for hour in range(1, 25):
        base = APR9_ACTUAL[hour]

        if hour in analog_swings and analog_swings[hour]:
            avg_swing = sum(analog_swings[hour]) / len(analog_swings[hour])
        else:
            avg_swing = 1.0  # no analog — use base as-is

        forecast = base * avg_swing
        our_forecast[hour] = round(forecast, 0)

        lfc = apr16_lfc.get(hour, 0)
        diff_pct = (forecast - lfc) / lfc * 100 if lfc > 0 else 0

        if forecast > peak_mw:
            peak_mw = forecast
            peak_hour = hour

        print(
            f"  {hour:<4} {base:>10,.0f} {avg_swing:>10.4f} "
            f"{forecast:>12,.0f} {lfc:>10,.0f} {diff_pct:>+7.1f}%"
        )

    daily_gwh = sum(our_forecast.values()) / 1000

    print(f"\n  Peak Hour    : HE{peak_hour:02d} = {peak_mw:,.0f} MW")
    print(f"  Daily Energy : {daily_gwh:,.1f} GWh")
    print(
        f"\n  Analog days used: {len([a for a in top_analogs if any(h in analog_swings for h in range(1,25))])}"
    )
    print(f"  Compare against Apr 16 actual when available")
    print(f"{'='*70}\n")

    conn.close()


if __name__ == "__main__":
    asyncio.run(main())
