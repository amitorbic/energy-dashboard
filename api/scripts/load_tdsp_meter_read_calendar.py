"""
Loader for tdsp_meter_read_calendar (migration 040).

Each TDSP publishes its own annual meter-read schedule in its own format
(PDF or spreadsheet) and the source document changes shape/URL year to
year, so this is a manual, per-file, per-year run -- not an automated feed.
Confirmed against the 2026 schedules for Oncor, CenterPoint (IDR/Non-IDR),
TNMP, and the AEP Texas Central/North combined schedule.

Usage:
    python load_tdsp_meter_read_calendar.py --file ONCOR.pdf --format oncor \
        --tdsp-name "Oncor Electric Delivery" --tdsp-duns 1039940674000 --year 2026

    python load_tdsp_meter_read_calendar.py --file Centerpoint-Non-IDR.pdf \
        --format centerpoint --tdsp-name "CenterPoint Energy Houston Electric" --year 2026

    python load_tdsp_meter_read_calendar.py --file "2026 Meter Reading Schedule TNMP.xlsx" \
        --format tnmp --tdsp-name TNMP --year 2026

    python load_tdsp_meter_read_calendar.py --file TexasMeterReadingSchedule2026.xls \
        --format grid --tdsp-name "AEP Texas Central" --year 2026
    python load_tdsp_meter_read_calendar.py --file TexasMeterReadingSchedule2026.xls \
        --format grid --tdsp-name "AEP Texas North" --year 2026

--tdsp-duns is optional. Only Oncor's DUNS is confirmed in this codebase
today (api/controllers/test_data_generator.py); other TDSPs load with
tdsp_duns left NULL until backfilled from real esi_id_master data (see
migration 040 header comment).

Rows are upserted on (tdsp_name, bill_cycle, read_date) -- safe to re-run.
"""
import os
import re
import sys
import argparse
import datetime

import pymysql
import pdfplumber
import pandas as pd
from dotenv import load_dotenv

load_dotenv()


def connect():
    return pymysql.connect(
        host=os.getenv("DB_HOST", "localhost"),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASSWORD", ""),
        database=os.getenv("DB_NAME", "u972964962_orbic"),
        port=int(os.getenv("DB_PORT", "3306")),
        autocommit=False,
    )


def _resolve_year(cell_month: int, column_month: int, target_year: int) -> int:
    """
    Handles the two cross-year cases observed in these schedules: a cycle's
    read date for the "January" bill column can fall in December of the
    prior year, and (rarely, seen once in the AEP grid file) a "December"
    column's read date can fall in January of the next year.
    """
    if cell_month == 12 and column_month == 1:
        return target_year - 1
    if cell_month == 1 and column_month == 12:
        return target_year + 1
    return target_year


# ---------------------------------------------------------------------------
# Oncor: PDF, 6 (Date Day BillCycle DaysServiced) groups per line, two
# half-year blocks. Dates already carry their own 2-digit year -- no
# column/year inference needed.
# ---------------------------------------------------------------------------
_ONCOR_ROW_RE = re.compile(
    r"(\d{2}/\d{2}/\d{2})\s+\w{3}\s+(\d{2})\s+(\d{1,2})"
)


def parse_oncor(path, target_year):
    rows = []
    with pdfplumber.open(path) as pdf:
        text = pdf.pages[0].extract_text()
    for line in text.split("\n"):
        for date_str, cycle, dos in _ONCOR_ROW_RE.findall(line):
            mm, dd, yy = date_str.split("/")
            yyyy = 2000 + int(yy)
            rows.append({
                "bill_cycle": cycle,
                "read_date": datetime.date(yyyy, int(mm), int(dd)),
                "bill_date": None,
                "days_serviced": int(dos),
            })
    return rows


# ---------------------------------------------------------------------------
# CenterPoint: PDF, "Cycle  D-Mon Days  D-Mon Days ... Annual" per line,
# one JAN..DEC header row gives column->month order.
# ---------------------------------------------------------------------------
_MONTH_NAMES = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN",
                "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
_CENTERPOINT_PAIR_RE = re.compile(r"(\d{1,2}-[A-Za-z]{3})\s+(\d{1,3})")
_CENTERPOINT_ROW_RE = re.compile(r"^(\d{1,2})\s+(.*)$")


def parse_centerpoint(path, target_year):
    rows = []
    with pdfplumber.open(path) as pdf:
        text = pdf.pages[0].extract_text()
    for line in text.split("\n"):
        m = _CENTERPOINT_ROW_RE.match(line.strip())
        if not m:
            continue
        cycle, rest = m.group(1), m.group(2)
        pairs = _CENTERPOINT_PAIR_RE.findall(rest)
        if len(pairs) != 12:
            continue  # not a data row (e.g. header repeated mid-page)
        for column_idx, (date_mon, days) in enumerate(pairs):
            column_month = column_idx + 1
            day_str, mon_str = date_mon.split("-")
            cell_month = datetime.datetime.strptime(mon_str, "%b").month
            year = _resolve_year(cell_month, column_month, target_year)
            rows.append({
                "bill_cycle": cycle.zfill(2),
                "read_date": datetime.date(year, cell_month, int(day_str)),
                "bill_date": None,
                "days_serviced": int(days),
            })
    return rows


