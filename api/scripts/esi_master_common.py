"""
Shared constants/helpers for esi_id_master loaders: the initial bulk load
(load_esi_id_master.py), the monthly full-replacement refresh
(full_replace_esi_id_master.py), and the daily incremental update
(incremental_update_esi_id_master.py). Column mapping lives here once so
the three scripts can't drift out of sync with each other.

Source files have no header row and 22 positional columns (not the 19 in
the original ERCOT spec) -- see migration 018 comments for the column
mapping (COUNTY at position 6, two premise-subtype columns at the end).
"""
import pymysql

SRC_DIR = r"C:\Users\Amit\Desktop\ESI ID Database"

FILES = [
    "AEP_CENTRAL__FUL-REPORTS-06-JUL-26.csv",
    "AEP_NORTH____FUL-REPORTS-06-JUL-26.csv",
    "AEP_TEXAS_SP_FUL-REPORTS-06-JUL-26.csv",
    "CENTERPOINT__FUL-REPORTS-06-JUL-26.csv",
    "ENTERGY_GULF_FUL-REPORTS-06-JUL-26.csv",
    "LUBBOCK______FUL-REPORTS-06-JUL-26.csv",
    "NUECES_ELEC__FUL-REPORTS-06-JUL-26.csv",
    "ONCOR_ELEC___FUL-REPORTS-06-JUL-26.csv",
    "SHARYLAND_MCALLEN_FUL-REPORTS-06-JUL-26.csv",
    "SHARYLAND_UTILITIES_FUL-REPORTS-06-JUL-26.csv",
    "SWEPCO_ENERG_FUL-REPORTS-06-JUL-26.csv",
    "TNMP_________FUL-REPORTS-06-JUL-26.csv",
]

# Every non-key column that a source row can populate -- shared by the
# incremental script's ON DUPLICATE KEY UPDATE clause.
UPSERT_COLUMNS = [
    "address", "address_overflow", "city", "state", "zipcode", "county",
    "duns", "meter_read_cycle", "status", "premise_type", "power_region",
    "stationcode", "stationname", "metered", "open_service_orders",
    "polr_customer_class", "settlement_ams_indicator", "tdsp_ams_indicator",
    "switch_hold_indicator", "premise_subtype_code", "premise_subtype_desc",
    "source_file",
]


def load_sql_for_table(table):
    """LOAD DATA INFILE template targeting `table`. Takes (path, source_file) params."""
    return f"""
LOAD DATA INFILE %s
REPLACE INTO TABLE {table}
CHARACTER SET utf8mb4
FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
LINES TERMINATED BY '\\n'
(esi_id, address, @address_overflow, city, state, zipcode, @county,
 @duns, @meter_read_cycle, status, @premise_type, @power_region,
 @stationcode, @stationname, @metered, @open_service_orders,
 @polr_customer_class, @settlement_ams_indicator, @tdsp_ams_indicator,
 @switch_hold_indicator, @premise_subtype_code, @premise_subtype_desc)
SET
  address_overflow         = NULLIF(@address_overflow, ''),
  county                    = NULLIF(@county, ''),
  duns                      = NULLIF(@duns, ''),
  meter_read_cycle          = NULLIF(@meter_read_cycle, ''),
  premise_type              = NULLIF(@premise_type, ''),
  power_region              = NULLIF(@power_region, ''),
  stationcode               = NULLIF(@stationcode, ''),
  stationname               = NULLIF(@stationname, ''),
  metered                   = NULLIF(@metered, ''),
  open_service_orders       = NULLIF(@open_service_orders, ''),
  polr_customer_class       = NULLIF(@polr_customer_class, ''),
  settlement_ams_indicator  = NULLIF(@settlement_ams_indicator, ''),
  tdsp_ams_indicator        = NULLIF(@tdsp_ams_indicator, ''),
  switch_hold_indicator     = NULLIF(@switch_hold_indicator, ''),
  premise_subtype_code      = NULLIF(@premise_subtype_code, ''),
  premise_subtype_desc      = NULLIF(@premise_subtype_desc, ''),
  source_file               = %s
"""


def connect():
    return pymysql.connect(
        host="localhost", user="root", password="",
        database="u972964962_orbic", port=3306,
        local_infile=True, autocommit=False,
    )
