-- Migration 036: Create ercot_dam_capacity_prices.
--
-- Day-Ahead Market Clearing Prices for Capacity (ancillary services),
-- scraped daily (~1:00 AM US/Central) by scraper_ercot_market_prices.py from
-- ERCOT's plain HTML report at
-- https://www.ercot.com/content/cdr/html/{YYYYMMDD}_dam_mcpc.html. The
-- source page's wide table (one row per hour ending, one column per
-- ancillary service type: NON-SPIN, REG-DOWN, REG-UP, RRS, ECRS) is melted
-- to long format before insertion here: one row per (operating_date,
-- hour_ending, ancillary_service_type).
--
-- Fetched for "today's" delivery day, same reasoning/timing as
-- ercot_dam_settlement_prices (see migration 035).
--
-- capture_date/capture_time record when this script actually ran (US/Central,
-- via zoneinfo), not when the underlying market data itself was published.

CREATE TABLE IF NOT EXISTS `ercot_dam_capacity_prices` (
  `id`                       BIGINT         NOT NULL AUTO_INCREMENT,
  `capture_date`             DATE           NOT NULL,
  `capture_time`             TIME           NOT NULL,
  `operating_date`           DATE           NOT NULL,
  `hour_ending`              TINYINT        NOT NULL,
  `ancillary_service_type`   VARCHAR(20)    NOT NULL,
  `price`                    DECIMAL(10,4)  DEFAULT NULL,
  `created_at`               DATETIME       DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_dam_capacity_prices` (`operating_date`, `hour_ending`, `ancillary_service_type`),
  INDEX `idx_operating_date` (`operating_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
