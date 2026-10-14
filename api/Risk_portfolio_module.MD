# AmeriPower - Risk & Portfolio Module Context

> Changelog 2026-10-07: corrected against code by audit (doc-audit-risk-portfolio.md). Rows changed: A1, A2, A6, A7, A9, A10, A14, A17, A19, A20, A23, A30, A31, A32, A33; new section "Portfolio Contracts" (A34); UNVERIFIED labels on A3, A8, A11-A13, A15, A16, A18, A24-A29. Also fixed, not in the audit: second NCENT/SCENT/FWEST zone list (A10 duplicate), second LSEGUNADJ mentions (A14 duplicates), non-ASCII characters replaced with ASCII.
>
> Changelog 2026-10-07 (follow-up): multi-tenant wording corrected. Earlier edit said routing was "in place"; code shows deployment-per-tenant (DB_NAME), with TenantMiddleware not wired into main.py. Rows changed: A1, A2, Next Steps item 10 (doc A); B2 (doc B).

## Last Updated: October 2026 (corrected against code; body otherwise from April 2026)

## System Overview

- **Stack**: FastAPI + SQLAlchemy async + MySQL (aiomysql) on port 8001
- **Frontend**: Next.js + TypeScript + Tailwind on port 3000
- **DB**: u972964962_orbic (MariaDB)
- **All routes registered under `/api` prefix in `main.py`**
- **Architecture**: Deployment-per-tenant: each tenant has its own backend instance and its own DB (DB_NAME in .env, api/utils/database.py); modules gated by TENANT_MODULES (api/utils/tenant_module_config.py)

## Multi-Tenant Architecture

Tenants are separate deployments, each pointing at one DB via DB_NAME (api/utils/database.py) and created by api/scripts/provision_tenant.py. Per-request routing through a master DB (api/middleware/tenant.py TenantMiddleware, api/utils/master_db.py) is written but NOT added to main.py. The block below is the original design sketch.

```
Master DB -> reps table (rep_id, company_name, db_name)
Each REP -> own DB (identical table structure)
Like a washing machine - same machine, everyone's own load
Build routing middleware when onboarding second REP
```

---

## Modules Already Built (Pre-Session)

Module list: UNVERIFIED (needs live server or browser) - not checked by the audit.

- [done] Daily Pricing Matrix
- [done] Custom Pricing (B&E, MSP, Sample Bill)
- [done] Broker Database
- [done] Email Pricing (Daily + Custom)
- [done] Commission Module
- [done] Contract Confirmation Summary
- [done] Billing Extract
- [done] Collections

---

## Risk & Portfolio Module - Built This Session

### Files Created

```
Backend:
  routers/portfolio.py
  controllers/portfolio.py
  routers/hedging.py
  controllers/hedging.py
  routers/dam.py
  controllers/dam.py

Frontend:
  pages/portfolio/index.tsx      -> Portfolio home
  pages/portfolio/position.tsx   -> Position screen
  pages/portfolio/hedging.tsx    -> Hedge book
  pages/portfolio/dam.tsx        -> DAM purchases

Scripts:
  ingest_ercot_settlement.py     -> Loads ERCOT settlement ZIPs
  forecast_analog.py             -> Analog day forecast
  forecast_vs_actual.py          -> Forecast accuracy testing
  forecast_today.py              -> Daily forecast
```

Also present (not listed above): routers/mtm.py, controllers/mtm.py, controllers/risk.py, routers for risk, ercot_market and monitoring (see main.py), and monitoring/checkpoint_runner.py.

### main.py router registrations (already in place):

```python
from routers.portfolio import router as portfolio_router
from routers.hedging import router as hedging_router
from routers.dam import router as dam_router
app.include_router(portfolio_router, prefix="/api")
app.include_router(hedging_router, prefix="/api")
app.include_router(dam_router, prefix="/api")
```

Routers are registered in main.py behind the portfolio module gate. main.py also registers the mtm, risk, ercot_market, monitoring and admin_portfolio_contracts routers.

---

## Data Layer - All Tables

### Already Built (ERCOT Load Data)

