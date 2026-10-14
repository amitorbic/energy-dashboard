-- Migration 051: portfolio_view — full contract type support
--
-- Supersedes migration 050 (which was written before MCP, MCP2, and Unknown
-- were defined). Per the no-edit-numbered-migrations rule, 050 is NOT edited;
-- this file creates the final view that replaces what 050 would have created.
-- Do NOT apply 050 on any environment — apply this file instead (or after).
-- 050 is marked SUPERSEDED in docs/DB_MIGRATIONS.md.
--
-- Changes from the 048 view (what is live today):
--
--   1. contract_type pass-through: Fix, Future, LMP, MTM, MCP, MCP2 each
--      appear as their own value. Anything else (NULL, 'Default', stray
--      values from contract_renewal sync) becomes 'Unknown' — never 'MTM'.
--
--   2. contract_start_date exposed as a view column.
--
--   3. status = 'future' for a Future-type row whose start_date is still
--      in the future; auto-becomes 'active' once start_date arrives without
--      any re-upload or manual update. All other types: active/expired by
--      end_date as before.
--
--   4. The WHERE clause remains: contract_end_date > '2000-01-01', so rows
--      with a null or sentinel end date are still excluded.
--
-- Run:
--   mysql -u <db_user> -p energyapp < api/migrations/051_portfolio_view_full_types.sql
--   And the same file against every existing tenant DB on live.
-- Check live schema first: SHOW CREATE VIEW portfolio_view;

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
  CASE
    WHEN `portfolio_contracts`.`contract_type` = 'Fix'    THEN 'Fix'
    WHEN `portfolio_contracts`.`contract_type` = 'Future' THEN 'Future'
    WHEN `portfolio_contracts`.`contract_type` = 'LMP'    THEN 'LMP'
    WHEN `portfolio_contracts`.`contract_type` = 'MTM'    THEN 'MTM'
    WHEN `portfolio_contracts`.`contract_type` = 'MCP'    THEN 'MCP'
    WHEN `portfolio_contracts`.`contract_type` = 'MCP2'   THEN 'MCP2'
    ELSE 'Unknown'
  END AS `contract_type`,
  `portfolio_contracts`.`contract_rate` AS `contract_rate`,
  `portfolio_contracts`.`contract_start_date` AS `contract_start_date`,
  `portfolio_contracts`.`contract_end_date` AS `contract_end_date`,
  `portfolio_contracts`.`annual_volume` AS `usage_kwh`,
  `portfolio_contracts`.`broker_code` AS `broker_code`,
  CASE
    WHEN `portfolio_contracts`.`contract_type` = 'Future'
         AND `portfolio_contracts`.`contract_start_date` IS NOT NULL
         AND `portfolio_contracts`.`contract_start_date` > CURDATE()
    THEN 'future'
    WHEN `portfolio_contracts`.`contract_end_date` >= CURDATE() THEN 'active'
    ELSE 'expired'
  END AS `status`
FROM `portfolio_contracts`
WHERE `portfolio_contracts`.`contract_end_date` > '2000-01-01';
