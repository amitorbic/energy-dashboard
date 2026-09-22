# ORBIC Product Modularization — Scope Report (v2)

Status date: 2026-09-22. Repo: `C:\AmeriPower`, branch `master`. This revision
**supersedes** the 2026-09-21 version of this file. It is a read-only inspection —
no application, database, migration, or configuration file has been modified while
producing it. Status labels used throughout, exactly as specified:

**Built** · **Operational** · **Partially Built** · **Structured / In Progress** ·
**Roadmap** · **Not Found**

A claim is never marked Built/Operational without a file citation. Where the v1
report's finding has changed or been corrected, that is called out explicitly in
§0.

---

## 0. What changed since the v1 report (2026-09-21) — read this first

1. **A partial implementation from a prior session already exists in the working
   tree, uncommitted.** `git status` shows: `app/components/Sidebar.tsx` and
   `Layout.tsx` modified; new `app/config/products.ts`, `app/components/ProductLanding.tsx`,
   `app/pages/{sales,operations,audit}/index.tsx`, `api/utils/tenant_modules.py`,
   `api/migrations/042_create_tenant_modules.sql` untracked; `api/controllers/auth.py`,
   `api/routers/auth.py`, `api/models/schemas.py` modified to add a `modules` JWT
   claim. **This chose a database-backed entitlement design** (a `tenant_modules`
   table in the master DB). Nothing has been deleted or reverted — it is inspected
   and reported on below, not assumed correct.
2. **This new task specification requires a config-based entitlement approach
   first** (`TENANT_MODULES` env var), and explicitly says not to build a new DB
   entitlement system unless inspection proves the DB approach is "already required
   and safe." Fresh inspection this pass found the deciding fact: see §15.
3. **Corrected finding — master-DB-at-request-time exists in code but is not wired
   into the running app.** `api/middleware/tenant.py` defines `TenantMiddleware`,
   which calls `utils/master_db.py::resolve_tenant()` on every request to resolve a
   tenant by subdomain. But `api/main.py` never imports or registers it
   (`app.add_middleware(...)` is called once, for CORS only — no
   `TenantMiddleware`). So the master-DB-per-request pattern is **Structured / In
   Progress**, not a "verified, working pattern," directly answering this task's
   entitlement-approach question. v1's §15 called this "unconfirmed"; it is now
   confirmed unwired. See §15 for the resulting recommendation.
4. **Corrected finding — Tax/exemption audit is Built, not Not Found.** v1 §8 said
   generic tax/exemption audit doesn't exist. Fresh inspection found
   `check_residential_tax_exempt` is a real, scheduled one of the 36 automated
   checks in the billing-audit engine (`api/controllers/billing.py:239,411,916,1756-1783`),
   including its own Excel export ("Tax_exemption_*.xlsx"). Narrow (residential
   PUC/GRT/tax-exempt flag mismatch only), but real and Built — corrected below.
5. **New items this spec names that v1 didn't check** — verified this pass:
   B&E pricing, C&I/sample-bill pricing, Renewal opportunities, Hour Blocks, Layer 4
   ERCOT LFC override. See §2–§4.
6. Everything else verified in v1 (broker portal, consumer/multi-meter portal, AI
   agents, collections, reporting, Position Screen forecast gaps) was re-confirmed
   still accurate against the current repo state and is carried forward, cited
   again below rather than only referenced.

---

## 1. Files Inspected This Pass

- `docs/ORBIC_PRODUCT_MODULARIZATION_SCOPE.md` (v1, pre-overwrite)
- `app/components/{Sidebar,Layout,ProductLanding}.tsx`, `app/config/products.ts`, `app/utils/auth.ts`, `app/pages/{sales,operations,audit}/index.tsx`, `app/pages/index.tsx`, `app/pages/login.tsx`
- `api/main.py`, `api/middleware/{auth,tenant}.py`, `api/utils/{master_db,tenant_modules}.py`
- `api/controllers/auth.py`, `api/routers/auth.py`, `api/models/schemas.py`
- `api/routers/{bne,msp,sample_bill,billing_engine,enrollment_engine}.py`, `api/controllers/{billing,portfolio}.py`, `api/utils/renewal_rules.py`
- `docs/DB_MIGRATIONS.md`, `api/migrations/042_create_tenant_modules.sql`
- `git status` (full working-tree diff state)
- Full router/controller/model inventory carried forward from the three research
  passes cited in v1 (broker portal, consumer/multi-meter portal, Portfolio/Audit/
  Monitoring/Reporting, AI/agent framework) — re-verified spot-checks this pass, not
  re-run from scratch, since the underlying code hasn't changed in those areas.

---

## 2. Product Ownership Map

Mapped against this task's explicit ownership lists. Each line: **capability —
status — evidence**.

### ORBIC Sales

