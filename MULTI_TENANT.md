# Multi-Tenant Architecture — Progress & Status

**Last updated:** 2026-06-30  
**Branch:** master  
**Covers sessions from:** initial architecture planning through Phase 6 enrollment engine

---

## 1. Original Plan (Phase 1–5 as scoped)

The goal was to convert the single-tenant AmeriPower codebase into a multi-REP SaaS platform where the same deployed codebase could serve multiple Retail Electric Providers (REPs) as tenants.

| Phase | Scope |
|-------|-------|
| 1 | Middleware-based tenant routing: subdomain → DB lookup → per-request `request.state.*` |
| 2 | Tenant provisioning script (DB creation, .env generation, Nginx config) |
| 3 | Feature work dependent on tenant context: VENDOR_ROLLUP, TDSP emails, meter_fee_schedule |
| 4 | Frontend/UX: mills label rename, dynamic company name, full branding sweep |
| 5 | Ingest script parameterization: standalone data/ingest scripts in `api/` still using hardcoded values |
| 6 | Enrollment engine: MassRoll generation, batch management, customer profile, ERCOT submission pipeline foundation |

---

## 2. What Actually Got Built

### Phase 1 (original): Middleware-based tenant routing — BUILT, TESTED, AND DELIBERATELY SUPERSEDED

Built a subdomain-based routing layer:
- `api/middleware/auth.py` — extended to extract tenant from Host header
- Lookup against `ameripower_master.reps` table (separate master DB)
- Per-request `request.state.company_name`, `request.state.rep_id`, etc.
- Tested locally with a passing isolation test suite

**Why it was superseded:** After Phase 1 was complete and working, an audit/compliance concern was raised. With a shared-codebase, single-DB, row-filtered approach, one misconfigured query or a missing WHERE clause could return another tenant's customer data. For a licensed Texas REP handling regulated utility contracts, that's an unacceptable risk. The team made a deliberate architectural decision to move to full deployment-per-tenant isolation instead. Phase 1 was a sound implementation of the original design — the design itself changed based on stronger compliance requirements.

---

### Mid-project architecture pivot: Deployment-per-tenant

**Decision:** Instead of one running process serving all tenants by subdomain, each REP gets:
- Its own FastAPI process on its own port
- Its own MySQL database (already the case — existing per-REP DBs)
- Its own `.env` file with all identity and config baked in at deploy time
- Nginx routing: `consumer.enertsol.in` → port 8001 (ORBIC), `tenant2.domain.com` → port 8002, etc.

**What was removed:**
- Middleware subdomain-lookup logic (moved to Nginx layer)
- `request.state.company_name` pattern throughout controllers/routers
- Per-request tenant DB switching

**What was built instead (Stages 1–3):**

**Stage 1 — Tenant identity via environment:**
- `TENANT_REP_ID`, `TENANT_COMPANY_NAME` in `api/.env`
- `TENANT_REP_ID` added to JWT payload and `LoginResponse` schema
- Middleware (`api/middleware/tenant.py`) validates JWT `rep_id` matches `TENANT_REP_ID` — any cross-tenant token is rejected with 403
- `TENANT_COMPANY_NAME` read at login → included in JWT → stored in localStorage as `ap_user.company_name` → used by frontend for dynamic labels

**Stage 2 — Frontend API client isolation:**
- `NEXT_PUBLIC_API_URL` is baked at Next.js build time — a single build can't serve multiple tenants with different backend ports
- Replaced all `fetch(\`${API}/...\`)` calls with a shared `app/utils/api.ts` axios client using `baseURL: "/api"` (relative URL)
- Nginx `location /api/` block proxies to the correct per-tenant port — no Next.js rewrites needed
- 12 commission pages converted in Stage 2; 5 more pages converted in Phase 4 (see below)

