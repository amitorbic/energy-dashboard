-- Migration 035: Create ercot_dam_settlement_prices.
--
-- Day-Ahead Market Settlement Point Prices, scraped daily (~1:00 AM
-- US/Central) by scraper_ercot_market_prices.py from ERCOT's plain HTML
-- report at https://www.ercot.com/content/cdr/html/{YYYYMMDD}_dam_spp.html
-- (a different source than the ZIP-based NP4-190-CD product used by
-- scraper_ercot_dam.py). The source page's wide table (one row per hour
-- ending, one column per settlement point) is melted to long format before
-- insertion here: one row per (operating_date, hour_ending, settlement_point).
--
-- Fetched for "today's" delivery day, which was published yesterday
-- afternoon (2:30 PM CT settlement) and is fully available by this script's
-- 1 AM run.
--
-- capture_date/capture_time record when this script actually ran (US/Central,
-- via zoneinfo), not when the underlying market data itself was published.

CREATE TABLE IF NOT EXISTS `ercot_dam_settlement_prices` (
  `id`                BIGINT         NOT NULL AUTO_INCREMENT,
  `capture_date`      DATE           NOT NULL,
  `capture_time`      TIME           NOT NULL,
  `operating_date`    DATE           NOT NULL,
  `hour_ending`       TINYINT        NOT NULL,
  `settlement_point`  VARCHAR(20)    NOT NULL,
  `price`             DECIMAL(10,4)  DEFAULT NULL,
  `created_at`        DATETIME       DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_dam_settlement_prices` (`operating_date`, `hour_ending`, `settlement_point`),
  INDEX `idx_operating_date` (`operating_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
