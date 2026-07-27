# Orbic Billing Engine — Technical Reference

**Status as of this document:** Core billing pipeline (EDI ingestion →
contract matching → charge mapping → addon charges → invoice generation) is
built and verified. Tax calculation (`_compute_tax()`), including SPD3, is
implemented and verified against real data — see §3.8. Enrollment-time
workflow (capturing county/exemption data for new customers) is **not yet
built** — see Open Items.

> **Verification note:** This document has been checked against the live
> codebase and database (schema, function locations, row counts, and query
> logic all confirmed by direct inspection) as of this revision. Where the
> original draft was uncertain or later found to be incomplete, this
> revision resolves it — see §3.8 and Open Item #4 in particular.

---

## 1. Purpose & Scope

Billing engine for a Texas Retail Electric Provider (REP) SaaS platform
(Orbic). Ingests EDI 867 (usage) and 810 (TDSP charges) files from ERCOT/
TDSPs, matches usage to customer contracts, computes supplier energy charges,
TDSP pass-through charges, REP addon charges, and Texas sales/utility taxes,
then generates customer invoices.

**Tech stack:** FastAPI (Python) backend, Next.js (Pages Router) frontend,
MySQL database. Deployment model: **one separate database + one separate app
instance per REP tenant** (not shared-database multi-tenancy) — confirmed via
`database.py` and `TenantMiddleware`. No `rep_id` column exists or is needed
on any table in this engine.

---

## 2. Core Data Flow

```
EDI 867/810 files
      │
      ▼
edi_files (raw file metadata, dedup by interchange_control)
      │
      ├──► edi_867_usage (usage records, dedup by document_tracking_number)
      │         │
      │         ▼
      │    Contract matching (contract_renewal, date-range based)
      │         │
      │         ▼
      │    billing_periods (one row per ESI per billing period)
      │         │
      │         ├── edi_810_line_items (TDSP charges, mapped via
      │         │     tdsp_charge_mappings)
      │         │
      │         ├── contract_addon_charges → addon_charge_types /
      │         │     addon_charge_type_rates (REP addon charges)
      │         │
      │         ▼
      │    billing_period_charges (itemized line items: energy segments,
      │         meter_fee, tdsp charges, addon charges, tax lines)
      │         │
      │         ▼
      └────►  invoices (generated on approval, tax computed via
               _compute_tax(), addon_total / tdsp_total / tax_total
               all aggregated here)
```

---

## 3. Database Schema

### 3.1 EDI ingestion

**`edi_files`** — one row per uploaded EDI file.
- Dedup key: `interchange_control` (UNIQUE) — the EDI H-row's file control
  number. Prevents re-processing the same file.
- `edi_type` ENUM('867_03', '810_02')
- `raw_content` LONGTEXT — full file stored verbatim for replay/audit
- For 867 files: **TDSP name comes from the file's "Utility Name" data
  field, NOT the filename** — 867 filenames route through ERCOT as an
  intermediary and say "ERCOT," not the real TDSP.

**`edi_867_usage`** — one row per ESI ID per billing period.
- Dedup key: `document_tracking_number` is **NOT unique per row** — one
  tracking number groups 2-4 rows per ESI (SU/PL row types × KHMON/K4MON
  meter types → kWh summary, kW demand summary, kWh detail, kW demand
  detail). All rows for one ESI+period stored faithfully; `raw_segments`
  JSON preserves everything verbatim. `usage_kwh` extracted from the
  SU+KHMON row; `kw_demand` from SU+K4MON/K1MON row. PL (detail) rows are
  informational only, stored in `raw_segments`, not used to populate
  usage/demand fields.
- `billing_period_id` nullable FK — **mutual FK with `billing_periods`**
  (see below), added via `use_alter=True` / separate `ALTER TABLE` to avoid
  circular-dependency failure at migration time.
- `status` ENUM('unmatched', 'matched', 'no_contract')

**`edi_810_line_items`** — one row per charge line item per ESI per TDSP
invoice.
- `document_tracking_number` groups 7-9 charge lines per ESI — **NOT
  unique per row** (unlike the file-level dedup on `edi_files`).
