# Database Migrations — Tracking & How to Apply

Single source of truth for which schema changes are live vs. only local.
Every migration is a plain SQL file under `api/migrations/`, numbered and
never edited after the fact (a fix to an already-numbered migration is a
new, later-numbered file). Nothing in this repo runs migrations
automatically — every file is written for manual review, then run by hand.

## Environments

| | Local (dev) | Live |
|---|---|---|
| Host | this machine | VPS, via SSH |
| App path | `C:\AmeriPower` | `/var/www/energyapp/` |
| DB name | `u972964962_orbic` (see `api/.env`) | `energyapp` |
| DB access | local MySQL, `api/.env` creds | `mysql` CLI on the VPS (SSH in first) |

## How to apply a migration on live

```bash
ssh <your-vps-alias>
cd /var/www/energyapp/
git pull                        # picks up the new migration file(s) + code
cat api/migrations/0NN_xxx.sql  # read it once before running — some are
                                 # destructive or ALTER an existing table
mysql -u <db_user> -p energyapp < api/migrations/0NN_xxx.sql
```

For a migration that `ALTER`s an existing table (adds columns to a table
that already has data/other columns), check the live schema first so you
don't double-add a column that's already there:

```bash
mysql -u <db_user> -p energyapp -e "DESCRIBE confirmation_log;"
```

If the app is also deployed via a process manager (pm2 / systemd / etc.),
remember the code restart is separate from the DB step above — a new
migration alone doesn't restart the app.

## Checking whether a DB actually has every migration applied

`api/scripts/provision_tenant.py` now includes a `step_verify_source_migrations()`
pre-flight check: before cloning schema into a new tenant, it statically parses
every file in `api/migrations/` (excluding the master-DB-only
ones, 001, 042, and 046) into the tables/columns they expect, then runs `SHOW TABLES`
/ `SHOW COLUMNS` against the configured source DB and refuses to proceed if
anything is missing. It's a structural check, not a migration runner — it
can't replace this doc as the source of truth on *live*, but it's a real,
reproducible way to check a DB you can actually connect to (e.g. local dev)
without going table-by-table by hand. Running it against the local dev DB on
2026-09-22 is how migrations 032, 033, and 039 were found to be missing (see
Pending table above) rather than merely "unverified."

**2026-09-23 update:** 032, 033, 039, and 043 were applied for real to the
local dev DB (`u972964962_orbic`) — see the Pending table below for details
and the full mysqldump backup taken first. Re-running
`step_verify_source_migrations()` afterward now **passes** against
`u972964962_orbic` with no missing tables/columns reported. None of the four
have been run on live yet — that's still a separate, later step; see the
"Command (live)" column in each row below.

## Pending — not yet confirmed applied to live

