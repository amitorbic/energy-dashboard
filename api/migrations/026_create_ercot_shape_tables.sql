-- Migration 026: Create ercot_shape_weatherzone and ercot_shape_loadzone.
--
-- Hourly/daily/monthly shape factors (fraction of period total) derived
-- from ercot_forecast_weatherzone / ercot_forecast_loadzone by
-- calculate_ercot_shape.py, one row per (date, hour, zone).

CREATE TABLE IF NOT EXISTS `ercot_shape_weatherzone` (
  `id`             BIGINT          NOT NULL AUTO_INCREMENT,
  `oper_date`      DATE            NOT NULL,
  `year`           SMALLINT        NOT NULL,
  `month`          TINYINT         NOT NULL,
  `day`            TINYINT         NOT NULL,
  `hour`           TINYINT         NOT NULL,
  `weather_zone`   VARCHAR(15)     NOT NULL,
  `hourly_shape`   DECIMAL(20,15)  DEFAULT NULL,
  `daily_shape`    DECIMAL(20,15)  DEFAULT NULL,
  `monthly_shape`  DECIMAL(20,15)  DEFAULT NULL,
  `loaded_at`      DATETIME        DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_shape` (`oper_date`, `hour`, `weather_zone`),
  INDEX `idx_zone_year` (`weather_zone`, `year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `ercot_shape_loadzone` (
  `id`             BIGINT          NOT NULL AUTO_INCREMENT,
  `oper_date`      DATE            NOT NULL,
  `year`           SMALLINT        NOT NULL,
  `month`          TINYINT         NOT NULL,
  `day`            TINYINT         NOT NULL,
  `hour`           TINYINT         NOT NULL,
  `load_zone`      VARCHAR(10)     NOT NULL,
  `hourly_shape`   DECIMAL(20,15)  DEFAULT NULL,
  `daily_shape`    DECIMAL(20,15)  DEFAULT NULL,
  `monthly_shape`  DECIMAL(20,15)  DEFAULT NULL,
  `loaded_at`      DATETIME        DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_shape` (`oper_date`, `hour`, `load_zone`),
  INDEX `idx_zone_year` (`load_zone`, `year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