- `status` ENUM('unmapped', 'mapped', 'excluded') — `unmapped` charge codes
  are flagged for admin review via `tdsp_charge_mappings`, never guessed.

### 3.2 Charge code reference

**`ercot_charge_code_reference`** — 213 rows (row count confirmed against
the live database), the full official ERCOT market-standard 810_02 charge
code list (loaded from the Comptroller-adjacent SAC04 codes spreadsheet,
`810_02` sheet only — `810_03` is a different transaction flow, out of
scope, confirmed via ERCOT Protocols §19.3.1). Pure reference — does not
carry billing_category or tax logic.

**`tdsp_charge_mappings`** — curated, billing-active subset, 12 rows
confirmed live. Each row verified against real customer bills (exact-dollar
reconciliation, not assumed) before being added. Columns:
- `tdsp_duns` — **NULL** (not empty string) means "universal, applies to
  all TDSPs." MySQL treats NULL as distinct in UNIQUE constraints, so
  duplicate-universal-row prevention is enforced at the **application
  layer**, not the DB constraint. Confirmed: all 12 live rows have
  `tdsp_duns = NULL`.
- `is_taxable` — verified per code via real bill reconciliation. Snapshot
  onto `billing_period_charges` at charge-creation time (never re-joined
  live), so a later correction to this table can't retroactively change a
  bill that already went out.
- `is_per_unit` — nullable; NULL means "no real EDI UOM evidence yet,"
  not a guess. Does not affect any dollar calculation — display metadata
  only.
- **Currently loaded, all bill-verified:** TRN002, BAS001, BAS003, DIS001,
  MSC041, MSC042, MSC024, MSC025, MSC038, MSC039, ODL005, MSC043 (12 rows
  total, confirmed exact match against the live table; MSC043 taxable
  status confirmed by direct operator knowledge, not bill-reconciled).

### 3.3 Contract matching

**`contract_renewal`** (pre-existing table, NOT created by this project —
read/write carefully):
- `contract_start_date` DATE, `contract_end_date` **VARCHAR(100)** (not a
  DATE column — string-parsed via existing `_parse_date()` helper).
- `contract_rate` — stored **directly in $/kWh** (e.g. `0.0586`), confirmed
  via real data inspection. **No ×100/÷100 conversion, ever.**
- `other_charge` — stored as a formatted string like `'$10.00'` — `$` must
  be stripped (optionally present) before casting to DECIMAL.
- `premise_id` = ESI ID (join key: `edi_867_usage.esi_id =
  contract_renewal.premise_id`).
- `premise_county` — added by this project, VARCHAR(100) NULL. Populated
  for existing contracts via a one-time backfill against
  `tax_jurisdiction_rates` (see §3.5). **Not yet captured at new-customer
  enrollment** — see Open Items.
- Tax exemption columns (pre-existing): `city_tax_exempt`,
  `county_tax_exempt`, `mtacda_tax_exempt` (— confirmed doubling as the
  **transit** exemption flag, since MTACDA = transit + transit2 combined,
  no separate rate/exemption exists), `spdt_tax_exempt`,
  `spdt2_tax_exempt`, `state_tax_exempt` — all VARCHAR, **binary only**
  (`'0'` = not exempt, `'100'` = fully exempt, no partial values).
  `grt_tax_exempt` / `puc_tax_exempt` — TINYINT(1), different storage type,
  always `0` in current data.

**Matching logic:**
- Match: `edi_867_usage.esi_id = contract_renewal.premise_id`, with
  `contract_start_date <= service_start AND (contract_end_date IS NULL OR
  contract_end_date >= service_end)` — full date-range matching (not just
  "status=active"), since a customer can legitimately have multiple
  contracts over time (signed + default/rollover + future renewal +
  expired).
- **No contract found:** create `billing_periods` row anyway,
  `flags: ["no_contract"]`, `contract_rate = NULL`, don't block other ESIs.
- **Multiple overlapping active contracts** (should never happen under
  normal tariff rules — defensive check only): flag
  `multiple_active_contracts`, don't auto-select, don't set rate.
