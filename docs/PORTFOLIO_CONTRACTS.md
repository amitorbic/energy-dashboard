# Portfolio Contracts  -- Design, Rules, and Current State

Last updated: 2026-10-05 (updated 2026-10-05 with Changes 1/2/3 from the second session).
Labels: VERIFIED = checked against repo right now. REPORTED = from prior sessions, not re-checked.
INFERRED = a reasoned guess; treat as unconfirmed.

---

## 1. Architecture

### What Portfolio reads

Portfolio reads **only** `portfolio_contracts` (created in migration 048), for every tenant.
It never reads `contract_renewal` directly. [VERIFIED: grepped `controllers/portfolio.py`
and `routers/portfolio.py` for `contract_renewal`, `is_full_tenant`, `TENANT_MODULES`, and
`subscription`  -- zero matches in either file. All five read-side controller functions
(`get_portfolio_summary`, `get_portfolio_by_zone`, `get_portfolio_customers`,
`get_open_position`, `get_portfolio_forecast`) go through `portfolio_view`, which is the
only touchpoint with the underlying table.]

### How data gets in  -- two paths, gated by `is_full_tenant`

**Path A  -- portfolio-only tenants (`is_full_tenant = 0`):**
Staff upload a CSV via the admin page `/admin/portfolio-contracts-upload`.
The upload endpoint (`POST /api/admin/portfolio-contracts/upload`) upserts by ESI ID  --
re-uploading a corrected file does not truncate; it only touches the rows present in the file.

**Path B  -- full-4-module tenants (`is_full_tenant = 1`):**
`AFTER INSERT` / `AFTER UPDATE` / `AFTER DELETE` triggers on `contract_renewal` one-way sync
into `portfolio_contracts` (source = 'synced'). `POST /upload` returns HTTP 409 once a
tenant is upgraded  -- not just hidden in nav. A reconcile script
(`api/scripts/reconcile_portfolio_contracts.py`) is the backstop for any missed write
path (e.g. MySQL `TRUNCATE` does not fire triggers). It is configured to run nightly at
2:15 AM CT as pm2 app `portfolio-contracts-reconcile` (`api/ecosystem.reference-sync.config.js`,
cwd `/var/www/energyapp/api`, autorestart false), right after `reference-data-reconcile`
(2:00 AM). Verified: nothing runs on the dev machine. Not verifiable from the repo: whether
pm2 on the VPS has loaded this config and the job is actually running live. It can also be run
by hand (`--report-only` prints the unsynced report and changes nothing).

### Upgrade flow

`POST /api/admin/portfolio-contracts/upgrade` is the **only** way `is_full_tenant` flips
to 1. It is a deliberate staff action, never inferred at login or startup. It:
1. Refuses if `TENANT_MODULES` is not configured for the full platform.
2. Refuses if already upgraded (idempotent  -- returns 409).
3. Diffs every existing `source='upload'` row against the best sync candidate per ESI ID
   from `contract_renewal`, logging every field difference to
   `portfolio_contract_upgrade_discrepancies` BEFORE touching any data.
4. Deletes `source='upload'` rows and bulk-backfills `source='synced'` rows.
5. Flips `is_full_tenant=1`. All in one transaction  -- failure leaves the tenant unchanged.

Real contracts are re-entered through normal enrollment after upgrade; the old uploaded
spreadsheet values are not silently auto-migrated into the live system.

---

## 2. Upload format

### Columns

Required: `esi_id`, `load_profile`, `contract_rate`, `annual_volume`, `contract_type`,
`contract_end_date`

Optional: `contract_start_date`  -- blank means today's date at parse time (assigned in
Python, not as a DB default). Exception: if `contract_type` is Future, a blank start date
is an upload error ("Future contract requires a contract_start_date"). Extra columns are
silently dropped.

Removed from upload path (still on table, still populated by sync triggers):
`company_name`, `broker_code`. If a file still contains these columns they are ignored.

### Static files

- `/api/admin/portfolio-contracts/template`  -- header-only CSV [VERIFIED: file exists at
  `api/static/portfolio_contracts_template.csv`]
- `/api/admin/portfolio-contracts/sample`  -- sample rows [VERIFIED: file exists at
  `api/static/portfolio_contracts_sample.csv`; currently has 4 rows Fix/Fix/LMP/Future
  and does not yet include MCP or MCP2 examples]

---

## 3. Contract types  -- decided rules

Valid types (owner-decided): **Fix, Future, LMP, MTM, MCP, MCP2**

LMP, MTM, MCP, MCP2 are month-to-month variants. "Fixed" (mixed case) is also accepted
and normalized to "Fix". All normalization is case-insensitive.

Normalization map (`_TYPE_MAP` in `routers/admin_portfolio_contracts.py`): [VERIFIED]

| User input (any case) | Stored as |
|---|---|
| fix, fixed | Fix |
| future | Future |
| lmp | LMP |
| mtm | MTM |
| mcp | MCP |
| mcp2 | MCP2 |

Any post-normalization value not in the allowed set is rejected (see section 4 below).

### Future type semantics

- Future is a valid contract type, not just a status. [VERIFIED: in `_ALLOWED_TYPES`]
- In `portfolio_view` (migration 051): a Future row gets `status = 'future'` when
  `contract_start_date IS NOT NULL AND contract_start_date > CURDATE()`. Once the date
  arrives, the view automatically returns `status = 'active'` with no re-upload needed
  (the CASE is evaluated at query time). If `contract_start_date` is NULL, the row gets
  `status = 'active'` immediately. [VERIFIED: read migration 051 SQL]
