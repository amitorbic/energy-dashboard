-- Migration 021: Persistent daily counter for invoice numbers.
--
-- Invoice numbers were previously derived from MAX(SUBSTRING(invoice_number, 8))
-- over existing `invoices` rows for the day. Since revert now DELETEs the
-- invoice row entirely (no void/retention), that approach would let a deleted
-- invoice's number be reissued to the next invoice generated the same day --
-- a collision risk. This table tracks the last sequence used per date,
-- independent of which invoice rows still exist, so numbers are never reused.

USE `u972964962_orbic`;

CREATE TABLE IF NOT EXISTS `invoice_sequence_tracker` (
  `date`               DATE NOT NULL,
  `last_sequence_used` INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
