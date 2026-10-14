"""
Build the REP hourly load shape (rep_load_shape) from a REP's 15-min load CSV.

CSV format: DATE, INTERVAL, Houston, North, South, West   (INTERVAL = INT_1..INT_96)

For each date/hour, share = REP MWh / ERCOT zone MWh (ercot_load_history).
Shares are bucketed by zone + month + day_of_week + hour_ending, outliers
(> 3 std dev from the bucket mean) are dropped, and the mean is upserted.

Usage:
  python build_rep_load_shape.py --csv path/to/file.csv
  python build_rep_load_shape.py --csv path/to/file.csv --rep_id REP001
  python build_rep_load_shape.py --csv path/to/file.csv --dry_run
"""
import argparse
import csv
import datetime as dt
import os
import re
import statistics
import urllib.parse
from collections import defaultdict

import pymysql
from dotenv import dotenv_values

ZONES = ["HOUSTON", "NORTH", "SOUTH", "WEST"]
CSV_COLS = dict(zip(ZONES, range(2, 6)))
ERCOT_COLS = {
    "HOUSTON": ["coast"],
    "NORTH": ["north", "north_central", "east"],
    "SOUTH": ["south_central", "southern"],
    "WEST": ["far_west", "west"],
}

_env = dotenv_values(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))


def _cfg(key, default=None):
    return os.getenv(key) or _env.get(key) or default


def parse_date(s: str) -> dt.date:
    s = s.strip()
    for fmt in ("%m/%d/%Y", "%m/%d/%y"):
        try:
            return dt.datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    raise ValueError(f"Unrecognised date: {s!r}")


def load_rep_hourly(path: str):
    """Return ({date: {zone: [24 hourly MWh]}}, skipped_days)."""
    intervals = defaultdict(lambda: {z: {} for z in ZONES})
    with open(path, newline="") as f:
        rd = csv.reader(f)
        next(rd)
        for r in rd:
            if len(r) < 6 or not r[0].strip():
                continue
            d = parse_date(r[0])
            k = int(re.search(r"\d+", r[1]).group())
            for z in ZONES:
                intervals[d][z][k] = float(r[CSV_COLS[z]].strip())

    hourly, skipped = {}, []
    for d, zs in sorted(intervals.items()):
        if any(len(zs[z]) != 96 for z in ZONES):  # DST days (92 / 100 intervals)
            skipped.append(d)
            continue
        hourly[d] = {
            z: [sum(zs[z][i] for i in range(h * 4 + 1, h * 4 + 5)) for h in range(24)]
            for z in ZONES
        }
    return hourly, skipped


def fetch_ercot(cur, start: dt.date, end: dt.date):
    """Return {zone: {(date, he): mwh}}; rows with 0/NULL actual are omitted."""
    out = {}
    for z in ZONES:
        expr = "+".join(f"COALESCE({c},0)" for c in ERCOT_COLS[z])
        cur.execute(
            f"SELECT oper_date, hour_ending, {expr} FROM ercot_load_history "
            "WHERE oper_date BETWEEN %s AND %s AND dst_flag IS NULL",
            (start, end),
        )
        out[z] = {(d, int(h)): float(v) for d, h, v in cur.fetchall() if v}
    return out


def build_shapes(hourly, ercot):
    buckets = defaultdict(list)
    for d, zs in hourly.items():
        for z in ZONES:
            for he in range(1, 25):
                e = ercot[z].get((d, he))
                if not e:
                    continue
                buckets[(z, d.month, d.weekday(), he)].append(zs[z][he - 1] / e)

    rows, dropped = [], 0
    for key, vals in sorted(buckets.items()):
        if len(vals) > 2:
            mu, sd = statistics.mean(vals), statistics.pstdev(vals)
            if sd > 0:
                kept = [v for v in vals if abs(v - mu) <= 3 * sd]
                dropped += len(vals) - len(kept)
                vals = kept
        rows.append((*key, statistics.mean(vals), len(vals)))
    return rows, dropped


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--csv", required=True)
    ap.add_argument("--rep_id", default="default")
    ap.add_argument("--dry_run", action="store_true", help="compute and report, but do not write")
    a = ap.parse_args()

    hourly, skipped = load_rep_hourly(a.csv)
    if not hourly:
        raise SystemExit("No complete days found in CSV.")
    dates = sorted(hourly)
    built_from, built_to = dates[0], dates[-1]
    print(f"CSV: {len(hourly)} complete days {built_from}..{built_to}; skipped (not 96 intervals): {skipped}")

    conn = pymysql.connect(
        host=_cfg("DB_HOST", "localhost"), port=int(_cfg("DB_PORT", 3306)),
        user=_cfg("DB_USER"), password=urllib.parse.unquote(_cfg("DB_PASSWORD", "")), db=_cfg("DB_NAME"),
        autocommit=False,
    )
    try:
        cur = conn.cursor()
        ercot = fetch_ercot(cur, built_from, built_to)
        rows, dropped = build_shapes(hourly, ercot)
        print(f"Buckets: {len(rows)}; outlier points dropped: {dropped}")

        if a.dry_run:
            print("Dry run — nothing written.")
            return

        cur.executemany(
            """
            INSERT INTO rep_load_shape
                (rep_id, zone, month, day_of_week, hour_ending,
                 avg_share, sample_count, built_from, built_to, built_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
            ON DUPLICATE KEY UPDATE
                avg_share = VALUES(avg_share), sample_count = VALUES(sample_count),
                built_from = VALUES(built_from), built_to = VALUES(built_to),
                built_at = NOW()
            """,
            [(a.rep_id, z, m, dow, he, round(share, 10), n, built_from, built_to)
             for z, m, dow, he, share, n in rows],
        )
        conn.commit()
        print(f"Upserted {len(rows)} rows into rep_load_shape for rep_id={a.rep_id!r}.")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
