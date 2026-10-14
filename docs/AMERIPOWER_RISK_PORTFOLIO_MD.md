# AmeriPower - Risk & Portfolio Module Context

> Changelog 2026-10-07: corrected against code by audit (doc-audit-risk-portfolio.md). Rows changed: B2, B4, B6, B7, B8, B10, B12, B18, B22, B23, B24, B25, B29, B30, B33, B34, B39, B47, B48, B49, B51, B52, B58, B60, B62, B64, B66, B70, B71, B72, B75, B76. UNVERIFIED labels added: B3, B9, B11, B13, B16, B28, B43, B47 and B52 (live running), B61, B68. DNA per-date behaviour (B39) and Risk score impact (B66, new section) are labelled "owner decision pending". Also fixed, not in the audit: Layer cake checkpoint 3 text (1.5%-6%) contradicted the Monitoring section, non-ASCII characters replaced with ASCII.
>
> Changelog 2026-10-07 (follow-up): multi-tenant wording corrected. Earlier edit said routing was "in place"; code shows deployment-per-tenant (DB_NAME), with TenantMiddleware not wired into main.py. Rows changed: A1, A2, Next Steps item 10 (doc A); B2 (doc B).

## Last Updated: October 2026 (corrected against code; body otherwise from August 2026)

## System Overview

- **Stack**: FastAPI + SQLAlchemy async + MySQL (aiomysql) on port 8001
- **Frontend**: Next.js + TypeScript + Tailwind on port 3000
- **DB**: u972964962_orbic (MariaDB)
- **All routes registered under `/api` prefix in `main.py`**
- **Architecture**: SaaS platform for any REP - no hardcoded company names
- **Deployment-per-tenant: each tenant has its own backend instance and DB (DB_NAME, api/utils/database.py); modules gated by TENANT_MODULES**

## Multi-Tenant Architecture

Tenants are separate deployments, each pointing at one DB via DB_NAME (api/utils/database.py) and created by api/scripts/provision_tenant.py. Per-request routing through a master DB (api/middleware/tenant.py TenantMiddleware, api/utils/master_db.py) is written but NOT added to main.py. The block below is the original design sketch.

```
Master DB -> reps table (rep_id, company_name, db_name)
Each REP -> own DB (identical table structure)
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
- [done] Enrollment Engine

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
  routers/mtm.py                     <- NEW
  controllers/mtm.py                 <- NEW

Frontend:
  pages/portfolio/index.tsx          -> Portfolio home
  pages/portfolio/position.tsx       -> Position screen + Hour Blocks tab
  pages/portfolio/hedging.tsx        -> Hedge book
  pages/portfolio/dam.tsx            -> DAM purchases
  pages/portfolio/mtm.tsx            -> Mark-to-Market <- NEW

Scripts:
  ingest_ercot_settlement.py         -> Loads ERCOT settlement ZIPs
  process_settlement.py              -> Processes settlement -> portfolio_load tables
                                       --backfill flag for unprocessed dates
  ingest_ercot_forecast.py           -> Loads ERCOT 20-25yr forecast CSVs
  calculate_ercot_shape.py           -> Calculates shape factors from forecast
  populate_customer_forecast_dates.py -> Derives forecast table from contract_renewal (run by hand; nothing schedules it)
  populate_portfolio_load_annual.py   -> Annual MWh by zone for DNA forecast (run by hand; nothing schedules it; full annual_kwh, no proration)
  build_layer1_dna.py                -> Builds DNA baseline from ercot_load_history
  build_layer2_growth.py             -> Calculates growth factors from ERCOT forecast
  ingest_load.py                     -> Loads ERCOT native load Excel files
  forecast_analog.py                 -> Analog day forecast
  forecast_vs_actual.py              -> Forecast accuracy testing
  forecast_today.py                  -> Daily forecast

Utils:
  utils/zone_mapping.py              -> Single source of truth for zone mapping
```

Also present (not listed above): controllers/risk.py and its router, monitoring/checkpoint_runner.py, scraper_ercot_lfc.py, utils/contract_type_utils.py, utils/unsynced_contracts.py.

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