**Stage 3 — Database isolation:**
- `api/utils/database.py` uses `DB_NAME` env var (not per-request lookup)
- Engine is cached; all queries go to the tenant's own DB
- `api/utils/master_db.py` — utility for the master DB (tenant registry lookups, subdomain resolution); kept separate from the per-tenant DB session

---

### Phase 2: Tenant provisioning script — BUILT AND TESTED

`api/scripts/provision_tenant.py` — CLI script to onboard a new REP:
- Creates the tenant DB and user
- Generates a pre-filled `.env` file
- Outputs Nginx config block

Tested with a "Test REP" tenant. The Nginx config block is generated but Nginx itself is not yet automatically configured — that step is still manual (see Open Items).

---

### Phase 3: Feature work — MIXED RESULTS

**VENDOR_ROLLUP — REMOVED:**
Dead code discovered during audit. The vendor rollup aggregation was never used by any active workflow. Removed rather than parameterized.

**TDSP notification emails — BUILT BUT DISABLED:**
The email routing to TDSP-specific addresses (`TDSP_EMAIL_ONCOR`, `TDSP_EMAIL_CENTERPOINT`, etc.) was built and wired into the `.env`. Disabled in the current deployment because the actual TDSP contact addresses for ORBIC were not available and test sends were bouncing. The env vars are present and wired; they just need real addresses filled in.

**meter_fee_schedule — BUILT AND TESTED:**
Meter fee schedule management (upload, view, apply to contracts) fully implemented and tested.

---

### Phase 4: Mills rename, dynamic branding, full AmeriPower → ORBIC sweep

**Context:** AmeriPower (the previous brand/entity) is no longer ORBIC's operating identity — the company now operates as ORBIC. The codebase was originally written under the AmeriPower brand and still contained that branding throughout. All AmeriPower branding in customer-facing content (emails, PDFs, filenames) needed to be replaced with ORBIC. Because no real ORBIC business details were provided for the parameterized fields, placeholder values were used — clearly fake enough to be recognized as such.

**Mills label rename:**
- Internal label "AmeriPower Mills" → dynamic `{company_name} Mills`
- `company_name` flows: `TENANT_COMPANY_NAME` env var → read at login → JWT claim → `ap_user.company_name` in localStorage → `getUser()?.company_name` in 6 frontend mill-label locations
- No hardcoding; changing `TENANT_COMPANY_NAME` in `.env` changes the label site-wide

**Email routing system (`api/utils/email_routing.py`):**
- `get_tenant_email(purpose)` — reads `TENANT_EMAIL_{PURPOSE}` then falls back to `TENANT_EMAIL_DEFAULT`; raises `RuntimeError` if neither set (loud failure, no silent wrong-address sends)
- Removed all hardcoded `@ameripower.com` addresses from email-sending code
- `send_email()` / `send_email_async()` now use `get_tenant_email(purpose)` for the SMTP envelope; `msg["From"]` is formatted with `TENANT_COMPANY_NAME` as display name
- Fail-fast pattern: `get_tenant_email()` called *before* per-broker loops in `commission.py` and `email_pricing.py` — a missing env var fails the whole batch with HTTP 500, not per-broker HTTP 200 with silent failures in the results body
- 12 tests cover routing logic and SMTP From header formatting; all pass

**`TENANT_DISPLAY_NAME` / `TENANT_COMPANY_NAME` split:**
- `TENANT_COMPANY_NAME` — internal use: SMTP From display name, JWT payload, mills labels in UI
- `TENANT_DISPLAY_NAME` — customer-facing use: email subjects, PDF body text, downloaded filenames
- Split exists for tenants that want different internal vs customer-facing names; for ORBIC both are currently `"ORBIC"`

**New helper functions in `api/utils/email_routing.py`:**
- `get_tenant_display_name()` — falls back `TENANT_DISPLAY_NAME` → `TENANT_COMPANY_NAME` → `"AmeriPower"`
- `get_tenant_website()` — `TENANT_WEBSITE` env var
- `get_tenant_address()` — `TENANT_ADDRESS` env var
- `get_tenant_phone()` — `TENANT_PHONE` env var
- `filename_safe(name)` — strips characters invalid in filenames; `"ORBIC (Test)"` → `"ORBIC_Test"`

