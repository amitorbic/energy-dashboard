# AmeriPower Commission Module — Knowledge Base

> Complete technical and business logic reference for the Commission Module.
> Use this document to onboard AI assistants or developers instantly.

---

## 1. System Overview

**Stack:**

- Backend: FastAPI + SQLAlchemy async + MySQL (aiomysql) on port 8001
- Frontend: Next.js + TypeScript + Tailwind on port 3000
- All routes registered under `/api` prefix in `main.py`
- Auth: Session-based via `utils/auth.py`, user info in `getUser()`

**Module location:**

- Backend: `ameripower-api/routers/commission.py` + `ameripower-api/controllers/commission.py`
- Frontend: `ameripower-app/pages/commission/`
- Shared layout: `ameripower-app/components/CommissionLayout.tsx`
- App wrapper: `ameripower-app/pages/_app.tsx` — auto-wraps all `/commission/*` routes with `CommissionLayout`

---

## 2. Business Context

AmeriPower is a Texas energy retailer. Brokers bring in customers and earn commissions based on kWh usage. Every month:

1. Supplier sends a commission file (Excel) with all broker/customer billing data
2. AmeriPower uploads it, audits it, calculates commissions, and pays brokers
3. Each broker receives a commission statement showing what they earned and what balance they carry

**Key concepts:**

- `vendor` = short commission ID assigned to a broker (e.g. V1, V2, V369)
- `vendor_id` / `broker_code` = supplier's broker identifier (e.g. V0364) — same field, different names in different tables
- `commission_flag = 1` in `broker_new` = broker receives commission emails
- `broker_status` in `comm_bank` = 0 if broker's `commission_status = 'false'`, else 1
- Payment is always stored as **negative** (money going out)
- Owed is always **positive** (commission earned)
- Balance = prev_balance + owed + payment (payment negative, so it subtracts)

---

## 3. Database Tables

### `comm_bank` — Commission file upload data

Primary table for monthly commission data. One row per customer per billing period.

| Column                | Type    | Notes                                             |
| --------------------- | ------- | ------------------------------------------------- |
| sid                   | int PK  | Auto increment                                    |
| vendor                | varchar | Short commission ID e.g. V1                       |
| vendor_id             | varchar | Supplier broker code e.g. V0364                   |
| vendor_name           | varchar | Broker company name from file                     |
| customer_id           | varchar | Customer identifier                               |
| premise_id            | varchar | ESID/premise identifier                           |
| bill_no               | varchar | Bill number                                       |
| first_name, last_name | varchar | Customer name                                     |
| company_name          | varchar | Customer company                                  |
| cust_status           | varchar | A=active, I=inactive, G=gone                      |
| service_start_date    | varchar | Service period start                              |
| service_end_date      | varchar | Service period end                                |
| commission_rate       | varchar | Rate in $/kWh                                     |
| commission_amount     | double  | Commission earned                                 |
| kwh_usage             | varchar | Usage in kWh                                      |
| month                 | varchar | Full month name e.g. 'April'                      |
| start_date            | date    | Upload start date (YYYY-MM-DD)                    |
| end_date              | date    | Upload end date (YYYY-MM-DD) — used for filtering |
| status                | int     | Default 1                                         |
| broker_status         | int     | 0=inactive broker, 1=active                       |

**Key filter pattern:** `end_date LIKE '2026-04-%'` for current month

### `summary_payments` — Broker balance sheet

Running ledger of payments and commissions per broker per month.

| Column    | Type    | Notes                        |
| --------- | ------- | ---------------------------- |
| sid       | int PK  | Auto increment               |
| vendor    | varchar | Short commission ID e.g. V1  |
| vendor_id | varchar | Broker code e.g. V0364       |
| month     | varchar | Format: 'Apr-26'             |
| payment   | varchar | Negative = payment received  |
| owed      | varchar | Positive = commission earned |
| balance   | varchar | Running balance              |
| comments  | varchar | Notes/adjustments            |
| status    | int     | Default 1                    |

**Balance formula:** `balance = prev_balance + owed + payment`
**Audit check:** For each row, verify `prev_balance + owed + payment == current_balance` (tolerance 0.02)

### `adjustments` — Manual adjustments

| Column   | Type    | Notes                         |
| -------- | ------- | ----------------------------- |
| sid      | int PK  |                               |
| vendor   | varchar | Short commission ID           |
| month    | varchar | Month abbreviation e.g. 'Apr' |
| owed     | varchar | Adjustment amount             |
| comments | varchar | Reason                        |

