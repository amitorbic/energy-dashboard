"""
Provision a new REP tenant under DB-per-tenant architecture.

Creates the tenant database, clones the ORBIC schema (structure only, zero data),
inserts a bootstrap admin user, registers the tenant in orbic_master.reps,
seeds an initial copy of shared reference data (see
utils/shared_reference_tables.py), and writes a filled-in .env template for
the new tenant's deployment.

Before cloning, verifies that the source DB (_SOURCE_DB) actually has every
migration under api/migrations/ applied — a new tenant is never allowed to
silently inherit an incomplete schema (see step_verify_source_migrations).

The reps INSERT is the last DB step (the "commit point"). If anything before it
fails, the newly created database is dropped so no half-provisioned tenant is
left behind. The .env file is written after that, so it's only ever generated
for a tenant that's actually registered.

This script does NOT set up Nginx, DNS, or a running app process/port for the
new tenant, and does NOT set TENANT_MODULES unless you pass --modules -- those
remain manual steps. See docs/TENANT_ONBOARDING_RUNBOOK.md for the full
end-to-end checklist this script is one part of.

Run from api/:
    python scripts/provision_tenant.py --company "Test REP" --subdomain testrep --modules portfolio

Requirements:
    - api/.env must have DB_USER / DB_PASSWORD / DB_HOST / DB_PORT
    - orbic_master DB must exist (run migrations/046_create_orbic_master.sql first)
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
_API_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _API_DIR)

from dotenv import load_dotenv
load_dotenv()

import aiomysql

from utils.tenant_modules import ALL_MODULES
from utils.shared_reference_tables import SHARED_REFERENCE_TABLES

# ── Configuration ──────────────────────────────────────────────────────────────

_DB_HOST     = os.getenv("DB_HOST",        "localhost")
_DB_PORT     = int(os.getenv("DB_PORT",    "3306"))
_DB_USER     = os.getenv("DB_USER",        "root")
_DB_PASSWORD = os.getenv("DB_PASSWORD",    "")
_SOURCE_DB   = os.getenv("DB_NAME",        "u972964962_orbic")
_MASTER_DB   = os.getenv("MASTER_DB_NAME", "orbic_master")

_MIGRATIONS_DIR = os.path.join(_API_DIR, "migrations")
_ENV_OUTPUT_DIR = os.path.join(_API_DIR, "provisioned_envs")

# Migrations that alter orbic_master (not the per-tenant DB being cloned)
# -- excluded from the source-DB schema-completeness check below.
_MASTER_DB_MIGRATIONS = {"001_create_reps_table.sql", "042_create_tenant_modules.sql", "046_create_orbic_master.sql"}


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


def generate_secret_key() -> str:
    return secrets.token_urlsafe(48)


def md5_hex(password: str) -> str:
    return hashlib.md5(password.encode()).hexdigest()


def parse_modules_arg(raw: str) -> list[str]:
    """
    Validate --modules strictly (unlike the runtime fail-open reader in
    utils/tenant_module_config.py) -- a typo here should stop provisioning,
    not silently produce a tenant with fewer modules than intended.
    """
    keys = [k.strip().lower() for k in raw.split(",") if k.strip()]
    if not keys:
        sys.exit("ERROR: --modules was passed but empty")
    if keys == ["enterprise"]:
        return keys
    unknown = [k for k in keys if k not in ALL_MODULES and k != "enterprise"]
    if unknown:
        sys.exit(
            f"ERROR: --modules contains unknown module(s): {', '.join(unknown)}\n"
            f"  Valid values: {', '.join(ALL_MODULES)}, or 'enterprise' for all"
        )
    return keys


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


# ── Migration completeness check ────────────────────────────────────────────────

def _parse_expected_schema(
    migrations_dir: str,
) -> tuple[set[str], set[tuple[str, str]], set[str]]:
    """
    Best-effort static parse of every numbered migration file (excluding the
    orbic_master-only ones) into the set of tables it expects to exist,
    the set of (table, column) pairs added by ADD COLUMN / CHANGE statements,
    and the set of views it expects to exist. This is a structural check, not
    a migration-ledger replacement -- it understands the CREATE TABLE /
    ALTER TABLE / CREATE VIEW forms actually used in this repo's migrations
    (see docs/DB_MIGRATIONS.md for the authoritative applied/pending status),
    not arbitrary SQL.
    """
    expected_tables: set[str] = set()
    expected_columns: set[tuple[str, str]] = set()
    expected_views: set[str] = set()

    file_names = sorted(f for f in os.listdir(migrations_dir) if f.endswith(".sql"))
    for fname in file_names:
        if fname in _MASTER_DB_MIGRATIONS:
            continue
        with open(os.path.join(migrations_dir, fname), "r", encoding="utf-8") as fh:
            raw = fh.read()

        # Strip '-- ...' line comments first -- migrations have commented-out
        # reference statements (e.g. 002_rename_mills_columns.sql) that must
        # not be parsed as real expected schema.
        sql = "\n".join(line.split("--", 1)[0] for line in raw.splitlines())

        for m in re.finditer(
            r"CREATE TABLE(?:\s+IF NOT EXISTS)?\s+`?(\w+)`?", sql, re.IGNORECASE
        ):
            expected_tables.add(m.group(1))

        for m in re.finditer(
            r"CREATE(?:\s+OR\s+REPLACE)?(?:\s+ALGORITHM\s*=\s*\w+)?"
            r"(?:\s+DEFINER\s*=\s*\S+)?(?:\s+SQL\s+SECURITY\s+\w+)?\s+VIEW\s+`?(\w+)`?",
            sql,
            re.IGNORECASE,
        ):
            expected_views.add(m.group(1))

        for alter in re.finditer(
            r"ALTER TABLE\s+`?(\w+)`?(.*?);", sql, re.IGNORECASE | re.DOTALL
        ):
            table, body = alter.group(1), alter.group(2)
            for col in re.finditer(r"ADD\s+COLUMN\s+`?(\w+)`?", body, re.IGNORECASE):
                expected_columns.add((table, col.group(1)))
            # CHANGE <old> <new> ... -- the renamed-to column must exist under
            # its new name; the old name is expected to be gone.
            for chg in re.finditer(r"CHANGE\s+`?\w+`?\s+`?(\w+)`?", body, re.IGNORECASE):
                expected_columns.add((table, chg.group(1)))

    return expected_tables, expected_columns, expected_views


async def step_verify_source_migrations() -> None:
    """
    Pre-flight guard: confirm _SOURCE_DB actually has every migration's
    tables/columns/views before a new tenant clones its schema from it.
    Without this, a tenant provisioned against a source DB that's missing a
    migration (see docs/DB_MIGRATIONS.md "Pending" table) would silently
    inherit the incomplete schema, with no error anywhere in the process.
    """
    expected_tables, expected_columns, expected_views = _parse_expected_schema(
        _MIGRATIONS_DIR
    )

    conn = await _connect(_SOURCE_DB)
    try:
        cur = await conn.cursor()
        await cur.execute("SHOW TABLES")
        actual_tables = {row[0] for row in await cur.fetchall()}

        missing_tables = sorted(expected_tables - actual_tables)

        await cur.execute("SHOW FULL TABLES WHERE `Table_type` = 'VIEW'")
        actual_views = {row[0] for row in await cur.fetchall()}
        missing_views = sorted(expected_views - actual_views)

        by_table: dict[str, list[str]] = {}
        for table, col in expected_columns:
            by_table.setdefault(table, []).append(col)

        missing_columns: list[tuple[str, str]] = []
        for table, cols in sorted(by_table.items()):
            if table in missing_tables or table not in actual_tables:
                # A missing table already covers all of its expected columns;
                # don't double-report.
                continue
            await cur.execute(f"SHOW COLUMNS FROM `{table}`")
            actual_cols = {row[0] for row in await cur.fetchall()}
            for col in sorted(cols):
                if col not in actual_cols:
                    missing_columns.append((table, col))

        await cur.close()
    finally:
        conn.close()

    if missing_tables or missing_columns or missing_views:
        lines = [
            f"Source DB `{_SOURCE_DB}` looks incomplete relative to api/migrations/ "
            f"-- refusing to clone an incomplete schema into a new tenant.",
        ]
        if missing_tables:
            lines.append("  Missing table(s): " + ", ".join(missing_tables))
        for table, col in missing_columns:
            lines.append(f"  Missing column: {table}.{col}")
        if missing_views:
            lines.append("  Missing view(s): " + ", ".join(missing_views))
        lines.append(
            "  Check docs/DB_MIGRATIONS.md's 'Pending' table, run the missing "
            f"migration(s) against `{_SOURCE_DB}`, then retry."
        )
        raise RuntimeError("\n".join(lines))


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


async def step_clone_schema(db_name: str) -> tuple[int, int, int]:
    """
    Copy table DDL (structure only, no rows), view DDL, and trigger DDL from
    _SOURCE_DB into db_name. Returns (n_tables, n_views, n_triggers) cloned.

    Strategy:
    - SHOW FULL TABLES WHERE Table_type = 'BASE TABLE' → SHOW CREATE TABLE for
      each → adapt DDL → execute against new DB, tables first (views below may
      reference them).
    - Wrap in SET FOREIGN_KEY_CHECKS=0 to avoid FK ordering issues
    - Strip AUTO_INCREMENT=<n> from DDL so every table starts at 1
    - Then SHOW FULL TABLES WHERE Table_type = 'VIEW' → SHOW CREATE VIEW for
      each → strip the source server's DEFINER=`user`@`host` clause (host-
      specific; MySQL defaults it to CURRENT_USER when omitted, which is what
      every destination server actually needs) → execute against new DB.
      None of this DB's views reference another view, only base tables, so a
      single tables-then-views pass is sufficient — no dependency ordering
      needed among the views themselves.
    - Then SHOW TRIGGERS → SHOW CREATE TRIGGER for each → strip DEFINER same
      as views → execute against new DB, after tables exist (a trigger's
      CREATE references its table). Migration 044 hit this exact gap for
      views (no provisioned tenant ever got them until it was fixed here);
      migration 048 introduces this app's first real triggers
      (portfolio_contracts sync off contract_renewal), so the same fix is
      made proactively instead of waiting to find it as a live bug.
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

            # Enumerate and clone views, now that every base table exists.
            await src.execute("SHOW FULL TABLES WHERE `Table_type` = 'VIEW'")
            views = [row[0] for row in await src.fetchall()]

            for view in views:
                await src.execute(f"SHOW CREATE VIEW `{view}`")
                row = await src.fetchone()
                ddl = row[1]

                # Strip DEFINER=`user`@`host` -- host-specific to the source
                # server; MySQL defaults it to CURRENT_USER when omitted.
                ddl = re.sub(r"DEFINER=`[^`]*`@`[^`]*`\s*", "", ddl)

                await dest.execute(ddl)
                print(f"        cloned view: {view}")

            # Enumerate and clone triggers, now that every base table exists.
            await src.execute("SHOW TRIGGERS")
            triggers = [row[0] for row in await src.fetchall()]

            for trigger in triggers:
                await src.execute(f"SHOW CREATE TRIGGER `{trigger}`")
                row = await src.fetchone()
                # SHOW CREATE TRIGGER columns: Trigger, sql_mode,
                # SQL Original Statement, character_set_client, ... — the DDL
                # is index 2, not index 1 like SHOW CREATE TABLE/VIEW.
                ddl = row[2]

                # Strip DEFINER=`user`@`host` -- same reasoning as views above.
                ddl = re.sub(r"DEFINER=`[^`]*`@`[^`]*`\s*", "", ddl)

                await dest.execute(ddl)
                print(f"        cloned trigger: {trigger}")

            return len(tables), len(views), len(triggers)
        finally:
            await src.close()
            await dest.close()
    finally:
        src_conn.close()
        dest_conn.close()


