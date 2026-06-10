# AmeriPower – PHP → Python/React Conversion Progress

**Last updated:** 2026-06-10  
**Branch:** master

---

## Overview

Two PHP modules have been converted to FastAPI (Python) + Next.js (React):

1. **Billing Exception Test** – in-memory PHP billing check replication
2. **Enrollment Module** – full CRUD + reports + downloads (backend complete, frontend pending)

---

## 1. Billing Exception Test

### What it does
Replicates the PHP billing extract checks entirely in memory (no DB writes). Uploads an XLS file, runs all PHP-style checks, returns results grouped by check type in PHP email order.

### Files Created / Modified

| File | Status | Notes |
|------|--------|-------|
| `api/controllers/billing_test.py` | **Created** | Full in-memory PHP clone of `billing_extract.php` + `billing_extract_result.php` |
| `api/routers/billing.py` | **Modified** | Added `POST /billing/test/run` endpoint |
| `app/pages/billing/exception-test.tsx` | **Created** | Upload page showing checks in PHP email order |
| `app/components/BillingLayout.tsx` | **Modified** | Added "PHP ↔ Python Test" nav link |

### Key Design Decisions

- `skiprows=2`: PHP starts at row 3 (rows 1–2 are title/header) — pandas aligned accordingly
- Extended `sheet1` array: positions `[27]` = `auto_pay_type` (col 46), `[28]` = `bill_mode` (col 47)
- Router calls `run_php_checks` once, then computes `counts = {k: len(v) for k, v in rows.items()}` — avoids double file-read
- Check 4 uses tax amount columns (not exempt columns) — the PHP-equivalent approach
- `PHP_EMAIL_ORDER` list defines display sequence matching PHP email body

### API
```
POST /api/billing/test/run
  Body: multipart/form-data  { file: .xls }
  Returns: { counts: {check_key: int}, rows: { order: [...], rows: {...}, summary: {...} } }
```

---

## 2. Enrollment Module

### Architecture Rules (strictly followed)
1. **ZERO LOGICAL DISCRETION** — PHP algorithmic flow replicated exactly
2. Only existing dependencies (no new packages except `phpserialize`)
3. **HALT ON AMBIGUITY** — no invented logic
4. `archive` and `comment_active` DB columns are **absent** from the real schema — excluded from all SQL
5. `contract_rate` stored ×100 in DB, displayed ÷100 on frontend
6. `enrollment.date_added` = Unix timestamp stored as INT
7. `confirmation_log.date_modified` and `enrollment_log.date_modified` = Unix timestamp stored as **varchar**
8. `enrollment_log.esid` column **exists** in DB (confirmed via direct MySQL inspection)
9. Volumes field decoded with `phpserialize.loads(s.encode('latin-1'), decode_strings=True)`
10. Contract expiry check (PHP line 507) is **dead code** (unparseable strtotime string) — intentionally omitted

---

### Files Created

#### Backend

| File | Description |
|------|-------------|
| `api/models/enrollment.py` | SQLAlchemy ORM models: `Enrollment`, `ConfirmationLog`, `EnrollmentLog`, `AdditionalEsidTemplate`, `BrokerNew` |
| `api/schemas/enrollment.py` | 15 Pydantic schemas (see full list below) |
| `api/controllers/enrollment.py` | 26 async functions (see full list below) |
| `api/routers/enrollment.py` | 30 routes (see full list below) |

#### Frontend

| File | Description |
|------|-------------|
| `app/components/EnrollmentLayout.tsx` | Sidebar layout with 6 sections, blue active state, `w-56` |

#### Modified

| File | Change |
|------|--------|
| `api/main.py` | Added `from routers import enrollment` + `app.include_router(enrollment.router, prefix="/api")` |
| `api/requirements.txt` | Added `phpserialize` (pandas/openpyxl/xlrd already installed system-wide) |

---

### Pydantic Schemas (`api/schemas/enrollment.py`)

