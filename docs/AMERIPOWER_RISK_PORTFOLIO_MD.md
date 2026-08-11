# AmeriPower — Risk & Portfolio Module Context

## Last Updated: August 2026

## System Overview

- **Stack**: FastAPI + SQLAlchemy async + MySQL (aiomysql) on port 8001
- **Frontend**: Next.js + TypeScript + Tailwind on port 3000
- **DB**: u972964962_orbic (MariaDB)
- **All routes registered under `/api` prefix in `main.py`**
- **Architecture**: SaaS platform for any REP — no hardcoded company names
- **Multi-tenant DB routing planned for future REPs**

## Multi-Tenant Architecture (Planned)

```
Master DB → reps table (rep_id, company_name, db_name)
Each REP → own DB (identical table structure)
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
- ✅ Enrollment Engine

---

## Risk & Portfolio Module

### Files Created

```
Backend:
  routers/portfolio.py
  controllers/portfolio.py
  routers/hedging.py
  controllers/hedging.py
  routers/dam.py
  controllers/dam.py
  routers/mtm.py                     ← NEW
  controllers/mtm.py                 ← NEW

Frontend:
  pages/portfolio/index.tsx          → Portfolio home
  pages/portfolio/position.tsx       → Position screen + Hour Blocks tab
  pages/portfolio/hedging.tsx        → Hedge book
  pages/portfolio/dam.tsx            → DAM purchases
  pages/portfolio/mtm.tsx            → Mark-to-Market ← NEW

Scripts:
  ingest_ercot_settlement.py         → Loads ERCOT settlement ZIPs
  process_settlement.py              → Processes settlement → portfolio_load tables
                                       --backfill flag for unprocessed dates
  ingest_ercot_forecast.py           → Loads ERCOT 20-25yr forecast CSVs
  calculate_ercot_shape.py           → Calculates shape factors from forecast
  populate_customer_forecast_dates.py → Derives forecast table from contract_renewal
  populate_portfolio_load_annual.py   → Annual MWh by zone for DNA forecast
  build_layer1_dna.py                → Builds DNA baseline from ercot_load_history
  build_layer2_growth.py             → Calculates growth factors from ERCOT forecast
  ingest_load.py                     → Loads ERCOT native load Excel files
  forecast_analog.py                 → Analog day forecast
  forecast_vs_actual.py              → Forecast accuracy testing
  forecast_today.py                  → Daily forecast

Utils:
  utils/zone_mapping.py              → Single source of truth for zone mapping