async def step_seed_singleton_rows(db_name: str) -> None:
    """
    step_clone_schema() copies structure only (0 rows) -- tables that a
    migration seeds with a required default row (e.g. migration 048's
    `INSERT IGNORE INTO portfolio_contracts_sync_state ... VALUES (1, 0)`)
    need that row inserted again here, since a new tenant only ever gets its
    schema via this clone, not by having every migration file replayed
    against it. If portfolio_contracts_sync_state doesn't exist yet (source
    DB predates migration 048), this is a no-op rather than a hard failure.
    """
    conn = await _connect(db_name)
    try:
        cur = await conn.cursor()
        try:
            await cur.execute("SHOW TABLES LIKE 'portfolio_contracts_sync_state'")
            if await cur.fetchone():
                await cur.execute(
                    "INSERT IGNORE INTO portfolio_contracts_sync_state (id, is_full_tenant) VALUES (1, 0)"
                )
                await conn.commit()
        finally:
            await cur.close()
    finally:
        conn.close()


async def step_create_admin_user(
    db_name: str, company_name: str, temp_password: str
) -> str:
    """
    Insert one admin user (role=1) into the new tenant's users table.
    Password is MD5-hashed to match what the existing auth layer expects.
    must_change_password=1 forces the bootstrap admin through the
    password-change screen on first login -- see migration 045.
    Returns the placeholder email that was inserted.
    """
    slug  = db_name.removeprefix("tenant_")
    email = f"admin@{slug}.local"

    conn = await _connect(db_name)
    try:
        cur = await conn.cursor()
        await cur.execute(
            "INSERT INTO users (name, email, password, role, must_change_password) VALUES (%s, %s, %s, %s, 1)",
            (f"{company_name} Admin", email, md5_hex(temp_password), 1),
        )
        await cur.close()
    finally:
        conn.close()

    return email


