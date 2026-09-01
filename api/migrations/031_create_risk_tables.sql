-- Migration 031: Create risk_scores table for the Portfolio Risk Assessment
-- dashboard (controllers/risk.py).
--
-- One row per calendar day, re-runnable via ON DUPLICATE KEY UPDATE so
-- recalculating "today" overwrites the prior result cleanly (mirrors the
-- mtm_results pattern from migration 022).
--
-- NOTE: requested as `030_create_risk_tables.sql`, but 030 was already taken
-- by `030_add_smart_save_columns.sql` -- renumbered to 031.

CREATE TABLE IF NOT EXISTS `risk_scores` (
  `id`               BIGINT         NOT NULL AUTO_INCREMENT,
  `score_date`       DATE           NOT NULL,
  `overall_score`    DECIMAL(5,2)   DEFAULT NULL,
  `overall_status`   VARCHAR(10)    DEFAULT NULL,  -- GREEN/YELLOW/RED
  `position_score`   DECIMAL(5,2)   DEFAULT NULL,
  `position_status`  VARCHAR(10)    DEFAULT NULL,
  `price_score`      DECIMAL(5,2)   DEFAULT NULL,
  `price_status`     VARCHAR(10)    DEFAULT NULL,
  `customer_score`   DECIMAL(5,2)   DEFAULT NULL,
  `customer_status`  VARCHAR(10)    DEFAULT NULL,
  `weather_score`    DECIMAL(5,2)   DEFAULT NULL,
  `weather_status`   VARCHAR(10)    DEFAULT NULL,
  `details`          JSON           DEFAULT NULL,
  `calculated_at`    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_date` (`score_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
