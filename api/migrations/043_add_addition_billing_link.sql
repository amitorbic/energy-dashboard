-- Migration 043: account-linkage fields for Build Plan #9 (Addition).
--
-- docs/ENROLLMENT_RULES.md #9 (decided 2026-09-21): an Addition enrollment
-- links a new ESI to an existing customer account via an explicit account
-- picker on the send-confirmation form (app/pages/contracts/send.tsx), and
-- the broker chooses whether billing is consolidated onto that existing
-- account or kept separate. Every enrollment still gets its own cust_id;
-- consolidated billing is expressed via contract_renewal.bill_to_id
-- (already used by controllers/billing.py's consolidated-billing grouping
-- queries -- WHERE bill_to_id = :master_id).
--
-- Two tables need a new column to carry the picked account + choice all the
-- way from submission to the final contract_renewal row:
--   confirmation_log (submission)     -> linked_cust_id, billing_choice
--   enrollment_masterroll (staging,   -> bill_to_id (already-resolved value:
--     populated by /generate-masterroll,  linked_cust_id if billing_choice
--     read back by /activate)             == 'consolidated', else NULL)
-- contract_renewal.bill_to_id itself already exists -- no change needed
-- there, /activate's INSERT just needs to pass enrollment_masterroll's
-- bill_to_id through to it.
--
-- Not executed against any database -- for review and manual run only, same
-- pattern as every other migration in this project. Check the live schema
-- first (`DESCRIBE confirmation_log;` / `DESCRIBE enrollment_masterroll;`)
-- since confirmation_log predates the migration system.

ALTER TABLE `confirmation_log`
  ADD COLUMN `linked_cust_id` VARCHAR(50) NULL COMMENT 'Addition: contract_renewal.cust_id of the existing account this ESI is linked to, from the explicit account picker',
  ADD COLUMN `billing_choice` VARCHAR(20) NULL COMMENT 'Addition: consolidated (bills under linked_cust_id) or separate';

ALTER TABLE `enrollment_masterroll`
  ADD COLUMN `bill_to_id` VARCHAR(50) NULL COMMENT 'Resolved from confirmation_log.linked_cust_id when billing_choice = consolidated; carried through to contract_renewal.bill_to_id at /activate';
