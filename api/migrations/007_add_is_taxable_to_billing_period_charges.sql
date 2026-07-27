-- Migration 007: Add is_taxable to billing_period_charges
--
-- is_taxable: 0 = non-taxable, 1 = taxable
-- Snapshotted from tdsp_charge_mappings.is_taxable at charge-creation time.
-- NOT NULL because we only create a billing_period_charges row when a mapping
-- exists, and all current mappings have a verified is_taxable value.
-- If a mapping has is_taxable = NULL, the application skips creating the
-- billing_period_charges row (same behavior as unmapped).

ALTER TABLE `billing_period_charges`
  ADD COLUMN `is_taxable` TINYINT(1) NOT NULL DEFAULT 0
  AFTER `unit`;
