"""
ERCOT Native Load Actuals Ingestion Script
Processes all Excel files from: C:/Users/Amit/Desktop/LFC_weather/Native_load/native load
Loads into: ercot_load_history table

Run: python ingest_load.py
"""

import os
import asyncio
from datetime import datetime, timedelta
from pathlib import Path
import pandas as pd
import aiomysql
from dotenv import load_dotenv
from datetime import datetime, timedelta

load_dotenv()

# ── Config ────────────────────────────────────────────────────────────────────
LOAD_FOLDER = r"C:/Users/Amit/Desktop/LFC_weather/Native_load/native load"
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "u972964962_orbic")
DB_PORT = int(os.getenv("DB_PORT", "3306"))
BATCH_SIZE = 500

# ── Column mapping ─────────────────────────────────────────────────────────────
COLUMN_MAP = {
    "coast": "coast",
    "east": "east",
    "farwest": "far_west",
    "far_west": "far_west",
    "fwest": "far_west",
    "north": "north",
    "northcentral": "north_central",
    "north_central": "north_central",
    "ncent": "north_central",
    "southcentral": "south_central",
    "south_central": "south_central",
    "scent": "south_central",
    "southern": "southern",
    "south": "southern",
    "west": "west",
    "ercot": "ercot_total",
    "systemtotal": "ercot_total",
    "system_total": "ercot_total",
}


def safe_float(val):
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def parse_date(val) -> datetime.date:
    """Parse date from various formats."""
    val = str(val).strip()
    if " " in val:
        val = val.split(" ")[0]
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(val, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Cannot parse date: {val}")


def parse_datetime_row(val):
    """
    Parse combined datetime string and return (oper_date, hour_ending).

    Handles two formats:
    - New format: '01/01/2024 24:00' → hour 24, same date
    - Old format: '1/1/2015 1:00' ... '1/2/2015 0:00' → hour 0 = hour 24 of previous day
    """
    val = str(val).strip()
    parts = val.split(" ")
    date_part = parts[0]
    time_part = parts[1] if len(parts) > 1 else "0:00"
    # Skip end-of-hour timestamps (e.g. 01:59:59.997)
    minutes = int(time_part.split(":")[1]) if len(time_part.split(":")) > 1 else 0
    if minutes >= 30:
        return None, None  # signal to skip this row

    hour = int(time_part.split(":")[0])
    oper_date = parse_date(date_part)

    if hour == 0:
        # Old 2015/2016 format: midnight 0:00 = hour 24 of the previous day
        oper_date = oper_date - timedelta(days=1)
        hour = 24

    return oper_date, hour


def process_excel(filepath: Path):
    """Read Excel file and return list of row tuples."""
    rows = []
    try:
        df = pd.read_excel(filepath, engine="openpyxl")
    except Exception:
        try:
            df = pd.read_excel(filepath, engine="xlrd")
        except Exception as e:
            print(f"    Cannot read {filepath.name}: {e}")
            return rows

    # Normalize column names
    df.columns = [str(c).strip().lower().replace(" ", "_") for c in df.columns]

    # Find hour column
    hour_col = next((c for c in df.columns if "hour" in c), None)
    date_col = next((c for c in df.columns if "date" in c or "oper" in c), None)

    if not hour_col:
        print(f"    Cannot find hour column in {filepath.name}: {list(df.columns)}")
        return rows

    # Check if hour column has combined date+time
    sample = str(df[hour_col].iloc[0]).strip()
    combined = " " in sample

    seen = set()  # track (date, hour) to skip duplicates

    for _, row in df.iterrows():
        try:
            val = str(row[hour_col]).strip()

            if combined:
                oper_date, hour_ending = parse_datetime_row(val)
                if oper_date is None:
                    continue  # skip end-of-hour row
            elif date_col:
                oper_date = parse_date(row[date_col])
                hour = int(val.split(":")[0]) if ":" in val else int(val)
                if hour == 0:
                    oper_date = oper_date - timedelta(days=1)
                    hour = 24
                hour_ending = hour
            else:
                continue

            # Skip duplicates within the same file
            key = (oper_date, hour_ending)
            dst = None
            if key in seen:
                dst = "Y"
                print(f"SKIP duplicate: {key}")
            else:
                seen.add(key)

            rows.append(
                (
                    oper_date,
                    hour_ending,
                    dst,
                    safe_float(row.get("coast")),
                    safe_float(row.get("east")),
                    safe_float(
                        row.get("far_west", row.get("fwest", row.get("farwest")))
                    ),
                    safe_float(row.get("north")),
                    safe_float(
                        row.get(
                            "north_central", row.get("ncent", row.get("northcentral"))
                        )
                    ),
                    safe_float(
                        row.get(
                            "south_central", row.get("scent", row.get("southcentral"))
                        )
                    ),
                    safe_float(row.get("southern", row.get("south"))),
                    safe_float(row.get("west")),
                    safe_float(
                        row.get("ercot_total", row.get("ercot", row.get("systemtotal")))
                    ),
                )
            )
        except Exception:
            pass  # skip bad rows silently

    return rows


# ── DB insert ──────────────────────────────────────────────────────────────────
INSERT_SQL = """
    INSERT INTO ercot_load_history
        (oper_date, hour_ending, dst_flag, coast, east, far_west, north,
         north_central, south_central, southern, west, ercot_total)
     VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
     ON DUPLICATE KEY UPDATE
        dst_flag = VALUES(dst_flag)
"""


async def insert_batch(conn, rows):
    async with conn.cursor() as cur:
        await cur.executemany(INSERT_SQL, rows)
    await conn.commit()


# ── Main ───────────────────────────────────────────────────────────────────────
async def main():
    excel_files = sorted(
        list(Path(LOAD_FOLDER).glob("*.xlsx")) + list(Path(LOAD_FOLDER).glob("*.xls"))
    )
    # Skip temp Excel lock files
    excel_files = [f for f in excel_files if not f.name.startswith("~$")]
    # excel_files = [f for f in excel_files if "2016" in f.name]
    total = len(excel_files)
    print(f"Found {total} Excel files in {LOAD_FOLDER}")

    if total == 0:
        print("No Excel files found. Check folder path.")
        return

    conn = await aiomysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        db=DB_NAME,
        autocommit=False,
    )
    print(f"Connected to {DB_NAME}")

    processed = 0
    total_rows = 0
    errors = 0

    for i, filepath in enumerate(excel_files, 1):
        try:
            rows = process_excel(filepath)
            if not rows:
                print(f"  [{i}/{total}] SKIP — no rows: {filepath.name}")
                continue

            for b in range(0, len(rows), BATCH_SIZE):
                await insert_batch(conn, rows[b : b + BATCH_SIZE])

            total_rows += len(rows)
            processed += 1
            print(f"  [{i}/{total}] {filepath.name} → {len(rows):,} rows")

        except Exception as e:
            print(f"  [{i}/{total}] ERROR {filepath.name}: {e}")
            errors += 1

    conn.close()

    print("\n── Done ─────────────────────────────────────────")
    print(f"  Files processed : {processed}")
    print(f"  Errors          : {errors}")
    print(f"  Total rows      : {total_rows:,}")


if __name__ == "__main__":
    asyncio.run(main())