- **Contract expired before period end:** `flags: ["expired_contract"]`,
  snapshot the rate anyway (for reference), status stays `draft`. **This
  flag BLOCKS the Approve action** (enforced at the API level, not just
  frontend, confirmed via direct read of `PATCH .../periods/{id}/status`)
  — same for `contract_coverage_gap`.
- **Period spans two contracts (boundary case):** energy charge is
  **prorated** by day count across each contract segment (daily_rate =
  usage_kwh / billing_days; segment_kwh = daily_rate × segment_days), one
  `billing_period_charges` row per segment. `meter_fee` is **NOT
  prorated** — full flat amount from whichever contract has the **latest
  `contract_start_date`** among those covering the period (same rule as
  addon flat charges, below). `billing_periods.contract_rate` stays NULL
  in the multi-segment case (no single rate represents the period);
  `energy_charge` holds the summed total. `flags: ["multi_contract_period"]`
  is informational only, does **not** block Approve.
- **Period has a genuine coverage gap** (no contract covers some days in
  the middle): `flags: ["contract_coverage_gap"]` — blocks Approve, no
  guessing.

### 3.4 TDSP charge mapping / billing_period_charges

**`billing_periods`** — one row per ESI per billing period.
- `energy_charge` DECIMAL — summed supplier energy charge (single-segment
  or multi-segment prorated total).
- `has_810` — set to `1` once at least one 810 line is matched/mapped for
  this period. Created immediately with `has_810=0` on 867 ingestion —
  does **not** wait for the 810 to arrive.
- `flags` JSON — array of flag strings (see matching logic above).
- `status` ENUM('draft', 'reviewed', 'approved', 'invoiced').

**`billing_period_charges`** — itemized line items (energy segments,
meter_fee, TDSP charges, addon charges, tax lines all live here).
- `charge_source` — `'supplier'` (energy, meter_fee, addon), `'tdsp'`,
  `'tax'`.
- `charge_category` — e.g. `'addon'` (paired with `charge_source='supplier'`
  to distinguish addon rows from plain energy/meter_fee rows).
- `is_taxable` — **snapshotted** at row-creation time from
  `tdsp_charge_mappings.is_taxable` or `addon_charge_types.is_taxable` —
  never re-joined live. This is the mechanism that guarantees a bill, once
  generated, can never silently change if the source mapping is corrected
  later. Verified via direct test (changed a rate after billing, confirmed
  old bill unchanged).

**Retroactive linking (both directions, verified idempotent):**
- **810 arrives after 867** (normal order): inline in `ingest_810` —
  matches `esi_id + service_start + service_end` against existing
  `billing_periods`, creates `billing_period_charges`, sets `has_810=1`.
- **810 arrives before 867** (out-of-order — real production scenario):
  `_retroactive_810_link()`, called from `ingest_867` after each new
  `billing_period` insert — finds `edi_810_line_items` rows already
  `mapped` but with `billing_period_id IS NULL`, links them. Guarded by
  `billing_period_id IS NULL` filter, naturally idempotent.

### 3.5 Tax reference tables

**`tax_jurisdiction_rates`** — 2,994 rows (confirmed live), loaded from the
**official Comptroller `city-rates.xlsx`** (sheet `Jul26`, Q3 2026), NOT the
earlier flat `taxrates.txt` parse (which had a confirmed duplication bug —
see §6). Columns: `city_name`, `county_name` (composite key — **city name
alone is not unique**; ~100+ real Texas cities span multiple counties with
genuinely different combined rates, e.g. Fort Worth/Tarrant 8.25% vs.
Fort Worth/Parker 8.25% [corrected from an earlier bad value of 8.75%]),
`state_tax_rate`, `city_tax_rate`, `county_tax_rate`, `spdt_tax_rate` +
`spdt2_tax_rate` + `spd3_tax_rate` (multiple special-district slots),
`transit_tax_rate` + `transit2_tax_rate` (MTACDA = these two combined,
confirmed no separate rate exists), `total_tax_rate`, `effective_from` /
`effective_to`.
- **Vestigial columns (confirmed, not previously documented):**
  `mtacda_tax_rate`, `gros_tax_rate`, `pugra_tax_rate` exist on this table
  but are 100% NULL across all 2,994 rows and are not read by any code path.
  Not load-bearing — noted here so a future reader doesn't assume they hold
  real data.
