-- Migration 041: start-date-type / status flags on confirmation_log.
--
-- The send-confirmation form (app/pages/contracts/send.tsx) has always had
-- checkboxes for these -- asap, meter_read, prior_day, nodal, credit_status,
-- contract_received, executed, forwarded, paper_bill, switch_flag, pmvi, mvi
-- -- and the confirmation email HTML already renders them (see
-- _build_confirmation_email_html / _build_lmp_confirmation_email_html in
-- routers/contracts_confirm.py). But send_confirmation_email()'s `fields`
-- dict, which controls the actual INSERT/UPDATE into confirmation_log, never
-- included them, so they were silently discarded before ever reaching the
-- database -- confirmed via docs/ENROLLMENT_RULES.md follow-up and user
-- report that "View All Confirmations" was missing this data.
--
-- Run this BEFORE deploying the corresponding fields-dict fix in
-- routers/contracts_confirm.py (see next commit), or the new columns will
-- reject the writes with "unknown column" errors.
--
-- Some of these may already exist in the live table -- send.tsx's
-- edit-prefill effect already reads d.credit_status / d.contract_received /
-- d.executed / d.forwarded / d.paper_bill back from the API, which only
-- makes sense if a prior developer already added at least some of these
-- columns by hand (confirmation_log predates the migration system -- no
-- CREATE TABLE for it exists in this migrations folder). CHECK THE LIVE
-- SCHEMA (`DESCRIBE confirmation_log;`) before running and drop any ADD
-- COLUMN lines below for columns that already exist.
--
-- Not executed against any database -- for review and manual run only, same
-- pattern as every other migration in this project.

ALTER TABLE `confirmation_log`
  ADD COLUMN `asap`               TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Start date type: ASAP checkbox',
  ADD COLUMN `meter_read`         TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Start date type: Meter Read Date checkbox',
  ADD COLUMN `prior_day`          TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Pricing: use prior_* tables for quote calc',
  ADD COLUMN `nodal`              TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Nodal pricing flag',
  ADD COLUMN `credit_status`      TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Credit approved',
  ADD COLUMN `contract_received`  TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Contract received/signed',
  ADD COLUMN `executed`           TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN `forwarded`          TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Forwarded for enrollment',
  ADD COLUMN `paper_bill`         TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Paper bill required',
  ADD COLUMN `switch_flag`        TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Check which applies: Switch',
  ADD COLUMN `pmvi`               TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Check which applies: Priority Move-In',
  ADD COLUMN `mvi`                TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Check which applies: Move-In';