**Branding changes applied:**

| File | What changed |
|------|-------------|
| `routers/contracts_confirm.py` | Email subjects, PDF body paragraphs, sign-offs, website link, address, phone — all use `get_tenant_*()` helpers; two `# Fallback template data` comment blocks mark future custom-template insertion points |
| `controllers/commission.py` | "AmeriPower Team" sign-off in commission email body → `{_tenant_name} Team` |
| `controllers/email_pricing.py` | Email subjects, Excel filename |
| `routers/email_pricing.py` | Email subject in custom pricing endpoint |
| `routers/daily_pricing.py` | Excel download filename |
| `controllers/billing.py` | "Billing Exception Report" header, "Automated Billing System" footer |
| `routers/sample_bill.py` | `get_tenant_email('operations')` already applied; legal boilerplate blocks marked **ORBIC-specific** with comments (see Open Items) |

**5 additional frontend files converted from `NEXT_PUBLIC_API_URL` to `api.ts`:**
- `app/pages/payments/index.tsx`
- `app/pages/past-due/index.tsx`
- `app/pages/past-due/[id].tsx`
- `app/pages/past-due/approvals.tsx`
- `app/components/ColumnMapper.tsx`

These completed the Stage 2 work; zero `NEXT_PUBLIC_API_URL` or `const API =` patterns remain in any `.ts`/`.tsx` file.

---

### Phase 5: Ingest script parameterization — DONE

**Scope:** 20 standalone pipeline scripts in `api/` using hardcoded DB credentials, local file paths, and forecast dates.

**Category 1 — Hardcoded `DB_NAME` fallback removed (16 scripts):**
All 16 scripts containing `os.getenv("DB_NAME", "u972964962_orbic")` have been updated to `os.getenv("DB_NAME")` with an explicit `SystemExit` guard immediately after the assignment. A missing `DB_NAME` env var now fails loudly at startup rather than silently connecting to the wrong tenant's database.

Scripts fixed: `build_layer1_dna.py`, `build_layer2_growth.py`, `build_patterns.py`, `calculate_ercot_shape.py`, `forecast_analog.py`, `forecast_today.py`, `forecast_vs_actual.py`, `generate_holidays.py`, `ingest_ercot_forecast.py`, `ingest_ercot_settlement.py`, `ingest_lfc.py`, `ingest_load.py`, `ingest_weather.py`, `populate_customer_forecast_dates.py`, `populate_portfolio_load_annual.py`, `process_settlement.py`.

The remaining 4 scripts (`migrate_prior_heat_rates.py`, `zone_mapping.py`, `migrate_parsed_bills_v2.py`, `migrate_parsed_bills_v3.py`) were already clean — they either use `DATABASE_URL` directly, inherit from `utils.database`, or have no DB connection.

**Category 2 — Hardcoded local file paths parameterized (2 scripts):**
- `ingest_lfc.py` — `LFC_FOLDER` now reads from `os.getenv("LFC_FOLDER", ...)` with the local desktop path kept as default; `Path.exists()` guard added so a missing folder exits with a clear message naming the env var to set
- `ingest_load.py` — same pattern with `LOAD_FOLDER` env var

**Category 3 — Hardcoded forecast dates — partial:**
- `forecast_vs_actual.py` — `FORECAST_DATE = date(2026, 4, 16)` replaced with a `--date` CLI arg (default: yesterday). Max-date guard added up front: if the requested date exceeds the latest row in `ercot_load_history`, the script exits immediately with a message naming `ingest_ercot_settlement.py` as the fix. Script is now a reusable operational accuracy-measurement tool for any date with loaded data.
- `forecast_analog.py` and `forecast_today.py` — archived, not generalized. See section below.

