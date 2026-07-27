-- Migration 005: Add is_taxable to tdsp_charge_mappings + 3 new verified universal codes
--
-- is_taxable: NULL = unverified (must not be assumed)
--             1    = taxable     (confirmed by reconciled customer bills)
--             0    = non-taxable (confirmed by reconciled customer bills)
--
-- The 11 codes updated/inserted below are the ONLY ones with confirmed taxable status.
-- All other codes in tdsp_charge_mappings remain NULL until individually verified.

-- ── Part 1: Add the column ───────────────────────────────────────────────────
ALTER TABLE `tdsp_charge_mappings`
  ADD COLUMN `is_taxable` TINYINT(1) DEFAULT NULL
  AFTER `is_passthrough`;

-- ── Part 2: Update the 8 already-seeded universal rows ───────────────────────
UPDATE `tdsp_charge_mappings` SET `is_taxable` = 1 WHERE `charge_code` = 'TRN002' AND `tdsp_duns` IS NULL;
UPDATE `tdsp_charge_mappings` SET `is_taxable` = 1 WHERE `charge_code` = 'BAS001' AND `tdsp_duns` IS NULL;
UPDATE `tdsp_charge_mappings` SET `is_taxable` = 1 WHERE `charge_code` = 'BAS003' AND `tdsp_duns` IS NULL;
UPDATE `tdsp_charge_mappings` SET `is_taxable` = 1 WHERE `charge_code` = 'DIS001' AND `tdsp_duns` IS NULL;
UPDATE `tdsp_charge_mappings` SET `is_taxable` = 1 WHERE `charge_code` = 'MSC041' AND `tdsp_duns` IS NULL;
UPDATE `tdsp_charge_mappings` SET `is_taxable` = 1 WHERE `charge_code` = 'MSC042' AND `tdsp_duns` IS NULL;
UPDATE `tdsp_charge_mappings` SET `is_taxable` = 0 WHERE `charge_code` = 'MSC024' AND `tdsp_duns` IS NULL;
UPDATE `tdsp_charge_mappings` SET `is_taxable` = 0 WHERE `charge_code` = 'MSC025' AND `tdsp_duns` IS NULL;

-- ── Part 3: Insert 3 new confirmed universal rows ────────────────────────────
-- MSC038: Transition Charge TC4
-- MSC039: Advanced Metering Cost Recovery Factor
-- ODL005: Outdoor Lighting - Facilities (billing_category confirmed as 'misc')
INSERT INTO `tdsp_charge_mappings`
  (`tdsp_duns`, `charge_code`, `charge_description`, `billing_category`, `is_per_unit`, `is_passthrough`, `is_taxable`)
VALUES
  (NULL, 'MSC038', 'Transition Charge (TC4)',                      'surcharge', 1, 1, 0),
  (NULL, 'MSC039', 'Advanced Metering Cost Recovery Factor',       'surcharge', 1, 1, 1),
  (NULL, 'ODL005', 'Outdoor Lighting - Facilities',                'misc',      0, 1, 1)
ON DUPLICATE KEY UPDATE
  `charge_description` = VALUES(`charge_description`),
  `billing_category`   = VALUES(`billing_category`),
  `is_per_unit`        = VALUES(`is_per_unit`),
  `is_passthrough`     = VALUES(`is_passthrough`),
  `is_taxable`         = VALUES(`is_taxable`);
