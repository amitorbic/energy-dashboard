-- Migration 054: add 21 missing load_profiles_master entries
--
-- Target: SOURCE DB only (u972964962_orbic / energyapp on live). Tenant DBs get
-- these rows through the shared reference sync (scripts/sync_reference_data.py,
-- table load_profiles_master) -- do NOT run this file against tenant DBs.
--
-- Idempotent: keyed on the unique full_load_profile. Re-running changes nothing
-- (short_name is rewritten to the same value; created_at is not touched).
--
-- short_name is the pricing profile_key. Zone rule: COAST stays COAST;
-- EAST, NCENT, NORTH -> NORTH; SCENT, SOUTH -> SOUTH; FWEST, WEST -> WEST.
--
-- DISCREPANCY NOTES (decided by the product owner):
--   * RESHIPV, RESHIWD and RESLOPV profiles are priced under the RESLOWR class
--     (same as the existing RESHIWR_FWEST profile) although their real classes
--     differ.
--   * BUSHIPV, BUSLOPV, BUSOGFLT and NMFLAT profiles are priced as BUSLOLF.
--   * BUSIDRRQ intentionally has NO pricing key: its short_name
--     (BUSIDRRQ_<zone>) matches no pricing profile_key, so pricing a BUSIDRRQ
--     contract is expected to fail until pricing data is added.

INSERT INTO load_profiles_master (full_load_profile, short_name) VALUES
  ('BUSHILF_FWEST_IDR_WS_NOTOU',  'BUSHILF_WEST'),
  ('BUSHILF_SCENT_IDR_WS_NOTOU',  'BUSHILF_SOUTH'),
  ('BUSHIPV_COAST_IDR_WS_NOTOU',  'BUSLOLF_COAST'),
  ('BUSIDRRQ_COAST_IDR_NWS_NOTOU','BUSIDRRQ_COAST'),
  ('BUSIDRRQ_COAST_IDR_WS_NOTOU', 'BUSIDRRQ_COAST'),
  ('BUSIDRRQ_NCENT_IDR_NWS_NOTOU','BUSIDRRQ_NORTH'),
  ('BUSIDRRQ_NCENT_IDR_WS_NOTOU', 'BUSIDRRQ_NORTH'),
  ('BUSIDRRQ_NORTH_IDR_NWS_NOTOU','BUSIDRRQ_NORTH'),
  ('BUSLOPV_NCENT_IDR_WS_NOTOU',  'BUSLOLF_NORTH'),
  ('BUSNODEM_EAST_NIDR_NWS_NOTOU','BUSNODEM_NORTH'),
  ('BUSOGFLT_NCENT_IDR_WS_NOTOU', 'BUSLOLF_NORTH'),
  ('NMFLAT_SOUTH_NIDR_NWS_NOTOU', 'BUSLOLF_SOUTH'),
  ('RESHIPV_COAST_IDR_WS_NOTOU',  'RESLOWR_COAST'),
  ('RESHIPV_FWEST_IDR_WS_NOTOU',  'RESLOWR_WEST'),
  ('RESHIPV_NCENT_IDR_WS_NOTOU',  'RESLOWR_NORTH'),
  ('RESHIPV_SOUTH_IDR_WS_NOTOU',  'RESLOWR_SOUTH'),
  ('RESHIWD_NORTH_IDR_WS_NOTOU',  'RESLOWR_NORTH'),
  ('RESHIWR_FWEST_IDR_WS_NOTOU',  'RESLOWR_WEST'),
  ('RESLOPV_COAST_IDR_WS_NOTOU',  'RESLOWR_COAST'),
  ('RESLOPV_NCENT_IDR_WS_NOTOU',  'RESLOWR_NORTH'),
  ('RESLOPV_WEST_IDR_WS_NOTOU',   'RESLOWR_WEST')
ON DUPLICATE KEY UPDATE short_name = VALUES(short_name);