**Note:** Adjustments are now manual-only. They do NOT auto-apply to commission calculation. To apply an adjustment, use "Add Adjustment" button in Review Summary which inserts directly into `summary_payments.payment` column.

### `broker_new` — Broker database

Key commission-related columns:

| Column            | Notes                                           |
| ----------------- | ----------------------------------------------- |
| vendor            | Short commission ID — links to comm_bank.vendor |
| broker_code       | Supplier code — links to comm_bank.vendor_id    |
| company_name      | Broker company name                             |
| commission_email  | Email for commission statements                 |
| commission_flag   | 1 = send commission emails                      |
| commission_status | 'false' = inactive for commission               |
| terms_upfront     | Upfront payment terms                           |
| upfront_mills     | Mills rate for upfront payment                  |
| upfront_flag      | Upfront payment active flag                     |
| regular_status    | Master status: active/partial/inactive          |

### `user_log` — Audit trail

All actions in commission module logged with `flag = 'commission'`

| Column      | Notes                                   |
| ----------- | --------------------------------------- |
| uid         | User ID                                 |
| user_name   | Username                                |
| broker_name | Broker name (if applicable)             |
| action      | Description of action                   |
| date        | Unix timestamp as string                |
| flag        | 'commission' for all commission actions |

### `broker_logs` — Email send history

Commission emails logged with `email_type = 'commission'`

---

## 4. Module Flow (10 Steps)

```
Step 1: Upload Commission File
  → Excel parsed → saved to comm_bank
  → Pre-flight: check all broker codes exist in broker_new
  → Pre-flight: check vendor (commission ID) not blank
  → Duplicate month check (blocks re-upload)

Step 2: View Data / Commission Audit
  → Filter by vendor(s), period range, quick period (2/3/6/9/12 months)
  → Audit checkboxes: Duplicate | +/-30% Variance | Compare | Inactive

Step 3: Delete Data (optional)
  → Delete comm_bank rows for a specific month
  → Used to clear bad upload before re-uploading

Step 4: Insert Payments
  → Payment summary Excel uploaded
  → Row 1 col B = 'Commission Month', col C = month label e.g. 'Apr-26'
  → Data starts row 4: col B = vendor, col D = amount
  → Inserts/updates summary_payments with payment (stored negative)

Step 5: Adjustments (optional)
  → Manual add/delete in adjustments table
  → To apply: use "Add Adjustment" button in Review Summary
  → Goes to summary_payments.payment column as separate row

Step 6: Calculate Commission
  → Sums commission_amount from comm_bank per vendor for current month
  → Applies vendor roll-up rules (see section 5)
  → Looks up previous balance from summary_payments
  → Updates current month row: owed + balance
  → Requires payment to be uploaded first

Step 7: Review Summary
  → Per-broker balance sheet view
  → Default: last 12 months, + button for full history
  → Audit status: green ✓ if math correct, red ✗ if chain broken
  → Add Payment / Add Adjustment buttons → insert to summary_payments

Step 8: Email Commission Files
  → Generates Excel per broker (3 sheets)
  → Emails to broker_new.commission_email where commission_flag=1
  → Logged to broker_logs with email_type='commission'

Step 9: Download Commission Files
  → Manual download of commission Excel per broker

Step 10: Upfront History (pending)
  → Brokers paid upfront mills tracked separately
  → upfront_mills, terms_upfront, upfront_flag in broker_new
```

---

## 5. Business Logic

### Vendor Roll-up Rules

Some brokers have multiple vendor codes that roll up into one:

```python
VENDOR_ROLLUP = {
    "V91":  ["V90", "V92", "V101", "V105", "V130"],
    "V79":  ["V114", "V115", "V116"],
    "V117": ["V119", "V118"],
    "V56":  ["V0403", "V0409"],
}
```

Parent vendor's commission = own commission + sum of all children's commissions.

### Broker Sync Check (Upload Pre-flight)

```
For each vendor_id in uploaded file:
  1. Look up in broker_new.broker_code
  2. If NOT found → block upload, show "not in broker DB" error (red)
  3. If found but broker_new.vendor is blank → block upload, show "no commission ID" error (amber)
  4. If found and vendor exists → proceed
```

### Commission Rate Rules

- Rate >= 0.01 → Red anomaly (too high)
- Rate <= 0.001 or rate = 0 → Yellow anomaly (too low/missing)
- Rate between 0.001 and 0.01 → Normal ✅

### Balance Calculation

```
new_balance = prev_balance + owed + payment
# payment is negative, so it subtracts
# e.g. prev=-5000, owed=3000, payment=-3000 → balance=-5000
# e.g. prev=-5000, owed=3000, payment=-2000 → balance=-4000 (underpaid)
```

