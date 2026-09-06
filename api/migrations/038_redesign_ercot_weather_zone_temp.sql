-- Migration 038: Redesign ercot_weather_zone_temp for the corrected Source 1.
--
-- Supersedes the ercot_weather_zone_temp table created in migration 037,
-- which was built against ERCOT's NP6-970-CD product -- confirmed to be the
-- WRONG data source (a real-time LMP price feed, not a temperature
-- forecast; the downloaded sample file had filename prefix
-- "RTDLMPRNLZHUBNP6970" and 26,952 price rows, which is why 0 temperature
-- rows ever parsed). The correct source is ERCOT's own meteorologist-
-- curated "7-Day Temperature Forecast by City" PDF
-- (temperature-template-MM.DD.YY.pdf), scraped by the updated Source 1 in
-- scraper_ercot_weather.py.
--
-- weather_forecast (Open-Meteo, also created in migration 037) is correct,
-- already validated, and is NOT touched by this migration.
--
-- ercot_weather_zone_temp was only ever created on a local dev database
-- (never deployed to production), so it's safe to drop and recreate here
-- rather than ALTER it in place.
--
-- publish_date comes from the PDF's own filename (MM.DD.YY), NOT
-- datetime.now() -- same lesson enforced on every other scraper in this
-- project, called out here so the UNIQUE KEY below behaves correctly.
--
-- normal_low_f / normal_high_f are the PDF's "15yr Norm" reference values --
-- a single reference point per city per publish (not a per-date series),
-- stored redundantly on every forecast_date row for that publish/city for
-- simple querying.
--
-- Not executed against any database -- for review and manual run only,
-- same pattern as every other migration in this project.

DROP TABLE IF EXISTS `ercot_weather_zone_temp`;

CREATE TABLE `ercot_weather_zone_temp` (
  `id`               BIGINT        NOT NULL AUTO_INCREMENT,
  `publish_date`     DATE          NOT NULL,
  `weather_zone`     VARCHAR(10)   NOT NULL,
  `city`             VARCHAR(50)   NOT NULL,
  `forecast_date`    DATE          NOT NULL,
  `low_f`            DECIMAL(5,1)  DEFAULT NULL,
  `high_f`           DECIMAL(5,1)  DEFAULT NULL,
  `normal_low_f`     DECIMAL(5,1)  DEFAULT NULL,
  `normal_high_f`    DECIMAL(5,1)  DEFAULT NULL,
  `created_at`       DATETIME      DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_weather_zone_temp` (
    `weather_zone`, `city`, `forecast_date`, `publish_date`
  ),
  INDEX `idx_ewzt_forecast_date` (`forecast_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
