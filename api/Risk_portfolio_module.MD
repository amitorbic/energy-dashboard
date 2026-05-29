# AmeriPower — Risk & Portfolio Module Context

## Last Updated: April 2026

## System Overview

- **Stack**: FastAPI + SQLAlchemy async + MySQL (aiomysql) on port 8001
- **Frontend**: Next.js + TypeScript + Tailwind on port 3000
- **DB**: u972964962_orbic (MariaDB)
- **All routes registered under `/api` prefix in `main.py`**
- **Architecture**: Single REP (AmeriPower) now — multi-tenant DB routing planned for future REPs

## Multi-Tenant Architecture (Planned)

```
Master DB → reps table (rep_id, company_name, db_name)
Each REP → own DB (identical table structure)
Like a washing machine — same machine, everyone's own load
Build routing middleware when onboarding second REP
```

---

## Modules Already Built (Pre-Session)

- ✅ Daily Pricing Matrix
- ✅ Custom Pricing (B&E, MSP, Sample Bill)
- ✅ Broker Database
- ✅ Email Pricing (Daily + Custom)
- ✅ Commission Module
- ✅ Contract Confirmation Summary
- ✅ Billing Extract
- ✅ Collections

---

## Risk & Portfolio Module — Built This Session

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
  pages/portfolio/index.tsx      → Portfolio home
  pages/portfolio/position.tsx   → Position screen
  pages/portfolio/hedging.tsx    → Hedge book
  pages/portfolio/dam.tsx        → DAM purchases

Scripts:
  ingest_ercot_settlement.py     → Loads ERCOT settlement ZIPs
  forecast_analog.py             → Analog day forecast
  forecast_vs_actual.py          → Forecast accuracy testing
  forecast_today.py              → Daily forecast
```

### main.py additions needed:

```python
from routers.portfolio import router as portfolio_router
from routers.hedging import router as hedging_router
from routers.dam import router as dam_router
app.include_router(portfolio_router, prefix="/api")
app.include_router(hedging_router, prefix="/api")
app.include_router(dam_router, prefix="/api")
```

---

## Data Layer — All Tables

### Already Built (ERCOT Load Data)

- **ercot_load_history**: 98,591 rows, 2015-2026, hourly actuals by 8 weather zones
- **ercot_lfc_history**: 249,983 rows, Dec 2018-Dec 2021, daily LFC forecast
- **weather_history**: 1,069,248 rows, 2011-2026 Mar, hourly temp/humidity/wind by zone
- **ercot_holidays**: 325 records, 2011-2035
- **ercot_load_patterns**: 18,240 patterns with outlier detection
- **ercot_black_swan_events**: 9,656 rows

### Portfolio & Hedging Tables

- **portfolio_view**: MariaDB VIEW on contract_renewal
  - Extracts: zone (settlement, 4 zones), weather_zone (8 zones), contract_type, status
  - Settlement zones: COAST=HOUSTON, NCENT+NORTH+EAST=NORTH, SCENT+SOUTH=SOUTH, FWEST+WEST=WEST
  - Collation fix: connect_args={"charset": "utf8mb4"} in utils/database.py

- **hedge_book**: Forward purchases
  - deal_number (UNIQUE, mandatory), trade_date, delivery_start, delivery_end
  - block_type ENUM('7x8','7x16','5x16','7x24','HOURLY')
  - zone VARCHAR(20), location VARCHAR(30) — location = HB_NORTH, LZ_HOUSTON etc
  - volume_mw, price, instrument_type ENUM('FIXED','HEAT_RATE','GAS_BASIS','INDEX')
  - hr_value, gas_price, counterparty, source ENUM('ICE','BILATERAL','NYMEX')

- **dam_purchases**: Daily DAM cleared prices
  - oper_date, hour_ending, zone, location VARCHAR(30)
  - volume_mw, dam_price, deal_number, counterparty
  - buy_sell ENUM('Buy','Sell'), source ENUM('MANUAL','MIS_AUTO')
  - UNIQUE KEY (oper_date, hour_ending, location)

### ERCOT Settlement Tables (Built This Session)

- **ercot_daioutputheader**: REP-specific load codes dictionary
  - Key columns: uiddaioutputheader, saverecorder, repcode, qsecode, oper_date, settlement_run
  - POSTEDAML*244_19_LZ*\* = Load with losses by zone (spi=900, 15-min)
  - HLREPUFE_244_19 = Hourly total (spi=3600)
  - LREPUFE_244_19 = 15-min total (spi=900)
  - Acts as REP-specific dictionary — new rows upserted when new saverecorder appears
  - repcode = '244', qsecode = '19' for AmeriPower

- **ercot_daioutputinterval**: Actual load data
  - uiddaioutputheader, oper_date, settlement_run, spi, total, int001-int096
  - spi=900 → 96 x 15-min intervals (POSTEDAML zones) — aggregate 4 per hour
  - spi=3600 → 24 hourly intervals (HLREPUFE total)
  - Join to header via uiddaioutputheader + oper_date + settlement_run

- **ercot_llsoutputheader**: Granular load by profile/zone/loss class
  - repcode, qsecode, uidsetlpoint, profilecode, losscode, method
  - LSEGUFE\_\* = Load without losses (unadjusted)
  - 1,109 rows per operating day per REP

- **ercot_llsoutputinterval**: Granular interval data
  - Same structure as daioutputinterval
  - 1,109 rows x 96 intervals = 106,464 values per day

### Settlement Run Types

```
RTM_INITIAL  → ~2 days after operating day
RTM_FINAL2   → ~55 days after (replaces initial)
RTM_TRUEUP3  → ~180 days after (final true-up)
Upsert logic: same oper_date + settlement_run = UPDATE not INSERT
```

### Tables To Build Next (PRIORITY)

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
-- Populated from: LSEGUFE_* rows in llsoutputheader/interval

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

### Settlement Zones (4) — Used in position screen

```
HOUSTON  → COAST weather zone
NORTH    → NCENT + NORTH + EAST weather zones
SOUTH    → SCENT + SOUTH weather zones
WEST     → FWEST + WEST weather zones
```

### Locations (8) — Critical for settlement

```
HB_HOUSTON, HB_NORTH, HB_SOUTH, HB_WEST  → Hub (basis risk)
LZ_HOUSTON, LZ_NORTH, LZ_SOUTH, LZ_WEST  → Load Zone (no basis risk)

