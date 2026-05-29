"""
ERCOT One-Day Load Forecast
Uses historical patterns + today's weather to predict hourly load
Compare against ERCOT actual to measure accuracy

Run: python forecast_today.py
"""

import os
import asyncio
from datetime import date
from dotenv import load_dotenv
import aiomysql

load_dotenv()

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "u972964962_orbic")
DB_PORT = int(os.getenv("DB_PORT", "3306"))

# ── Today's date and weather ───────────────────────────────────────────────────
FORECAST_DATE = date(2026, 4, 16)  # Thursday


# Today's hourly temps per zone (°F) — from weather search
# Approximated as sine curve between low and high
# Low at HE05, High at HE15, interpolated for all 24 hours
def hourly_temps(low_f, high_f):
    """Generate 24 hourly temps from low/high using sine curve."""
    import math

    temps = []
    for h in range(1, 25):
        # Low at hour 5, High at hour 15
        angle = math.pi * (h - 5) / 10
        if 5 <= h <= 15:
            t = low_f + (high_f - low_f) * math.sin(angle)
        elif h < 5:
            t = low_f + (high_f - low_f) * 0.1 * (h / 5)
        else:
            t = low_f + (high_f - low_f) * max(0, 1 - (h - 15) / 9)
        temps.append(round(t, 1))
    return temps


# Today's temps by zone (low, high) in °F
TODAY_TEMPS = {
    "COAST": hourly_temps(72, 84),
    "NCENT": hourly_temps(56, 84),
    "NORTH": hourly_temps(55, 80),
    "SOUTH": hourly_temps(62, 82),
    "SCENT": hourly_temps(60, 82),
    "EAST": hourly_temps(60, 81),
    "FWEST": hourly_temps(55, 78),
    "WEST": hourly_temps(57, 80),
}

# Growth factor — 2026 vs our 2015-2021 baseline
# ERCOT grew ~4-5% from 2022-2026, apply per zone
# NCENT/NORTH highest (data centers), others moderate
GROWTH_FACTORS = {
    "COAST": 1.18,  # +18% since baseline
    "NCENT": 1.32,  # +32% data center heavy DFW
    "NORTH": 1.28,  # +28% DFW spillover
    "SOUTH": 1.15,  # +15%
    "SCENT": 1.20,  # +20% Austin tech growth
    "EAST": 1.10,  # +10% slower growth
    "FWEST": 1.12,  # +12% oil & gas
    "WEST": 1.10,  # +10%
}

ZONES = ["COAST", "EAST", "FWEST", "NORTH", "NCENT", "SOUTH", "SCENT", "WEST"]

WEEKDAY_NAMES = {0: "Mon", 1: "Tue", 2: "Wed", 3: "Thu", 4: "Fri", 5: "Sat", 6: "Sun"}