| Schema | Purpose |
|--------|---------|
| `MessageResponse` | Generic `{message: str}` |
| `EnrollmentOut` | All 46 enrollment columns; `date_added` as int |
| `EnrollmentLogOut` | enrollment_log row |
| `EnrollmentStatsOut` | 5 dashboard counts |
| `ComparisonRowOut` | enrollment + confirmation_log + computed flags |
| `PendingConfirmationOut` | confirmation_log row with `profiles: List[str]` |
| `NoConfirmationOut` | enrollment row (no matching confirmation) |
| `TemplateComparisonRowOut` | enrollment + additional_esid_template + computed flags |
| `TemplateOut` | additional_esid_template + `broker_name` joined |
| `TemplateCreate` | Create/update template payload |
| `EditEnrollmentRequest` | Edit modal fields + `*_old` fields for log diff |
| `StatusCheckRequest` | Status check form (radio1, txtdate, txtdate1, comment, etc.) |
| `ApproveRequest` | `{sid, type}` for enroll_check approval |
| `ActionRequest` | `type: Literal["delete","update"]` |
| `DownloadCompletedRequest` | `{start, end}` date range |

---

### Controller Functions (`api/controllers/enrollment.py`)

#### Helpers

| Function | PHP Source | Notes |
|----------|-----------|-------|
| `_get_difference_months(start, end)` | `view_enrollments.php` lines 249–262 | Exact string-slice logic on MM/DD/YYYY |
| `_decode_volumes(volumes_str)` | `confirmation_log.volumes` | phpserialize → list of keys |
| `_fmt_ts(ts_str)` | PHP `date("m/d/Y h:i:s A", ...)` | Unix ts varchar → formatted string |
| `_derive_zone(esid)` | `add_enrollment.php` lines 236–247 | Prefix matching: north/coast/south/N/A |
| `_derive_meter_fees(plan_type)` | `add_enrollment.php` lines 103–200 | 12-entry dict lookup |
| `_c(row, n)` | PHP `$data->sheets[0]['cells'][$i][N]` | 1-indexed pandas column access |
| `_CONF_FUZZY_ON` | `enrollment_report.php` lines 286–293 | 10-OR fuzzy JOIN string constant |

#### Main Functions

| Function | PHP Source | Key Logic |
|----------|-----------|-----------|
| `upload_enrollment` | `add_enrollment.php` | `skiprows=2`, col map, ×100 rate, UPDATE resets all check flags, INSERT enrollment_log without esid |
| `get_enrollments_view` | `view_enrollments.php` | 4 sort modes: default/date/comment/status |
| `get_completed_enrollments` | `completed_enrollments.php` | 4 sort modes, 8-month default window |
| `get_canceled_enrollments` | `canceled_enrollment.php` | WHERE `enrollment_status = 'Cancelled'` |
| `get_user_log` | `enrollment_user_log.php` | **Bug replicated**: unquoted date arithmetic → CAST threshold ~2010, all records returned |
| `get_stats` | `report_home.php` | 5 COUNT queries |
| `get_enrollment_list` | `view_enrollment_list.php` | `enroll_check=0 AND enrollment_cleared=0` |
| `get_templates` | `template_list.php` | JOIN broker_new for company_name |
| `get_brokers_for_dropdown` | `add_template.php` | `confirmation_email<>'' AND confirmation_flag=1` |
| `create_template` | `add_template.php` (INSERT) | — |
| `update_template` | `add_template.php` (UPDATE) | — |
| `delete_template` | `delete_esid_template.php` | Hard DELETE |
| `download_completed` | `download_compleat_enrrol.php` | 14-col XLSX, `<br />` comment split |
| `download_pending` | `download_pending.php` | 12-col XLSX, char replacements, fuzzy JOIN exclusion |
| `get_enrollment_by_esid` | edit modal prefill | `SELECT * WHERE esid=?` |
| `get_enrollment_log` | `log_check.php` | `WHERE esid LIKE ?` |
| `get_comparison` | `enrollment_report.php` | Fuzzy JOIN, template exclusion, auto-updates `meter_fee_check`, computed flags |
| `get_pending_confirmations` | `confirmations_report_enrollment.php` | 3-step: all confs → matched sids → exclude |
| `get_no_confirmations` | `view_clear_enrollments.php` | 3-step exclusion (conf + template) |
| `get_template_comparison` | `template_enrollment_report.php` | Fuzzy template JOIN, tax_error 0/1/2 |
| `get_checked` | `enrollments_checked.php` | `enroll_check=1` |
| `get_non_billed` | `non_billed.php` | Completed, billed_30=0, date_added < 35d ago, adds `days_diff` |
| `edit_enrollment_record` | `edit_enrollment.php` | ×100 rate on store, log only if name/end_date changed |
| `status_check_enrollment` | `enrollment_status_check.php` | Status construction, admin delete on 'Cancelled By Customer' |
| `clear_enrollment_record` | `clear_enrollment.php` | SET `enrollment_cleared=1` |
| `toggle_additional_esid_check` | `enrollment_additional_esid_check.php` | Toggle 0↔1, log entry |
| `approve_enrollment` | `clear_enrollment_report.php` | type='confirmation': UPDATE both tables; other: enrollment only |
| `action_enrollment` | `delete_enrollment.php` | type='delete': soft delete (SET status='Delete'); type='update': enroll_check=1 |
| `dismiss_confirmation` | `delete_confirmation_enrollment.php` | SET `enroll_check=1` (not a real DELETE — misleading PHP name) |

