-- Migration 023: Create weather_to_load_zone.
--
-- DB-backed source of the weather zone -> load zone mapping. Read via
-- utils/zone_mapping.py:get_zone_mapping_from_db()/get_zone_mapping_aiomysql(),
-- which fall back to the static _STATIC_MAPPING in that module if this table
-- is unavailable or empty.

CREATE TABLE IF NOT EXISTS `weather_to_load_zone` (
  `weather_zone` VARCHAR(15)   NOT NULL,
  `load_zone`    VARCHAR(10)   NOT NULL,
  `description`  VARCHAR(100)  DEFAULT NULL,
  PRIMARY KEY (`weather_zone`),
  INDEX `idx_load_zone` (`load_zone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO `weather_to_load_zone`
  (`weather_zone`, `load_zone`, `description`)
VALUES
  ('COAST',         'HOUSTON', 'Houston/Coast area'),
  ('EAST',          'NORTH',   'East Texas'),
  ('FAR_WEST',      'WEST',    'Far West Texas'),
  ('NORTH',         'NORTH',   'North Texas'),
  ('NORTH_CENTRAL', 'NORTH',   'North Central Texas'),
  ('SOUTH_CENTRAL', 'SOUTH',   'South Central Texas'),
  ('SOUTHERN',      'SOUTH',   'Southern Texas'),
  ('WEST',          'WEST',    'West Texas');
