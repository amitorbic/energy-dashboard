# AmeriPower Pricing Module — Summary

## Tech Stack

- **Backend:** FastAPI + SQLAlchemy async + MySQL (aiomysql) — port 8001
- **Frontend:** Next.js + TypeScript + Tailwind CSS — port 3000
- **All API routes** registered under `/api` prefix in `main.py`

---

## Key Conventions

- Static routes always before dynamic `/{id}` routes in routers
- All local variables in nested sync functions use unique names (Python closure issue)
- `run_sync` used to bridge async SQLAlchemy with pandas `read_sql_query`
- Windows: bracket folders (`[id]`) need `.next` cleared on each restart

---

## Database Tables

### Pricing Core

| Table                  | Purpose                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `heat_rates`           | Long format: `market_date`, `profile_name`, `value`                                                     |
| `gas_strip`            | Gas prices: `date`, `value`                                                                             |
| `consumption`          | Wide format: one column per profile, one row per month                                                  |
| `margin`               | Wide format: `term` column + one column per `custom_profile_code`                                       |
| `tdsp`                 | `profile`, `value`, `upload_date`                                                                       |
| `txu`                  | `profile`, `value`, `upload_date` (supplier charges)                                                    |
| `ref_profile_mappings` | Maps zone/load_factor to `profile_key`, `ercot_hr_header`, `consumption_profile`, `custom_profile_code` |
| `load_profiles_master` | Maps `full_load_profile` → `short_name` (profile_key)                                                   |

### Customer

| Table            | Purpose                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------- |
| `customers_new`  | Customer info: `id`, `company_name`, `esid`, `broker_code`, `contract_start_date`, `pricing_start_date`, etc. |
| `customer_usage` | Per ESID per month: `customer_id`, `esid`, `profile_key`, `total_kwh`, `period_start`, `period_end`           |

### Broker

| Table         | Purpose                                                                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `broker_new`  | Broker info with email flags: `pricing_flag`, `daily_pricing_flag1-5`, `commission_flag`, `confirmation_flag`, `upfront_flag`, `regular_status` |
| `broker_logs` | Email send history: `broker_code`, `company_name`, `email_type`, `sent_to`, `status`, `sent_at`                                                 |

### Reference

| Table              | Purpose                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `contract_renewal` | Renewal customers: `premise_id` (ESID), `company_name`, `broker_code`, `load_profile`, `contract_renewal_usage`, `contract_end_date` |

---

## Backend Controllers

### `controllers/pricing_engine.py`

- `calculate_matrix_for_start_date(start_date, terms, db, price_type)` — main pricing calculation
- `get_sweetspot_terms(start_date)` — returns terms ending in May
- `generate_excel_matrix(start_date, terms, num_months, price_type, db)` — Excel export

**Formula:**

```
energy_cost = Σ(heat_rate × gas_price × consumption) / Σ(consumption)
final_price = (energy_cost + margin + tdsp + supplier) / 10  # cents/kWh
```

**Price Types:** `commercial`, `residential`, `sweetspot_commercial`, `sweetspot_residential`

### `controllers/usage_upload.py`

- `parse_usage_file(contents)` — auto-detects provider, returns normalized DataFrame
- `process_usage_upload(customer_id, contents, db, delete_existing)` — saves to `customer_usage`
- Supported providers: Oncor, AEP West, AEP South (same format), TNMP, Centerpoint (multi-sheet)

### `controllers/custom_pricing.py`

- `calculate_custom_price(customer_id, start_date, terms, profiles, db)`
- Formula: `Σ(volume × price) / total_volume` — volume-weighted blend

### `controllers/brokers.py`

- CRUD for `broker_new`
- `update_broker` — preserves existing flags if not explicitly passed
- `update_broker_status` — sets all flags to 0 when deactivating

### `controllers/email_pricing.py`

- `send_daily_pricing_email(broker_ids, start_date, terms, price_type, num_months, db)`
- `send_custom_pricing_email(broker_ids, terms, db)`
- `build_daily_matrix_html(matrix, terms, price_type, mills, start_date, month_label)`
- `build_email_html(quote_for, content_html)`
- SMTP config from `.env`: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- Port 465 uses `SMTP_SSL`, port 587 uses `SMTP.starttls()`