```

### main.py router registrations:

```python
from routers.portfolio import router as portfolio_router
from routers.hedging import router as hedging_router
from routers.dam import router as dam_router
from routers.mtm import router as mtm_router
app.include_router(portfolio_router, prefix="/api")
app.include_router(hedging_router, prefix="/api")
app.include_router(dam_router, prefix="/api")
app.include_router(mtm_router, prefix="/api")
```

---

## Data Layer — All Tables

### ERCOT Load Data

- **ercot_load_history**: ~98,591 rows, 2015-2026 Mar, hourly actuals by 8 weather zones
  - Columns: oper_date, hour_ending, dst_flag, coast, east, far_west, north, north_central, south_central, southern, west, ercot_total
  - UNIQUE KEY on (oper_date, hour_ending, dst_flag)
  - dst_flag='Y' for repeated DST hour (fall back)
  - Source: Excel files via ingest_load.py

- **ercot_lfc_history**: 249,983 rows, Dec 2018-Dec 2021, ERCOT week-ahead LFC forecast
  - Columns: publish_date, publish_time, delivery_date, hour_ending, coast, east, far_west, north, north_central, south_central, southern, west, system_total, dst_flag

- **weather_history**: 1,069,248 rows, 2011-2026 Mar, hourly temp/humidity/wind by zone
- **ercot_holidays**: 325 records, 2011-2035
- **ercot_load_patterns**: 18,240 patterns with outlier detection
- **ercot_black_swan_events**: 9,656 rows

### Portfolio & Hedging Tables

- **portfolio_view**: MariaDB VIEW on contract_renewal
- **hedge_book**: Forward purchases
  - Columns: deal_number, trade_date, delivery_start, delivery_end, block_type, zone, location, volume_mw, price, instrument_type, hr_value, gas_price, counterparty, source
  - instrument_type: FIXED, HEAT_RATE, GAS_BASIS, INDEX
  - location: HB*\* = hub (basis risk), LZ*\* = load zone (no basis risk)
- **dam_purchases**: Daily DAM cleared prices

### ERCOT Settlement Tables

- **ercot_daioutputheader**: REP-specific load codes dictionary
- **ercot_daioutputinterval**: Actual load data (96 x 15-min intervals)
- **ercot_llsoutputheader**: Granular load by profile/zone/loss class
- **ercot_llsoutputinterval**: Granular interval data

### Portfolio Load Tables (Pre-processed)

- **portfolio_load_with_losses**: 96 x 15-min intervals per zone per day
  - Columns: oper_date, interval_ending (1-96), settlement_zone, mwh, settlement_run
  - Source: POSTEDAML\_\* from daioutputheader/interval
  - UNIQUE KEY on (oper_date, interval_ending, settlement_zone, settlement_run)

- **portfolio_load_unadjusted**: Same structure as with_losses
  - Source: LSEGUNADJ\_\* from llsoutputheader/interval

### ERCOT Forecast Tables

- **ercot_forecast_weatherzone**: Raw ERCOT 20-25yr forecast, 8 weather zones, hourly
  - Columns: oper_date, year, month, day, hour, coast_net, east_net, fwest_net, ncent_net, north_net, scent_net, south_net, west_net, ercot_net

- **ercot_forecast_loadzone**: Raw ERCOT 20-25yr forecast, 4 load zones, hourly
  - Columns: oper_date, year, month, day, hour, houston, north, south, west, ercot_net

- **ercot_shape_weatherzone**: Shape factors per weather zone
  - monthly_shape = month_total / annual_total
  - daily_shape = day_total / month_total
  - hourly_shape = hour_value / day_total

- **ercot_shape_loadzone**: Shape factors per load zone (same structure)

### Forecast Engine Tables

- **forecast_baseline_dna**: Layer 1 — Typical year DNA from 12yr history
  - Columns: weather_zone, month, day_of_week (0=Mon), hour_ending, avg_load, std_dev, sample_count, outliers_removed
  - 2,016 combinations per zone (12 × 7 × 24)
  - Outliers removed: >3 std dev from mean

- **forecast_growth_factors**: Layer 2 — ERCOT growth multipliers
  - Columns: load_zone, forecast_year, base_year (2025), base_total, year_total, growth_factor
  - growth_factor = year_total / base_2025_total
  - 20 years × 4 zones = 80 rows

- **forecast_modifiers**: Layer 3 — Seasonal adjustments (to build)

### Customer Forecast Tables

- **customer_forecast_dates**: Derived from contract_renewal
  - Columns: esid, contract_end_date, forecast_end_date, load_profile, annual_kwh, load_zone, weather_zone
  - forecast_end_date rule: future dates kept as-is, expired/null → today + 15 days
  - Refreshed every time contract_renewal is updated

- **future_forecast_dates**: Future customers from contract_confirm
  - Columns: esid, forecast_start_date, forecast_end_date, load_profile, annual_kwh, load_zone, weather_zone, source

- **portfolio_load_annual**: Annual MWh by load zone for DNA forecast
  - Columns: year, load_zone, annual_mwh, source
  - 2024: backcasted from ercot_load_history ratios
  - 2025: directly from customer_forecast_dates
  - 2026+: customer_forecast_dates filtered by year

### Zone Mapping Table

- **weather_to_load_zone**: Single source of truth for zone mapping
  - COAST → HOUSTON
  - EAST, NORTH, NORTH_CENTRAL → NORTH
  - SCENT, SOUTH_CENTRAL, SOUTHERN → SOUTH
  - FAR_WEST, WEST → WEST

### MTM Tables ← NEW

- **market_prices**: Manual/API market price entry
  - Columns: id, price_date, hour_ending (0=flat/all-day), location, price, source (MANUAL/API), loaded_at
  - UNIQUE KEY on (price_date, hour_ending, location)
  - Locations: HB*\*, LZ*\*, HH (Henry Hub for gas)
  - source: MANUAL now, API endpoint ready for future price feeds

- **mtm_results**: Calculated MTM per deal
  - Columns: id, calc_date, deal_number, instrument_type, location, zone, volume_mw, deal_price, market_price, basis, gas_price_current, mtm_value, delivery_start, delivery_end, calculated_at
  - UNIQUE KEY on (calc_date, deal_number)

### SMT Table (Planned)

- **smt_interval_data**: ESI-level 15-min interval data

---

## Zone Mapping

### Weather Zones (8) → Settlement/Load Zones (4)

```
COAST                              → HOUSTON
EAST + NORTH + NORTH_CENTRAL       → NORTH
SOUTH_CENTRAL + SOUTHERN           → SOUTH
FAR_WEST + WEST                    → WEST
```

**CRITICAL**: Always use `utils/zone_mapping.py` — never hardcode zone mappings.

```python
from utils.zone_mapping import weather_to_load, get_weather_zones_for_load
from utils.zone_mapping import DB_COL_TO_ZONE, get_load_zones
```

---

## Position Screen Architecture

### Load Types Available

```
ERCOT Shape Forecast  → get_forecast_data()       — ERCOT LT shape × customer annual MWh
DNA Forecast          → get_dna_forecast_data()   — 12yr DNA × customer share of ERCOT
Minimum Forecast      → TBD
Maximum Forecast      → TBD
Forecast Bands        → TBD
What-If Forecast      → TBD
Actual (With Losses)  → get_position_data()       — portfolio_load_with_losses
Actual (Unadjusted)   → get_position_data()       — portfolio_load_unadjusted
```

### Position Screen Features

- **Two tabs**: Position Screen | Hour Blocks
- **Position Screen tab**: hourly/daily/monthly/15-min grid + recharts graph (Bar/Line toggle, scrollable)
- **Hour Blocks tab**: block type selector (7x16/5x16/2x16/7x8/7x24) + forecast type selector + scrollable bar/line chart + hourly shape table
- **ActualLoadSection**: appears below grid for Actual load types, shows 24 hourly aggregated values (96 intervals → 24 hours)
- **Graph**: Supply vs Load chart with Bar/Line toggle, horizontally scrollable
- **Sticky Name column**: dark bg-slate-900, white text, z-index correct

### ERCOT Shape Forecast Logic

```
1. Query customer_forecast_dates (+ future_forecast_dates) filtered by forecast_date
2. Sum annual_kwh / 1000 per load_zone → zone_annual_mwh
3. Fetch shape factors from ercot_shape_loadzone for date range
4. hourly_mwh = annual_mwh × monthly_shape × daily_shape × hourly_shape
5. 15-min = hourly / 4
```

### DNA Forecast Logic

```
Layer 1 — DNA baseline (forecast_baseline_dna)
  avg_load = historical average for (weather_zone, month, dow, hour)
  Outliers removed: >3 std dev