async def step_register_in_master(
    company_name: str, db_name: str, subdomain: str
) -> int:
    """
    Insert the tenant row into orbic_master.reps.
    This is the last DB step — the 'commit point'. If anything before this
    raises, the database is dropped during rollback and this row is never
    written. Returns the new rep_id (auto-increment PK).
    """
    conn = await _connect(_MASTER_DB)
    try:
        cur = await conn.cursor()
        await cur.execute(
            "INSERT INTO reps (company_name, db_name, subdomain, status) "
            "VALUES (%s, %s, %s, 'active')",
            (company_name, db_name, subdomain),
        )
        rep_id = cur.lastrowid
        await cur.close()
    finally:
        conn.close()

    return rep_id


async def step_seed_reference_data(db_name: str) -> tuple[bool, str]:
    """
    Give the new tenant an initial full copy of every table in
    SHARED_REFERENCE_TABLES (current shared source data), not zero rows
    waiting on the next sync cycle. Reuses sync_reference_data.py's
    incremental path restricted to just this tenant (--tenant-db) -- with
    no prior reference_sync_state row, id > 0 correctly captures every row
    that exists in the source today, which is exactly the initial-copy
    behavior wanted here. Iterates SHARED_REFERENCE_TABLES generically, so
    adding a table there also covers this step with no further changes.

    Runs AFTER the tenant is already registered (the DB "commit point"),
    so a failure here is reported but does not roll back an otherwise
    successful provision -- the tenant just needs a manual
    `python scripts/sync_reference_data.py --tenant-db {db_name}` retry.
    Returns (ok, message).
    """
    import subprocess

    sync_script = os.path.join(_API_DIR, "scripts", "sync_reference_data.py")
    cmd = [sys.executable, sync_script, "--mode", "incremental", "--tenant-db", db_name]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode != 0:
            return False, result.stderr.strip() or "non-zero exit, no stderr captured"
        return True, result.stdout.strip()
    except Exception as e:
        return False, str(e)


