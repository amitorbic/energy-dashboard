-- Standalone Portfolio contract table -- Portfolio reads ONLY from this table
-- from now on, never contract_renewal directly, for any tenant.
--
-- Two ways this table gets populated, gated by portfolio_contracts_sync_state
-- (a single-row per-tenant flag, NOT a live TENANT_MODULES check -- see the
-- explicit /api/admin/portfolio-contracts/upgrade endpoint in
-- api/routers/admin_portfolio_contracts.py):
--   - Portfolio-only tenants (is_full_tenant=0): rows come ONLY from the new
--     admin spreadsheet upload (source='upload'), never from contract_renewal.
--   - Full 4-module tenants (is_full_tenant=1): rows are synced one-way FROM
--     contract_renewal via the AFTER INSERT/UPDATE/DELETE triggers below.
--     Sync is same-database (unlike the cross-DB shared-reference-data sync
--     in utils/shared_reference_tables.py), so a real MySQL trigger is used
--     instead of an app-level call-site hook -- contract_renewal has 6+ write
--     call sites across routers/enrollment_engine.py, routers/contract_renewal.py,
--     and controllers/broker_renewals.py; a trigger structurally cannot miss
--     one the way instrumenting every call site could.
--
-- portfolio_view (see migration 044) is repointed here to read from
-- portfolio_contracts instead of contract_renewal -- this is the ONLY change
-- needed for Portfolio's read side (controllers/portfolio.py). No Python
-- code there changes: every one of its functions queries portfolio_view, and
-- none of them know or care whether a row came from an upload or a sync.
--
-- TRUNCATE does not fire DELETE triggers in MySQL (it's DDL) -- the existing
-- bulk upload in routers/contract_renewal.py does
-- `TRUNCATE TABLE contract_renewal` then reinserts, so the AFTER INSERT
-- trigger repopulates fine but can leave orphaned portfolio_contracts rows
-- for serials that existed before the truncate and weren't in the new file.
-- api/scripts/reconcile_portfolio_contracts.py is the nightly backstop that
-- catches this gap (and any other missed write path), same two-leg standard
-- (event-driven + periodic reconcile) as the shared-reference-data sync.

CREATE TABLE IF NOT EXISTS `portfolio_contracts` (
  `id`                  INT AUTO_INCREMENT PRIMARY KEY,
  `esi_id`              VARCHAR(100)  NOT NULL,
  `load_profile`        VARCHAR(255)  NOT NULL,
  `contract_rate`       VARCHAR(50)   NOT NULL,
  `annual_volume`       VARCHAR(255)  NOT NULL,
  `contract_end_date`   DATE          NOT NULL,
  `contract_type`       VARCHAR(255)  NULL,
  `company_name`        VARCHAR(200)  NULL,
  `broker_code`         VARCHAR(50)   NULL,
  `source`              ENUM('upload','synced') NOT NULL,
  -- contract_renewal.serial this row was synced from -- NULL for
  -- source='upload' rows. UNIQUE so the trigger's ON DUPLICATE KEY UPDATE
  -- is a true upsert (re-syncing the same contract_renewal row updates in
  -- place rather than duplicating). MySQL allows multiple NULLs under a
  -- UNIQUE key, so upload rows never collide with each other here.
  `synced_from_serial`  INT           NULL,
  `created_at`          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_portfolio_contracts_synced_serial` (`synced_from_serial`),
  KEY `idx_portfolio_contracts_esi_id` (`esi_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Single-row per-tenant flag: has this tenant been upgraded from
-- portfolio-only to full-4-module? Flipped ONLY by the explicit staff-run
-- POST /api/admin/portfolio-contracts/upgrade endpoint -- deliberately not
-- inferred from TENANT_MODULES at login/startup, so the discrepancy-check +
-- clear-and-replace sequence happens at a known, controlled moment instead
-- of an unpredictable one. Also gates whether the sync triggers below and
-- the admin upload endpoint are allowed to act.
CREATE TABLE IF NOT EXISTS `portfolio_contracts_sync_state` (
  `id`              TINYINT NOT NULL DEFAULT 1,
  `is_full_tenant`  TINYINT(1) NOT NULL DEFAULT 0,
  `upgraded_at`     DATETIME NULL,
  `upgraded_by`     VARCHAR(200) NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO `portfolio_contracts_sync_state` (`id`, `is_full_tenant`) VALUES (1, 0);

-- Written by the upgrade endpoint BEFORE it clears any source='upload' rows,
-- in the same transaction as the clear-and-replace -- so a crash mid-upgrade
-- leaves the old spreadsheet data untouched rather than losing the
-- discrepancy record along with it.
CREATE TABLE IF NOT EXISTS `portfolio_contract_upgrade_discrepancies` (
  `id`           INT AUTO_INCREMENT PRIMARY KEY,
  `esi_id`       VARCHAR(100) NOT NULL,
  `field_name`   VARCHAR(50)  NOT NULL,
  `old_value`    VARCHAR(500) NULL,
  `new_value`    VARCHAR(500) NULL,
  `detected_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_discrepancies_esi_id` (`esi_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ── One-way sync triggers: contract_renewal -> portfolio_contracts ────────
-- Only ever act when is_full_tenant=1. Mirror portfolio_view's own
-- visibility gate (premise_id + load_profile NOT NULL, contract_end_date
-- parses under %m/%d/%Y) -- a row that wouldn't be visible in the old view
-- is simply not synced, same as today's behavior, not a new gap.

DELIMITER $$

CREATE TRIGGER `trg_portfolio_contracts_sync_ins` AFTER INSERT ON `contract_renewal`
FOR EACH ROW
BEGIN
  DECLARE v_full TINYINT DEFAULT 0;
  DECLARE v_end DATE;
  SELECT is_full_tenant INTO v_full FROM portfolio_contracts_sync_state LIMIT 1;
  IF v_full = 1 AND NEW.premise_id IS NOT NULL AND NEW.load_profile IS NOT NULL THEN
    SET v_end = STR_TO_DATE(NEW.contract_end_date, '%m/%d/%Y');
    IF v_end IS NOT NULL THEN
      INSERT INTO portfolio_contracts
        (esi_id, load_profile, contract_rate, annual_volume, contract_end_date,
         contract_type, company_name, broker_code, source, synced_from_serial)
      VALUES
        (NEW.premise_id, NEW.load_profile, NEW.contract_rate, NEW.contract_renewal_usage,
         v_end, NEW.contract_type, NEW.company_name, NEW.broker_code, 'synced', NEW.serial)
      ON DUPLICATE KEY UPDATE
        esi_id = VALUES(esi_id),
        load_profile = VALUES(load_profile),
        contract_rate = VALUES(contract_rate),
        annual_volume = VALUES(annual_volume),
        contract_end_date = VALUES(contract_end_date),
        contract_type = VALUES(contract_type),
        company_name = VALUES(company_name),
        broker_code = VALUES(broker_code),
        source = 'synced';
    END IF;
  END IF;
END$$

CREATE TRIGGER `trg_portfolio_contracts_sync_upd` AFTER UPDATE ON `contract_renewal`
FOR EACH ROW
BEGIN
  DECLARE v_full TINYINT DEFAULT 0;
  DECLARE v_end DATE;
  SELECT is_full_tenant INTO v_full FROM portfolio_contracts_sync_state LIMIT 1;
  IF v_full = 1 THEN
    IF NEW.premise_id IS NOT NULL AND NEW.load_profile IS NOT NULL THEN
      SET v_end = STR_TO_DATE(NEW.contract_end_date, '%m/%d/%Y');
      IF v_end IS NOT NULL THEN
        INSERT INTO portfolio_contracts
          (esi_id, load_profile, contract_rate, annual_volume, contract_end_date,
           contract_type, company_name, broker_code, source, synced_from_serial)
        VALUES
          (NEW.premise_id, NEW.load_profile, NEW.contract_rate, NEW.contract_renewal_usage,
           v_end, NEW.contract_type, NEW.company_name, NEW.broker_code, 'synced', NEW.serial)
        ON DUPLICATE KEY UPDATE
          esi_id = VALUES(esi_id),
          load_profile = VALUES(load_profile),
          contract_rate = VALUES(contract_rate),
          annual_volume = VALUES(annual_volume),
          contract_end_date = VALUES(contract_end_date),
          contract_type = VALUES(contract_type),
          company_name = VALUES(company_name),
          broker_code = VALUES(broker_code),
          source = 'synced';
      ELSE
        -- Edit made the date unparseable -- no longer visible, drop the sync row.
        DELETE FROM portfolio_contracts WHERE synced_from_serial = NEW.serial;
      END IF;
    ELSE
      -- Edit cleared premise_id/load_profile -- no longer visible, drop the sync row.
      DELETE FROM portfolio_contracts WHERE synced_from_serial = NEW.serial;
    END IF;
  END IF;
END$$

CREATE TRIGGER `trg_portfolio_contracts_sync_del` AFTER DELETE ON `contract_renewal`
FOR EACH ROW
BEGIN
  DELETE FROM portfolio_contracts WHERE synced_from_serial = OLD.serial;
END$$

DELIMITER ;

-- ── Repoint portfolio_view at portfolio_contracts ──────────────────────────
-- Same output columns/derivation logic as the version documented in
-- migration 044 (zone parsed from load_profile, status derived from
-- contract_end_date, contract_type re-bucketed into Fix/LMP/MTM) so
-- controllers/portfolio.py needs zero code changes.
--
-- Two disclosed behavior changes vs. the old contract_renewal-backed view:
--   - cust_id is always NULL now -- portfolio_contracts has no cust_id
--     concept (it wasn't one of the fields Portfolio actually needs; see
--     the investigation report). get_portfolio_customers still selects and
--     displays it, so it'll just render blank instead of a customer id.
--   - contract_end_date is a real DATE column now (not STR_TO_DATE'd from a
--     varchar at read time), so the WHERE clause's null-checks collapse to
--     the one remaining sanity filter.
CREATE OR REPLACE VIEW `portfolio_view` AS
SELECT
  CAST(NULL AS CHAR) AS `cust_id`,
  `portfolio_contracts`.`company_name` AS `company_name`,
  `portfolio_contracts`.`esi_id` AS `premise_id`,
  SUBSTRING_INDEX(SUBSTRING_INDEX(`portfolio_contracts`.`load_profile`,'_',2),'_',-1) AS `weather_zone`,
  CASE SUBSTRING_INDEX(SUBSTRING_INDEX(`portfolio_contracts`.`load_profile`,'_',2),'_',-1)
    WHEN 'NCENT' THEN 'NORTH' WHEN 'NORTH' THEN 'NORTH' WHEN 'EAST' THEN 'NORTH'
    WHEN 'SCENT' THEN 'SOUTH' WHEN 'SOUTH' THEN 'SOUTH'
    WHEN 'FWEST' THEN 'WEST' WHEN 'WEST' THEN 'WEST'
    WHEN 'COAST' THEN 'COAST' ELSE 'UNKNOWN' END AS `zone`,
  `portfolio_contracts`.`load_profile` AS `load_profile`,
  CASE WHEN `portfolio_contracts`.`contract_type` = 'Fix' THEN 'Fix'
       WHEN `portfolio_contracts`.`contract_type` = 'LMP' THEN 'LMP'
       ELSE 'MTM' END AS `contract_type`,
  `portfolio_contracts`.`contract_rate` AS `contract_rate`,
  `portfolio_contracts`.`contract_end_date` AS `contract_end_date`,
  `portfolio_contracts`.`annual_volume` AS `usage_kwh`,
  `portfolio_contracts`.`broker_code` AS `broker_code`,
  CASE WHEN `portfolio_contracts`.`contract_end_date` >= CURDATE() THEN 'active' ELSE 'expired' END AS `status`
FROM `portfolio_contracts`
WHERE `portfolio_contracts`.`contract_end_date` > '2000-01-01';
