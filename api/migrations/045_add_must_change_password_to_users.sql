-- Migration 045: forced password-change-on-first-login flag.
--
-- Adds must_change_password to users. provision_tenant.py's bootstrap admin
-- insert (step_create_admin_user) sets it to 1 so a brand-new tenant's admin
-- is forced to change their temp password before using the app; every
-- existing user defaults to 0 and is unaffected. Enforced backend-side in
-- middleware/auth.py's require_auth (401/403 gate), not just the frontend.
--
-- Not executed against any database -- for review and manual run only, same
-- pattern as every other migration in this project. Check the live schema
-- first (`DESCRIBE users;`) since `users` predates the migration system.

ALTER TABLE `users`
  ADD COLUMN `must_change_password` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Forces mandatory password update on next login when 1';