Layer 2 — Growth (implicit via customer_share)
  customer_share = portfolio_annual_mwh / ercot_year_total
  Both numerator and denominator are year-specific

Formula:
  hourly_mwh = dna_avg_load × customer_share
  (sum weather zones → load zone before multiplying)

Customer filtering:
  Active = forecast_end_date >= forecast_date (per customer)
  Future = forecast_start_date <= forecast_date AND forecast_end_date >= forecast_date
```

### Hour Blocks Logic

```
Purpose: Help traders decide which power block to buy for hedging
Shows: Hourly shape within the selected block

Block definitions:
  7x16 = HE07-HE22, all 7 days
  5x16 = HE07-HE22, Mon-Fri excluding holidays (ercot_holidays table)
  2x16 = HE07-HE22, Sat + Sun + holidays
  7x8  = HE01-06 + HE23-24, all 7 days
  7x24 = all 24 hours, 7 days

Output per hour:
  Load MW | Supply MW | Net MW

Summary:
  Min MW = max flat block you can buy
  Max MW = peak hour
  Avg MW = average across block hours

Forecast types: Same as position screen (ERCOT Shape, DNA, etc.)
```

### Actual Load Data Flow

```
ERCOT ZIP arrives
  → ingest_ercot_settlement.py
  → stores as-is in ercot_daioutputheader/interval

process_settlement.py:
  → filters POSTEDAML_* → stores 96 intervals → portfolio_load_with_losses
  → filters LSEGUNADJ_* → stores 96 intervals → portfolio_load_unadjusted
  → --backfill flag processes all unprocessed dates

