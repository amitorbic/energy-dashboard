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

## Pending — not yet confirmed applied to live

| Migration | What it does | Local | Command (live) |
|---|---|---|---|
| `041_add_confirmation_log_start_date_flags.sql` | Adds 12 flag columns to `confirmation_log` (`asap`, `meter_read`, `prior_day`, `nodal`, `credit_status`, `contract_received`, `executed`, `forwarded`, `paper_bill`, `switch_flag`, `pmvi`, `mvi`) so the send-confirmation form's checkboxes actually persist. None of the 12 existed locally before this ran — confirmed via `DESCRIBE confirmation_log` on 2026-09-21. | ✅ applied 2026-09-21 | `mysql -u <db_user> -p energyapp < api/migrations/041_add_confirmation_log_start_date_flags.sql` |
| `042_create_tenant_modules.sql` | Creates `tenant_modules` (rep_id, module_key, enabled) in the **master** DB (`ameripower_master`), not `energyapp` — entitlements for the ORBIC Sales/Operations/Portfolio/Audit product split. Part of `docs/ORBIC_PRODUCT_MODULARIZATION_SCOPE.md`. Fail-open: no rows for a rep_id = all modules enabled, so no existing tenant is affected until rows are inserted. | not run locally | `mysql -u <db_user> -p ameripower_master < api/migrations/042_create_tenant_modules.sql` |
| `043_add_addition_billing_link.sql` | Adds `linked_cust_id`, `billing_choice` to `confirmation_log` and `bill_to_id` to `enrollment_masterroll` — carries an Addition's linked-account choice from the send-confirmation form through masterroll staging to the final `contract_renewal.bill_to_id`. Build Plan #9. Confirmed via `SHOW COLUMNS` on 2026-09-22 that none of the 3 columns existed locally before this. | not run locally (blocked by sandbox from running ALTER directly — needs to be run by hand, same as live) | `mysql -u <db_user> -p energyapp < api/migrations/043_add_addition_billing_link.sql` |

## Applied to live — log

| Date | Migration | Notes |
|---|---|---|
| _(none logged yet)_ | | |

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
| 032 | create_ercot_dam_spp.sql | ✅ unverified |
| 033 | create_ercot_rtm_spp.sql | ✅ unverified |
| 034 | create_ercot_rtm_settlement_prices.sql | ✅ unverified |
| 035 | create_ercot_dam_settlement_prices.sql | ✅ unverified |
| 036 | create_ercot_dam_capacity_prices.sql | ✅ unverified |
| 037 | create_ercot_weather_tables.sql | ✅ unverified |
| 038 | redesign_ercot_weather_zone_temp.sql | ✅ unverified |
| 039 | create_email_reply_approval_queue.sql | ✅ unverified |
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
