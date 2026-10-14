# Claude Code report - Portfolio forecast review (parts 1-6)

Date of work: 2026-10-06. Report file written 2026-10-07.
Scope: Portfolio code only. No production. Read-only on `u972964962_orbic`.
Nothing marked "Applied to live". No migrations added. Not touched: enrollment_engine.py, billing, pricing, contract_renewal table/data/code.
Only part 3 changed code. All code is uncommitted.

Tests: `test_portfolio_future_and_forecast.py`, `test_portfolio_upload_validation.py`, `test_contract_renewal_upload.py` -> 109 passed (VERIFIED).
Housekeeping: local MariaDB was down again after the session restart; I restarted XAMPP mysqld. It is still running.

## 1. The forecast change

- Full diff saved at `scratchpad/portfolio.diff` (225 lines, VERIFIED via `git diff HEAD`). It also contains the earlier summary/zone-card changes. The forecast part is `get_forecast_data` plus two new helpers.
- New in this change: `_as_date`, `_zone_annual_mwh_by_day`.
- Already existed, edited: `get_forecast_data`.
- Removed: `weatherzone_annual_mwh`, a variable nothing read.

**Before:** the forecast looked at the contracts once, on the first day of the window, and used that same annual volume for every day. A meter ending on day 3 kept producing load to the end of the window. A Future meter starting on day 4 produced nothing.

**Now:** each day has its own list of live meters. A meter counts from its start date through its end date, both inclusive. No start date means counted from the first day of the window.

**Response fields whose value changed**

| Field | Change |
|---|---|
| `rows` (hourly/daily load, net position, shares) | Changes whenever a start or end date falls inside the window. Identical for a 1-day window. |
| `zone_annual_mwh` | Now the first-day value (debug/display). |
| `active_contracts` | Now counts meters live on any day of the window (debug/display). |

**Who reads them (VERIFIED by grep)**

- No page reads `zone_annual_mwh` or `active_contracts`.
- `app/pages/portfolio/position.tsx` reads `rows` and `hours`.
- `api/controllers/risk.py` takes the "Load (Forecast)" and "Net Supply" totals for its four horizons, so long-horizon risk scores can shift.
- `checkpoint_runner.py` only mirrors the logic in a comment.

## 2. Speed (read-only on u972964962_orbic)

Data: 11,893 + 125 forecast rows, 10,727 portfolio contracts. Three runs each.

| Window | Old | New | Queries |
|---|---|---|---|
| 7 days from today | 0.20-0.31 s | 0.21-0.23 s | 6 and 6 |
| 12 months | 2.5-2.6 s | 1.6-2.5 s | 6 and 6 |

The new version is not slower and stays under 5 seconds. "Default window" means 7 days from today; I did not look up what the page sends.

For 12 months the load total drops from 523,812 MWh (old) to 456,841 MWh (new), about 13%, because meters that expire during the year now drop out. This is the intended behaviour change, and the owner should review the number.

## 3. End date format (the only change)

- `api/routers/admin_portfolio_contracts.py` now passes `date_formats=DATE_FORMATS_MDY` to the shared validator.
- The Portfolio upload accepts end dates only as m/d/Y (12/31/2027, 3/4/2027). ISO (2027-12-31) is rejected with the existing plain-language message ("must be a real date written as month/day/year, for example 12/31/2027").
- Tests added in `test_portfolio_future_and_forecast.py`:
  - Rejected: 2027-12-31, 2027-13-45, 13/45/2027, 1/2/27, "next year".
  - Accepted: 12/31/2027, 3/4/2027.
  - The shared validator's default still accepts ISO, so other callers are unchanged.
- contract_renewal: unchanged by this task. Its own test `end_date_iso` still passes (that upload already rejected ISO end dates).
- Sample CSV and upload page help text already said MM/DD/YYYY; no ISO dates found there.

## 4. Annual MWh check (read-only)

No proration found anywhere (VERIFIED by reading):

- `populate_portfolio_load_annual.py` and `checkpoint_runner.py` sum the full `annual_kwh` per zone with a date-overlap filter.
- `populate_customer_forecast_dates.py` copies the usage figure straight in.
- A grep for `/365`, `prorat`, `DATEDIFF` and similar across controllers, populate scripts, monitoring and utils found nothing.

A meter ending on Jan 2 still adds its full 12-month figure to that year. That matches the owner's rule but is overlap-based. I did not run the populate scripts to confirm their numbers.

## 5. DNA forecast freshness (read-only)

Nothing refreshes these tables automatically (VERIFIED: no match in any pm2 config, router or trigger). They are filled only when someone runs a script by hand:

| Table | Script |
|---|---|
| `portfolio_load_annual` | `populate_portfolio_load_annual.py` |
| `forecast_baseline_dna` | `build_layer1_dna.py` |
| `forecast_growth_factors` | `build_layer2_growth.py` |

`docs/ORBIC_PRODUCT_MODULARIZATION_SCOPE.md` says the build scripts are "not scheduled", which matches. An upload, a manual edit or a trigger sync (migration 052) leaves all three stale. Nothing was populated or scheduled.

## 6. Per-day proof

Three meters, same profile and volume (1,000,000 kWh/yr). A = Fix ending 2027-01-04, B = Future starting 2027-01-04, C = Fix ending in 2 years. One call for the whole 7-day window (what the Forecast tab does). Values are MWh per day.

| Day (Jan 2027) | 01 | 02 | 03 | 04 | 05 | 06 | 07 |
|---|---|---|---|---|---|---|---|
| NEW A | 1.938 | 2.231 | 2.334 | 2.107 | 0.0 | 0.0 | 0.0 |
| NEW B | 0.0 | 0.0 | 0.0 | 2.106 | 1.928 | 1.907 | 2.031 |
| NEW C | 1.939 | 2.231 | 2.333 | 2.107 | 1.928 | 1.907 | 2.031 |
| NEW total | 3.877 | 4.462 | 4.667 | 6.32 | 3.856 | 3.814 | 4.062 |
| OLD A | 1.938 | 2.231 | 2.334 | 2.106 | 1.929 | 1.907 | 2.031 |
| OLD B | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| OLD C | 1.939 | 2.231 | 2.334 | 2.107 | 1.928 | 1.907 | 2.03 |
| OLD total | 3.877 | 4.462 | 4.668 | 4.213 | 3.857 | 3.814 | 4.061 |

Old: A keeps loading after its end date and B never loads. New: the window result matches the per-day reference exactly.
Open position (COAST) is the same in both runs (3,779 meters); it reads `portfolio_view`, not these tables.

Cleanup: ZZFC test rows on `tenant_sync_verify_co` deleted by prefix; recount shows 0 in each of the three tables. The test uploads only added rows, so nothing needed restoring. Backup from earlier: `C:\Users\Amit\db_backups\tenant_sync_verify_co_pre_forecast_tests_20261006.sql`.

## Docs updated

`docs/PORTFOLIO_CONTRACTS.md`: both-dates m/d/Y rule, no-proration evidence, and the DNA tables not being refreshed automatically (0 non-ASCII bytes).

## Could not verify

- Browser rendering: no page change was seen.
- Anything about live (VPS schedule, live tables).
- Risk page: not run, so the size of score shifts is unknown.
- The 10 unrelated failures in `test_module_gating.py` and `test_tenant_isolation.py` were not re-run or investigated.

## Decision for the owner

The new 12-month forecast total is about 13% lower than the old one. Accept per-day expiry as the new behaviour, or review the Risk page scores first? Nothing is committed, so nothing needs reverting yet.