- In `_sync_forecast_tables`: a Future row with a non-blank start date is inserted into
  `future_forecast_dates`. A Future row with a blank start date returns early (nothing
  written). Since Change 1 now rejects Future+blank-start at upload, this early-return
  branch cannot be reached from the upload path; it remains as a safety guard for any
  direct DB write. Any other type goes to `customer_forecast_dates`. When a row changes
  type, the stale entry in the other table is deleted. [VERIFIED: read
  `_sync_forecast_tables` in `routers/admin_portfolio_contracts.py`]

### Unknown bucket

Rows already in the table or arriving via sync with unrecognized types (NULL, 'Default',
strays from `contract_renewal`) are shown as **Unknown** in `portfolio_view`  -- they are
never silently folded into MTM. [VERIFIED: migration 051 uses `ELSE 'Unknown'`]

In the source DB dev data, `contract_renewal` has roughly: Fix ~10,472, NULL ~1,980,
LMP ~56, Default ~2 rows. [REPORTED from prior session query  -- not re-run today]
When `is_full_tenant=1` and the sync triggers fire, NULL and 'Default' arrive in
`portfolio_contracts` verbatim (no normalization in triggers). Migration 051 makes those
show as Unknown rather than MTM.

---

## 4. Upload validation  -- zero tolerance

The upload endpoint uses a **two-pass** approach: [VERIFIED: read the endpoint code]

- **Pass 1:** validate every row (required fields, date formats, contract_type after
  normalization). All errors across all rows are collected.
- If ANY row fails: the entire upload is rejected. Nothing is inserted. The response is:
  `{"accepted": false, "total_rows": N, "error_count": N, "invalid_rows": [{"line": N, "esi_id": "...", "errors": [...]}]}`
- If ALL rows pass: **Pass 2** inserts/updates all rows.
  Success response: `{"accepted": true, "inserted": N, "updated": N, "total_rows": N, "rows": [...]}`

Reason for zero tolerance: 50-100 bad ESI IDs out of ~10,000 would ruin a forecast.

Note on other field errors (missing rate, bad date): these are also caught in Pass 1 and
also cause whole-upload rejection. This was not explicitly decided by the owner but is
consistent with zero-tolerance intent. The behavior is unchanged from how the two-pass
logic was implemented.

Stricter rules added 2026-10-05 (shared validator, so they apply to this upload and to the
contract_renewal bulk upload; see section 11.1 for the full list): ESI ID letters allowed but
no whitespace/punctuation; contract_rate numeric with 0 <= rate < 1.0 ($/kWh);
annual_volume numeric >= 0. [VERIFIED: tests in api/tests/test_portfolio_upload_validation.py]

---

## 5. Portfolio view

`portfolio_view` is the single read-side abstraction Portfolio always goes through.
Migration 048 created it, repointing it from `contract_renewal` to `portfolio_contracts`.

**Current state per environment:**

| Environment | Which view version |
|---|---|
| `u972964962_orbic` (local source DB) | 048 version  -- MTM as fallback, no contract_start_date, no future status |
| `tenant_sync_verify_co` | 051 version  -- full types, Unknown fallback, contract_start_date, future status [VERIFIED: applied last session] |
| `tenant_portfolio_sync_test_co` | 048 version [REPORTED: 051 not applied there] |
| `tenant_test_pilot_co`, `tenant_test_rep` | 048 version [REPORTED: 051 not applied] |
| Live (`energyapp` + all live tenant DBs) | 048 version  -- 051 not yet applied to live [VERIFIED: DB_MIGRATIONS.md] |

Migration 051 must be applied to `u972964962_orbic` and to every tenant DB (local and
live) before the Unknown bucket and per-type Contract Mix work is fully effective.

---

## 6. Contract Mix on /portfolio

`controllers/portfolio.py` `get_portfolio_summary` and `get_portfolio_by_zone` count all
7 buckets: `fixed`, `future_contracts`, `lmp`, `mtm`, `mcp`, `mcp2`, `unknown_contracts`.
[VERIFIED: read the SQL just now]

`app/pages/portfolio/index.tsx` Contract Mix KPI card shows each non-zero type as a
separate labeled count. An Unknown banner appears above the KPI cards when
`unknown_contracts > 0`. [REPORTED from prior session  -- frontend code not re-read today]

---

## 7. Pages that reflect contract data

- `/portfolio`  -- summary KPIs, Contract Mix, zone breakdown, Unknown banner [VERIFIED:
  uses `portfolio_view` via `get_portfolio_summary`/`get_portfolio_by_zone`]
- `/portfolio/customers?zone=`  -- per-customer table [VERIFIED: uses `portfolio_view` via
  `get_portfolio_customers`]
- Position Screen (`/portfolio/position`)  -- Risk Category filter shows Fixed, Variable,
  MCP2, Future as UI labels. These are front-end-only filter labels; they are NOT wired
  to `contract_type` in the backend. The position/risk endpoints make no reference to
  contract_type as a parameter. [REPORTED from prior session reading `position.tsx`]

---

## 8. Migrations (summary  -- full detail in docs/DB_MIGRATIONS.md)

| # | What | Status |
|---|---|---|
| 048 | Creates `portfolio_contracts`, sync state, discrepancy log, triggers, repoints view | Applied to local source DB and tenant DBs; NOT on live |
| 049 | Adds `contract_start_date DATE NULL` to `portfolio_contracts` | Applied to local source DB and two tenant DBs; NOT on live |
| 050 | Early Future-type view attempt | SUPERSEDED by 051  -- do not apply anywhere |
| 051 | `portfolio_view` full type pass-through, Unknown fallback, future status | Applied to `tenant_sync_verify_co` only; NOT applied to source DB or live |
| 052 | Sync triggers normalize contract_type | Applied locally; NOT on live (see DB_MIGRATIONS.md) |
| 053 | `contract_renewal_unsynced` view (rows the sync skips, with reason) | Applied to 5 local DBs 2026-10-05; NOT on live |

