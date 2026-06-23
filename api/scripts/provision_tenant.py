"""
Provision a new REP tenant under DB-per-tenant architecture.

Creates the tenant database, clones the ORBIC schema (structure only, zero data),
inserts a bootstrap admin user, and registers the tenant in ameripower_master.reps.

The reps INSERT is the last step (the "commit point"). If anything before it fails,
the newly created database is dropped so no half-provisioned tenant is left behind.

Run from api/:
    python scripts/provision_tenant.py --company "Test REP" --subdomain testrep

Requirements:
    - api/.env must have DB_USER / DB_PASSWORD / DB_HOST / DB_PORT
    - ameripower_master DB must exist (run migrations/001_create_reps_table.sql first)
    - The MySQL user must have CREATE DATABASE, DROP DATABASE, and CREATE TABLE privileges
"""

import argparse
import asyncio
import hashlib
import os
import re
import secrets
import sys

# Allow running from api/scripts/ or from api/
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

import aiomysql

# ── Configuration ──────────────────────────────────────────────────────────────

_DB_HOST     = os.getenv("DB_HOST",        "localhost")
_DB_PORT     = int(os.getenv("DB_PORT",    "3306"))
_DB_USER     = os.getenv("DB_USER",        "root")
_DB_PASSWORD = os.getenv("DB_PASSWORD",    "")
_SOURCE_DB   = os.getenv("DB_NAME",        "u972964962_orbic")
_MASTER_DB   = os.getenv("MASTER_DB_NAME", "ameripower_master")


# ── Helpers ────────────────────────────────────────────────────────────────────

def derive_db_name(company_name: str) -> str:
    """
    'Test REP Inc.' → 'tenant_test_rep_inc'
    Lowercase, non-alphanumeric runs collapsed to underscores, prefixed tenant_.
    """
    slug = company_name.lower().strip()
    slug = re.sub(r"[^a-z0-9]+", "_", slug)
    slug = slug.strip("_")
    return f"tenant_{slug}"


def generate_temp_password() -> str:
    # secrets.token_urlsafe(12) gives ~16 printable chars (base64url alphabet)
    return secrets.token_urlsafe(12)


def md5_hex(password: str) -> str:
    return hashlib.md5(password.encode()).hexdigest()


async def _connect(db: str = "") -> aiomysql.Connection:
    """Open a raw aiomysql connection. Pass db='' for server-level operations."""
    return await aiomysql.connect(
        host=_DB_HOST,
        port=_DB_PORT,
        user=_DB_USER,
        password=_DB_PASSWORD,
        db=db,
        charset="utf8mb4",
        autocommit=True,
    )


# ── Steps ──────────────────────────────────────────────────────────────────────

async def step_preflight(db_name: str, subdomain: str) -> None:
    """
    Fail before creating anything if the subdomain or db_name is already taken,
    or if the target database already exists on the server (orphan from a prior
    failed run).
    """
    # Check master DB for existing registration
    conn = await _connect(_MASTER_DB)
    try:
        cur = await conn.cursor()
        await cur.execute(
            "SELECT subdomain, db_name FROM reps WHERE subdomain = %s OR db_name = %s LIMIT 1",
            (subdomain, db_name),
        )
        row = await cur.fetchone()
        await cur.close()
        if row is not None:
            if row[0] == subdomain:
                raise RuntimeError(f"subdomain '{subdomain}' is already registered in reps")
            else:
                raise RuntimeError(f"db_name '{db_name}' is already registered in reps")
    finally:
        conn.close()

    # Check whether the database already exists on the server
    conn = await _connect()
    try:
        cur = await conn.cursor()
        await cur.execute("SHOW DATABASES LIKE %s", (db_name,))
        row = await cur.fetchone()
        await cur.close()
        if row is not None:
            raise RuntimeError(
                f"Database `{db_name}` already exists on the server but has no reps entry.\n"
                f"  This looks like a previous failed run. Manually run:\n"
                f"    DROP DATABASE `{db_name}`;\n"
                f"  then retry."
            )
    finally:
        conn.close()


async def step_create_database(db_name: str) -> None:
    conn = await _connect()
    try:
        cur = await conn.cursor()
        await cur.execute(
            f"CREATE DATABASE `{db_name}` "
            f"CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
        )
        await cur.close()
    finally:
        conn.close()


