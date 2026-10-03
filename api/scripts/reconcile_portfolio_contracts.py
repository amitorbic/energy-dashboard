"""
Nightly backstop for the contract_renewal -> portfolio_contracts one-way sync
(see migration 048's AFTER INSERT/UPDATE/DELETE triggers on contract_renewal).
Same two-leg standard as the shared-reference-data sync
(utils/shared_reference_tables.py / sync_reference_data.py): an event-driven
trigger for the common case, this script as the periodic full anti-join for
anything the trigger structurally can't catch.

The specific gap a trigger can't close on its own: MySQL TRUNCATE does not
fire DELETE triggers (it's DDL). The existing bulk contract_renewal upload
(routers/contract_renewal.py's POST /upload) does
`TRUNCATE TABLE contract_renewal` then reinserts every row — AFTER INSERT
re-syncs each new row fine, but any portfolio_contracts row whose
synced_from_serial pointed at a pre-truncate row that isn't in the new file
is left orphaned until this script runs. This is same-database sync (within
one tenant), unlike sync_reference_data.py's cross-database copy — no
`db1`.`table` qualification needed, every statement runs against whichever
single DB this script is pointed at for that tenant.

This is entirely SEPARATE from that reference-data sync: different tables,
different direction semantics, its own reconcile cadence. Deliberately not
folded into sync_reference_data.py.

Only ever acts on tenants with portfolio_contracts_sync_state.is_full_tenant
= 1 — portfolio-only tenants never sync from contract_renewal, full stop;
their portfolio_contracts rows come exclusively from the admin upload
endpoint (see routers/admin_portfolio_contracts.py).

Run from api/:
    python scripts/reconcile_portfolio_contracts.py
    python scripts/reconcile_portfolio_contracts.py --tenant-db tenant_test_rep
"""
import argparse
import asyncio
import os
import sys

_API_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _API_DIR)

from dotenv import load_dotenv
load_dotenv()

import aiomysql

_DB_HOST     = os.getenv("DB_HOST", "localhost")
_DB_PORT     = int(os.getenv("DB_PORT", "3306"))
_DB_USER     = os.getenv("DB_USER", "root")
_DB_PASSWORD = os.getenv("DB_PASSWORD", "")
_MASTER_DB   = os.getenv("MASTER_DB_NAME", "orbic_master")

# Same visibility gate the triggers use (and the admin router's /upgrade
# endpoint) — a contract_renewal row that wouldn't be visible in the old
# portfolio_view isn't a valid sync candidate here either.
_FORWARD_SYNC_SQL = """
    INSERT INTO portfolio_contracts
        (esi_id, load_profile, contract_rate, annual_volume, contract_end_date,
         contract_type, company_name, broker_code, source, synced_from_serial)
    SELECT premise_id, load_profile, contract_rate, contract_renewal_usage,
           STR_TO_DATE(contract_end_date, '%m/%d/%Y'), contract_type, company_name,
           broker_code, 'synced', serial
    FROM contract_renewal
    WHERE premise_id IS NOT NULL
      AND load_profile IS NOT NULL
      AND STR_TO_DATE(contract_end_date, '%m/%d/%Y') IS NOT NULL
    ON DUPLICATE KEY UPDATE
        esi_id = VALUES(esi_id), load_profile = VALUES(load_profile),
        contract_rate = VALUES(contract_rate), annual_volume = VALUES(annual_volume),
        contract_end_date = VALUES(contract_end_date), contract_type = VALUES(contract_type),
        company_name = VALUES(company_name), broker_code = VALUES(broker_code), source = 'synced'
"""

# Backward leg 1: the contract_renewal row is just gone (TRUNCATE, or a real
# DELETE that somehow bypassed the AFTER DELETE trigger).
_DROP_ORPHANED_SQL = """
    DELETE pc FROM portfolio_contracts pc
    LEFT JOIN contract_renewal cr ON cr.serial = pc.synced_from_serial
    WHERE pc.source = 'synced' AND cr.serial IS NULL
"""

# Backward leg 2: the contract_renewal row still exists but no longer
# qualifies (cleared premise_id/load_profile, or contract_end_date no
# longer parses) — same condition the AFTER UPDATE trigger checks on write,
# reapplied here in case that edit happened before the trigger existed.
_DROP_NO_LONGER_VISIBLE_SQL = """
    DELETE pc FROM portfolio_contracts pc
    JOIN contract_renewal cr ON cr.serial = pc.synced_from_serial
    WHERE pc.source = 'synced'
      AND (cr.premise_id IS NULL OR cr.load_profile IS NULL
           OR STR_TO_DATE(cr.contract_end_date, '%m/%d/%Y') IS NULL)
"""


async def _connect(db: str) -> aiomysql.Connection:
    return await aiomysql.connect(
        host=_DB_HOST, port=_DB_PORT, user=_DB_USER, password=_DB_PASSWORD,
        db=db, charset="utf8mb4", autocommit=True,
    )


async def _active_tenant_dbs() -> list[str]:
    conn = await _connect(_MASTER_DB)
    try:
        cur = await conn.cursor()
        try:
            await cur.execute("SELECT db_name FROM reps WHERE status = 'active'")
            return [row[0] for row in await cur.fetchall()]
        finally:
            await cur.close()
    finally:
        conn.close()


async def reconcile_tenant(db_name: str) -> str:
    conn = await _connect(db_name)
    try:
        cur = await conn.cursor()
        try:
            await cur.execute("SHOW TABLES LIKE 'portfolio_contracts_sync_state'")
            if not await cur.fetchone():
                return "skipped -- migration 048 not applied to this DB"

            await cur.execute("SELECT is_full_tenant FROM portfolio_contracts_sync_state WHERE id = 1")
            row = await cur.fetchone()
            if not row or not row[0]:
                return "skipped -- portfolio-only tenant (is_full_tenant=0)"

            await cur.execute(_FORWARD_SYNC_SQL)
            synced = cur.rowcount  # MySQL counts 1/insert, 2/update on ON DUPLICATE KEY UPDATE

            await cur.execute(_DROP_ORPHANED_SQL)
            orphaned = cur.rowcount

            await cur.execute(_DROP_NO_LONGER_VISIBLE_SQL)
            no_longer_visible = cur.rowcount

            return (
                f"OK -- forward sync touched {synced} row(s), "
                f"dropped {orphaned} orphaned + {no_longer_visible} no-longer-visible synced row(s)"
            )
        finally:
            await cur.close()
    finally:
        conn.close()


async def main_async(only_tenant_db: str | None) -> None:
    tenant_dbs = [only_tenant_db] if only_tenant_db else await _active_tenant_dbs()
    if not tenant_dbs:
        print("No active tenants found -- nothing to reconcile.")
        return

    for db_name in tenant_dbs:
        try:
            result = await reconcile_tenant(db_name)
            print(f"  {db_name}: {result}")
        except Exception as e:
            print(f"  {db_name}: FAILED -- {e}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Nightly reconcile: contract_renewal -> portfolio_contracts (full-4-module tenants only)"
    )
    parser.add_argument(
        "--tenant-db", default=None,
        help="Restrict to one tenant DB instead of every active tenant in orbic_master.reps.",
    )
    args = parser.parse_args()

    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main_async(args.tenant_db))


if __name__ == "__main__":
    main()