**Additional fixes applied during Phase 5 audit:**
- `test_php_compare.py` — hardcoded credentials (`amit.kumar.jha20@gmail.com` / `123456`) replaced with `PHP_PORTAL_USER` / `PHP_PORTAL_PASS` env vars (both already present in `api/.env`); login URL moved to `PHP_PORTAL_URL` env var with the portal URL kept as default
- `ingest_weather.py` — `END_DATE = date(2026, 3, 31)` replaced with `date.today()` so the script always ingests through the current date without manual updates

---

### Historical snapshots — do not generalize or run for new dates

Two scripts from the Category 3 audit are frozen one-off analyses written for specific April 2026 dates. They were not modified and should not be used as templates:

**`forecast_analog.py`** — Analog-day forecast anchored to April 9/16, 2026. Contains a hardcoded `APR9_ACTUAL` dict (24 hours of pasted actual ERCOT load values for April 9) and an `apr16_lfc` LFC data dict. `BASE_DATE = date(2026, 4, 9)` and `FORECAST_DATE = date(2026, 4, 16)` are baked into the inline data — changing the dates without replacing the data dicts produces nonsense. This was a one-off analysis run when those dates were current. Archive or delete once confirmed no longer needed.

**`forecast_today.py`** — One-day load forecast for April 16, 2026. Contains a hardcoded `TODAY_TEMPS` dict of hand-entered hourly temperatures for each ERCOT weather zone on that specific day. Changing `FORECAST_DATE` without re-entering the weather data would produce a forecast driven by wrong temperatures. Archive or delete once confirmed no longer needed.

`forecast_vs_actual.py` was in this category but was successfully generalized because it pulls all three data sources — actual load, actual weather, and historical patterns — from the database rather than from inline dicts.

---

### Phase 6: Enrollment engine — BUILT

**Context:** ORBIC's existing enrollment workflow was a fully manual process: staff would fill in a MassRoll Excel file, import it into an external processing system, generate EDI files, transfer them to an EDI server, and monitor ERCOT's portal the next day. Phase 6 builds the internal tooling to manage, track, and eventually automate that pipeline.

**Enrollment Audit renamed and moved:**
The existing enrollment audit page was relocated from its previous route to `/enrollment-audit` to make room for the new enrollment engine at `/enrollment`.

**MassRoll Generator (`/enrollment` — `api/routers/enrollment_engine.py`):**
- Pulls all `confirmation_log` records with `enroll_check = 0` (pending enrollment) within a date range
- Expands comma-separated ESIID blobs into one row per ESI ID
- Looks up `plan_group` per individual ESI from `contract_renewal` (avoids the broken multi-ESID JOIN)
- Generates the 128-column MassRoll XLSX in the 2016 `enrolment_queue` format (row 1 = title, row 2 = headers, data from row 3)
- Rate stored as ¢/kWh in `confirmation_log`; divided by 100 to $/kWh for column DW in the XLSX
- `plan_id1` (column AQ) hardcoded to `"PNCPOSTPAY"` for all records
- `enroll_product` (column DU) filled via meter fee + LMP flag lookup against internal Python dicts (`_PR_LMP0/1/2`) — not from the `plan_codes` table
- `plan_codes` table is used only in the `/pending` view to show `suggested_plan` and `paired_plan` hints to staff; it has no role in XLSX generation

**New tables:**
- `plan_codes` — 27 rows mapping meter fee amounts to plan IDs and plan names; supports LMP=0/1/2 variants and paired plan relationships
- `enrollment_batches` — one row per generated MassRoll; tracks batch number, generated by, record count, date range, status (`generated` → `submitted` → active/cancelled), and `submitted_at`
- `customers` — one row per ESI ID enrolled; 23 columns including `customer_id` (YYMMDD + 4-digit zero-padded daily sequence, e.g. `2606290001`), all billing/contact fields, `plan_id`, `plan_group`, `batch_no`, `status` (`pending` → `active` / `cancelled`)

