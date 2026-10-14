# Portfolio Module: Rules and Audit Method

Keep this file updated. It is the single source of truth for both chats and for Claude Code. If a rule here conflicts with what the code does, the code is wrong until the owner says otherwise.

## 1. Hard rules (every Claude Code task)

- No production. Nothing is marked "Applied to live".
- Do NOT touch enrollment_engine.py, billing code or pricing code.
- Do NOT change the contract_renewal table, its data or its code.
- Do NOT change any forecast or open-position logic unless the task says so. Show the diff to the owner first.
- Mark every finding VERIFIED (ran it or read the exact code) or INFERRED (reasoned, not run).
- Test rows only with scoped ESIs (prefix such as ZZ...), deleted afterwards. Report the cleanup count.
- Never claim "it filters per date" from reading code alone. Prove it with a run and show the numbers.

## 2. Business rules (owner's words, confirmed)

| # | Rule | Status |
|---|------|--------|
| R1 | A meter's load drops the day AFTER its end date. The end date itself still counts (inclusive). | Confirmed. Fixed in get_forecast_data, boundary-tested. |
| R2 | A Future meter starts adding load ON its start date (inclusive). A missing start date means from the beginning of the window. | Confirmed. Fixed and tested. |
| R3 | Annual MWh is the 12-month figure regardless of the start or end month. Never prorated. | Confirmed. Code check found no proration (populate scripts not run). |
| R4 | Portfolio upload dates (start and end) accept only month/day/year (12/31/2027, 3/4/2027). ISO (2027-12-31) is rejected with a plain-language message. | Confirmed. Implemented. contract_renewal upload unchanged. |
| R5 | Future contracts that have not started are shown as a separate line and are excluded from Total customers, per-zone customers, usage, First Expiry, Portfolio Horizon and zone count. | Confirmed. Implemented. |
| R6 | Open position counts active rows whose end date is today or later. | To confirm with owner (currently not per day). |

Add new rules here as one sentence each, with an ID.

## 3. Audit method

For every number the module shows, do these steps in order:

1. Owner states the rule in one sentence (add it to section 2).
2. Claude Code finds the code that produces the number (file, function) and the pages that display it.
3. Claude Code builds small made-up meters (scoped test ESIs) whose correct answer can be calculated by hand. Always include boundary cases: day before, the day itself, day after.
4. Claude Code runs the real function and shows a table: expected vs actual, per day or per item.
5. Result is PASS or FAIL for each case. Failures are listed with the cause. No code is changed until the owner reviews the failures.
6. Cleanup the test rows and report the count left (must be 0).

Do the same test on the OLD version from git when a change is being reviewed, so the difference is visible.

## 4. Numbers to audit (checklist)

- [ ] Total customers
- [ ] Per-zone customers
- [ ] Usage (annual MWh, per zone and total)
- [ ] First Expiry and Portfolio Horizon
- [ ] Future contracts line and per-zone Future row
- [ ] Contract Mix (note: counts Future by type, so it includes Future meters that already started; future_customers counts only those starting after today)
- [ ] Open position
- [ ] Default (ERCOT Shape) forecast, per day
- [ ] DNA forecast (needs portfolio_load_annual, forecast_baseline_dna, forecast_growth_factors; empty on new tenants; nothing refreshes them automatically)
- [ ] Risk page scores (api/controllers/risk.py reads forecast totals for four horizons)
- [ ] Upload validation: dates, required fields, duplicates

## 5. Known open items

- 12-month forecast total dropped about 13 percent (523,812 to 456,841 MWh on u972964962_orbic) because meters that expire during the year now drop out. Owner to accept or review.
- Risk page score shift not measured.
- DNA forecast: decide whether Portfolio-only tenants get it. Until decided, it returns zeros on new tenants.
- Hydration error: needs page URL, expanded error text, private-window result.
- 10 unrelated test failures (test_module_gating.py, test_tenant_isolation.py), not investigated.
- Browser rendering of page changes not seen. Live VPS state not checkable from the dev machine.
