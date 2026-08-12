-- Migration 027: Create forecast_baseline_dna and forecast_growth_factors.
--
-- forecast_baseline_dna is Layer 1 of the forecast engine's "layer cake" --
-- average historical load by (weather_zone, month, day_of_week, hour_ending),
-- built by build_layer1_dna.py from ercot_load_history.
--
-- forecast_growth_factors is Layer 2 -- year-over-year growth factors by
-- load_zone/forecast_year relative to base_year, built by
-- build_layer2_growth.py from ercot_forecast_loadzone.

CREATE TABLE IF NOT EXISTS `forecast_baseline_dna` (
  `id`                BIGINT         NOT NULL AUTO_INCREMENT,
  `weather_zone`      VARCHAR(15)    NOT NULL,
  `month`             TINYINT        NOT NULL,
  `day_of_week`       TINYINT        NOT NULL,
  `hour_ending`       TINYINT        NOT NULL,
  `avg_load`          DECIMAL(12,4)  NOT NULL,
  `std_dev`           DECIMAL(12,4)  DEFAULT NULL,
  `sample_count`      SMALLINT       DEFAULT NULL,
  `outliers_removed`  SMALLINT       DEFAULT NULL,
  `built_at`          DATETIME       DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_dna` (`weather_zone`, `month`, `day_of_week`, `hour_ending`),
  INDEX `idx_zone_month` (`weather_zone`, `month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `forecast_growth_factors` (
  `id`             BIGINT         NOT NULL AUTO_INCREMENT,
  `load_zone`      VARCHAR(10)    NOT NULL,
  `forecast_year`  SMALLINT       NOT NULL,
  `base_year`      SMALLINT       NOT NULL,
  `base_total`     DECIMAL(18,4)  NOT NULL,
  `year_total`     DECIMAL(18,4)  NOT NULL,
  `growth_factor`  DECIMAL(12,6)  NOT NULL,
  `built_at`       DATETIME       DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_growth` (`load_zone`, `forecast_year`),
  INDEX `idx_zone_year` (`load_zone`, `forecast_year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
