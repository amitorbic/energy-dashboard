-- Migration 001: Create master DB and reps table
-- Run this ONCE against your MySQL server before starting the API.
--
-- Usage:
--   mysql -u root -p < api/migrations/001_create_reps_table.sql
--
-- After running, add MASTER_DB_NAME=ameripower_master to api/.env

CREATE DATABASE IF NOT EXISTS `ameripower_master`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `ameripower_master`;

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
