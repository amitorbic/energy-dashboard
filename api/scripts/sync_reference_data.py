"""
One-directional sync of SHARED_REFERENCE_TABLES rows: shared source DB ->
every tenant DB. Never the reverse, never tenant-to-tenant.

This is a standalone process -- the ONLY thing that ever performs this
copy. No tenant's own FastAPI process holds a connection to another
tenant's DB or to the source DB at request time; this script opens one
server-level connection, does the copy using same-server cross-database
SQL (every tenant DB lives on the same MySQL server today, same as
provision_tenant.py already assumes), and exits.

Two modes, both idempotent (INSERT IGNORE, safe to re-run):

  --mode incremental --table T [--table T2 ...]
      Fast path: copies only rows with id > this tenant's last_source_id
      for T. Called by a scraper immediately after it commits new rows
      (see utils/trigger_reference_sync.py, wired into
      scraper_ercot_lfc.py / scraper_ercot_market_prices.py) -- propagates
      just the new data, right away. Also what provision_tenant.py calls
      (via --tenant-db) to give a brand new tenant its initial full copy --
      with no prior state, id > 0 correctly captures everything that
      exists in the source today.

  --mode reconcile [--table T ...]   (default: every table in the registry)
      Slow path: full anti-join against the table's real UNIQUE KEY (not
      just id), so it catches gaps even if id-based bookkeeping ever got
      out of sync (e.g. a run that failed partway through). Meant to run
      nightly (see ecosystem.reference-sync.config.js) -- this is the
      ONLY sync path for the registry tables with no live scraper trigger
      today (see SHARED_REFERENCE_TABLES' own has_live_trigger flag).

  --tenant-db <db_name>
      Restrict to one tenant DB instead of every active tenant in
      orbic_master.reps.

Every table sync updates reference_sync_state in the TENANT db (this
tenant's last_synced_at/last_source_id for that table). When a full fleet
cycle (no --tenant-db) succeeds for every active tenant, it also updates
reference_sync_source_status in the SOURCE db -- "when did we last
successfully push this table to everyone."

Run from api/:
    python scripts/sync_reference_data.py --mode reconcile
    python scripts/sync_reference_data.py --mode incremental --table ercot_lfc_history
"""
import argparse
import asyncio
import os
import sys
from datetime import datetime

_API_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _API_DIR)

from dotenv import load_dotenv
load_dotenv()

import aiomysql

from utils.shared_reference_tables import SHARED_REFERENCE_TABLES, SharedTable, get_table

_DB_HOST     = os.getenv("DB_HOST", "localhost")
_DB_PORT     = int(os.getenv("DB_PORT", "3306"))
_DB_USER     = os.getenv("DB_USER", "root")
_DB_PASSWORD = os.getenv("DB_PASSWORD", "")
_SOURCE_DB   = os.getenv("DB_NAME", "u972964962_orbic")
_MASTER_DB   = os.getenv("MASTER_DB_NAME", "orbic_master")


# ── Connection ─────────────────────────────────────────────────────────────────

async def _connect() -> aiomysql.Connection:
    """Server-level connection (no default db) -- every statement below
    fully-qualifies db.table so it can read/write across databases on this
    one MySQL server, the same assumption provision_tenant.py already makes."""
    return await aiomysql.connect(
        host=_DB_HOST, port=_DB_PORT, user=_DB_USER, password=_DB_PASSWORD,
        charset="utf8mb4", autocommit=True,
    )


async def _active_tenant_dbs(conn: aiomysql.Connection) -> list[str]:
    cur = await conn.cursor()
    try:
        await cur.execute(f"SELECT db_name FROM `{_MASTER_DB}`.reps WHERE status = 'active'")
        return [row[0] for row in await cur.fetchall()]
    finally:
        await cur.close()


# ── State tracking ─────────────────────────────────────────────────────────────

async def _get_tenant_last_id(conn: aiomysql.Connection, tenant_db: str, table: str) -> int:
    cur = await conn.cursor()
    try:
        await cur.execute(
            f"SELECT last_source_id FROM `{tenant_db}`.reference_sync_state WHERE table_name = %s",
            (table,),
        )
        row = await cur.fetchone()
        return row[0] if row else 0
    finally:
        await cur.close()


async def _set_tenant_state(
    conn: aiomysql.Connection, tenant_db: str, table: str, last_source_id: int, rows_synced: int
) -> None:
    cur = await conn.cursor()
    try:
        await cur.execute(
            f"""
            INSERT INTO `{tenant_db}`.reference_sync_state
                (table_name, last_synced_at, last_source_id, rows_synced)
            VALUES (%s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                last_synced_at = VALUES(last_synced_at),
                last_source_id = VALUES(last_source_id),
                rows_synced    = rows_synced + VALUES(rows_synced)
            """,
            (table, datetime.now(), last_source_id, rows_synced),
        )
    finally:
        await cur.close()