# ---------------------------------------------------------------------------
# TNMP: xlsx, fixed layout confirmed against the 2026 file -- two half-year
# blocks of 6 months, each month a (Read, Bill Date, DOS, spacer) 4-column
# group; cycle number in column 0 for both halves; data rows 10-19.
# ---------------------------------------------------------------------------
_TNMP_MONTH_COLS = {
    1: 1, 2: 5, 3: 9, 4: 13, 5: 17, 6: 21,
    7: 27, 8: 31, 9: 35, 10: 39, 11: 43, 12: 47,
}


def parse_tnmp(path, target_year):
    df = pd.read_excel(path, sheet_name=0, header=None)
    rows = []
    for r in range(10, df.shape[0]):
        cycle_val = df.iat[r, 0]
        if pd.isna(cycle_val):
            continue
        cycle = str(int(cycle_val)).zfill(2)
        for _month, read_col in _TNMP_MONTH_COLS.items():
            read_val = df.iat[r, read_col]
            if pd.isna(read_val):
                continue
            bill_val = df.iat[r, read_col + 1]
            dos_val = df.iat[r, read_col + 2]
            rows.append({
                "bill_cycle": cycle,
                "read_date": pd.Timestamp(read_val).date(),
                "bill_date": pd.Timestamp(bill_val).date() if pd.notna(bill_val) else None,
                "days_serviced": int(dos_val) if pd.notna(dos_val) else None,
            })
    return rows


# ---------------------------------------------------------------------------
# Generic grid (AEP Texas Central/North shared schedule): row0 = JAN..DEC
# header, col0 = cycle, cells = "M/D" read date with no year.
# ---------------------------------------------------------------------------
def parse_grid(path, target_year):
    df = pd.read_excel(path, sheet_name=0, header=None)
    rows = []
    for r in range(1, df.shape[0]):
        cycle_val = df.iat[r, 0]
        if pd.isna(cycle_val):
            continue
        cycle = str(int(cycle_val)).zfill(2)
        for column_month in range(1, 13):
            cell = df.iat[r, column_month]
            if pd.isna(cell):
                continue
            if isinstance(cell, (datetime.datetime, datetime.date, pd.Timestamp)):
                # Excel auto-parsed this cell as a date (year already resolved by Excel).
                ts = pd.Timestamp(cell)
                rows.append({
                    "bill_cycle": cycle,
                    "read_date": ts.date(),
                    "bill_date": None,
                    "days_serviced": None,
                })
                continue
            cell_month, cell_day = str(cell).strip().split("/")
            cell_month, cell_day = int(cell_month), int(cell_day)
            year = _resolve_year(cell_month, column_month, target_year)
            rows.append({
                "bill_cycle": cycle,
                "read_date": datetime.date(year, cell_month, cell_day),
                "bill_date": None,
                "days_serviced": None,
            })
    return rows


_PARSERS = {
    "oncor": parse_oncor,
    "centerpoint": parse_centerpoint,
    "tnmp": parse_tnmp,
    "grid": parse_grid,
}


def upsert(conn, rows, tdsp_name, tdsp_duns, year, source_file):
    cur = conn.cursor()
    sql = """
        INSERT INTO tdsp_meter_read_calendar
            (tdsp_name, tdsp_duns, year, bill_cycle, read_date, bill_date, days_serviced, source_file)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            tdsp_duns = VALUES(tdsp_duns),
            bill_date = VALUES(bill_date),
            days_serviced = VALUES(days_serviced),
            source_file = VALUES(source_file)
    """
    params = [
        (tdsp_name, tdsp_duns, year, r["bill_cycle"], r["read_date"],
         r["bill_date"], r["days_serviced"], source_file)
        for r in rows
    ]
    cur.executemany(sql, params)
    conn.commit()
    return cur.rowcount


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", required=True)
    ap.add_argument("--format", required=True, choices=_PARSERS.keys())
    ap.add_argument("--tdsp-name", required=True)
    ap.add_argument("--tdsp-duns", default=None)
    ap.add_argument("--year", type=int, default=2026)
    args = ap.parse_args()

    parser = _PARSERS[args.format]
    rows = parser(args.file, args.year)
    if not rows:
        print(f"No rows parsed from {args.file} -- check --format matches the file.", file=sys.stderr)
        sys.exit(1)

    conn = connect()
    affected = upsert(conn, rows, args.tdsp_name, args.tdsp_duns, args.year, os.path.basename(args.file))
    conn.close()

    cycles = sorted(set(r["bill_cycle"] for r in rows))
    print(f"[{args.tdsp_name}] parsed {len(rows)} rows, {len(cycles)} bill cycles "
          f"({cycles[0]}..{cycles[-1]}), upserted (rowcount={affected})")


if __name__ == "__main__":
    main()