**Customer ID generation:**
At MassRoll creation time, each expanded ESI row gets a `customer_id` assigned and inserted into `customers` with status `pending`. The ID uses today's date prefix and a COUNT-based daily sequence that resets each day. The customer ID does not appear in the XLSX — it is ORBIC-internal only.

**Batch Management (`/enrollment/batches`):**
- Lists all generated batches with status badges, record count, date range, submitted timestamp
- "Mark Submitted" button transitions a batch from `generated` → `submitted` (writes `submitted_at`)
- "View ESI IDs" links to the per-batch detail page

**Per-batch ESI view (`/enrollment/batches/[batch_no]`):**
- Shows every `customers` row in that batch
- "Mark Active" → `POST /enrollment-engine/activate/{customer_id}`: fetches contract rate from `confirmation_log` (LIKE-based multi-ESID matching, ¢/kWh → $/kWh), INSERTs or UPDATEs `contract_renewal`, sets customer status `active`
- "Mark Cancelled" → sets customer status `cancelled`
- Action buttons hidden once status leaves `pending`

**`confirmation_log` schema enriched:**
8 new columns added for enrollment data capture (internal only — not in customer-facing email or PDF):
`billing_address`, `billing_city`, `billing_state`, `billing_zip`, `plan_group`, `plan_id`, `cust_first_name`, `cust_last_name`

Plus `send_to_email VARCHAR(500)` — persists the broker recipient address so edit-loads restore the exact original recipient without a live broker table lookup.

All 9 new fields are wired into the `fields` dict in `send_confirmation_email` so they are saved on every INSERT/UPDATE.

**Contract send form improvements (`app/pages/contracts/send.tsx`):**
- New **Customer Details** section (between "Customer & Billing" and "Profile & Volume") with all 8 enrollment fields; optional, no validation, labelled "Auto-populated on upload — staff may fill manually"
- Broker email auto-populated: `handleBrokerChange` runs on broker select (new sends) and on edit-load (resends) — fills `send_to_email` and `broker_split` from `broker_new` table
- Edit-load restores `send_to_email`: uses persisted `confirmation_log.send_to_email` if present; falls back to live broker lookup for older records
- **Revision naming**: when editing an existing record (`sid` in query), `customer_name` is automatically incremented — `"ABC Corp"` → `"ABC Corp - R1"` → `"ABC Corp - R2"` etc. Staff sees the revised name pre-populated and can change it
- **Duplicate send fix**: if the DB write succeeds but SMTP fails, the backend now returns HTTP 200 with `{"sid": <sid>, "status": "saved_no_email", "message": "..."}` instead of HTTP 500. Frontend stores the `sid` in form state; on retry, payload includes `sid` → backend does UPDATE not INSERT
- **Success screen**: Step 3 now shows `Email sent to: {broker_name} <{send_to_email}>` so staff can confirm exactly who received it

**Pending items for enrollment engine (not yet built):**
- ERCOT submission automation
- CSV generation alongside Excel (next task)
- Switch vs Move-in determination per ESI ID
- EDI file generation (814-01 and 814-16)
- EDI file transfer to EDI server
- ERCOT status polling (In Review / Scheduled / Cancelled / Unknown)
- Upload/review automation for Customer Details fields
- ERCOT confirmation intake mechanism

---

## 3. Current Tenant Identity Env Var Inventory

All vars live in `api/.env`. One `.env` per deployed REP process.

