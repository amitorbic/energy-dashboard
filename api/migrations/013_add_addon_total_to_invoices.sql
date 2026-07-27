-- Migration 013: Add addon_total to invoices.
--
-- Pre-production drift audit (2026-07-22/23) found this column live in dev,
-- positioned between tdsp_total and taxable_subtotal, with no migration
-- ever adding it -- it was applied ad-hoc after migration 008 ran (008 put
-- taxable_subtotal directly AFTER tdsp_total; live order has addon_total
-- in between, so this ALTER happened later, out-of-band).
--
-- It is load-bearing: invoice_engine.py sums it into total_billed /
-- total_amount and returns it as 'addon_total' in invoice line-item output.

USE `u972964962_orbic`;

ALTER TABLE `invoices`
  ADD COLUMN `addon_total` DECIMAL(12,2) NOT NULL DEFAULT 0.00
  AFTER `tdsp_total`;

-- ─────────────────────────────────────────────────────────────────────────────
-- puca_tax_rates -- table + data. Also found live in dev with no migration
-- or loader script anywhere in the repo. Load-bearing: invoice_engine.py
-- reads it for PUCA tax computation. Single confirmed row, statutory rate.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `puca_tax_rates` (
  `id`              INT           NOT NULL AUTO_INCREMENT,
  `rate`            DECIMAL(8,6)  NOT NULL,
  `statutory_basis` VARCHAR(255)  DEFAULT NULL,
  `effective_from`  DATE          DEFAULT NULL,
  -- NULL = always active (same convention as gros_tax_rates).
  `effective_to`    DATE          DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `puca_tax_rates`
  (`rate`, `statutory_basis`, `effective_from`, `effective_to`)
SELECT 0.001667,
       'Texas Utilities Code §16.001(b) — equal to one-sixth of one percent of gross receipts charged to the ultimate consumer',
       NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM `puca_tax_rates`);
