-- Adds contract_start_date to portfolio_contracts (created in migration 048).
-- Additive only -- 048 is never edited after the fact, per the
-- no-edit-numbered-migrations rule.
--
-- NULLable, no default at the DB level: the admin upload endpoint
-- (routers/admin_portfolio_contracts.py) is the one place that defaults a
-- blank start date to today's date, at parse time, before the INSERT -- not
-- here, so the column stays a plain passthrough for every other write path.
--
-- The contract_renewal AFTER INSERT/UPDATE/DELETE sync triggers from 048 are
-- deliberately NOT touched by this migration -- their INSERT/UPDATE column
-- lists don't mention contract_start_date, so synced rows (source='synced')
-- simply leave it NULL, same as they always could for any column added here
-- later. contract_renewal already has its own `contract_start_date DATE`
-- column (see its CREATE), so wiring the sync path to carry it through is a
-- separate, deliberate follow-up if/when needed -- out of scope for this
-- upload-field-list change.
ALTER TABLE `portfolio_contracts`
  ADD COLUMN `contract_start_date` DATE NULL AFTER `contract_type`;