def render_env_template(
    *,
    rep_id: int,
    company_name: str,
    subdomain: str,
    db_name: str,
    modules: list[str] | None,
) -> str:
    """
    Build a filled-in .env for the new tenant's deployment. Values inherited
    from the running provisioning environment (DB host/port/user/password,
    master DB name) are copied as-is since every tenant DB lives on the same
    server today. Everything tenant-specific that this script cannot know
    (website, address, phone, real email addresses) is left as a clearly
    marked TODO — filling those in is still a manual step, tracked in
    docs/TENANT_ONBOARDING_RUNBOOK.md.
    """
    if modules:
        modules_line = f"TENANT_MODULES={','.join(modules)}"
    else:
        modules_line = (
            "# TENANT_MODULES=   <-- UNSET: see warning above. Uncomment and fill in\n"
            "# before this tenant goes live, e.g. TENANT_MODULES=portfolio"
        )

    return f"""\
# Generated by provision_tenant.py for '{company_name}' ({subdomain}) — {db_name}
# rep_id={rep_id}. Review every TODO before deploying this file.

# ── Database ────────────────────────────────────────────────────────────────
DB_HOST={_DB_HOST}
DB_PORT={_DB_PORT}
DB_USER={_DB_USER}
DB_PASSWORD={_DB_PASSWORD}
DB_NAME={db_name}
MASTER_DB_NAME={_MASTER_DB}

# ── Auth ────────────────────────────────────────────────────────────────────
SECRET_KEY={generate_secret_key()}

# ── Tenant identity (see MULTI_TENANT.md section 3) ────────────────────────
TENANT_REP_ID={rep_id}
TENANT_COMPANY_NAME={company_name}
TENANT_DISPLAY_NAME={company_name}
# TODO: real website
TENANT_WEBSITE=
# TODO: real business address
TENANT_ADDRESS=
# TODO: real phone number
TENANT_PHONE=

# ── Email routing — TENANT_EMAIL_DEFAULT is REQUIRED before go-live.
#    get_tenant_email() raises at send time if no default is set, and
#    outbound mail will hard-fail for this tenant until it's filled in.
# TODO: required — e.g. info@{subdomain}.com
TENANT_EMAIL_DEFAULT=
# optional — falls back to TENANT_EMAIL_DEFAULT
TENANT_EMAIL_COMMISSION=
# optional — falls back to TENANT_EMAIL_DEFAULT
TENANT_EMAIL_PRICING=
# optional — falls back to TENANT_EMAIL_DEFAULT
TENANT_EMAIL_OPERATIONS=

# TDSP notification routing — leave empty unless/until confirmed addresses
# exist for this tenant (see MULTI_TENANT.md — disabled for ORBIC for the
# same reason: addresses were unavailable and test sends bounced).
TDSP_EMAIL_ONCOR=
TDSP_EMAIL_CENTERPOINT=
TDSP_EMAIL_AEP=
TDSP_EMAIL_TNMP=

# TODO: who should receive consumer portal notifications
CONSUMER_NOTIFY_EMAIL=

# ── Module entitlements ─────────────────────────────────────────────────────
# ============================================================================
# TENANT_MODULES -- READ THIS BEFORE DEPLOYING.
# If this line is unset or commented out, ALL modules (sales, operations,
# portfolio, audit) are enabled for this tenant, regardless of what they
# actually purchased. This is the single most likely way to accidentally
# grant a pilot customer access to a module they did not buy.
# Valid values: sales, operations, portfolio, audit (comma-separated), or
# "enterprise" for all. See api/utils/tenant_module_config.py.
# ============================================================================
{modules_line}
"""