| Env var | Purpose | ORBIC placeholder value |
|---------|---------|------------------------|
| `TENANT_REP_ID` | JWT validation — reject tokens from other tenants | `1` |
| `TENANT_COMPANY_NAME` | Internal label: SMTP From header, JWT payload, mills UI labels | `ORBIC` |
| `TENANT_DISPLAY_NAME` | Customer-facing: email subjects, PDF body, downloaded filenames | `ORBIC` |
| `TENANT_WEBSITE` | Welcome letter PDF and email contact section | `www.orbic.com` |
| `TENANT_ADDRESS` | Welcome letter PDF sign-off | `123 Main Street, Houston, TX 77001` |
| `TENANT_PHONE` | Welcome letter PDF and email contact sections | `(555) 000-0000` |
| `TENANT_EMAIL_DEFAULT` | Fallback From address for all outbound email | `info@enertsol.com` |
| `TENANT_EMAIL_COMMISSION` | Commission email sender (overrides DEFAULT if set) | *(unset → uses DEFAULT)* |
| `TENANT_EMAIL_PRICING` | Pricing email sender | *(unset → uses DEFAULT)* |
| `TENANT_EMAIL_OPERATIONS` | Operations/contract email sender | *(unset → uses DEFAULT)* |
| `TDSP_EMAIL_ONCOR` | TDSP notification routing (disabled — addresses unknown) | *(empty)* |
| `TDSP_EMAIL_CENTERPOINT` | Same | *(empty)* |
| `TDSP_EMAIL_AEP` | Same | *(empty)* |
| `TDSP_EMAIL_TNMP` | Same | *(empty)* |
| `CONSUMER_NOTIFY_EMAIL` | Consumer portal notification recipient | `amit@enertsol.com` |

All values for ORBIC are clearly placeholder — `www.orbic.com`, `123 Main Street`, `(555) 000-0000` are not real business details. Real values should be supplied during formal onboarding.

---

## 4. Known Open Items / Not Yet Done

### Enrollment engine — pending items

| Item | Notes |
|------|-------|
| CSV generation | Generate `massrollMMDDYYYY.csv` alongside the Excel at MassRoll creation time. The CSV (not the XLSX) is what gets uploaded to the processing system for enrollment. |
| Manual CSV upload | A page in the enrollment module where staff can upload the CSV manually if needed (before automation is ready). Should store the file and record which batch it belongs to. |
| ERCOT API integration | "Mark Submitted" currently just updates batch status. Real implementation replaces this single endpoint with a direct ERCOT API call — the rest of the UI flow stays the same. |
| Switch vs Move-in determination | Currently hardcoded as `S` (Switch) in `enrol_type` column. Needs per-ESI ERCOT status check before submission: Active → Switch, De-Energized → Move-in (exception: demand meter reset requires Move-in even when Active). |
| EDI file generation | 814-01 and 814-16 files after batch enrollment is confirmed by ERCOT. |
| EDI file transfer | Upload generated EDI files to EDI server after generation. |
| ERCOT status polling | Next-day check on ERCOT portal per batch: In Review / Scheduled / Cancelled / Unknown → update `customers.status` accordingly. In Review: contact TDSP (possible city permit needed). Cancelled: contact TDSP, may need re-submit. Unknown: void in processing system and re-enroll. |
| Upload/review automation | Auto-populate Customer Details fields (`billing_address`, `billing_city`, `billing_state`, `billing_zip`, `plan_group`, `plan_id`, `cust_first_name`, `cust_last_name`) in `confirmation_log` from uploaded contract — eliminates manual entry in the contract send form. |
| ERCOT confirmation intake | Automated mechanism to receive ERCOT's enrollment confirmation and update `customers.status` to `active` without the manual "Mark Active" step in the per-batch view. |

---

### Cleanup — scripts to remove once no longer needed

- **`test_php_compare.py`** — dev/comparison utility that hits the live PHP portal to count billing rows. Credentials are now in env vars (`PHP_PORTAL_USER`, `PHP_PORTAL_PASS`), but the script itself has no place in the production codebase. Remove from the repo once online testing is complete; the file should not be deployed to production.
- **`forecast_analog.py`** — historical snapshot (see archived section above). Delete once confirmed the April 2026 analysis is no longer needed.
- **`forecast_today.py`** — historical snapshot (see archived section above). Delete once confirmed the April 2026 analysis is no longer needed.

