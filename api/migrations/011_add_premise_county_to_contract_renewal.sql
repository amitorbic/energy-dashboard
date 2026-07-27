-- Migration 011: Add premise_county to contract_renewal.
--
-- No backfill — existing rows are left NULL. premise_city/premise_state/
-- premise_zip already exist; premise_county fills the gap needed to join
-- against tax_jurisdiction_rates.county_name for tax computation.

ALTER TABLE `contract_renewal`
  ADD COLUMN `premise_county` VARCHAR(100) NULL
  AFTER `premise_zip`;
