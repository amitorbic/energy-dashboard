"""
build_layer1_dna.py
────────────────────
Layer 1 — The DNA
Builds a normalized typical year from ercot_load_history.

For each combination of weather_zone + month + day_of_week + hour_ending:
  1. Collect all historical values
  2. Calculate mean and std dev
  3. Remove outliers (> 3 std dev from mean)
  4. Store clean average as baseline

Result: 8 zones × 12 months × 7 days × 24 hours = 16,128 rows

Usage:
  python build_layer1_dna.py           # build all zones
  python build_layer1_dna.py --zone COAST  # single zone
"""

import argparse
import asyncio
import logging
import statistics
from collections import defaultdict
from datetime import date
from utils.zone_mapping import DB_COL_TO_ZONE

import aiomysql
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
    db=os.getenv("DB_NAME", "u972964962_orbic"),
    charset="utf8mb4",
    autocommit=False,
)

# ercot_load_history column → zone label

OUTLIER_THRESHOLD = 3.0  # standard deviations


def remove_outliers(values: list[float]) -> tuple[list[float], int]:
    """Remove values > 3 std dev from mean. Returns clean list + count removed."""
    if len(values) < 4:
        return values, 0

    mean = statistics.mean(values)
    stdev = statistics.stdev(values)

    if stdev == 0:
        return values, 0

    clean = [v for v in values if abs(v - mean) <= OUTLIER_THRESHOLD * stdev]
    removed = len(values) - len(clean)
    return clean, removed


async def build_dna_for_zone(conn, col: str, zone_label: str):
    log.info("Building DNA for zone=%s", zone_label)

    # Fetch all hourly actuals for this zone
    async with conn.cursor() as cur:
        await cur.execute(f"""
            SELECT oper_date, hour_ending, {col}
            FROM   ercot_load_history
            WHERE  {col} IS NOT NULL
            ORDER  BY oper_date, hour_ending
        """)
        rows = await cur.fetchall()

    log.info("  Fetched %d rows", len(rows))

    # Group by month + day_of_week + hour_ending
    # key: (month, day_of_week, hour_ending)
    groups: dict[tuple, list[float]] = defaultdict(list)

    for row in rows:
        oper_date = row[0]
        hour = int(row[1])
        load_val = float(row[2])

        if isinstance(oper_date, str):
            oper_date = date.fromisoformat(oper_date)

        month = oper_date.month
        dow = oper_date.weekday()  # 0=Monday, 6=Sunday

        groups[(month, dow, hour)].append(load_val)

    log.info("  Groups built: %d combinations", len(groups))

    # Calculate stats and upsert
    upserted = 0
    batch = []

    for (month, dow, hour), values in groups.items():
        clean, removed = remove_outliers(values)

        if not clean:
            continue

        avg = statistics.mean(clean)
        stdev = statistics.stdev(clean) if len(clean) > 1 else 0.0

        batch.append(
            (
                zone_label,
                month,
                dow,
                hour,
                round(avg, 4),
                round(stdev, 4),
                len(clean),
                removed,
            )
        )

    async with conn.cursor() as cur:
        await cur.executemany(
            """
            INSERT INTO forecast_baseline_dna
                (weather_zone, month, day_of_week, hour_ending,
                 avg_load, std_dev, sample_count, outliers_removed)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                avg_load         = VALUES(avg_load),
                std_dev          = VALUES(std_dev),
                sample_count     = VALUES(sample_count),
                outliers_removed = VALUES(outliers_removed),
                built_at         = CURRENT_TIMESTAMP
        """,
            batch,
        )
        upserted = cur.rowcount

    await conn.commit()
    log.info(
        "  Zone=%-15s  combinations=%d  upserted=%d", zone_label, len(batch), upserted
    )


async def main(args):
    pool = await aiomysql.create_pool(**DB_CONFIG, minsize=1, maxsize=3)

    async with pool.acquire() as conn:
        if args.zone:
            # Single zone
            col = args.zone.lower().replace(" ", "_")
            if col not in DB_COL_TO_ZONE:
                log.error(
                    "Unknown zone: %s. Valid: %s",
                    args.zone,
                    list(DB_COL_TO_ZONE.keys()),
                )
                return
            await build_dna_for_zone(conn, col, DB_COL_TO_ZONE[col])
        else:
            # All zones
            for col, label in DB_COL_TO_ZONE.items():
                await build_dna_for_zone(conn, col, label)

    pool.close()
    await pool.wait_closed()

    log.info("Layer 1 DNA build complete.")
    log.info("Total rows: 8 zones × 12 months × 7 days × 24 hours = up to 16,128")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--zone", help="Single zone to build (e.g. COAST)")
    args = parser.parse_args()
    asyncio.run(main(args))
