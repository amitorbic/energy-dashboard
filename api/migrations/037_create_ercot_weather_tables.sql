-- Migration 037: Create ercot_weather_zone_temp and weather_forecast.
--
-- Two new tables for the WEEKLY weather scraper (scraper_ercot_weather.py),
-- a standalone script -- does not touch or depend on ercot_lfc_history,
-- weather_history, or any other existing table.
--
-- 1. ercot_weather_zone_temp -- ERCOT's own NP6-970-CD product (hourly
--    temperature forecast per ERCOT weather zone, ~3 days back through
--    ~9 days forward). publish_date/publish_time come from the real ERCOT
--    file timestamp (parsed from the downloaded ZIP's CSV filename), NOT
--    datetime.now() -- same lesson as the production import-order/
--    timestamp bug already fixed elsewhere in this project, called out
--    explicitly here so the UNIQUE KEY below behaves correctly.
--
-- 2. weather_forecast -- Open-Meteo's forecast endpoint (wind/humidity/
--    cloud cover, which ERCOT's own product doesn't include, plus an
--    independent temperature cross-check). capture_date/capture_time
--    record when the script actually ran (US/Central), since this source
--    has no "publish timestamp" of its own the way ERCOT's file does.
--    Uses the same short zone codes as the existing weather_history table
--    (COAST, NCENT, NORTH, SOUTH, SCENT, EAST, FWEST, WEST) -- NOT the
--    longer ERCOT zone names used in ercot_weather_zone_temp above.
--
-- Not executed against any database -- for review and manual run only,
-- same pattern as migration 030.

CREATE TABLE IF NOT EXISTS `ercot_weather_zone_temp` (
  `id`              BIGINT        NOT NULL AUTO_INCREMENT,
  `publish_date`    DATE          NOT NULL,
  `publish_time`    TIME          NOT NULL,
  `weather_zone`    VARCHAR(20)   NOT NULL,
  `forecast_date`   DATE          NOT NULL,
  `forecast_hour`   TINYINT       NOT NULL,
  `temperature_f`   DECIMAL(5,1)  DEFAULT NULL,
  `created_at`      DATETIME      DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_weather_zone_temp` (
    `weather_zone`, `forecast_date`, `forecast_hour`,
    `publish_date`, `publish_time`
  ),
  INDEX `idx_ewzt_forecast_date` (`forecast_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `weather_forecast` (
  `id`               BIGINT        NOT NULL AUTO_INCREMENT,
  `capture_date`     DATE          NOT NULL,
  `capture_time`     TIME          NOT NULL,
  `zone`             VARCHAR(10)   NOT NULL,
  `forecast_date`    DATE          NOT NULL,
  `forecast_hour`    TINYINT       NOT NULL,
  `temperature_f`    DECIMAL(5,1)  DEFAULT NULL,
  `humidity_pct`     DECIMAL(5,1)  DEFAULT NULL,
  `wind_speed_mph`   DECIMAL(5,1)  DEFAULT NULL,
  `cloud_cover_pct`  DECIMAL(5,1)  DEFAULT NULL,
  `created_at`       DATETIME      DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_weather_forecast` (
    `zone`, `forecast_date`, `forecast_hour`, `capture_date`
  ),
  INDEX `idx_wf_forecast_date` (`forecast_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