main.py also registers the risk, ercot_market, monitoring and admin_portfolio_contracts routers; routers carry module-gating dependencies.

---

## Data Layer - All Tables

### ERCOT Load Data

Row counts below (ercot_load_history, weather_history, holidays, patterns, black swan) are historical snapshots: UNVERIFIED (needs live server or browser).

- **ercot_load_history**: ~98,591 rows, 2015-2026 Mar, hourly actuals by 8 weather zones
  - Columns: oper_date, hour_ending, dst_flag, coast, east, far_west, north, north_central, south_central, southern, west, ercot_total
  - UNIQUE KEY on (oper_date, hour_ending, dst_flag)
  - dst_flag='Y' for repeated DST hour (fall back)
  - Source: Excel files via ingest_load.py

- **ercot_lfc_history**: ERCOT week-ahead LFC forecast, filled by the LFC scraper; originally 249,983 rows (Dec 2018-Dec 2021), now runs to 2026 (256,103 rows through 2026-09-02 on the local DB; counts change daily)
  - Columns: publish_date, publish_time, delivery_date, hour_ending, coast, east, far_west, north, north_central, south_central, southern, west, system_total, dst_flag

- **weather_history**: 1,069,248 rows, 2011-2026 Mar, hourly temp/humidity/wind by zone
- **ercot_holidays**: 325 records, 2011-2035
- **ercot_load_patterns**: 18,240 patterns with outlier detection
- **ercot_black_swan_events**: 9,656 rows

### Portfolio & Hedging Tables

hedge_book and dam_purchases column lists: UNVERIFIED (needs live server or browser) (schemas not re-read by the audit).

- **portfolio_view**: MariaDB VIEW on portfolio_contracts (migrations 048/051); status is active / expired / future
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

Column lists below: UNVERIFIED (needs live server or browser) (schemas not re-read by the audit).

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

- **forecast_baseline_dna**: Layer 1 - Typical year DNA from 12yr history
  - Columns: weather_zone, month, day_of_week (0=Mon), hour_ending, avg_load, std_dev, sample_count, outliers_removed
  - Design: 2,016 combinations per zone (12 x 7 x 24). The local DB holds 2,100 rows for 6 zones and 2,016 for NORTH_CENTRAL and SOUTH_CENTRAL; cause not investigated (owner to check)
  - Outliers removed: >3 std dev from mean

- **forecast_growth_factors**: Layer 2 - ERCOT growth multipliers
  - Columns: load_zone, forecast_year, base_year (2025), base_total, year_total, growth_factor
  - growth_factor = year_total / base_2025_total
  - 20 years x 4 zones = 80 rows

- **forecast_modifiers**: Layer 3 - Seasonal adjustments (to build)

### Customer Forecast Tables

- **customer_forecast_dates**: Derived from contract_renewal
  - Columns: esid, contract_end_date, forecast_end_date, load_profile, annual_kwh, load_zone, weather_zone
  - forecast_end_date rule: future dates kept as-is, expired/null -> today + 15 days (expired meters therefore keep a forecast end of today + 15; open question for the owner)
  - Refreshed only when populate_customer_forecast_dates.py is run by hand (nothing schedules it). The Portfolio upload writes its own rows; contract_renewal edits do not update this table

- **future_forecast_dates**: Future-type rows written by the Portfolio contracts upload (routers/admin_portfolio_contracts.py)
  - Columns: esid, forecast_start_date, forecast_end_date, load_profile, annual_kwh, load_zone, weather_zone, source

- **portfolio_load_annual**: Annual MWh by load zone for DNA forecast
  - Columns: year, load_zone, annual_mwh, source
  - 2024: backcasted from ercot_load_history ratios
  - 2025: directly from customer_forecast_dates
  - 2026+: customer_forecast_dates filtered by year
  - Full annual_kwh is summed per zone for any contract overlapping the year; never prorated. Filled only by populate_portfolio_load_annual.py (run by hand)

### Zone Mapping Table

- **weather_to_load_zone**: Single source of truth for zone mapping
  - COAST -> HOUSTON
  - EAST, NORTH, NORTH_CENTRAL -> NORTH
  - SCENT, SOUTH_CENTRAL, SOUTHERN -> SOUTH
  - FAR_WEST, WEST -> WEST