### Branding — logo, fax, legal entity name

| Missing env var | What it covers | Where it's hardcoded |
|-----------------|---------------|----------------------|
| `TENANT_LOGO_URL` | Logo image in commission and pricing emails | `commission.py:1878`, `email_pricing.py:118`, `contracts_confirm.py:141,303` — all point to `https://ameripowerpricing.com/images/...` |
| `TENANT_FAX` | Fax number in welcome letter sign-off | `contracts_confirm.py` — `"Fax 281 240 0455"` still hardcoded alongside `{_phone}` |
| `TENANT_LEGAL_NAME` | Legal entity name in customer-facing PDFs | `sample_bill.py:122,406,411`, `broker_pricing.py:405,414,438` — marked with `# ORBIC-specific` comments; these contain registration year and PUC license number too |
| `TENANT_PUC_LICENSE` | PUCT license number | Same locations as above |

`sample_bill.py` and `broker_pricing.py` legal blocks were intentionally deferred — they contain multiple tenant-specific legal facts (entity name, registration year, PUC number) and need a decision on whether to use 4 env vars or mark as ORBIC-only-for-now.

### Per-tenant custom template/language system (explicitly deferred)
The branding env vars built in Phase 4 are the **fallback default layer**. A future feature will let each REP upload or define custom email/document templates; when present, those take priority over the env var fallback. The `# Fallback template data — replace with per-tenant custom template when that feature is built.` comment blocks in `contracts_confirm.py` mark the intended insertion points. This feature has not been started.

### Nginx onboarding automation
`provision_tenant.py` generates the Nginx config block as text output. The actual Nginx `sites-available` file is still updated manually. Extending the provisioning script to write and reload Nginx config is straightforward but not done.

### Dual alert system (never started)
A platform-level alert system (`PLATFORM_ALERT_EMAIL`, `send_alert()`) was scoped for sending operational alerts (errors, thresholds) to the platform operator separately from tenant-facing emails. No code exists for this.

### Production SQL migration — pending on live Hostinger DB
Two schema changes have been applied to the dev DB but not yet to the live Hostinger production DB:
- `custom_pricing` table: new columns for per-customer pricing
- `enrollment` table: `ameripower_mill` column rename (mills label column)

These need to be run manually against `u972964962_orbic` on Hostinger before deploying Phase 4 work to production.

### 7 dangling navigation links (pre-existing, not caused by this work)
Confirmed via git history: these page files were never created. Navigation links exist but point to non-existent routes:

| Route | Nav location |
|-------|-------------|
| `/past-due/reports/aging` | `PastDueLayout.tsx:12` |
| `/past-due/reports/arr` | `PastDueLayout.tsx:13` |
| `/past-due/reports/etf` | `PastDueLayout.tsx:14` |
| `/commission/broker-files` | `CommissionLayout.tsx:15`, `CommissionSidebar.tsx:13`, `commission/index.tsx:77` |
| `/commission/upfront` | Same three files |
| `/commission/email-list` | Same three files |
| `/commission/email-log` | Same three files |

---

## 5. Important Corrections and Lessons from This Session

**ORBIC vs AmeriPower identity.** AmeriPower (the previous brand/entity) is no longer ORBIC's operating identity. All "AmeriPower" branding found in customer-facing code was a historical artifact from the original build. This is why the branding sweep in Phase 4 replaced it with ORBIC placeholder values rather than treating "AmeriPower" as a configurable brand to preserve.

**Audit findings need an explicit fixed/deferred status, not just documentation.** The login page wordmark (`app/pages/login.tsx`) was identified during a branding audit and noted in session records — but it was never actually changed. It remained `Ameri<span>Power</span>` until a follow-up question surfaced it weeks later. Audits that produce a list of findings are only useful if each finding is tagged: fixed in this session, deferred to ticket X, or explicitly out of scope. A finding that is neither fixed nor formally deferred is effectively invisible to the next person picking up the work.