---

### Router (`api/routers/enrollment.py`) — 30 Routes

```
POST   /api/enrollment/upload
GET    /api/enrollment/view?sort=
GET    /api/enrollment/completed?sort=
GET    /api/enrollment/canceled
GET    /api/enrollment/user-log
GET    /api/enrollment/stats
GET    /api/enrollment/list
GET    /api/enrollment/reports/comparison?start=&end=
GET    /api/enrollment/reports/pending-confirmations?search=
GET    /api/enrollment/reports/no-confirmations
GET    /api/enrollment/reports/template-comparison
GET    /api/enrollment/reports/checked
GET    /api/enrollment/reports/non-billed
GET    /api/enrollment/download/completed?start=&end=    → XLSX bytes
GET    /api/enrollment/download/pending                  → XLSX bytes
GET    /api/enrollment/brokers
GET    /api/enrollment/templates?search=
POST   /api/enrollment/templates
PUT    /api/enrollment/templates/{sid}
DELETE /api/enrollment/templates/{sid}
PATCH  /api/enrollment/confirmation/{sid}/dismiss        ← registered BEFORE /{esid}/... routes
GET    /api/enrollment/{esid}/edit
PATCH  /api/enrollment/{esid}/edit
PATCH  /api/enrollment/{esid}/status
PATCH  /api/enrollment/{esid}/clear
PATCH  /api/enrollment/{esid}/additional-esid-check
PATCH  /api/enrollment/{esid}/approve
PATCH  /api/enrollment/{esid}/action
GET    /api/enrollment/{esid}/log
```

> **Route ordering note:** `/confirmation/{sid}/dismiss` is registered **before** `/{esid}/...` to prevent FastAPI treating the literal "confirmation" as an ESID value.

---

### EnrollmentLayout Sidebar (`app/components/EnrollmentLayout.tsx`)

```
Enrollment Home
─ Process ──────────────────
  Upload Spreadsheet         /enrollment/upload
  View Enrollments           /enrollment/view
  Completed                  /enrollment/completed
  Canceled                   /enrollment/canceled
─ Reports ──────────────────
  Enrl / Confirmation        /enrollment/reports/comparison
  Pending Confirmations      /enrollment/reports/pending-confirmations
  No Confirmations           /enrollment/reports/no-confirmations
  Template Comparison        /enrollment/reports/template-comparison
  Check List                 /enrollment/reports/checked
  Non Billed >35d            /enrollment/reports/non-billed
─ Downloads ────────────────
  Download Completed         /enrollment/reports/download-completed
  Download Pending           /enrollment/reports/download-pending
─ Templates ────────────────
  Template List              /enrollment/templates
  Add Template               /enrollment/templates/add
─ (no heading) ─────────────
  User Log                   /enrollment/user-log
```

Active state: **blue** (`bg-blue-600 text-white`), sidebar width: `w-56`.

---

## 3. Frontend Pages Still to Write

All 16 enrollment pages remain to be created:

| File | Endpoint(s) Used | Complexity |
|------|-----------------|-----------|
| `app/pages/enrollment/index.tsx` | `GET /stats` | Low – stat cards |
| `app/pages/enrollment/upload.tsx` | `POST /upload` | Low – file input |
| `app/pages/enrollment/view.tsx` | `GET /view?sort=`, `PATCH /{esid}/edit`, `PATCH /{esid}/status`, `GET /{esid}/log` | **High** – 3 modals |
| `app/pages/enrollment/completed.tsx` | `GET /completed?sort=`, same modals | High |
| `app/pages/enrollment/canceled.tsx` | `GET /canceled` | Low |
| `app/pages/enrollment/user-log.tsx` | `GET /user-log` | Low |
| `app/pages/enrollment/reports/comparison.tsx` | `GET /reports/comparison?start=&end=` | **Very High** – most complex |
| `app/pages/enrollment/reports/pending-confirmations.tsx` | `GET /reports/pending-confirmations?search=` | Medium |
| `app/pages/enrollment/reports/no-confirmations.tsx` | `GET /reports/no-confirmations` | Medium |
| `app/pages/enrollment/reports/template-comparison.tsx` | `GET /reports/template-comparison` | High |
| `app/pages/enrollment/reports/checked.tsx` | `GET /reports/checked` | Low |
| `app/pages/enrollment/reports/non-billed.tsx` | `GET /reports/non-billed` | Low |
| `app/pages/enrollment/templates/index.tsx` | `GET /templates`, `PUT /templates/{sid}`, `DELETE /templates/{sid}` | Medium |
| `app/pages/enrollment/templates/add.tsx` | `GET /brokers`, `POST /templates` | Low |
| `app/pages/enrollment/reports/download-completed.tsx` | `GET /download/completed?start=&end=` | Low – date picker + download |
| `app/pages/enrollment/reports/download-pending.tsx` | `GET /download/pending` | Low – button + download |