### MTM Tables <- NEW

- **market_prices**: Manual/API market price entry
  - Columns: id, price_date, hour_ending (0=flat/all-day), location, price, source (MANUAL/API), loaded_at
  - UNIQUE KEY on (price_date, hour_ending, location)
  - Locations: HB*\*, LZ*\*, HH (Henry Hub for gas)
  - source: MANUAL now, API endpoint ready for future price feeds

- **mtm_results**: Calculated MTM per deal
  - Columns: id, calc_date, deal_number, instrument_type, location, zone, volume_mw, deal_price, market_price, basis, gas_price_current, mtm_value, delivery_start, delivery_end, calculated_at
  - UNIQUE KEY on (calc_date, deal_number)

### SMT Table (Planned)

Still unbuilt: UNVERIFIED (needs live server or browser).

- **smt_interval_data**: ESI-level 15-min interval data

---

## Zone Mapping

### Weather Zones (8) -> Settlement/Load Zones (4)

```
COAST                              -> HOUSTON
EAST + NORTH + NORTH_CENTRAL       -> NORTH
SOUTH_CENTRAL + SOUTHERN           -> SOUTH
FAR_WEST + WEST                    -> WEST
```

**CRITICAL**: Always use `utils/zone_mapping.py` - never hardcode zone mappings.

```python
from utils.zone_mapping import weather_to_load, get_weather_zones_for_load
from utils.zone_mapping import DB_COL_TO_ZONE, get_load_zones
```

A second copy api/zone_mapping.py also exists; keep them in sync or remove it (owner to decide).

---

## Position Screen Architecture

### Load Types Available

```
ERCOT Shape Forecast  -> get_forecast_data()       - ERCOT LT shape x customer annual MWh
DNA Forecast          -> get_dna_forecast_data()   - 12yr DNA x customer share of ERCOT
Minimum Forecast      -> TBD
Maximum Forecast      -> TBD
Forecast Bands        -> TBD
What-If Forecast      -> TBD
Actual (With Losses)  -> get_position_data()       - portfolio_load_with_losses
Actual (Unadjusted)   -> get_position_data()       - portfolio_load_unadjusted
```

The code also has a "Smoothed Forecast" load type that this list does not describe. Minimum/Maximum/Bands/What-If are listed in UNIMPLEMENTED_FORECAST_TYPES in routers/portfolio.py.

### Position Screen Features

- **Two tabs**: Position Screen | Hour Blocks
- **Position Screen tab**: hourly/daily/monthly/15-min grid + recharts graph (Bar/Line toggle, scrollable)
- **Hour Blocks tab**: block type selector (7x16/5x16/2x16/7x8/7x24) + forecast type selector + scrollable bar/line chart + hourly shape table
- **ActualLoadSection**: appears below grid for Actual load types, shows 24 hourly aggregated values (96 intervals -> 24 hours)
- **Graph**: Supply vs Load chart with Bar/Line toggle, horizontally scrollable
- **Sticky Name column**: dark bg-slate-900, white text, z-index correct

### ERCOT Shape Forecast Logic

```
1. For each day of the window, take the meters live that day from customer_forecast_dates (+ future_forecast_dates): start date through end date, both inclusive; a missing start date means from the first day of the window (_zone_annual_mwh_by_day)
2. Sum annual_kwh / 1000 per load_zone per day -> zone annual MWh (full annual figure, never prorated)
3. Fetch shape factors from ercot_shape_loadzone for date range
4. hourly_mwh = annual_mwh x monthly_shape x daily_shape x hourly_shape
5. 15-min = hourly / 4
```

Response fields: zone_annual_mwh is the first-day value (debug/display); active_contracts counts meters live on any day of the window (debug/display).

### DNA Forecast Logic

