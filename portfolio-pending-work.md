# Portfolio - pending work

Date: 2026-10-07
Scope: Portfolio only. The migration list below is the authoritative one in `docs/DB_MIGRATIONS.md` (Pending table); the rest comes from this session's work.

## Uncommitted code (nothing is committed yet)

- Portfolio summary and zone numbers: Future contracts not counted as customers, new `future_customers` field.
- `/portfolio` page: "Future contracts (not yet started): N" line and zone-card row.
- Upload: start date and end date accept m/d/Y only (ISO rejected); structured errors; duplicate-ESI rejection; set-based writes; per-tenant lock.
- Forecast (`get_forecast_data`): per-day start/end handling (awaiting owner review, see `open-decisions.md`).
- New tests: `api/tests/test_portfolio_future_and_forecast.py`, `test_portfolio_upload_validation.py`, `test_contract_renewal_upload.py`.
- Docs: `docs/PORTFOLIO_CONTRACTS.md`, `docs/DB_MIGRATIONS.md`, `docs/PILOT_READINESS_PENDING.md`.

## Migrations not yet confirmed applied to live

Rows 051-055 are in the Pending table of `docs/DB_MIGRATIONS.md`. They are run by hand over SSH and moved to "Applied to live" only when the owner confirms.

| Migration | What |
|---|---|
| 051 | `portfolio_view` full contract types, Future status |
| 052 | Trigger sync normalization |
| 053 | `contract_renewal` unsynced view |
| 054 | Load profiles master entries (21) |
| 055 | Load profiles master entries (4) |

Also: `tenant_test_pilot_co` and `tenant_test_rep` do not have migration 048 yet, so 051 was not applied there.

## Waiting on the owner

- Accept or review the 12-month forecast change (about 13% lower total).
- Run the Risk page and review the shift (not run yet).
- DNA forecast for Portfolio-only tenants: recommendation is not to populate, and to show "not available" instead of zeros.
- Hydration error: needs the page URL, the expanded error text and the private-window result.

## Not yet done

- Browser check of `/portfolio` and the upload page (nothing rendered so far). Steps: open `/portfolio` on a tenant with Future contracts starting later; confirm the Future line, Total Customers and zone rows; confirm nothing shows when there are none.
- DNA forecast tables (`portfolio_load_annual`, `forecast_baseline_dna`, `forecast_growth_factors`) are refreshed only by hand-run scripts; nothing is scheduled.
- Confirm on the VPS whether the `portfolio-contracts-reconcile` pm2 job (2:15 AM CT) is actually running; this cannot be checked from the repo.
- Annual MWh no-proration check was done by reading only; the populate scripts were not run to confirm numbers.
- Unrelated failing tests (10 in `test_module_gating.py` and `test_tenant_isolation.py`) not investigated.
- Expired meters keep today+15 in `customer_forecast_dates` (existing behaviour); owner has not been asked whether that is wanted.
