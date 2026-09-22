-- 042_create_tenant_modules.sql
--
-- Product-module entitlements for the ORBIC Sales / Operations / Portfolio /
-- Audit & Controls split. Lives in the MASTER DB (ameripower_master), next to
-- `reps` (001_create_reps_table.sql) — this is tenant-level business state
-- ("which products has this REP purchased"), not per-tenant application data.
--
-- Run this against `ameripower_master`, NOT the per-tenant `energyapp`/
-- `u972964962_orbic` database:
--   mysql -u <db_user> -p ameripower_master < api/migrations/042_create_tenant_modules.sql
--
-- Absence of rows for a given rep_id is intentional and means "no
-- restriction configured yet" — api/utils/tenant_modules.py treats a missing
-- table, an unreachable master DB, or zero rows for a rep_id as "all modules
-- enabled" (fail-open), so existing tenants are unaffected until entitlement
-- rows are explicitly inserted for them.

CREATE TABLE IF NOT EXISTS tenant_modules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rep_id INT NOT NULL,
  module_key VARCHAR(50) NOT NULL,   -- 'sales' | 'operations' | 'portfolio' | 'audit'
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_rep_module (rep_id, module_key),
  CONSTRAINT fk_tenant_modules_rep FOREIGN KEY (rep_id) REFERENCES reps(rep_id)
);