```
Layer 1 - DNA baseline (forecast_baseline_dna)
  avg_load = historical average for (weather_zone, month, dow, hour)
  Outliers removed: >3 std dev

Layer 2 - Growth (implicit via customer_share)
  customer_share = portfolio_annual_mwh / ercot_year_total
  Both numerator and denominator are year-specific

Formula:
  hourly_mwh = dna_avg_load x customer_share
  (sum weather zones -> load zone before multiplying)

Customer filtering (current behaviour; per-date handling is OWNER DECISION PENDING):
  None per customer or per date. One customer_share per year = portfolio_load_annual / ERCOT year total.
  A meter that ends mid-year stays in the DNA forecast for that year; a Future meter is in it only if
  populate_portfolio_load_annual.py was run after it was loaded.
  Needs portfolio_load_annual, forecast_baseline_dna, forecast_growth_factors: refreshed only by hand-run scripts;
  returns zeros when they are empty (new tenants).
```

### Hour Blocks Logic

```
Purpose: Help traders decide which power block to buy for hedging
Shows: Hourly shape within the selected block

Block definitions:
  7x16 = HE07-HE22, all 7 days
  5x16 = HE07-HE22, Mon-Fri excluding FULL holidays (ercot_holidays table)
  2x16 = HE07-HE22, Sat + Sun + FULL holidays (FULL holidays only)
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
  -> ingest_ercot_settlement.py
  -> stores as-is in ercot_daioutputheader/interval

process_settlement.py:
  -> filters POSTEDAML_* -> stores 96 intervals -> portfolio_load_with_losses
  -> filters LSEGUNADJ_* -> stores 96 intervals -> portfolio_load_unadjusted
  -> --backfill flag processes all unprocessed dates

_shape_load_response() in controllers/portfolio.py:
  -> aggregates 96 intervals -> 24 hourly: he_idx = (interval_ending-1)//4
  -> zones initialized as [0.0] * 24
```

### repcode is DYNAMIC (never hardcoded)

```python
rep_result = await db.execute(
    "SELECT DISTINCT repcode, qsecode FROM ercot_daioutputheader LIMIT 1"
)
```

### Settlement Run Types

```
RTM_INITIAL  -> ~2 days after operating day
RTM_FINAL2   -> ~55 days after (replaces initial)
RTM_TRUEUP3  -> ~180 days after (final true-up)

Default in frontend: RTM_FINAL2 (UNVERIFIED (needs live server or browser))
```

---

## Forecast Engine Architecture

### Layer Cake (4 Layers)

```
Layer 1 [done]  DNA - typical year shape from 12yr ERCOT actuals
            Source: ercot_load_history -> forecast_baseline_dna
            Granularity: month x day_of_week x hour

Layer 2 [done]  Growth - ERCOT projected growth year over year
            Source: ercot_forecast_loadzone -> forecast_growth_factors
            Base year: 2025, growth_factor = year_X / 2025

Layer 3 [pending]  Seasonal - El Nino/La Nina adjustment
            Source: NOAA seasonal outlook (to build)

Layer 4 [done]  7-Day Override - ercot_lfc_history (LFC scraper configured to run 6 times a day; running on the VPS: UNVERIFIED (needs live server or browser))
            Averages (AVG) the publishes from the last 2 days for each (delivery_date, hour_ending), not the single most recent publish
            customer_share = zone_annual_mwh / forecast_growth_factors.base_total (ERCOT 2025 base); if base_total is empty there is no override
            Falls back to ERCOT Shape for dates beyond 7 days
```

### Self-Healing System (Built - see Monitoring System)

```
Checkpoint 1: 7-Day Mirror Test - our forecast vs ERCOT 7-day
              +/-5% = Green, >10% = Red Alert

Checkpoint 2: Historical Backtest - blind test on 12yr data
              "Pretend today is July 2022, forecast next 7 days"

Checkpoint 3: Energy Balance Sanity - Year 1 vs Year 10 growth check
              GREEN at 1-15% annual growth, YELLOW 0.5-20% (see Monitoring System)

Checkpoint 4: Portfolio Ratio Check - REP load / ERCOT total
              Flag if ratio drifts >50% from historical band

All checkpoints -> dashboard flags (alert system to add later)
```

---

## MTM Engine <- NEW

### MTM Logic by Instrument Type

