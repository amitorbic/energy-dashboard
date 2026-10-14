"""
Backstop for the contract_renewal -> portfolio_contracts one-way sync
(see migration 048's AFTER INSERT/UPDATE/DELETE triggers on contract_renewal).
Same two-leg standard as the shared-reference-data sync
(utils/shared_reference_tables.py / sync_reference_data.py): an event-driven
trigger for the common case, this script as the full anti-join for anything
the trigger structurally can't catch. It is configured to run nightly at 2:15 AM CT
as pm2 app "portfolio-contracts-reconcile" in ecosystem.reference-sync.config.js
(VPS config; whether it is running live cannot be checked from the repo). It
can also be run by hand.

The specific gap a trigger can't close on its own: MySQL TRUNCATE does not
fire DELETE triggers (it's DDL). The bulk contract_renewal upload no longer
truncates (it 409s unless the table is empty), but a manual TRUNCATE or a
direct DB edit could still leave portfolio_contracts rows whose
synced_from_serial points at a missing row; this script drops those.
This is same-database sync (within
one tenant), unlike sync_reference_data.py's cross-database copy — no
`db1`.`table` qualification needed, every statement runs against whichever
single DB this script is pointed at for that tenant.

After syncing it also reports contract_renewal rows the sync skips
(contract_renewal_unsynced view, migration 053): counts by reason, then the
rows with the ESI ID masked. It never modifies contract_renewal.

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
# contract_type normalization CASE expression for the forward sync.
# Maps legacy/unknown values to canonical Portfolio vocabulary:
#   Default (any case/trim)         -> MTM
#   NULL or blank + past end_date   -> MTM   (legacy rule; new NULLs blocked at write time)
#   NULL or blank + future end_date -> Fix   (legacy rule)
#   NULL or blank + bad/NULL end    -> Unknown
#   known types (case-insensitive)  -> canonical form
#   any other non-blank type        -> Unknown
#
# Uses single-percent %m/%d/%Y because this string is passed as a raw SQL
# string to aiomysql cursor.execute() with no arguments, so Python's
# DB-API %-substitution does NOT run on it.
# If you move this into a SQLAlchemy text() call with bind params, you must
# double all % to %%.  See utils/contract_type_utils.py SYNC_TYPE_CASE_DOUBLE_PCT.
#
# Mirror of the CASE expression in migration 052 SQL triggers. If you change
# this mapping, update migration 052 (and any successor trigger migration) too.
_CONTRACT_TYPE_NORM_EXPR = """
    CASE
      WHEN TRIM(LOWER(COALESCE(contract_type, ''))) = 'default'
        THEN 'MTM'
      WHEN TRIM(COALESCE(contract_type, '')) = ''
        THEN CASE
          WHEN STR_TO_DATE(contract_end_date, '%m/%d/%Y') IS NOT NULL
               AND STR_TO_DATE(contract_end_date, '%m/%d/%Y') < CURDATE()
            THEN 'MTM'
          WHEN STR_TO_DATE(contract_end_date, '%m/%d/%Y') IS NOT NULL
               AND STR_TO_DATE(contract_end_date, '%m/%d/%Y') >= CURDATE()
            THEN 'Fix'
          ELSE 'Unknown'
        END
      WHEN TRIM(LOWER(contract_type)) IN ('fix', 'fixed')  THEN 'Fix'
      WHEN TRIM(LOWER(contract_type)) = 'future'           THEN 'Future'
      WHEN TRIM(LOWER(contract_type)) = 'lmp'              THEN 'LMP'
      WHEN TRIM(LOWER(contract_type)) = 'mtm'              THEN 'MTM'
      WHEN TRIM(LOWER(contract_type)) = 'mcp'              THEN 'MCP'
      WHEN TRIM(LOWER(contract_type)) = 'mcp2'             THEN 'MCP2'
      ELSE 'Unknown'
    END
