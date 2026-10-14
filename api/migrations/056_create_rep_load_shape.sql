-- 056: REP hourly load shape (REP avg load / ERCOT zone avg load)
-- Built by api/build_rep_load_shape.py from a REP's 15-min historical load CSV.
-- Used by get_forecast_data() Layer 4 (LFC override) in place of a flat customer_share.

CREATE TABLE IF NOT EXISTS rep_load_shape (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  rep_id        VARCHAR(50)   NOT NULL DEFAULT 'default',
  zone          VARCHAR(10)   NOT NULL,
  month         TINYINT       NOT NULL,
  day_of_week   TINYINT       NOT NULL,            -- 0=Monday, 6=Sunday
  hour_ending   TINYINT       NOT NULL,            -- 1-24
  avg_share     DECIMAL(14,10) NOT NULL,           -- REP avg / ERCOT avg
  sample_count  SMALLINT      DEFAULT NULL,
  built_from    DATE          DEFAULT NULL,
  built_to      DATE          DEFAULT NULL,
  built_at      DATETIME      DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_shape (rep_id, zone, month, day_of_week, hour_ending),
  INDEX idx_rep_zone (rep_id, zone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
