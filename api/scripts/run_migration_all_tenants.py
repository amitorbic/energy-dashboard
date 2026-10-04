"""
run_migration_all_tenants.py
────────────────────────────
Run a single SQL migration file against every active tenant DB listed in
orbic_master.reps, plus optionally the source DB itself.

Usage:
  python api/scripts/run_migration_all_tenants.py api/migrations/050_future_contract_type.sql
  python api/scripts/run_migration_all_tenants.py api/migrations/050_future_contract_type.sql --include-source
  python api/scripts/run_migration_all_tenants.py api/migrations/050_future_contract_type.sql --dry-run

Flags:
  --include-source   Also run against the source DB (DB_NAME from .env).
  --dry-run          Print the target DBs and the SQL that would run, but
                     execute nothing.

Handles DELIMITER blocks (triggers, procedures) correctly — the same way
the mysql CLI does. Each statement is executed individually so a failure on
one statement rolls back that DB and reports it without stopping other DBs.
"""

import argparse
import asyncio
import os
import re
import sys

import aiomysql
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

_DB_HOST     = os.getenv("DB_HOST", "localhost")
_DB_PORT     = int(os.getenv("DB_PORT", "3306"))
_DB_USER     = os.getenv("DB_USER", "root")
_DB_PASSWORD = os.getenv("DB_PASSWORD", "")
_SOURCE_DB   = os.getenv("DB_NAME", "u972964962_orbic")
_MASTER_DB   = os.getenv("MASTER_DB_NAME", "orbic_master")


def _split_statements(sql: str) -> list[str]:
    """
    Split SQL into individual executable statements, respecting DELIMITER
    directives the way the mysql CLI does.

    DELIMITER $$ switches the terminator to $$; DELIMITER ; switches back.
    The DELIMITER directive lines themselves are never sent to the server.
    """
    statements = []
    delimiter = ";"
    buf = ""

    for line in sql.splitlines(keepends=True):
        stripped = line.strip()

        # DELIMITER directive — change terminator, never send to server
        m = re.match(r"^DELIMITER\s+(\S+)\s*$", stripped, re.IGNORECASE)
        if m:
            # flush anything buffered before the directive
            chunk = buf.strip()
            if chunk and not _is_comment_only(chunk):
                statements.append(chunk)
            buf = ""
            delimiter = m.group(1)
            continue

        buf += line

        # Check if buffer ends with the current delimiter
        if buf.rstrip().endswith(delimiter):
            chunk = buf.rstrip()
            # Strip the trailing delimiter
            chunk = chunk[: -len(delimiter)].rstrip()
            if chunk and not _is_comment_only(chunk):
                statements.append(chunk)
            buf = ""

    # Flush anything remaining
    chunk = buf.strip()
    if chunk and not _is_comment_only(chunk):
        statements.append(chunk)

    return statements


def _is_comment_only(sql: str) -> bool:
    """True if every non-empty line is a -- comment."""
    return all(
        line.strip().startswith("--") or not line.strip()
        for line in sql.splitlines()
    )


async def _connect(db: str) -> aiomysql.Connection:
    return await aiomysql.connect(
        host=_DB_HOST, port=_DB_PORT, user=_DB_USER, password=_DB_PASSWORD,
        db=db, charset="utf8mb4", autocommit=False,
    )


async def _active_tenant_dbs() -> list[str]:
    conn = await aiomysql.connect(
        host=_DB_HOST, port=_DB_PORT, user=_DB_USER, password=_DB_PASSWORD,
        charset="utf8mb4", autocommit=True,
    )
    try:
        async with conn.cursor() as cur:
            await cur.execute(
                f"SELECT db_name FROM `{_MASTER_DB}`.reps WHERE status = 'active'"
            )
            return [row[0] for row in await cur.fetchall()]
    finally:
        conn.close()


async def _run_on_db(db: str, statements: list[str], dry_run: bool) -> list[str]:
    """Run all statements on one DB. Returns list of error strings (empty = success)."""
    if dry_run:
        for i, s in enumerate(statements, 1):
            preview = s[:100].replace("\n", " ")
            print(f"  [{db}] stmt {i}: {preview}…")
        return []

    try:
        conn = await _connect(db)
    except Exception as e:
        return [f"connect failed: {e}"]

    errors = []
    try:
        async with conn.cursor() as cur:
            for i, stmt in enumerate(statements, 1):
                try:
                    await cur.execute(stmt)
                except Exception as e:
                    errors.append(f"stmt {i}: {e}")
                    await conn.rollback()
                    return errors
        await conn.commit()
    finally:
        conn.close()

    return errors


async def main(sql_path: str, include_source: bool, dry_run: bool) -> None:
    if not os.path.exists(sql_path):
        print(f"ERROR: file not found: {sql_path}", file=sys.stderr)
        sys.exit(1)

    with open(sql_path, encoding="utf-8") as f:
        sql = f.read()

    statements = _split_statements(sql)
    if not statements:
        print("No executable statements found in file.")
        return

    tenant_dbs = await _active_tenant_dbs()
    targets = list(tenant_dbs)
    if include_source:
        targets = [_SOURCE_DB] + [t for t in targets if t != _SOURCE_DB]

    print(f"Migration : {os.path.basename(sql_path)}")
    print(f"Statements: {len(statements)}")
    print(f"Targets   : {', '.join(targets) or '(none)'}")
    if dry_run:
        print("Mode      : DRY RUN — nothing will be executed\n")
    else:
        print()

    failed = []
    for db in targets:
        errors = await _run_on_db(db, statements, dry_run)
        if errors:
            print(f"  FAIL  {db}")
            for e in errors:
                print(f"        {e}")
            failed.append(db)
        else:
            print(f"  OK    {db}")

    print()
    if failed:
        print(f"FAILED on {len(failed)}/{len(targets)} DB(s): {', '.join(failed)}")
        sys.exit(1)
    else:
        if not dry_run:
            print(f"Done — applied to {len(targets)} DB(s).")
        else:
            print(f"Dry run complete — {len(targets)} DB(s) would be targeted.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Run a SQL migration file against all active tenant DBs."
    )
    parser.add_argument("sql_file", help="Path to the .sql migration file")
    parser.add_argument(
        "--include-source", action="store_true",
        help="Also run against the source DB (DB_NAME from .env)"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print targets and SQL without executing"
    )
    args = parser.parse_args()
    asyncio.run(main(args.sql_file, args.include_source, args.dry_run))
