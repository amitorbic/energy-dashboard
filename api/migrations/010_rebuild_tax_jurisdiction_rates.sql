-- Migration 010: Rebuild tax_jurisdiction_rates from the official Comptroller
-- city-rates.xlsx (sheet "Jul26"), replacing the earlier taxrates.txt flat-file
-- load.
--
-- The old flat-file loader produced duplicate/erroneous rows for combined-area
-- codes: plain "Fort Worth" (city_code 2220031) picked up a spurious 0.005
-- county_tax_rate for county=Parker and county=Wise (total 8.75%), when only
-- the dedicated combination codes "Fort Worth/Parker Co" (6184605) and
-- "Fort Worth/Wise Co" (6249608) actually carry that county overlap — and at
-- 0.000000 county_tax_rate, not 0.005 (total 8.25%). The official xlsx shows
-- exactly 4 Fort Worth entries (Denton, Tarrant, Parker, Wise), all 8.25%,
-- confirming the old 8.75% Parker/Wise rows were a parser bug, not real data.
--
-- Adds SPD2/SPD3/Transit2 name+code columns and a total_tax_rate column so
-- the schema is a straightforward column-for-column mapping of the source's
-- 22 columns. No application code references this table yet, so it is safe
-- to drop and recreate rather than ALTER in place.

DROP TABLE IF EXISTS `tax_jurisdiction_rates`;

CREATE TABLE `tax_jurisdiction_rates` (
  `id`                INT           NOT NULL AUTO_INCREMENT,
  `city_name`         VARCHAR(100)  NOT NULL,
  `city_code`         VARCHAR(20)   DEFAULT NULL,
  `city_tax_rate`     DECIMAL(8,6)  NOT NULL,
  `county_name`       VARCHAR(100)  NOT NULL,
  `county_code`       VARCHAR(20)   DEFAULT NULL,
  `county_tax_rate`   DECIMAL(8,6)  NOT NULL,
  `spdt_name`         VARCHAR(255)  DEFAULT NULL,
  `spdt_code`         VARCHAR(20)   DEFAULT NULL,
  `spdt_tax_rate`     DECIMAL(8,6)  NOT NULL,
  `spdt2_name`        VARCHAR(255)  DEFAULT NULL,
  `spdt2_code`        VARCHAR(20)   DEFAULT NULL,
  `spdt2_tax_rate`    DECIMAL(8,6)  DEFAULT NULL,
  `spd3_name`         VARCHAR(255)  DEFAULT NULL,
  `spd3_code`         VARCHAR(20)   DEFAULT NULL,
  `spd3_tax_rate`     DECIMAL(8,6)  DEFAULT NULL,
  `transit_name`      VARCHAR(255)  DEFAULT NULL,
  `transit_code`      VARCHAR(20)   DEFAULT NULL,
  `transit_tax_rate`  DECIMAL(8,6)  NOT NULL,
  `transit2_name`     VARCHAR(255)  DEFAULT NULL,
  `transit2_code`     VARCHAR(20)   DEFAULT NULL,
  `transit2_tax_rate` DECIMAL(8,6)  DEFAULT NULL,
  `total_tax_rate`    DECIMAL(8,6)  DEFAULT NULL,
  -- Statewide components, not part of the source file — carried forward
  -- unchanged from the prior load (rate = NULL means "not yet confirmed").
  `state_tax_rate`    DECIMAL(8,6)  NOT NULL,
  `gros_tax_rate`     DECIMAL(8,6)  DEFAULT NULL,
  `pugra_tax_rate`    DECIMAL(8,6)  DEFAULT NULL,
  `mtacda_tax_rate`   DECIMAL(8,6)  DEFAULT NULL,
  `effective_from`    DATE          NOT NULL,
  `effective_to`      DATE          DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_city_name`   (`city_name`),
  INDEX `idx_county_name` (`county_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Row data loaded separately from city-rates.xlsx (api/reference_data/) —
-- see api/scripts/load_tax_jurisdiction_rates.py.
