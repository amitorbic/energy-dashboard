-- Migration 052: contract_renewal sync triggers -- contract_type normalization
--
-- Replaces the three triggers created by migration 048 with versions that
-- normalize contract_type into the Portfolio canonical vocabulary before
-- writing to portfolio_contracts.
--
-- Why a new migration instead of editing 048:
--   Per project rule, numbered migration files are never edited. This file
--   drops and recreates all three triggers.
--
-- Normalization rules applied at sync time (mirrors utils/contract_type_utils.py
-- sync_map_contract_type() and scripts/reconcile_portfolio_contracts.py).
-- If you change this mapping, update those Python files too.
--
--   "Default" (any case, trimmed)          -> MTM
--   NULL or blank + end_date past today    -> MTM   (legacy rule only)
--   NULL or blank + end_date today/future  -> Fix   (legacy rule only)
--   NULL or blank + unparseable/NULL end   -> Unknown
--   fix / fixed (any case)                 -> Fix
--   future                                 -> Future
--   lmp                                    -> LMP
--   mtm                                    -> MTM
--   mcp                                    -> MCP
--   mcp2                                   -> MCP2
--   any other non-blank value              -> Unknown (visible in Unknown bucket)
--
-- "Legacy rule" note: new NULL values in contract_renewal are now blocked at
-- every write path (routers/contract_renewal.py, routers/enrollment_engine.py).
-- Rules 2 and 3 above exist to handle rows that were written before that
-- validation existed. A trigger only fires when the row changes; a row synced
-- as Fix will not flip to MTM automatically when its end_date passes -- the
-- reconcile script (scripts/reconcile_portfolio_contracts.py) re-evaluates
-- those on each run.
--
-- Percent characters in STR_TO_DATE use single % because migration files are
-- plain SQL, not Python f-strings or SQLAlchemy text() with bind parameters.
--
-- Run:
--   mysql -u <db_user> -p energyapp < api/migrations/052_portfolio_contracts_trigger_sync_normalization.sql
--   And the same file against every existing tenant DB on live.
--   Check first: SHOW TRIGGERS LIKE 'trg_portfolio_contracts_sync_%';

DELIMITER $$

DROP TRIGGER IF EXISTS `trg_portfolio_contracts_sync_ins`$$
DROP TRIGGER IF EXISTS `trg_portfolio_contracts_sync_upd`$$
DROP TRIGGER IF EXISTS `trg_portfolio_contracts_sync_del`$$

CREATE TRIGGER `trg_portfolio_contracts_sync_ins` AFTER INSERT ON `contract_renewal`
FOR EACH ROW
BEGIN
  DECLARE v_full   TINYINT DEFAULT 0;
  DECLARE v_end    DATE;
  DECLARE v_ctype  VARCHAR(255);
  SELECT is_full_tenant INTO v_full FROM portfolio_contracts_sync_state LIMIT 1;
  IF v_full = 1 AND NEW.premise_id IS NOT NULL AND NEW.load_profile IS NOT NULL THEN
    SET v_end = STR_TO_DATE(NEW.contract_end_date, '%m/%d/%Y');
    IF v_end IS NOT NULL THEN
      SET v_ctype = CASE
        WHEN TRIM(LOWER(COALESCE(NEW.contract_type, ''))) = 'default'  THEN 'MTM'
        WHEN TRIM(COALESCE(NEW.contract_type, '')) = ''
          THEN CASE
            WHEN v_end < CURDATE()  THEN 'MTM'
            WHEN v_end >= CURDATE() THEN 'Fix'
            ELSE 'Unknown'
          END
        WHEN TRIM(LOWER(NEW.contract_type)) IN ('fix','fixed')  THEN 'Fix'
        WHEN TRIM(LOWER(NEW.contract_type)) = 'future'          THEN 'Future'
        WHEN TRIM(LOWER(NEW.contract_type)) = 'lmp'             THEN 'LMP'
        WHEN TRIM(LOWER(NEW.contract_type)) = 'mtm'             THEN 'MTM'
        WHEN TRIM(LOWER(NEW.contract_type)) = 'mcp'             THEN 'MCP'
        WHEN TRIM(LOWER(NEW.contract_type)) = 'mcp2'            THEN 'MCP2'
        ELSE 'Unknown'
      END;
      INSERT INTO portfolio_contracts
        (esi_id, load_profile, contract_rate, annual_volume, contract_end_date,
         contract_type, company_name, broker_code, source, synced_from_serial)
      VALUES
        (NEW.premise_id, NEW.load_profile, NEW.contract_rate, NEW.contract_renewal_usage,
         v_end, v_ctype, NEW.company_name, NEW.broker_code, 'synced', NEW.serial)
      ON DUPLICATE KEY UPDATE
        esi_id            = VALUES(esi_id),
        load_profile      = VALUES(load_profile),
        contract_rate     = VALUES(contract_rate),
        annual_volume     = VALUES(annual_volume),
        contract_end_date = VALUES(contract_end_date),
        contract_type     = VALUES(contract_type),
        company_name      = VALUES(company_name),
        broker_code       = VALUES(broker_code),
        source            = 'synced';
    END IF;
  END IF;