- **SPD3 (`spd3_tax_rate`):** populated (non-NULL) for all 2,994 rows, with
  **7 rows carrying a genuine nonzero rate**. `_compute_tax()` now computes
  and inserts a `SPD3_TAX` line whenever this rate is nonzero, following the
  same pattern as `SPDT_TAX`/`SPDT2_TAX` — see §3.8 for the exemption caveat
  (`contract_renewal` has no `spd3_tax_exempt` column).
- **Known gap:** ~49 (city, county) pairs have multiple SPD-variant rows;
  most share an identical `total_tax_rate` (harmless, auto-resolve to
  lowest id), but 4 pairs (Dickinson/Galveston, Houston/Harris, Nassau
  Bay/Harris, Pearland/Harris) have genuinely different rates depending on
  the specific sub-district — treated as unresolved, same as missing
  county.
- **Known gap:** 56 rows from the old (buggy) table have no equivalent row
  in this official file at all (mostly rural/unincorporated edge cases,
  12 counties + a few coded jurisdictions) — documented, not fabricated a
  fallback for, since real customer impact was checked and found minimal.

**`gros_tax_rates`** (MGRT — Municipal Gross Receipts Tax) — 1,223 rows
(confirmed live), keyed by `city_name` only (**not** city+county — MGRT is
assessed on the incorporated municipality as a whole, confirmed distinct
from sales tax jurisdiction logic). Verified independently against Texas
Tax Code §182.022's population-tier formula (≤1,000: 0%; 1,000-2,499:
0.581%; 2,500-9,999: 1.070%; 10,000+: 1.997%) — every sample row matched
exactly. Confirmed no duplicate city names in the source data (safe key).
- **`city_name` carries a trailing Census-style suffix** ("Dallas city,"
  "Howe town," "Alma village") not present in `contract_renewal.
  premise_city` ("DALLAS," "HOWE"). See §3.8 for the matching fix.
- **All 1,223 rows have `effective_from = NULL`**, meaning "always active."
  See §3.8 for the NULL-safe date-filter fix this required.

**`puca_tax_rates`** — 1 row (confirmed live), flat statewide rate
`0.001667` (1/6 of 1%), verified against the primary source: **Texas
Utilities Code §16.001(b)**. No jurisdiction key needed — applies
uniformly. Also uses `effective_from = NULL` to mean "always active"
(same convention as `gros_tax_rates`).

**Address-level geocode data (GISSS files)** — identified but **not yet
integrated**. The Texas Comptroller provides a bulk-downloadable,
address-range-to-jurisdiction-code dataset via a public API
(`api.comptroller.texas.gov`, endpoints `/sift/v1/sift/public/list-files`
and `/get-link`, requires a free-registration API key). This is the
long-term fix for city-name ambiguity (resolves at the street-address
level using the same TAID code system already in `tax_jurisdiction_rates`).
**Not built yet** — see Open Items. (Confirmed: the only related grep hit
in the codebase is a coincidental URL string in a legacy EDI note field —
no real integration code exists.)

### 3.6 Addon charges (REP-side supplier charges, e.g. TCRF, ANCSVC, LINELOSS)

Distinct from TDSP pass-through charges — these are REP-calculated
supplemental charges (some products, e.g. non-bundled/passthrough rate
plans, need them; bundled all-inclusive rate plans don't use them at all —
`product_type`/bundled-vs-unbundled classification is a **planned future
column on `contract_renewal`, not yet built**).

**`addon_charge_types`** — admin-only catalog (`require_admin` gated).
`code` is **immutable after creation** — `PUT` endpoint strips any `code`
field from the request body server-side, verified via a direct bypass
test (sent a different code via raw API call, confirmed DB value
unchanged). `calculation_basis` ENUM('flat', 'usage_based'). `is_taxable`.

