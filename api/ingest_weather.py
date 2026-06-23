"""
Weather History Ingestion Script
Pulls hourly temperature data from Open-Meteo (free, no API key, no VPN)
for all 8 ERCOT weather zones going back to 2011
Loads into: weather_history table

Run: python ingest_weather.py
"""

import os
import asyncio
import aiohttp
import aiomysql
from datetime import date, timedelta
from dotenv import load_dotenv

load_dotenv()

# ── Config ────────────────────────────────────────────────────────────────────
DB_HOST     = os.getenv("DB_HOST", "localhost")
DB_USER     = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME     = os.getenv("DB_NAME")
DB_PORT     = int(os.getenv("DB_PORT", "3306"))
if not DB_NAME:
    raise SystemExit("ERROR: DB_NAME environment variable is not set. Set it before running this script.")

START_DATE  = date(2011, 1, 1)
END_DATE    = date.today()

# ERCOT zones → nearest representative weather station coordinates
ZONES = {
    "COAST"  : {"lat": 29.9902, "lon": -95.3368},  # Houston Hobby (KHOU)
    "NCENT"  : {"lat": 32.8998, "lon": -97.0403},  # Dallas Fort Worth (KDFW)
    "NORTH"  : {"lat": 33.9822, "lon": -98.4918},  # Wichita Falls (KSPS)
    "SOUTH"  : {"lat": 29.5337, "lon": -98.4698},  # San Antonio (KSAT)
    "SCENT"  : {"lat": 30.1945, "lon": -97.6699},  # Austin Bergstrom (KAUS)
    "EAST"   : {"lat": 32.3541, "lon": -95.4024},  # Tyler (KTYR)
    "FWEST"  : {"lat": 31.9425, "lon": -102.2019}, # Midland (KMAF)
    "WEST"   : {"lat": 32.4113, "lon": -99.6819},  # Abilene (KABI)
}

BATCH_SIZE = 500

# ── Open-Meteo API ─────────────────────────────────────────────────────────────
BASE_URL = "https://archive-api.open-meteo.com/v1/archive"

async def fetch_weather(session, zone: str, lat: float, lon: float,
                        start: date, end: date):
    """Fetch hourly weather from Open-Meteo for one zone and date range."""
    params = {
        "latitude"        : lat,
        "longitude"       : lon,
        "start_date"      : start.isoformat(),
        "end_date"        : end.isoformat(),
        "hourly"          : "temperature_2m,relative_humidity_2m,wind_speed_10m,cloud_cover",
        "temperature_unit": "fahrenheit",
        "wind_speed_unit" : "mph",
        "timezone"        : "America/Chicago",
    }
    async with session.get(BASE_URL, params=params, timeout=aiohttp.ClientTimeout(total=60)) as resp:
        if resp.status != 200:
            text = await resp.text()
            raise Exception(f"HTTP {resp.status}: {text[:200]}")
        return await resp.json()

def parse_weather_rows(zone: str, data: dict):
    """Convert Open-Meteo response to list of row tuples."""
    rows = []
    hourly = data.get("hourly", {})
    times  = hourly.get("time", [])
    temps  = hourly.get("temperature_2m", [])
    humid  = hourly.get("relative_humidity_2m", [])
    wind   = hourly.get("wind_speed_10m", [])
    cloud  = hourly.get("cloud_cover", [])

    for i, ts in enumerate(times):
        try:
            # ts format: "2011-01-01T00:00" — hour 0-23, convert to 1-24
            dt          = ts[:10]          # "2011-01-01"
            hour_str    = ts[11:13]        # "00"
            hour_ending = int(hour_str) + 1  # 0→1, 23→24

            weather_date = date.fromisoformat(dt)

            def safe(lst, idx):
                try:
                    v = lst[idx]
                    return float(v) if v is not None else None
                except (IndexError, TypeError, ValueError):
                    return None

            rows.append((
                weather_date,
                hour_ending,
                zone,
                safe(temps, i),
                safe(humid, i),
                safe(wind,  i),
                safe(cloud, i),
            ))
        except Exception:
            pass

    return rows

# ── DB insert ──────────────────────────────────────────────────────────────────
INSERT_SQL = """
    INSERT IGNORE INTO weather_history
        (weather_date, hour_ending, zone,
         temperature, humidity, wind_speed, cloud_cover)
    VALUES (%s,%s,%s,%s,%s,%s,%s)
"""

async def insert_batch(conn, rows):
    async with conn.cursor() as cur:
        await cur.executemany(INSERT_SQL, rows)
    await conn.commit()

# ── Main ───────────────────────────────────────────────────────────────────────
# Open-Meteo free tier has limits — fetch one year at a time per zone
async def main():
    conn = await aiomysql.connect(
        host=DB_HOST, port=DB_PORT,
        user=DB_USER, password=DB_PASSWORD,
        db=DB_NAME, autocommit=False
    )
    print(f"Connected to {DB_NAME}")

    total_rows = 0
    errors     = 0

    async with aiohttp.ClientSession() as session:
        for zone, coords in ZONES.items():
            print(f"\n── Zone: {zone} ({coords['lat']}, {coords['lon']}) ──")
            year = START_DATE.year

            while year <= END_DATE.year:
                yr_start = date(year, 1, 1)
                yr_end   = min(date(year, 12, 31), END_DATE)

                try:
                    data = await fetch_weather(
                        session, zone,
                        coords["lat"], coords["lon"],
                        yr_start, yr_end
                    )
                    rows = parse_weather_rows(zone, data)

                    for b in range(0, len(rows), BATCH_SIZE):
                        await insert_batch(conn, rows[b:b + BATCH_SIZE])

                    total_rows += len(rows)
                    print(f"  {year}: {len(rows):,} rows")

                except Exception as e:
                    print(f"  {year} ERROR: {e}")
                    errors += 1

                year += 1
                await asyncio.sleep(0.5)  # be polite to free API

    conn.close()

    print("\n── Done ─────────────────────────────────────────")
    print(f"  Total rows : {total_rows:,}")
    print(f"  Errors     : {errors}")

if __name__ == "__main__":
    asyncio.run(main())
