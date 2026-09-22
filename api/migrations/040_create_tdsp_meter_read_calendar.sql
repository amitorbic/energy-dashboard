-- Migration 040: TDSP meter-read calendar.
--
-- Supports Enrollment's "Meter Read Date" start-type resolution (see
-- docs/ENROLLMENT_RULES.md) by giving a per-TDSP, per-bill-cycle read-date
-- lookup for a given year. Joined at query time via
-- esi_id_master.duns + esi_id_master.meter_read_cycle -> this table's
-- tdsp_duns + bill_cycle -- no new per-ESI cycle-detection logic needed.
--
-- Each TDSP publishes its own schedule annually (PDF or spreadsheet, format
-- varies by TDSP) and the source document changes URL/format year to year,
-- so this table is populated by a manual yearly load
-- (api/scripts/load_tdsp_meter_read_calendar.py), not an automated feed.
--
-- tdsp_duns is nullable: at initial load we only have a confirmed DUNS for
-- Oncor (1039940674000, already used in api/controllers/test_data_generator.py).
-- Rows for other TDSPs are loaded keyed by tdsp_name only until their real
-- DUNS values are backfilled from esi_id_master.
--
-- AEP Texas Central and AEP Texas North publish the same schedule under one
-- document, so both are loaded from the same source file under their own
-- tdsp_name (two loader runs, one file).
--
-- Not executed against any database -- for review and manual run only,
-- same pattern as every other migration in this project.

CREATE TABLE `tdsp_meter_read_calendar` (
  `id`              INT           NOT NULL AUTO_INCREMENT,
  `tdsp_name`       VARCHAR(100)  NOT NULL,
  `tdsp_duns`       VARCHAR(20)   DEFAULT NULL,
  `year`            SMALLINT      NOT NULL,
  `bill_cycle`      VARCHAR(10)   NOT NULL,
  `read_date`       DATE          NOT NULL,
  `bill_date`       DATE          DEFAULT NULL,
  `days_serviced`   SMALLINT      DEFAULT NULL,
  `source_file`     VARCHAR(255)  DEFAULT NULL,
  `loaded_at`       DATETIME      DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tmrc_tdsp_cycle_read` (`tdsp_name`, `bill_cycle`, `read_date`),
  INDEX `idx_tmrc_tdsp_year_cycle` (`tdsp_name`, `year`, `bill_cycle`),
  INDEX `idx_tmrc_tdsp_duns` (`tdsp_duns`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
