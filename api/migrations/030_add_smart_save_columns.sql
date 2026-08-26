-- Migration 030: Smart-save columns for ercot_lfc_history.
--
-- Adds capture_date_ct / capture_hour_ct (the US/Central date+hour this
-- snapshot was captured) and save_reason / deviation_pct, used by the
-- scraper's smart-save logic in scraper_ercot_lfc.py: 7am CT and 8am CT
-- captures are always saved; every other hour is only saved if the new
-- forecast deviates >= DEVIATION_THRESHOLD_PCT (10.0) from the last SAVED
-- snapshot, instead of writing all 192 rows every hour regardless.
--
-- Existing ~253k historical rows are preserved as-is -- nothing is deleted
-- or overwritten. capture_date_ct / capture_hour_ct are backfilled from the
-- existing publish_date/publish_time (UTC) columns, converted to
-- US/Central, and save_reason defaults to 'legacy_hourly' for old rows so
-- the new NOT NULL constraints don't break existing data.
--
-- IMPORTANT -- deployment ordering: run this migration against production
-- BEFORE deploying the updated scraper_ercot_lfc.py. The new code writes to
-- these columns (and the old code does not), so:
--   * old code + new schema  -> fine, old code just never sets the new
--     columns' values via INSERT ... it will error because it doesn't list
--     them, so deploy in this order: migration first, code second.
--   * new code + old schema  -> every insert fails (unknown column) until
--     this migration has run.
--
-- Before running, it's worth a read-only check for legacy rows that would
-- collide under the new UNIQUE KEY added at the bottom of this file (safe
-- to run any time):
--
--   SELECT delivery_date, hour_ending, publish_date, HOUR(publish_time) AS pub_hour_utc, COUNT(*)
--   FROM ercot_lfc_history
--   GROUP BY delivery_date, hour_ending, publish_date, HOUR(publish_time)
--   HAVING COUNT(*) > 1;
--
-- If that returns rows, the final ADD UNIQUE KEY step will fail with a
-- duplicate-entry error and roll back with the table left unchanged (no
-- data loss) -- decide how to handle those legacy duplicates before
-- retrying. This migration intentionally does not delete anything
-- automatically.

-- 1. Add the new columns as nullable first so the ALTER succeeds
--    immediately against the existing ~253k rows.
ALTER TABLE ercot_lfc_history
  ADD COLUMN capture_date_ct DATE NULL AFTER dst_flag,
  ADD COLUMN capture_hour_ct TINYINT NULL AFTER capture_date_ct,
  ADD COLUMN save_reason VARCHAR(30) NULL AFTER capture_hour_ct,
  ADD COLUMN deviation_pct DECIMAL(6,2) NULL AFTER save_reason;

-- 2. Backfill capture_date_ct / capture_hour_ct for existing rows from
--    their UTC publish_date + publish_time, converted to US/Central via
--    MySQL's named time zones (handles CDT/CST automatically). Requires
--    the mysql.time_zone tables to be loaded -- if CONVERT_TZ returns
--    NULL for every row, run `mysql_tzinfo_to_sql /usr/share/zoneinfo |
--    mysql -u root mysql` on the server first, then re-run this step.
UPDATE ercot_lfc_history
SET
  capture_date_ct = DATE(CONVERT_TZ(TIMESTAMP(publish_date, publish_time), 'UTC', 'America/Chicago')),
  capture_hour_ct = HOUR(CONVERT_TZ(TIMESTAMP(publish_date, publish_time), 'UTC', 'America/Chicago'))
WHERE capture_date_ct IS NULL;

-- 3. Fallback for any rows CONVERT_TZ couldn't resolve (e.g. named time
--    zone tables unavailable) -- backfill from the raw UTC values instead
--    of leaving them NULL, so the NOT NULL step below is safe. Central
--    time is UTC-5 (CDT) or UTC-6 (CST); this fallback is only a rough
--    same-day approximation for old rows and does not need to be exact.
UPDATE ercot_lfc_history
SET
  capture_date_ct = publish_date,
  capture_hour_ct = HOUR(publish_time)
WHERE capture_date_ct IS NULL;

UPDATE ercot_lfc_history
SET save_reason = 'legacy_hourly'
WHERE save_reason IS NULL;

-- 4. Every row now has a value -- enforce NOT NULL as specified.
ALTER TABLE ercot_lfc_history
  MODIFY COLUMN capture_date_ct DATE NOT NULL,
  MODIFY COLUMN capture_hour_ct TINYINT NOT NULL,
  MODIFY COLUMN save_reason VARCHAR(30) NOT NULL;

-- 5. Prevent true duplicate inserts (e.g. an accidental double-run) while
--    letting every distinct saved snapshot (7am, 8am, deviation-triggered)
--    coexist. The scraper uses INSERT IGNORE, so a collision here is
--    silently skipped rather than erroring the run.
ALTER TABLE ercot_lfc_history
  ADD UNIQUE KEY uq_lfc_snapshot (delivery_date, hour_ending, capture_date_ct, capture_hour_ct);
