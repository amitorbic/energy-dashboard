-- Migration 018: Create esi_id_master and load_history.
--
-- ESI ID master reference database, sourced from 11 ERCOT TDSP extract
-- files (~13.3M rows total, see docs/BILLING_ENGINE.md-adjacent inspection
-- notes). Standalone table -- not linked to contract_renewal, billing
-- engine, or any other existing table.
--
-- Deviations from the original 19-column ERCOT spec, based on actual
-- inspection of all 11 source files (none have a header row; column
-- identity was inferred positionally):
--   - Source rows have 22 columns, not 19. Three extra columns found:
--     COUNTY (positioned between zipcode and duns; populated in 7 of 11
--     files, ~10M+ rows), and two trailing premise-subtype columns
--     (populated only in CENTERPOINT and TNMP, ~270K rows) added here as
--     premise_subtype_code / premise_subtype_desc.
--   - esi_id widened to VARCHAR(25) (observed max is exactly 22 chars in
--     CenterPoint -- zero headroom at VARCHAR(22), so a small safety
--     margin was added for future extracts).
--   - status ENUM literal cased 'De-Energized' to match source data
--     exactly (source uses "Active" / "Inactive" / "De-Energized").
--
-- Built WITHOUT secondary indexes for faster bulk load; idx_address_search,
-- idx_city, idx_duns are added in migration 019 after the initial load.

USE `u972964962_orbic`;

CREATE TABLE IF NOT EXISTS `esi_id_master` (
    `esi_id`                    VARCHAR(25)  NOT NULL,
    `address`                   VARCHAR(255) NOT NULL,
    `address_overflow`          VARCHAR(255) NULL,
    `city`                      VARCHAR(100) NOT NULL,
    `state`                     VARCHAR(2)   NOT NULL DEFAULT 'TX',
    `zipcode`                   VARCHAR(10)  NOT NULL,
    `county`                    VARCHAR(20)  NULL,
    `duns`                      VARCHAR(20)  NULL,
    `meter_read_cycle`          VARCHAR(5)   NULL,
    `status`                    ENUM('Active','Inactive','De-Energized') NOT NULL,
    `premise_type`              VARCHAR(30)  NULL,
    `power_region`              VARCHAR(10)  NULL,
    `stationcode`               VARCHAR(50)  NULL,
    `stationname`               VARCHAR(100) NULL,
    `metered`                   CHAR(1)      NULL,
    `open_service_orders`       TEXT         NULL,
    `polr_customer_class`       VARCHAR(50)  NULL,
    `settlement_ams_indicator`  CHAR(1)      NULL,
    `tdsp_ams_indicator`        VARCHAR(10)  NULL,
    `switch_hold_indicator`     CHAR(1)      NULL,
    `premise_subtype_code`      VARCHAR(10)  NULL,
    `premise_subtype_desc`      VARCHAR(60)  NULL,
    `source_file`               VARCHAR(255) NULL,
    `loaded_at`                 TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`esi_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `load_history` (
    `load_id`       INT AUTO_INCREMENT PRIMARY KEY,
    `file_name`     VARCHAR(255) NOT NULL,
    `load_type`     ENUM('full','incremental') NOT NULL,
    `row_count`     INT NOT NULL,
    `started_at`    TIMESTAMP NOT NULL,
    `completed_at`  TIMESTAMP NULL,
    `status`        ENUM('success','failed') NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
