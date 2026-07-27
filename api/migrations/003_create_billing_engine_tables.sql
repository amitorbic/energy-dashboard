-- Migration 003: Elastic Billing Engine — 7 new tables + seed data
-- Run against u972964962_orbic (or the tenant DB configured in DB_NAME).
--
-- Creation order resolves the circular FK between edi_867_usage and billing_periods:
--   1. tdsp_charge_mappings   (no deps)
--   2. edi_files              (no deps)
--   3. edi_867_usage          (FK → edi_files; billing_period_id is plain INT — FK added in step 5)
--   4. billing_periods        (FK → edi_867_usage)
--   5. ALTER edi_867_usage    (adds FK billing_period_id → billing_periods)
--   6. edi_810_line_items     (FKs → edi_files, tdsp_charge_mappings, billing_periods)
--   7. billing_period_charges (FKs → billing_periods, edi_810_line_items)
--   8. invoices               (FK → billing_periods)
--   9. Seed data
--
-- NOTE on interchange_control uniqueness:
--   The EDI H-row's first numeric field (e.g. "26416904") is a file-level control
--   number used here as the per-file dedup key.  The per-ESI dedup key
--   (Document_Tracking_Number from D-rows) is stored in edi_867_usage.document_tracking_number.
--
-- NOTE on NULL sentinel in tdsp_charge_mappings:
--   tdsp_duns = NULL means "universal — applies to all TDSPs."
--   MySQL UNIQUE(tdsp_duns, charge_code) treats two NULLs as non-equal, so it
--   will NOT prevent duplicate universal rows.  The application layer must
--   check for existing (NULL, charge_code) before any INSERT of a universal mapping.

