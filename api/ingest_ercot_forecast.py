"""
ingest_ercot_forecast.py
─────────────────────────
Loads ERCOT 20-25 year hourly forecast CSVs into:
  ercot_forecast_weatherzone  (8 weather zones)
  ercot_forecast_loadzone     (4 load zones)

Expected CSV formats:

Weather Zone file:
  date, year, month, day, hour,
  coast_net, east_net, fwest_net, ncent_net, north_net, scent_net, south_net, west_net, ercot_net

Load Zone file:
  date, year, month, day, hour,
  COAST, NORTH, West, South, ercot_net

Usage:
  python ingest_ercot_forecast.py --weatherzone path/to/weatherzone.csv
  python ingest_ercot_forecast.py --loadzone path/to/loadzone.csv
  python ingest_ercot_forecast.py --weatherzone wz.csv --loadzone lz.csv
"""

import argparse
import asyncio
import logging
from datetime import date

import aiomysql
import pandas as pd
from dotenv import load_dotenv
import os

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
    user=os.getenv("DB_USER"),
    password=os.getenv("DB_PASSWORD"),
    db=os.getenv("DB_NAME"),
    charset="utf8mb4",
    autocommit=False,
)
if not DB_CONFIG["db"]:
    raise SystemExit("ERROR: DB_NAME environment variable is not set. Set it before running this script.")


# ── Weather Zone Ingest ───────────────────────────────────────────────────────


async def ingest_weatherzone(conn, filepath: str):
    log.info("Reading weather zone file: %s", filepath)
    df = pd.read_csv(filepath)
    df.columns = [c.strip().lower() for c in df.columns]
    for col in [
        "coast_net",
        "east_net",
        "fwest_net",
        "ncent_net",
        "north_net",
        "scent_net",
        "south_net",
        "west_net",
        "ercot_net",
    ]:
        if col in df.columns:
            df[col] = df[col].astype(str).str.replace(",", "").astype(float)

    # Normalize column names
    col_map = {
        "date": "oper_date",
        "year": "year",
        "month": "month",
        "day": "day",
        "hour": "hour",
        "coast_net": "coast_net",
        "east_net": "east_net",
        "fwest_net": "fwest_net",
        "ncent_net": "ncent_net",
        "north_net": "north_net",
        "scent_net": "scent_net",
        "south_net": "south_net",
        "west_net": "west_net",
        "ercot_net": "ercot_net",
    }
    df = df.rename(columns=col_map)
    df["oper_date"] = pd.to_datetime(df["oper_date"]).dt.date

    total = len(df)
    log.info("  Rows to ingest: %d", total)

    upserted = 0
    batch = []

    async with conn.cursor() as cur:
        for _, row in df.iterrows():
            batch.append(
                (
                    str(row["oper_date"]),
                    int(row["year"]),
                    int(row["month"]),
                    int(row["day"]),
                    int(row["hour"]),
                    float(row.get("coast_net") or 0),
                    float(row.get("east_net") or 0),
                    float(row.get("fwest_net") or 0),
                    float(row.get("ncent_net") or 0),
                    float(row.get("north_net") or 0),
                    float(row.get("scent_net") or 0),
                    float(row.get("south_net") or 0),
                    float(row.get("west_net") or 0),
                    float(row.get("ercot_net") or 0),
                )
            )

            if len(batch) >= 1000:
                await cur.executemany(
                    """
                    INSERT INTO ercot_forecast_weatherzone
                        (oper_date, year, month, day, hour,
                         coast_net, east_net, fwest_net, ncent_net,
                         north_net, scent_net, south_net, west_net, ercot_net)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON DUPLICATE KEY UPDATE
                        coast_net=VALUES(coast_net), east_net=VALUES(east_net),
                        fwest_net=VALUES(fwest_net), ncent_net=VALUES(ncent_net),
                        north_net=VALUES(north_net), scent_net=VALUES(scent_net),
                        south_net=VALUES(south_net), west_net=VALUES(west_net),
                        ercot_net=VALUES(ercot_net),
                        loaded_at=CURRENT_TIMESTAMP
                """,
                    batch,
                )
                upserted += cur.rowcount
                batch = []
                log.info("  Progress: %d / %d", upserted, total)

        if batch:
            await cur.executemany(
                """
                INSERT INTO ercot_forecast_weatherzone
                    (oper_date, year, month, day, hour,
                     coast_net, east_net, fwest_net, ncent_net,
                     north_net, scent_net, south_net, west_net, ercot_net)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON DUPLICATE KEY UPDATE
                    coast_net=VALUES(coast_net), east_net=VALUES(east_net),
                    fwest_net=VALUES(fwest_net), ncent_net=VALUES(ncent_net),
                    north_net=VALUES(north_net), scent_net=VALUES(scent_net),
                    south_net=VALUES(south_net), west_net=VALUES(west_net),
                    ercot_net=VALUES(ercot_net),
                    loaded_at=CURRENT_TIMESTAMP
            """,
                batch,
            )
            upserted += cur.rowcount

    await conn.commit()
    log.info("Weather zone ingest complete — upserted=%d", upserted)


