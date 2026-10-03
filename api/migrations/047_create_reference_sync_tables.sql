-- Tracking tables for the one-directional shared-reference-data sync
-- (shared source DB -> every tenant DB, see api/scripts/sync_reference_data.py
-- and api/utils/shared_reference_tables.py). Both created here, in the
-- source DB, so they flow into every new tenant automatically via
-- provision_tenant.py's step_clone_schema() (which clones every table
-- generically -- no per-table list). reference_sync_source_status is only
-- ever meaningfully written in the real source DB; a tenant's own copy of
-- it stays empty/unused, same as any other table this generic clone
-- copies structurally but a tenant never writes to.

-- TENANT side -- "when did THIS tenant last successfully RECEIVE a sync
-- for this table." Written by sync_reference_data.py after it copies rows
-- into a given tenant DB. Read by api/utils/reference_freshness.py from
-- that tenant's own DB connection -- no cross-DB read needed at request
-- time.
CREATE TABLE IF NOT EXISTS `reference_sync_state` (
  `table_name`     VARCHAR(64) NOT NULL,
  `last_synced_at` DATETIME NOT NULL,
  `last_source_id` BIGINT NOT NULL DEFAULT 0,
  `rows_synced`    INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`table_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- SOURCE side -- "when did WE last successfully PUSH this table out to
-- every active tenant." Written only in the shared source DB, once a full
-- sync cycle for a table completes across every active tenant. Exposed
-- for internal pipeline-health visibility (see
-- GET /api/admin/reference-sync/status in routers/admin_reference_sync.py)
-- -- not customer-facing.
CREATE TABLE IF NOT EXISTS `reference_sync_source_status` (
  `table_name`     VARCHAR(64) NOT NULL,
  `last_synced_at` DATETIME NOT NULL,
  `last_source_id` BIGINT NOT NULL DEFAULT 0,
  `tenants_synced` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`table_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