USE `u972964962_orbic`;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. tdsp_charge_mappings
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `tdsp_charge_mappings` (
  `id`                 INT            NOT NULL AUTO_INCREMENT,
  `tdsp_duns`          VARCHAR(20)    DEFAULT NULL,
  `charge_code`        VARCHAR(20)    NOT NULL,
  `charge_description` VARCHAR(255)   DEFAULT NULL,
  `billing_category`   ENUM(
                         'transmission','distribution','customer_charge',
                         'metering','surcharge','tax','misc','excluded'
                       )              NOT NULL,
  `is_per_unit`        TINYINT(1)     NOT NULL DEFAULT 1,
  `is_passthrough`     TINYINT(1)     NOT NULL DEFAULT 1,
  `notes`              VARCHAR(500)   DEFAULT NULL,
  `created_at`         TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                      ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE  KEY `uq_duns_code`    (`tdsp_duns`, `charge_code`),
  INDEX        `idx_charge_code` (`charge_code`),
  INDEX        `idx_tdsp_duns`   (`tdsp_duns`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. edi_files
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `edi_files` (
  `id`                   INT            NOT NULL AUTO_INCREMENT,
  `interchange_control`  VARCHAR(50)    NOT NULL,
  `edi_type`             ENUM('867_03','810_02') NOT NULL,
  `tdsp_name`            VARCHAR(200)   DEFAULT NULL,
  `tdsp_duns`            VARCHAR(20)    DEFAULT NULL,
  `file_date`            DATE           DEFAULT NULL,
  `original_filename`    VARCHAR(255)   NOT NULL,
  `uploaded_by`          VARCHAR(100)   NOT NULL,
  `status`               ENUM('pending','processed','error')
                                        NOT NULL DEFAULT 'pending',
  `records_found`        INT            NOT NULL DEFAULT 0,
  `records_matched`      INT            NOT NULL DEFAULT 0,
  `error_detail`         TEXT           DEFAULT NULL,
  `raw_content`          LONGTEXT       DEFAULT NULL,
  `created_at`           TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE  KEY `uq_interchange`   (`interchange_control`),
  INDEX        `idx_edi_type`    (`edi_type`),
  INDEX        `idx_tdsp_duns`   (`tdsp_duns`),
  INDEX        `idx_file_date`   (`file_date`),
  INDEX        `idx_status`      (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. edi_867_usage  (billing_period_id FK deferred — added in step 5)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `edi_867_usage` (
  `id`                        INT           NOT NULL AUTO_INCREMENT,
  `edi_file_id`               INT           NOT NULL,
  `esi_id`                    VARCHAR(30)   NOT NULL,
  `document_tracking_number`  VARCHAR(100)  NOT NULL,
  `tdsp_name`                 VARCHAR(200)  DEFAULT NULL,
  `tdsp_duns`                 VARCHAR(20)   DEFAULT NULL,
  `meter_number`              VARCHAR(50)   DEFAULT NULL,
  `service_start`             DATE          NOT NULL,
  `service_end`               DATE          NOT NULL,
  `billing_days`              INT           NOT NULL DEFAULT 0,
  `usage_kwh`                 DECIMAL(12,4) DEFAULT NULL,
  `kw_demand`                 DECIMAL(12,4) DEFAULT NULL,
  `ptd_code`                  VARCHAR(5)    DEFAULT NULL,
  `reading_type_code`         VARCHAR(5)    DEFAULT NULL,
  `is_estimated`              TINYINT(1)    NOT NULL DEFAULT 0,
  `meter_type`                VARCHAR(10)   DEFAULT NULL,
  `raw_segments`              JSON          DEFAULT NULL,
  `status`                    ENUM('unmatched','matched','no_contract')
                                            NOT NULL DEFAULT 'unmatched',
  `billing_period_id`         INT           DEFAULT NULL,
  `created_at`                TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE  KEY `uq_doc_tracking`  (`document_tracking_number`),
  UNIQUE  KEY `uq_esi_period`    (`esi_id`, `service_start`, `service_end`),
  INDEX        `idx_esi_id`      (`esi_id`),
  INDEX        `idx_edi_file`    (`edi_file_id`),
  INDEX        `idx_status`      (`status`),
  INDEX        `idx_bp_id`       (`billing_period_id`),
  CONSTRAINT `fk_867_edi_file` FOREIGN KEY (`edi_file_id`)
    REFERENCES `edi_files` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. billing_periods
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `billing_periods` (
  `id`            INT           NOT NULL AUTO_INCREMENT,
  `esi_id`        VARCHAR(30)   NOT NULL,
  `edi_867_id`    INT           NOT NULL,
  `service_start` DATE          NOT NULL,
  `service_end`   DATE          NOT NULL,
  `billing_days`  INT           NOT NULL DEFAULT 0,
  `usage_kwh`     DECIMAL(12,4) DEFAULT NULL,
  `kw_demand`     DECIMAL(12,4) DEFAULT NULL,
  `contract_rate` DECIMAL(10,6) DEFAULT NULL,
  `meter_fee`     DECIMAL(10,2) DEFAULT NULL,
  `has_810`       TINYINT(1)    NOT NULL DEFAULT 0,
  `flags`         JSON          DEFAULT NULL,
  `status`        ENUM('draft','reviewed','approved','invoiced')
                                NOT NULL DEFAULT 'draft',
  `created_at`    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE  KEY `uq_esi_period`  (`esi_id`, `service_start`, `service_end`),
  INDEX        `idx_esi_id`    (`esi_id`),
  INDEX        `idx_867`       (`edi_867_id`),
  INDEX        `idx_status`    (`status`),
  CONSTRAINT `fk_bp_867` FOREIGN KEY (`edi_867_id`)
    REFERENCES `edi_867_usage` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Close the circular FK: edi_867_usage.billing_period_id → billing_periods
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE `edi_867_usage`
  ADD CONSTRAINT `fk_867_billing_period`
    FOREIGN KEY (`billing_period_id`)
    REFERENCES `billing_periods` (`id`)
    ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. edi_810_line_items
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `edi_810_line_items` (
  `id`                        INT           NOT NULL AUTO_INCREMENT,
  `edi_file_id`               INT           NOT NULL,
  `esi_id`                    VARCHAR(30)   NOT NULL,
  `tdsp_name`                 VARCHAR(200)  DEFAULT NULL,
  `tdsp_duns`                 VARCHAR(20)   DEFAULT NULL,
  `document_tracking_number`  VARCHAR(100)  NOT NULL,
  `original_document_id`      VARCHAR(100)  DEFAULT NULL,
  `document_sub_purpose`      ENUM('MONTH','FINAL')
                                            NOT NULL DEFAULT 'MONTH',
  `service_start`             DATE          NOT NULL,
  `service_end`               DATE          NOT NULL,
  `line_item_number`          INT           DEFAULT NULL,
  `charge_code`               VARCHAR(20)   NOT NULL,
  `charge_description`        VARCHAR(255)  DEFAULT NULL,
  `charge_amount`             DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `charge_rate`               DECIMAL(12,6) DEFAULT NULL,
  `charge_quantity`           DECIMAL(12,4) DEFAULT NULL,
  `charge_unit`               VARCHAR(10)   DEFAULT NULL,
  `registered_quantity`       DECIMAL(12,4) DEFAULT NULL,
  `charge_comments`           VARCHAR(255)  DEFAULT NULL,
  `utility_rate_class`        VARCHAR(10)   DEFAULT NULL,
  `invoice_total_amount`      DECIMAL(12,2) DEFAULT NULL,
  `mapping_id`                INT           DEFAULT NULL,
  `billing_period_id`         INT           DEFAULT NULL,
  `status`                    ENUM('unmapped','mapped','excluded')
                                            NOT NULL DEFAULT 'unmapped',
  `created_at`                TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_esi_id`          (`esi_id`),
  INDEX `idx_doc_tracking`    (`document_tracking_number`),
  INDEX `idx_edi_file`        (`edi_file_id`),
  INDEX `idx_mapping`         (`mapping_id`),
  INDEX `idx_billing_period`  (`billing_period_id`),
  INDEX `idx_charge_code`     (`charge_code`),
  INDEX `idx_status`          (`status`),
  CONSTRAINT `fk_810_edi_file` FOREIGN KEY (`edi_file_id`)
    REFERENCES `edi_files` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_810_mapping` FOREIGN KEY (`mapping_id`)
    REFERENCES `tdsp_charge_mappings` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_810_billing_period` FOREIGN KEY (`billing_period_id`)
    REFERENCES `billing_periods` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. billing_period_charges
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `billing_period_charges` (
  `id`                   INT           NOT NULL AUTO_INCREMENT,
  `billing_period_id`    INT           NOT NULL,
  `charge_source`        ENUM('supplier','tdsp','tax','adjustment')
                                       NOT NULL,
  `charge_category`      VARCHAR(50)   DEFAULT NULL,
  `charge_code`          VARCHAR(20)   DEFAULT NULL,
  `description`          VARCHAR(255)  NOT NULL,
  `amount`               DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `quantity`             DECIMAL(12,4) DEFAULT NULL,
  `unit_rate`            DECIMAL(10,6) DEFAULT NULL,
  `unit`                 VARCHAR(10)   DEFAULT NULL,
  `edi_810_line_item_id` INT           DEFAULT NULL,
  `sort_order`           INT           NOT NULL DEFAULT 0,
  `created_at`           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_billing_period`   (`billing_period_id`),
  INDEX `idx_810_line`         (`edi_810_line_item_id`),
  CONSTRAINT `fk_bpc_period` FOREIGN KEY (`billing_period_id`)
    REFERENCES `billing_periods` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_bpc_810` FOREIGN KEY (`edi_810_line_item_id`)
    REFERENCES `edi_810_line_items` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. invoices
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `invoices` (
  `id`                INT           NOT NULL AUTO_INCREMENT,
  `invoice_number`    VARCHAR(20)   NOT NULL,
  `billing_period_id` INT           NOT NULL,
  `esi_id`            VARCHAR(30)   NOT NULL,
  `invoice_date`      DATE          NOT NULL,
  `due_date`          DATE          DEFAULT NULL,
  `total_amount`      DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `supplier_charge`   DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `tdsp_total`        DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `tax_total`         DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `status`            ENUM('draft','sent','paid','void')
                                    NOT NULL DEFAULT 'draft',
  `sent_at`           TIMESTAMP     NULL DEFAULT NULL,
  `paid_at`           TIMESTAMP     NULL DEFAULT NULL,
  `created_at`        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE  KEY `uq_invoice_number`   (`invoice_number`),
  UNIQUE  KEY `uq_billing_period`   (`billing_period_id`),
  INDEX        `idx_esi_id`         (`esi_id`),
  INDEX        `idx_invoice_date`   (`invoice_date`),
  INDEX        `idx_status`         (`status`),
  CONSTRAINT `fk_inv_period` FOREIGN KEY (`billing_period_id`)
    REFERENCES `billing_periods` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Seed: 8 confirmed universal charge_code mappings (tdsp_duns = NULL)
--
-- ODL005 (Outdoor Lighting Facilities) is intentionally excluded here —
-- billing_category not confirmed.  Add manually after confirmation:
--   INSERT INTO tdsp_charge_mappings
--     (tdsp_duns, charge_code, charge_description, billing_category, is_per_unit, is_passthrough)
--   VALUES (NULL, 'ODL005', 'Outdoor Lighting Facilities', '<CATEGORY>', 0, 1);
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO `tdsp_charge_mappings`
  (`tdsp_duns`, `charge_code`, `charge_description`, `billing_category`, `is_per_unit`, `is_passthrough`)
VALUES
  (NULL, 'TRN002', 'Firm Point to Point Transmission Service Charge', 'transmission',    0, 1),
  (NULL, 'BAS001', 'Basic Customer Charge',                           'customer_charge', 0, 1),
  (NULL, 'BAS003', 'Delivery Point Charge',                           'metering',        0, 1),
  (NULL, 'DIS001', 'Distribution Charge',                             'distribution',    1, 1),
  (NULL, 'MSC041', 'Energy Efficiency Cost Recovery Factor (EECRF)',  'surcharge',       1, 1),
  (NULL, 'MSC042', 'Distribution Cost Recovery Factor (DCRF)',        'surcharge',       1, 1),
  (NULL, 'MSC024', 'Public Purpose Program (PPP)',                    'surcharge',       1, 1),
  (NULL, 'MSC025', 'Nuclear Decommissioning',                         'surcharge',       1, 1)
ON DUPLICATE KEY UPDATE
  `charge_description` = VALUES(`charge_description`),
  `billing_category`   = VALUES(`billing_category`),
  `is_per_unit`        = VALUES(`is_per_unit`),
  `is_passthrough`     = VALUES(`is_passthrough`);