async def main():
    conn = await aiomysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        db=DB_NAME,
        autocommit=False,
    )

    # Determine day type
    day_type = WEEKDAY_NAMES[FORECAST_DATE.weekday()]  # Friday

    # Check if holiday
    async with conn.cursor() as cur:
        await cur.execute(
            """
            SELECT holiday_type FROM ercot_holidays
            WHERE observed_date = %s
        """,
            (FORECAST_DATE,),
        )
        hrow = await cur.fetchone()
    if hrow:
        day_type = f"Holiday_{hrow[0].capitalize()}"

    print(f"\n{'='*70}")
    print(f"  ERCOT Load Forecast — {FORECAST_DATE} ({day_type})")
    print(f"{'='*70}")
    print(f"\n  Method: Historical Pattern + Weather Adjustment + Growth Factor")
    print(f"  Day type: {day_type} | Month: {FORECAST_DATE.month} (April)")

    # Pull patterns for this day type + month
    async with conn.cursor() as cur:
        await cur.execute(
            """
            SELECT zone, hour_ending, avg_mw, std_dev_mw,
                   temp_coeff, base_temp_f, p10_mw, p50_mw, p90_mw
            FROM ercot_load_patterns
            WHERE month_num = %s AND day_type = %s
            ORDER BY zone, hour_ending
        """,
            (FORECAST_DATE.month, day_type),
        )
        patterns = await cur.fetchall()

    # Organize patterns
    pat = {}
    for row in patterns:
        zone = row[0]
        hour = row[1]
        if zone not in pat:
            pat[zone] = {}
        pat[zone][hour] = {
            "avg": float(row[2]) if row[2] else 0,
            "std": float(row[3]) if row[3] else 0,
            "temp_coeff": float(row[4]) if row[4] else 0,
            "base_temp": float(row[5]) if row[5] else 65,
            "p10": float(row[6]) if row[6] else 0,
            "p50": float(row[7]) if row[7] else 0,
            "p90": float(row[8]) if row[8] else 0,
        }

    # Generate forecast
    results = {}
    for zone in ZONES:
        results[zone] = {}
        temps = TODAY_TEMPS.get(zone, [65] * 24)
        growth = GROWTH_FACTORS.get(zone, 1.15)

        for hour in range(1, 25):
            if zone not in pat or hour not in pat[zone]:
                continue

            p = pat[zone][hour]
            today_temp = temps[hour - 1]

            # Step 1: baseline from historical pattern
            baseline = p["avg"]

            # Step 2: weather adjustment
            temp_delta = today_temp - p["base_temp"]
            weather_adj = p["temp_coeff"] * temp_delta

            # Step 3: adjusted load
            adjusted = baseline + weather_adj

            # Step 4: apply growth factor
            forecast = adjusted * growth

            # Step 5: uncertainty bands
            low = p["p10"] * growth
            high = p["p90"] * growth

            results[zone][hour] = {
                "baseline": round(baseline, 0),
                "weather_adj": round(weather_adj, 0),
                "adjusted": round(adjusted, 0),
                "forecast": round(forecast, 0),
                "low": round(low, 0),
                "high": round(high, 0),
                "temp_f": today_temp,
            }

    # Print results
    print(f"\n{'─'*70}")
    print(
        f"  {'Zone':<8} {'HE':<4} {'Temp°F':<8} {'Baseline':>10} "
        f"{'Wx Adj':>8} {'Forecast':>10} {'Low':>8} {'High':>8}"
    )
    print(f"{'─'*70}")

    # Show key hours: peak morning (HE08), midday (HE13), afternoon (HE17)
    key_hours = [1, 6, 8, 10, 13, 15, 17, 19, 21, 24]

    for zone in ZONES:
        if zone not in results:
            continue
        for hour in key_hours:
            if hour not in results[zone]:
                continue
            r = results[zone][hour]
            print(
                f"  {zone:<8} {hour:<4} {r['temp_f']:<8} "
                f"{r['baseline']:>10,.0f} "
                f"{r['weather_adj']:>+8,.0f} "
                f"{r['forecast']:>10,.0f} "
                f"{r['low']:>8,.0f} "
                f"{r['high']:>8,.0f}"
            )
        print()

    # ERCOT total forecast by hour
    print(f"\n{'─'*70}")
    print(f"  ERCOT TOTAL FORECAST — April 16, 2026")
    print(f"{'─'*70}")
    print(f"  {'HE':<4} {'Forecast MW':>12} {'Low MW':>10} {'High MW':>10}")
    print(f"  {'─'*40}")

    daily_total = 0
    peak_hour = 0
    peak_mw = 0

    for hour in range(1, 25):
        total = sum(
            results[z][hour]["forecast"] for z in ZONES if hour in results.get(z, {})
        )
        low_tot = sum(
            results[z][hour]["low"] for z in ZONES if hour in results.get(z, {})
        )
        high_tot = sum(
            results[z][hour]["high"] for z in ZONES if hour in results.get(z, {})
        )

        daily_total += total
        if total > peak_mw:
            peak_mw = total
            peak_hour = hour

        print(f"  {hour:<4} {total:>12,.0f} {low_tot:>10,.0f} {high_tot:>10,.0f}")

    print(f"\n  Peak Hour    : HE{peak_hour:02d} = {peak_mw:,.0f} MW")
    print(f"  Daily Energy : {daily_total/1000:,.1f} GWh")
    print(f"\n  Growth factors applied: NCENT +32%, COAST +18%, SCENT +20%")
    print(f"  Weather: April shoulder season — minimal AC/heating load")
    print(f"\n  Next step: Compare against ERCOT actual for Apr 17, 2026")
    print(f"  Pull from: ercot.com/gridinfo/load (today's hourly report)")
    print(f"{'='*70}\n")

    conn.close()


if __name__ == "__main__":
    asyncio.run(main())
