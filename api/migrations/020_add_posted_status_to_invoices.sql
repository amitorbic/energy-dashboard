-- Migration 020: Add 'posted' to invoices.status lifecycle.
--
-- New sequence: draft -> posted -> sent -> paid (void remains an exception
-- state reachable from any point). 'posted' sits between draft and sent so
-- the ENUM's ordinal order matches the intended lifecycle order.
--
-- Pre-migration audit (2026-07-30): all 3 existing invoice rows are 'draft'.
-- No rows hold a status value that would conflict with this change.

USE `u972964962_orbic`;

ALTER TABLE `invoices`
  MODIFY COLUMN `status` ENUM('draft','posted','sent','paid','void')
    NOT NULL DEFAULT 'draft';
