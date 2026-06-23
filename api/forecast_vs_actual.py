"""
ERCOT Forecast vs Actual Comparison
Generates forecast for any historical date and compares against actual
stored in ercot_load_history table

Run: python forecast_vs_actual.py
"""

import argparse
import os
import asyncio
import math
from datetime import date, timedelta
from dotenv import load_dotenv
import aiomysql

load_dotenv()

DB_HOST     = os.getenv("DB_HOST", "localhost")
DB_USER     = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME     = os.getenv("DB_NAME")
DB_PORT     = int(os.getenv("DB_PORT", "3306"))
if not DB_NAME:
    raise SystemExit("ERROR: DB_NAME environment variable is not set. Set it before running this script.")

ZONES = ["COAST", "EAST", "FWEST", "NORTH", "NCENT", "SOUTH", "SCENT", "WEST"]

WEEKDAY_NAMES = {0:"Mon",1:"Tue",2:"Wed",3:"Thu",4:"Fri",5:"Sat",6:"Sun"}

# Growth factors — split by hour type to account for data center flat load
GROWTH_FACTORS = {
    "COAST": {"overnight": 1.35, "daytime": 1.18, "evening": 1.22},
    "NCENT": {"overnight": 1.55, "daytime": 1.32, "evening": 1.38},
    "NORTH": {"overnight": 1.50, "daytime": 1.28, "evening": 1.32},
    "SOUTH": {"overnight": 1.25, "daytime": 1.15, "evening": 1.18},
    "SCENT": {"overnight": 1.35, "daytime": 1.20, "evening": 1.25},
    "EAST" : {"overnight": 1.20, "daytime": 1.10, "evening": 1.12},
    "FWEST": {"overnight": 1.22, "daytime": 1.12, "evening": 1.15},
    "WEST" : {"overnight": 1.20, "daytime": 1.10, "evening": 1.12},
}

def get_growth(zone, hour):
    g = GROWTH_FACTORS.get(zone, {"overnight":1.20,"daytime":1.15,"evening":1.18})
    if hour <= 6:
        return g["overnight"]
    elif hour <= 22:
        return g["daytime"]
    else:
        return g["evening"]