Also pending:
- Add **"Enrollment"** entry to `app/components/Layout.tsx` NAV_MODULES

---

## 4. Shared Frontend Helpers Needed

These utility functions should be defined in each page file (or a shared util):

```typescript
const fmtDate  = (ts: number) => new Date(ts * 1000).toLocaleDateString('en-US')
const fmtTs    = (ts: string) => new Date(parseInt(ts) * 1000).toLocaleString('en-US')
const dispRate = (r: string)  => (parseFloat(r) / 100).toFixed(4)
```

`getDifferenceMonths(start: string, end: string)` — TypeScript port of PHP:
```typescript
function getDifferenceMonths(start: string, end: string): number {
  const year  = +end.slice(6,10) - +start.slice(6,10)
  const month = +end.slice(0,2)  - +start.slice(0,2)
  const days  = +end.slice(3,5)  - +start.slice(3,5)
  return (year * 12) + month + (days > 15 ? 1 : 0)
}
```

---

## 5. Critical DB / Logic Notes (for future reference)

| Topic | Detail |
|-------|--------|
| `contract_rate` | Stored ×100 in DB. Display = `parseFloat(db_value) / 100`. Edit modal sends display value; controller multiplies ×100 before UPDATE. |
| `date_added` | INT column in `enrollment`. Unix timestamp. |
| `date_modified` | VARCHAR column in `confirmation_log` and `enrollment_log`. Unix timestamp as string. |
| `archive` / `comment_active` | **Do not exist** in DB schema. All PHP UPDATE statements referencing them are excluded. |
| `enrollment_log.esid` | **Does exist** in DB (confirmed). Upload-level log entries INSERT without it (NULL). |
| `volumes` | PHP-serialized in `confirmation_log`. Decoded with `phpserialize.loads(s.encode('latin-1'), decode_strings=True)` → dict keys. |
| Fuzzy JOIN | 10-OR condition in `_CONF_FUZZY_ON`. Used in comparison, pending-confirmations, no-confirmations, download-pending. |
| User log bug | PHP unquoted date arithmetic (`2025-5-10 = 2010`). All Unix timestamps (~1.7B) pass this check. Replicated with `CAST(date_modified AS SIGNED) > {year-month-day}`. |
| Contract expiry | PHP line 507 concatenates `start_date + term + "month"` → unparseable by strtotime → always false → dead code. **Intentionally omitted.** |
| Soft delete | `delete_enrollment.php` type='delete' → `SET enrollment_status='Delete'` (not a real DELETE). |
| Dismiss confirmation | PHP named "delete_confirmation_enrollment.php" but actually sets `enroll_check=1`. Named `dismiss_confirmation` in Python. |
| Status construction | 'Scheduled' → `Scheduled-{date}`, 'Completed' → `Completed-{date}`, others → plain string. |

---

## 6. How to Resume

If starting a new conversation, key facts:

1. **Backend is 100% complete.** All 26 controller functions, 30 routes, models, and schemas are written and registered in `main.py`.
2. **Frontend: only `EnrollmentLayout.tsx` is done.** All 16 page TSX files + the Layout.tsx NAV_MODULES entry are still to be written.
3. Start with `app/pages/enrollment/index.tsx` (stats dashboard), then `upload.tsx`, then `view.tsx` (most complex — has Edit, Status, and Log modals).
4. Use `api` default export from `app/utils/api.ts` for all HTTP calls.
5. Wrap every page in `<EnrollmentLayout>` (not `<Layout>`).
6. Use `require_auth` JWT — token is stored in `localStorage` as `ap_token`. The `api.ts` interceptor attaches it automatically.
