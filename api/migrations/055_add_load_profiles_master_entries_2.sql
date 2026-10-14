-- Migration 055: add 4 more load_profiles_master entries
--
-- Target: SOURCE DB only (u972964962_orbic / energyapp on live). Tenant DBs get
-- these rows through the shared reference sync (scripts/sync_reference_data.py,
-- table load_profiles_master) -- do NOT run this file against tenant DBs.
-- Idempotent: keyed on the unique full_load_profile. Same pattern as 054.
--
-- Zone rule: FWEST and WEST -> WEST. Pricing notes (owner decision):
--   * BUSIDRRQ has no pricing key by design (BUSIDRRQ_WEST matches none).
--   * RESLOPV is priced under RESLOWR; BUSOGFLT is priced as BUSLOLF.

INSERT INTO load_profiles_master (full_load_profile, short_name) VALUES
  ('BUSIDRRQ_WEST_IDR_NWS_NOTOU',  'BUSIDRRQ_WEST'),
  ('BUSIDRRQ_FWEST_IDR_NWS_NOTOU', 'BUSIDRRQ_WEST'),
  ('RESLOPV_FWEST_IDR_WS_NOTOU',   'RESLOWR_WEST'),
  ('BUSOGFLT_FWEST_IDR_WS_NOTOU',  'BUSLOLF_WEST')
ON DUPLICATE KEY UPDATE short_name = VALUES(short_name);