**`addon_charge_type_rates`** — effective-dated rate history per type
(`effective_from`/`effective_to`, close-out-then-insert pattern when a new
rate is added). All rate changes logged to the existing `user_log` table
(`flag='addon_rates'`), reusing the platform's existing audit mechanism —
confirmed via direct read of `api/routers/admin_addon_types.py`.

**`contract_addon_charges`** — join table, contract → addon type
(many-to-many). Gated by the **same permission as general contract
editing** (`require_auth`, not admin-only) — confirmed this matches the
existing contract PUT endpoint's gate exactly (no ownership/rep-scoping
exists on either, a pre-existing platform characteristic, not introduced
by this feature).

**Calculation rules** (confirmed line-by-line against
`_insert_addon_charges()` / `_calendar_month_segments()` in
`controllers/billing_engine.py`):
- **Usage-based addons:** prorated by **calendar month** (not by contract
  boundary) — real addon rates are calendar-month-aligned, but billing
  periods are meter-read-based and routinely straddle two calendar
  months. `daily_volume = usage_kwh / billing_days`; each calendar-month
  segment gets `daily_volume × days_in_that_month × that_month's_rate`;
  one `billing_period_charges` row per calendar-month segment (mirrors
  bill precedent: real TCRF/ANCSVC line items show per-month rates
  separately).
- **Flat-basis addons:** **NO proration, ever** — one charge per bill,
  full amount, regardless of how many calendar months or contracts the
  period spans. If the period spans two contracts with different flat
  addons attached, use whichever addon is on the **latest-starting**
  contract (same rule as `meter_fee`). If a flat addon's own rate changed
  mid-period, use the rate from the latest-starting `addon_charge_type_rates`
  row.
- Hand-verified test cases exist for both proration types (see build
  history) — usage-based: $4.14 total across a March/April split,
  matched hand-calc exactly. Flat: two-contract scenario, engine correctly
  picked the newer contract's $7.00 addon over the older $5.00, discarding
  the old one entirely, not blending.

### 3.7 Invoices

**`invoices`** — generated when a `billing_periods.status` transitions
to `approved` — an explicit **separate action** calls `generate_invoice()`
(two-step: approve, then invoice — not automatic on approval). Guard:
rejects generation on a non-`approved` period; rejects duplicate
generation for an already-invoiced period.
- `invoice_number` format: `B` + `YYMMDD` + 4-digit daily sequence (e.g.
  `B2607050001`), same COUNT-based pattern as `customer_id` in enrollment.
