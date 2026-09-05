-- Migration 034: Create ercot_rtm_settlement_prices.
--
-- Real-Time Market Settlement Point Prices, scraped daily (~1:00 AM
-- US/Central) by scraper_ercot_market_prices.py from ERCOT's plain HTML
-- report at https://www.ercot.com/content/cdr/html/{YYYYMMDD}_real_time_spp.html
-- (a different source than the ZIP-based NP6-905-CD product used by
-- scraper_ercot_rtm.py). The source page's wide table (one row per
-- 15-minute interval, one column per settlement point) is melted to long
-- format before insertion here: one row per (operating_date,
-- interval_ending, settlement_point).
--
-- interval_ending uses ERCOT's own hour-ending convention (the day's last
-- interval is "24:00:00", not rolled over to "00:00:00" the next day) --
-- MySQL's TIME type supports values past 23:59:59 for exactly this reason.
--
-- capture_date/capture_time record when this script actually ran (US/Central,
-- via zoneinfo), not when the underlying market data itself was published.

CREATE TABLE IF NOT EXISTS `ercot_rtm_settlement_prices` (
  `id`                BIGINT         NOT NULL AUTO_INCREMENT,
  `capture_date`      DATE           NOT NULL,
  `capture_time`      TIME           NOT NULL,
  `operating_date`    DATE           NOT NULL,
  `interval_ending`   TIME           NOT NULL,
  `settlement_point`  VARCHAR(20)    NOT NULL,
  `price`             DECIMAL(10,4)  DEFAULT NULL,
  `created_at`        DATETIME       DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_rtm_settlement_prices` (`operating_date`, `interval_ending`, `settlement_point`),
  INDEX `idx_operating_date` (`operating_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
