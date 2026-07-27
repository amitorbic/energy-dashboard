-- Migration 019: Secondary indexes for esi_id_master.
-- Run AFTER the initial bulk load completes (see migration 018 notes) --
-- building these before loading ~13.3M rows would slow the load substantially.

USE `u972964962_orbic`;

ALTER TABLE `esi_id_master`
    ADD INDEX `idx_address_search` (`zipcode`, `city`, `address`),
    ADD INDEX `idx_city` (`city`),
    ADD INDEX `idx_duns` (`duns`);
