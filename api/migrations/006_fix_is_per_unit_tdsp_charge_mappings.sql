-- Migration 006: Fix is_per_unit in tdsp_charge_mappings
-- Scope: tdsp_charge_mappings ONLY.
--
-- Part A: make is_per_unit nullable with no default.
--   NULL = UOM not yet confirmed from real EDI data.
--   0    = flat charge (EA only — confirmed from ONCOR 810 sample).
--   1    = variable charge (rate x quantity — confirmed from ONCOR 810 sample).
--
-- Part B: set evidence-based values for 9 codes (UOM read directly
--   from In_207_ONCOR_200421_81002_00N30003.txt).
--
-- Part C: set NULL for MSC038 and MSC039 — previously guessed as 1,
--   no raw EDI line item exists to verify actual UOM.

ALTER TABLE `tdsp_charge_mappings`
  MODIFY COLUMN `is_per_unit` TINYINT(1) DEFAULT NULL;

-- Part B: 9 evidence-based values
UPDATE `tdsp_charge_mappings` SET `is_per_unit` = 0 WHERE `charge_code` = 'BAS001' AND `tdsp_duns` IS NULL;
UPDATE `tdsp_charge_mappings` SET `is_per_unit` = 0 WHERE `charge_code` = 'BAS003' AND `tdsp_duns` IS NULL;
UPDATE `tdsp_charge_mappings` SET `is_per_unit` = 0 WHERE `charge_code` = 'ODL005' AND `tdsp_duns` IS NULL;
UPDATE `tdsp_charge_mappings` SET `is_per_unit` = 1 WHERE `charge_code` = 'TRN002' AND `tdsp_duns` IS NULL;
UPDATE `tdsp_charge_mappings` SET `is_per_unit` = 1 WHERE `charge_code` = 'DIS001' AND `tdsp_duns` IS NULL;
UPDATE `tdsp_charge_mappings` SET `is_per_unit` = 1 WHERE `charge_code` = 'MSC024' AND `tdsp_duns` IS NULL;
UPDATE `tdsp_charge_mappings` SET `is_per_unit` = 1 WHERE `charge_code` = 'MSC025' AND `tdsp_duns` IS NULL;
UPDATE `tdsp_charge_mappings` SET `is_per_unit` = 1 WHERE `charge_code` = 'MSC041' AND `tdsp_duns` IS NULL;
UPDATE `tdsp_charge_mappings` SET `is_per_unit` = 1 WHERE `charge_code` = 'MSC042' AND `tdsp_duns` IS NULL;

-- Part C: remove guessed values — set NULL until real EDI data confirms UOM
UPDATE `tdsp_charge_mappings` SET `is_per_unit` = NULL WHERE `charge_code` = 'MSC038' AND `tdsp_duns` IS NULL;
UPDATE `tdsp_charge_mappings` SET `is_per_unit` = NULL WHERE `charge_code` = 'MSC039' AND `tdsp_duns` IS NULL;