async def step_clone_schema(db_name: str) -> int:
    """
    Copy table DDL (structure only, no rows) from _SOURCE_DB into db_name.
    Returns the number of tables cloned.

    Strategy:
    - SHOW FULL TABLES WHERE Table_type = 'BASE TABLE' to skip views
    - SHOW CREATE TABLE for each → adapt DDL → execute against new DB
    - Wrap in SET FOREIGN_KEY_CHECKS=0 to avoid FK ordering issues
    - Strip AUTO_INCREMENT=<n> from DDL so every table starts at 1
    """
    src_conn  = await _connect(_SOURCE_DB)
    dest_conn = await _connect(db_name)
    try:
        src  = await src_conn.cursor()
        dest = await dest_conn.cursor()
        try:
            # Enumerate base tables only (skip views)
            await src.execute(
                "SHOW FULL TABLES WHERE `Table_type` = 'BASE TABLE'"
            )
            tables = [row[0] for row in await src.fetchall()]

            # innodb_strict_mode=OFF is required for legacy tables that have many
            # latin1 VARCHAR(255) columns (e.g. comm_bank: 44 columns × 255 bytes =
            # 11,220 bytes inline). MySQL DYNAMIC format can only store variable-length
            # columns off-page when they exceed 768 bytes/col — latin1 VARCHAR(255) is
            # 255 bytes so it's always inline. With strict mode ON, MySQL rejects CREATE
            # TABLE when the declared inline size exceeds 8,126 bytes. These tables were
            # originally created under strict mode OFF and work fine at runtime; we
            # match those original creation conditions here.
            await dest.execute("SET FOREIGN_KEY_CHECKS = 0")
            await dest.execute("SET innodb_strict_mode = 0")

            for table in tables:
                await src.execute(f"SHOW CREATE TABLE `{table}`")
                row = await src.fetchone()
                ddl = row[1]

                # Strip the current AUTO_INCREMENT offset — new table starts at 1
                ddl = re.sub(r"\s+AUTO_INCREMENT=\d+", "", ddl)

                # Make ROW_FORMAT explicit — SHOW CREATE TABLE omits it when the table
                # inherited it implicitly from innodb_default_row_format.
                if "ROW_FORMAT=" not in ddl.upper():
                    ddl = re.sub(r"(ENGINE=\w+)", r"\1 ROW_FORMAT=DYNAMIC", ddl)

                await dest.execute(ddl)
                print(f"        cloned: {table}")

            await dest.execute("SET innodb_strict_mode = 1")
            await dest.execute("SET FOREIGN_KEY_CHECKS = 1")
            return len(tables)
        finally:
            await src.close()
            await dest.close()
    finally:
        src_conn.close()
        dest_conn.close()


async def step_create_admin_user(
    db_name: str, company_name: str, temp_password: str
) -> str:
    """
    Insert one admin user (role=1) into the new tenant's users table.
    Password is MD5-hashed to match what the existing auth layer expects.
    Returns the placeholder email that was inserted.
    """
    slug  = db_name.removeprefix("tenant_")
    email = f"admin@{slug}.local"

    conn = await _connect(db_name)
    try:
        cur = await conn.cursor()
        await cur.execute(
            "INSERT INTO users (name, email, password, role) VALUES (%s, %s, %s, %s)",
            (f"{company_name} Admin", email, md5_hex(temp_password), 1),
        )
        await cur.close()
    finally:
        conn.close()

    return email


async def step_register_in_master(
    company_name: str, db_name: str, subdomain: str
) -> None:
    """
    Insert the tenant row into ameripower_master.reps.
    This is the last step — the 'commit point'. If anything before this raises,
    the database is dropped during rollback and this row is never written.
    """
    conn = await _connect(_MASTER_DB)
    try:
        cur = await conn.cursor()
        await cur.execute(
            "INSERT INTO reps (company_name, db_name, subdomain, status) "
            "VALUES (%s, %s, %s, 'active')",
            (company_name, db_name, subdomain),
        )
        await cur.close()
    finally:
        conn.close()