---

## 9. Known gaps and open questions

**Gaps:**
- Migration 051 not yet applied to `u972964962_orbic` (source DB), other local tenant
  DBs, or live. Until it is, the Unknown bucket and per-type mix are only visible on
  `tenant_sync_verify_co`.
- `api/static/portfolio_contracts_sample.csv` does not yet have MCP or MCP2 example rows.
- The frontend upload page (`app/pages/admin/portfolio-contracts-upload.tsx`) may not yet
  handle the new `{"accepted": false, "invalid_rows": [...]}` response shape. The old
  response used `res.data.errors` and `res.data.rows.filter(r => r.status === 'error')`.
  [REPORTED from prior session  -- file not re-read today]
- `contract_start_date` is NULL for all `source='synced'` rows  -- the sync triggers'
  INSERT column lists were deliberately left untouched. This is a disclosed gap, not a
  bug.

**Open questions for the owner:**
- Should the position screen's Fixed/Variable/MCP2/Future filter categories be wired to
  `contract_type`? (Currently: front-end-only labels, not backed by a contract_type filter
  in the position/risk endpoints.)
- Should there be an admin UI for viewing the discrepancy log (`portfolio_contract_upgrade_discrepancies`)
  after an upgrade, beyond the existing `GET /api/admin/portfolio-contracts/upgrade-report` endpoint?

---

## 10. Environment state

**Tenant registry (`orbic_master.reps`) as of 2026-10-05:** [VERIFIED]

| rep_id | subdomain | company_name | Tenant DB |
|---|---|---|---|
| 1 | orbic | AmeriPower (ORBIC) | `u972964962_orbic` (source, not a tenant DB) |
| 2 | testrep | Test REP | `tenant_test_rep` |
| 4 | your-test-subdomain | Test Pilot Co | `tenant_test_pilot_co` |
| 10 | sync-verify-co | Sync Verify Co | `tenant_sync_verify_co` |
| 11 | portfolio-sync-test | Portfolio Sync Test Co | `tenant_portfolio_sync_test_co` |

**Running backends:** [REPORTED from prior session  -- not re-checked today]
- Port 8001: serves `u972964962_orbic` (source DB), `--reload` mode. No backend for
  `tenant_sync_verify_co` is running by default. To start one:
  `cd C:\AmeriPower\api && $env:DB_NAME="tenant_sync_verify_co"; python -m uvicorn main:app --reload --port 8002`
  Note: `tenant_sync_verify_co` backend runs plain `uvicorn.run()` with no `--reload` (per
  its `.env`), so it needs a manual restart after any code edit.

**Disposable tenants:** `tenant_portfolio_sync_test_co` (rep_id 11) still exists locally.
It has `is_full_tenant=1` from the 048 verification run. It is not disposable  -- it exists
in the registry. Do not drop it without removing the rep row first.

---

## 11. contract_renewal bulk upload -- rules (added 2026-10-05)

All statements below are VERIFIED (code read and run this session) unless marked INFERRED.

### 11.1 Validation (POST /api/contract-renewal/upload)

One shared function, `validate_contract_row()` in `api/utils/contract_upload_validation.py`,
is used by BOTH this upload and the Portfolio upload. Same required fields:
esi_id (premise_id), load_profile, contract_rate, annual_volume (contract_renewal_usage;
the CSV header may be `usage`), contract_type (normalized, same allowed list), contract_end_date,
and contract_start_date when contract_type is Future. Added rules (VERIFIED by tests):
- esi_id: letters and digits allowed (constant ESI_ALNUM, replaces ESI_DIGITS_ONLY); any
  whitespace/newline or non-alphanumeric character is rejected.
- contract_rate: must be a number and 0 <= rate < 1.0 (constant RATE_MAX_EXCLUSIVE = 1.0, $/kWh).
  0.0465 is accepted; 6.5, 1.0, -0.01, text are rejected.
- annual_volume: must be a number >= 0 (0 accepted; negative, text, and comma-formatted
  values such as "1,000" are rejected).
- load_profile: must exist in the tenant's own load_profiles_master (column full_load_profile).
  Exact, case-sensitive match, no trimming; the master stores upper case with no padding
  (VERIFIED: 92 of 92). A near miss by case gets a "did you mean" hint. If the master table is
  empty or unreadable on that tenant the upload fails with HTTP 503 and a clear message; the
  check is never skipped. See 11.4.

Differences, on purpose:
- contract_renewal accepts MM/DD/YYYY only (the sync trigger parses m/d/Y only; ISO dates
  were silently skipped by the sync). Portfolio still accepts MM/DD/YYYY or YYYY-MM-DD.
- Both uploads reject any whitespace, newline, tab or non-alphanumeric character in the ESI ID,
  checked on the raw value. Nothing is trimmed or fixed silently (Portfolio used to trim
  leading/trailing whitespace; changed 2026-10-06). No length rule is applied anywhere.
- contract_renewal does not default a blank start date to today; blank stays NULL.

Any bad row rejects the whole file; nothing is inserted; the response lists every bad row:
`{"accepted": false, "total_rows": N, "error_count": N, "invalid_rows": [{"line": N, "premise_id": "...", "errors": [...]}]}`.
Accepted rows are inserted in one transaction (any DB error rolls back everything and returns 500;
the old code skipped failing rows silently). Only supplied columns are inserted so
blank cells take the column default (e.g. grt_tax_exempt is NOT NULL).

