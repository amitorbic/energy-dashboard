-- Migration 008: Create tax_rates; add taxable/non-taxable subtotals to invoices.
--
-- Part A: tax_rates — structure approved in Step 3 Part 1.
--   rate = NULL means "rate not yet confirmed; engine must skip this type."
--   jurisdiction_scope = NULL means statewide/universal.
--   county_tax and spdt/spdt2 jurisdiction determination is deferred
--   (county requires zip-to-county mapping; SPDT scope is TBD).
--
-- Part B: invoices subtotal columns — authorized by Step 3 Part B:
--   "Compute and store the taxable subtotal and non-taxable subtotal on the invoice."
--
-- Part C: seed statewide placeholder rows (rate = NULL until confirmed).

USE `u972964962_orbic`;

-- ─────────────────────────────────────────────────────────────────────────────
-- A. tax_rates
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `tax_rates` (
  `id`                 INT           NOT NULL AUTO_INCREMENT,
  `tax_type`           ENUM(
                         'state_tax',
                         'city_tax',
                         'county_tax',
                         'mta',
                         'puc_assessment',
                         'gross_receipt',
                         'spdt',
                         'spdt2'
                       )             NOT NULL,
  `jurisdiction_scope` VARCHAR(100)  DEFAULT NULL,
  -- NULL  = statewide / universal (state_tax, puc_assessment, gross_receipt)
  -- value = city name (HOUSTON, DALLAS, …) for city_tax / mta;
  --         county name for county_tax (after zip-to-county lookup is built);
  --         district name for spdt/spdt2 (TBD)
  `jurisdiction_type`  ENUM('state','city','county','mta','district') NOT NULL,
  `rate`               DECIMAL(10,6) DEFAULT NULL,
  -- NULL = rate not yet confirmed; engine MUST NOT compute tax for NULL-rate rows.
  -- 0.000000 = explicitly confirmed zero rate (distinct from "unknown").
  `effective_date`     DATE          NOT NULL,
  `end_date`           DATE          DEFAULT NULL,
  -- NULL = currently active; non-NULL = rate superseded on this date.
  `notes`              VARCHAR(500)  DEFAULT NULL,
  `created_at`         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                     ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_tax_type`     (`tax_type`),
  INDEX `idx_jurisdiction` (`jurisdiction_scope`),
  INDEX `idx_effective`    (`effective_date`, `end_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- B. Add subtotal columns to invoices
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE `invoices`
  ADD COLUMN `taxable_subtotal`     DECIMAL(12,2) NOT NULL DEFAULT 0.00
    AFTER `tdsp_total`,
  ADD COLUMN `non_taxable_subtotal` DECIMAL(12,2) NOT NULL DEFAULT 0.00
    AFTER `taxable_subtotal`;

-- ─────────────────────────────────────────────────────────────────────────────
-- C. Seed statewide placeholder rows (rate = NULL = not yet confirmed)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO `tax_rates`
  (`tax_type`, `jurisdiction_scope`, `jurisdiction_type`, `rate`,
   `effective_date`, `notes`)
VALUES
  ('state_tax',      NULL, 'state', NULL, '2020-01-01',
   'Texas state electricity tax — rate TBD'),
  ('puc_assessment', NULL, 'state', NULL, '2020-01-01',
   'PUCT assessment — rate TBD'),
  ('gross_receipt',  NULL, 'state', NULL, '2020-01-01',
   'Gross Receipt Tax Reimbursement — statewide flat — rate TBD');
