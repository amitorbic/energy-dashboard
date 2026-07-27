-- Migration 012: Add MSC043 to tdsp_charge_mappings.
--
-- Pre-production drift audit (2026-07-22/23) found this row live in dev
-- (id=13) with no corresponding migration -- it was added ad-hoc, outside
-- migrations 003/005/006. Capturing it here so production can be built
-- from files rather than from dev's undocumented state.

USE `u972964962_orbic`;

INSERT INTO `tdsp_charge_mappings`
  (`charge_code`, `charge_description`, `billing_category`,
   `is_per_unit`, `is_passthrough`, `is_taxable`)
VALUES
  ('MSC043', 'Recovery of securitized regulatory assets - stranded costs (TC5)',
   'surcharge', 1, 1, 1)
ON DUPLICATE KEY UPDATE
  `charge_description` = VALUES(`charge_description`),
  `billing_category`   = VALUES(`billing_category`),
  `is_per_unit`        = VALUES(`is_per_unit`),
  `is_passthrough`     = VALUES(`is_passthrough`),
  `is_taxable`         = VALUES(`is_taxable`);