PUT /api/contract-renewal/{id} applies the same checks to the fields it changes
(end/start date must be MM/DD/YYYY; required fields cannot be blanked). Unchanged legacy values are not re-checked.

RESOLVED 2026-10-05: lettered 22-character ESI IDs are now accepted (they were the reason
the digits-only rule was dropped). The 11 local test rows that had them were deleted (11.5).

### 11.2 Guardrail: the bulk upload is not repeatable

The endpoint only loads into an EMPTY table. It returns HTTP 409 (nothing changed) when
contract_renewal has any row, or when a dependent table has rows: contract_addon_charges
(hard FK fk_cac_contract), customer_edit_log (soft, contract_serial), portfolio_contracts
rows with synced_from_serial. There is no override. TRUNCATE was removed.
Tables not guarded (linked by ESI ID, not by serial): billing_periods, invoices.
comm_bank.contract_id exists but matches no contract_renewal serial locally (INFERRED: legacy).
A deliberate reset is a planned operation (contact support); it is not built.

### 11.3 Rows the sync skips

View `contract_renewal_unsynced` (migration 053) lists contract_renewal rows the triggers and
reconcile script skip, one reason each (first match): premise_id_null, load_profile_null,
end_date_null (NULL or blank), end_date_unparseable (not m/d/Y). Used by the reconcile script
(prints counts and rows with masked ESI IDs), GET /api/admin/portfolio-contracts/status and
GET /api/portfolio/summary (field `unsynced_contracts`: available, total, by_reason), and a
banner on /portfolio. For tenants that are not full tenants the summary reports available=false
(contract_renewal never syncs there). The frontend banner was written but NOT rendered or tested.
Nothing in contract_renewal is changed by any of this; fixing those rows is a data task.

Real-call check (VERIFIED, local tenant_portfolio_sync_test_co, is_full_tenant=1, real JWT
through the real app): with 4 scoped test rows (one per reason) both GET /api/portfolio/summary
and GET /api/admin/portfolio-contracts/status returned unsynced_contracts total=4 with 1 per
reason; with none, total=0. Test rows were deleted; contract_renewal and portfolio_contracts
are back to 0 rows. No token returns 403. The browser banner is still unrendered.

### 11.4 load_profile validation (implemented 2026-10-06)

Rule: load_profile must equal a value in load_profiles_master.full_load_profile of the tenant
DB being uploaded to. Both uploads use the shared validator; the caller loads the set once per
upload (load_valid_profiles) and passes it in as a required argument, so it cannot be skipped.

Why this became possible: load_profiles_master is global reference data (columns id,
full_load_profile UNIQUE, short_name, created_at; no tenant column) and was empty in every
tenant DB. It is now registered in SHARED_REFERENCE_TABLES (api/utils/shared_reference_tables.py,
dedup_keys full_load_profile, no live trigger so the nightly reconcile is its sync path). The
registry entry is all that is needed: structure is cloned to tenants automatically and each
tenant already had the table and reference_sync_state. No migration. Ran
`sync_reference_data.py --mode reconcile --table load_profiles_master --tenant-db <db>` locally
for the 4 tenant DBs. VERIFIED row counts after: u972964962_orbic 92, tenant_portfolio_sync_test_co 92,
tenant_sync_verify_co 92, tenant_test_pilot_co 92, tenant_test_rep 92; all rows identical to the source.

Side effect to know: existing code reads load_profiles_master from the tenant DB (usage_upload,
bne, contracts_confirm). It read an empty table on tenants before; it now reads 92 rows.

Master collation is utf8mb4_general_ci (MySQL compares case-insensitively) but the validator is
exact on purpose, in line with "nothing is silently fixed".

Existing dev data vs the master: 21 distinct load_profile values (95 rows) in dev contract_renewal
are not in the master, and none matches case/whitespace-insensitively. Most look like families the
master lacks: ..._FWEST_IDR_WS (master has FWEST only as NIDR_NWS), BUSIDRRQ_*, *PV_* (RESHIPV,
RESLOPV, BUSHIPV, BUSLOPV), BUSOGFLT, RESHIWD, NMFLAT, BUSHILF_SCENT_IDR_WS, BUSNODEM_EAST_NIDR_NWS.
INFERRED: either the master is incomplete or those rows are wrong; the owner must decide which.
Nothing was changed. Until the master is completed, uploading those profiles is rejected.

ROLLOUT NOTE (every live tenant): load_profiles_master must be synced into each live tenant DB
(register-and-run scripts/sync_reference_data.py --mode reconcile --table load_profiles_master)
BEFORE the uploads are used there. While the table is empty or unreadable on a tenant, both
uploads (Portfolio standalone and contract_renewal bulk) return HTTP 503 and insert nothing.
Live was not touched; the owner runs the sync there. Order on live: complete the master in the
source DB first, then run the sync, then use the uploads.

### 11.4a The 21 missing profiles added (migration 054, 2026-10-06, LOCAL ONLY)

Migration `api/migrations/054_add_load_profiles_master_entries.sql` adds the 21 profiles to
load_profiles_master (source DB only; idempotent INSERT ... ON DUPLICATE KEY UPDATE keyed on
full_load_profile). NOT applied to live.
- VERIFIED: applied to local u972964962_orbic after a backup
  (C:\Users\Amit\db_backups\load_profiles_master_pre054_20261006.sql, 92 rows). Master went 92 -> 113;
  a second run left it at 113.