**Audit vs actual reality gaps.** Line number references in session notes (e.g., "fix `contracts_confirm.py:815`") frequently drifted from actual current line numbers as edits accumulated. Always re-read before editing rather than trusting audited line numbers from an earlier pass.

**`send_email_async` positional argument trap.** When `purpose` was added as a new parameter, it was inserted before `attachment` in the signature. Any existing caller passing `attachment` positionally (as the 4th arg) would silently pass it as `purpose`. All such call sites had to be converted to keyword args at the same time as the signature change. This is a reminder to audit all call sites before changing function signatures with optional parameters.

**`get_tenant_email()` inside per-item loops = quiet batch failure.** When an email helper that can raise is called inside a `try/except` that catches per-broker exceptions, a missing env var produces HTTP 200 with all items in the failure list — indistinguishable from a real partial failure. The fix (call once before the loop, fail the whole batch immediately) is both simpler and more honest.

**`NEXT_PUBLIC_API_URL` is baked at build time.** A Next.js build with `NEXT_PUBLIC_API_URL=http://127.0.0.1:8001` produces that literal string in the client bundle. Every browser call from a deployed user's machine hits their local port 8001, which doesn't exist. The solution is the relative-URL `api.ts` client + Nginx proxy, not a smarter env var strategy.

**`contracts_confirm.py` is a router, not a controller.** The file is in `api/routers/`, not `api/controllers/` — several audit passes referenced the wrong path. Similarly, there are two `email_pricing.py` files: `controllers/email_pricing.py` (business logic, broker loops) and `routers/email_pricing.py` (FastAPI endpoint handlers). Both needed the same branding fix and both were caught by the final grep.

---

## 6. Enrollment Engine — ERCOT Submission Reference Workflow

> This documents the manual ERCOT enrollment process that ORBIC's enrollment engine is designed to replace and automate. Use this as the reference for what each system component needs to do.

---

### PRE-SUBMISSION STEPS

**1. Enter ESID into MassRoll tab.** Make sure to change Batch Number and Agent code among all other info.
- a. Check ERCOT to see if Active or De-Energized
- b. Check if Address matches the Contract

**2. Switch or Move-in?**
Switch when Active; Move-in for De-Energized (except when customer needs to reset demand meter).
- a. First Available Switch Date — 3 business days
- b. Next Meter Read Cycle (check with TDSP)
- c. Self-Selected Date
- d. Priority Move-In — done by end of day (extra charge — use Priority Codes)

**3. Finish MassRoll tab:**
- a. Pay attention to contract type (R = Residential, C = Commercial). Residentials don't get certain taxes.
- b. Enter Billing Address, not service address.
- c. Be VERY careful with Rates and Agent Commissions.
- d. Check contract to ensure correct Plan Codes.
- e. Make sure batch numbers are right.

---

### SUBMISSION STEPS

**Save files:**
- Save As `massrollMMDDYYYY` in Excel format
- Save As `massrollMMDDYYYY` in CSV format

**In the enrollment processing system:**

Upload:
```
Process → Upload → Add New → Import CSV → Save and Copy File Name
```

Enroll:
```
Process → Batch Jobs → Enroll → Batch Enrollment → Paste File Name and Submit → View Log
```
- Process Count should equal number enrolled
- Error Count shows how many failed and need fixing

Export:
```
EDI-File Export → Generate EDI Files → Do both 814-01 and 814-16 → View logs
```

Transfer:
```
EDI-File Transfer → Upload Files to EDI Server → ALL → Submit
```

---

### NEXT DAY — Check ERCOT portal (transactions)

| Status | Action |
|--------|--------|
| **In Review** | Call TDSP to check what is needed. If City Permit needed, contact broker/customer. |
| **Scheduled** | It is scheduled — no action needed. |
| **Cancelled** | Call TDSP to check why. May need to re-submit. |
| **Unknown** | Void in the enrollment processing system, re-enroll customer. |