| Capability | Status | Evidence |
|---|---|---|
| Daily pricing | Built | `api/routers/daily_pricing.py`, `app/pages/daily-pricing.tsx` |
| Custom pricing | Built | `api/routers/custom_pricing.py`, `app/pages/custom_pricing/**` |
| B&E (blend & extend) pricing | Built | `api/routers/bne.py` (`/api/bne`, `BneSendRequest`), `app/pages/custom_pricing/blend_extend/**`, start-date rule enforced via `api/utils/renewal_rules.py` |
| C&I / sample-bill pricing | Built | `api/routers/sample_bill.py` (`/api/sample-bill`, PDF via reportlab), `api/routers/msp.py` (multi-start pricing, `/api/msp`), `app/pages/custom_pricing/multi_start/**`, `app/pages/custom_pricing/sample_bill.tsx` |
| Contract creation and confirmation | Built | `api/routers/contracts_confirm.py`, `app/pages/contracts/**` |
| Broker management | Built (internal admin CRUD only) | `api/routers/brokers.py` (unauthenticated CRUD on `broker_new`), `app/pages/broker/**` |
| Broker portal integration | Built, separate app | `broker/` standalone Next.js app (port 3003), backed by `api/routers/broker_*.py` (8 routers) — see §7 |
| Broker/customer/vendor pricing distribution | Built | `api/controllers/email_pricing.py` (quote emails), `contracts_confirm.py` (confirmation/welcome-letter emails) |
| Commission calculation | Built | `api/routers/commission.py`, `app/pages/commission/**` |
| Commission reporting | Built | `commission.py` summary/download endpoints; Commission Audit sub-feature (`/commission/exceptions`) Built |
| Renewal opportunities | Built | `api/routers/contract_renewal.py`, `contract_renewal` table (migrations 011/014), `app/pages/customers/renewal-view.tsx`, `renewal-upload.tsx`; renewal start-date rule in `api/utils/renewal_rules.py` (new, 2026-09-21); also surfaced as a tool in the Orbi AI assistant ("renewal pipeline") |
| Sales-to-Operations handoff | Built | `contracts_confirm.py` confirmation feeds `enrollment_masterroll` via `enrollment_engine.py` — the confirmed-contract → enrollment-queue path is real and already the intended boundary (see §2 Operations, "Core lifecycle") |

### ORBIC Operations

| Capability | Status | Evidence |
|---|---|---|
| Contract confirmation handoff | Built | see above |
| Enrollment Engine | Built | `api/routers/enrollment_engine.py` — batch creation, MasterRoll generation, activate/cancel |
| MasterRoll generation | Built | `enrollment_engine.py` (`/generate-masterroll`), `enrollment_masterroll` table (migration 016) |
| ERCOT enrollment workflow | Built | `enrollment_engine.py` — duplicate-submission guard against `enrollment_masterroll` (line 602), `/activate/{customer_id}` (line 892) creates the live `contract_renewal` record at activation |
| Activation and contract lifecycle | Built, with one gap | activation itself is real (`enrollment_engine.py:892`); the cron to flip an *expired real* contract's status is a documented TODO (`api/utils/renewal_rules.py:39` docstring) — **Partially Built** for full lifecycle automation |
| Billing Engine | Built | `api/routers/billing_engine.py` |
| EDI 867/810 processing | Built | `billing_engine.py` — `ingest_867`/`ingest_810` (`controllers/billing_engine.py`), `edi_867_usage`/`edi_810_line_items` tables, `/upload/867`, `/upload/810` |
| Payments | Built | `api/routers/payment.py`, `app/pages/payments.tsx` |
| Customer operations | Built | `api/routers/customers` (via `custom_pricing`/dedicated customer endpoints), `app/pages/customers/**` |
| Multi-meter portal integration | Built, separate app | `consumer/` standalone Next.js app (port 3002) + `api/routers/consumer.py` — see §8 |
| Condo/apartment workflows | Not Found | repo-wide search for "condo", "apartment" returns zero matches; only a generic `unit_number` field on meter rows |
| Move-in/move-out workflows | Not Found (as a distinct feature) | "move-in"/"move-out" text exists only as ERCOT MassRoll enrollment-type terminology inside `enrollment_engine.py`/`docs/ENROLLMENT_RULES.md`, not a dedicated workflow |
| Operational queues | Built | enrollment batches, billing-period approval queue (`billing_engine.py:283` "safe to approve" query), collections approval queue |
| Customer and contract status | Built | `contract_renewal.status`, `enrollment_masterroll.status` fields, surfaced in UI |
| Collections workflow | Built, deterministic | `api/controllers/collections.py` — see §10 |
| Operational email assistant integration point | Partially Built | `api/routers/email_replies.py` + `email_reply_approval_queue` table (migration 039, not yet run) is a real **human-approval-queue** integration point; the AI drafting/classification side is **not in this repo** — see §6 |

### ORBIC Portfolio

