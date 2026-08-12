-- Migration 024: Create portfolio_load_with_losses and portfolio_load_unadjusted.
--
-- portfolio_load_with_losses is populated from POSTEDAML_* rows in
-- daioutputheader/interval (with TDSP losses applied).
-- portfolio_load_unadjusted is populated from LSEGUFE_* rows in
-- llsoutputheader/interval (pre-losses). Both are written by
-- process_settlement.py and read by controllers/portfolio.py's
-- get_load_with_losses/get_load_unadjusted/get_load_combined.

CREATE TABLE IF NOT EXISTS `portfolio_load_with_losses` (
  `id`              BIGINT         NOT NULL AUTO_INCREMENT,
  `oper_date`       DATE           NOT NULL,
  `interval_ending` SMALLINT       NOT NULL,
  `settlement_zone` VARCHAR(20)    NOT NULL,
  `mwh`             DECIMAL(20,6)  NOT NULL,
  `settlement_run`  VARCHAR(20)    NOT NULL,
  `loaded_at`       DATETIME       DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_load` (`oper_date`, `interval_ending`, `settlement_zone`, `settlement_run`),
  INDEX `idx_date_zone` (`oper_date`, `settlement_zone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `portfolio_load_unadjusted` (
  `id`              BIGINT         NOT NULL AUTO_INCREMENT,
  `oper_date`       DATE           NOT NULL,
  `interval_ending` SMALLINT       NOT NULL,
  `settlement_zone` VARCHAR(20)    NOT NULL,
  `mwh`             DECIMAL(20,6)  NOT NULL,
  `settlement_run`  VARCHAR(20)    NOT NULL,
  `loaded_at`       DATETIME       DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_load` (`oper_date`, `interval_ending`, `settlement_zone`, `settlement_run`),
  INDEX `idx_date_zone` (`oper_date`, `settlement_zone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