### Month Formats (IMPORTANT)

- `comm_bank.month` = full name: `'April'`
- `comm_bank.end_date` = date: `'2026-04-10'` (YYYY-MM-DD)
- `summary_payments.month` = short: `'Apr-26'`
- `adjustments.month` = abbreviation: `'Apr'`
- API month dropdown value = `'2026-04'` (YYYY-MM)
- Conversion: `datetime.strptime('2026-04', '%Y-%m').strftime('%b-%y')` → `'Apr-26'`

### Excel File Upload Formats

**Commission file (.xls or .xlsx):**

- Row 1 = header
- Data from row 2
- Col 1 = vendor_id (broker code e.g. V0364)
- Cols 2-42 = commission data fields mapping to comm_bank columns

**Payment summary file (.xls or .xlsx):**

- Row 1: blank(A1), 'Commission Month'(B1), 'Apr-26'(C1)
- Row 2: blank
- Row 3: headers
- Row 4+: data — col B = vendor (short code), col D = payment amount

### Excel Output File (Commission Statement)

3 sheets per broker:

1. **Summary** — last 12 months from summary_payments (payment, owed, balance, comments)
2. **Commission Details** — current month comm_bank rows for that broker
3. **Commission Analysis** — pivot: premise_id × month → commission_amount for last 12 months

Filename format: `CompanyName_Month_Year.xlsx` e.g. `Apex_Power_April_2026.xlsx`

---

## 6. API Endpoints

All routes under `/api/commission/`

| Method | Route                       | Description                               |
| ------ | --------------------------- | ----------------------------------------- |
| POST   | `/upload`                   | Upload commission Excel file              |
| GET    | `/data`                     | View comm_bank data with filters          |
| DELETE | `/data/month`               | Delete all rows for a month               |
| PUT    | `/data/{sid}`               | Edit a comm_bank row                      |
| DELETE | `/data/{sid}`               | Delete a comm_bank row                    |
| GET    | `/vendors`                  | Distinct vendors from comm_bank           |
| GET    | `/months`                   | Distinct months as {label, value} objects |
| POST   | `/payments/upload`          | Upload payment summary Excel              |
| GET    | `/adjustments`              | List adjustments                          |
| POST   | `/adjustments`              | Add adjustment                            |
| DELETE | `/adjustments/{sid}`        | Delete adjustment                         |
| POST   | `/calculate`                | Run commission calculation                |
| GET    | `/summary`                  | Review summary (vendor + month filter)    |
| GET    | `/summary/months`           | Distinct months from summary_payments     |
| GET    | `/summary/history/{vendor}` | Full history for a vendor                 |
| POST   | `/summary/payment`          | Add manual payment/adjustment             |
| GET    | `/exceptions`               | Run all exception checks for a month      |
| POST   | `/email`                    | Send commission emails to brokers         |
| GET    | `/download/{vendor}`        | Download commission Excel for a broker    |
| GET    | `/logs/user`                | User action log (flag=commission)         |
| GET    | `/logs/email`               | Email send log (email_type=commission)    |

---

## 7. Frontend Pages

All pages at `pages/commission/` — wrapped automatically by `CommissionLayout` via `_app.tsx`

| File                   | Route                          | Description                                           |
| ---------------------- | ------------------------------ | ----------------------------------------------------- |
| `index.tsx`            | `/commission`                  | Dashboard — pipeline status, stat cards, module links |
| `upload.tsx`           | `/commission/upload`           | Upload commission file                                |
| `view.tsx`             | `/commission/view`             | View/filter data, audit checkboxes, download          |
| `exceptions.tsx`       | `/commission/exceptions`       | Commission exceptions audit engine                    |
| `delete.tsx`           | `/commission/delete`           | Delete month data                                     |
| `payments.tsx`         | `/commission/payments`         | Upload payment summary                                |
| `adjustments.tsx`      | `/commission/adjustments`      | Manual adjustments CRUD                               |
| `summary.tsx`          | `/commission/summary`          | Review summary — broker balance sheet                 |
| `calculate.tsx`        | `/commission/calculate`        | Run commission calculation                            |
| `email-commission.tsx` | `/commission/email-commission` | Email commission files to brokers                     |
| `download.tsx`         | `/commission/download`         | Manual download per broker                            |
| `user-log.tsx`         | `/commission/user-log`         | User action audit trail                               |
| `email-log.tsx`        | `/commission/email-log`        | Email send history                                    |

---

## 8. Commission Exceptions Engine

Runs 8 automated checks against comm_bank for a given month:

