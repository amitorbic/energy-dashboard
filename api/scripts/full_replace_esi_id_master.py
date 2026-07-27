"""
Monthly full-replacement refresh for esi_id_master (Part C, ongoing update
strategy #1).

Loads a fresh extract of all 11 source CSVs into `esi_id_master_staging`,
builds the same secondary indexes as the live table, then atomically swaps
it in with RENAME TABLE (single statement -- readers never see a half-empty
table). The previous live table is kept, renamed with a timestamp suffix,
instead of dropped, so a bad monthly extract can be rolled back by hand.

Resumable per file: if interrupted mid-run, re-running skips any
source_file already present in esi_id_master_staging. Safe because the
staging table is only truncated/recreated at the very start of a run
(when it doesn't already exist), never mid-run.
"""
import sys
import time

from esi_master_common import FILES, SRC_DIR, load_sql_for_table, connect

STAGING_TABLE = "esi_id_master_staging"
LIVE_TABLE = "esi_id_master"


def staging_exists(cur):
    cur.execute(f"SHOW TABLES LIKE '{STAGING_TABLE}'")
    return cur.fetchone() is not None


def create_staging_table(conn):
    cur = conn.cursor()
    cur.execute(f"CREATE TABLE `{STAGING_TABLE}` LIKE `{LIVE_TABLE}`")
    conn.commit()


def already_in_staging(cur, fname):
    cur.execute(f"SELECT 1 FROM `{STAGING_TABLE}` WHERE source_file=%s LIMIT 1", (fname,))
    return cur.fetchone() is not None


def load_one_file(conn, fname, sql_template):
    cur = conn.cursor()
    path = (SRC_DIR + "\\" + fname).replace("\\", "/")
    started = time.strftime("%Y-%m-%d %H:%M:%S")
    print(f"[staging:{fname}] loading...", flush=True)
    t0 = time.time()
    try:
        cur.execute(sql_template, (path, fname))
        affected = cur.rowcount
        cur.execute(
            "INSERT INTO load_history (file_name, load_type, row_count, started_at, completed_at, status) "
            "VALUES (%s,'full',%s,%s,NOW(),'success')",
            (fname, affected, started),
        )
        conn.commit()
        print(f"[staging:{fname}] OK rows_affected={affected} {time.time()-t0:.1f}s", flush=True)
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
        print(f"[staging:{fname}] FAILED: {e}", file=sys.stderr, flush=True)
        return False


def build_indexes(conn):
    cur = conn.cursor()
    print("Building indexes on staging table...", flush=True)
    t0 = time.time()
    cur.execute(
        f"ALTER TABLE `{STAGING_TABLE}` "
        "ADD INDEX idx_address_search (zipcode, city, address), "
        "ADD INDEX idx_city (city), "
        "ADD INDEX idx_duns (duns)"
    )
    conn.commit()
    print(f"Indexes built in {time.time()-t0:.1f}s", flush=True)


def swap_in(conn):
    cur = conn.cursor()
    prev_name = f"esi_id_master_prev_{time.strftime('%Y%m%d_%H%M%S')}"
    print(f"Swapping staging in, previous live table -> {prev_name}", flush=True)
    cur.execute(f"RENAME TABLE `{LIVE_TABLE}` TO `{prev_name}`, `{STAGING_TABLE}` TO `{LIVE_TABLE}`")
    conn.commit()
    return prev_name


def main():
    conn = connect()
    cur = conn.cursor()

    if staging_exists(cur):
        print(f"Resuming existing {STAGING_TABLE} (found from a prior interrupted run).", flush=True)
    else:
        create_staging_table(conn)

    sql_template = load_sql_for_table(STAGING_TABLE)

    results = {}
    for fname in FILES:
        if already_in_staging(cur, fname):
            print(f"[staging:{fname}] already loaded, skipping", flush=True)
            results[fname] = "skipped"
            continue
        ok = load_one_file(conn, fname, sql_template)
        results[fname] = "success" if ok else "failed"

    if any(v == "failed" for v in results.values()):
        print(
            "One or more files failed to load into staging -- aborting before swap. "
            "Re-run this script after investigating; already-loaded files will be skipped.",
            file=sys.stderr,
        )
        conn.close()
        sys.exit(1)

    build_indexes(conn)
    prev_name = swap_in(conn)

    cur = conn.cursor()
    cur.execute(f"SELECT COUNT(*) FROM `{LIVE_TABLE}`")
    total = cur.fetchone()[0]
    print("\n=== SUMMARY ===")
    for fname, status in results.items():
        print(f"  {fname}: {status}")
    print(f"Total rows in new {LIVE_TABLE}: {total}")
    print(f"Previous live table retained as: {prev_name} (drop manually once verified)")

    conn.close()


if __name__ == "__main__":
    main()
