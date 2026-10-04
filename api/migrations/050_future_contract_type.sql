-- Migration 050: Future contract type support
--
-- Adds 'Future' as a recognised contract_type value across the portfolio stack.
-- No schema column changes are needed (contract_type is already VARCHAR on
-- portfolio_contracts). This migration only changes the portfolio_view
-- definition so that:
--
--   1. A contract with contract_type = 'Future' AND contract_start_date >
--      CURDATE() gets status = 'future' instead of 'active' — keeping it
--      out of the active position / open-position calculations which all
--      filter WHERE status = 'active'.
--
--   2. Once contract_start_date arrives (or is NULL), the view naturally
--      returns status = 'active' for that row with no manual update needed.
--
--   3. contract_start_date is exposed as a column in the view so the
--      frontend can show it on the customer list.
--
-- The populate sync (future_forecast_dates) is handled purely in application
-- code (admin_portfolio_contracts.py) — no DB object changes needed for that.
--
-- This replaces the portfolio_view definition from migration 048.
-- Run: mysql -u <db_user> -p energyapp < api/migrations/050_future_contract_type.sql
-- And the same file against every existing tenant DB on live.

CREATE OR REPLACE VIEW `portfolio_view` AS
SELECT
  CAST(NULL AS CHAR) AS `cust_id`,
  `portfolio_contracts`.`company_name` AS `company_name`,
  `portfolio_contracts`.`esi_id` AS `premise_id`,
  SUBSTRING_INDEX(SUBSTRING_INDEX(`portfolio_contracts`.`load_profile`,'_',2),'_',-1) AS `weather_zone`,
  CASE SUBSTRING_INDEX(SUBSTRING_INDEX(`portfolio_contracts`.`load_profile`,'_',2),'_',-1)
    WHEN 'NCENT' THEN 'NORTH' WHEN 'NORTH' THEN 'NORTH' WHEN 'EAST' THEN 'NORTH'
    WHEN 'SCENT' THEN 'SOUTH' WHEN 'SOUTH' THEN 'SOUTH'
    WHEN 'FWEST' THEN 'WEST'  WHEN 'WEST'  THEN 'WEST'
    WHEN 'COAST' THEN 'COAST' ELSE 'UNKNOWN' END AS `zone`,
  `portfolio_contracts`.`load_profile` AS `load_profile`,
  CASE WHEN `portfolio_contracts`.`contract_type` = 'Fix'    THEN 'Fix'
       WHEN `portfolio_contracts`.`contract_type` = 'LMP'    THEN 'LMP'
       WHEN `portfolio_contracts`.`contract_type` = 'Future' THEN 'Future'
       ELSE 'MTM' END AS `contract_type`,
  `portfolio_contracts`.`contract_rate` AS `contract_rate`,
  `portfolio_contracts`.`contract_start_date` AS `contract_start_date`,
  `portfolio_contracts`.`contract_end_date` AS `contract_end_date`,
  `portfolio_contracts`.`annual_volume` AS `usage_kwh`,
  `portfolio_contracts`.`broker_code` AS `broker_code`,
  CASE
    WHEN `portfolio_contracts`.`contract_type` = 'Future'
         AND `portfolio_contracts`.`contract_start_date` > CURDATE()
    THEN 'future'
    WHEN `portfolio_contracts`.`contract_end_date` >= CURDATE() THEN 'active'
    ELSE 'expired'
  END AS `status`
FROM `portfolio_contracts`
WHERE `portfolio_contracts`.`contract_end_date` > '2000-01-01';
