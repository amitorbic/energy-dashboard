"""
ERCOT Load Pattern Builder
Iterative outlier detection — no hardcoded lists
Builds baseline patterns + black swan library

Run: python build_patterns.py

Tables created:
  ercot_load_patterns     — clean baseline by zone/month/day_type/hour
  ercot_black_swan_events — auto-detected outlier days
"""

import os
import asyncio
import numpy as np
from datetime import date
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

# Outlier threshold — how many std devs = black swan
# 2.5 = catches ~1.2% of values (aggressive)
# 3.0 = catches ~0.3% of values (conservative)
# We use 2.5 first pass, tighten to 3.0 after weather/growth removed
OUTLIER_SIGMA_PASS1 = 2.5
OUTLIER_SIGMA_PASS2 = 3.0
MAX_ITERATIONS      = 5

# ── SQL ────────────────────────────────────────────────────────────────────────

CREATE_PATTERNS_SQL = """
CREATE TABLE IF NOT EXISTS ercot_load_patterns (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    zone            VARCHAR(20)  NOT NULL,
    month_num       TINYINT      NOT NULL,
    day_type        VARCHAR(15)  NOT NULL,
    hour_ending     TINYINT      NOT NULL,

    -- Clean baseline (outliers removed)
    avg_mw          DECIMAL(12,4),
    std_dev_mw      DECIMAL(12,4),
    min_mw          DECIMAL(12,4),
    max_mw          DECIMAL(12,4),

    -- Percentile bands
    p10_mw          DECIMAL(12,4),
    p25_mw          DECIMAL(12,4),
    p50_mw          DECIMAL(12,4),
    p75_mw          DECIMAL(12,4),
    p90_mw          DECIMAL(12,4),
    p99_mw          DECIMAL(12,4),

    -- Weather correlation (MW per deg F above normal)
    temp_coeff      DECIMAL(10,6),
    base_temp_f     DECIMAL(6,2),

    -- Growth trend
    yoy_growth_pct  DECIMAL(8,4),

    -- Sample info
    sample_days     INT,
    outlier_days    INT,
    iterations_used INT,

    last_updated    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uq_pattern (zone, month_num, day_type, hour_ending)
);
"""

CREATE_BLACKSWAN_SQL = """
CREATE TABLE IF NOT EXISTS ercot_black_swan_events (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    event_date      DATE         NOT NULL,
    zone            VARCHAR(20)  NOT NULL,
    hour_ending     TINYINT      NOT NULL,
    actual_mw       DECIMAL(12,4),
    expected_mw     DECIMAL(12,4),
    deviation_sigma DECIMAL(8,4),
    direction       ENUM('HIGH','LOW'),
    auto_label      VARCHAR(100),
    last_updated    DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_event (event_date, zone, hour_ending)
);
"""

INSERT_PATTERN_SQL = """
    INSERT INTO ercot_load_patterns
        (zone, month_num, day_type, hour_ending,
         avg_mw, std_dev_mw, min_mw, max_mw,
         p10_mw, p25_mw, p50_mw, p75_mw, p90_mw, p99_mw,
         temp_coeff, base_temp_f, yoy_growth_pct,
         sample_days, outlier_days, iterations_used)
    VALUES
        (%s,%s,%s,%s, %s,%s,%s,%s, %s,%s,%s,%s,%s,%s, %s,%s,%s, %s,%s,%s)
    ON DUPLICATE KEY UPDATE
        avg_mw=VALUES(avg_mw), std_dev_mw=VALUES(std_dev_mw),
        min_mw=VALUES(min_mw), max_mw=VALUES(max_mw),
        p10_mw=VALUES(p10_mw), p25_mw=VALUES(p25_mw),
        p50_mw=VALUES(p50_mw), p75_mw=VALUES(p75_mw),
        p90_mw=VALUES(p90_mw), p99_mw=VALUES(p99_mw),
        temp_coeff=VALUES(temp_coeff), base_temp_f=VALUES(base_temp_f),
        yoy_growth_pct=VALUES(yoy_growth_pct),
        sample_days=VALUES(sample_days), outlier_days=VALUES(outlier_days),
        iterations_used=VALUES(iterations_used),
        last_updated=NOW()
"""