```
FIXED (LZ location):
  mtm_value = (market_price - deal_price) x volume_mw x hours

FIXED (HB location):
  basis = lz_market_price - hb_market_price
  mtm_value = (lz_market_price - (deal_price - basis)) x volume_mw x hours

HEAT_RATE:
  current_price = hr_value x current_gas_price / 1000
  mtm_value = (market_price - current_price) x volume_mw x hours

GAS_BASIS:
  mtm_value = (current_gas_price - deal_gas_price) x volume_mmbtu

INDEX:
  mtm_value = 0  (settles at market, no MTM)
```

### Hours Calculation

```
hours = block_type_hours_per_day x days_in_delivery_period
7x24 -> 24 hrs/day
7x16 -> 16 hrs/day
5x16 -> 16 hrs/day (Mon-Fri only)
7x8  -> 8 hrs/day
```

### Market Price Entry

```
Manual entry via /portfolio/mtm UI
Location options: HB_HOUSTON, HB_NORTH, HB_SOUTH, HB_WEST,
                  LZ_HOUSTON, LZ_NORTH, LZ_SOUTH, LZ_WEST,
                  HH (Henry Hub - for gas/heat rate deals)
Hour: 1-24 or Flat (0) for all-day price
Source: MANUAL (now) - API endpoint ready for future price feeds
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

## Monitoring System

### Checkpoint Runner
Script: api/monitoring/checkpoint_runner.py
Runs: configured nightly at midnight (00:00) via PM2 (ecosystem.monitoring.config.js); running on the VPS: UNVERIFIED (needs live server or browser)
Table: forecast_checkpoints

### Four Checkpoints
1. 7-Day Mirror Test - ERCOT Shape forecast vs ercot_lfc_history
   GREEN <=5%, YELLOW <=10%, RED >10%
   
2. Historical Backtest - DNA forecast vs ercot_load_history actuals
   Random date within available data range
   GREEN <=5%, YELLOW <=10%, RED >10%
   
3. Energy Balance Sanity - ERCOT growth rate 2025->2035
   GREEN 1-15%, YELLOW 0.5-20%, RED outside
   
4. Portfolio Ratio Check - portfolio/ERCOT ratio vs baseline
   GREEN within 50%, RED >50% drift

Notes (INFERRED from checkpoint_runner.py): checkpoint 1 mirrors the forecast using portfolio_load_annual (the pre-per-day logic); checkpoint 4 sums annual_kwh of all customer_forecast_dates rows with no date filter (includes expired and Future meters).

### API Endpoints
GET /api/monitoring/checkpoints         -> latest results
GET /api/monitoring/checkpoints/history -> last 30 days

### Frontend
Page: app/pages/monitoring/checkpoints.tsx
Sidebar: System -> Monitoring

---

## LFC Scraper (ERCOT 7-Day Load Forecast)

Script: api/scraper_ercot_lfc.py
Runs: configured 6 times a day via PM2 (ecosystem.lfc.config.js, cron 0 0,7,8,12,16,20 * * *); running on the VPS: UNVERIFIED (needs live server or browser)
Source: ERCOT NP3-561-CD (Seven-Day Load Forecast by Weather Zone)
Method: Playwright with proxy rotation to bypass Incapsula
Table: ercot_lfc_history
Records: 192 per saved run (8 weather zones x 24 hours); the 7am and 8am Central captures are always saved, other runs only if they deviate more than 10 percent from the last saved snapshot

Credentials needed in .env:
  ERCOT_USERNAME=
  ERCOT_PASSWORD=  
  ERCOT_SUBSCRIPTION_KEY=

---

## ERCOT Market Structure

### Settlement Zones (4)

```
HOUSTON  -> COAST weather zone
NORTH    -> EAST + NORTH + NORTH_CENTRAL weather zones
SOUTH    -> SOUTH_CENTRAL + SOUTHERN weather zones
WEST     -> FAR_WEST + WEST weather zones
```

### Locations (8)

```
HB_HOUSTON, HB_NORTH, HB_SOUTH, HB_WEST  -> Hub (basis risk)
LZ_HOUSTON, LZ_NORTH, LZ_SOUTH, LZ_WEST  -> Load Zone (no basis risk)
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
Spring forward: one hour missing (HE02 or HE03) - leave as null
Fall back: one hour repeated - store with dst_flag='Y'
ercot_load_history has UNIQUE KEY on (oper_date, hour_ending, dst_flag)
```

---

## Hedging Module

Hedging rules and instrument types below: UNVERIFIED (needs live server or browser) (hedging controller not re-read by the audit).

### Business Rules

- Deal number MANDATORY
- Location drives zone (use utils/zone_mapping.py)
- HB vs LZ critical for MTM basis calculation
- 2 decimal places display

### Instrument Types

```
FIXED      -> Fixed $/MWh price
HEAT_RATE  -> hr_value (BTU/kWh) x gas_price = effective $/MWh
GAS_BASIS  -> Gas hedge against heat rate product
INDEX      -> Floating, settles at market (MTM = 0)
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
  future end date (>= today)  -> use as-is
  expired/null end date       -> today + 15 days