- Columns: `supplier_charge` (= `energy_charge` read directly from
  `billing_periods`, **not** recomputed from `usage_kwh × contract_rate` —
  this was a real bug found and fixed when multi-segment periods were
  introduced), `tdsp_total` (summed from `billing_period_charges` where
  `charge_source='tdsp'`), `addon_total` (added later — summed from
  `charge_source='supplier' AND charge_category='addon'`; **originally
  missing from the total entirely**, a real bug caught before it shipped —
  addon amounts were being stored correctly but never reaching the
  customer's bill total), `tax_total` (from `_compute_tax()`).
- `total_amount = supplier_charge + tdsp_total + addon_total + tax_total`.

**Approval gate (enforced at API level, not just frontend):**
`PATCH .../periods/{id}/status` rejects the `reviewed → approved`
transition with a 409 if `flags` contains `expired_contract` or
`contract_coverage_gap`. Confirmed via direct read of
`api/routers/billing_engine.py` lines 356-409: `transitions = {"draft":
"reviewed", "reviewed": "approved"}`, blocks specifically on those two
flags (parsed via `json.loads`), does not block on
`multi_contract_period` or `multiple_active_contracts`.

### 3.8 Tax calculation — `_compute_tax()`

Located in `api/controllers/invoice_engine.py`.  Replaces an earlier
placeholder that read from an unrelated legacy `tax_rates` table and
always returned near-zero.

**Two different tax bases, by design:**
- **§151 sales tax components** (state, city, county, spdt, spdt2,
  transit/MTACDA): base = `taxable_subtotal + supplier_charge +
  taxable_addon` (`tax_base`, passed into `_compute_tax()` unchanged from
  before).
- **MGRT and PUCA** (utility gross-receipts assessments, not sales tax):
  base = `total_billed` = `supplier_charge + tdsp_total + addon_total`
  (the whole bill, sales-tax lines excluded) — computed **inside**
  `_compute_tax()` itself via internal queries against
  `billing_period_charges`, not passed in from the call site, to keep the
  scope boundary clean. The only call-site change required was adding
  `bp_id` as a parameter so `_compute_tax()` can run those internal
  queries and insert its own line items.

**Jurisdiction resolution:** looks up `tax_jurisdiction_rates` by
`UPPER(TRIM(city_name)) = UPPER(TRIM(premise_city))` +
`UPPER(TRIM(county_name)) = UPPER(TRIM(premise_county))`, date-filtered
by `effective_from`/`effective_to` using **`svc_end` as the anchor date**
(latest applicable quarter's rate applies to the whole period — a
confirmed convention, not empirically provable either way). If
`premise_county` is NULL, or the SPD-ambiguity case produces multiple
different rates: **skip the §151 components entirely**, set
`flags: ["tax_jurisdiction_unresolved"]` on the `billing_periods` row
(reusing the previously-unused `flags` column), but **MGRT and PUCA are
still computed independently** (they don't depend on county resolution).

**Exemptions:** binary check per tax type (`'100'` = skip that line
entirely, don't insert a `$0.00` row — verified: a real non-trivial
exempted amount, $1.00 in the test case, was confirmed absent from
output entirely, not present as zero).

**Line items:** one `billing_period_charges` row per applicable tax type
(`charge_source='tax'`, codes: `STATE_TAX`, `CITY_TAX`, `COUNTY_TAX`,
`SPDT_TAX`, `SPDT2_TAX`, `SPD3_TAX`, `TRANSIT_TAX` [transit+transit2
combined], `MGRT`, `PUCA`).

**SPD3 handling.** `tax_jurisdiction_rates.spd3_tax_rate` is populated for
all 2,994 rows, with 7 rows carrying a genuine nonzero rate. `_compute_tax()`
computes `SPD3_TAX` the same way as `SPDT_TAX`/`SPDT2_TAX` — same `tax_base`,
same jurisdiction row, skipped automatically when the rate is zero/NULL (via
the shared `_insert_tax_line` zero/None guard). One difference: **`contract_
renewal` has no `spd3_tax_exempt` column** (confirmed via `DESCRIBE`), so
there is no dedicated exemption flag to check. Rather than assume
`spdt_tax_exempt` or `spdt2_tax_exempt` also covers SPD3 — which would be
guessing, the exact thing this engine is built to avoid — `_compute_tax()`
always applies the full SPD3 rate when present, and appends a
`spd3_exemption_unknown` flag to `billing_periods.flags` whenever it does, so
a real SPD3 charge is always visible for manual exemption review rather than
either being silently skipped or silently mis-attributed to an unrelated
exemption flag.

**Bug history (found and fixed during verification — kept here as a
cautionary note):**
- **MGRT city-name suffix mismatch.** `gros_tax_rates.city_name` carries a
  trailing Census-style suffix ("Dallas city," "Howe town," "Alma
  village") that `contract_renewal.premise_city` does not ("DALLAS,"
  "HOWE"). The original exact-match query never matched any real
  contract, silently producing zero MGRT for every city, every time. Fixed
  by stripping the suffix via nested `TRIM(TRAILING 'VILLAGE' FROM
  TRIM(TRAILING 'TOWN' FROM TRIM(TRAILING 'CITY' FROM UPPER(TRIM(city_name)))))`
  before comparison — verified correct on the tricky case where a real
  city name itself ends in "City" (e.g. "League City" + suffix "city" →
  "League City city" strips to "League City," not "League," since
  `TRIM(TRAILING literal FROM ...)` removes one exact trailing substring
  occurrence, not a character class).
- **NULL-unsafe `effective_from` filter (MGRT and PUCA both).** Both
  `gros_tax_rates` and `puca_tax_rates` use `effective_from = NULL` to
  mean "always active" — confirmed, all 1,223 `gros_tax_rates` rows have
  NULL there. The original filter, `effective_from <= :svc_end`, evaluates
  to NULL/false in SQL when `effective_from` is NULL, so it silently
  excluded every row — MGRT was being zeroed out on every real invoice
  until this was caught by a synthetic verification test built
  specifically to force MGRT to execute end-to-end. Fixed to
  `(effective_from IS NULL OR effective_from <= :svc_end)`, matching the
  pattern the PUCA query already used correctly (PUCA was not actually
  affected in practice, since it has only 1 row and that row also has
  `effective_from = NULL`, but the same unsafe pattern was present in the
  query and is fixed for both).
- Both bugs were found by attempting to construct a real, executing MGRT
  test case (not by code review alone) and were confirmed via direct
  database evidence before the fix was made. Neither bug was reachable by
  the initial 3 hand-verified test cases, since those exercised §151
  logic only — a reminder that "verified" claims should specify exactly
  which code paths were exercised.

**Verified** (transaction-rolled-back synthetic tests against real
contract/rate data, hand-checked arithmetic, confirmed nothing committed
via post-rollback row counts):
1. Unambiguous jurisdiction — full §151 calculation, all applicable lines
   present with correct amounts.
2. Same-rate-ambiguous jurisdiction — multiple SPD-variant rows sharing an
   identical `total_tax_rate` still auto-resolve correctly, no spurious
   `tax_jurisdiction_unresolved` flag.
3. Exempt tax type — confirmed the exempted line is skipped entirely
   (absent from output), not inserted as `$0.00`.
4. MGRT end-to-end, against a real contract with a real `gros_tax_rates`
   match (post-fix) — confirmed via a deliberate `total_billed`/`tax_base`
   divergence (a synthetic non-taxable TDSP charge added to `total_billed`
   only) that MGRT's amount tracks `total_billed`, not `tax_base`, and
   that the §151 lines are unaffected by the divergence.
5. SPD3, against a real jurisdiction row with a genuine nonzero
   `spd3_tax_rate` (Baytown/Chambers, id=149, rate=0.00125) — confirmed the
   `SPD3_TAX` line amount matches hand-calc exactly, `spd3_exemption_unknown`
   is correctly appended to `billing_periods.flags`, jurisdiction still
   resolves cleanly (no spurious `tax_jurisdiction_unresolved`), and
   STATE/CITY/SPDT/SPDT2/MGRT/PUCA on the same real contract are all
   simultaneously correct — including a re-confirmation, on different real
   data than test 4, that MGRT and PUCA still work post-fix.

**Status: tax calculation, including SPD3, is verified and done for every
code path listed above.**

---

## 4. Frontend Pages

Namespace: **`/billing/...`** (the pre-existing Excel-based legacy billing
extract module was renamed to **`/billing-audit/...`** to free up the
namespace — old module's backend endpoints/logic untouched, only its
frontend routes/nav moved).

1. **`/billing/upload`** — 867/810 upload forms + bulk historical
   multi-file upload (client-side loop over the single-file endpoints,
   per-file status) + upload history log panel
   (`GET /api/billing-engine/files`).
2. **`/billing/review`** — 3 tabs: Unmatched ESI IDs (`edi_867_usage`
   where `status='no_contract'`), Unknown Charge Codes (`edi_810_line_items`
   where `status='unmapped'`), Ready to Bill (`billing_periods` where
   `status IN ('draft','reviewed') AND has_810=1 AND contract_rate IS NOT
   NULL AND` no `expired_contract` flag — confirmed via direct read of
   `GET /review/ready-to-bill`: `reviewed` periods included, no
   `usage_kwh` floor since zero-usage periods are still billable).
3. **`/billing/periods`** — list, filter by status/ESI, pagination.
4. **`/billing/periods/{id}`** — detail, charge line items, Approve
   button (blocked + red panel if `expired_contract`/`contract_coverage_gap`
   flag present).
5. **`/billing/charge-mappings`** — admin CRUD for `tdsp_charge_mappings`;
   DELETE blocked with 409 if `edi_810_line_items` reference the mapping;
   `is_per_unit` uses a 3-state control (Yes/No/Unknown) so NULL never
   gets silently coerced to a boolean on edit.
6. **`/billing/invoices`** — list, filter, pagination.

`/admin/addon-charge-types` — separate admin-only page (first page under
a new `/admin/` namespace — none existed before this project).

---

## 5. Open Items (not yet built)

1. **Enrollment-time workflow** — nothing currently captures
   `premise_county` or sets `*_tax_exempt` flags when a NEW customer
   enrolls. The county-population work done so far is a one-time backfill
   of existing contract rows only.
2. **Bundled vs. non-bundled product classification** — discussed,
   planned as a new column on `contract_renewal`, not yet built. Until it
   exists, all billing assumes the non-bundled/passthrough model (TDSP
   charges itemized separately) — matches every real bill reconciled so
   far, but bundled (all-inclusive, EDI-ignoring) products aren't
   supported yet.
3. **Address-level geocode integration (GISSS files)** — identified as
   the long-term fix for city-name jurisdiction ambiguity, requires an
   API key registration (business details, not yet completed), not yet
   loaded or wired in.
4. ~~SPD3 tax not computed~~ — **Resolved.** `_compute_tax()` now computes
   `SPD3_TAX` following the same pattern as `SPDT_TAX`/`SPDT2_TAX`, verified
   against a real jurisdiction with a nonzero `spd3_tax_rate` (see §3.8,
   verified item 5). Since `contract_renewal` has no `spd3_tax_exempt`
   column, the full rate is always applied when present, and a
   `spd3_exemption_unknown` flag is appended to `billing_periods.flags` so
   exemption status can be reviewed manually rather than assumed. If a
   dedicated `spd3_tax_exempt` column is ever added to `contract_renewal`,
   `_compute_tax()` should be updated to check it and this flag can be
   retired.
5. **Tax filing/reconciliation** — month-end filing and payment
   reconciliation with the state (mentioned as a real, separate need) is
   completely out of scope of everything built so far, which only covers
   computing tax on a customer's bill, not the REP's own remittance
   process.
6. **Manual review queue for flagged periods** — `expired_contract`,
   `contract_coverage_gap`, `multiple_active_contracts`,
   `tax_jurisdiction_unresolved` flags all exist and correctly block/mark
   periods, but there's no dedicated UI to work through this queue
   (partially covered by the existing `/billing/review` unmatched-ESI tab,
   but not a complete flagged-period review workflow).

---

## 6. Key Lessons From This Build (worth remembering)

- **Every rate/tax-code claim was verified against real, sourced data**
  before being trusted — this caught real errors more than once: an
  ungrounded third-party document got a TDSP charge code's category wrong;
  our own first-pass parser of the flat Comptroller file introduced a
  duplicate-row bug that silently overcharged Fort Worth customers in two
  counties by 0.5%; a spelling-variant bug (`DESOTO` vs `De Soto`) caused
  false "not found" results.
- **Snapshot, never live-join, for anything that affects a historical
  bill's dollar amount** (`contract_rate`, `is_taxable`, addon rates) —
  applied consistently, verified with direct before/after tests.
- **Flag and block, don't guess**, for every genuine ambiguity
  (multi-contract, multi-county, missing data) — no rate or county was
  ever silently picked when the data didn't clearly support one answer.
- **"Verified" needs to say which code paths it covers.** The initial
  round of hand-verified `_compute_tax()` tests (3 cases) exercised the
  §151 sales-tax path only and looked complete, but MGRT had two real bugs
  (see §3.8) that were invisible to those tests because MGRT is a
  separate, independent code path. Both were only found by deliberately
  constructing a test that forced MGRT to execute end-to-end. The SPD3 gap
  (§3.8, former Open Item #4, since resolved) was found the same way — by
  checking what the data actually contains, not by re-reading the code that
  was already written. Treat "verified" as scoped to what was actually
  exercised, not as a blanket claim.