---

## Backend Routers

| Router              | Prefix                 | Key Endpoints                                                                                                                 |
| ------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `daily_pricing.py`  | `/api/pricing`         | `GET /daily-matrix`, `GET /export-excel`, `GET /profiles`                                                                     |
| `custom_pricing.py` | `/api/customers`       | CRUD + `/upload-usage`, `/custom-price`, `/save-profiles`, `/usage-summary`, `/parse-usage`, `/renewal/search`, `/check-esid` |
| `brokers.py`        | `/api/brokers`         | CRUD + `/dropdown`, `/logs`                                                                                                   |
| `email_pricing.py`  | `/api/email`           | `POST /daily`, `POST /custom`, `POST /preview-data`, `GET /brokers/regular`, `GET /brokers/irregular`, `GET /brokers/custom`  |
| `charges.py`        | `/api/pricing/charges` | TDSP + supplier update/view                                                                                                   |

---

## Frontend Pages

### Daily Pricing (`pages/pricing/`)

- `daily_matrix_commercial.tsx` — Commercial matrix with Send Email button
- `daily_matrix_residential.tsx` — Residential matrix with Send Email button
- `email.tsx` — Email pricing page (daily + custom tabs)
- `gas-strip.tsx`, `heat-rate.tsx`, `consumption.tsx`, `margin.tsx`, `tdsp.tsx`, `supplier.tsx` — Upload pages

### Custom Pricing (`pages/custom_pricing/`)

- `index.tsx` — 3-flow landing: New Customer, Upload Usage, Renewal
- `add.tsx` — Add customer form (pre-fills from upload or renewal via sessionStorage)
- `[id]/index.tsx` — Pricing page: customer info, profile/volume, upload, calculate
- `[id]/edit.tsx` — Edit customer form

### Broker Database (`pages/broker/`)

- `index.tsx` — Broker list with status badges (Active/Partial/Inactive)
- `add.tsx` — Add broker form
- `[sid]/edit.tsx` — Edit broker form
- `activate.tsx` — Expandable rows with per-flag toggles
- `view.tsx` — Filter by Pricing/Daily/Commission/Confirmation
- `log.tsx` — Email send history

---

## Key Business Rules

### Broker Status Logic

- `regular_status = inactive` → all flags set to 0
- Individual flags can be turned on independently → status becomes `partial`
- `regular_status` auto-calculated: all on = `active`, some on = `partial`, none = `inactive`

### Pricing Zones

- South, Coast (CenterPoint), North, West
- Display: `Coast` shown as `CenterPoint` in frontend

### Sweetspot Terms

- Terms where contract ends in May
- Formula: `end_month = (start_month + term + 1) % 12 - 1`, target = 5 (May)

### Custom Pricing Flow

1. Upload usage file → auto-detect provider → map profiles → save to `customer_usage`
2. Profile/volume shown as checkboxes — can be manually overridden
3. Calculate: volume-weighted average of daily matrix prices across profiles
4. Save profiles separately from customer info

### Email Format

- Daily: AmeriPower logo + matrix tables per month (Low/Medium/High load factors) + Excel attachment
- Custom: One block per customer with terms and prices
- Mills added to daily prices per broker before sending (internal, not shown in email)

---

## SMTP Configuration (`.env`)

```
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=info@enertsol.com
SMTP_PASS=your_password
SMTP_FROM=Pricing <info@enertsol.com>
```

---

## Common Issues & Fixes

- **Python closure NameError** — rename all local variables in nested `fetch_sync_data` to unique names
- **Bracket folder 404 on Windows** — run `Remove-Item -Recurse -Force .next` then restart
- **Route 422** — static routes must come before `/{id}` dynamic routes
- **Pandas date alignment** — reset index on both slices before multiplication
- **SMTP SSL** — port 465 uses `smtplib.SMTP_SSL`, port 587 uses `starttls()`

# Blend & Extend Pricing Module — AmeriPower

## Overview

