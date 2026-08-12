-- Migration 022: Create market_prices and mtm_results tables for the
-- Mark-to-Market (MTM) engine.
--
-- market_prices holds manually-uploaded (or later, feed-sourced) settlement
-- prices per date/hour/location -- hour_ending = 0 means a flat all-day
-- price. Locations are hub (HB_*), load zone (LZ_*), or gas index (HH).
--
-- mtm_results is the calculated output of controllers/mtm.py:calculate_mtm,
-- one row per (calc_date, deal_number), re-runnable via ON DUPLICATE KEY
-- UPDATE so recalculating a date overwrites the prior result cleanly.

CREATE TABLE IF NOT EXISTS `market_prices` (
  `id`          BIGINT        NOT NULL AUTO_INCREMENT,
  `price_date`  DATE          NOT NULL,
  `hour_ending` TINYINT       NOT NULL,
  `location`    VARCHAR(30)   NOT NULL,
  `price`       DECIMAL(10,4) NOT NULL,
  `source`      VARCHAR(50)   NOT NULL DEFAULT 'MANUAL',
  `loaded_at`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_price` (`price_date`, `hour_ending`, `location`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `mtm_results` (
  `id`                 BIGINT         NOT NULL AUTO_INCREMENT,
  `calc_date`          DATE           NOT NULL,
  `deal_number`        VARCHAR(50)    NOT NULL,
  `instrument_type`    VARCHAR(20)    DEFAULT NULL,
  `location`           VARCHAR(30)    DEFAULT NULL,
  `zone`               VARCHAR(20)    DEFAULT NULL,
  `volume_mw`          DECIMAL(10,4)  DEFAULT NULL,
  `deal_price`         DECIMAL(10,4)  DEFAULT NULL,
  `market_price`       DECIMAL(10,4)  DEFAULT NULL,
  `basis`               DECIMAL(10,4) DEFAULT 0,
  `gas_price_current`  DECIMAL(10,4)  DEFAULT NULL,
  `mtm_value`          DECIMAL(18,4)  DEFAULT NULL,
  `delivery_start`     DATE           DEFAULT NULL,
  `delivery_end`       DATE           DEFAULT NULL,
  `calculated_at`      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP
                                       ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_mtm` (`calc_date`, `deal_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
