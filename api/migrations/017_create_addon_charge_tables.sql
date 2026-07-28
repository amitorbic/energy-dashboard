-- Migration 017: Create addon_charge_types, addon_charge_type_rates,
-- contract_addon_charges.
--
-- Follow-up to the pre-production drift audit (2026-07-22/23). These three
-- tables back the new "attach addon charge to contract" endpoints added to
-- api/routers/contract_renewal.py (list-active-addon-types /
-- list-contract-addon-charges / attach / detach), found live in dev with no
-- migration anywhere. contract_addon_charges FKs to contract_renewal(serial)
-- -- consistent with existing practice (migration 011/014 also assume
-- contract_renewal pre-exists as legacy, unmigrated schema).
--
-- Data: addon_charge_types has 1 live row (ANCSVC / Ancillary Services,
-- usage_based, taxable, active) and addon_charge_type_rates has 1 live row
-- for it (rate 0.001456, effective 2024-04-01, still active).
-- contract_addon_charges has 0 live rows (schema only).
--
-- The dev description string was captured verbatim as "Ancillary Services
-- (ANCSVC) updated" -- the trailing "updated" was leftover dev-testing
-- text, confirmed not intentional. Corrected to "Ancillary Services
-- (ANCSVC)" below before this shipped to production.

USE `u972964962_orbic`;

CREATE TABLE IF NOT EXISTS `addon_charge_types` (
  `id`                INT           NOT NULL AUTO_INCREMENT,
  `code`              VARCHAR(20)   NOT NULL,
  `description`       VARCHAR(255)  NOT NULL,
  `calculation_basis` ENUM('flat','usage_based') NOT NULL,
  `is_taxable`        TINYINT(1)    NOT NULL DEFAULT 0,
  `is_active`         TINYINT(1)    NOT NULL DEFAULT 1,
  `created_at`        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_act_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `addon_charge_type_rates` (
  `id`             INT           NOT NULL AUTO_INCREMENT,
  `addon_type_id`  INT           NOT NULL,
  `rate`           DECIMAL(10,6) NOT NULL,
  `effective_from` DATE          NOT NULL,
  `effective_to`   DATE          DEFAULT NULL,
  `created_at`     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_actr_type_from` (`addon_type_id`, `effective_from`),
  CONSTRAINT `fk_actr_type` FOREIGN KEY (`addon_type_id`)
    REFERENCES `addon_charge_types` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `contract_addon_charges` (
  `id`              INT NOT NULL AUTO_INCREMENT,
  `contract_serial` INT NOT NULL,
  `addon_type_id`   INT NOT NULL,
  `created_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cac_contract_addon` (`contract_serial`, `addon_type_id`),
  CONSTRAINT `fk_cac_addon_type` FOREIGN KEY (`addon_type_id`)
    REFERENCES `addon_charge_types` (`id`),
  CONSTRAINT `fk_cac_contract` FOREIGN KEY (`contract_serial`)
    REFERENCES `contract_renewal` (`serial`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `addon_charge_types`
  (`code`, `description`, `calculation_basis`, `is_taxable`, `is_active`)
VALUES
  ('ANCSVC', 'Ancillary Services (ANCSVC)', 'usage_based', 1, 1)
ON DUPLICATE KEY UPDATE
  `description`       = VALUES(`description`),
  `calculation_basis` = VALUES(`calculation_basis`),
  `is_taxable`        = VALUES(`is_taxable`),
  `is_active`         = VALUES(`is_active`);

INSERT INTO `addon_charge_type_rates`
  (`addon_type_id`, `rate`, `effective_from`, `effective_to`)
SELECT `id`, 0.001456, '2024-04-01', NULL
FROM `addon_charge_types` WHERE `code` = 'ANCSVC'
ON DUPLICATE KEY UPDATE
  `rate`          = VALUES(`rate`),
  `effective_to`  = VALUES(`effective_to`);