Calculates blended rates for active customers combining existing contract with new extension terms.
Saved records can be repriced, emailed to brokers, and included in bulk pricing emails.

## Tech Stack

- Backend: FastAPI, `routers/bne.py`
- Frontend: `pages/custom_pricing/blend_extend/`
  - `index.tsx` — log page (list/delete)
  - `add.tsx` — add/edit/calculate/send page

## Database

### `bne_log`

| Column           | Type     | Description                                |
| ---------------- | -------- | ------------------------------------------ |
| sid              | INT PK   | Auto increment                             |
| customer_name    | VARCHAR  | Customer name                              |
| broker_code      | VARCHAR  | FK to broker_new.broker_code               |
| esid             | TEXT     | Comma-separated ESI IDs                    |
| cust_ids         | TEXT     | JSON array of contract_renewal.cust_id     |
| current_rate     | VARCHAR  | Current rate ¢/kWh                         |
| terms_left       | VARCHAR  | Contract end date                          |
| extension_terms  | VARCHAR  | e.g. "6,12,18,24"                          |
| profiles         | TEXT     | JSON {profile_key: kwh}                    |
| volume           | TEXT     | JSON {profile_key: kwh} (same as profiles) |
| ameripower_mills | VARCHAR  | AmeriPower mills                           |
| broker_mill      | VARCHAR  | Broker mills                               |
| start_date       | DATE     | New contract start date                    |
| comments         | TEXT     | Notes                                      |
| created_by       | VARCHAR  | User who created                           |
| created_at       | DATETIME | Auto timestamp                             |
| updated_at       | DATETIME | Auto timestamp                             |

## Data Sources

- Customer search: `contract_renewal` table
- Profile mapping: `load_profiles_master` → `ref_profile_mappings`
- Matrix pricing: `calculate_custom_price()` from `controllers/custom_pricing.py`

## API Endpoints

| Method | Endpoint                  | Description                               |
| ------ | ------------------------- | ----------------------------------------- |
| GET    | `/api/bne/search?q=`      | Search contract_renewal by name or ESI ID |
| GET    | `/api/bne/customers?ids=` | Fetch customers by cust_id list           |
| POST   | `/api/bne/calculate`      | Calculate blended rates                   |
| POST   | `/api/bne/save`           | Save/update BNE record                    |
| POST   | `/api/bne/send-email`     | Send pricing email to broker              |
| POST   | `/api/bne/offer-pdf`      | Generate 2-page PDF offer sheet           |
| GET    | `/api/bne/list`           | List all BNE records                      |
| GET    | `/api/bne/{sid}`          | Get single record                         |
| DELETE | `/api/bne/{sid}`          | Delete record                             |

## Key Business Logic

### Customer Search Filter

Only shows customers with `contract_rate IS NOT NULL AND contract_rate > 0`.
Month-to-month customers (no fixed rate) are excluded.

### Profile Mapping

`contract_renewal.load_profile` (full name) → `load_profiles_master.short_name` → `ref_profile_mappings.profile_key`

### Matrix Start Date (16th Rule)

- Parse `contract_end_date` from contract_renewal
- If day > 16 → matrix starts first of next month
- If day ≤ 16 → matrix starts first of same month
- If user enters `start_date` on form → apply 16th rule to that date instead

### Remaining Months

`remaining_months = (contract_end_date - start_date) / 30.44` (rounded, normalized to first of month)

### Blended Rate Formula

rem_vol = (remaining_months / 12) × annual_usage
ext_vol = (extension_term / 12) × annual_usage
total_vol = rem_vol + ext_vol
blended = (current_rate × rem_vol + new_rate × ext_vol) / total_vol

### Rate Conversion

`contract_renewal.contract_rate` is stored as $/kWh → multiply × 100 for ¢/kWh in calculations.

### Offer PDF

Two-page PDF via reportlab:

- Page 1: Customer offer sheet (extension term, total term, new rate, annual savings, term savings)
- Page 2: Broker offer sheet (same + proposed broker mills column)

### Bulk Email Integration

`send_custom_pricing_email()` in `controllers/email_pricing.py` includes B&E records
for each broker after the custom pricing section.

