"""
Shared contract-type normalization and validation used by:
  - routers/admin_portfolio_contracts.py  (portfolio CSV upload)
  - routers/contract_renewal.py          (contract_renewal bulk upload + admin edit)
  - routers/enrollment_engine.py         (Option A activation)
  - routers/admin_portfolio_contracts.py (upgrade backfill)
  - scripts/reconcile_portfolio_contracts.py  (sync SQL)

DO NOT import this from migration files -- those are plain SQL, not Python.
Migration 052 duplicates the normalization logic in SQL triggers; if you
change the mapping here, update 052 (and any future trigger migration) too.
Note that duplication in a separate location.
"""

# Canonical values. This set is the source of truth -- update the _TYPE_MAP,
# the SQL expression in _SYNC_NORMALIZE_SQL_EXPR, and migration 052 together.
ALLOWED_TYPES: frozenset[str] = frozenset({"Fix", "Future", "LMP", "MTM", "MCP", "MCP2"})

# Case-insensitive user input -> canonical form.
# All lookups must use raw_value.strip().lower().
_TYPE_MAP: dict[str, str] = {
    "fix":    "Fix",
    "fixed":  "Fix",
    "future": "Future",
    "lmp":    "LMP",
    "mtm":    "MTM",
    "mcp":    "MCP",
    "mcp2":   "MCP2",
}


def normalize_upload_type(raw: str | None) -> tuple[str, str | None]:
    """
    Normalize a contract_type value from a user-submitted upload (Portfolio or
    contract_renewal CSV).  Returns (canonical, error_message_or_None).

    Rules (upload / strict path):
    - NULL, blank -> error "contract_type is required"
    - Recognized value (case-insensitive) -> canonical form, no error
    - Unrecognized -> error with allowed list

    Does NOT check Future+start_date -- that is a cross-field check the
    caller must do after calling this function.
    """
    if not raw or not str(raw).strip():
        return "", "contract_type is required"
    stripped = str(raw).strip()
    canonical = _TYPE_MAP.get(stripped.lower(), stripped)
    if canonical not in ALLOWED_TYPES:
        allowed = ", ".join(sorted(ALLOWED_TYPES))
        return canonical, f"contract_type '{stripped}' is not recognized (allowed: {allowed})"
    return canonical, None


def sync_map_contract_type(raw_type: str | None, end_date_str: str | None) -> str:
    """
    Map a contract_type value arriving from contract_renewal (via trigger,
    upgrade backfill, or reconcile script) to a canonical Portfolio value.
    This is the LEGACY / SYNC PATH -- new writes to contract_renewal are
    validated at write time (see normalize_upload_type), so this function
    exists mainly for rows that pre-date that validation.

    Rules (in order):
    1. "Default" (case-insensitive, trimmed)         -> "MTM"
    2. NULL or blank, end_date parseable and past     -> "MTM"
    3. NULL or blank, end_date parseable and current  -> "Fix"
    4. NULL or blank, end_date NULL/blank/unparseable -> "Unknown"
    5. Recognized type (case-insensitive, trimmed)    -> canonical form
    6. Any other unrecognized non-NULL, non-blank     -> "Unknown"

    Rules 2-4 exist only for legacy rows.  New NULLs are blocked at the
    write path.  Note: this function is evaluated at sync time, NOT later;
    a row synced as Fix because its end_date was future will NOT
    automatically flip to MTM when the end_date passes, unless the row is
    re-synced by the reconcile script or by a trigger firing on an UPDATE.

    end_date_str is expected in M/D/Y format (contract_renewal's varchar
    format).  Returns a canonical string; callers must write this value
    into portfolio_contracts.contract_type.
    """
    from datetime import date, datetime

    trimmed = (raw_type or "").strip()

    # Rule 1 -- Default is always MTM
    if trimmed.lower() == "default":
        return "MTM"

    # Rules 2-4 -- NULL or blank
    if not trimmed:
        parsed_end: date | None = None
        if end_date_str and str(end_date_str).strip():
            for fmt in ("%m/%d/%Y", "%Y-%m-%d"):
                try:
                    parsed_end = datetime.strptime(str(end_date_str).strip(), fmt).date()
                    break
                except ValueError:
                    pass
        if parsed_end is None:
            return "Unknown"
        today = date.today()
        return "MTM" if parsed_end < today else "Fix"

    # Rules 5-6 -- non-blank value
    canonical = _TYPE_MAP.get(trimmed.lower(), trimmed)
    return canonical if canonical in ALLOWED_TYPES else "Unknown"


# SQL CASE expression for use in the reconcile script's _FORWARD_SYNC_SQL and
# the /upgrade backfill's INSERT SELECT.  This is raw SQL, not a Python
# expression; embed it verbatim in a SQL string.
#
# Uses STR_TO_DATE with single-percent '%m/%d/%Y'.  When this expression is
# embedded in a SQLAlchemy text() call that also has bind parameters, the %
# characters will be interpreted as DB-API substitution markers and must be
# doubled (%%).  The constant below uses single % -- the caller is responsible
# for doubling if needed.
#
# Migration 052 contains an equivalent CASE expression directly in SQL; if you
# change this constant, update that migration file's triggers too (note:
# migration files cannot import Python, so the duplication is unavoidable).
SYNC_TYPE_CASE_SINGLE_PCT = r"""
    CASE
      WHEN TRIM(LOWER(COALESCE(`contract_type`, ''))) = 'default'
        THEN 'MTM'
      WHEN TRIM(COALESCE(`contract_type`, '')) = ''
        THEN CASE
          WHEN STR_TO_DATE(`contract_end_date`, '%m/%d/%Y') IS NOT NULL
               AND STR_TO_DATE(`contract_end_date`, '%m/%d/%Y') < CURDATE()
            THEN 'MTM'
          WHEN STR_TO_DATE(`contract_end_date`, '%m/%d/%Y') IS NOT NULL
               AND STR_TO_DATE(`contract_end_date`, '%m/%d/%Y') >= CURDATE()
            THEN 'Fix'
          ELSE 'Unknown'
        END
      WHEN TRIM(LOWER(`contract_type`)) IN ('fix', 'fixed')  THEN 'Fix'
      WHEN TRIM(LOWER(`contract_type`)) = 'future'           THEN 'Future'
      WHEN TRIM(LOWER(`contract_type`)) = 'lmp'              THEN 'LMP'
      WHEN TRIM(LOWER(`contract_type`)) = 'mtm'              THEN 'MTM'
      WHEN TRIM(LOWER(`contract_type`)) = 'mcp'              THEN 'MCP'
      WHEN TRIM(LOWER(`contract_type`)) = 'mcp2'             THEN 'MCP2'
      ELSE 'Unknown'
    END
""".strip()

# Same expression but with doubled %% for use inside SQLAlchemy text() calls
# that also carry bind parameters (where SQLAlchemy performs %-substitution).
SYNC_TYPE_CASE_DOUBLE_PCT = SYNC_TYPE_CASE_SINGLE_PCT.replace("%", "%%")