| Exception           | Logic                                                                  | Severity |
| ------------------- | ---------------------------------------------------------------------- | -------- |
| Duplicate           | Same premise_id + service_start + service_end across different months  | High     |
| Variance 30%        | Commission changed >=30% vs prior month for same premise (amount >$30) | Medium   |
| Inactive Customer   | cust_status = 'I' or 'G'                                               | Medium   |
| Zero Commission     | cust_status = 'A' but commission_amount = 0                            | Medium   |
| Negative Commission | commission_amount < 0                                                  | High     |
| Expired Contract    | contract_end_date < today                                              | Medium   |
| Rate Anomaly        | rate >= 0.01 = red, rate <= 0.001 or = 0 = yellow                      | Variable |
| Missing Data        | blank premise_id, commission_rate, or kwh_usage                        | Low      |

Each exception row is editable/deletable directly in comm_bank.
Summary bar shows count per exception type.
Full history scans last 6 months for duplicate/variance checks.

---

## 9. Email System

**SMTP config** (from `.env`):

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=Ameripower Pricing <pricing@ameripower.com>
```

**Commission email pattern:**

- Uses `send_email_async` from `controllers/email_pricing.py`
- Sends to `broker_new.commission_email` where `commission_flag = 1`
- Attaches generated Excel file
- Logs to `broker_logs` with `email_type = 'commission'`
- Subject: `Commission Statement — {company_name} — {month}`

---

## 10. Key Conventions

**Backend:**

- Static routes always BEFORE dynamic `/{id}` routes in routers
- All DB queries use `text()` with named params — no f-string SQL
- All user actions logged to `user_log` with `flag = 'commission'`
- Excel files: `.xls` → xlrd, `.xlsx` → openpyxl (handled by `_load_workbook_rows()`)
- `_current_month_short()` → `'Apr-26'`
- `_current_end_date_pattern()` → `'2026-04-%'`
- `_month_short_to_full('Apr-26')` → `'April'`

**Frontend:**

- All commission pages use `CommissionLayout` (injected via `_app.tsx`)
- Vendor dropdown type: `{ vendor: string, company_name: string }`
- Month dropdown type: `{ label: string, value: string }` — value is `'2026-04'` format
- `uid` and `userName` come from session (currently hardcoded as 1/'admin' — replace with real auth)
- No `any` types — use defined interfaces
- `key` props always use unique stable identifiers

---

## 11. Known Issues / Future Work

1. **Upfront History page** — not yet built. Fields in broker_new: `terms_upfront`, `upfront_mills`, `upfront_flag`, `discount_upfront`, `payment_term`
2. **Modify Email List** — page not yet built. Should allow editing `commission_email` per broker
3. **uid/userName** — hardcoded as 1/'admin' in all commission pages. Replace with real session values from `getUser()` in `utils/auth.ts`
4. **Commission Analysis pivot dates** — service dates show as Excel serial numbers for some records — cast to string before writing
5. **Vendor roll-up rules** — currently hardcoded in `VENDOR_ROLLUP` dict. Consider moving to a DB table for easier management
6. **Calculate commission re-run** — if run twice in same month, creates duplicate rows. Add duplicate check before insert
7. **Compare audit mode** — checkbox exists in View Data but backend logic not fully implemented
8. **Upload Files for Brokers** — old PHP feature may have saved files to server path. Check if still needed

---

## 12. Data Migration Notes

- `summary_payments` was migrated from `summary_payment.summary_payments` DB (23,346 rows, data up to Dec-20)
- Old `weighted_avg.summary_payments` was wrong source — do not use
- `adjustments` table was truncated — old migrated data had wrong month formats
- `comm_bank` contains historical data from 2012 — do not truncate
- Month format in historical `summary_payments`: `Apr-26`, `Dec-20` etc. (consistent)
- Some old records have `May-2010` format (4-digit year) — handle in queries

---

_Last updated: April 2026_
_Module status: ~85% complete — Upfront History and Modify Email List pages pending_
new update:
New flow — upload auto-calculates, no blank sheet needed
Payment upload — user selects month, validated against comm_bank
Calculate commission — uses latest month from comm_bank automatically
Delete row — auto-recalculates vendor summary
Download payment sheet — generated after upload with broker balances
Vendor dropdown fix — joins on bn.vendor = cb.vendor not broker_code
Sort order — STR_TO_DATE ASC for correct month ordering
Month formats — all confirmed and documented
Known issues resolved — NULL owed fixed, duplicate vendors fixed
Module status — update to ~90% complete, Upfront History + Modify Email List still pending
