-- Migration 046: Create orbic_master (renamed master DB) and reps table.
--
-- Renames the master DB from `ameripower_master` to `orbic_master` to match
-- the platform's actual current branding (ORBIC). `001_create_reps_table.sql`
-- is left untouched as the historical record of the original name/setup, per
-- the never-edit-an-already-numbered-migration rule -- this file is what
-- fresh installs should run instead of 001 going forward.
--
-- For an EXISTING install migrating off ameripower_master, this file alone
-- is not enough -- schema/data were copied over with a one-off script (see
-- docs/DB_MIGRATIONS.md's entry for this migration), not by running this
-- file, since `IF NOT EXISTS`/`INSERT ... ON DUPLICATE KEY` here would not
-- carry over rows added to `reps` after 2026-09-24. This file exists so a
-- brand-new environment can create `orbic_master` from scratch without ever
-- touching `ameripower_master`.
--
-- Usage (fresh install only):
--   mysql -u root -p < api/migrations/046_create_orbic_master.sql
--
-- After running, set MASTER_DB_NAME=orbic_master in api/.env (and in every
-- tenant's own .env under api/provisioned_envs/ -- see MASTER_DB_NAME env
-- var, provision_tenant.py writes one copy per tenant).

CREATE DATABASE IF NOT EXISTS `orbic_master`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `orbic_master`;

CREATE TABLE IF NOT EXISTS `reps` (
  `rep_id`       INT           NOT NULL AUTO_INCREMENT,
  `company_name` VARCHAR(255)  NOT NULL,
  `db_name`      VARCHAR(255)  NOT NULL,
  `subdomain`    VARCHAR(100)  NOT NULL,
  `status`       ENUM('active','suspended','pending') NOT NULL DEFAULT 'active',
  `created_at`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`rep_id`),
  UNIQUE KEY `uq_db_name`   (`db_name`),
  UNIQUE KEY `uq_subdomain` (`subdomain`),
  INDEX `idx_subdomain`     (`subdomain`),
  INDEX `idx_status`        (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed ORBIC / AmeriPower as tenant #1 (existing DB, untouched)
INSERT INTO `reps` (`rep_id`, `company_name`, `db_name`, `subdomain`, `status`)
VALUES (1, 'AmeriPower (ORBIC)', 'u972964962_orbic', 'orbic', 'active')
ON DUPLICATE KEY UPDATE
  `company_name` = VALUES(`company_name`),
  `db_name`      = VALUES(`db_name`),
  `subdomain`    = VALUES(`subdomain`);
