-- Migration 002: Remove brand prefix from mills column names
-- Syntax: CHANGE COLUMN (works on MariaDB 10.4+ and MySQL 5.7+)
-- RENAME COLUMN requires MariaDB 10.5.2+ / MySQL 8.0 — do NOT use here.
--
-- Run against every tenant DB. Production may have tables not present in dev
-- (custom_pricing, enrollment.ameripower_mill) — those statements are included
-- but commented out below with a note; uncomment when running on production.
--
-- Usage (dev):
--   C:\xampp\mysql\bin\mysql.exe -u root u972964962_orbic < api/migrations/002_rename_mills_columns.sql
-- Usage (production):
--   mysql -u <user> -p u972964962_orbic < api/migrations/002_rename_mills_columns.sql

-- broker_new: five numbered columns (one per daily pricing email recipient)
ALTER TABLE broker_new CHANGE ameripower_mills1 mills1 VARCHAR(255) DEFAULT NULL;
ALTER TABLE broker_new CHANGE ameripower_mills2 mills2 VARCHAR(255) DEFAULT NULL;
ALTER TABLE broker_new CHANGE ameripower_mills3 mills3 VARCHAR(255) DEFAULT NULL;
ALTER TABLE broker_new CHANGE ameripower_mills4 mills4 VARCHAR(255) DEFAULT NULL;
ALTER TABLE broker_new CHANGE ameripower_mills5 mills5 VARCHAR(255) DEFAULT NULL;

-- custom_pricing: single mills column
-- NOTE: table does not exist in local dev DB — run on production only
-- ALTER TABLE custom_pricing CHANGE ameripower_mills mills VARCHAR(255) DEFAULT NULL;

-- bne_log: single mills column
ALTER TABLE bne_log CHANGE ameripower_mills mills VARCHAR(100) NOT NULL;

-- msp_log: single mills column
ALTER TABLE msp_log CHANGE ameripower_mills mills VARCHAR(50) DEFAULT NULL;

-- customers_new: single mills column
ALTER TABLE customers_new CHANGE ameripower_mills mills DECIMAL(10,4) DEFAULT NULL;

-- enrollment: single mill column (no trailing 's')
-- NOTE: ameripower_mill column not present in local dev DB — run on production only
-- ALTER TABLE enrollment CHANGE ameripower_mill mill VARCHAR(255) NOT NULL;

-- confirmation_log: single mill column (no trailing 's')
ALTER TABLE confirmation_log CHANGE ameripower_mill mill VARCHAR(255) NOT NULL;
