"""
Daily incremental update for esi_id_master (Part C, ongoing update
strategy #2).

Loads delta extract file(s) into a fresh `esi_id_master_delta` staging
table, then applies them to the live table with
INSERT ... ON DUPLICATE KEY UPDATE keyed on esi_id. STATUS transitions --
including a switch to De-Energized -- are just normal column updates here;
there is no separate "removal" path, since ESI IDs are never deleted.

Usage:
    python incremental_update_esi_id_master.py [file1.csv file2.csv ...]

With no arguments, reloads all files in esi_master_common.FILES as deltas
(harmless idempotent re-apply). In production, pass only the TDSP delta
file(s) actually received that day.
"""
import sys
import time

from esi_master_common import FILES, SRC_DIR, UPSERT_COLUMNS, load_sql_for_table, connect

STAGING_TABLE = "esi_id_master_delta"
LIVE_TABLE = "esi_id_master"


def recreate_staging_table(conn):
    cur = conn.cursor()
    cur.execute(f"DROP TABLE IF EXISTS `{STAGING_TABLE}`")
    cur.execute(f"CREATE TABLE `{STAGING_TABLE}` LIKE `{LIVE_TABLE}`")
    conn.commit()


def load_one_file(conn, fname, sql_template):
    cur = conn.cursor()
    path = (SRC_DIR + "\\" + fname).replace("\\", "/")
    started = time.strftime("%Y-%m-%d %H:%M:%S")
    print(f"[delta:{fname}] loading...", flush=True)
    t0 = time.time()
    try:
        cur.execute(sql_template, (path, fname))
        affected = cur.rowcount
        cur.execute(
            "INSERT INTO load_history (file_name, load_type, row_count, started_at, completed_at, status) "
            "VALUES (%s,'incremental',%s,%s,NOW(),'success')",
            (fname, affected, started),
        )
        conn.commit()
        print(f"[delta:{fname}] OK rows_affected={affected} {time.time()-t0:.1f}s", flush=True)
        return True
    except Exception as e:
        conn.rollback()
        cur2 = conn.cursor()
        cur2.execute(
            "INSERT INTO load_history (file_name, load_type, row_count, started_at, completed_at, status) "
            "VALUES (%s,'incremental',0,%s,NOW(),'failed')",
            (fname, started),
        )
        conn.commit()
        print(f"[delta:{fname}] FAILED: {e}", file=sys.stderr, flush=True)
        return False


def apply_upsert(conn):
    cur = conn.cursor()
    set_clause = ", ".join(f"{c}=VALUES({c})" for c in UPSERT_COLUMNS)
    cols = ", ".join(["esi_id"] + UPSERT_COLUMNS)
    sql = (
        f"INSERT INTO `{LIVE_TABLE}` ({cols}) "
        f"SELECT {cols} FROM `{STAGING_TABLE}` "
        f"ON DUPLICATE KEY UPDATE {set_clause}"
    )
    print("Applying upsert into live table...", flush=True)
    t0 = time.time()
    cur.execute(sql)
    affected = cur.rowcount
    conn.commit()
    print(
        f"Upsert done in {time.time()-t0:.1f}s, rowcount={affected} "
        "(MySQL counts a changed row as 2, an inserted row as 1)",
        flush=True,
    )
    return affected


def main(delta_files=None):
    files = delta_files or FILES
    conn = connect()
    recreate_staging_table(conn)
    sql_template = load_sql_for_table(STAGING_TABLE)

    results = {}
    for fname in files:
        ok = load_one_file(conn, fname, sql_template)
        results[fname] = "success" if ok else "failed"

    if any(v == "failed" for v in results.values()):
        print("One or more delta files failed to load -- aborting before upsert.", file=sys.stderr)
        conn.close()
        sys.exit(1)

    affected = apply_upsert(conn)

    cur = conn.cursor()
    cur.execute(f"SELECT COUNT(*) FROM `{LIVE_TABLE}`")
    total = cur.fetchone()[0]
    print("\n=== SUMMARY ===")
    for fname, status in results.items():
        print(f"  {fname}: {status}")
    print(f"Upsert rowcount (2=updated,1=inserted, summed): {affected}")
    print(f"Total rows in {LIVE_TABLE}: {total}")

    conn.close()


if __name__ == "__main__":
    main(sys.argv[1:] or None)
