"""
ERCOT Holiday Calendar Generator
Generates holidays from 2011 to 2035
Loads into: ercot_holidays table

Run: python generate_holidays.py
"""

import os
import asyncio
import aiomysql
from datetime import date, timedelta
from dotenv import load_dotenv

load_dotenv()

DB_HOST     = os.getenv("DB_HOST", "localhost")
DB_USER     = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME     = os.getenv("DB_NAME")
DB_PORT     = int(os.getenv("DB_PORT", "3306"))
if not DB_NAME:
    raise SystemExit("ERROR: DB_NAME environment variable is not set. Set it before running this script.")

START_YEAR = 2011
END_YEAR   = 2035

# ── Date helpers ───────────────────────────────────────────────────────────────

def nth_weekday(year, month, weekday, n):
    """Return the nth weekday of a month. weekday: 0=Mon, 6=Sun. n: 1-based."""
    first = date(year, month, 1)
    delta = (weekday - first.weekday()) % 7
    first_occurrence = first + timedelta(days=delta)
    return first_occurrence + timedelta(weeks=n - 1)

def last_weekday(year, month, weekday):
    """Return the last weekday of a month."""
    if month == 12:
        last = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        last = date(year, month + 1, 1) - timedelta(days=1)
    delta = (last.weekday() - weekday) % 7
    return last - timedelta(days=delta)

def observed(d):
    """If holiday falls on Saturday → Friday, Sunday → Monday."""
    if d.weekday() == 5:  # Saturday
        return d - timedelta(days=1)
    elif d.weekday() == 6:  # Sunday
        return d + timedelta(days=1)
    return d

# ── Holiday definitions ────────────────────────────────────────────────────────

def get_holidays(year):
    """
    Returns list of (holiday_date, holiday_name, holiday_type, observed_date)
    
    holiday_type:
        FULL    — ERCOT treats as full holiday (load behaves like Sunday)
        PARTIAL — Some observe, some don't (load partially reduced)
    """
    holidays = []

    def add(d, name, htype):
        obs = observed(d)
        holidays.append((d, name, htype, obs))

    # ── FULL HOLIDAYS (ERCOT recognized) ──────────────────────────────────────

    # New Year's Day — Jan 1
    add(date(year, 1, 1), "New Year's Day", "FULL")

    # Memorial Day — Last Monday of May
    add(last_weekday(year, 5, 0), "Memorial Day", "FULL")

    # Independence Day — Jul 4
    add(date(year, 7, 4), "Independence Day", "FULL")

    # Labor Day — First Monday of September
    add(nth_weekday(year, 9, 0, 1), "Labor Day", "FULL")

    # Thanksgiving — Fourth Thursday of November
    add(nth_weekday(year, 11, 3, 4), "Thanksgiving", "FULL")

    # Christmas — Dec 25
    add(date(year, 12, 25), "Christmas Day", "FULL")

    # ── PARTIAL HOLIDAYS (some observe, watch carefully) ──────────────────────

    # MLK Day — Third Monday of January
    add(nth_weekday(year, 1, 0, 3), "MLK Day", "PARTIAL")

    # Presidents Day — Third Monday of February
    add(nth_weekday(year, 2, 0, 3), "Presidents Day", "PARTIAL")

    # Columbus Day — Second Monday of October (minimal ERCOT impact)
    add(nth_weekday(year, 10, 0, 2), "Columbus Day", "PARTIAL")

    # Veterans Day — Nov 11
    add(date(year, 11, 11), "Veterans Day", "PARTIAL")

    # Day after Thanksgiving (Black Friday)
    thanksgiving = nth_weekday(year, 11, 3, 4)
    add(thanksgiving + timedelta(days=1), "Day After Thanksgiving", "PARTIAL")

    # Christmas Eve — Dec 24
    add(date(year, 12, 24), "Christmas Eve", "PARTIAL")

    # New Year's Eve — Dec 31
    add(date(year, 12, 31), "New Year's Eve", "PARTIAL")

    return holidays

# ── DB setup ───────────────────────────────────────────────────────────────────

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS ercot_holidays (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    holiday_date    DATE NOT NULL,
    holiday_name    VARCHAR(100) NOT NULL,
    holiday_type    ENUM('FULL', 'PARTIAL') NOT NULL,
    observed_date   DATE NOT NULL,
    day_of_week     VARCHAR(10) NOT NULL,
    INDEX idx_date (holiday_date),
    INDEX idx_observed (observed_date),
    UNIQUE KEY uq_date_name (holiday_date, holiday_name)
);
"""

INSERT_SQL = """
    INSERT IGNORE INTO ercot_holidays
        (holiday_date, holiday_name, holiday_type, observed_date, day_of_week)
    VALUES (%s, %s, %s, %s, %s)
"""

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

# ── Main ───────────────────────────────────────────────────────────────────────

async def main():
    conn = await aiomysql.connect(
        host=DB_HOST, port=DB_PORT,
        user=DB_USER, password=DB_PASSWORD,
        db=DB_NAME, autocommit=False
    )
    print(f"Connected to {DB_NAME}")

    # Create table
    async with conn.cursor() as cur:
        await cur.execute(CREATE_TABLE_SQL)
    await conn.commit()
    print("Table ercot_holidays ready")

    # Generate and insert
    all_rows = []
    for year in range(START_YEAR, END_YEAR + 1):
        for hdate, hname, htype, obs in get_holidays(year):
            all_rows.append((
                hdate,
                hname,
                htype,
                obs,
                DAYS[hdate.weekday()],
            ))

    async with conn.cursor() as cur:
        await cur.executemany(INSERT_SQL, all_rows)
    await conn.commit()

    print(f"Inserted {len(all_rows)} holiday records ({START_YEAR}-{END_YEAR})")

    # Preview
    async with conn.cursor() as cur:
        await cur.execute("""
            SELECT holiday_date, holiday_name, holiday_type, observed_date, day_of_week
            FROM ercot_holidays
            WHERE YEAR(holiday_date) = 2024
            ORDER BY holiday_date
        """)
        rows = await cur.fetchall()

    print("\n── 2024 Holidays Preview ─────────────────────────")
    print(f"{'Date':<12} {'Name':<30} {'Type':<8} {'Observed':<12} {'Day'}")
    print("-" * 75)
    for r in rows:
        print(f"{str(r[0]):<12} {r[1]:<30} {r[2]:<8} {str(r[3]):<12} {r[4]}")

    conn.close()

if __name__ == "__main__":
    asyncio.run(main())
