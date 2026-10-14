-- Migration 053: contract_renewal_unsynced view
--
-- One shared definition of "contract_renewal rows the Portfolio sync skips",
-- so the reconcile script, GET /api/admin/portfolio-contracts/status and
-- GET /api/portfolio/summary all count the same rows the same way.
--
-- A row is skipped by the migration 052 triggers and the reconcile script when
--   premise_id IS NULL, or load_profile IS NULL, or
--   STR_TO_DATE(contract_end_date, '%m/%d/%Y') IS NULL.
-- This view lists exactly those rows. Each row gets ONE reason (first match
-- wins, in this order) so counts by reason add up to the total:
--   premise_id_null       premise_id IS NULL
--   load_profile_null     load_profile IS NULL (premise_id present)
--   end_date_null         contract_end_date NULL or blank (the others present)
--   end_date_unparseable  contract_end_date present but not m/d/Y (the others present)
--
-- Read-only view: does not change any contract_renewal row.
-- If the skip conditions in migration 052 ever change, replace this view in a
-- new, later-numbered migration.
--
-- Single % in STR_TO_DATE: plain SQL file, no Python substitution.
--
-- Run:
--   mysql -u <db_user> -p energyapp < api/migrations/053_contract_renewal_unsynced_view.sql
--   And the same file against every existing tenant DB on live.

CREATE OR REPLACE VIEW `contract_renewal_unsynced` AS
SELECT
  cr.serial,
  cr.premise_id,
  cr.load_profile,
  cr.contract_end_date,
  cr.contract_type,
  cr.company_name,
  CASE
    WHEN cr.premise_id IS NULL                                   THEN 'premise_id_null'
    WHEN cr.load_profile IS NULL                                 THEN 'load_profile_null'
    WHEN cr.contract_end_date IS NULL
         OR TRIM(cr.contract_end_date) = ''                      THEN 'end_date_null'
    ELSE 'end_date_unparseable'
  END AS reason
FROM `contract_renewal` cr
WHERE cr.premise_id IS NULL
   OR cr.load_profile IS NULL
   OR STR_TO_DATE(cr.contract_end_date, '%m/%d/%Y') IS NULL;