async def main(forecast_date: date):
    conn = await aiomysql.connect(
        host=DB_HOST, port=DB_PORT,
        user=DB_USER, password=DB_PASSWORD,
        db=DB_NAME, autocommit=False
    )

    # ── Guard: check requested date is within loaded data range ───────────────
    async with conn.cursor() as cur:
        await cur.execute("SELECT MAX(oper_date) FROM ercot_load_history")
        max_date = (await cur.fetchone())[0]
    if max_date is None or forecast_date > max_date:
        print(f"\n  ⚠️  No data found for {forecast_date}.")
        print(f"  Latest available date in ercot_load_history is {max_date}.")
        print(f"  Run ingest_ercot_settlement.py to bring data current.")
        conn.close()
        return

    # ── Day type ───────────────────────────────────────────────────────────────
    day_type = WEEKDAY_NAMES[forecast_date.weekday()]

    async with conn.cursor() as cur:
        await cur.execute("""
            SELECT holiday_type FROM ercot_holidays
            WHERE observed_date = %s
        """, (forecast_date,))
        hrow = await cur.fetchone()
    if hrow:
        day_type = f"Holiday_{hrow[0].capitalize()}"

    print(f"\n{'='*75}")
    print(f"  Forecast vs Actual — {forecast_date} ({day_type})")
    print(f"{'='*75}")

    # ── Pull patterns ──────────────────────────────────────────────────────────
    async with conn.cursor() as cur:
        await cur.execute("""
            SELECT zone, hour_ending, avg_mw, temp_coeff, base_temp_f,
                   p10_mw, p50_mw, p90_mw
            FROM ercot_load_patterns
            WHERE month_num = %s AND day_type = %s
            ORDER BY zone, hour_ending
        """, (forecast_date.month, day_type))
        patterns = await cur.fetchall()

    pat = {}
    for row in patterns:
        z, h = row[0], row[1]
        if z not in pat:
            pat[z] = {}
        pat[z][h] = {
            "avg"       : float(row[2]) if row[2] else 0,
            "temp_coeff": float(row[3]) if row[3] else 0,
            "base_temp" : float(row[4]) if row[4] else 65,
            "p10"       : float(row[5]) if row[5] else 0,
            "p50"       : float(row[6]) if row[6] else 0,
            "p90"       : float(row[7]) if row[7] else 0,
        }

    # ── Pull actual weather for this date ─────────────────────────────────────
    async with conn.cursor() as cur:
        await cur.execute("""
            SELECT zone, hour_ending, temperature
            FROM weather_history
            WHERE weather_date = %s
            ORDER BY zone, hour_ending
        """, (forecast_date,))
        wrows = await cur.fetchall()

    weather = {}
    for row in wrows:
        z, h, t = row[0], row[1], row[2]
        if z not in weather:
            weather[z] = {}
        weather[z][h] = float(t) if t else 65.0

    # ── Pull actual load ───────────────────────────────────────────────────────
    async with conn.cursor() as cur:
        await cur.execute("""
            SELECT hour_ending,
                   coast, east, far_west, north,
                   north_central, south_central, southern, west,
                   ercot_total
            FROM ercot_load_history
            WHERE oper_date = %s
            ORDER BY hour_ending
        """, (forecast_date,))
        actuals = await cur.fetchall()

    actual_data = {}
    for row in actuals:
        h = row[1]  # hour_ending
        actual_data[row[0]] = {
            "COAST": float(row[1]) if row[1] else 0,
            "EAST" : float(row[2]) if row[2] else 0,
            "FWEST": float(row[3]) if row[3] else 0,
            "NORTH": float(row[4]) if row[4] else 0,
            "NCENT": float(row[5]) if row[5] else 0,
            "SCENT": float(row[6]) if row[6] else 0,
            "SOUTH": float(row[7]) if row[7] else 0,
            "WEST" : float(row[8]) if row[8] else 0,
            "TOTAL": float(row[9]) if row[9] else 0,
        }

    # Fix — re-read correctly
    actual_data = {}
    for row in actuals:
        hour = row[0]
        actual_data[hour] = {
            "COAST": float(row[1]) if row[1] else 0,
            "EAST" : float(row[2]) if row[2] else 0,
            "FWEST": float(row[3]) if row[3] else 0,
            "NORTH": float(row[4]) if row[4] else 0,
            "NCENT": float(row[5]) if row[5] else 0,
            "SCENT": float(row[6]) if row[6] else 0,
            "SOUTH": float(row[7]) if row[7] else 0,
            "WEST" : float(row[8]) if row[8] else 0,
            "TOTAL": float(row[9]) if row[9] else 0,
        }

    if not actual_data:
        print(f"\n  ⚠️  No actual data found for {forecast_date} in ercot_load_history")
        print(f"  Latest available date in ercot_load_history is {max_date}.")
        print(f"  Run ingest_ercot_settlement.py to bring data current.")
        conn.close()
        return

    # ── Generate forecast ──────────────────────────────────────────────────────
    forecast = {}
    for zone in ZONES:
        forecast[zone] = {}
        for hour in range(1, 25):
            if zone not in pat or hour not in pat[zone]:
                continue
            p = pat[zone][hour]
            temp = weather.get(zone, {}).get(hour, p["base_temp"])
            growth = get_growth(zone, hour)

            baseline    = p["avg"]
            weather_adj = p["temp_coeff"] * (temp - p["base_temp"])
            adjusted    = baseline + weather_adj
            fcst        = adjusted * growth

            forecast[zone][hour] = {
                "forecast": round(fcst, 0),
                "low"     : round(p["p10"] * growth, 0),
                "high"    : round(p["p90"] * growth, 0),
                "temp"    : round(temp, 1),
            }

    # ── Print comparison ───────────────────────────────────────────────────────
    print(f"\n  {'HE':<4} {'Forecast':>10} {'Actual':>10} "
          f"{'Diff':>8} {'Error%':>8}  {'In Band?'}")
    print(f"  {'─'*60}")

    errors = []
    in_band_count = 0

    for hour in range(1, 25):
        fcst_total   = sum(forecast[z][hour]["forecast"]
                          for z in ZONES if hour in forecast.get(z, {}))
        low_total    = sum(forecast[z][hour]["low"]
                          for z in ZONES if hour in forecast.get(z, {}))
        high_total   = sum(forecast[z][hour]["high"]
                          for z in ZONES if hour in forecast.get(z, {}))
        actual_total = actual_data.get(hour, {}).get("TOTAL", 0)

        if actual_total == 0:
            continue

        diff  = fcst_total - actual_total
        pct   = diff / actual_total * 100
        errors.append(abs(pct))

        in_band = low_total <= actual_total <= high_total
        if in_band:
            in_band_count += 1
        band_str = "✅" if in_band else "❌"

        flag = " <<<" if abs(pct) > 10 else ""
        print(f"  {hour:<4} {fcst_total:>10,.0f} {actual_total:>10,.0f} "
              f"{diff:>+8,.0f} {pct:>+7.1f}%  {band_str}{flag}")

    print(f"  {'─'*60}")

    if errors:
        avg_err  = sum(errors) / len(errors)
        max_err  = max(errors)
        under_5  = sum(1 for e in errors if e < 5)
        under_10 = sum(1 for e in errors if e < 10)

        print(f"\n  📊 Accuracy Summary:")
        print(f"     Avg absolute error : {avg_err:.1f}%")
        print(f"     Max error          : {max_err:.1f}%")
        print(f"     Hours within 5%    : {under_5}/24")
        print(f"     Hours within 10%   : {under_10}/24")
        print(f"     Actual in P10-P90  : {in_band_count}/24 hours")

        if avg_err < 5:
            print(f"\n  🎯 Excellent forecast — better than ERCOT's own MTLF")
        elif avg_err < 10:
            print(f"\n  ✅ Good forecast — competitive with industry standard")
        elif avg_err < 15:
            print(f"\n  ⚠️  Fair forecast — growth factors need calibration")
        else:
            print(f"\n  ❌ Needs work — systematic bias detected")

    print(f"\n{'='*75}\n")
    conn.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Compare ERCOT load forecast vs actual for a given date.")
    parser.add_argument("--date", help="Date to evaluate (YYYY-MM-DD). Default: yesterday.")
    args = parser.parse_args()

    forecast_date = date.fromisoformat(args.date) if args.date else date.today() - timedelta(days=1)

    asyncio.run(main(forecast_date))