- VERIFIED: shared reconcile sync copied 21 rows to each of the 4 local tenant DBs
  (tenant_test_rep, tenant_test_pilot_co, tenant_sync_verify_co, tenant_portfolio_sync_test_co);
  all 4 now hold 113.
- VERIFIED: dev contract_renewal now has 0 rows whose load_profile is missing from the master.
- Zone rule (unchanged, no exceptions over the existing 92 rows): COAST stays COAST;
  EAST/NCENT/NORTH -> NORTH; SCENT/SOUTH -> SOUTH; FWEST/WEST -> WEST.
- Class decisions (owner): BUSHIPV, BUSLOPV, BUSOGFLT, NMFLAT are priced as BUSLOLF; RESHIPV, RESHIWD,
  RESLOPV are priced as RESLOWR (same as RESHIWR); BUSIDRRQ keeps its own class (BUSIDRRQ_COAST,
  BUSIDRRQ_NORTH), which has no pricing key on purpose.
- Rollout: every live tenant needs load_profiles_master synced (migration 054 on the source DB, then
  the shared sync) BEFORE the uploads work. With an empty master both uploads return 503.

Mapping (full_load_profile -> short_name):
  BUSHILF_FWEST_IDR_WS_NOTOU -> BUSHILF_WEST; BUSHILF_SCENT_IDR_WS_NOTOU -> BUSHILF_SOUTH;
  BUSHIPV_COAST_IDR_WS_NOTOU -> BUSLOLF_COAST; BUSIDRRQ_COAST_IDR_NWS_NOTOU and _WS_ -> BUSIDRRQ_COAST;
  BUSIDRRQ_NCENT_IDR_NWS_NOTOU, _WS_, BUSIDRRQ_NORTH_IDR_NWS_NOTOU -> BUSIDRRQ_NORTH;
  BUSLOPV_NCENT_IDR_WS_NOTOU -> BUSLOLF_NORTH; BUSNODEM_EAST_NIDR_NWS_NOTOU -> BUSNODEM_NORTH;
  BUSOGFLT_NCENT_IDR_WS_NOTOU -> BUSLOLF_NORTH; NMFLAT_SOUTH_NIDR_NWS_NOTOU -> BUSLOLF_SOUTH;
  RESHIPV_{COAST,FWEST,NCENT,SOUTH}_IDR_WS_NOTOU -> RESLOWR_{COAST,WEST,NORTH,SOUTH};
  RESHIWD_NORTH_IDR_WS_NOTOU -> RESLOWR_NORTH; RESHIWR_FWEST_IDR_WS_NOTOU -> RESLOWR_WEST;
  RESLOPV_{COAST,NCENT,WEST}_IDR_WS_NOTOU -> RESLOWR_{COAST,NORTH,WEST}.

#### Discrepancy notice: profiles priced under a different class than their own

These are priced under another class by owner decision. Their real class may price differently.
Dev contract_renewal row counts (VERIFIED by query, 2026-10-06):
- RESHIPV (priced as RESLOWR): 4 profiles, 7 rows (COAST 1, FWEST 1, NCENT 4, SOUTH 1)
- RESHIWD (priced as RESLOWR): 1 profile, 1 row (NORTH 1)
- RESLOPV (priced as RESLOWR): 3 profiles, 7 rows (COAST 3, NCENT 3, WEST 1)
  Subtotal: 8 profiles, 15 rows. The brief said 12 profiles; the list holds 8. Not reconciled.
- BUSHIPV (priced as BUSLOLF): 1 profile, 1 row; BUSLOPV: 1 profile, 1 row;
  BUSOGFLT: 1 profile, 2 rows; NMFLAT: 1 profile, 3 rows.
- RESHIWR_FWEST (priced as RESLOWR, same class family): 33 rows; not a discrepancy.
- BUSIDRRQ: 5 profiles, 20 rows, NO pricing key (see below).
No in-app notification was built.

#### BUSIDRRQ pricing behaviour (report only, nothing fixed)

VERIFIED by real call to controllers/custom_pricing.calculate_custom_price (local DB, term 12):
- {BUSIDRRQ_NORTH: 100000} -> custom_price None, matched_volume 0 (no error raised).
- {BUSLOLF_NORTH: 100000} -> 4.62.
- both together (100000 each) -> 2.31: the BUSIDRRQ volume is skipped (`if not mapping: continue`)
  but still counted in the divisor total_kwh, so the price is silently understated.
The path for a contract_renewal row is routers/bne.py (load_profile -> load_profiles_master.short_name
-> profiles dict -> calculate_custom_price). It does not raise. Where the key is missing in the
mapping, controllers/custom_pricing.py skips it silently. In bne.py, a profile not found in the
master falls back to the raw profile string as the key, which also matches nothing.

### 11.4b Shape data for the 21 profiles (report only, VERIFIED, nothing changed)

Portfolio forecasts key on the LOAD ZONE parsed from the profile string (utils/zone_mapping.py),
not on short_name or the full profile. ercot_shape_loadzone has 175,300 rows for each of
HOUSTON, NORTH, SOUTH, WEST; forecast_growth_factors has 20 and portfolio_load_annual 5 per zone.
All 21 profiles parse to a zone (COAST->HOUSTON, NCENT/NORTH/EAST->NORTH, SCENT/SOUTH->SOUTH,
FWEST/WEST->WEST), so none of the 21 lacks Portfolio shape data. The per-profile table
`forecast` (profile_type = full profile) has rows for 16 of the 21; it has none for
BUSNODEM_EAST_NIDR_NWS_NOTOU, RESHIPV_FWEST_IDR_WS_NOTOU, RESHIPV_SOUTH_IDR_WS_NOTOU,
RESHIWD_NORTH_IDR_WS_NOTOU, RESLOPV_NCENT_IDR_WS_NOTOU. INFERRED: Portfolio does not read
`forecast` (no reference in controllers/portfolio.py); pricing and other modules may.