Row counts below are historical snapshots: UNVERIFIED (needs live server or browser).

- **ercot_load_history**: 98,591 rows, 2015-2026, hourly actuals by 8 weather zones
- **ercot_lfc_history**: filled by the LFC scraper; originally 249,983 rows (Dec 2018-Dec 2021), now runs to 2026 (256,103 rows through 2026-09-02 on the local DB; counts change daily)
- **weather_history**: 1,069,248 rows, 2011-2026 Mar, hourly temp/humidity/wind by zone
- **ercot_holidays**: 325 records, 2011-2035
- **ercot_load_patterns**: 18,240 patterns with outlier detection
- **ercot_black_swan_events**: 9,656 rows

### Portfolio & Hedging Tables

hedge_book and dam_purchases column lists and ENUMs: UNVERIFIED (needs live server or browser) (schemas not re-read by the audit).

- **portfolio_view**: MariaDB VIEW on portfolio_contracts (migrations 048/051); status is active / expired / future
  - Extracts: zone (settlement, 4 zones), weather_zone (8 zones), contract_type, status
  - Weather zones (DB names): COAST=HOUSTON; EAST, NORTH, NORTH_CENTRAL=NORTH; SOUTH_CENTRAL, SOUTHERN=SOUTH; FAR_WEST, WEST=WEST (NCENT/SCENT/FWEST are not the DB names)
  - Collation fix: connect_args={"charset": "utf8mb4"} in utils/database.py

- **hedge_book**: Forward purchases
  - deal_number (UNIQUE, mandatory), trade_date, delivery_start, delivery_end
  - block_type ENUM('7x8','7x16','5x16','7x24','HOURLY')
  - zone VARCHAR(20), location VARCHAR(30) - location = HB_NORTH, LZ_HOUSTON etc
  - volume_mw, price, instrument_type ENUM('FIXED','HEAT_RATE','GAS_BASIS','INDEX')
  - hr_value, gas_price, counterparty, source ENUM('ICE','BILATERAL','NYMEX')

- **dam_purchases**: Daily DAM cleared prices
  - oper_date, hour_ending, zone, location VARCHAR(30)
  - volume_mw, dam_price, deal_number, counterparty
  - buy_sell ENUM('Buy','Sell'), source ENUM('MANUAL','MIS_AUTO')
  - UNIQUE KEY (oper_date, hour_ending, location)

### ERCOT Settlement Tables (Built This Session)

Code names, repcode 244 / qsecode 19 and the 1,109-rows-per-day figure below: UNVERIFIED (needs live server or browser) (settlement tables are not in the local DB).

- **ercot_daioutputheader**: REP-specific load codes dictionary
  - Key columns: uiddaioutputheader, saverecorder, repcode, qsecode, oper_date, settlement_run
  - POSTEDAML*244_19_LZ*\* = Load with losses by zone (spi=900, 15-min)
  - HLREPUFE_244_19 = Hourly total (spi=3600)
  - LREPUFE_244_19 = 15-min total (spi=900)
  - Acts as REP-specific dictionary - new rows upserted when new saverecorder appears
  - repcode = '244', qsecode = '19' for AmeriPower

- **ercot_daioutputinterval**: Actual load data
  - uiddaioutputheader, oper_date, settlement_run, spi, total, int001-int096
  - spi=900 -> 96 x 15-min intervals (POSTEDAML zones) - aggregate 4 per hour
  - spi=3600 -> 24 hourly intervals (HLREPUFE total)
  - Join to header via uiddaioutputheader + oper_date + settlement_run

- **ercot_llsoutputheader**: Granular load by profile/zone/loss class
  - repcode, qsecode, uidsetlpoint, profilecode, losscode, method
  - LSEGUNADJ\_\* = Load without losses (unadjusted)
  - 1,109 rows per operating day per REP

- **ercot_llsoutputinterval**: Granular interval data
  - Same structure as daioutputinterval
  - 1,109 rows x 96 intervals = 106,464 values per day

### Settlement Run Types

Timing below is the ERCOT calendar, not code: UNVERIFIED (needs live server or browser).