async def _set_source_status(
    conn: aiomysql.Connection, table: str, last_source_id: int, tenants_synced: int
) -> None:
    cur = await conn.cursor()
    try:
        await cur.execute(
            f"""
            INSERT INTO `{_SOURCE_DB}`.reference_sync_source_status
                (table_name, last_synced_at, last_source_id, tenants_synced)
            VALUES (%s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                last_synced_at = VALUES(last_synced_at),
                last_source_id = GREATEST(last_source_id, VALUES(last_source_id)),
                tenants_synced = VALUES(tenants_synced)
            """,
            (table, datetime.now(), last_source_id, tenants_synced),
        )
    finally:
        await cur.close()


# ── Copy strategies ────────────────────────────────────────────────────────────

async def _sync_incremental(conn: aiomysql.Connection, table: SharedTable, tenant_db: str) -> int:
    last_id = await _get_tenant_last_id(conn, tenant_db, table.name)
    cur = await conn.cursor()
    try:
        await cur.execute(
            f"INSERT IGNORE INTO `{tenant_db}`.`{table.name}` "
            f"SELECT * FROM `{_SOURCE_DB}`.`{table.name}` WHERE id > %s ORDER BY id",
            (last_id,),
        )
        copied = cur.rowcount
        await cur.execute(f"SELECT MAX(id) FROM `{_SOURCE_DB}`.`{table.name}`")
        row = await cur.fetchone()
        new_max = row[0] if row and row[0] is not None else last_id
        await _set_tenant_state(conn, tenant_db, table.name, new_max, copied)
        return copied
    finally:
        await cur.close()


async def _sync_reconcile(conn: aiomysql.Connection, table: SharedTable, tenant_db: str) -> int:
    """Full anti-join on the real UNIQUE KEY -- catches gaps regardless of id bookkeeping."""
    join_cond = " AND ".join(f"s.`{k}` <=> t.`{k}`" for k in table.dedup_keys)
    cur = await conn.cursor()
    try:
        await cur.execute(
            f"INSERT IGNORE INTO `{tenant_db}`.`{table.name}` "
            f"SELECT s.* FROM `{_SOURCE_DB}`.`{table.name}` s "
            f"LEFT JOIN `{tenant_db}`.`{table.name}` t ON {join_cond} "
            f"WHERE t.id IS NULL"
        )
        copied = cur.rowcount
        await cur.execute(f"SELECT MAX(id) FROM `{_SOURCE_DB}`.`{table.name}`")
        row = await cur.fetchone()
        new_max = row[0] if row and row[0] is not None else 0
        await _set_tenant_state(conn, tenant_db, table.name, new_max, copied)
        return copied
    finally:
        await cur.close()


# ── Orchestration ──────────────────────────────────────────────────────────────

async def sync(tables: list[str], mode: str, only_tenant_db: str | None = None) -> None:
    conn = await _connect()
    try:
        tenant_dbs = [only_tenant_db] if only_tenant_db else await _active_tenant_dbs(conn)
        if not tenant_dbs:
            print("No active tenants found -- nothing to sync.")
            return

        for name in tables:
            table = get_table(name)
            total_copied = 0
            tenants_ok = 0
            for tenant_db in tenant_dbs:
                try:
                    if mode == "incremental":
                        copied = await _sync_incremental(conn, table, tenant_db)
                    else:
                        copied = await _sync_reconcile(conn, table, tenant_db)
                    total_copied += copied
                    tenants_ok += 1
                    print(f"  [{mode}] {table.name} -> {tenant_db}: {copied} row(s)")
                except Exception as e:
                    print(f"  [{mode}] {table.name} -> {tenant_db}: FAILED -- {e}")

            # Only a real fleet-wide cycle (no --tenant-db restriction) updates
            # the source-side "pushed to everyone" status.
            if only_tenant_db is None and tenants_ok == len(tenant_dbs) and tenants_ok > 0:
                cur = await conn.cursor()
                try:
                    await cur.execute(f"SELECT MAX(id) FROM `{_SOURCE_DB}`.`{table.name}`")
                    row = await cur.fetchone()
                finally:
                    await cur.close()
                await _set_source_status(conn, table.name, row[0] or 0, tenants_ok)

            print(
                f"[{mode}] {table.name}: {total_copied} total row(s) across "
                f"{tenants_ok}/{len(tenant_dbs)} tenant(s)"
            )
    finally:
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Sync SHARED_REFERENCE_TABLES rows: source DB -> tenant DB(s)"
    )
    parser.add_argument("--mode", choices=["incremental", "reconcile"], default="reconcile")
    parser.add_argument(
        "--table", action="append", default=None,
        help="Repeatable. Defaults to every table in SHARED_REFERENCE_TABLES.",
    )
    parser.add_argument(
        "--tenant-db", default=None,
        help="Restrict to one tenant DB (e.g. provision_tenant.py seeding a brand new tenant).",
    )
    args = parser.parse_args()

    tables = args.table or [t.name for t in SHARED_REFERENCE_TABLES]
    unknown = [t for t in tables if get_table(t, silent=True) is None]
    if unknown:
        sys.exit(f"ERROR: not in SHARED_REFERENCE_TABLES: {', '.join(unknown)}")

    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(sync(tables, args.mode, args.tenant_db))


if __name__ == "__main__":
    main()