## Frontend Flow

1. Search customer from `contract_renewal`
2. Select one or multiple customers (profiles auto-fill from `load_profiles_master`)
3. Set extension terms (default: 6,12,18,24), start date, current rate (auto-filled, editable)
4. Click Calculate → blended rates shown per term
5. Enter AmeriPower/broker mills + message → Download Offer PDF
6. Save Record → Send Pricing Email

## Conventions

- Static routes before dynamic `/{sid}` in router
- `profiles` and `volume` columns both store same JSON (legacy compatibility)
- `terms_left` stores contract end date string (not months)
- `extension_terms` stores comma-separated months string e.g. "6,12,18,24"

# Multiple Start Pricing Module — AmeriPower

## Overview

Prices customers with meters starting on different dates into one weighted average price
per target end date. Outputs 3 end date columns (e.g. May'27, May'28, May'29).

## Tech Stack

- Backend: FastAPI, `routers/msp.py`
- Frontend: `pages/custom_pricing/multi_start/`
  - `index.tsx` — log page (list/delete)
  - `add.tsx` — add/edit/calculate/send page

## Database

### `msp_log`

| Column           | Type     | Description                            |
| ---------------- | -------- | -------------------------------------- |
| sid              | INT PK   | Auto increment                         |
| customer_name    | VARCHAR  | Customer name                          |
| broker_code      | VARCHAR  | FK to broker_new.broker_code           |
| esids            | TEXT     | All ESI IDs combined                   |
| groups           | TEXT     | JSON array of start date groups        |
| terms            | VARCHAR  | End month number (1-12, default 5=May) |
| ameripower_mills | VARCHAR  | AmeriPower mills                       |
| broker_mill      | VARCHAR  | Broker mills                           |
| comments         | TEXT     | Notes                                  |
| created_by       | VARCHAR  | User who created                       |
| created_at       | DATETIME | Auto timestamp                         |
| updated_at       | DATETIME | Auto timestamp                         |

### Groups JSON Structure

```json
[
  {
    "start_date": "2026-04-01",
    "esid": "1008901234567",
    "profiles": { "BUSMEDLF_COAST": 120000, "RESLOWR_COAST": 80000 }
  },
  {
    "start_date": "2026-06-01",
    "esid": "1008901234568",
    "profiles": { "BUSHILF_NORTH": 400000 }
  }
]
```

## API Endpoints

| Method | Endpoint              | Description                  |
| ------ | --------------------- | ---------------------------- |
| POST   | `/api/msp/calculate`  | Calculate MSP rates          |
| POST   | `/api/msp/save`       | Save/update MSP record       |
| POST   | `/api/msp/send-email` | Send pricing email to broker |
| GET    | `/api/msp/list`       | List all MSP records         |
| GET    | `/api/msp/{sid}`      | Get single record            |
| DELETE | `/api/msp/{sid}`      | Delete record                |

## Key Business Logic

### Three Entry Modes

1. **Manual** — user adds groups manually, selects profiles from checkbox grid
2. **Upload** — parse usage file, groups auto-created per start date
3. **From Renewal** — search `contract_renewal`, ESI IDs grouped by end date → next start

### End Date Generation

- User selects target end month (default: May)
- System finds latest start date across all groups
- First end date = next occurrence of selected month AFTER latest start date
- Then +1 year, +2 years → 3 end date columns total

### Term Calculation Per Group

term_months = months from group.start_date to end_date (inclusive, normalized to 1st of month)
period_volume = (term_months / 12) × annual_volume

### Blended Price Formula

For each group:
matrix_price = calculate_custom_price(start_date, term_months, profiles)
weighted_value += matrix_price × period_volume
final_price = total_weighted_value / total_weighted_volume

### Inclusive Month Counting

Both start and end months are counted:

- Apr'26 → May'27 = 14 months (not 13)
- Formula: `relativedelta(end_date.replace(day=1), start_date.replace(day=1))` + 1

### Profile Selection

Fixed zone-based checkbox grid (same as custom pricing):

- SOUTH: BUSHILF, BUSLOLF, BUSMEDLF, BUSNODEM, RESLOWR
- CENTERPOINT (COAST): same profiles
- NORTH: same profiles
- WEST: same profiles

### Number of Meters

Counts unique ESIDs across all groups (not number of groups).

### Bulk Email Integration

`send_custom_pricing_email()` in `controllers/email_pricing.py` includes MSP records
for each broker after the B&E section.

## Frontend Flow

1. Enter customer name + select broker
2. Add start date groups via Manual / Upload / From Renewal
3. For each group: set start date, ESI ID(s), select profiles + volumes
4. Select target end month (default May)
5. Set AmeriPower/broker mills
6. Click Calculate MSP Rates → results table shows May'27 / May'28 / May'29 columns
7. Save Record → Send Pricing Email

## Conventions

- `terms` column stores end month number (1-12) as string
- `groups` column stores full JSON including profiles per group
- Profile keys must match `ref_profile_mappings.profile_key` (short names)
- Matrix pricing reuses `calculate_custom_price()` — no separate pricing engine
- N/A shown when matrix data unavailable for calculated term
  markdown# Sample Bill Module — AmeriPower

## Overview

Generates a sample electricity bill PDF for a customer given basic inputs.
Used to show customers what their bill will look like before they sign a contract.

## Tech Stack

- Backend: FastAPI, `routers/sample_bill.py`
- Frontend: `pages/custom_pricing/sample_bill.tsx`

## API Endpoints

| Method | Endpoint                    | Description             |
| ------ | --------------------------- | ----------------------- |
| POST   | `/api/sample-bill/generate` | Generate and return PDF |

## Request Payload

```json
{
  "name": "ABC Corp",
  "address": "123 Main St, Houston TX 77001",
  "rate": 0.075,
  "usage": 5000,
  "tdsp": 45.0,
  "fee": 9.95,
  "bill_month": "04/2026",
  "tax_exempt": 0
}
```

## Tax Exemption Options

| Value | Description | Taxes Applied              |
| ----- | ----------- | -------------------------- |
| 0     | Standard    | City + GRT + PUC           |
| 1     | Full Exempt | GRT + PUC only             |
| 2     | City Exempt | City + GRT + PUC, no State |
| 3     | All Taxes   | City + State + GRT + PUC   |

## Calculations

comm_charge = rate × usage
base = comm_charge + tdsp + fee
state_tax = base × 0.0625 (only if tax_exempt == 3)
city_tax = base × 0.01 (if tax_exempt == 0, 2, or 3)
puc_tax = base × 0.00167
grt = (base + state_tax + city_tax) × 0.01997
total_due = base + state_tax + city_tax + puc_tax + grt
avg_rate = (comm_charge + tdsp) / usage

## Bill Dates

- Bill date = 3rd of bill month (MM/03/YYYY)
- Due date = 18th of bill month (MM/18/YYYY)

## PDF Structure

1. Header — AmeriPower address, phone, email, outage contacts
2. Sample Bill title (red, centered)
3. Account info — Acct#, Bill#, Bill Date, ESI ID, customer name, address
4. Summary table — Previous Balance, New Charges, Payments, Due Amount, Due Date
5. Meter table — Meter#, Type, Dates, Reads, Multiplier, KWh, Demand, Energy Cost
6. Current Charges — itemized commodity, TDSP, base, taxes
7. Payment & Adjustments — Previous Balance, Total Current, Total Due (large)
8. Contract Details — bill period, usage, avg rate, amount
9. General Information — legal disclaimer text

## Frontend Flow

1. Enter customer name, address, bill month
2. Enter rate ($/kWh), usage (kWh), TDSP, base fee
3. Select tax exemption type
4. Live calculation preview updates as you type
5. Click Generate → PDF preview shown in iframe
6. Click Download PDF → saves to disk

## Conventions

- Rate input is $/kWh (not ¢/kWh) — matches original legacy system
- Usage is whole kWh
- All dollar amounts formatted to 2 decimal places
- PDF generated via reportlab on backend, streamed as blob to frontend
- Preview via `window.URL.createObjectURL` in browser iframe