```
RTM_INITIAL  -> ~2 days after operating day
RTM_FINAL2   -> ~55 days after (replaces initial)
RTM_TRUEUP3  -> ~180 days after (final true-up)
Upsert logic: same oper_date + settlement_run = UPDATE not INSERT
```

### Portfolio load tables (BUILT - the SQL below is the original sketch, NOT the current schema)

Tables 1 and 2 exist and are populated by process_settlement.py. Actual schema: interval_ending (1-96) instead of hour_ending, no source column; unique key (oper_date, interval_ending, settlement_zone, settlement_run). Table 3 (smt_interval_data) is still planned: UNVERIFIED (needs live server or browser).

```sql
-- 1. Load with losses (pre-processed for position screen)
CREATE TABLE portfolio_load_with_losses (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    oper_date       DATE NOT NULL,
    hour_ending     TINYINT NOT NULL,
    settlement_zone VARCHAR(20) NOT NULL,
    mwh             DECIMAL(18,6) NOT NULL,
    settlement_run  VARCHAR(20) NOT NULL,
    source          VARCHAR(50),
    loaded_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_load (oper_date, hour_ending, settlement_zone, settlement_run),
    INDEX idx_date_zone (oper_date, settlement_zone)
);
-- Populated from: POSTEDAML_* rows in daioutputheader/interval
-- 15-min (spi=900) aggregated to hourly (sum 4 intervals per hour)

-- 2. Load unadjusted (pre-processed for position screen)
CREATE TABLE portfolio_load_unadjusted (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    oper_date       DATE NOT NULL,
    hour_ending     TINYINT NOT NULL,
    settlement_zone VARCHAR(20) NOT NULL,
    mwh             DECIMAL(18,6) NOT NULL,
    settlement_run  VARCHAR(20) NOT NULL,
    source          VARCHAR(50),
    loaded_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_load (oper_date, hour_ending, settlement_zone, settlement_run),
    INDEX idx_date_zone (oper_date, settlement_zone)
);
-- Populated from: LSEGUNADJ_* rows in llsoutputheader/interval

-- 3. SMT interval data
CREATE TABLE smt_interval_data (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    esid            VARCHAR(30) NOT NULL,
    interval_start  DATETIME NOT NULL,
    interval_end    DATETIME NOT NULL,
    kwh             DECIMAL(12,6) NOT NULL,
    source          ENUM('SMT_API','SMT_FILE','MANUAL') DEFAULT 'SMT_API',
    loaded_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_esid_interval (esid, interval_start),
    INDEX idx_esid (esid),
    INDEX idx_start (interval_start)
);
```

---

## ERCOT Market Structure

### Settlement Zones (4) - Used in position screen

```
HOUSTON  -> COAST weather zone
NORTH    -> EAST + NORTH + NORTH_CENTRAL weather zones
SOUTH    -> SOUTH_CENTRAL + SOUTHERN weather zones
WEST     -> FAR_WEST + WEST weather zones
```

### Locations (8) - Critical for settlement

```
HB_HOUSTON, HB_NORTH, HB_SOUTH, HB_WEST  -> Hub (basis risk)
LZ_HOUSTON, LZ_NORTH, LZ_SOUTH, LZ_WEST  -> Load Zone (no basis risk)

HB = financial hedge, settles at RTM Hub price + basis
LZ = physical delivery, settles at RTM Load Zone price
Basis = LZ price - HB price
```

### Power Blocks

```
7x16  = HE07-HE22, 7 days (on-peak)
7x8   = HE01-06 + HE23-24, 7 days (off-peak)
5x16  = HE07-HE22, Mon-Fri (weekday peak)
2x16  = HE07-HE22, Sat + Sun + FULL holidays (weekend peak)
7x24  = All 24 hours, 7 days (around the clock)
HOURLY = Individual hour entry
```

---

## Position Screen Architecture

### Load Data Flow (CORRECT)

