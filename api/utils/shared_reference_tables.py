"""
Registry of tables whose DATA is synced one-way from the shared source DB
to every tenant DB (see api/scripts/sync_reference_data.py).

READ THIS BEFORE ADDING A NEW SHARED TABLE:

  Table STRUCTURE is already automatic. provision_tenant.py's
  step_clone_schema() clones every table in the source DB into a new
  tenant generically (SHOW CREATE TABLE -> execute against the new DB,
  no per-table list, no branching). A brand new table exists on Day 1
  for every new tenant with zero code changes here.

  Table DATA is NOT automatic. A table only receives synced rows -- via
  either the event-driven path (a scraper's post-write hook, see
  utils/trigger_reference_sync.py) or the nightly reconciliation job
  (ecosystem.reference-sync.config.js) -- if it has an entry below.
  Until it's added here, a new table will silently exist, empty, on
  every tenant forever. Nothing errors, nothing warns you. Adding one
  line here is the ONLY step required to start syncing a table's data --
  sync_reference_data.py and provision_tenant.py's initial-copy step both
  iterate this list generically, no other code changes needed.

Each table needs an INTEGER `id` PRIMARY KEY (auto_increment) -- every
current entry has one -- since the sync engine uses it as the
incremental high-water mark. `dedup_keys` is the table's real UNIQUE KEY
(not `id`), used by the nightly reconciliation pass to anti-join and
catch any gap regardless of id bookkeeping.

Not every table below has a live, automated writer today:
  - ercot_lfc_history and the 3 settlement-price tables are written by
    PM2-scheduled scrapers (scraper_ercot_lfc.py,
    scraper_ercot_market_prices.py) -- these get the event-driven path.
  - ercot_load_history, ercot_shape_loadzone, and ercot_holidays are
    populated by manual/occasional standalone scripts with no PM2/cron
    entry today. For these three, the nightly reconciliation job is not
    a backstop -- it is the ONLY sync mechanism that will ever fire,
    unless someone also wires a trigger_incremental_sync() call into
    those scripts the way the two live scrapers already have one.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class SharedTable:
    name: str
    dedup_keys: tuple[str, ...]  # real UNIQUE KEY columns, used by reconcile mode
    source_script: str           # informational: what writes this table upstream
    has_live_trigger: bool       # True if a scraper already calls trigger_incremental_sync()


SHARED_REFERENCE_TABLES: list[SharedTable] = [
    SharedTable(
        name="ercot_lfc_history",
        dedup_keys=("delivery_date", "hour_ending", "capture_date_ct", "capture_hour_ct"),
        source_script="scraper_ercot_lfc.py",
        has_live_trigger=True,
    ),
    SharedTable(
        name="ercot_load_history",
        dedup_keys=("oper_date", "hour_ending", "dst_flag"),
        source_script="ingest_load.py",
        has_live_trigger=False,
    ),
    SharedTable(
        name="ercot_shape_loadzone",
        dedup_keys=("oper_date", "hour", "load_zone"),
        source_script="calculate_ercot_shape.py",
        has_live_trigger=False,
    ),
    SharedTable(
        name="ercot_holidays",
        dedup_keys=("holiday_date", "holiday_name"),
        source_script="generate_holidays.py",
        has_live_trigger=False,
    ),
    SharedTable(
        name="ercot_rtm_settlement_prices",
        dedup_keys=("operating_date", "interval_ending", "settlement_point"),
        source_script="scraper_ercot_market_prices.py",
        has_live_trigger=True,
    ),
    SharedTable(
        name="ercot_dam_settlement_prices",
        dedup_keys=("operating_date", "hour_ending", "settlement_point"),
        source_script="scraper_ercot_market_prices.py",
        has_live_trigger=True,
    ),
    SharedTable(
        name="ercot_dam_capacity_prices",
        dedup_keys=("operating_date", "hour_ending", "ancillary_service_type"),
        source_script="scraper_ercot_market_prices.py",
        has_live_trigger=True,
    ),
]

_BY_NAME = {t.name: t for t in SHARED_REFERENCE_TABLES}


def get_table(name: str, silent: bool = False) -> SharedTable | None:
    table = _BY_NAME.get(name)
    if table is None and not silent:
        raise KeyError(
            f"'{name}' is not in SHARED_REFERENCE_TABLES -- add it there first "
            f"(see this module's docstring)."
        )
    return table
