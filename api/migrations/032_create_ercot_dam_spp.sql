-- Migration 032: Create ercot_dam_spp.
--
-- DAM (Day-Ahead Market) Settlement Point Prices, ERCOT product NP4-190-CD
-- (Report Type ID 12331), scraped once daily by scraper_ercot_dam.py after
-- DAM closes (~2:30 PM US/Central). publish_date/publish_time come from the
-- real ERCOT publish timestamp embedded in the downloaded file's name (same
-- principle as ercot_lfc_history), not the scraper's own clock.
--
-- NOTE: settlement_point/settlement_point_price column NAMES here match the
-- DB fields the scraper writes -- verify the raw CSV's actual header names
-- (currently assumed DeliveryDate/HourEnding/SettlementPoint/
-- SettlementPointPrice per ERCOT's documented NP4-190-CD layout) against a
-- real downloaded sample before relying on this in production.

CREATE TABLE IF NOT EXISTS `ercot_dam_spp` (
  `id`                      BIGINT         NOT NULL AUTO_INCREMENT,
  `publish_date`            DATE           NOT NULL,
  `publish_time`            TIME           NOT NULL,
  `delivery_date`           DATE           NOT NULL,
  `hour_ending`             TINYINT        NOT NULL,
  `settlement_point`        VARCHAR(50)    NOT NULL,
  `settlement_point_price`  DECIMAL(10,4)  DEFAULT NULL,
  `created_at`              DATETIME       DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_dam_spp` (`delivery_date`, `hour_ending`, `settlement_point`, `publish_date`, `publish_time`),
  INDEX `idx_delivery_date` (`delivery_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