async def rollback_drop_database(db_name: str) -> None:
    conn = await _connect()
    try:
        cur = await conn.cursor()
        await cur.execute(f"DROP DATABASE IF EXISTS `{db_name}`")
        await cur.close()
    finally:
        conn.close()


# ── Main orchestration ─────────────────────────────────────────────────────────

async def provision(company_name: str, subdomain: str, modules: list[str] | None) -> None:
    db_name       = derive_db_name(company_name)
    temp_password = generate_temp_password()

    print()
    print("Tenant provisioning")
    print(f"  Company   : {company_name}")
    print(f"  Subdomain : {subdomain}")
    print(f"  DB name   : {db_name}")
    print(f"  Source DB : {_SOURCE_DB}  (schema only — zero data copied)")
    print(f"  Modules   : {','.join(modules) if modules else '(not set — see warning below)'}")
    print()

    # ── 1 / 7  Pre-flight ─────────────────────────────────────────────────────
    print("[ 1/7 ] Pre-flight checks...")
    try:
        await step_preflight(db_name, subdomain)
    except RuntimeError as exc:
        sys.exit(f"ERROR: {exc}")
    print("        OK — no conflicts found")

    # ── 2 / 7  Verify source DB has every migration applied ──────────────────
    print(f"[ 2/7 ] Verifying `{_SOURCE_DB}` has all migrations in api/migrations/ applied...")
    try:
        await step_verify_source_migrations()
    except RuntimeError as exc:
        sys.exit(f"ERROR: {exc}")
    print("        OK — source schema matches every tracked migration")

    # ── 3 / 7  Create database ────────────────────────────────────────────────
    print(f"[ 3/7 ] Creating database `{db_name}`...")
    await step_create_database(db_name)
    print("        OK")

    # ── Steps 4–6 under rollback guard ────────────────────────────────────────
    # The database now exists. If anything below fails, we drop it so the server
    # is left clean and no orphan DB lingers without a reps entry.
    try:
        # ── 4 / 7  Clone schema ───────────────────────────────────────────────
        print(f"[ 4/7 ] Cloning schema from `{_SOURCE_DB}` (structure only, no data)...")
        n_tables, n_views, n_triggers = await step_clone_schema(db_name)
        print(f"        OK — {n_tables} tables + {n_views} views + {n_triggers} triggers cloned, 0 rows copied")
        await step_seed_singleton_rows(db_name)

        # ── 5 / 7  Bootstrap admin user ───────────────────────────────────────
        print("[ 5/7 ] Creating bootstrap admin user (role=admin)...")
        admin_email = await step_create_admin_user(db_name, company_name, temp_password)
        print(f"        OK — inserted {admin_email}")

        # ── 6 / 7  Register in master DB (commit point) ───────────────────────
        print(f"[ 6/7 ] Registering tenant in orbic_master.reps...")
        rep_id = await step_register_in_master(company_name, db_name, subdomain)
        print(f"        OK — rep_id={rep_id}")

    except Exception as exc:
        print(f"\n  FAILED: {exc}")
        print(f"  Rolling back — dropping `{db_name}`...")
        await rollback_drop_database(db_name)
        print("  Rollback complete. No tenant was registered.")
        sys.exit(1)

    # ── 7 / 7  Seed initial shared reference data (best-effort, non-fatal) ───
    # Runs after the commit point on purpose -- the tenant already exists and
    # is registered even if this step has a problem.
    table_names = ", ".join(t.name for t in SHARED_REFERENCE_TABLES)
    print(f"[ 7/7 ] Seeding initial shared reference data ({table_names})...")
    seed_ok, seed_msg = await step_seed_reference_data(db_name)
    if seed_ok:
        print("        OK — initial copy complete, see output below")
        if seed_msg:
            for line in seed_msg.splitlines():
                print(f"        {line}")
    else:
        print(f"        WARNING — initial reference-data copy failed: {seed_msg}")
        print(f"        Tenant is otherwise fully provisioned. Retry manually with:")
        print(f"          python scripts/sync_reference_data.py --tenant-db {db_name}")

    # ── Write the .env template ─────────────────────────────────────────────
    os.makedirs(_ENV_OUTPUT_DIR, exist_ok=True)
    env_path = os.path.join(_ENV_OUTPUT_DIR, f"{subdomain}.env")
    env_contents = render_env_template(
        rep_id=rep_id,
        company_name=company_name,
        subdomain=subdomain,
        db_name=db_name,
        modules=modules,
    )
    with open(env_path, "w", encoding="utf-8") as fh:
        fh.write(env_contents)

    # ── Done ──────────────────────────────────────────────────────────────────
    print()
    print("=" * 60)
    print("  Tenant provisioned successfully")
    print("=" * 60)
    print(f"  Company    : {company_name}")
    print(f"  Subdomain  : {subdomain}")
    print(f"  Database   : {db_name}")
    print(f"  rep_id     : {rep_id}")
    print(f"  Admin user : {admin_email}")
    print(f"  Temp passwd: {temp_password}")
    print(f"  .env file  : {env_path}")
    print()
    if not modules:
        print("  *** WARNING: --modules was not passed. The generated .env has")
        print("  *** TENANT_MODULES commented out, which means ALL modules are")
        print("  *** enabled by default. Fill it in before this tenant goes live")
        print("  *** if they did not purchase every module.")
        print()
    print("  NEXT STEPS (see docs/TENANT_ONBOARDING_RUNBOOK.md for the full list):")
    print("  1. Review every TODO in the generated .env, especially")
    print("     TENANT_MODULES and TENANT_EMAIL_DEFAULT.")
    print("  2. Deploy a new app process for this tenant using that .env")
    print("     (own port — not automated by this script).")
    print("  3. Configure Nginx and DNS for the subdomain (not automated by this script).")
    print("  4. Log in as the bootstrap admin, change the password immediately,")
    print("     and update the admin email to the real address.")
    print("  5. Ingest this tenant's OWN business data (contracts, hedges, etc.)")
    print("     separately -- shared reference data was already seeded in step 7/7.")
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
    parser.add_argument(
        "--modules",
        required=False,
        default=None,
        help=(
            "Comma-separated module keys this tenant is entitled to, e.g. "
            "'portfolio' or 'sales,operations'. Valid values: "
            f"{', '.join(ALL_MODULES)}, or 'enterprise' for all. If omitted, "
            "the generated .env leaves TENANT_MODULES unset, which means ALL "
            "modules are enabled — only skip this if that's actually intended."
        ),
    )
    args = parser.parse_args()

    company_name = args.company.strip()
    subdomain    = args.subdomain.strip().lower()
    modules      = parse_modules_arg(args.modules) if args.modules else None

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

    asyncio.run(provision(company_name, subdomain, modules))


if __name__ == "__main__":
    main()