INSERT_BLACKSWAN_SQL = """
    INSERT INTO ercot_black_swan_events
        (event_date, zone, hour_ending, actual_mw, expected_mw,
         deviation_sigma, direction, auto_label)
    VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
    ON DUPLICATE KEY UPDATE
        actual_mw=VALUES(actual_mw), expected_mw=VALUES(expected_mw),
        deviation_sigma=VALUES(deviation_sigma), direction=VALUES(direction),
        auto_label=VALUES(auto_label)
"""

# ── Day type helper ────────────────────────────────────────────────────────────

WEEKDAY_NAMES = {0:"Mon",1:"Tue",2:"Wed",3:"Thu",4:"Fri",5:"Sat",6:"Sun"}

def get_day_type(d: date, full_holidays: set, partial_holidays: set) -> str:
    if d in full_holidays:
        return "Holiday_Full"
    if d in partial_holidays:
        return "Holiday_Partial"
    return WEEKDAY_NAMES[d.weekday()]

# ── Weather correlation ────────────────────────────────────────────────────────

def calc_temp_coeff(loads: np.ndarray, temps: np.ndarray):
    """Simple linear regression: MW = coeff * temp + intercept"""
    if len(loads) < 10 or len(temps) < 10:
        return 0.0, 0.0
    try:
        # Remove NaNs
        mask = ~(np.isnan(loads) | np.isnan(temps))
        l, t = loads[mask], temps[mask]
        if len(l) < 5:
            return 0.0, float(np.nanmean(temps))
        coeff = np.polyfit(t, l, 1)
        return float(coeff[0]), float(np.nanmean(t))
    except Exception:
        return 0.0, float(np.nanmean(temps)) if len(temps) > 0 else 0.0

# ── Growth trend ──────────────────────────────────────────────────────────────

def calc_yoy_growth(loads_by_year: dict) -> float:
    """Calculate average year-over-year growth %"""
    years = sorted(loads_by_year.keys())
    if len(years) < 2:
        return 0.0
    growths = []
    for i in range(1, len(years)):
        prev = loads_by_year[years[i-1]]
        curr = loads_by_year[years[i]]
        if prev > 0:
            growths.append((curr - prev) / prev * 100)
    return float(np.mean(growths)) if growths else 0.0

# ── Iterative outlier detection ───────────────────────────────────────────────

def iterative_clean(values: np.ndarray, sigma1=OUTLIER_SIGMA_PASS1,
                    sigma2=OUTLIER_SIGMA_PASS2, max_iter=MAX_ITERATIONS):
    """
    Remove outliers iteratively until stable.
    Returns: clean_values, outlier_mask, iterations_used
    """
    mask = np.ones(len(values), dtype=bool)  # True = keep
    iterations = 0

    for i in range(max_iter):
        sigma = sigma1 if i == 0 else sigma2
        clean = values[mask]
        if len(clean) < 5:
            break
        mean  = np.mean(clean)
        std   = np.std(clean)
        if std == 0:
            break

        new_mask = mask.copy()
        for j, v in enumerate(values):
            if mask[j]:
                if abs(v - mean) > sigma * std:
                    new_mask[j] = False

        iterations += 1
        if np.array_equal(new_mask, mask):
            break  # converged
        mask = new_mask

    return values[mask], ~mask, iterations

# ── Auto label black swan ─────────────────────────────────────────────────────

