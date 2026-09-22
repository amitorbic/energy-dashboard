# Enrollment Engine — Business Rules

## Overview
This document captures the business rules for ORBIC's 
enrollment engine. These rules govern how different 
contract types are processed, validated, and submitted 
to ERCOT.

---

## Contract Types and ERCOT Routing

### New Enrollment
- Brand new customer to ORBIC
- ESI ID not previously active with ORBIC
- Goes to ERCOT (814 transaction required)
- Guard: blocked if ESI ID has status active/pending/going_final

### Renewal
- Same customer, extending term
- ESI ID already active with ORBIC
- Does NOT go to ERCOT
- Validation: start date of new contract must align 
  with current contract end date (within 30 days, 
  same month, or 2-3 days difference)
- If dates don't align: contract must be corrected 
  before proceeding
- Creates new contract_renewal row (never updates existing)

### Assignment
- Change of ownership/customer at the meter location
- Broker may or may not change as part of assignment
- There is no "broker change only" contract type
- If MVI/Switch involved: goes to ERCOT (814 required, 
  ERCOT needs to know customer name changed)
- If plain assignment (no MVI/Switch): internal process, 
  confirmation sent, then switch/MVI submitted to ERCOT
- Rate: usually same rate continued
- If rate changes on assignment: treated as completely 
  new customer, old customer gets ETF
- Commission/Mills: go to broker on record for current 
  contract. If broker changes on assignment, new broker 
  comes into picture only after current contract ends
- Creates new contract_renewal row

### B&E (Blend and Extend)
- Same customer blending current rate into new longer term
- Does NOT go to ERCOT
- Applied as new renewal row with given rate, term, 
  commission, mills
- Creates new contract_renewal row

### Addition
- New ESI ID (new location) added to existing customer account
- ESI ID is brand new — may or may not be active with ORBIC
- If not active with ORBIC: goes to ERCOT (814 required)
- If already active with ORBIC: flagged/blocked, 
  must be handled separately
- Creates new contract_renewal row

### Multi-Start
- One contract covering multiple ESI IDs with different 
  start dates
- Some ESI IDs: ASAP start
- Some ESI IDs: future start date
- Handling:
  * ASAP start → current enrollment batch, process now
  * Future start > 30 days → held in future table, 
    processed later
  * Future start < 30 days → submit based on current 
    start date
  * Meter read start → picks next TDSP meter read date 
    from TDSP meter read calendar

---

## Start Date Types

### ASAP
- Process immediately in current batch
- Switch placed as soon as ERCOT allows (3 business days minimum)

### Specific Date (Self Selected Switch)
- Customer or broker has requested a specific switch date
- Must be at least 3 business days from submission
- Must fall on a business day (Mon-Fri)
- Enforced in enrollment_engine.py: `/pending` surfaces a
  `date_warning` on any record that fails this; `/generate-masterroll`
  hard-skips it (excluded from both the MassRoll file and
  enrollment_masterroll, record stays in the pending queue)

### Meter Read Date
- Picks the next available meter read date from TDSP calendar
- Must coordinate with TDSP for the ESI ID's meter read cycle

### Future Date (> 30 days)
- Held in a future table
- Not included in current MassRoll batch
- Processed when date falls within 30-day window

### Future Date (< 30 days)
- Submitted based on current start date
- Included in current MassRoll batch

### Priority Move-In
- Done by end of day
- Extra charge applies
- Uses Priority Codes in MassRoll

---

## Active Contract Guard Rules

### Hard Block (cannot proceed):
- type_of_contract = New → ESI active/pending/going_final → BLOCK
- type_of_contract = Addition → ESI active/pending/going_final → BLOCK

### Validate and Warn (can proceed with correction):
- type_of_contract = Renewal → ESI active → validate dates
  * Start date within 30 days of current end date → WARN, allow
  * Start date not aligned → BLOCK, request correction
- type_of_contract = B&E → same as Renewal date validation

### Allow (internal process):
- type_of_contract = Assignment → ESI active → ALLOW
  * Determine if MVI/Switch needed based on ownership change
  * Goes through internal batch, not MassRoll

---

## going_final Status
- ESI ID has a switch placed in ERCOT for a future date
- Cannot submit another enrollment until current 
  going_final resolves
- Treated same as active for guard purposes

---

## Key Rules
- Every contract type ALWAYS creates a new row in 
  contract_renewal — never updates existing rows