""".strip()

_FORWARD_SYNC_SQL = f"""
    INSERT INTO portfolio_contracts
        (esi_id, load_profile, contract_rate, annual_volume, contract_end_date,
         contract_type, company_name, broker_code, source, synced_from_serial)
    SELECT premise_id, load_profile, contract_rate, contract_renewal_usage,
           STR_TO_DATE(contract_end_date, '%m/%d/%Y'),
           {_CONTRACT_TYPE_NORM_EXPR},
           company_name, broker_code, 'synced', serial
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


_UNSYNCED_COUNTS_SQL = "SELECT reason, COUNT(*) FROM contract_renewal_unsynced GROUP BY reason ORDER BY reason"
_UNSYNCED_ROWS_SQL = (
    "SELECT reason, serial, premise_id, load_profile, contract_end_date, contract_type "
    "FROM contract_renewal_unsynced ORDER BY reason, serial"
)


def mask_esi(esi) -> str:
    if esi is None:
        return "<NULL>"
    s = str(esi)
    flag = " [has whitespace/newline]" if any(ch.isspace() for ch in s) else ""
    s = s.strip()
    return (s[:2] + "*" * max(len(s) - 6, 0) + s[-4:] if len(s) > 6 else "*" * len(s)) + flag


async def unsynced_report(cur) -> list[str]:
    await cur.execute("SHOW FULL TABLES LIKE 'contract_renewal_unsynced'")
    if not await cur.fetchone():
        return ["    unsynced report skipped -- migration 053 not applied to this DB"]
    await cur.execute(_UNSYNCED_COUNTS_SQL)
    counts = {r[0]: r[1] for r in await cur.fetchall()}
    total = sum(counts.values())
    lines = [f"    contract_renewal rows NOT synced to Portfolio: {total}"]
    for reason, n in counts.items():
        lines.append(f"      {reason}: {n}")
    if total:
        await cur.execute(_UNSYNCED_ROWS_SQL)
        cur_reason = None
        for reason, serial, esi, lp, end, ctype in await cur.fetchall():
            if reason != cur_reason:
                lines.append(f"    -- {reason}")
                cur_reason = reason
            lines.append(
                f"       serial={serial} esi={mask_esi(esi)} load_profile={lp!r} "
                f"end_date={end!r} type={ctype!r}"
            )
    return lines


async def reconcile_tenant(db_name: str, report_only: bool = False) -> str:
    conn = await _connect(db_name)
    try:
        cur = await conn.cursor()
        try:
            if report_only:
                return "report-only (no sync run)\n" + "\n".join(await unsynced_report(cur))

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

            report = "\n".join(await unsynced_report(cur))
            return (
                f"OK -- forward sync touched {synced} row(s), "
                f"dropped {orphaned} orphaned + {no_longer_visible} no-longer-visible synced row(s)\n"
                + report
            )
        finally:
            await cur.close()
    finally:
        conn.close()


async def main_async(only_tenant_db: str | None, report_only: bool = False) -> None:
    tenant_dbs = [only_tenant_db] if only_tenant_db else await _active_tenant_dbs()
    if not tenant_dbs:
        print("No active tenants found -- nothing to reconcile.")
        return

    for db_name in tenant_dbs:
        try:
            result = await reconcile_tenant(db_name, report_only)
            print(f"  {db_name}: {result}")
        except Exception as e:
            print(f"  {db_name}: FAILED -- {e}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Reconcile (scheduled nightly via pm2 on the VPS; also runnable by hand): contract_renewal -> portfolio_contracts (full-4-module tenants only)"
    )
    parser.add_argument(
        "--report-only", action="store_true",
        help="Only print the unsynced-rows report; run none of the sync/delete statements.",
    )
    parser.add_argument(
        "--tenant-db", default=None,
        help="Restrict to one tenant DB instead of every active tenant in orbic_master.reps.",
    )
    args = parser.parse_args()

    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main_async(args.tenant_db, args.report_only))


if __name__ == "__main__":
    main()
