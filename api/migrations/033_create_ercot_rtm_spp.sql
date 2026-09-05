-- Migration 033: Create ercot_rtm_spp.
--
-- RTM (Real-Time Market) Settlement Point Prices at Resource Nodes, Hubs
-- and Load Zones, ERCOT product NP6-905-CD (Report Type ID 12301). This
-- product publishes a NEW file every 15 minutes; scraper_ercot_rtm.py runs
-- once daily (~1:00 AM US/Central) and batch-downloads every file from the
-- PREVIOUS calendar day (~96 files) in one run. publish_date/publish_time
-- are per-file, taken from each file's own real ERCOT publish timestamp.
--
-- interval_ending_time uses ERCOT's own hour-ending convention (e.g. the
-- last 15-minute interval of a day is stored as 24:00:00, not rolled over
-- to 00:00:00 the next day) -- MySQL's TIME type supports values beyond
-- 23:59:59 for exactly this reason, so interval_date always matches
-- ERCOT's own DeliveryDate field with no rollover math needed.
--
-- NOTE: column names here match the DB fields the scraper writes --
-- verify the raw CSV's actual header names (currently assumed
-- DeliveryDate/DeliveryHour/DeliveryInterval/SettlementPointName/
-- SettlementPointPrice per ERCOT's documented NP6-905-CD layout) against a
-- real downloaded sample before relying on this in production.

CREATE TABLE IF NOT EXISTS `ercot_rtm_spp` (
  `id`                      BIGINT         NOT NULL AUTO_INCREMENT,
  `publish_date`            DATE           NOT NULL,
  `publish_time`            TIME           NOT NULL,
  `interval_date`           DATE           NOT NULL,
  `interval_ending_time`    TIME           NOT NULL,
  `settlement_point`        VARCHAR(50)    NOT NULL,
  `settlement_point_price`  DECIMAL(10,4)  DEFAULT NULL,
  `created_at`              DATETIME       DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_rtm_spp` (`interval_date`, `interval_ending_time`, `settlement_point`),
  INDEX `idx_interval_date` (`interval_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
