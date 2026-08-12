-- Migration 025: Create ercot_forecast_weatherzone and ercot_forecast_loadzone.
--
-- Hourly ERCOT load forecast, ingested from the ERCOT forecast file by
-- ingest_ercot_forecast.py. ercot_forecast_weatherzone holds the 8
-- weather-zone columns (ERCOT-forecast-file abbreviations with a _net
-- suffix, e.g. fwest_net/ncent_net); ercot_forecast_loadzone holds the
-- 4 settlement load-zone columns. Read by calculate_ercot_shape.py and
-- build_layer2_growth.py.

CREATE TABLE IF NOT EXISTS `ercot_forecast_weatherzone` (
  `id`         BIGINT         NOT NULL AUTO_INCREMENT,
  `oper_date`  DATE           NOT NULL,
  `year`       SMALLINT       NOT NULL,
  `month`      TINYINT        NOT NULL,
  `day`        TINYINT        NOT NULL,
  `hour`       TINYINT        NOT NULL,
  `coast_net`  DECIMAL(12,4)  DEFAULT NULL,
  `east_net`   DECIMAL(12,4)  DEFAULT NULL,
  `fwest_net`  DECIMAL(12,4)  DEFAULT NULL,
  `ncent_net`  DECIMAL(12,4)  DEFAULT NULL,
  `north_net`  DECIMAL(12,4)  DEFAULT NULL,
  `scent_net`  DECIMAL(12,4)  DEFAULT NULL,
  `south_net`  DECIMAL(12,4)  DEFAULT NULL,
  `west_net`   DECIMAL(12,4)  DEFAULT NULL,
  `ercot_net`  DECIMAL(12,4)  DEFAULT NULL,
  `loaded_at`  DATETIME       DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_wz` (`oper_date`, `hour`),
  INDEX `idx_year_month` (`year`, `month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `ercot_forecast_loadzone` (
  `id`         BIGINT         NOT NULL AUTO_INCREMENT,
  `oper_date`  DATE           NOT NULL,
  `year`       SMALLINT       NOT NULL,
  `month`      TINYINT        NOT NULL,
  `day`        TINYINT        NOT NULL,
  `hour`       TINYINT        NOT NULL,
  `houston`    DECIMAL(12,4)  DEFAULT NULL,
  `north`      DECIMAL(12,4)  DEFAULT NULL,
  `south`      DECIMAL(12,4)  DEFAULT NULL,
  `west`       DECIMAL(12,4)  DEFAULT NULL,
  `ercot_net`  DECIMAL(12,4)  DEFAULT NULL,
  `loaded_at`  DATETIME       DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_lz` (`oper_date`, `hour`),
  INDEX `idx_year_month` (`year`, `month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