- contract_renewal is the single source of truth 
  for all enrollment statuses
- Broker on record receives commission for current 
  active contract regardless of any changes
- Rate and date alignment are critical — 
  renewal date must match current contract end date
- Multi-start contracts split by start date type 
  at enrollment engine level

---

## Implementation Status (as of 2026-09-21)

### Done
- Active Contract Guard Rules (hard block, validate-and-warn, allow) — 
  implemented in enrollment_engine.py
- enrol_type (S/M) resolution from mvi/pmvi — confirmed against reference 
  MassRoll workbook
- Offcycle_Switch_Date populated only for Self Selected Switch 
  (enrol_type='S', not ASAP) — confirmed against reference data
- Self Selected Switch date validation — business day + 3-business-day 
  minimum lead time (see "Specific Date (Self Selected Switch)" above). 
  Non-blocking `date_warning` on `/pending`, hard skip on 
  `/generate-masterroll`
- Bug fix: `/generate-masterroll` no longer writes skipped records 
  (duplicates, misaligned renewal dates, invalid switch dates) into the 
  generated xlsx — row-writing and skip-guards now run in the same pass
- Bug fix: `/generate-masterroll` no longer marks skipped records as 
  `enroll_check = 1` — only sids actually inserted into 
  enrollment_masterroll are marked enrolled, so skipped records correctly 
  stay in the pending queue
- Assignment MVI/Switch decision engine — Build Plan #3
- Full TDSP meter read calendar automation (admin upload page) — 
  Build Plan #5
- Renewal start-date rule (3-case, B&E split out) — Build Plan #6
- B&E start-date rule (as-entered, requires real non-default contract) — 
  Build Plan #7