async def rollback_drop_database(db_name: str) -> None:
    conn = await _connect()
    try:
        cur = await conn.cursor()
        await cur.execute(f"DROP DATABASE IF EXISTS `{db_name}`")
        await cur.close()
    finally:
        conn.close()


# ── Main orchestration ─────────────────────────────────────────────────────────

async def provision(company_name: str, subdomain: str) -> None:
    db_name       = derive_db_name(company_name)
    temp_password = generate_temp_password()

    print()
    print("Tenant provisioning")
    print(f"  Company   : {company_name}")
    print(f"  Subdomain : {subdomain}")
    print(f"  DB name   : {db_name}")
    print(f"  Source DB : {_SOURCE_DB}  (schema only — zero data copied)")
    print()

    # ── 1 / 5  Pre-flight ─────────────────────────────────────────────────────
    print("[ 1/5 ] Pre-flight checks...")
    try:
        await step_preflight(db_name, subdomain)
    except RuntimeError as exc:
        sys.exit(f"ERROR: {exc}")
    print("        OK — no conflicts found")

    # ── 2 / 5  Create database ────────────────────────────────────────────────
    print(f"[ 2/5 ] Creating database `{db_name}`...")
    await step_create_database(db_name)
    print("        OK")

    # ── Steps 3–5 under rollback guard ────────────────────────────────────────
    # The database now exists. If anything below fails, we drop it so the server
    # is left clean and no orphan DB lingers without a reps entry.
    try:
        # ── 3 / 5  Clone schema ───────────────────────────────────────────────
        print(f"[ 3/5 ] Cloning schema from `{_SOURCE_DB}` (structure only, no data)...")
        n_tables = await step_clone_schema(db_name)
        print(f"        OK — {n_tables} tables cloned, 0 rows copied")

        # ── 4 / 5  Bootstrap admin user ───────────────────────────────────────
        print("[ 4/5 ] Creating bootstrap admin user (role=admin)...")
        admin_email = await step_create_admin_user(db_name, company_name, temp_password)
        print(f"        OK — inserted {admin_email}")

        # ── 5 / 5  Register in master DB (commit point) ───────────────────────
        print(f"[ 5/5 ] Registering tenant in ameripower_master.reps...")
        await step_register_in_master(company_name, db_name, subdomain)
        print("        OK")

    except Exception as exc:
        print(f"\n  FAILED: {exc}")
        print(f"  Rolling back — dropping `{db_name}`...")
        await rollback_drop_database(db_name)
        print("  Rollback complete. No tenant was registered.")
        sys.exit(1)

    # ── Done ──────────────────────────────────────────────────────────────────
    print()
    print("=" * 60)
    print("  Tenant provisioned successfully")
    print("=" * 60)
    print(f"  Company    : {company_name}")
    print(f"  Subdomain  : {subdomain}")
    print(f"  Database   : {db_name}")
    print(f"  Admin user : {admin_email}")
    print(f"  Temp passwd: {temp_password}")
    print()
    print("  NEXT STEPS:")
    print("  1. Log in and change the password immediately.")
    print("  2. Update the admin email to the real address.")
    print("  3. Ingest this tenant's market reference data and")
    print("     business data separately (separate future step).")
    print("=" * 60)
    print()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Provision a new REP tenant (DB-per-tenant architecture)"
    )
    parser.add_argument(
        "--company",
        required=True,
        help="Full company name, e.g. 'Test REP'",
    )
    parser.add_argument(
        "--subdomain",
        required=True,
        help="Subdomain slug (lowercase alphanumeric + hyphens), e.g. 'testrep'",
    )
    args = parser.parse_args()

    company_name = args.company.strip()
    subdomain    = args.subdomain.strip().lower()

    if not company_name:
        sys.exit("ERROR: --company cannot be empty")
    if not re.match(r"^[a-z0-9]([a-z0-9\-]*[a-z0-9])?$", subdomain):
        sys.exit(
            "ERROR: --subdomain must be lowercase alphanumeric with optional hyphens "
            "(e.g. 'testrep' or 'test-rep'), no leading/trailing hyphens"
        )

    # aiomysql requires SelectorEventLoop on Windows
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    asyncio.run(provision(company_name, subdomain))


if __name__ == "__main__":
    main()
