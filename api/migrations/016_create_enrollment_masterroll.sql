-- Migration 016: Create enrollment_masterroll.
--
-- Follow-up to the pre-production drift audit (2026-07-22/23), triggered by
-- a separate enrollment-engine change (two-queue Mark-Active flow) that
-- landed in api/routers/enrollment_engine.py and contract_renewal.py without
-- ever getting a migration. This table is the enrollment staging queue:
-- generate_masterroll() inserts pending enrollees here; activate_customer()
-- reads a row and only THEN writes the real contract_renewal row (Option A:
-- contract_renewal only gets a row on Mark Active). 0 rows live in dev at
-- audit time (staging table, currently empty) -- schema only, no data gap.
--
-- tax_exempt columns here intentionally mirror contract_renewal's, with one
-- naming difference: `mta_cda_tax_exempt` here vs. `mtacda_tax_exempt` on
-- contract_renewal (see migration 014) -- both spellings are real and the
-- code (enrollment_engine.py activate_customer) explicitly maps between them
-- when copying a row from this table into contract_renewal. Not a typo to
-- "fix" -- changing either name will break that mapping.

USE `u972964962_orbic`;

CREATE TABLE IF NOT EXISTS `enrollment_masterroll` (
  `id`                     INT           NOT NULL AUTO_INCREMENT,
  `batch_no`               VARCHAR(20)   NOT NULL,
  `esi_id`                 VARCHAR(50)   NOT NULL,
  `customer_id`            VARCHAR(10)   DEFAULT NULL,
  `status`                 VARCHAR(20)   NOT NULL DEFAULT 'pending',
  `enrol_type`             VARCHAR(5)    DEFAULT NULL,
  `contract_type`          VARCHAR(20)   DEFAULT NULL,
  `contract_rate`          DECIMAL(10,6) DEFAULT NULL,
  `contract_term`          VARCHAR(10)   DEFAULT NULL,
  `contract_start_date`    DATE          DEFAULT NULL,
  `contract_end_date`      DATE          DEFAULT NULL,
  `plan_id1`               VARCHAR(50)   DEFAULT NULL,
  `plan_id2`               VARCHAR(50)   DEFAULT NULL,
  `plan_id3`               VARCHAR(50)   DEFAULT NULL,
  `plan_group`             VARCHAR(20)   DEFAULT NULL,
  `priority_code`          VARCHAR(10)   DEFAULT NULL,
  `company_name`           VARCHAR(255)  DEFAULT NULL,
  `cust_first_name`        VARCHAR(100)  DEFAULT NULL,
  `cust_last_name`         VARCHAR(100)  DEFAULT NULL,
  `customer_email`         VARCHAR(200)  DEFAULT NULL,
  `customer_phone`         VARCHAR(50)   DEFAULT NULL,
  `billing_address`        VARCHAR(500)  DEFAULT NULL,
  `billing_city`           VARCHAR(100)  DEFAULT NULL,
  `billing_state`          VARCHAR(50)   DEFAULT NULL,
  `billing_zip`            VARCHAR(50)   DEFAULT NULL,
  `broker_code`            VARCHAR(50)   DEFAULT NULL,
  `broker_name`            VARCHAR(100)  DEFAULT NULL,
  `agent_commission_rate`  DECIMAL(10,6) DEFAULT NULL,
  `mills`                  DECIMAL(10,4) DEFAULT NULL,
  `meter_fee`              DECIMAL(10,2) DEFAULT NULL,
  `lmp`                    TINYINT(1)    DEFAULT 0,
  `load_profile`           VARCHAR(100)  DEFAULT NULL,
  `city_tax_exempt`        TINYINT(1)    DEFAULT 0,
  `county_tax_exempt`      TINYINT(1)    DEFAULT 0,
  `state_tax_exempt`       TINYINT(1)    DEFAULT 0,
  `mta_cda_tax_exempt`     TINYINT(1)    DEFAULT 0,
  `spdt_tax_exempt`        TINYINT(1)    DEFAULT 0,
  `spdt2_tax_exempt`       TINYINT(1)    DEFAULT 0,
  `grt_tax_exempt`         TINYINT(1)    DEFAULT 0,
  `puc_tax_exempt`         TINYINT(1)    DEFAULT 0,
  `tdsp_duns`              VARCHAR(20)   DEFAULT NULL,
  `tdsp_name`              VARCHAR(100)  DEFAULT NULL,
  `utility_account_number` VARCHAR(50)   DEFAULT NULL,
  `confirmation_sid`       INT           DEFAULT NULL,
  `created_at`             TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`             TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                         ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_batch_no`    (`batch_no`),
  INDEX `idx_esi_id`      (`esi_id`),
  INDEX `idx_status`      (`status`),
  INDEX `idx_customer_id` (`customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