ERCOT Shape forecast: per day. A meter counts from its start date through its end date, both inclusive;
  a missing start date means from the first day of the window.
DNA forecast: no per-customer or per-date rule; one share per year from portfolio_load_annual (owner decision pending).

Annual usage in customer DB = kWh (divide by 1000 for MWh)
Position screen shows MWh - that's how REPs buy power
```

---

## API Endpoints (Portfolio)

```
GET  /api/portfolio/summary
GET  /api/portfolio/by-zone
GET  /api/portfolio/customers
GET  /api/portfolio/open-position
GET  /api/portfolio/forecast
POST /api/portfolio/position          -> routes to correct forecast/actual function
POST /api/portfolio/position/blocks   -> Hour Blocks tab
GET  /api/portfolio/load/with-losses
GET  /api/portfolio/load/unadjusted
GET  /api/portfolio/load/combined
GET  /api/portfolio/load/dates
```

Also present: the Portfolio contracts upload endpoints (admin_portfolio_contracts), and the risk and ercot_market routers. Not every route was run by the audit.

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
- **Risk scores: owner decision pending.** controllers/risk.py position score reads the forecast totals ("Load (Forecast)", "Net Supply") for four horizons from get_forecast_data, so the per-day forecast change can move scores. The size of the shift has not been measured.
- **Schedules.** pm2 jobs (LFC scraper, monitoring checkpoints, reconcile) are configured in the repo; whether they run on the VPS is UNVERIFIED (needs live server or browser).

---

## Pending (In Order of Priority)

```
1. Layer 3 Seasonal - NOAA seasonal outlook integration

2. Risk scoring is built (controllers/risk.py: position 40, price 25, customer 20, weather 15); black-swan detection is separate (ercot_black_swan_events). Impact of the per-day forecast change on scores: not measured, owner decision pending

3. Settlement reconciliation - 3-way match (ERCOT vs supplier vs system)

4. Historical settlement data - need more ZIP files beyond 2021-02-01 (UNVERIFIED (needs live server or browser))

5. MTM market price feed - live feed integration (CME DataMine/ICE/Bloomberg)

6. ERCOT MIS + SMT integration - automated daily data pull
```

---

## Migrations

```
api/migrations/022_create_mtm_tables.sql  <- NEW - market_prices + mtm_results
api/migrations/029_create_forecast_checkpoints.sql <- forecast_checkpoints table
```

Migrations are run by hand over SSH; see docs/DB_MIGRATIONS.md (there is no migration runner script). Many later migrations (030-055) exist; that file tracks which are applied.

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

# 6. Populate customer forecast dates (run by hand; re-run after contract changes; nothing automates it)
python populate_customer_forecast_dates.py

# 7. Populate annual load (run by hand; nothing automates it)
python populate_portfolio_load_annual.py

# 8. Process settlement (after ingesting ERCOT ZIPs)
python process_settlement.py --date YYYY-MM-DD --run RTM_FINAL2

# 9. Backfill all unprocessed settlement dates
python process_settlement.py --backfill

# 10. Run LFC scraper (6 times a day via PM2)
pm2 start api/ecosystem.lfc.config.js

# 11. Run monitoring checkpoints (nightly via PM2)
pm2 start api/monitoring/ecosystem.monitoring.config.js

pm2 save
```