HB = financial hedge, settles at RTM Hub price + basis
LZ = physical delivery, settles at RTM Load Zone price
Basis = LZ price - HB price
```

### Power Blocks

```
7x16  = HE07-HE22, 7 days (on-peak)
7x8   = HE01-06 + HE23-24, 7 days (off-peak)
5x16  = HE07-HE22, Mon-Fri (weekday peak)
7x24  = All 24 hours, 7 days (around the clock)
HOURLY = Individual hour entry
```

---

## Position Screen Architecture

### Load Data Flow (CORRECT)

```
ERCOT ZIP arrives
  → ingest_ercot_settlement.py
  → stores as-is in ercot_daioutputheader/interval

Processing script (to build):
  → filters POSTEDAML_* from header
  → joins to interval table
  → aggregates 96 x 15-min to 24 hourly
  → saves to portfolio_load_with_losses

  → filters LSEGUFE_* from llsheader
  → joins to llsinterval
  → saves to portfolio_load_unadjusted

Position screen queries:
  → portfolio_load_with_losses for "Actual (With Losses)"
  → portfolio_load_unadjusted for "Actual (Unadjusted)"
  → Shows zeros if no data (NO fallback to patterns)
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
# spi=900 → 96 intervals → sum groups of 4 per hour
for he in range(24):
    hour_mwh = sum(intervals_15min[he*4:(he*4)+4])
```

### Forecast interface is SEPARATE from position screen

- Position screen = real data only (actuals or zeros)
- No ERCOT patterns in position screen
- ERCOT patterns = full system load (~50,000 MW), not portfolio load (~60 MW)
- Forecast gets own dedicated interface

---

## Forecasting Engine

### Analog Day Method (PROVEN 95-97% accurate)

```
Base = last known same-day-of-week actual
Find weather-similar days in last 12 months
swing = analog_actual / base_actual
forecast = base × avg_swing
Tested Apr 16 2026: -2.5% avg error (1 year growth gap)
```

### ERCOT Growth Context

- 2016 LTDEF predicted 1.1% AAGR — actual was 4-5%
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

```
Two rows per deal:
Row 1: QSE/REP | Deal Name | HE01-HE24 volumes | Counterparty | Buy/Sell | Location
Row 2: Prices: |            | prices per hour
Locations: HB_NORTH, HB_HOUSTON, LZ_NORTH, LZ_HOUSTON, LZ_SOUTH, LZ_WEST
```

---

## ERCOT Settlement Ingestion

### ingest_ercot_settlement.py

```bash
python ingest_ercot_settlement.py "path/to/file.zip"
python ingest_ercot_settlement.py "C:\ERCOT\settlements\"
```

Loads: DAIOUTPUTHEADER, DAIOUTPUTINTERVAL, LLSOUTPUTHEADER, LLSOUTPUTINTERVAL
Skips: DAM/RTM/AGG/CRR files (for settlement calculation later)

---

## ERCOT Code Dictionary

- **ercot_bill_determinant**: 779 codes (SQL file generated)
- Two dictionaries:
  1. REP-specific: ercot_daioutputheader (built ✅)
  2. General market: ercot_market_codes (DAM/RTM/AGG) — to build

---

## DB Collation Fix

```python
# utils/database.py
engine = create_async_engine(
    DATABASE_URL, echo=False, pool_pre_ping=True,
    connect_args={"charset": "utf8mb4"}
)
# In queries use: CONVERT(column USING utf8mb4) = 'value'
```

---

## Next Steps (In Order)

1. **Build portfolio_load_with_losses + portfolio_load_unadjusted tables**
2. **Build processing script** to populate them from daioutputheader/interval
3. **Wire position screen** to query these tables directly
4. **Build forecast interface** (separate from position screen)
5. **MTM engine** — market price vs buy price, basis adjustment for HB
6. **Risk assessment** — black swan detection, short/long term scoring
7. **Settlement reconciliation** — 3-way match (ERCOT vs supplier vs system)
8. **ERCOT MIS + SMT integration** — automated daily data pull
9. **AI Agent home page**
10. **Multi-tenant DB routing** — when onboarding second REP
