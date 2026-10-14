# Open decisions

Date: 2026-10-07

## 1. 12-month forecast total is about 13% lower

The 12-month forecast total drops from 523,812 MWh to 456,841 MWh (about 13% lower) because meters that expire during the year now drop out.

**Decision:** accept this as the intended behaviour, or review it first?
The code is uncommitted, so nothing needs reverting yet.

## 2. Risk page may shift

`api/controllers/risk.py` reads the forecast totals for its four horizons, so scores may shift.
Nobody has run it, so the size of the shift is unknown.

**Decision:** run it and review the shift before keeping the forecast change?

## 3. DNA forecast for Portfolio-only tenants

Nothing refreshes the three DNA forecast tables automatically.

**Decision:** do Portfolio-only tenants get the DNA forecast?
Recommendation: do not populate the tables yet, and show "not available" instead of zeros.

## 4. Hydration error

Still needs three things from you:

- the page URL
- the expanded error text
- the private-window result

## 5. Unrelated test failures

10 tests in `test_module_gating.py` and `test_tenant_isolation.py` fail and were not re-run.

**Decision:** investigate them, or leave them for now?