END$$

CREATE TRIGGER `trg_portfolio_contracts_sync_upd` AFTER UPDATE ON `contract_renewal`
FOR EACH ROW
BEGIN
  DECLARE v_full   TINYINT DEFAULT 0;
  DECLARE v_end    DATE;
  DECLARE v_ctype  VARCHAR(255);
  SELECT is_full_tenant INTO v_full FROM portfolio_contracts_sync_state LIMIT 1;
  IF v_full = 1 THEN
    IF NEW.premise_id IS NOT NULL AND NEW.load_profile IS NOT NULL THEN
      SET v_end = STR_TO_DATE(NEW.contract_end_date, '%m/%d/%Y');
      IF v_end IS NOT NULL THEN
        SET v_ctype = CASE
          WHEN TRIM(LOWER(COALESCE(NEW.contract_type, ''))) = 'default'  THEN 'MTM'
          WHEN TRIM(COALESCE(NEW.contract_type, '')) = ''
            THEN CASE
              WHEN v_end < CURDATE()  THEN 'MTM'
              WHEN v_end >= CURDATE() THEN 'Fix'
              ELSE 'Unknown'
            END
          WHEN TRIM(LOWER(NEW.contract_type)) IN ('fix','fixed')  THEN 'Fix'
          WHEN TRIM(LOWER(NEW.contract_type)) = 'future'          THEN 'Future'
          WHEN TRIM(LOWER(NEW.contract_type)) = 'lmp'             THEN 'LMP'
          WHEN TRIM(LOWER(NEW.contract_type)) = 'mtm'             THEN 'MTM'
          WHEN TRIM(LOWER(NEW.contract_type)) = 'mcp'             THEN 'MCP'
          WHEN TRIM(LOWER(NEW.contract_type)) = 'mcp2'            THEN 'MCP2'
          ELSE 'Unknown'
        END;
        INSERT INTO portfolio_contracts
          (esi_id, load_profile, contract_rate, annual_volume, contract_end_date,
           contract_type, company_name, broker_code, source, synced_from_serial)
        VALUES
          (NEW.premise_id, NEW.load_profile, NEW.contract_rate, NEW.contract_renewal_usage,
           v_end, v_ctype, NEW.company_name, NEW.broker_code, 'synced', NEW.serial)
        ON DUPLICATE KEY UPDATE
          esi_id            = VALUES(esi_id),
          load_profile      = VALUES(load_profile),
          contract_rate     = VALUES(contract_rate),
          annual_volume     = VALUES(annual_volume),
          contract_end_date = VALUES(contract_end_date),
          contract_type     = VALUES(contract_type),
          company_name      = VALUES(company_name),
          broker_code       = VALUES(broker_code),
          source            = 'synced';
      ELSE
        DELETE FROM portfolio_contracts WHERE synced_from_serial = NEW.serial;
      END IF;
    ELSE
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