### 11.5 Local test data deleted (2026-10-05, owner-authorised, dev DB u972964962_orbic only)

Deleted from contract_renewal: rows with premise_id IS NULL and the 11 rows with 22-character
lettered ESI IDs (1,724 rows total, backed up to C:\Users\Amit\db_backups\contract_renewal_partA_20261005.sql,
outside the repo). No serial references and no billing/EDI references existed. ESI-keyed rows
for the 11 ESIs remain in other tables (collections_accounts, comm_bank, forecast tables,
customer_forecast_dates, esi_id_master, portfolio_contracts); they were not touched.
5 rows remain unsynced locally (serials 12506-12510, load_profile_null).

### 11.6 esi_id_master (information only; no existence rule added)

Lives in u972964962_orbic (about 14.06M rows by information_schema estimate). The three
tenant DBs tenant_portfolio_sync_test_co, tenant_sync_verify_co and tenant_test_pilot_co each
have an esi_id_master table with about 0 rows (estimate); tenant_test_rep has none. It is
not in SHARED_REFERENCE_TABLES (grep found no match), so it is not synced to tenants.
A tenant-side "ESI must exist" rule would therefore reject everything. Owner decision needed.


## 12. Revert of enrollment activation validation (2026-10-05)

During the Portfolio work, POST /enrollment-engine/activate (api/routers/enrollment_engine.py)
was changed to reject a masterroll row with an unrecognized or blank contract_type (422) and a
Future type without a start date, and to write the normalized type. That change was a mistake
and was reverted: the file is identical to commit a7d55d7 again (VERIFIED, `git diff` empty).
Baseline: no enrollment or billing file differs between the pre-048 commit and a7d55d7;
the only enrollment/billing change was these 3 uncommitted hunks (VERIFIED). The billing
engine, invoices, tax and EDI code were never modified by the Portfolio work.

Consequence (KNOWN GAP, out of scope): activation can again write a NULL/blank contract_type
and ISO-format (YYYY-MM-DD) contract_end_date into contract_renewal.
VERIFIED with real calls on tenant_portfolio_sync_test_co (test rows removed afterwards):
- A valid masterroll row (type Fix) activates and creates a real row plus the Default row.
  The real row has end date '2028-06-23' (ISO). The sync trigger parses m/d/Y only, so nothing
  reaches portfolio_contracts and the view lists both rows (real row: end_date_unparseable;
  Default row: load_profile_null).
- A masterroll row with NULL contract_type activates (HTTP 200) and writes NULL contract_type.
  Same unsynced result. If such a row did sync it would show as Unknown or by the legacy
  end-date rule (migration 052 CASE).
- Billing is unaffected: _fetch_contract_segments returned the contract_rate entered
  (0.0712 and 0.0555) for both rows.
These rows appear in the unsynced count on /portfolio (full tenants) rather than being blocked.


## 13. Upload response format and messages (2026-10-06)

Wording and response structure only; no rule changed (same values accepted and rejected).
Row numbers follow Excel: header = row 1, first data row = row 2 (code: `line = idx + 2`).
Blank lines skipped by the CSV parser shift later row numbers by one versus the file.

### 13.1 POST /api/admin/portfolio-contracts/upload

Rejected (HTTP 200, nothing imported):
`{"accepted": false, "total_rows": T, "error_count": <bad rows>, "problem_count": <problems>,
"invalid_rows": [{"line": 57, "row": 57, "esi_id": "...", "errors": ["message", ...],
"problems": [{"row": 57, "column": "contract_rate", "value": "4.65", "code": "rate_out_of_range",
"message": "...", "fix": "..."}]}]}`
`line`, `esi_id`, `errors` are the old fields (kept). `row`, `problems`, `problem_count` are new.
Accepted: `{"accepted": true, "inserted": N, "updated": N, "total_rows": T, "rows": [...]}`.
Other: 409 (full-platform tenant), 503 (load_profiles_master empty/unreadable), 400 (unreadable file or
missing columns), 401/403. These return `{"detail": "..."}`.
The contract_renewal bulk upload uses the same wording (strings in `errors`); its shape is unchanged.

### 13.2 Reject reasons (code: message / how to fix)
- missing_value: "<Column label> is required." / "Fill in <column> for this row."
- esi_has_space: "ESI ID contains spaces or symbols. Use letters and numbers only." / delete any space or
  line break, including a hidden one at the start or end of the cell.
- esi_has_symbol: same message / remove symbols such as - _ . /
- rate_not_number, rate_out_of_range: "Contract rate must be a number from 0 up to (not including) 1,
  in dollars per kWh, for example 0.0465." / plain number, no $ or letters; if in cents divide by 100.
- volume_not_number, volume_negative: "Annual volume must be a number of 0 or more, with no commas." /
  enter yearly kWh as a plain number such as 120000.
- profile_unknown: "Load profile is not in the master list. Use a profile exactly as listed (capital
  letters), for example RESHIWR_NORTH_IDR_WS_NOTOU." (+ " Did you mean '<X>'?" on a case/space
  near miss) / copy it exactly as listed, capital letters, no spaces.
- end_date_invalid, start_date_invalid: "Contract end date (start date) must be a real date written as
  month/day/year, for example 12/31/2027." / write MM/DD/YYYY and check the day exists.