# ── Load Zone Ingest ──────────────────────────────────────────────────────────


async def ingest_loadzone(conn, filepath: str):
    log.info("Reading load zone file: %s", filepath)
    df = pd.read_csv(filepath)
    df.columns = [c.strip().lower() for c in df.columns]
    for col in ["coast", "north", "south", "west", "ercot_net"]:
        if col in df.columns:
            df[col] = df[col].astype(str).str.replace(",", "").astype(float)

    # Load zone file has COAST→houston, NORTH, West→west, South→south
    col_map = {
        "date": "oper_date",
        "year": "year",
        "month": "month",
        "day": "day",
        "hour": "hour",
        "coast": "houston",
        "north": "north",
        "west": "west",
        "south": "south",
        "ercot_net": "ercot_net",
    }
    df = df.rename(columns=col_map)
    df["oper_date"] = pd.to_datetime(df["oper_date"]).dt.date

    total = len(df)
    log.info("  Rows to ingest: %d", total)

    upserted = 0
    batch = []

    async with conn.cursor() as cur:
        for _, row in df.iterrows():
            batch.append(
                (
                    str(row["oper_date"]),
                    int(row["year"]),
                    int(row["month"]),
                    int(row["day"]),
                    int(row["hour"]),
                    float(row.get("houston") or 0),
                    float(row.get("north") or 0),
                    float(row.get("south") or 0),
                    float(row.get("west") or 0),
                    float(row.get("ercot_net") or 0),
                )
            )

            if len(batch) >= 1000:
                await cur.executemany(
                    """
                    INSERT INTO ercot_forecast_loadzone
                        (oper_date, year, month, day, hour,
                         houston, north, south, west, ercot_net)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON DUPLICATE KEY UPDATE
                        houston=VALUES(houston), north=VALUES(north),
                        south=VALUES(south),     west=VALUES(west),
                        ercot_net=VALUES(ercot_net),
                        loaded_at=CURRENT_TIMESTAMP
                """,
                    batch,
                )
                upserted += cur.rowcount
                batch = []
                log.info("  Progress: %d / %d", upserted, total)

        if batch:
            await cur.executemany(
                """
                INSERT INTO ercot_forecast_loadzone
                    (oper_date, year, month, day, hour,
                     houston, north, south, west, ercot_net)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON DUPLICATE KEY UPDATE
                    houston=VALUES(houston), north=VALUES(north),
                    south=VALUES(south),     west=VALUES(west),
                    ercot_net=VALUES(ercot_net),
                    loaded_at=CURRENT_TIMESTAMP
            """,
                batch,
            )
            upserted += cur.rowcount

    await conn.commit()
    log.info("Load zone ingest complete — upserted=%d", upserted)


# ── Main ──────────────────────────────────────────────────────────────────────


async def main(args):
    pool = await aiomysql.create_pool(**DB_CONFIG, minsize=1, maxsize=3)

    async with pool.acquire() as conn:
        if args.weatherzone:
            await ingest_weatherzone(conn, args.weatherzone)
        if args.loadzone:
            await ingest_loadzone(conn, args.loadzone)

    pool.close()
    await pool.wait_closed()
    log.info("Done.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--weatherzone", help="Path to weather zone CSV")
    parser.add_argument("--loadzone", help="Path to load zone CSV")
    args = parser.parse_args()

    if not args.weatherzone and not args.loadzone:
        parser.error("Provide at least --weatherzone or --loadzone")

    asyncio.run(main(args))