| Migration | What it does | Local | Command (live) |
|---|---|---|---|
| `032_create_ercot_dam_spp.sql` | Creates `ercot_dam_spp` (ERCOT day-ahead market settlement point prices). Portfolio/forecasting-relevant. | ✅ **Applied to local dev 2026-09-23** (`u972964962_orbic`) — full DB backup taken first: `backups/u972964962_orbic_pre_migrations_032_033_039_043_20260923_102516.sql`. Verified via `DESCRIBE ercot_dam_spp`. **Not yet run on live.** | `mysql -u <db_user> -p energyapp < api/migrations/032_create_ercot_dam_spp.sql` |
| `033_create_ercot_rtm_spp.sql` | Creates `ercot_rtm_spp` (ERCOT real-time market settlement point prices). Portfolio/forecasting-relevant. | ✅ **Applied to local dev 2026-09-23**, same backup/verification as 032 above. **Not yet run on live.** | `mysql -u <db_user> -p energyapp < api/migrations/033_create_ercot_rtm_spp.sql` |
| `039_create_email_reply_approval_queue.sql` | Creates `email_reply_approval_queue` and `email_reply_timeline` (with its FK to the queue table). | ✅ **Applied to local dev 2026-09-23**, same backup. Verified both tables exist and the FK constraint (`fk_ert_queue_item`) is in place via `SHOW CREATE TABLE`. **Not yet run on live.** | `mysql -u <db_user> -p energyapp < api/migrations/039_create_email_reply_approval_queue.sql` |
| `042_create_tenant_modules.sql` | Creates `tenant_modules` (rep_id, module_key, enabled) in the **master** DB (`orbic_master`, renamed from `ameripower_master` — see 046 below), not `energyapp` — entitlements for the ORBIC Sales/Operations/Portfolio/Audit product split. Part of `docs/ORBIC_PRODUCT_MODULARIZATION_SCOPE.md`. Fail-open: no rows for a rep_id = all modules enabled, so no existing tenant is affected until rows are inserted. | not run locally (also never was, against the old `ameripower_master` name) | `mysql -u <db_user> -p orbic_master < api/migrations/042_create_tenant_modules.sql` |
| `046_create_orbic_master.sql` | Renames the master DB from `ameripower_master` to `orbic_master` to match current branding — recreates `reps` under the new name for fresh installs. `001_create_reps_table.sql` is left untouched as historical record, per the no-edit-numbered-migrations rule. | ✅ **Applied to local dev 2026-09-24** — `orbic_master` created as a real schema+data copy of `ameripower_master` (one-off Python/aiomysql script, not this migration file, since the old DB already had live rows: 3 rows in `reps`, verified row-count match after copy; `tenant_modules` did not exist locally so nothing to copy there). Code defaults (`master_db.py`, `provision_tenant.py`), `api/.env`, the one local tenant `.env` (`provisioned_envs/your-test-subdomain.env`), and all doc references updated to `orbic_master`. Verified via a disposable test tenant provisioned end-to-end against `orbic_master`, plus the existing `your-test-subdomain` tenant backend still booting/logging in fine (see verification note below). Old `ameripower_master` DB was then dropped locally. **Not yet done on live** — production rename is out of scope for this pass; needs direct production visibility first (full tenant `.env` inventory, any external script/monitoring dependency on the old name) that isn't available from here. | Not applicable yet — this is local-dev-only for now; see the follow-up note below before ever running this against live. |
| `043_add_addition_billing_link.sql` | Adds `linked_cust_id`, `billing_choice` to `confirmation_log` and `bill_to_id` to `enrollment_masterroll` — carries an Addition's linked-account choice from the send-confirmation form through masterroll staging to the final `contract_renewal.bill_to_id`. Build Plan #9. | ✅ **Applied to local dev 2026-09-23**, same backup. Verified all 3 columns via `SHOW COLUMNS` — no pre-existing collisions (confirmed empty before running). **Not yet run on live.** | `mysql -u <db_user> -p energyapp < api/migrations/043_add_addition_billing_link.sql` |
| `044_add_reporting_views.sql` | Documents 9 pre-existing reporting VIEWs (`portfolio_view`, `v_account_balance`, `v_aging_buckets`, `v_approval_queue_pending`, `v_arr_exposure`, `v_bounced_payments`, `v_etf_open`, `v_missed_installments`, `v_payments_today`) used by the portfolio/collections dashboards — same "undocumented drift" pattern as `041`. Captured via `SHOW CREATE VIEW` against local dev, `DEFINER` stripped, `CREATE OR REPLACE` for idempotency. Found already present on local dev (`u972964962_orbic`), not newly created. Also fixed `step_clone_schema()` in `provision_tenant.py` to clone views (it previously only cloned `BASE TABLE`s, so no provisioned tenant ever got these 9 views — root cause of a real 500 on `/api/portfolio/summary` for every new tenant), and extended `step_verify_source_migrations()` to pre-flight-check these views exist on the source DB. | ✅ **Confirmed present on local dev 2026-09-23** (`u972964962_orbic`) — re-ran the file there (no-op, `CREATE OR REPLACE` against identical definitions). **View status on live is unknown — not yet checked, not yet run.** | `mysql -u <db_user> -p energyapp < api/migrations/044_add_reporting_views.sql` (run `SHOW FULL TABLES WHERE Table_type='VIEW';` on live first — these may already exist there undocumented, same as `041`) |
| `045_add_must_change_password_to_users.sql` | Adds `must_change_password TINYINT(1) NOT NULL DEFAULT 0` to `users` — forced password-change-on-first-login. `provision_tenant.py` sets it to 1 for the bootstrap admin it creates; existing users default to 0 and are unaffected. Enforced backend-side in `middleware/auth.py`'s `require_auth`. `users` predates the migration system, same caveat as `041`/`043` — check live schema first. **Gap found 2026-09-24**: this ALTER only ever ran against the source DB (`u972964962_orbic`) — every already-provisioned tenant DB (`tenant_*`) was missed, so `/auth/login` 500'd for every one of them (`Unknown column 'must_change_password'`) until backfilled. Not caused by, but found while verifying, the `orbic_master` rename (see `046` above). | Applied to local dev 2026-09-24 (`u972964962_orbic`), verified via `DESCRIBE users;` and via a live disposable-tenant test (see below). **Backfilled 2026-09-24 to both already-provisioned local tenant DBs** (`tenant_test_pilot_co`, `tenant_test_rep` — the only two `tenant_*` DBs that exist locally) with `must_change_password` defaulting to 0 (not 1 — these are existing users, not new bootstrap admins). Verified via a genuine `/auth/login` call against each afterward (not just a minted JWT): both return `"must_change_password": false` and a valid token. **Not yet run on live** — same gap likely exists there for any already-provisioned production tenant; needs the same backfill on live once production access is available (see `046`'s production follow-up note). | `mysql -u <db_user> -p energyapp < api/migrations/045_add_must_change_password_to_users.sql` (run `DESCRIBE users;` on live first) — **and** the same `ALTER TABLE` against every existing tenant DB on live, not just `energyapp` |
| `048_create_portfolio_contracts.sql` | Creates the standalone `portfolio_contracts` table that Portfolio reads from instead of `contract_renewal` — plus `portfolio_contracts_sync_state` (single-row per-tenant flag, `is_full_tenant`, flipped only by the explicit staff-run `POST /api/admin/portfolio-contracts/upgrade` endpoint, never inferred at login/startup) and `portfolio_contract_upgrade_discrepancies` (discrepancy log written before any clear-and-replace on upgrade). Adds `AFTER INSERT`/`AFTER UPDATE`/`AFTER DELETE` triggers on `contract_renewal` that one-way sync into `portfolio_contracts` (only when `is_full_tenant=1`), and repoints `portfolio_view` (from `044`) to read from `portfolio_contracts` instead of `contract_renewal` — this is the only touchpoint with Portfolio's read side; `controllers/portfolio.py` needs zero code changes since every one of its functions already goes through `portfolio_view`. Portfolio-only tenants populate the table via a new admin spreadsheet upload (`source='upload'`) instead; full-4-module tenants get `source='synced'` rows via the triggers. `TRUNCATE` doesn't fire triggers in MySQL, so `api/scripts/reconcile_portfolio_contracts.py` is the nightly backstop for the existing bulk-upload endpoint's `TRUNCATE TABLE contract_renewal` and any other missed write path. Two disclosed behavior changes in the repointed view: `cust_id` is always `NULL` now (not a field `portfolio_contracts` tracks — it wasn't one of the fields Portfolio's read-side functions actually need), and `contract_end_date` is a real `DATE` column rather than parsed from a varchar at read time. | ✅ **Applied to local dev 2026-09-25** to `u972964962_orbic` (source) — all 8 statements (2 tables, seed insert, discrepancy-log table, 3 triggers, repointed view) verified via direct queries and `SHOW TRIGGERS`. **Full end-to-end verification completed 2026-09-25** against a real disposable tenant (`tenant_portfolio_sync_test_co`, "Portfolio Sync Test Co", provisioned fresh — `provision_tenant.py`'s `step_clone_schema()` was extended first to clone `TRIGGER` objects, confirmed working: the provision run logged `cloned trigger: trg_portfolio_contracts_sync_ins/upd/del`): (1) uploaded a real 3-row CSV via `POST /admin/portfolio-contracts/upload`, confirmed real forecast numbers back from `GET /portfolio/summary`/`by-zone`/`customers` (unmodified `controllers/portfolio.py` — grepped for `is_full_tenant`/`TENANT_MODULES`/`portfolio_contracts`/`subscription`, zero matches in `controllers/portfolio.py` or `routers/portfolio.py`, confirming zero subscription-branching in Portfolio's 5 read-side functions: `get_portfolio_summary`, `get_portfolio_by_zone`, `get_portfolio_customers`, `get_open_position`, `get_portfolio_forecast` — these back 5 of the 11 total endpoints in `routers/portfolio.py`, the other 6 are ERCOT load/position endpoints unrelated to contract data); (2) inserted 3 deliberately mismatched `contract_renewal` rows (different rate/usage/end-date/company/type per ESI ID); (3) restarted the tenant with `TENANT_MODULES=enterprise` and called `POST /admin/portfolio-contracts/upgrade` — **found and fixed a real bug during this step**: `_SYNC_CANDIDATES_SQL` in `routers/admin_portfolio_contracts.py` used `STR_TO_DATE(contract_end_date, '%%m/%%d/%%Y')` (doubled `%%`), which is only correct when SQLAlchemy's `text()` performs DBAPI-level `%`-substitution — it only does that when the query has bind parameters, and this query has none, so the literal doubled `%%` was sent to MySQL, `STR_TO_DATE` returned `NULL` for every row, and the `IS NOT NULL` filter silently zeroed out every sync candidate (reproduced standalone with a minimal SQLAlchemy script before touching the fix, confirmed single `%` resolves it); fixed to single `%`, confirmed `reconcile_portfolio_contracts.py`'s equivalent SQL was never affected (raw `aiomysql` cursor, not SQLAlchemy `text()`, called with no `args` — no substitution attempted either way); after the fix and a clean re-run, `/upgrade` returned `discrepancies_found: 16` (every real per-field diff: rate/volume/end-date/company-name/broker-code on all 3, plus contract_type on 1 — old=upload value, new=synced value, all logged to `portfolio_contract_upgrade_discrepancies` **before** the clear-and-replace, confirmed via `GET /upgrade-report`), `upload_rows_cleared: 3`, `synced_rows_backfilled: 3`, `is_full_tenant` flipped to `1`; (4) confirmed post-upgrade `GET /portfolio/summary`/`customers` now reflect the synced (`contract_renewal`-derived) values, not the stale uploaded ones; (5) confirmed `POST /upload` now returns `409` with the exact required message `"This tenant is on the full platform — contract data now syncs automatically."`; (6) confirmed the live triggers (not just the one-time backfill) by inserting a brand-new `contract_renewal` row directly — a matching `source='synced'` row appeared with zero endpoint calls — then deleting that `contract_renewal` row and confirming the synced row was auto-removed; (7) ran `reconcile_portfolio_contracts.py --tenant-db tenant_portfolio_sync_test_co` — clean no-op on consistent state, then re-ran after manually inserting a fake orphaned `synced` row (`synced_from_serial` pointing at a nonexistent serial, simulating the `TRUNCATE`-bypasses-triggers gap since `TRUNCATE` itself is blocked here by a pre-existing FK from `contract_addon_charges`) — reconcile correctly dropped exactly that 1 orphaned row and left the 3 real synced rows untouched. **Not yet run on live.** | `mysql -u <db_user> -p energyapp < api/migrations/048_create_portfolio_contracts.sql` — **and** the same file against every existing tenant DB on live (same pattern as `045`/`047`) |
| `047_create_reference_sync_tables.sql` | Creates `reference_sync_state` (tenant-side: per-table `last_synced_at`/`last_source_id`/`rows_synced`, meaningful in every tenant's own DB) and `reference_sync_source_status` (source-side: per-table `last_synced_at`/`last_source_id`/`tenants_synced`, only ever meaningfully written in the real shared source DB — a tenant's cloned copy stays permanently empty). Backs the new shared-reference-data sync pipeline (`api/scripts/sync_reference_data.py`, `api/utils/shared_reference_tables.py`) — replaces `is_stale`/threshold logic with plain comparable timestamps on both the push side and the receive side. | ✅ **Applied to local dev 2026-09-25** to `u972964962_orbic` (source) and both existing local tenant DBs (`tenant_test_pilot_co`, `tenant_test_rep`) — same "backfill every existing tenant, not just source" pattern as `045`. **Gap found 2026-09-25 while verifying (pre-existing, unrelated to this migration)**: `tenant_test_rep` was also missing 4 columns + a UNIQUE KEY on `ercot_lfc_history` from migration `030` and the 3 whole tables from migrations `034`/`035`/`036` — none of those were ever backfilled to it after creation. Table was empty (0 rows) so it was safe to apply `030`, `034`, `035`, `036` directly to `tenant_test_rep` locally to bring it in line with `u972964962_orbic`/`tenant_test_pilot_co`; no data existed to migrate. **This same drift should be checked for on live** (and any other already-provisioned live tenant) before assuming the sync pipeline will work everywhere — `SELECT *`-based sync fails loudly (not silently) per-table/per-tenant if schemas don't match, see the run log this was found from. Verified end-to-end afterward: fleet-wide `--mode incremental` sync succeeds 4/4 tenants on every registry table, source and tenant `last_synced_at`/`last_source_id` match exactly after a real sync, and `/api/risk/overall` (a live forecast endpoint) returns the real tenant-side timestamp in `data_as_of`. **Not yet run on live.** | `mysql -u <db_user> -p energyapp < api/migrations/047_create_reference_sync_tables.sql` — **and** the same file against every existing tenant DB on live (see `045`'s row above for why) — **and first run `DESCRIBE ercot_lfc_history; SHOW TABLES LIKE 'ercot_%settlement%'; SHOW TABLES LIKE 'ercot_dam_capacity%';` against each live tenant to check for the same `030`/`034`/`035`/`036` drift found locally, backfilling those first if any tenant is missing them** |

