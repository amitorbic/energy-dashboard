"""
Bulk loader for esi_id_master (migration 018).

Resumable/checkpointable per file: each of the 11 source CSVs is loaded in
its own LOAD DATA INFILE + commit, logged to load_history. Re-running this
script skips any file already logged 'success' for load_type='full', so a
failure partway through only needs to retry the files that didn't finish.

Source files have no header row and 22 positional columns (not the 19 in
the original ERCOT spec) -- see migration 018 comments for the column
mapping (COUNTY at position 6, two premise-subtype columns at the end).

REPLACE semantics resolve the one known in-file duplicate ESI_ID (Oncor,
ESI_ID 10443720009112031) by keeping the later occurrence.
"""
import os
import sys
import time
import pymysql

SRC_DIR = r"C:\Users\Amit\Desktop\ESI ID Database"

FILES = [
    "AEP_CENTRAL__FUL-REPORTS-06-JUL-26.csv",
    "AEP_NORTH____FUL-REPORTS-06-JUL-26.csv",
    "AEP_TEXAS_SP_FUL-REPORTS-06-JUL-26.csv",
    "CENTERPOINT__FUL-REPORTS-06-JUL-26.csv",
    "ENTERGY_GULF_FUL-REPORTS-06-JUL-26.csv",
    "LUBBOCK______FUL-REPORTS-06-JUL-26.csv",
    "NUECES_ELEC__FUL-REPORTS-06-JUL-26.csv",
    "ONCOR_ELEC___FUL-REPORTS-06-JUL-26.csv",
    "SHARYLAND_MCALLEN_FUL-REPORTS-06-JUL-26.csv",
    "SHARYLAND_UTILITIES_FUL-REPORTS-06-JUL-26.csv",
    "SWEPCO_ENERG_FUL-REPORTS-06-JUL-26.csv",
    "TNMP_________FUL-REPORTS-06-JUL-26.csv",
]

LOAD_SQL_TEMPLATE = """
LOAD DATA INFILE %s
REPLACE INTO TABLE esi_id_master
CHARACTER SET utf8mb4
FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
LINES TERMINATED BY '\\n'
(esi_id, address, @address_overflow, city, state, zipcode, @county,
 @duns, @meter_read_cycle, status, @premise_type, @power_region,
 @stationcode, @stationname, @metered, @open_service_orders,
 @polr_customer_class, @settlement_ams_indicator, @tdsp_ams_indicator,
 @switch_hold_indicator, @premise_subtype_code, @premise_subtype_desc)
SET
  address_overflow         = NULLIF(@address_overflow, ''),
  county                    = NULLIF(@county, ''),
  duns                      = NULLIF(@duns, ''),
  meter_read_cycle          = NULLIF(@meter_read_cycle, ''),
  premise_type              = NULLIF(@premise_type, ''),
  power_region              = NULLIF(@power_region, ''),
  stationcode               = NULLIF(@stationcode, ''),
  stationname               = NULLIF(@stationname, ''),
  metered                   = NULLIF(@metered, ''),
  open_service_orders       = NULLIF(@open_service_orders, ''),
  polr_customer_class       = NULLIF(@polr_customer_class, ''),
  settlement_ams_indicator  = NULLIF(@settlement_ams_indicator, ''),
  tdsp_ams_indicator        = NULLIF(@tdsp_ams_indicator, ''),
  switch_hold_indicator     = NULLIF(@switch_hold_indicator, ''),
  premise_subtype_code      = NULLIF(@premise_subtype_code, ''),
  premise_subtype_desc      = NULLIF(@premise_subtype_desc, ''),
  source_file               = %s
"""


def connect():
    return pymysql.connect(
        host="localhost", user="root", password="",
        database="u972964962_orbic", port=3306,
        local_infile=True, autocommit=False,
    )


def already_loaded(cur, fname):
    cur.execute(
        "SELECT 1 FROM load_history WHERE file_name=%s AND load_type='full' "
        "AND status='success' LIMIT 1",
        (fname,),
    )
    return cur.fetchone() is not None


def load_one_file(conn, fname):
    cur = conn.cursor()
    path = os.path.join(SRC_DIR, fname)
    started = time.strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{fname}] loading...", flush=True)
    t0 = time.time()
    try:
        # MySQL LOAD DATA INFILE path uses forward slashes / doubled backslashes safely with '/'
        mysql_path = path.replace("\\", "/")
        cur.execute(LOAD_SQL_TEMPLATE, (mysql_path, fname))
        affected = cur.rowcount
        cur.execute(
            "INSERT INTO load_history (file_name, load_type, row_count, started_at, completed_at, status) "
            "VALUES (%s,'full',%s,%s,NOW(),'success')",
            (fname, affected, started),
        )
        conn.commit()
        dt = time.time() - t0
        print(f"[{fname}] OK  rows_affected={affected}  {dt:.1f}s", flush=True)
        return True
    except Exception as e:
        conn.rollback()
        cur2 = conn.cursor()
        cur2.execute(
            "INSERT INTO load_history (file_name, load_type, row_count, started_at, completed_at, status) "
            "VALUES (%s,'full',0,%s,NOW(),'failed')",
            (fname, started),
        )
        conn.commit()
        print(f"[{fname}] FAILED: {e}", file=sys.stderr, flush=True)
        return False


def main():
    conn = connect()
    cur = conn.cursor()
    cur.execute("SET SESSION FOREIGN_KEY_CHECKS=0")
    cur.execute("SET SESSION UNIQUE_CHECKS=0")

    results = {}
    for fname in FILES:
        if already_loaded(cur, fname):
            print(f"[{fname}] already loaded, skipping", flush=True)
            results[fname] = "skipped"
            continue
        ok = load_one_file(conn, fname)
        results[fname] = "success" if ok else "failed"

    cur.execute("SET SESSION FOREIGN_KEY_CHECKS=1")
    cur.execute("SET SESSION UNIQUE_CHECKS=1")

    cur.execute("SELECT COUNT(*) FROM esi_id_master")
    total = cur.fetchone()[0]
    print("\n=== SUMMARY ===")
    for fname, status in results.items():
        print(f"  {fname}: {status}")
    print(f"Total rows in esi_id_master: {total}")

    conn.close()
    return results, total


if __name__ == "__main__":
    main()
