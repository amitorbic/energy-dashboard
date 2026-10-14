# ORBIC Pilot Readiness — Pending Items

**Status as of this document:** Access-control/entitlement infrastructure has
been built and verified with real, disposable-tenant testing. This document
exists to separate that from actual pilot-readiness, which requires more.

> **Honest framing, stated plainly:** everything verified so far proves *who
> can log in and what they can see*. It proves nothing about whether the
> actual product functionality (forecasting, billing, etc.) works correctly
> against real data, or whether a real customer outside localhost can reach
> this system at all. Treat this document as the gap between "infrastructure
> works" and "ready to hand to a paying customer."

---

## 1. Product functionality — not yet verified (highest priority)

- **Portfolio/forecasting logic has never been tested against real data.**
  Every test so far ran against a freshly-provisioned, schema-only, zero-row
  database. `/api/portfolio/summary` returning `200` with `null`/`0` values
  proves the code doesn't crash on empty data — it proves nothing about
  whether the actual forecasting calculations are correct once real market
  data is loaded.
- **No known, working pipeline for loading real data into a new tenant.**
  A freshly-provisioned tenant has zero rows in every table. For forecasting
  to be useful, real ERCOT market data, load history, customer positions,
  etc. need to get in somehow — this hasn't been identified, built, or
  tested.
- **This is the single highest-priority open question** — worth resolving
  before further infrastructure polish, since if the core product isn't
  there yet, the rest is secondary.

## 2. Production sync — migrations verified locally, not yet live

The following migrations were built and verified against local dev but
**none have been run against production**:

- `032_create_ercot_dam_spp.sql`
- `033_create_ercot_rtm_spp.sql`
- `039_create_email_reply_approval_queue.sql`
- `043_add_addition_billing_link.sql`
- `044_add_reporting_views.sql` (fixes the view-cloning bug -- see §7)
- `045_add_must_change_password_to_users.sql`
- `046_create_orbic_master.sql` (master-DB rename -- local dev only)
- `047_create_reference_sync_tables.sql` (reference data sync pipeline)
- `048_create_portfolio_contracts.sql` (standalone portfolio table + triggers; run
  against source DB AND every existing tenant DB on live -- same pattern as 045)
- `049_add_contract_start_date_to_portfolio_contracts.sql` (additive ALTER on
  portfolio_contracts; run against source DB AND every tenant DB)
- `051_portfolio_view_full_types.sql` (replaces portfolio_view: full type pass-through,
  Unknown fallback, future status; run against source DB AND every tenant DB)
- `052_portfolio_contracts_trigger_sync_normalization.sql` (replaces sync triggers from 048
  with type-normalizing versions: Default->MTM, NULL+past->MTM, NULL+future->Fix,
  unrecognized->Unknown; run against source DB AND every tenant DB)

**Do NOT run** `050_future_contract_type.sql` -- superseded by 051. See
`docs/DB_MIGRATIONS.md` for details.

**Explicitly excluded, do not run:** `042_create_tenant_modules.sql` -- per
the modularization brief, this stays preserved but inactive this phase. The
active entitlement mechanism is environment-based (`TENANT_MODULES`), not
this table.

**Also pending on production, independent of today's session:** any
already-provisioned production tenant likely has the same
`must_change_password` gap that was found and backfilled locally (§7) --
needs the same backfill treatment on production once migration 045 lands
there.

**Production master-DB rename** (`ameripower_master` -> `orbic_master`) is
explicitly deferred -- needs real VPS access to inventory actual tenant
`.env` files and check for any external script/monitoring dependency on the
old name, neither of which is visible from local dev.

## 2a. Portfolio contracts and reference-data sync work (added 2026-10-05)

These items are complete locally but not yet on live:

**Portfolio contracts upload pipeline** (`docs/PORTFOLIO_CONTRACTS.md` has the full
design):
- `portfolio_contracts` table, sync triggers, upgrade endpoint, discrepancy log (048)
- `contract_start_date` column on `portfolio_contracts` (049)
- Admin upload page at `/admin/portfolio-contracts-upload` -- template/sample CSV
  download, two-pass zero-tolerance upload (all rows validated first; if any row fails
  the whole upload is rejected with a per-row error list)
- Valid contract types: Fix, Future, LMP, MTM, MCP, MCP2. Normalization is
  case-insensitive (e.g. "fixed" stores as "Fix"). NULL/'Default'/stray values show as
  Unknown in the view -- never silently folded into MTM
- `portfolio_view` updated (migration 051): full type pass-through, Unknown fallback,
  contract_start_date exposed, Future rows with future start date get status='future'
  (auto-becomes 'active' when date arrives, no re-upload needed)
- Contract Mix on /portfolio shows all non-zero types separately; Unknown banner appears
  when any rows have unrecognized type
- Migration 051 applied locally to `u972964962_orbic`, `tenant_sync_verify_co`, and
  `tenant_portfolio_sync_test_co`. Migration 052 (trigger normalization) also applied
  to all three. `tenant_test_pilot_co` and `tenant_test_rep` do not have 048 yet so
  051/052 were not applied there. All four still need to be run on live.
- Pending gap: `app/pages/admin/portfolio-contracts-upload.tsx` may not yet handle the
  new `{"accepted": false, "invalid_rows": [...]}` response shape (unverified).
- Pending gap: sample CSV does not yet include MCP/MCP2 example rows.

