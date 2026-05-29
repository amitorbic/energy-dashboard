"""
ERCOT LFC Weather Forecast Ingestion Script
Processes all ZIP files from: C:/Users/Amit/Desktop/LFC_weather
Loads into: ercot_lfc_history table

Run: python ingest_lfc.py
"""

import os
import re
import zipfile
import csv
import asyncio
from datetime import datetime, date, time
from pathlib import Path
import aiomysql
from dotenv import load_dotenv

load_dotenv()

# ── Config ────────────────────────────────────────────────────────────────────
LFC_FOLDER = r"C:/Users/Amit/Desktop/LFC_weather"
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "u972964962_orbic")
DB_PORT = int(os.getenv("DB_PORT", "3306"))
BATCH_SIZE = 500  # rows per insert batch

# ── Filename parser ────────────────────────────────────────────────────────────
# cdr.00012312.0000000000000000.20211217.223000.LFCWEATHERNP3561.csv
FILENAME_RE = re.compile(
    r"cdr\.\d+\.\d+\.(\d{8})\.(\d{6})\d*\.LFCWEATHER", re.IGNORECASE
)


def parse_filename(fname: str):
    """Extract publish_date and publish_time from filename."""
    m = FILENAME_RE.search(fname)
    if not m:
        return None, None
    d = m.group(1)  # 20211217
    t = m.group(2)  # 223000
    pub_date = date(int(d[:4]), int(d[4:6]), int(d[6:8]))
    pub_time = time(int(t[:2]), int(t[2:4]), int(t[4:6]))
    return pub_date, pub_time


# ── Row parser ─────────────────────────────────────────────────────────────────
def parse_hour(val: str) -> int:
    """Convert '1:00' or '24:00' → int 1-24."""
    return int(val.split(":")[0])


def safe_float(val: str):
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def parse_csv_rows(csv_content: str, pub_date: date, pub_time: time):
    """Parse CSV content into list of row tuples."""
    rows = []
    reader = csv.DictReader(csv_content.splitlines())
    for row in reader:
        try:
            delivery_date = datetime.strptime(
                row["DeliveryDate"].strip(), "%m/%d/%Y"
            ).date()
            rows.append(
                (
                    pub_date,
                    pub_time,
                    delivery_date,
                    parse_hour(row["HourEnding"]),
                    safe_float(row.get("Coast")),
                    safe_float(row.get("East")),
                    safe_float(row.get("FarWest")),
                    safe_float(row.get("North")),
                    safe_float(row.get("NorthCentral")),
                    safe_float(row.get("SouthCentral")),
                    safe_float(row.get("Southern")),
                    safe_float(row.get("West")),
                    safe_float(row.get("SystemTotal")),
                    row.get("DSTFlag", "N").strip(),
                )
            )
        except Exception as e:
            print(f"  Row parse error: {e} | {row}")
    return rows


# ── DB insert ──────────────────────────────────────────────────────────────────
INSERT_SQL = """
    INSERT IGNORE INTO ercot_lfc_history
        (publish_date, publish_time, delivery_date, hour_ending,
         coast, east, far_west, north, north_central,
         south_central, southern, west, system_total, dst_flag)
    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
"""


async def insert_batch(conn, rows):
    async with conn.cursor() as cur:
        await cur.executemany(INSERT_SQL, rows)
    await conn.commit()


# ── Main ───────────────────────────────────────────────────────────────────────
async def main():
    # Collect all ZIP files
    zip_files = sorted(Path(LFC_FOLDER).glob("*.zip"))
    total = len(zip_files)
    print(f"Found {total} ZIP files in {LFC_FOLDER}")

    if total == 0:
        print("No ZIP files found. Check folder path.")
        return

    # Connect to DB
    conn = await aiomysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        db=DB_NAME,
        autocommit=False,
    )
    print(f"Connected to {DB_NAME} on {DB_HOST}")

    processed = 0
    skipped = 0
    errors = 0
    total_rows = 0

    for i, zip_path in enumerate(zip_files, 1):
        try:
            # Parse publish date/time from filename
            pub_date, pub_time = parse_filename(zip_path.name)
            if not pub_date:
                print(f"  [{i}/{total}] SKIP — can't parse filename: {zip_path.name}")
                skipped += 1
                continue

            # Open ZIP and find CSV inside
            with zipfile.ZipFile(zip_path, "r") as zf:
                csv_files = [f for f in zf.namelist() if f.endswith(".csv")]
                if not csv_files:
                    print(f"  [{i}/{total}] SKIP — no CSV in {zip_path.name}")
                    skipped += 1
                    continue

                csv_content = zf.read(csv_files[0]).decode("utf-8", errors="replace")

            # Parse rows
            rows = parse_csv_rows(csv_content, pub_date, pub_time)
            if not rows:
                skipped += 1
                continue

            # Insert in batches
            for b in range(0, len(rows), BATCH_SIZE):
                await insert_batch(conn, rows[b : b + BATCH_SIZE])

            total_rows += len(rows)
            processed += 1

            if i % 100 == 0 or i == total:
                print(
                    f"  [{i}/{total}] Processed {processed} files | {total_rows:,} rows inserted"
                )

        except Exception as e:
            print(f"  [{i}/{total}] ERROR {zip_path.name}: {e}")
            errors += 1

    conn.close()

    print("\n── Done ─────────────────────────────────────────")
    print(f"  Files processed : {processed}")
    print(f"  Files skipped   : {skipped}")
    print(f"  Errors          : {errors}")
    print(f"  Total rows      : {total_rows:,}")


if __name__ == "__main__":
    asyncio.run(main())
