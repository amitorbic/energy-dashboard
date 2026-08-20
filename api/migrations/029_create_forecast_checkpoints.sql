-- Migration 029: Create forecast_checkpoints.
--
-- Nightly monitoring results for the forecast engine's 4 sanity checkpoints,
-- written by monitoring/checkpoint_runner.py and read by
-- controllers/monitoring.py (GET /monitoring/checkpoints, /checkpoints/history).

CREATE TABLE IF NOT EXISTS `forecast_checkpoints` (
  `id`               BIGINT         NOT NULL AUTO_INCREMENT,
  `checkpoint_id`    TINYINT        NOT NULL,
  `checkpoint_name`  VARCHAR(50)    NOT NULL,
  `run_date`         DATE           NOT NULL,
  `status`           VARCHAR(10)    NOT NULL,
  `score`            DECIMAL(8,4)   DEFAULT NULL,
  `threshold_green`  DECIMAL(8,4)   DEFAULT NULL,
  `threshold_red`    DECIMAL(8,4)   DEFAULT NULL,
  `message`          TEXT,
  `details`          JSON,
  `created_at`       DATETIME       DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_checkpoint` (`checkpoint_id`, `run_date`),
  INDEX `idx_run_date` (`run_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