**Reference-data sync pipeline** (migration 047):
- `reference_sync_state` (tenant-side) and `reference_sync_source_status` (source-side)
  tables back `api/scripts/sync_reference_data.py`
- Verified locally: fleet-wide incremental sync succeeds across all local tenants;
  `/api/risk/overall` reflects real `data_as_of` timestamps
- Gap found during verification: `tenant_test_rep` was missing schema from migrations
  030/034/035/036. Backfilled locally (tables were empty). Same drift may exist on live
  tenant DBs -- check before running 047 on live (see DB_MIGRATIONS.md row for 047)

**Unverified items (status unknown):**
- Whether any already-provisioned live tenant DB is missing 030/034/035/036 schema
  (the drift found on `tenant_test_rep` locally)
- The exact list of tenant DBs on live and their current schema state
- Whether the frontend upload page (`portfolio-contracts-upload.tsx`) correctly renders
  the new two-pass rejection response

## 3. Real-world reachability — completely untested

Every test performed today used `127.0.0.1` / `localhost`, plain HTTP, on
the local development machine. **Nothing has proven**:

- A real customer, on their own computer, over the internet, can reach this
  system at all
- HTTPS/TLS works correctly for a real domain
- DNS is configured for any real subdomain
- Nginx correctly routes a real subdomain to the correct tenant's app
  process

## 4. Tenant provisioning — DB layer solid, deployment layer fully manual

`provision_tenant.py` is proven reliable for the database layer (schema
clone including views, bootstrap admin, master registration, `.env`
generation with `--modules`, pre-flight migration verification). **Still
entirely manual, with no automation or generator**:

- Standing up a new FastAPI process on its own port (per the one-process-
  per-tenant architecture) and keeping it running (pm2/systemd)
- Configuring Nginx to route the new subdomain to the new port
- DNS setup for the new subdomain
- Realistic estimate: minutes for the DB layer, **hours of manual work**
  for everything else, per new tenant, with no repeatable checklist beyond
  the written runbook (`docs/TENANT_ONBOARDING_RUNBOOK.md`)

## 5. Security — one real, deliberately deferred weakness

- **Password hashing uses MD5** (`controllers/auth.py`) — cryptographically
  weak for password storage. Flagged, not fixed, because fixing it touches
  every existing login across dev and production — a bigger, riskier change
  than anything else tackled today. Should be resolved before real customer
  credentials are on the line.

## 6. Multi-user / team support — does not exist

- **No way for a tenant's own admin to add teammates.** Every plausible
  endpoint (`/api/users`, `/api/team`, `/api/invite`, etc.) returns `404`.
  The only code that creates a user row is the one-time bootstrap script.
- **No per-user permission layer** — confirmed today that if a second user
  were ever manually added to a tenant, they would automatically get
  identical module access to the tenant's admin. Only `role` differs
  (gates whether the Admin nav card shows).
- **Practical implication: today, a real customer can only ever have
  exactly one login.** Team invite is genuinely new feature work (invite
  flow, likely email sending, a new page, and eventually real per-user
  permissions), not a quick fix — worth its own scoping conversation once
  closer to a real multi-person pilot.

## 7. Bugs found and fixed today (for reference — already resolved locally)

- **View-cloning bug**: `provision_tenant.py`'s schema clone only copied
  base tables, silently skipping all 9 database views
  (`portfolio_view`, `v_account_balance`, `v_aging_buckets`,
  `v_approval_queue_pending`, `v_arr_exposure`, `v_bounced_payments`,
  `v_etf_open`, `v_missed_installments`, `v_payments_today`). This meant
  every freshly-provisioned tenant's `/api/portfolio/summary` (likely the
  first real call a new tenant's dashboard makes) crashed with a `500`.
  Fixed: migration 044 (documents the views), `step_clone_schema()` now
  clones views too, pre-flight check extended to verify views exist before
  provisioning. Verified with a real disposable tenant — confirmed `200`
  instead of `500`.
- **`must_change_password` missing on already-provisioned tenants**: found
  while verifying the master-DB rename — `tenant_test_pilot_co`'s real
  login was returning a `500` because its schema predated migration 045.
  Backfilled (`DEFAULT 0`, not `1`, since these are existing users) on both
  local tenant databases found (`tenant_test_pilot_co`,
  `tenant_test_rep`). Same gap likely exists on any pre-045 production
  tenant — see §2.

## 8. What's genuinely solid and tested (for reference)

- Deployment-per-tenant isolation (physically separate databases per REP,
  confirmed no `rep_id` filtering needed anywhere)
- `provision_tenant.py`'s database layer: schema clone (tables + views),
  bootstrap admin creation, master registration, rollback on failure,
  `.env` template generation with `--modules` flag
- Pre-flight migration verification (blocks provisioning from an
  incomplete source DB, tested both positive and negative)
- Module entitlement enforcement — backend (`require_module()`,
  `require_any_module()`), confirmed via real `403`s on cross-module
  requests, confirmed via a full route inventory (50 routers traced to
  real frontend call sites, not guessed from naming)
- Forced password-change-on-first-login, backend-enforced (not just
  frontend-hidden), confirmed via direct API bypass attempt returning
  `403`, confirmed token refresh after successful change
- Admin tooling (`addon_charge_types`, TDSP calendar, test data generator)
  confirmed genuinely tenant-scoped, safe for a tenant's own admin to use
- Landing page correctly reflects real sidebar segments (Sales,
  Operations, Portfolio, Reports, Audit, Customers, Broker, Admin) — no
  more drift between the two