```
ERCOT ZIP arrives
  -> ingest_ercot_settlement.py
  -> stores as-is in ercot_daioutputheader/interval

process_settlement.py (built; --backfill processes all unprocessed dates):
  -> filters POSTEDAML_* from header
  -> joins to interval table
  -> aggregates 96 x 15-min to 24 hourly
  -> saves to portfolio_load_with_losses

  -> filters LSEGUNADJ_* from llsheader
  -> joins to llsinterval
  -> saves to portfolio_load_unadjusted

Position screen queries:
  -> portfolio_load_with_losses for "Actual (With Losses)"
  -> portfolio_load_unadjusted for "Actual (Unadjusted)"
  -> Shows zeros if no data (NO fallback to patterns)
```

### repcode is DYNAMIC (never hardcoded)

```python
rep_result = await db.execute(
    "SELECT DISTINCT repcode, qsecode FROM ercot_daioutputheader LIMIT 1"
)
repcode = rep_row[0]  # '244' for AmeriPower
qsecode = rep_row[1]  # '19'
recorder = f"POSTEDAML_{repcode}_{qsecode}_LZ_{zone}"
```

### 15-min to hourly aggregation

```python
# spi=900 -> 96 intervals -> sum groups of 4 per hour
for he in range(24):
    hour_mwh = sum(intervals_15min[he*4:(he*4)+4])
```

### Forecast and actual load types share one position endpoint

- /api/portfolio/position routes forecast types (ERCOT Shape, DNA) and actual types (With Losses, Unadjusted) through the same screen and Hour Blocks tab
- Actual types show real data only (actuals or zeros)
- No ERCOT patterns in position screen
- ERCOT patterns = full system load (~50,000 MW), not portfolio load (~60 MW)
- Forecast types are selected on the same position screen

---

## Forecasting Engine

### Analog Day Method (accuracy claim 95-97%: UNVERIFIED (needs live server or browser); scripts only, not used by the position endpoint)

```
Base = last known same-day-of-week actual
Find weather-similar days in last 12 months
swing = analog_actual / base_actual
forecast = base x avg_swing
Tested Apr 16 2026: -2.5% avg error (1 year growth gap)
```

### ERCOT Growth Context

External facts below: UNVERIFIED (needs live server or browser).

- 2016 LTDEF predicted 1.1% AAGR - actual was 4-5%
- EIA projects 10% AAGR 2025-2027
- Driver: data centers (77% of interconnection queue)
- NCENT/NORTH growing fastest
- Overnight floor much higher post-2022 (data centers = 24/7 flat load)

---

## Hedging Module

### Business Rules

- Deal number MANDATORY
- Location drives zone (LOCATION_TO_ZONE mapping)
- HB vs LZ critical for MTM basis calculation
- 2 decimal places display

### LOCATION_TO_ZONE

Hedging controller not re-read by the audit: UNVERIFIED (needs live server or browser); current code may use utils/zone_mapping.py.

```python
{
    "HB_HOUSTON": "HOUSTON", "HB_NORTH": "NORTH",
    "HB_SOUTH"  : "SOUTH",   "HB_WEST" : "WEST",
    "LZ_HOUSTON": "HOUSTON", "LZ_NORTH": "NORTH",
    "LZ_SOUTH"  : "SOUTH",   "LZ_WEST" : "WEST",
}
```

---

## DAM Purchases Module

### DAM Spreadsheet Format (internal)

Format not re-read by the audit: UNVERIFIED (needs live server or browser).

```
Two rows per deal:
Row 1: QSE/REP | Deal Name | HE01-HE24 volumes | Counterparty | Buy/Sell | Location
Row 2: Prices: |            | prices per hour
Locations: HB_NORTH, HB_HOUSTON, LZ_NORTH, LZ_HOUSTON, LZ_SOUTH, LZ_WEST
```

---

## ERCOT Settlement Ingestion

### ingest_ercot_settlement.py

Script exists; usage below not run by the audit: UNVERIFIED (needs live server or browser).

```bash
python ingest_ercot_settlement.py "path/to/file.zip"
python ingest_ercot_settlement.py "C:\ERCOT\settlements\"
```

Loads: DAIOUTPUTHEADER, DAIOUTPUTINTERVAL, LLSOUTPUTHEADER, LLSOUTPUTINTERVAL
Skips: DAM/RTM/AGG/CRR files (for settlement calculation later)