- type_not_recognised: "Contract type '<X>' is not recognised. Use one of: Fix, Future, LMP, MTM, MCP,
  MCP2." / change to a listed value.
- future_needs_start: "Future contracts need a contract start date." / fill in contract_start_date or
  change the type.
- esi_duplicate (Portfolio upload only; not applied to the contract_renewal upload): "This ESI ID appears
  more than once in the file (rows 12 and 340). Each ESI ID can appear only once." / keep one row for
  this ESI ID and delete or correct the others. Every involved row gets the problem, listing all rows.
  ESI IDs are compared case-insensitively (like the database column). Whole upload is rejected.
A blank contract_type now yields one problem (missing_value) instead of two.

### 13.3 Upload page (app/pages/admin/portfolio-contracts-upload.tsx)
Formatting lives in `app/utils/uploadReport.ts`; check it with `node utils/uploadReport.check.mjs` (from app/).
Rejected: red summary, problems grouped by type (count, how-to-fix, first 10 as
`Row 57 | contract_rate | "4.65"`, "Show all"), "Download problem list (CSV)". Accepted: green summary.
409/503/401/403/400/network: the API message in a box plus one line saying what to do.
The frontend could not be rendered in this environment: VERIFIED by type-check and the node check only.

### 13.4 Migration 055 (2026-10-06, LOCAL ONLY)
Adds 4 profiles to load_profiles_master (113 -> 117 locally, synced to 4 local tenants, NOT live):
BUSIDRRQ_WEST_IDR_NWS_NOTOU and BUSIDRRQ_FWEST_IDR_NWS_NOTOU -> BUSIDRRQ_WEST (no pricing key, by
design); RESLOPV_FWEST_IDR_WS_NOTOU -> RESLOWR_WEST; BUSOGFLT_FWEST_IDR_WS_NOTOU -> BUSLOLF_WEST.
Live rollout: run 055 on the source DB, then the shared sync, before the uploads can accept these.

### 13.5 Unexpected server errors on the upload (2026-10-06)

POST /api/admin/portfolio-contracts/upload now catches any unexpected exception, rolls the
session back, logs the full traceback server-side and answers HTTP 500 with a short message and
an 8-character reference id ("Please quote reference ABCD1234 to support."). No SQL or stack
trace reaches the browser. The traceback is written to the console and to
api/logs/portfolio_upload_errors.log (rotating, 2 MB x 3). Search that file for the reference id.
Because it is an HTTPException, the response passes through the CORS middleware, so the browser can
read the status and message (a raw unhandled exception does not carry CORS headers).
Test: test_unexpected_failure_returns_clean_500_with_reference.

### 13.6 Upload speed (2026-10-06)

Pass 2 of POST /upload used to run 4 queries per row (lookup, insert or update, forecast upsert,
forecast delete): about 43,000 queries for the 10,727-row sample. It is now set-based, in batches
of 500 rows, inside the same single transaction and the same single commit (all-or-nothing is
unchanged; validation and messages are unchanged):
- one lookup of existing source='upload' rows per batch (smallest id wins if an ESI has several),
- multi-row INSERT for new rows; INSERT ... ON DUPLICATE KEY UPDATE on the primary key for existing rows,
- batched upserts into customer_forecast_dates / future_forecast_dates and batched deletes from the other.
Measured locally on tenant_sync_verify_co (VERIFIED, 10,727 rows): about 94 s with the timing
wrapper (52 s without) before, about 16 to 21 s after. About 70 SQL queries instead of about 43,000.
VERIFIED equal: the rows in portfolio_contracts, customer_forecast_dates and future_forecast_dates
match the old per-row logic exactly, for an insert run and for a repeat (update) run.
Test: test_bulk_insert_then_update_across_batches_and_forecast_tables.

### 13.7 One upload at a time, and timeouts (2026-10-06)

One upload at a time per tenant database: POST /upload takes a MySQL advisory lock
(GET_LOCK('pu:' + MD5(database name), 0)) on its own connection before doing anything. A second
request while one is running gets HTTP 409 "Another upload is still running. Wait for it to
finish." and writes nothing. The lock is released on success, on a validation rejection, on
every HTTP error and on any exception; the connection is then discarded rather than pooled, so
the lock cannot survive on a pooled connection. A killed or crashed backend drops its MySQL
connection and MySQL frees the lock; no lock row is stored. Tests: second request refused (409),
lock free after success, after a 500, after a rejection and after an HTTP 400, same file twice.
The upload page disables the button while a request runs, ignores a second submit, and shows
"Uploading... this can take a minute, please do not close or refresh."

Timeouts, browser to backend (dev):
- The browser calls /api/... on the Next server, which proxies to FastAPI (next.config.ts rewrite).
- Next 16 proxies rewrites with a 30 s limit by default (VERIFIED in node_modules/next/dist/server/
  lib/router-utils/proxy-request.js). The setting is experimental.proxyTimeout (milliseconds).
  Now 600000 (10 min). The body limit experimental.proxyClientMaxBodySize default is 10 MB; now 50 MB.
- The page waits 10 min (portfolio-contracts-upload.tsx, timeout 600_000). Keep it <= proxyTimeout.
- Sizing: about 1 MB per 10,700 rows. 60,000 rows is about 5.4 MB and took 64 s through the proxy
  (VERIFIED, local); 10,727 rows took 9 s direct to the backend. So 10 min covers roughly 5x the 60,000 estimate.
- On a page timeout the message now says the upload may still be running or may have finished:
  wait a minute, check /portfolio, do not retry blindly.

#### Production note (NOT applied anywhere; nothing was changed on any server)