_shape_load_response() in controllers/portfolio.py:
  → aggregates 96 intervals → 24 hourly: he_idx = (interval_ending-1)//4
  → zones initialized as [0.0] * 24
```

### repcode is DYNAMIC (never hardcoded)

```python
rep_result = await db.execute(
    "SELECT DISTINCT repcode, qsecode FROM ercot_daioutputheader LIMIT 1"
)
```

### Settlement Run Types

```
RTM_INITIAL  → ~2 days after operating day
RTM_FINAL2   → ~55 days after (replaces initial)
RTM_TRUEUP3  → ~180 days after (final true-up)

Default in frontend: RTM_FINAL2
```

---

## Forecast Engine Architecture

### Layer Cake (4 Layers)

```
Layer 1 ✅  DNA — typical year shape from 12yr ERCOT actuals
            Source: ercot_load_history → forecast_baseline_dna
            Granularity: month × day_of_week × hour

Layer 2 ✅  Growth — ERCOT projected growth year over year
            Source: ercot_forecast_loadzone → forecast_growth_factors
            Base year: 2025, growth_factor = year_X / 2025

Layer 3 ⏳  Seasonal — El Niño/La Niña adjustment
            Source: NOAA seasonal outlook (to build)

Layer 4 ⏳  7-Day Override — use ERCOT week-ahead as ground truth
            Source: ercot_lfc_history + weather API
```

### Self-Healing System (Planned)

```
Checkpoint 1: 7-Day Mirror Test — our forecast vs ERCOT 7-day
              ±5% = Green, >10% = Red Alert

Checkpoint 2: Historical Backtest — blind test on 12yr data
              "Pretend today is July 2022, forecast next 7 days"

Checkpoint 3: Energy Balance Sanity — Year 1 vs Year 10 growth check
              Flag if outside 1.5%-6% annual bounds

Checkpoint 4: Portfolio Ratio Check — REP load / ERCOT total
              Flag if ratio drifts >50% from historical band

All checkpoints → dashboard flags (alert system to add later)
```

---

## MTM Engine ← NEW

### MTM Logic by Instrument Type

```
FIXED (LZ location):
  mtm_value = (market_price - deal_price) × volume_mw × hours

FIXED (HB location):
  basis = lz_market_price - hb_market_price
  mtm_value = (lz_market_price - (deal_price - basis)) × volume_mw × hours

HEAT_RATE:
  current_price = hr_value × current_gas_price / 1000
  mtm_value = (market_price - current_price) × volume_mw × hours

GAS_BASIS:
  mtm_value = (current_gas_price - deal_gas_price) × volume_mmbtu

INDEX:
  mtm_value = 0  (settles at market, no MTM)
```

### Hours Calculation

```
hours = block_type_hours_per_day × days_in_delivery_period
7x24 → 24 hrs/day
7x16 → 16 hrs/day
5x16 → 16 hrs/day (Mon-Fri only)
7x8  → 8 hrs/day
```

### Market Price Entry

```
Manual entry via /portfolio/mtm UI
Location options: HB_HOUSTON, HB_NORTH, HB_SOUTH, HB_WEST,
                  LZ_HOUSTON, LZ_NORTH, LZ_SOUTH, LZ_WEST,
                  HH (Henry Hub — for gas/heat rate deals)
Hour: 1-24 or Flat (0) for all-day price
Source: MANUAL (now) — API endpoint ready for future price feeds
        CME DataMine, ICE, Bloomberg can plug in via POST /mtm/prices/upload