---

## ERCOT Code Dictionary

- **ercot_bill_determinant**: 779 codes (SQL file generated); table is not in the local DB: UNVERIFIED (needs live server or browser)
- Two dictionaries:
  1. REP-specific: ercot_daioutputheader (built [done])
  2. General market: ercot_market_codes (DAM/RTM/AGG) - to build (not in the local DB: UNVERIFIED (needs live server or browser))

---

## DB Collation Fix

The utils/database.py setting below was not re-read by the audit: UNVERIFIED (needs live server or browser).

```python
# utils/database.py
engine = create_async_engine(
    DATABASE_URL, echo=False, pool_pre_ping=True,
    connect_args={"charset": "utf8mb4"}
)
# In queries use: CONVERT(column USING utf8mb4) = 'value'
```

---

## Portfolio Contracts: Future, Dates, Mix, Annual MWh (added 2026-10-07)

Source of truth: docs/PORTFOLIO_CONTRACTS.md. Items below were checked against code (VERIFIED) unless labelled.

- **Future contracts shown separately.** A Future-type contract that has not started yet (start date after today) is shown as its own line ("Future contracts (not yet started): N") on /portfolio and as a row on the zone cards. It is excluded from Total customers, per-zone customers, usage, First Expiry, Portfolio Horizon and the zone count. The summary field is future_customers.
- **Portfolio upload dates are m/d/Y only.** Start date and end date accept month/day/year (12/31/2027, 3/4/2027). ISO (2027-12-31) and other formats are rejected with a plain-language message. The contract_renewal upload is unchanged.
- **Contract Mix.** It counts Future contracts by contract type, so it includes Future meters that have already started. future_customers counts only Future meters that start after today. The two numbers can differ.
- **Annual MWh is never prorated.** The full 12-month figure is used for any contract whose dates overlap the year; no script divides by days or prorates by start or end month (overlap-based).
- **ERCOT Shape forecast is per day.** get_forecast_data counts a meter from its start date through its end date, both inclusive; a missing start date means from the first day of the window.
- **Open position is not per day.** get_open_position reads portfolio_view: status active and end date today or later. It does not read the forecast tables. (Owner rule R6 still to confirm.)
- **DNA forecast: owner decision pending.** Current behaviour: get_dna_forecast_data works per year using portfolio_load_annual / ERCOT year total, with no per-customer or per-date filtering. The three DNA tables are refreshed only by hand-run scripts, and the forecast returns zeros when they are empty.
- **Risk scores: owner decision pending.** controllers/risk.py exists (position 40, price 25, customer 20, weather 15). Its position score reads the forecast totals for four horizons from get_forecast_data, so the per-day forecast change can move scores. The size of the shift has not been measured.
- **Schedules.** pm2 jobs (LFC scraper, monitoring checkpoints, reconcile) are configured in the repo; whether they run on the VPS is UNVERIFIED (needs live server or browser).

---

## Next Steps (In Order)

1. DONE - portfolio_load_with_losses + portfolio_load_unadjusted tables built
2. DONE - process_settlement.py populates them from daioutputheader/interval
3. DONE - position screen reads these tables
4. DONE - forecast types on the position screen (ERCOT Shape, DNA); Minimum/Maximum/Bands/What-If are not implemented
5. DONE - MTM engine (controllers/mtm.py, routers/mtm.py, pages/portfolio/mtm.tsx)
6. Risk scoring exists (controllers/risk.py; position 40, price 25, customer 20, weather 15); black-swan detection is separate
7. **Settlement reconciliation** - 3-way match (ERCOT vs supplier vs system)
8. **ERCOT MIS + SMT integration** - automated daily data pull
9. **AI Agent home page**
10. DONE (as deployment-per-tenant) - each tenant is its own deployment with its own DB, fixed by DB_NAME in api/utils/database.py and created by api/scripts/provision_tenant.py. Per-request routing (api/middleware/tenant.py TenantMiddleware, api/utils/master_db.py) exists but is not added to main.py