- Bug fix: Renewal/B&E's active-contract lookup no longer gets shadowed 
  by the auto-generated `account_type='default'` fallback contract's 
  ~30-years-out end date (found while building #7 — see #6's "Follow-up 
  fix" note)

### Explicitly Out of Scope (for now)
- Fee capture/charging for Self Selected Switch and Move-in (one-time 
  switch/move-in fee mentioned in the Enrollments Guide tab) — this is a 
  post-enrollment/billing concern, not part of the enrollment engine
- going_final / EDI ingestion (see Pending list below)

---

## Pending / Not Yet Built
- Dedicated enrollment future table (currently a live filter on 
  confirmation_log/contract_renewal, not a staged table — see Build Plan #1)
- Scheduled promotion of future enrollments (no cron; records just become 
  visible next page-load once within 30 days — see Build Plan #2)
- Priority Move-In charge logic (priority_code is written to MassRoll, 
  but no fee is calculated/applied — deferred, same bucket as fee capture 
  — see Build Plan #4)
- Automated activation on ERCOT confirmation (manual admin action only; 
  part of going_final/EDI platform, out of scope — see Build Plan #8)
- **Addition account-linking to an existing customer** — decided 
  2026-09-21: explicit account picker (broker enters/selects the existing 
  customer_id directly, no fuzzy auto-match), and the new ESI's row links 
  to that account's billing (`bill_to_id`/`billto_cust_id`/`cust_ref_id`) 
  or not, depending on the customer's billing choice (consolidated vs. 
  separate). Not yet implemented — no frontend path currently sets 
  `type_of_contract='Addition'` at all (the broker submission form's 
  "Type of Contract" dropdown only offers New/Renewal); scope covers the 
  account-picker UI, a billing-choice field, and wiring the linkage 
  through `_build_row()` / the `contract_renewal` INSERT — see Build Plan #9
- **Multi-start lifecycle** — clarified 2026-09-21, explicitly deferred by 
  the user ("you can do this later"): a multi-start contract is one 
  submission covering several ESI IDs where each one is filtered by its 
  own start-date type — ASAP ESI IDs go into the current 
  enrollment/masterroll run now, future-dated ESI IDs go into the future 
  table (Build Plan #1/#2) to be promoted later; all other submitted 
  data stays shared/identical across the ESI IDs. Depends on #1/#2 
  (dedicated future table) existing first — see Build Plan #10
- going_final lifecycle (status is read in guards, never written 
  anywhere — blocked on #8, out of scope — see Build Plan #11)
- Tax/exemption data consistency (blank in MassRoll xlsx, unwritten in 
  internal batch — see Build Plan #12)
- Internal batch field completeness (missing contract_end_date, term, 
  tax-exempt columns, and more — see Build Plan #13)
- Operational exception handling / retry visibility (no logging, no 
  rollback, no retry anywhere in enrollment_engine.py — see Build Plan #14)
- ETF calculation for rate-change assignments (no rate-change detection 
  exists in the Assignment path at all — folded into Build Plan #3, 
  remains unbuilt even though #3 itself is done)

---

## Build Plan — Remaining Items

Status legend: READY = scope is clear, can implement directly. 
NEEDS DECISION = requires a policy/business answer before implementation. 
OUT OF SCOPE = deferred deliberately.

### 1. Dedicated enrollment future table — READY
- [ ] New migration: `enrollment_future` table (esiid, sid, effective_date, 
      resolved fields needed to rebuild a MassRoll row later)
- [ ] `/pending` inserts into it instead of (or in addition to) the 
      in-memory `held_for_future` split
- [ ] `/contracts/future` (contracts_confirm.py) reads from the new table 
      instead of live-querying confirmation_log
- [ ] Update docs/DB_MIGRATIONS.md per CLAUDE.md migration rules

### 2. Scheduled promotion of future enrollments — READY (depends on #1)
- [ ] Daily job: move rows from `enrollment_future` back into the pending 
      pool once effective_date <= today + 30
- [ ] Decide job runner (existing cron pattern on VPS, if any — need to 
      check how other scheduled jobs in this codebase run)
- [ ] Test: a record seeded 31 days out shows up in pending the day it 
      crosses the 30-day line

### 3. Assignment MVI/Switch decision engine — DONE (2026-09-21)
- Decision: no new detection logic — use whatever `mvi`/`pmvi`/`switch_flag` 
  was ticked on the contract at confirmation time, same source of truth 
  `_resolve_enrol_type()` already uses for New/Renewal
- [x] Wire `_resolve_enrol_type()` into the Assignment path so it's 
      actually applied — turned out to already be applied unconditionally 
      inside `_build_row()` (enrollment_engine.py) and already selected by 
      `/pending`'s cleanup loop; no backend change needed
- [x] Per docs: when MVI/Switch is involved, an Assignment must route 
      through the ERCOT/xlsx path (`/generate-masterroll`), not just 
      `/create-internal-batch` — this was the actual gap: the frontend 
      (`app/pages/enrollment/index.tsx`) hardcoded Assignment as always 
      internal-only, so no Assignment could ever reach the ERCOT list 
      regardless of flags. Fixed: added `assignmentNeedsErcot()` helper 
      (checks `mvi`/`pmvi`/`switch_flag` off the record) and split the 
      `ercotRecords`/`internalRecords` filters so Assignment rows route by 
      that helper instead of a static type bucket. `typeBadge()` now shows 
      an "· MVI/Switch" / "· Internal" suffix on Assignment rows. Verified 
      with a clean `npx tsc --noEmit -p .`.
- [ ] Rate-change → ETF detection remains unbuilt (no old-vs-new rate 
      comparison exists); ETF calculation itself is also unbuilt — 
      deferred, not part of this item's scope

### 4. Priority Move-In charge logic — DEFERRED (decided 2026-09-21)
- Decision: same bucket as fee capture — post-enrollment/billing, out of 
  scope for now

### 5. Full TDSP calendar automation — DONE (2026-09-21)
- Decision: build an admin upload page/endpoint that reuses the existing 
  parser from `scripts/load_tdsp_meter_read_calendar.py` — removes the 
  SSH+CLI dependency, keeps upload as a manual trigger
- [x] New endpoints under `/api/admin/tdsp-calendar`: `POST /upload` 
      (file + format + tdsp_name + year + optional tdsp_duns, admin-only 
      via `require_admin`) and `GET /status` (per-TDSP/year row counts, 
      date coverage, last-loaded timestamp) — `api/routers/tdsp_calendar_admin.py`
- [x] Admin UI page at `/admin/tdsp-calendar` (linked from `/admin`) — 
      upload form + loaded-calendars status table — 
      `app/pages/admin/tdsp-calendar.tsx`
- [x] Reused the script's parser functions directly (`_PARSERS` dict 
      imported from `scripts/load_tdsp_meter_read_calendar.py`) and the 
      same upsert SQL (same ON DUPLICATE KEY behavior) — 
      `api/controllers/tdsp_calendar.py`. No changes to the CLI script 
      itself; it still works standalone for anyone who prefers SSH.
- Verified: `npx tsc --noEmit -p .` clean; `python -c "import main"` 
  loads cleanly with both new routes registered 
  (`/api/admin/tdsp-calendar/upload`, `/api/admin/tdsp-calendar/status`)

### 6. Renewal start-date rule — DONE (2026-09-21)
Renewal and B&E currently share one code path/check
(`abs(new_start - end_date) > 30` days, in both `contracts_confirm.py`'s
`/send-email` and `enrollment_engine.py`'s `/generate-masterroll` +
`/create-internal-batch`). They no longer should — **B&E has its own,
separate calculation, to be scoped in a later session.** This item covers
**Renewal only**.

Decided Renewal rule (contracts are legally executed instruments, so a
month+ gap between contract end and renewal action is a real problem, not
a data-entry typo — human review, not auto-fix, for that case):
- Renewal submitted **on or before** the current active contract's
  `contract_end_date` → auto-set the new contract's start date to that
  `contract_end_date`, overriding whatever was typed on the form
- Renewal submitted **after** `contract_end_date` has passed, but within
  30 days of it → auto-set the new contract's start date to ASAP
- Renewal submitted **more than 30 days after** `contract_end_date` →
  block (existing 422 behavior), human intervention required — but
  re-anchored to compare **today vs. contract_end_date** (submission
  timing), not the typed start-date vs. contract_end_date like the
  current code does

- [x] Split the shared `contract_type in ("Renewal", "B&E")` branch in 
      all three places (`/send-email`, `/generate-masterroll`, 
      `/create-internal-batch`) so Renewal and B&E no longer share one 
      check
- [x] Implement the 3-case Renewal rule above in all three places — new 
      shared helper `resolve_renewal_start_date()` in 
      `api/utils/renewal_rules.py` (pure function, unit-verified against 
      all 3 cases + the no-active-contract passthrough), wired into:
      - `contracts_confirm.py` `/send-email` — auto-corrects 
        `payload["start_date"]` before the confirmation_log write (cases 
        1/2) or raises 422 (case 3)
      - `enrollment_engine.py` `/generate-masterroll` — auto-corrects 
        `rec["start_date"]` before `_build_row()` runs, or skips the 
        record with a reason (case 3)
      - `enrollment_engine.py` `/create-internal-batch` — auto-corrects 
        `rec["start_date"]` before the `contract_renewal` INSERT, or skips 
        the record with a reason (case 3)
- [x] B&E: left its guard as an unchanged placeholder (exact old 
      `abs(new_start - end_date) > 30` check) in all three places, each 
      with a comment pointing to #7 — does not inherit the new Renewal 
      rule
- Note (Build Plan #10 overlap): a multi-ESI Renewal submission still 
  shares one `start_date` field. If the ESIs on one submission have 
  different `contract_end_date`s, whichever ESI is processed last in the 
  loop determines the resolved date for all of them — not fixed here, 
  same underlying gap as #10
- Verified: `python -m py_compile` on all 3 touched/new files clean; 
  `python -c "import main"` loads clean; `resolve_renewal_start_date()` 
  manually exercised against all 3 cases + the passthrough case, all 
  matched expected output
- **Follow-up fix (2026-09-21, found while building #7 below):** the 
  `SELECT contract_end_date ... ORDER BY contract_end_date DESC LIMIT 1` 
  query this rule (and B&E's, below) reads from was silently broken for 
  any ESI that had already been through `/activate/{customer_id}` — that 
  endpoint eagerly creates a second `account_type='default'` fallback 
  contract row at activation time (not only once the real contract 
  expires; the cron that would flip an expired real contract's status is 
  still a TODO in the code), with an artificial ~30-years-out 
  `contract_end_date`, and leaves it `status='active'` alongside the real 
  row indefinitely. `ORDER BY contract_end_date DESC` therefore always 
  picked the fake default row over the real contract. Fixed by a new 
  shared `fetch_active_contract()` helper (also in 
  `utils/renewal_rules.py`) that prefers the real row and, for Renewal, 
  treats "only a default row exists" the same as "no active contract" 
  (submitted date passes through, matching "Renewal can be done on a 
  default contract" below) instead of forcing the fake end date

### 7. B&E-specific date rule — DONE (2026-09-21)
Decided B&E rule (per user, 2026-09-21) — deliberately different from 
Renewal's:
- B&E's submitted start date (ASAP or a specific future date, whatever is 
  on the new contract) is used **as-is** — it is never forced to align 
  with the current contract's end date the way Renewal is. Example: a 
  customer's real contract ends Apr-27, but they blend-and-extend today 
  for a new 24-month term — the new contract starts now (or whatever date 
  is on it), not Apr-27
- The one guard B&E needs: a **real, non-default** active contract must 
  exist to blend against — unlike Renewal, B&E cannot be done off the 
  `account_type='default'` evergreen fallback contract (no real term left 
  to blend). If none exists, block with a reason (no active contract at 
  all → suggest New; only a default contract → suggest Renewal instead)

- [x] New `resolve_be_start_date()` in `api/utils/renewal_rules.py`, 
      alongside `resolve_renewal_start_date()` — kept as two separate 
      functions per the user's explicit instruction not to merge/reuse 
      between the two types
- [x] Replaced the old shared-placeholder B&E branch (exact 
      `abs(new_start - end_date) > 30` check) in all three places 
      (`contracts_confirm.py` `/send-email`, `enrollment_engine.py` 
      `/generate-masterroll` + `/create-internal-batch`) with the real 
      rule above
- [x] Both Renewal and B&E branches in all three places now call the new 
      shared `fetch_active_contract()` helper (see the #6 follow-up fix 
      note above) instead of duplicating the raw SQL query
- Verified: `python -m py_compile` on all touched files clean; 
  `python -c "import main"` loads clean with routes registered; 
  `resolve_be_start_date()` manually exercised against all 4 cases (no 
  active contract, default-only contract, real contract + ASAP submit, 
  real contract + future-date submit) — all matched expected output

### 8. Automated activation on ERCOT confirmation — OUT OF SCOPE
- Part of the going_final/EDI ingestion platform (standing exclusion). 
  No action until that's brought into scope.

### 9. Addition-specific workflow — DECIDED (2026-09-21), NOT YET BUILT
- [x] Confirmed gap: Addition is handled identically to New everywhere 
      (same guard, same row-building, same `cust_id` generation) — 
      there's no logic that links the new ESI ID to the customer's 
      *existing* account, which is the entire point of Addition vs. New
- [x] Bigger confirmed gap found while scoping this: no frontend path 
      currently sets `type_of_contract='Addition'` at all — 
      `contracts/send.tsx`'s "Type of Contract" dropdown only has 
      New/Renewal options. Addition needs to be added as a selectable 
      type, not just wired up on the backend
- [x] Decided (per user, 2026-09-21):
      - Matching: **explicit account picker** — broker enters/selects the 
        existing customer_id directly. No fuzzy auto-match by email or 
        broker+company_name
      - Output: `cust_id` is generated the same way for every enrollment 
        type (no change there). What actually differs is whether the new 
        ESI's row is *linked* to the existing account's billing 
        (`bill_to_id` on `contract_renewal`; `billto_cust_id`/
        `cust_ref_id` on the MassRoll xlsx — both columns already exist, 
        declared in `_MASTERROLL_COLUMNS`, but are currently never 
        populated by any code path) — depends on the customer's billing 
        choice (consolidated onto the existing account vs. billed 
        separately)
- [ ] Not yet implemented: (1) add "Addition" to the Type of Contract 
      dropdown in `contracts/send.tsx`, (2) add the existing-account 
      picker + a billing-choice field (consolidated vs. separate) to that 
      form, (3) thread the linked account + billing choice through the 
      payload into `_build_row()` (populate `billto_cust_id`/
      `cust_ref_id`) and the `contract_renewal` INSERT (populate 
      `bill_to_id`) in `enrollment_engine.py`. This touches the core 
      broker-facing submission form, so scope/diff should be confirmed 
      before editing it

### 10. Multi-start lifecycle — CLARIFIED (2026-09-21), DEFERRED BY USER
- [x] Confirmed gap, verified against both ends: `_expand_esiids()` 
      (backend) splits a comma-separated esiid string into one record per 
      ESI ID, but every expanded record inherits the *same* 
      `start_date`/`asap`/`meter_read` flags from the parent 
      confirmation_log row. And on the frontend, `applySelectedEsids()` 
      in contracts/send.tsx:336-355 actively collapses multiple selected 
      ESI IDs down to one shared `start_date` (picks the earliest end 
      date across all of them) before the form is even submitted. True 
      multi-start (ESI ID A goes ASAP, ESI ID B holds for a future date, 
      ESI ID C waits on meter read — all on one contract) isn't 
      representable anywhere in the current pipeline, front or back
- [x] Clarified (per user, 2026-09-21): multi-start just means filtering 
      the submission's ESI IDs by their own start-date type — ASAP ESI 
      IDs go into the current enrollment/masterroll run now, future-dated 
      ESI IDs go into the future table instead (see Build Plan #1/#2), to 
      be promoted later. Everything else about the submission (customer 
      info, rate, term, etc.) stays shared/identical across the ESI IDs — 
      it's specifically the routing-by-start-date that's missing, not a 
      need for fully independent per-ESI records
- User explicitly said this can be done later — **not implemented this 
  session**. Real implementation depends on Build Plan #1/#2 (dedicated 
  future enrollment table) existing first, since "future ESI IDs go into 
  the future table" has nowhere to go until that table exists

### 11. going_final lifecycle — blocked by #8 (OUT OF SCOPE)
- [ ] Confirmed gap: `status = 'going_final'` is *read* in every active- 
      contract guard (`status IN ('active','pending','going_final')`) but 
      is never *written* anywhere in the codebase — it's a dead status 
      today, only reachable via a manual DB edit
- Setting it correctly requires knowing when ERCOT has placed a future 
  switch, which is the same going_final/EDI ingestion dependency as #8 — 
  no separate action until that platform is in scope

### 12. Tax/exemption data consistency across every path — READY
- [ ] Confirmed gap: the MassRoll xlsx (`_build_row()`) never populates 
      `tax_exempt1`-`tax_exempt8`, even though `cl.tax_exempt` is fetched 
      from confirmation_log — those 8 columns are always blank in the 
      generated file
- [ ] Confirmed gap: `/create-internal-batch`'s INSERT into 
      contract_renewal writes none of the table's 8 tax-exempt columns 
      (`city_tax_exempt`, `county_tax_exempt`, `state_tax_exempt`, 
      `mtacda_tax_exempt`, `spdt_tax_exempt`, `spdt2_tax_exempt`, 
      `grt_tax_exempt`, `puc_tax_exempt`) despite invoice_engine.py 
      reading them for billing — a Renewal/B&E/Assignment run through the 
      internal batch silently loses any tax-exempt flag
- [ ] Map confirmation_log's tax exemption data into both paths 
      consistently (need to confirm what `cl.tax_exempt` actually encodes 
      — single flag vs. per-category — before mapping to 8 columns)

### 13. Internal batch completeness for all fields used by MassRoll — READY
- [ ] Confirmed gap: `/create-internal-batch`'s contract_renewal INSERT 
      captures ~20 fields; it's missing at minimum `contract_end_date` 
      and `term` — both load-bearing (contract_end_date is what the 
      Renewal/B&E alignment guard itself reads back later for the *next* 
      renewal; term is the entire point of a Renewal/B&E)
- [ ] Also missing vs. what the MassRoll xlsx path collects: SSN, phone1/2, 
      deposit fields, credit fields, the 8 tax-exempt columns (see #12)
- [ ] Audit contract_renewal's full column list against confirmation_log's 
      available fields and extend the INSERT accordingly

### 14. Operational exception handling and retry visibility — READY
- [ ] Confirmed gap: zero logging, zero try/except, zero retry logic 
      anywhere in enrollment_engine.py. Both `/generate-masterroll` and 
      `/create-internal-batch` do all per-record work in one loop with a 
      single `db.commit()` at the end and no `db.rollback()` — a bad 
      record mid-batch raises a raw, unlogged exception with no indication 
      of which record or why
- [ ] Add structured logging per skip/error (reuse the existing 
      `X-Enrollment-Skipped` pattern for expected skips; add real 
      exception logging for unexpected DB errors)
- [ ] Decide if automatic retry is wanted at all, or if visibility 
      (clear error surfaced to the UI + logged) is sufficient — retry 
      implies idempotency guarantees that don't exist yet

---

## Open Questions
- Early renewal: does ORBIC allow renewal more than 
  30 days before current contract ends?
- Rate correction: same ESI ID, same dates, wrong rate 
  entered — what contract type is this?
- Move-out/Move-in same meter: new customer at same 
  location — New or Assignment?