def auto_label(event_date: date, direction: str) -> str:
    y, m = event_date.year, event_date.month
    if y == 2021 and m == 2 and 10 <= event_date.day <= 20:
        return "Uri Winter Storm"
    if y == 2020 and m in (3, 4, 5):
        return "COVID Demand Disruption"
    if y == 2017 and m == 8 and event_date.day >= 25:
        return "Hurricane Harvey"
    if direction == "HIGH" and m in (6, 7, 8, 9):
        return "Summer Heat Event"
    if direction == "HIGH" and m in (12, 1, 2):
        return "Winter Cold Event"
    if direction == "LOW":
        return "Demand Suppression Event"
    return "Unclassified Black Swan"

# ── Main ───────────────────────────────────────────────────────────────────────

async def main():
    conn = await aiomysql.connect(
        host=DB_HOST, port=DB_PORT,
        user=DB_USER, password=DB_PASSWORD,
        db=DB_NAME, autocommit=False
    )
    print(f"Connected to {DB_NAME}\n")

    # Create tables
    async with conn.cursor() as cur:
        await cur.execute(CREATE_PATTERNS_SQL)
        await cur.execute(CREATE_BLACKSWAN_SQL)
    await conn.commit()
    print("Tables ready: ercot_load_patterns, ercot_black_swan_events")

    # Load holidays
    async with conn.cursor() as cur:
        await cur.execute("""
            SELECT observed_date, holiday_type FROM ercot_holidays
        """)
        hrows = await cur.fetchall()

    full_holidays    = {r[0] for r in hrows if r[1] == "FULL"}
    partial_holidays = {r[0] for r in hrows if r[1] == "PARTIAL"}
    print(f"Loaded {len(full_holidays)} full + {len(partial_holidays)} partial holidays")

    # Load all ERCOT actuals with weather
    print("\nLoading ERCOT actuals + weather data...")
    async with conn.cursor() as cur:
        await cur.execute("""
            SELECT
                l.oper_date,
                l.hour_ending,
                l.coast, l.east, l.far_west, l.north,
                l.north_central, l.south_central, l.southern, l.west,
                w_coast.temperature,
                w_ncent.temperature,
                w_north.temperature,
                w_south.temperature,
                w_scent.temperature,
                w_east.temperature,
                w_fwest.temperature,
                w_west.temperature
            FROM ercot_load_history l
            LEFT JOIN weather_history w_coast
                ON w_coast.weather_date = l.oper_date
                AND w_coast.hour_ending = l.hour_ending
                AND w_coast.zone = 'COAST'
            LEFT JOIN weather_history w_ncent
                ON w_ncent.weather_date = l.oper_date
                AND w_ncent.hour_ending = l.hour_ending
                AND w_ncent.zone = 'NCENT'
            LEFT JOIN weather_history w_north
                ON w_north.weather_date = l.oper_date
                AND w_north.hour_ending = l.hour_ending
                AND w_north.zone = 'NORTH'
            LEFT JOIN weather_history w_south
                ON w_south.weather_date = l.oper_date
                AND w_south.hour_ending = l.hour_ending
                AND w_south.zone = 'SOUTH'
            LEFT JOIN weather_history w_scent
                ON w_scent.weather_date = l.oper_date
                AND w_scent.hour_ending = l.hour_ending
                AND w_scent.zone = 'SCENT'
            LEFT JOIN weather_history w_east
                ON w_east.weather_date = l.oper_date
                AND w_east.hour_ending = l.hour_ending
                AND w_east.zone = 'EAST'
            LEFT JOIN weather_history w_fwest
                ON w_fwest.weather_date = l.oper_date
                AND w_fwest.hour_ending = l.hour_ending
                AND w_fwest.zone = 'FWEST'
            LEFT JOIN weather_history w_west
                ON w_west.weather_date = l.oper_date
                AND w_west.hour_ending = l.hour_ending
                AND w_west.zone = 'WEST'
            ORDER BY l.oper_date, l.hour_ending
        """)
        rows = await cur.fetchall()

    print(f"Loaded {len(rows):,} rows\n")

    # Map zone index
    ZONE_LOAD_IDX = {
        "COAST":2, "EAST":3, "FWEST":4, "NORTH":5,
        "NCENT":6, "SCENT":7, "SOUTH":8, "WEST":9
    }
    ZONE_TEMP_IDX = {
        "COAST":10, "NCENT":11, "NORTH":12, "SOUTH":13,
        "SCENT":14, "EAST":15, "FWEST":16, "WEST":17
    }

    # Build lookup: zone → month → day_type → hour → [(date, load, temp, year)]
    print("Organizing data into patterns...")
    from collections import defaultdict
    data = defaultdict(lambda: defaultdict(lambda: defaultdict(
                lambda: defaultdict(list))))

    for row in rows:
        oper_date  = row[0]
        hour       = row[1]
        day_type   = get_day_type(oper_date, full_holidays, partial_holidays)
        month      = oper_date.month
        year       = oper_date.year

        for zone in ZONES:
            load = row[ZONE_LOAD_IDX[zone]]
            temp = row[ZONE_TEMP_IDX[zone]]
            if load is not None:
                data[zone][month][day_type][hour].append(
                    (oper_date, float(load), float(temp) if temp else None, year)
                )

    # Process each combination
    pattern_rows   = []
    blackswan_rows = []
    total_patterns = 0
    total_outliers = 0

    day_types = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun",
                 "Holiday_Full","Holiday_Partial"]

    for zone in ZONES:
        print(f"  Processing {zone}...")
        for month in range(1, 13):
            for day_type in day_types:
                for hour in range(1, 25):
                    entries = data[zone][month][day_type].get(hour, [])
                    if len(entries) < 3:
                        continue

                    dates  = [e[0] for e in entries]
                    loads  = np.array([e[1] for e in entries])
                    temps  = np.array([e[2] if e[2] is not None else np.nan
                                       for e in entries])
                    years  = [e[3] for e in entries]

                    # Iterative outlier detection
                    clean_loads, outlier_mask, iters = iterative_clean(loads)

                    if len(clean_loads) < 3:
                        continue

                    # Stats on clean data
                    avg    = float(np.mean(clean_loads))
                    std    = float(np.std(clean_loads))
                    mn     = float(np.min(clean_loads))
                    mx     = float(np.max(clean_loads))
                    p10    = float(np.percentile(clean_loads, 10))
                    p25    = float(np.percentile(clean_loads, 25))
                    p50    = float(np.percentile(clean_loads, 50))
                    p75    = float(np.percentile(clean_loads, 75))
                    p90    = float(np.percentile(clean_loads, 90))
                    p99    = float(np.percentile(clean_loads, 99))

                    # Weather correlation on clean data
                    clean_temps = temps[~outlier_mask]
                    temp_coeff, base_temp = calc_temp_coeff(clean_loads, clean_temps)

                    # Growth trend on clean data
                    loads_by_year = defaultdict(list)
                    for i, keep in enumerate(~outlier_mask):
                        if keep:
                            loads_by_year[years[i]].append(loads[i])
                    loads_by_year_avg = {
                        y: float(np.mean(v))
                        for y, v in loads_by_year.items()
                    }
                    yoy_growth = calc_yoy_growth(loads_by_year_avg)

                    n_outliers = int(np.sum(outlier_mask))
                    total_patterns += 1
                    total_outliers += n_outliers

                    pattern_rows.append((
                        zone, month, day_type, hour,
                        round(avg,4), round(std,4),
                        round(mn,4), round(mx,4),
                        round(p10,4), round(p25,4), round(p50,4),
                        round(p75,4), round(p90,4), round(p99,4),
                        round(temp_coeff,6), round(base_temp,2),
                        round(yoy_growth,4),
                        len(clean_loads), n_outliers, iters
                    ))

                    # Record black swan events
                    if n_outliers > 0 and std > 0:
                        for i, is_outlier in enumerate(outlier_mask):
                            if is_outlier:
                                dev = (loads[i] - avg) / std
                                direction = "HIGH" if loads[i] > avg else "LOW"
                                blackswan_rows.append((
                                    dates[i], zone, hour,
                                    round(float(loads[i]),4),
                                    round(avg,4),
                                    round(float(dev),4),
                                    direction,
                                    auto_label(dates[i], direction)
                                ))

    # Insert patterns
    print(f"\nInserting {total_patterns:,} patterns...")
    async with conn.cursor() as cur:
        batch_size = 500
        for i in range(0, len(pattern_rows), batch_size):
            await cur.executemany(INSERT_PATTERN_SQL,
                                  pattern_rows[i:i+batch_size])
    await conn.commit()

    # Deduplicate black swan rows (same date/zone/hour)
    seen = set()
    unique_bs = []
    for r in blackswan_rows:
        key = (r[0], r[1], r[2])
        if key not in seen:
            seen.add(key)
            unique_bs.append(r)

    # Insert black swans
    print(f"Inserting {len(unique_bs):,} black swan events...")
    async with conn.cursor() as cur:
        for i in range(0, len(unique_bs), 500):
            await cur.executemany(INSERT_BLACKSWAN_SQL,
                                  unique_bs[i:i+500])
    await conn.commit()

    print(f"\n── Done ─────────────────────────────────────────")
    print(f"  Patterns built : {total_patterns:,}")
    print(f"  Outliers found : {total_outliers:,}")
    print(f"  Black swan rows: {len(unique_bs):,}")

    # ── Preview results ────────────────────────────────────────────────────────
    print("\n── NCENT Pattern Preview (Aug, Weekday, HE14) ────")
    async with conn.cursor() as cur:
        await cur.execute("""
            SELECT avg_mw, std_dev_mw, p10_mw, p50_mw, p90_mw,
                   temp_coeff, yoy_growth_pct, sample_days, outlier_days
            FROM ercot_load_patterns
            WHERE zone='NCENT' AND month_num=8
              AND day_type='Tue' AND hour_ending=14
        """)
        r = await cur.fetchone()
    if r:
        print(f"  Avg MW        : {r[0]:,.0f}")
        print(f"  Std Dev       : {r[1]:,.0f}")
        print(f"  P10 / P50 / P90: {r[2]:,.0f} / {r[3]:,.0f} / {r[4]:,.0f}")
        print(f"  Temp coeff    : {r[5]:+.1f} MW per °F")
        print(f"  YoY growth    : {r[6]:+.2f}%")
        print(f"  Sample days   : {r[7]}  |  Outliers: {r[8]}")

    print("\n── Top Black Swan Events ─────────────────────────")
    async with conn.cursor() as cur:
        await cur.execute("""
            SELECT event_date, zone, hour_ending, actual_mw,
                   expected_mw, deviation_sigma, direction, auto_label
            FROM ercot_black_swan_events
            ORDER BY ABS(deviation_sigma) DESC
            LIMIT 15
        """)
        bsrows = await cur.fetchall()

    print(f"  {'Date':<12} {'Zone':<8} {'HE':<4} {'Actual':>10} "
          f"{'Expected':>10} {'Sigma':>7} {'Dir':<5} Label")
    print("  " + "-"*80)
    for r in bsrows:
        print(f"  {str(r[0]):<12} {r[1]:<8} {r[2]:<4} "
              f"{r[3]:>10,.0f} {r[4]:>10,.0f} "
              f"{r[5]:>7.2f} {r[6]:<5} {r[7]}")

    print("\n── Black Swan Summary by Label ───────────────────")
    async with conn.cursor() as cur:
        await cur.execute("""
            SELECT auto_label, COUNT(DISTINCT event_date) as days,
                   COUNT(*) as hours, direction
            FROM ercot_black_swan_events
            GROUP BY auto_label, direction
            ORDER BY days DESC
        """)
        summary = await cur.fetchall()
    for r in summary:
        print(f"  {r[0]:<35} {r[3]:<5} {r[1]:>3} days  {r[2]:>5} hours")

    conn.close()

if __name__ == "__main__":
    asyncio.run(main())
