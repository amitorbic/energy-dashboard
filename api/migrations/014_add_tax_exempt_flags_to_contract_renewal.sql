-- Migration 014: Add grt_tax_exempt / puc_tax_exempt to contract_renewal.
--
-- Pre-production drift audit (2026-07-22/23) found both columns live in dev
-- with no migration ever adding them. Their clean TINYINT(1) NOT NULL
-- DEFAULT 0 typing (vs. the surrounding legacy exemption columns, which are
-- all VARCHAR) and their naming, matching the gros_tax_rates/puca_tax_rates
-- tables added for this project's MGRT/PUCA tax work, indicate these were
-- added ad-hoc during that work rather than being pre-existing legacy
-- schema. Load-bearing: read by invoice_engine.py, written by
-- contract_renewal.py and enrollment_engine.py.
--
-- (The other VARCHAR exemption columns on this table -- city_tax_exempt,
-- county_tax_exempt, mtacda_tax_exempt, spdt_tax_exempt, spdt2_tax_exempt,
-- state_tax_exempt -- predate this project's migrations and are out of
-- scope here; see the drift-audit report.)

USE `u972964962_orbic`;

ALTER TABLE `contract_renewal`
  ADD COLUMN `grt_tax_exempt` TINYINT(1) NOT NULL DEFAULT 0
    AFTER `state_tax_exempt`,
  ADD COLUMN `puc_tax_exempt` TINYINT(1) NOT NULL DEFAULT 0
    AFTER `grt_tax_exempt`;