Production does not use the Next dev rewrite, so the proxy in front of FastAPI limits uploads.
Nginx needs, in the server/location block that proxies /api to the backend:

    client_max_body_size 50m;
    proxy_read_timeout   600s;
    proxy_send_timeout   600s;
    proxy_connect_timeout 60s;
    send_timeout         600s;

and the application server (gunicorn/uvicorn) must not kill a worker earlier (for gunicorn use
--timeout 600; uvicorn has no request timeout by default). Any other proxy or CDN in front
(Cloudflare, a load balancer) has its own idle limit, for example 100 s on Cloudflare free plans;
check it. If a gateway cannot be raised above about 100 s, keep uploads below that (about 50,000 rows at the local speed).

### 13.8 Duplicate upload rows (21,457 rows after one file of 10,727) - investigated 2026-10-06

Symptom: /portfolio showed 21,457 customers = 2 x 10,727 + 3 on tenant_sync_verify_co.

VERIFIED (read-only evidence before cleanup):
- portfolio_contracts held 21,457 rows, 10,730 distinct ESIs, all source='upload'. 10,727 ESIs had exactly 2 rows,
  the 3 original rows (ids 1-3) had 1. The two copies were created 55-68 seconds apart (two passes, not one).
- Ids ran in one continuous stream 138483 to 159936 and the two passes overlapped: the first pass wrote 10,003 rows
  (18:09:50 - 18:10:49), the second pass started at 18:10:54 (id 148486) while the first still had ~724 rows left.
  So the second request began about 64 seconds after the first, while the first was still running.
- customer_forecast_dates (10,602) and future_forecast_dates (125) held one row per ESI (unique key), no doubles.
- The backend on 8002 (pid 18176) was started 17:18, BEFORE the lock and the set-based upload were written
  (router edited 17:57). So it ran the old per-row code: no lock, one transaction, commit only at the end.
- No request log exists: uvicorn console output is not written to a file, api/logs holds only error traces
  (none from that time) and the Next dev log/trace for 3002 does not record proxied /api calls. The number of
  requests is therefore established only from the data above (two). Who sent the second one is NOT known:
  a second click, a reload, or a second tab are all possible; the app has no retry code (checked utils/api.ts)
  and the 3002 proxy timeout was already 600 s (server restarted 17:59), so a proxy retry is unlikely.

Root cause (VERIFIED by reproduction, scenario S5): old per-row pass 2 + no lock. The second request looks for
existing ESIs inside its own snapshot, which cannot see the first request's uncommitted rows, so it inserts again;
nothing in the table (no unique key on esi_id) stops it. Reproduced with the same file: first upload, second
upload started 20 s later, no lock: 21,457 rows, 10,727 ESIs with two upload rows (same as the user's data).
Not reproduced with the current code: sequential twice -> 10,727 inserted then 10,727 updated, 10,730 rows;
concurrent twice -> second gets 409, 10,730 rows.

Fix:
- The existing lock (13.7) already prevents it; the running server just never loaded it. RESTART 8002.
- Safety net before commit: a locking read (LOCK IN SHARE MODE, which also sees rows other requests committed
  meanwhile) checks the ESIs of this upload; if any has more than one source='upload' row the upload is rolled back,
  nothing is imported and the user gets HTTP 409 with a reference id (also logged).
- GET /api/admin/portfolio-contracts/status now returns duplicate_upload_esis; the upload page shows a red notice
  only when it is not zero.
- No unique key was added. A unique key on esi_id would break synced rows (one ESI can have several synced
  contracts); a key on (esi_id, source) would break the same way. Decision left to the owner.


## Future contracts, start dates, forecast and annual MWh (2026-10-06)

- **Future is not a customer yet.** Status `future` (type Future, start date after today) is
  excluded from Total customers, per-zone customers, usage, First Expiry and Portfolio Horizon
  and reported separately as `future_customers` (summary and per zone). /portfolio shows
  "Future contracts (not yet started): N" only when N > 0. The Contract Mix card still counts
  by type, so its Future figure also includes Future contracts that have already started;
  `future_customers` counts only those not yet started.
- **Date format (Portfolio upload only):** start date and end date are both m/d/Y
  (12/31/2027, 3/4/2027). ISO (2027-12-31) is rejected for both with a plain-language message. The contract_renewal upload is unaffected.
- **Forecast start/end are per day, inclusive.** A meter counts from its start date through its
  end date; no start date means from the beginning of the window. Tested on the local test
  tenant with meters ending/starting on the boundary days.
- **After an upload:** the ERCOT Shape forecast reads the contract tables directly. The DNA
  forecast is year-granular and needs portfolio_load_annual, forecast_baseline_dna and
  forecast_growth_factors; on the test tenant these are empty, so it shows zeros.
- **Annual MWh is not prorated** by start or end date (owner rule). Checked by reading:
  populate_portfolio_load_annual.py, populate_customer_forecast_dates.py, checkpoint_runner.py
  and controllers/portfolio.py; none multiplies or divides annual_kwh by days or months. The
  per-year totals SUM the full annual_kwh of every meter whose dates overlap that year (a date
  overlap filter, not proration). The ERCOT Shape forecast includes or excludes a meter per day
  and spreads its full annual figure by the shape.
- **DNA forecast tables are not refreshed automatically.** portfolio_load_annual is filled only
  by running populate_portfolio_load_annual.py by hand; forecast_baseline_dna by
  build_layer1_dna.py and forecast_growth_factors by build_layer2_growth.py. None is in a pm2
  config, a router or a trigger. An upload, edit or trigger sync does not refresh them.
