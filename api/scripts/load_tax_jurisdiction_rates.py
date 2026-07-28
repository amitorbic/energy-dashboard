"""
One-time loader: rebuilds tax_jurisdiction_rates from
api/reference_data/city-rates.xlsx (sheet "Jul26") per migrations
010/011. Run once; not wired into the app.
"""
import os
import openpyxl
import pymysql
from dotenv import load_dotenv

load_dotenv()

XLSX_PATH = os.path.join(os.path.dirname(__file__), "..", "reference_data", "city-rates.xlsx")
MIGRATIONS_DIR = os.path.join(os.path.dirname(__file__), "..", "migrations")
EFFECTIVE_FROM = "2026-07-01"
STATE_TAX_RATE = "0.062500"

NA_STRINGS = {"n/a", "N/A"}


def clean(v):
    if isinstance(v, str):
        v = v.strip()
        if v in NA_STRINGS or v == "":
            return None
    return v


def load_rows():
    wb = openpyxl.load_workbook(XLSX_PATH, data_only=True, read_only=True)
    ws = wb["Jul26"]
    raw = list(ws.iter_rows(min_row=2, max_col=22, values_only=True))
    rows = []
    for r in raw:
        if r[0] == "End of Worksheet" or all(v is None for v in r):
            continue
        rows.append([clean(v) for v in r])
    return rows


def to_row_tuple(r):
    (city_name, city_code, city_tax,
     county_name, county_code, county_tax,
     spd_name, spd_code, spd_tax,
     spd2_name, spd2_code, spd2_tax,
     spd3_name, spd3_code, spd3_tax,
     tr_name, tr_code, tr_tax,
     tr2_name, tr2_code, tr2_tax,
     total_tax) = r

    return (
        city_name if city_name is not None else "N/A",
        city_code, city_tax or 0,
        county_name if county_name is not None else "N/A",
        county_code, county_tax or 0,
        spd_name, spd_code, spd_tax or 0,
        spd2_name, spd2_code, spd2_tax,
        spd3_name, spd3_code, spd3_tax,
        tr_name, tr_code, tr_tax or 0,
        tr2_name, tr2_code, tr2_tax,
        total_tax,
        STATE_TAX_RATE,
        EFFECTIVE_FROM,
    )


INSERT_SQL = """
INSERT INTO tax_jurisdiction_rates (
    city_name, city_code, city_tax_rate,
    county_name, county_code, county_tax_rate,
    spdt_name, spdt_code, spdt_tax_rate,
    spdt2_name, spdt2_code, spdt2_tax_rate,
    spd3_name, spd3_code, spd3_tax_rate,
    transit_name, transit_code, transit_tax_rate,
    transit2_name, transit2_code, transit2_tax_rate,
    total_tax_rate,
    state_tax_rate,
    effective_from
) VALUES (
    %s, %s, %s,
    %s, %s, %s,
    %s, %s, %s,
    %s, %s, %s,
    %s, %s, %s,
    %s, %s, %s,
    %s, %s, %s,
    %s,
    %s,
    %s
)
"""


def run_sql_file(cur, path):
    with open(path, "r", encoding="utf-8") as f:
        lines = f.readlines()
    code = "\n".join(line for line in lines if not line.strip().startswith("--"))
    for stmt in code.split(";"):
        stmt = stmt.strip()
        if stmt:
            cur.execute(stmt)


def column_exists(cur, table, column):
    cur.execute(
        "SELECT COUNT(*) FROM information_schema.columns "
        "WHERE table_schema = DATABASE() AND table_name = %s AND column_name = %s",
        (table, column),
    )
    return cur.fetchone()[0] > 0


def main():
    rows = load_rows()
    print(f"Parsed {len(rows)} data rows from city-rates.xlsx (sheet Jul26)")

    conn = pymysql.connect(
        host=os.getenv("DB_HOST", "localhost"),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASSWORD", ""),
        database=os.getenv("DB_NAME", "u972964962_orbic"),
        port=int(os.getenv("DB_PORT", "3306")),
    )
    try:
        cur = conn.cursor()

        run_sql_file(cur, os.path.join(MIGRATIONS_DIR, "010_rebuild_tax_jurisdiction_rates.sql"))
        conn.commit()
        print("Migration 010 applied: tax_jurisdiction_rates dropped and recreated.")

        cur.executemany(INSERT_SQL, [to_row_tuple(r) for r in rows])
        conn.commit()
        print(f"Loaded {cur.rowcount if cur.rowcount != -1 else len(rows)} rows into tax_jurisdiction_rates.")

        cur.execute("SELECT COUNT(*) FROM tax_jurisdiction_rates")
        print("Table row count now:", cur.fetchone()[0])

        if column_exists(cur, "contract_renewal", "premise_county"):
            print("contract_renewal.premise_county already exists — skipping migration 011.")
        else:
            run_sql_file(cur, os.path.join(MIGRATIONS_DIR, "011_add_premise_county_to_contract_renewal.sql"))
            conn.commit()
            print("Migration 011 applied: contract_renewal.premise_county added.")

        cur.execute(
            "SELECT COUNT(*), SUM(premise_county IS NULL) FROM contract_renewal"
        )
        total, null_count = cur.fetchone()
        print(f"contract_renewal: {total} total rows, {null_count} with premise_county NULL "
              f"({'OK, all NULL' if total == null_count else 'MISMATCH'})")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