```

### API Endpoints (MTM)

```
GET  /api/mtm/summary
GET  /api/mtm/by-deal?calc_date=YYYY-MM-DD
GET  /api/mtm/prices?price_date=YYYY-MM-DD
POST /api/mtm/calculate    body: {"price_date": "YYYY-MM-DD"}
POST /api/mtm/prices/upload body: [{"price_date","hour_ending","location","price","source"}]
```

---

## ERCOT Market Structure

### Settlement Zones (4)

```
HOUSTON  → COAST weather zone
NORTH    → NCENT + NORTH + EAST weather zones
SOUTH    → SCENT + SOUTH weather zones
WEST     → FWEST + WEST weather zones
```

### Locations (8)

```
HB_HOUSTON, HB_NORTH, HB_SOUTH, HB_WEST  → Hub (basis risk)
LZ_HOUSTON, LZ_NORTH, LZ_SOUTH, LZ_WEST  → Load Zone (no basis risk)
```

### Power Blocks

```
7x16  = HE07-HE22, 7 days (on-peak)
7x8   = HE01-06 + HE23-24, 7 days (off-peak)
5x16  = HE07-HE22, Mon-Fri (weekday peak)
2x16  = HE07-HE22, Sat-Sun + holidays (weekend peak)
7x24  = All 24 hours, 7 days (around the clock)
HOURLY = Individual hour entry
```

### DST Handling

```
Spring forward: one hour missing (HE02 or HE03) — leave as null
Fall back: one hour repeated — store with dst_flag='Y'
ercot_load_history has UNIQUE KEY on (oper_date, hour_ending, dst_flag)
```

---

## Hedging Module

### Business Rules

- Deal number MANDATORY
- Location drives zone (use utils/zone_mapping.py)
- HB vs LZ critical for MTM basis calculation
- 2 decimal places display

### Instrument Types

```
FIXED      → Fixed $/MWh price
HEAT_RATE  → hr_value (BTU/kWh) × gas_price = effective $/MWh
GAS_BASIS  → Gas hedge against heat rate product
INDEX      → Floating, settles at market (MTM = 0)
```

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

## Customer Forecast Rules

```
forecast_end_date calculation:
  future end date (>= today)  → use as-is
  expired/null end date       → today + 15 days

Active contract in forecast = forecast_end_date >= forecast_date
Future contract in forecast = forecast_start_date <= forecast_date
                              AND forecast_end_date >= forecast_date

Annual usage in customer DB = kWh (divide by 1000 for MWh)
Position screen shows MWh — that's how REPs buy power
```

---

## API Endpoints (Portfolio)

```
GET  /api/portfolio/summary
GET  /api/portfolio/by-zone
GET  /api/portfolio/customers
GET  /api/portfolio/open-position
GET  /api/portfolio/forecast
POST /api/portfolio/position          → routes to correct forecast/actual function
POST /api/portfolio/position/blocks   → Hour Blocks tab
GET  /api/portfolio/load/with-losses
GET  /api/portfolio/load/unadjusted
GET  /api/portfolio/load/combined
GET  /api/portfolio/load/dates
```

---

## Pending (In Order of Priority)

```
1.  Layer 3 Seasonal — NOAA seasonal outlook integration

2.  Layer 4 7-Day Override — wire ercot_lfc_history for short-term forecast

3.  Monitoring/Checkpoint system — 4 checkpoints, dashboard flags

4.  Risk assessment — black swan detection, short/long term scoring

5.  Settlement reconciliation — 3-way match (ERCOT vs supplier vs system)

6.  Historical settlement data ingestion — ingest more ZIP files beyond 2021-02-01

7.  MTM market price feed — integrate live price feed (CME DataMine/ICE/Bloomberg)
    when REP subscribes to one

8.  ERCOT MIS + SMT integration — automated daily data pull

9.  AI Agent home page

10. Multi-tenant DB routing — when onboarding second REP
```

---

## Migrations

```
api/migrations/022_create_mtm_tables.sql  ← NEW — market_prices + mtm_results
```

Run migrations on live via migration runner script.

---

## Scripts Run Order (Fresh Setup)

```bash
# 1. Load ERCOT native load history
python ingest_load.py

# 2. Load ERCOT LT forecast
python ingest_ercot_forecast.py --weatherzone wz.csv --loadzone lz.csv

# 3. Calculate shape factors
python calculate_ercot_shape.py

# 4. Build DNA baseline
python build_layer1_dna.py

# 5. Build growth factors
python build_layer2_growth.py

# 6. Populate customer forecast dates
python populate_customer_forecast_dates.py

# 7. Populate annual load
python populate_portfolio_load_annual.py

# 8. Process settlement (after ingesting ERCOT ZIPs)
python process_settlement.py --date YYYY-MM-DD --run RTM_FINAL2

# 9. Backfill all unprocessed settlement dates
python process_settlement.py --backfill
```