| Capability | Status | Evidence |
|---|---|---|
| Portfolio summary | Built | `app/pages/portfolio/index.tsx`, `api/routers/portfolio.py` |
| Open-position analysis | Built, partially | `app/pages/portfolio/position.tsx`; 5 of 7 selectable forecast types return `"not yet implemented"` server-side (`UNIMPLEMENTED_FORECAST_TYPES` in `routers/portfolio.py`) — **Partially Built** |
| Load forecasting | Built | `controllers/portfolio.py` `get_forecast_data()`, `forecast_baseline_dna`/`forecast_growth_factors` tables (025–028) |
| Price forecasting | Structured / In Progress → Built for read path | see §4 (dedicated section, as required) |
| ERCOT Shape Forecast | Built | `ercot_shape_loadzone` table (026), consumed in `controllers/portfolio.py` |
| DNA Forecast | Built | `forecast_baseline_dna` table (025), `get_dna_forecast_data()` |
| Layer 4 seven-day ERCOT LFC override | Built | `api/controllers/portfolio.py:880-966` — "Step 4b: Layer 4 — 7-Day Override from ercot_lfc_history", real query + zone-grouping + override-precedence logic; fed by `api/scraper_ercot_lfc.py` (cron-scheduled, per v1 §11) |
| Hour Blocks | Not Found | repo-wide search for "Hour Block"/"hour_block" returns zero matches anywhere in `api/` or `app/` |
| Actual load data | Built | `portfolio_load_with_losses`, `portfolio_load_unadjusted`, `portfolio_load_annual` tables (024); ingestion via manually-invoked scripts (`process_settlement.py`, `ingest_ercot_settlement.py` — not cron-scheduled, per v1 §11) |
| Hedging | Built | `api/routers/hedging.py`, `app/pages/portfolio/hedging.tsx` |
| DAM | Built | `api/routers/dam.py`, `app/pages/portfolio/dam.tsx` |
| Manual MTM | Built | `api/routers/mtm.py`, `mtm_results` table (022), `app/pages/portfolio/mtm.tsx` |
| Risk dashboard | Built | `api/routers/risk.py`, `risk_scores` table (031), `app/pages/portfolio/risk.tsx` |
| Forecast checkpoints | Built, Operational, scheduled nightly | `forecast_checkpoints` table (029), `api/monitoring/checkpoint_runner.py` (PM2 cron), 4 sanity checks — read side is Audit & Controls' `monitoring.py` |
| Shadow settlement work | Not Found / Roadmap | explicitly listed as pending in `docs/AMERIPOWER_RISK_PORTFOLIO_MD.md`; no code |
| Settlement reconciliation work | Partially Built | `process_settlement.py`, `ingest_ercot_settlement.py` are real, but manually invoked, not scheduled, and not a reconciliation ("expected vs. actual") engine — one-way ingestion only |
| Portfolio exposure by zone, contract, and period | Built | `risk.py`/`portfolio.py` group by load zone; position/MTM screens break out by contract |

### ORBIC Audit & Controls

| Capability | Status | Evidence |
|---|---|---|
| Enrollment audits | Built, Operational | `api/routers/enrollment.py` (distinct from `enrollment_engine.py`), 15 pages under `app/pages/enrollment-audit/**` |
| Billing audits | Built, Operational | `api/controllers/billing.py`, 36 automated checks, `app/pages/billing-audit/**` |
| Payment audits | Built, Operational | `api/routers/payment.py` ledger/import/bounce/summary, surfaced at `/payments` |
| Commission audits | Built | `commission.py` `/commission/exceptions` (Duplicate / ±30% Variance / Inactive Customer tiers) |
| Tax and exemption audit work | **Built** (corrected from v1) | `check_residential_tax_exempt` — one of the 36 billing-audit checks, `controllers/billing.py:239,411,916,1756-1783`, has its own Excel export. Scope is narrow: residential PUC/GRT tax-exempt-flag mismatch only — not a general tax-audit framework. |
| Contract-to-billing consistency checks | Built (as part of the 36-check engine) | e.g. `check_kh_qty_metered_mismatch` (`billing.py:239`) and similar checks cross-reference contract vs. billed data |
| Incorrect product/rate detection | Partially Built | some of the 36 billing checks detect rate mismatches; no dedicated "product/rate correctness" feature outside that check set |
| Missing-data checks | Built (within billing-audit engine) | multiple of the 36 checks are missing-data detectors (e.g. missing 810, missing rate — see `billing_engine.py:283` "safe to approve" query logic, and equivalent checks in `billing.py`) |
| Duplicate ESI/customer checks | Built (narrow) | Commission Audit's "Duplicate" tier (`commission.py` exceptions) checks for duplicate customer/ESI in commission records specifically — not a platform-wide duplicate-detection feature |
| Forecast checkpoint monitoring | Built, Operational | `api/monitoring/checkpoint_runner.py`, `app/pages/monitoring/checkpoints.tsx`, nightly PM2 cron — hard-coded to the forecast engine, not a generic checkpoint framework |
| Settlement audit work | Not Found (as a distinct audit feature) | settlement *ingestion* exists in Portfolio (see above); no separate audit/reconciliation layer verifying it |
| Exception queues | Built, per-domain | billing-audit exceptions, commission exceptions, collections approval queue — each is its own bespoke queue, not a shared cross-product exception-queue framework |
| Audit evidence and history | Partially Built | individual audit pages show history/logs (e.g. enrollment-audit "user-log" page, commission "user-log" page); no unified evidence store across products |
| Saved reports | Not Found | no save/bookmark mechanism for any report found |
| Custom period-based report generation | Partially Built | several pages accept a date range for their own bespoke export (e.g. billing-audit exceptions, commission downloads) — no shared reporting engine (see §11) |

### Shared ORBIC Platform

