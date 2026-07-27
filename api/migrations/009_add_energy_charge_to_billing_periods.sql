-- Migration 009: Add energy_charge to billing_periods
--
-- energy_charge stores the precomputed supplier energy total for a period.
-- For single-contract periods: usage_kwh × contract_rate (rounded to 2dp).
-- For multi-contract periods: sum of per-segment prorated amounts.
-- Stored so the invoice engine can read it directly rather than recomputing
-- from contract_rate (which is NULL for multi-segment periods).
--
-- Backfill: set energy_charge = ROUND(usage_kwh * contract_rate, 2) for all
-- existing single-contract periods. Periods with contract_rate IS NULL (gap or
-- multi-segment, none currently exist) keep the DEFAULT 0.00.

ALTER TABLE `billing_periods`
  ADD COLUMN `energy_charge` DECIMAL(12,2) NOT NULL DEFAULT 0.00
  AFTER `meter_fee`;

UPDATE `billing_periods`
   SET `energy_charge` = ROUND(COALESCE(`usage_kwh` * `contract_rate`, 0), 2)
 WHERE `contract_rate` IS NOT NULL;