| `050_future_contract_type.sql` | Replaces `portfolio_view` (from `048`) to add a `'future'` status for contracts with `contract_type = 'Future'` AND `contract_start_date > CURDATE()`, and exposes `contract_start_date` as a view column. No table schema changes — `contract_type` is already `VARCHAR`. Application code (`admin_portfolio_contracts.py`) now syncs `Future` rows to `future_forecast_dates` and non-Future rows to `customer_forecast_dates` on every upload. | Local only — not yet applied | `mysql -u <db_user> -p energyapp < api/migrations/050_future_contract_type.sql` — **and** the same file against every existing tenant DB on live |
| `049_add_contract_start_date_to_portfolio_contracts.sql` | Adds `contract_start_date DATE NULL` to `portfolio_contracts` (created in `048`) — additive `ALTER`, `048` left untouched per the no-edit-numbered-migrations rule. Backs the updated upload field list: Contract Start Date is optional in the admin CSV upload, defaulting to today's date at parse time in `routers/admin_portfolio_contracts.py` when blank (not a DB-level default, so every other write path — the `contract_renewal` sync triggers, `reconcile_portfolio_contracts.py`, the `/upgrade` backfill — just leaves it `NULL`, unchanged from before this migration, since none of those column lists mention it). Also removed `company_name`/`broker_code` from the upload path only (they stay on the table and keep populating for `source='synced'` rows exactly as before — sync/upgrade/discrepancy-check code was not touched). | ✅ **Applied to local dev 2026-09-25** to `u972964962_orbic` (source), `tenant_sync_verify_co`, and `tenant_portfolio_sync_test_co` — verified via `DESCRIBE portfolio_contracts` on all three. **Real end-to-end verification completed 2026-09-25** against `tenant_sync_verify_co` (backend restarted first — it runs plain `uvicorn.run()` with no `--reload`, so the code edit alone wasn't picked up until restart): (1) logged in for real via `POST /auth/login`; (2) `GET /template` and `/sample` both return the new 7-column header (`esi_id,load_profile,contract_rate,annual_volume,contract_type,contract_start_date,contract_end_date`), `company_name`/`broker_code` gone; (3) uploaded the regenerated 3-row sample via `POST /upload` — `{"inserted":3,"updated":0,"errors":0}`; (4) confirmed in the DB that the two blank-`contract_start_date` rows got `2026-09-25` (today) and the row with a real future date (`03/01/2027`) stored it as given, unchanged; `company_name`/`broker_code` are `NULL` on all 3 (no longer collected on upload — chose **ignore, not reject**, for either field if still present in an uploaded file: `_ALL_UPLOAD_COLS` re-selects only the current column set, so extra columns are silently dropped rather than erroring the whole file); (5) confirmed `GET /portfolio/summary`, `/by-zone`, `/customers` all reflect the 3 new rows correctly (3 zones, 2 Fix/1 LMP, correct usage/end-dates). Separately verified the sync/upgrade/discrepancy-check side was **not** broken by this change, without re-running the full `048` upgrade flow again: `_DIFF_FIELDS`, `_SYNC_CANDIDATES_SQL`, and the `/upgrade` endpoint body are byte-for-byte unchanged (grepped to confirm); live-tested the triggers directly against `tenant_portfolio_sync_test_co` (already upgraded, `is_full_tenant=1` from `048`'s verification) by inserting a fresh `contract_renewal` row — the `AFTER INSERT` trigger produced a correct `source='synced'` row with `contract_start_date` `NULL` (expected: the triggers' INSERT column lists were deliberately left untouched, so synced rows don't carry a start date yet — a disclosed gap, not a bug) — then deleted the `contract_renewal` row and confirmed the `AFTER DELETE` trigger removed the synced row, restoring the tenant to its pre-test state. One disclosed side effect: `portfolio_view.company_name`/`broker_code` will now always be `NULL` for any *new* upload row (they still populate correctly for `source='synced'` rows), so `GET /portfolio/customers` will show a blank company name for portfolio-only tenants going forward — inherent to removing those two fields from the upload path as requested, not a bug. **Not yet run on live.** | `mysql -u <db_user> -p energyapp < api/migrations/049_add_contract_start_date_to_portfolio_contracts.sql` — **and** the same file against every existing tenant DB on live (same pattern as `045`/`047`/`048`) |

## Applied to live — log

| Date | Migration | Notes |
|---|---|---|
| 2026-09-22 | `041_add_confirmation_log_start_date_flags.sql` | Found already present on live via `DESCRIBE confirmation_log` — all 12 flag columns existed with matching types/defaults before the file was ever run. No ALTER was executed; logged as applied because live already matches the target schema. |

## Migrations 001–040 — presumed live (unverified)

These predate this tracking doc. I have no way to check the live DB from
here, so these are listed as **presumed applied** only because the app has
been running in production against them — not confirmed. If anything in
this range is in doubt, verify on the VPS with `DESCRIBE <table>` /
`SHOW TABLES LIKE '<name>'` before trusting this list, then update the
status here.

| # | File | Presumed live? |
|---|---|---|
| 001 | create_reps_table.sql | ✅ unverified |
| 002 | rename_mills_columns.sql | ✅ unverified |
| 003 | create_billing_engine_tables.sql | ✅ unverified |
| 004 | ercot_charge_code_reference.sql | ✅ unverified |
| 005 | add_is_taxable_to_charge_mappings.sql | ✅ unverified |
| 006 | fix_is_per_unit_tdsp_charge_mappings.sql | ✅ unverified |
| 007 | add_is_taxable_to_billing_period_charges.sql | ✅ unverified |
| 008 | tax_rates_and_invoice_subtotals.sql | ✅ unverified |
| 009 | add_energy_charge_to_billing_periods.sql | ✅ unverified |
| 010 | rebuild_tax_jurisdiction_rates.sql | ✅ unverified |
| 011 | add_premise_county_to_contract_renewal.sql | ✅ unverified |
| 012 | add_msc043_charge_mapping.sql | ✅ unverified |
| 013 | add_addon_total_to_invoices.sql | ✅ unverified |
| 014 | add_tax_exempt_flags_to_contract_renewal.sql | ✅ unverified |
| 015 | create_gros_tax_rates.sql | ✅ unverified |
| 016 | create_enrollment_masterroll.sql | ✅ unverified |
| 017 | create_addon_charge_tables.sql | ✅ unverified |
| 018 | create_esi_id_master.sql | ✅ unverified |
| 019 | add_esi_id_master_indexes.sql | ✅ unverified |
| 020 | add_posted_status_to_invoices.sql | ✅ unverified |
| 021 | invoice_sequence_tracker.sql | ✅ unverified |
| 022 | create_mtm_tables.sql | ✅ unverified |
| 023 | create_weather_to_load_zone.sql | ✅ unverified |
| 024 | create_portfolio_load_tables.sql | ✅ unverified |
| 025 | create_ercot_forecast_tables.sql | ✅ unverified |
| 026 | create_ercot_shape_tables.sql | ✅ unverified |
| 027 | create_forecast_engine_tables.sql | ✅ unverified |
| 028 | create_customer_forecast_tables.sql | ✅ unverified |
| 029 | create_forecast_checkpoints.sql | ✅ unverified |
| 030 | add_smart_save_columns.sql | ✅ unverified |
| 031 | create_risk_tables.sql | ✅ unverified |
| 032 | create_ercot_dam_spp.sql | ⛔ moved to Pending — applied to local dev 2026-09-23, not yet live, see above |
| 033 | create_ercot_rtm_spp.sql | ⛔ moved to Pending — applied to local dev 2026-09-23, not yet live, see above |
| 034 | create_ercot_rtm_settlement_prices.sql | ✅ unverified |
| 035 | create_ercot_dam_settlement_prices.sql | ✅ unverified |
| 036 | create_ercot_dam_capacity_prices.sql | ✅ unverified |
| 037 | create_ercot_weather_tables.sql | ✅ unverified |
| 038 | redesign_ercot_weather_zone_temp.sql | ✅ unverified |
| 039 | create_email_reply_approval_queue.sql | ⛔ moved to Pending — applied to local dev 2026-09-23, not yet live, see above |
| 040 | create_tdsp_meter_read_calendar.sql | ✅ unverified |

If you (the user) know for a fact some of these were never run on live,
say so and I'll move them into the Pending table above instead.

---

## Protocol for Claude (read this before touching `api/migrations/`)

1. **New migration file** → add a row to the *Pending* table above: file
   name, one-line description of what it does, and the exact `mysql ...`
   command to run it. Do this in the same turn you create the migration.
2. **Never mark a row Applied yourself.** Only the user runs SQL against
   live (they SSH into the VPS by hand). When they say something like "ran
   041 on live" / "done" / "applied it", move that row from *Pending* to
   the *Applied to live* log with today's date, and remove it from
   *Pending*.
3. **ALTERs on existing tables** — always call out in the migration's own
   header comment (like `041_...` does) that the live schema should be
   checked first, since this codebase's tables sometimes already have
   columns added by hand outside the migration system (e.g. `confirmation_log`
   predates migrations entirely).
4. Keep this file as the *only* place migration-apply-status lives — don't
   duplicate it in code comments or other docs.
