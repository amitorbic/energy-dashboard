-- Migration 028: Create customer_forecast_dates, future_forecast_dates,
-- and portfolio_load_annual.
--
-- customer_forecast_dates holds current active contracts' annual usage by
-- load/weather zone, populated by populate_customer_forecast_dates.py.
-- future_forecast_dates holds signed-but-not-yet-active future contracts
-- ("contract_confirm" source), used alongside customer_forecast_dates for
-- multi-year forecasting.
-- portfolio_load_annual aggregates both into annual MWh by (year, load_zone),
-- populated by populate_portfolio_load_annual.py and read by
-- controllers/portfolio.py's get_dna_forecast_data across all forecast years.

CREATE TABLE IF NOT EXISTS `customer_forecast_dates` (
  `id`                  BIGINT         NOT NULL AUTO_INCREMENT,
  `esid`                VARCHAR(100)   NOT NULL,
  `contract_end_date`   DATE           DEFAULT NULL,
  `forecast_end_date`   DATE           NOT NULL,
  `load_profile`        VARCHAR(255)   DEFAULT NULL,
  `annual_kwh`          DECIMAL(18,2)  DEFAULT NULL,
  `load_zone`           VARCHAR(20)    DEFAULT NULL,
  `weather_zone`        VARCHAR(10)    DEFAULT NULL,
  `updated_at`          DATETIME       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_esid` (`esid`),
  INDEX `idx_forecast_end` (`forecast_end_date`),
  INDEX `idx_load_zone` (`load_zone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `future_forecast_dates` (
  `id`                    BIGINT         NOT NULL AUTO_INCREMENT,
  `esid`                  VARCHAR(100)   NOT NULL,
  `forecast_start_date`   DATE           NOT NULL,
  `forecast_end_date`     DATE           NOT NULL,
  `load_profile`          VARCHAR(255)   DEFAULT NULL,
  `annual_kwh`            DECIMAL(18,2)  DEFAULT NULL,
  `load_zone`             VARCHAR(20)    DEFAULT NULL,
  `weather_zone`          VARCHAR(10)    DEFAULT NULL,
  `source`                VARCHAR(50)    DEFAULT 'contract_confirm',
  `updated_at`            DATETIME       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_esid` (`esid`),
  INDEX `idx_start` (`forecast_start_date`),
  INDEX `idx_end` (`forecast_end_date`),
  INDEX `idx_load_zone` (`load_zone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `portfolio_load_annual` (
  `id`          BIGINT         NOT NULL AUTO_INCREMENT,
  `year`        SMALLINT       NOT NULL,
  `load_zone`   VARCHAR(10)    NOT NULL,
  `annual_mwh`  DECIMAL(18,4)  NOT NULL,
  `source`      VARCHAR(50)    DEFAULT 'manual',
  `loaded_at`   DATETIME       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_year_zone` (`year`, `load_zone`),
  INDEX `idx_year` (`year`),
  INDEX `idx_zone` (`load_zone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
