-- Migration 002 - 2026-06-07 - Fix billing table structure
ALTER TABLE billing_extract_raw MODIFY sno int NOT NULL AUTO_INCREMENT, ADD PRIMARY KEY (sno);
ALTER TABLE billing_extract_raw MODIFY bill_date varchar(40) NOT NULL;
ALTER TABLE billing_extract_raw MODIFY due_date varchar(40) NOT NULL;
ALTER TABLE billing_extract_raw MODIFY city_tax_exempt varchar(5) DEFAULT NULL;
ALTER TABLE billing_extract_raw MODIFY county_tax_exempt varchar(5) DEFAULT NULL;
ALTER TABLE billing_extract_raw MODIFY gros_tax_exempt varchar(5) DEFAULT NULL;
ALTER TABLE billing_extract_raw MODIFY mtacda_tax_exempt varchar(5) DEFAULT NULL;
ALTER TABLE billing_extract_raw MODIFY pugra_tax_exempt varchar(5) DEFAULT NULL;
ALTER TABLE billing_extract_raw MODIFY spdt_tax_exempt varchar(5) DEFAULT NULL;
ALTER TABLE billing_extract_raw MODIFY spdt2_tax_exempt varchar(5) DEFAULT NULL;
ALTER TABLE billing_extract_raw MODIFY state_tax_exempt varchar(5) DEFAULT NULL;
ALTER TABLE billing_extract_raw MODIFY credit_rating2 varchar(20) DEFAULT NULL;

ALTER TABLE billing_upload_log MODIFY id int NOT NULL AUTO_INCREMENT, ADD PRIMARY KEY (id), ADD UNIQUE KEY uq_upload_date (upload_date);

ALTER TABLE billing_exception_log MODIFY id int NOT NULL AUTO_INCREMENT, ADD PRIMARY KEY (id);

-- Migration 003 - 2026-06-07 - Create portfolio_view
CREATE VIEW `portfolio_view` AS 
select `contract_renewal`.`cust_id` AS `cust_id`,`contract_renewal`.`company_name` AS `company_name`,cast(`contract_renewal`.`premise_id` as char charset utf8mb4) AS `premise_id`,substring_index(substring_index(`contract_renewal`.`load_profile`,'_',2),'_',-1) AS `weather_zone`,case substring_index(substring_index(`contract_renewal`.`load_profile`,'_',2),'_',-1) when 'NCENT' then 'NORTH' when 'NORTH' then 'NORTH' when 'EAST' then 'NORTH' when 'SCENT' then 'SOUTH' when 'SOUTH' then 'SOUTH' when 'FWEST' then 'WEST' when 'WEST' then 'WEST' when 'COAST' then 'COAST' else 'UNKNOWN' end AS `zone`,`contract_renewal`.`load_profile` AS `load_profile`,case when `contract_renewal`.`contract_type` = 'Fix' then 'Fix' when `contract_renewal`.`contract_type` = 'LMP' then 'LMP' else 'MTM' end AS `contract_type`,`contract_renewal`.`contract_rate` AS `contract_rate`,str_to_date(`contract_renewal`.`contract_end_date`,'%m/%d/%Y') AS `contract_end_date`,`contract_renewal`.`contract_renewal_usage` AS `usage_kwh`,`contract_renewal`.`broker_code` AS `broker_code`,case when str_to_date(`contract_renewal`.`contract_end_date`,'%m/%d/%Y') >= curdate() then 'active' else 'expired' end AS `status` from `contract_renewal` where `contract_renewal`.`premise_id` is not null and `contract_renewal`.