| Capability | Status | Evidence |
|---|---|---|
| Tenant context | Structured / In Progress | Two mechanisms exist and are **not unified**: (a) each deployed instance reads `TENANT_REP_ID`/`DB_NAME`/`TENANT_COMPANY_NAME` etc. from its own `.env` at startup (Operational, this is what's actually running); (b) `middleware/tenant.py`'s per-request subdomain resolver exists in code but is not registered in `main.py` (Structured / In Progress, not live) — see §15 |
| Authentication | Built, Operational | `api/middleware/auth.py` (`require_auth`/`require_admin`), JWT via `api/utils/jwt_util.py` |
| Identity | Built | `users` table (per-tenant DB), JWT payload (`user_id`, `username`, `role`, `email`, `rep_id`) |
| Roles and permissions | Built (coarse-grained) | role `"1"`/`"admin"` gate via `require_admin`; no fine-grained permission model beyond that |
| Product/module entitlements | Structured / In Progress | prior-session scaffold exists (DB-backed) but unwired/unrun; this task's config-based approach not yet implemented — see §15 |
| Broker/customer/ESI master data | Built | `esi_id_master` (018/019), `broker_new`, shared contract tables |
| Shared contract data | Built | `contract_renewal`, `confirmation_log` |
| Documents | Partially Built | PDF generation exists per-feature (contracts, quotes, sample bills) via reportlab; no shared document store/repository |
| Notifications | Not Found (as a shared system) | no shared notification center found; emails are sent ad hoc per feature |
| Reporting infrastructure | Not Found (generic) | see §11 |
| AI assistant framework | Built, Operational | see §6 |
| Workflow/event history | Partially Built | per-domain logs exist (enrollment audit, commission user-log); no shared event-history service |
| Audit evidence | Partially Built | see Audit table above |
| Data import/export | Built (per-feature) | Excel/CSV import exists across billing, payments, EDI, enrollment; each is its own implementation, not a shared import framework |
| External integrations | Built | ERCOT scrapers (`scraper_ercot_lfc.py`, `scraper_ercot_weather.py`), EDI 867/810 ingestion, SMTP email sending |
| Shared search/filtering | Not Found (as a shared component) | each page implements its own filters; no shared search service |
| File processing | Built (per-feature) | document parser (`document_parser.py`), various Excel upload handlers |

---

## 3. Current Price Forecasting Ownership and Status (required standalone section)

**Owning product: Portfolio.** Confirmed correct — all forecast tables, controllers,
and pages already live under Portfolio (`api/controllers/portfolio.py`,
`app/pages/portfolio/position.tsx`, `forecast_*` tables). No forecast code exists
under Sales, Operations, or Audit routers.

| Layer | Status | Evidence |
|---|---|---|
| Layer 1 — DNA baseline | Built (read path); build script not scheduled | `forecast_baseline_dna` table, `build_layer1_dna.py` (standalone CLI, not cron-scheduled) |
| Layer 2 — Growth factors | Built (read path); build script not scheduled | `forecast_growth_factors` table, `build_layer2_growth.py` |
| ERCOT Shape Forecast | Built | `ercot_shape_loadzone` table |
| Layer 4 — 7-day ERCOT LFC override | Built | `controllers/portfolio.py:880-966`, `ercot_lfc_history` table, `scraper_ercot_lfc.py` (cron-scheduled) |
| Layer 3 — NOAA seasonal outlook | Roadmap | explicitly listed pending in the platform's own design doc, no code |
| Position Screen — Smoothed/Minimum/Maximum/Bands/What-If load types | **Not Found (server-side)** | UI-selectable in `position.tsx`, explicitly return `"not yet implemented"` in `routers/portfolio.py`'s `UNIMPLEMENTED_FORECAST_TYPES` |

If a *new* price-forecasting feature is added going forward, this task's own rule
applies as written: owning product `portfolio`, entitlement `portfolio`, nav group
Portfolio, route pattern `/portfolio/...` — no exceptions needed, since that's
already exactly how the existing forecast code is organized.

---

## 4. Existing Routes and Pages (frontend)

Carried forward from v1 §2 (re-verified, unchanged), reorganized against this
task's requested navigation tree in §12.

---

## 5. Existing APIs and Controllers (backend)

Carried forward from v1 §1 (router/product table), extended with this pass's new
findings: `bne.py`, `msp.py`, `sample_bill.py` (Sales); `contract_renewal.py` +
`renewal_rules.py` (Sales/Operations boundary — renewal *start-date* rule now lives
in a shared utility used by both Sales-side contract confirmation and
Operations-side enrollment, confirming the intended handoff model in this task's
spec is already how the code is structured).

---

## 6. Existing AI Assistants (required standalone section)

| Capability | Status | Detail |
|---|---|---|
| **Main "Orbi" chat assistant** | Built, Operational | Route: `/agent` page + global `ChatWidget`. Implementation: `app/pages/api/chat.ts`, `gpt-4o-mini`, 16 real tool-calls into the FastAPI backend (customers, ESID, pricing, commission, ERCOT forecast/DAM/RTM, expiring contracts, open position, past-due, renewal pipeline). **Shared platform capability** — available independently of product entitlements, subject to existing auth, per this task's explicit requirement. |
| **Voice assistant** | Built, Operational, separate pipeline | `POST /api/voice/turn` → `api/controllers/voice.py` → STT (`gpt-4o-transcribe`) → LLM (`gpt-4o-mini`, its own prompt) → TTS (`gpt-4o-mini-tts`). Only 4 tools, called in-process. Shared platform capability, same as main assistant. |
| **Operational email assistant — approval queue** | Built | `api/routers/email_replies.py` + `email_reply_approval_queue` table (migration 039, not run). Shared-secret auth (`X-Pipeline-Key`), not staff JWT. This repo contains the **human-review queue only**. |
| **Operational email assistant — AI drafting/classification** | **Not in this repo** | Confirmed via `docs/investor_deck/README.md`: lives in a separate, non-ORBIC codebase, not merged here, not connected to a live inbox. Must not be presented as integrated. |
| **Collections Agent** | **Roadmap / Not Found as an autonomous LLM agent** | `CollectionsAgentTool` model exists but is unused after being imported once; no LLM call anywhere in `collections.py`. The actual Collections workflow (§ below) is deterministic, rule-based code — not an AI agent. |

---

## 7. Existing Broker Portal Status

Built / Operational, in three distinct pieces (unchanged from v1 §5, re-verified):

1. `api/routers/broker_*.py` (8 routers) — the real broker-portal-facing API. Built.
2. `app/pages/broker/**` (inside the main app) — unauthenticated internal admin CRUD
   over `broker_new`, **not** the self-service portal. This is what `Sidebar.tsx`'s
   "Broker" item currently points to.
3. `broker/` at repo root — the actual standalone self-service portal (port 3003,
   `broker.enertsol.com`), 38 pages, own auth (`broker_token`/`broker_user` in
   `localStorage`). **Owning product: Sales**, per this task's explicit instruction.
   Known gap: daily-pricing/quote engine is a documented "Coming Soon" placeholder,
   Renewal Offer Sheet generator falls back to a redirect (`broker/PORTAL.md`
   "Pending / Known Issues") — Partially Built.

This is a separate deployed application with independent auth — main-app sidebar
entitlement filtering does **not** and cannot protect it. Any link to it from the
main app must be preserved and labeled as external, not silently gated as if the
sidebar controlled access to it.

---

## 8. Existing Multi-Meter Portal Status

Built / Operational, generic (no condo/apartment-specific logic anywhere —
confirmed again this pass, zero matches for "condo"/"apartment"). Standalone app at
`consumer/` (port 3002, `consumer.enertsol.com`), own dedicated database
(`CONSUMER_DB_NAME`). Backend: `api/routers/consumer.py` + `api/controllers/consumer.py`.
**Owning product: Operations**, per this task's explicit instruction. Same
separate-app caveat as the broker portal applies — out of scope for main-app sidebar
entitlement filtering.

---

## 9. Existing Reporting Status

**Not Found** as a generic/shared capability (unchanged from v1 §7). `Sidebar.tsx`
has exactly one "Reports" entry, `soon: true`, disabled. Every existing "report" is
a bespoke, page-specific query + page-specific export (8 enrollment-audit report
pages, commission downloads, billing-audit exceptions export) — no shared report
engine, template system, or export utility. This is **Roadmap**, not Structured /
In Progress — there is no scaffolding to build on, only a disabled nav placeholder.

---

## 10. Existing Collections Status

Built, deterministic, human-approval-gated (unchanged from v1 §9, re-verified).
`CollectionStage` enum: REMINDER → DNP_NOTICE → DNP_ACTIVE → MVO → EMAIL_OUTREACH →
CHASING → DEMAND_SENT → IN_LEGAL → RESOLVED/WRITTEN_OFF, in
`api/controllers/collections.py`. 4-tier scoring. DNP notice workflow is real and
PUC-compliance-enforced (hard `ValueError` if triggered before the statutory 10-day
window). `CollectionsEscalationRule` table exists but is schema-only, never queried.
MVO/legal-escalation execution is enum-only (Partially Built). Frontend
(`app/pages/past-due/**`) fully wired. **Owning product: Operations** (delinquency
handling within customer/payment ops); its data is also consumable by Audit &
Controls, per this task's dependency model. **No LLM/agent execution anywhere in
this module** — do not call it an "agent."

---

## 11. Existing Database Tables

Unchanged from v1 §3 — carried forward verbatim (verified via migration files
001–042 and controller code). One addition this pass: `edi_867_usage` and
`edi_810_line_items` (EDI ingestion, under Operations — billing engine), confirmed
in `billing_engine.py`. No module/entitlement/feature-flag table existed before the
prior session's uncommitted `tenant_modules` migration (042, not run) — see §15 for
whether that table should be used going forward.

---

## 12. Navigation Mapping — Requested Tree vs. Actual Routes

Legend: ✅ route exists and is already in `Sidebar.tsx` · 🟡 route exists but is
**not currently in the sidebar** (nav gap) · ⛔ no such route/page exists.

```
ORBIC
├── Sales
│   ├── Pricing                       ✅ /pricing
│   ├── Custom Pricing                ✅ /custom_pricing (not in current SECTIONS — only /pricing is; custom_pricing pages exist and are linked from within the Pricing flow, not top-level nav)
│   ├── Brokers                       ✅ /broker (internal admin CRUD — see §7 caveat)
│   ├── Broker Portal link            🟡 no link to broker.enertsol.com exists anywhere in app/ nav today
│   ├── Contract Confirmation         ✅ /contracts
│   └── Commissions                   ✅ /commission
├── Operations
│   ├── Customers                     ✅ /customers
│   ├── Contracts                     ✅ /contracts (same route as Sales' Contract Confirmation — one page, dual conceptual ownership per §2's Sales-to-Operations handoff)
│   ├── Enrollment                    ✅ /enrollment
│   ├── Multi-Meter Portal link       🟡 no link to consumer.enertsol.com exists anywhere in app/ nav today
│   ├── Billing                       ✅ /billing
│   ├── Payments                      ✅ /payments (currently marked soon:true in Sidebar.tsx despite the page and API being Built — a stale placeholder flag, not a real gap)
│   └── Collections                   ✅ /past-due (Collections workflow's actual route; not labeled "Collections" in nav today)
├── Portfolio
│   ├── Overview                      ✅ /portfolio
│   ├── Position                      ✅ /portfolio/position
│   ├── Load Forecast                 🟡 no dedicated page — load forecast is shown inside /portfolio/position, not a standalone route
│   ├── Price Forecast                🟡 same as Load Forecast — inside /portfolio/position, not standalone; labeling it as its own nav item without a real page would be misleading (see §3)
│   ├── Hedging                       ✅ /portfolio/hedging (already added to Sidebar.tsx in the prior uncommitted session, previously a nav gap)
│   ├── DAM                           ✅ /portfolio/dam (same as Hedging)
│   ├── MTM                           ✅ /portfolio/mtm
│   ├── Risk                          ✅ /portfolio/risk
│   └── Settlements                   ⛔ no dedicated settlements page exists; settlement data is ingested via CLI scripts only, no UI (see §2 Portfolio table)
└── Audit & Controls
    ├── Audit Dashboard               ⛔ no single audit landing/dashboard page exists — each audit type has its own page, no unifying dashboard
    ├── Enrollment Audit              ✅ /enrollment-audit
    ├── Billing Audit                 ✅ /billing-audit
    ├── Payment Audit                 ✅ /payments (same page Operations lists under Payments — Payment Audit is a viewing lens on the same ledger, not a separate route; see §2 Audit table)
    ├── Commission Audit              ✅ /commission/exceptions (sub-page of Commission, not top-level)
    ├── Settlement Audit              ⛔ Not Found (see §2 Portfolio/Audit tables)
    ├── Exceptions                    🟡 exceptions exist per-domain (billing-audit, commission) but there is no unified "Exceptions" nav item/page
    └── Reports                       🟡 exists as a disabled soon:true placeholder only (see §9)
Shared
    ├── ORBIC AI                      ✅ /agent (not currently in Sidebar.tsx SECTIONS at all — reached via the global ChatWidget, not a sidebar link)
    ├── Notifications                 ⛔ Not Found (see §2 Shared table)
    ├── Documents                     ⛔ Not Found as a shared page (see §2 Shared table)
    └── Settings                      ⛔ Not Found — no dedicated settings page found; /admin exists but is admin-tools, not user/tenant settings
```

**Conclusion:** the requested tree is a good target shape, but roughly a third of
its leaf items (Load Forecast, Price Forecast, Settlements, Audit Dashboard,
Settlement Audit, Exceptions, Notifications, Documents, Settings, and both portal
links) do not exist as real pages today. Per this task's explicit instruction
("Add missing... only if those pages/routes already exist... otherwise label it as
planned or leave a safe placeholder"), the recommended v1-of-nav-restructure should
render only the ✅ items as real links, and either omit the 🟡/⛔ items entirely for
now or render them as disabled "planned" placeholders — matching the existing
`soon: true` UI convention already used for "Reports."

---

## 13. Feature Registry (representative entries, format per this task's spec)

A full registry (one entry per page/route) belongs in code
(`app/config/products.ts` extended, or a new `app/config/features.ts`), not fully
enumerated in prose here. Representative entries to establish the pattern:

```ts
{ key: "sales.bne_pricing", product: "sales", name: "Blend & Extend Pricing",
  route: "/custom_pricing/blend_extend", status: "built", requires: [] }
{ key: "sales.commission_audit", product: "sales", name: "Commission Audit",
  route: "/commission/exceptions", status: "built", requires: ["commission_data"] }
{ key: "operations.masterroll", product: "operations", name: "MasterRoll Generation",
  route: "/enrollment", status: "built", requires: ["confirmed_contract"] }
{ key: "operations.collections", product: "operations", name: "Collections",
  route: "/past-due", status: "built", requires: ["payment_data"] }
{ key: "portfolio.price_forecast", product: "portfolio", name: "Price Forecast",
  route: "/portfolio/position", status: "partially_built",
  requires: ["market_prices", "load_forecast"] }
{ key: "portfolio.hedging", product: "portfolio", name: "Hedging",
  route: "/portfolio/hedging", status: "built", requires: [] }
{ key: "portfolio.settlement_reconciliation", product: "portfolio",
  name: "Settlement Reconciliation", route: null, status: "roadmap", requires: [] }
{ key: "audit.tax_exemption_check", product: "audit", name: "Tax Exemption Audit",
  route: "/billing-audit", status: "built", requires: ["billing_data"] }
{ key: "audit.settlement_audit", product: "audit", name: "Settlement Audit",
  route: null, status: "not_found", requires: ["portfolio.settlement_reconciliation"] }
```

---

## 14. Missing Capabilities (Roadmap / Not Found)

Unchanged from v1 §10, plus this pass's additions:
- Hour Blocks — no such concept exists anywhere in the codebase.
- A unified Audit Dashboard, Settlements page, or Settlement Audit feature.
- Shared Notifications, Documents, and Settings pages.
- Broker Portal / Multi-Meter Portal links from the main app's navigation.
- Generic reusable report engine; saved reports.
- Autonomous "Collections Agent" LLM actor.
- Operational email AI drafting/classification pipeline (exists, but in a separate codebase).
- Shadow settlement / 3-way settlement reconciliation.
- Forecast Layer 3 (NOAA seasonal outlook).
- 5 of 7 Position Screen forecast load types.
- Condo/apartment-specific workflow; distinct move-in/move-out product feature.

---

## 15. Entitlement Approach — Decision (this task's central open question)

**Recommendation: config-based, via a `TENANT_MODULES` env var — not the DB-backed
table from the prior uncommitted session.**

Reasoning, from this pass's inspection:

- The codebase already has an established, working convention for exactly this
  kind of per-tenant setting: plain `os.getenv("TENANT_XXX", default)` calls,
  confirmed live across `TENANT_REP_ID`, `TENANT_COMPANY_NAME`, `TENANT_LOGO_URL`,
  `TENANT_DISPLAY_NAME`, `TENANT_CACHE_TTL`, `TENANT_EMAIL_DEFAULT`,
  `TENANT_WEBSITE`, `TENANT_ADDRESS`, `TENANT_PHONE` (`api/main.py`,
  `api/routers/auth.py`, `api/controllers/{commission,email_pricing,billing}.py`,
  `api/utils/email_routing.py`, `api/middleware/tenant.py`). `TENANT_MODULES`
  fits this exact pattern — no new mechanism invented, per this task's explicit
  "use the existing mechanism" instruction.
- The DB-backed alternative depends on querying the **master** DB
  (`ameripower_master`) from each tenant's deployed instance. That pattern
  (`utils/master_db.py::resolve_tenant`) is real code, but its only intended
  caller, `middleware/tenant.py`'s `TenantMiddleware`, is **never registered** in
  `api/main.py` — confirmed by inspection (no `app.add_middleware(TenantMiddleware...)`
  anywhere). So master-DB-at-runtime is **not** a "verified, working pattern" in
  this app today; it's an unwired module. This task's own instruction — "Do not
  query a master database at runtime unless the repository already has a
  verified, working pattern for this" — is decisive here: it doesn't, so don't.
- Config-based also satisfies every hard rule in this task cleanly: `enterprise`
  enables all four; missing `TENANT_MODULES` defaults to all-enabled (matches the
  existing fail-open precedent already established for legacy JWTs without a
  `rep_id` claim, per `test_tenant_isolation.py::test_jwt_without_rep_id_skips_tenant_check`);
  unknown module keys are simply ignored (parse, filter to the known set, log
  unrecognized ones); no migration, no production-data change, no new DB
  dependency at request time.

**Disposition of the prior session's DB-backed scaffold** (not deleted, inspection
only): `api/migrations/042_create_tenant_modules.sql` and
`api/utils/tenant_modules.py` remain in the working tree, uncommitted and not run.
Recommend leaving the migration file as-is (harmless, unrun, already logged in
`docs/DB_MIGRATIONS.md`'s Pending table) but **not wiring `tenant_modules.py` into
`auth.py`/JWT claims for this phase** — superseded by the config approach above.
If a future phase needs true per-tenant, admin-editable entitlements (not just
one value per deployed instance), revisit the DB approach then, and only after
`TenantMiddleware` is actually registered and proven live.

---

## 16. Files That Should Change (recommended for the implementation phase — none touched yet)

- `app/config/products.ts` — already created (prior session); extend with
  `description`, `navOwnership`, `entitlementKey`, `status` fields per this task's
  registry requirement. Reuse, don't duplicate.
- `app/components/Sidebar.tsx` — reorganize `SECTIONS` to match §12's tree, using
  only the ✅ items as real links; existing `product` tagging field (already added)
  can stay as the entitlement-filter mechanism.
- `app/components/Layout.tsx` — already has a module-gate check (prior session);
  keep the existing behavior (explicit "not available" state, not a silent
  redirect) — matches this task's "do not silently fail" requirement.
- `app/utils/auth.ts` — already has `hasModule()`; update it to read modules from
  a config-derived source instead of (or in addition to) the JWT claim, once the
  backend switches to `TENANT_MODULES`.
- `api/routers/auth.py` / `api/controllers/auth.py` — replace the DB-backed
  `get_tenant_modules()` call with a small `os.getenv("TENANT_MODULES", ...)`
  parse-and-default-to-all helper, mirroring the existing `TENANT_COMPANY_NAME`
  pattern exactly.
- New: a small backend helper/dependency (e.g. `api/utils/modules.py`) exposing
  the parsed module list, for any *future* module-gated endpoint — per this
  task's instruction to add this without bulk-gating existing routes.
- `docs/DB_MIGRATIONS.md` — no new migration needed for the config approach; leave
  042's entry as-is (harmless, already logged, not run).

## 17. Files That Must NOT Change

- `api/routers/enrollment_engine.py`, `api/routers/contracts_confirm.py`,
  `app/pages/admin/index.tsx`, `app/pages/contracts/*`, `app/pages/enrollment/index.tsx`,
  `docs/ENROLLMENT_RULES.md` — substantial uncommitted in-flight work (enrollment
  start-date-flags feature); touch only if unavoidable, additively only.
- Any business-logic controller (`billing_engine.py`, `portfolio.py`, `hedging.py`,
  `risk.py`, `collections.py`, `commission.py`, `voice.py`, etc.) — no calculation,
  workflow, or rule changes.
- `api/middleware/auth.py`'s `require_auth`/`require_admin` — must stay compatible
  with `api/tests/test_tenant_isolation.py`.
- Existing JWT payload fields (`rep_id`, `role`, etc.) — additive only.
- `broker/` and `consumer/` standalone apps — separate deployments, explicitly
  out of scope for this phase per this task's instruction.
- Any existing DB table or column; no migration runs in this phase.
- `api/main.py`'s existing router-include lines — append-only if a new router is
  ever added.

## 18. Compatibility Risks

- **Uncommitted in-flight work** (§0.1, §17) — any new edit must be additive and
  placed to avoid textual conflicts with the enrollment start-date-flags feature.
- **Two competing entitlement scaffolds now exist in the tree** (DB-backed from
  the prior session, config-based recommended here) — must be reconciled in one
  direction before further wiring, or `auth.py` will end up with dead code calling
  an unused DB helper. Recommend explicit user sign-off on §15's recommendation
  before touching `auth.py` again.
- **`Payments` nav item is stale** — `Sidebar.tsx` marks it `soon: true` even
  though `/payments` and its API are fully Built; this is a pre-existing
  inaccuracy the nav restructure should fix (not a new risk, but worth flagging
  since the requested tree lists Payments as a real Operations item).
- **Contracts route is shared** between Sales ("Contract Confirmation") and
  Operations ("Contracts") in the requested tree — it's one page/route in
  reality; the nav restructure must not create a duplicate/second page, just
  potentially list it under one section (Sales, per this task's ownership rule
  that Contract Confirmation's owner is Sales with a handoff to Operations).
- **Master-DB reachability remains genuinely unconfirmed** for any *future* need
  (e.g. `TenantMiddleware` itself) — not blocking for this phase since the config
  approach avoids the dependency entirely, but should be resolved before anyone
  tries to register `TenantMiddleware` for other reasons.
- **Validation surface**: `pytest api/tests/test_tenant_isolation.py -v` must
  keep passing unchanged; `npm run lint` / `npm run build` in `app/` must pass
  after any Sidebar/Layout/auth changes — same as v1's validation plan.

## 19. Validation Plan (for the implementation phase)

1. `pytest api/tests/test_tenant_isolation.py -v` — must stay green, unchanged.
2. `npm run lint` in `app/` — new/changed files must add zero new errors versus
   the current baseline (confirmed 177 pre-existing problems as of 2026-09-21;
   re-diff against that count, not zero, since the repo has pre-existing lint debt
   unrelated to this work).
3. `npm run build` in `app/` — must succeed, all routes (old and new) must
   prerender.
4. Manual check: an instance with no `TENANT_MODULES` set must show every nav
   section and allow every route (fail-open default), matching current behavior
   exactly — this is the regression that matters most, since every live tenant
   today has no such variable set.
5. Manual check: setting `TENANT_MODULES=sales` locally must hide
   Operations/Portfolio/Audit sections and show the "not available" state if
   their routes are visited directly, while Shared items (AI assistant, Admin)
   remain visible.

## 20. Recommended Implementation Order

1. Get explicit user sign-off on §15 (config-based `TENANT_MODULES`, not the
   prior session's DB-backed table) before writing any code — this is the one
   decision this report cannot make unilaterally, since a real (uncommitted)
   alternative already exists in the tree.
2. Backend: add a `TENANT_MODULES` parser/helper (small, mirrors existing
   `TENANT_*` env var patterns) with `enterprise` → all four, missing → all four,
   unknown keys ignored-with-log.
3. Wire that helper into the JWT `extra_claims` at login (replacing the prior
   session's DB call), keeping the `modules` claim name and shape unchanged so
   the frontend doesn't need to change its consumption contract.
4. Frontend: reorganize `Sidebar.tsx`'s `SECTIONS` to the §12 tree, real routes
   only; keep `soon`/placeholder convention for the 🟡/⛔ items instead of
   inventing new pages.
5. Confirm `Layout.tsx`'s existing module-gate + "not available" messaging still
   composes correctly with the reorganized sections.
6. Update product landing pages' content only if the underlying nav grouping
   changed which items they list (they already derive from `SECTIONS`, so this
   should be automatic).
7. Run the full validation plan (§19).
8. Only after all of the above: revisit whether the DB-backed `tenant_modules`
   migration (042) should be deleted, kept dormant, or repurposed for a later
   phase — do not decide this unilaterally either.
