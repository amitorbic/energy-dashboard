# ORBIC Investor Presentation

`ORBIC_Investor_Presentation.pptx` — a 22-slide, fully editable investor deck
positioning **ORBIC** as the intelligent operating system for retail energy
providers (REPs) operating in ERCOT, organized around four connected
operating engines (Sales, Operations, Portfolio, Collections) plus three
cross-cutting layers (AI, Audit, Reporting).

## Files

| Path | Purpose |
|---|---|
| `ORBIC_Investor_Presentation.pptx` | The deliverable — 22 slides, native editable text/shapes/tables, dark energy-command-center theme, speaker notes on every slide. |
| `deck.py` | Assembles the PPTX from scratch using `python-pptx`. Run after editing copy/layout. |
| `diagrams.py` | Generates every diagram PNG in `assets/` using Pillow (PIL). Run after changing diagram content. |
| `assets/` | The 10 diagram PNGs embedded in the deck (see slide map below). No screenshots — see "Why diagrams, not screenshots" below. |

## Regenerating the deck

```bash
cd docs/investor_deck
pip install python-pptx        # Pillow already in the repo's environment
python diagrams.py             # writes assets/*.png
python deck.py                 # writes ORBIC_Investor_Presentation.pptx
```

Both scripts are idempotent — safe to re-run any time. Neither script touches
the application database, source app code, or any file outside
`docs/investor_deck/`.

## Why diagrams, not screenshots

Capturing live application screenshots would have required either real login
credentials or writing a bootstrap admin user into a live tenant database —
neither is appropriate for an artifact that leaves this repository. Per
explicit direction, this was resolved by **skipping live screenshots
entirely** in favor of diagrams built directly from verified component code
(router signatures, table schemas, model enums, `Sidebar.tsx` nav structure)
— no database writes, no login attempts, no live app access, and no
credentials of any kind appear anywhere in this deck or its source files.

## Slide map

| # | Title | Key visual |
|---|---|---|
| 1 | Cover — ORBIC | `hero_graphic.png` |
| 2 | The REP operating problem | native fragment cards |
| 3 | ORBIC's four operating engines | `four_engine_architecture.png` |
| 4 | The complete REP lifecycle | `lifecycle_pipeline.png` |
| 5 | Sales Engine | native module cards |
| 6 | Operations Engine | native module cards |
| 7 | Portfolio and Risk Engine | `portfolio_risk_diagram.png` |
| 8 | ERCOT Price Forecasting | `price_forecasting_diagram.png` |
| 9 | DAM/RTM Hedging Framework | `hedging_framework_diagram.png` |
| 10 | Backtested Performance (pending) | native status panel |
| 11 | Shadow Settlements | `shadow_settlements_diagram.png` |
| 12 | Collections Engine | `collections_lifecycle_diagram.png` |
| 13 | AI operating layer | `ai_agent_diagram.png` |
| 14 | Operational email assistant pipeline | `email_pipeline_diagram.png` |
| 15 | Audit and control layer | native module cards |
| 16 | Reporting and intelligence layer | native 3-step flow |
| 17 | Market opportunity | native stat cards + pricing panel |
| 18 | Competitive landscape | native comparison rows |
| 19 | Go-to-market | native module cards |
| 20 | Defensibility | native bullet list |
| 21 | Product maturity | native status matrix |
| 22 | Closing vision | `hero_graphic.png` + bullet list |

## Verified claims and their sources

Every capability in the deck is labeled **Built**, **Operational**,
**Partially Built**, **In Progress**, or **Roadmap**. Nothing is claimed as
complete unless a specific file confirms it. No customer names, revenue,
savings figures, accuracy percentages, ORBIC partnership claims, or
production-usage-by-a-named-REP claims are made anywhere in the deck. Slide
17 (Market Opportunity) is the one exception to "no market size, no
pricing" — every market-structure figure on it is externally sourced and
cited below, and ORBIC's own stated go-to-market pricing is shown and
explicitly labeled as ORBIC's pricing, not a market fact; any resulting
ARR-per-REP figure is explicitly labeled illustrative unit economics, not a
revenue forecast.

| Claim used in deck | Status shown | Source |
|---|---|---|
| Sales/Broker pricing & broker management (core app) | Built | `app/components/Sidebar.tsx` nav (Pricing, Daily Pricing, Commission); associated routers |
| Broker Portal & application (standalone app) | Built | `broker/PORTAL.md` — Next.js 16 + FastAPI, real auth, 13 `reportlab` PDF forms, renewal dashboard reading `contract_renewal`/`renewal_offer` |
| Broker Portal's own pricing-quote engine | **Roadmap** | `broker/PORTAL.md` "Pending / Known Issues" — `daily_quotes`/`custom_price` equivalents are stubs |
| Contract Management with 30/90-day expiration alerts | Built | `broker/PORTAL.md` dashboard description |
| Enrollment Engine — 6 contract types, MasterRoll generation (128-column XLSX), active-contract guard rules | Built | `api/routers/enrollment_engine.py`; `docs/ENROLLMENT_RULES.md` |
| Activation writes `contract_renewal` as single source of truth | Built | `api/routers/enrollment_engine.py`, `POST /activate/{customer_id}` |
| Billing Engine — EDI 867/810 ingestion → contract matching → tax → invoice | Built | `docs/BILLING_ENGINE.md`: "Core billing pipeline ... is built and verified" |
| Multi-Meter Portal — continuous move-in/move-out (standalone app, distinct from Enrollment) | Built | `consumer/PORTAL.md` — separate Next.js + FastAPI app, own MySQL DB, JWT auth, ongoing self-service meter add/cancel/confirm workflow (status codes: Pending, Add Requested, Cancel Requested, Failed, Archived), admin Excel upload with a Unit Number column supporting multi-meter/multi-unit properties. The add/cancel/confirm workflow itself *is* the continuous move-in/move-out operation — not a separate, less-built layer on top of it. |
| Payments (core app) | **Roadmap** | `app/components/Sidebar.tsx` — `{ label: "Payments", soon: true }` |
| Layer 1 — DNA baseline forecast (12-yr ERCOT history) | Built | `docs/AMERIPOWER_RISK_PORTFOLIO_MD.md` "Forecast Engine — Layer Cake"; `ercot_load_history` table |
| Layer 2 — ERCOT growth factors | Built | Same doc, `forecast_growth_factors` table |
| Layer 3 — Seasonal NOAA adjustment | **Roadmap** | Same doc: "to build"; `forecast_modifiers` table comment |
| Layer 4 — 7-Day ERCOT LFC override, live in forecast path | Built | `api/controllers/portfolio.py`, `get_forecast_data()` — consumed by the Position Screen |
| Position Screen, Hedge Book, DAM purchase entry | Built | `app/components/Sidebar.tsx` (`/portfolio/position`); portfolio routers/controllers |
| Manual Mark-to-Market (MTM) | Built | `docs/AMERIPOWER_RISK_PORTFOLIO_MD.md` MTM Engine section: "source: MANUAL now, API endpoint ready for future price feeds" |
| Live MTM market-price feeds (CME, ICE, Bloomberg) | **Roadmap** | Same doc, explicitly listed as pending; no live feed integration in code |
| Risk Dashboard — 4-factor weighted (Position 40% / Price 25% / Customer 20% / Weather 15%) | Built | `api/controllers/risk.py` — `calculate_position_risk`, `calculate_price_risk`, `calculate_customer_risk`, `calculate_weather_risk`, `calculate_overall_risk` |
| Risk Engine's Customer factor reads live Collections exposure | Built | `api/controllers/risk.py`, `calculate_customer_risk` — queries `collections_accounts` directly |
| 4 nightly monitoring checkpoints (Mirror Test, Backtest, Energy Balance, Portfolio Ratio) | Built | `api/monitoring/checkpoint_runner.py`; `api/routers/monitoring.py`; `app/pages/monitoring/checkpoints.tsx` |
| ERCOT market-data scraping — load (LFC), DAM/RTM settlement prices, DAM ancillary clearing prices, 8-zone weather | Built | `api/scraper_ercot_lfc.py`, `api/scraper_ercot_dam.py`, `api/scraper_ercot_rtm.py`, `api/scraper_ercot_market_prices.py`, `api/scraper_ercot_weather.py` — all share `ercot_scraper_engine.py`'s two-tier proxy pattern |
| ERCOT bid/offer-stack data (raw offer curves, as opposed to settlement/clearing prices) | **Roadmap** | Targeted repo-wide search for bid/offer/stack/curve scraping found no dedicated scraper — only settlement and clearing prices are captured today |
| DAM price forecasting model — gradient-boosted quantile regression, price-distribution output | **Roadmap** | Repo-wide search for `price_forecast`/`quantile`/`gradient boost` found no matches; this is new methodology layered on the existing (Built) load/weather forecast stack, not yet implemented |
| DAM/RTM hedging framework — spread forecast, RTM spike-risk score, automated hedge ratio engine | **Roadmap** | Repo-wide search for `hedge_ratio`/"hedge ratio" found no matches; the underlying tools it would act through (Position Screen, hedge book, DAM purchase entry) are Built — see Portfolio Engine rows above |
| Backtested cost/risk validation of the hedging framework vs. a naive always-100%-DAM baseline | **Roadmap** | No backtest code or results exist; the deck presents this as an explicit TBD placeholder rather than an estimate |
| Shadow Settlements — REP bill estimate step | **In Progress** | No dedicated settlement-bill-estimate module found; Billing Engine computes charges but not a standalone settlement estimate |
| Shadow Settlements — comparison, reconciliation, two-way audit steps | **Roadmap** | `docs/AMERIPOWER_RISK_PORTFOLIO_MD.md` "Pending (In Order of Priority)" — settlement reconciliation (3-way match) listed as pending |
| Collections — delinquency scoring, 4-tier system | Built | `api/models/collections.py` (`CollectionsAccount`, `DelinquencyTier`); `api/controllers/collections.py` (`_calc_score`, `_score_to_tier`) |
| Collections — DNP notice + PUC 10-day rule enforcement | Built | `api/controllers/collections.py`, `send_dnp_notice()` (sets `dnp_eligible_after` = today+10, cites PUCT Subst. R. 25.480) and `execute_dnp()` (hard-blocks via `ValueError` if called before that date) |
| Collections — human approval queue on irreversible actions | Built | `api/models/collections.py` (`CollectionsApprovalQueue`, `ApprovalActionType`); `api/controllers/collections.py`, `review_approval()` |
| Collections — full audit timeline | Built | `api/models/collections.py` (`CollectionsTimeline`, `EventType`) |
| Collections — MVO execution, demand-letter/legal-escalation workflow | **Partially Built** | Modeled in `CollectionStage`/`ApprovalActionType` enums but no dedicated execution function beyond the generic `change_stage()` |
| Collections Agent (autonomous LLM actor) | **Roadmap** | `CollectionsAgentTool` registry exists (`is_enabled`, `requires_approval`, `is_irreversible`) but repo-wide search found no LLM API invocation anywhere in the collections module |
| Orbi AI agent — tool-calling agent, 12 live tools against production FastAPI endpoints | Built | `app/pages/api/chat.ts` — full tool schema list, `executeTool()`, grounding system prompt ("Never invent data — always call a tool") |
| Operational email assistant — standalone retrieval + drafting pipeline | **Partially Built** | Real, working code exists in a separate, non-ORBIC codebase (not part of this repository): local sentence-transformer embeddings + a persistent local vector store retrieve similar historical query/reply pairs (categorized billing / payment / pricing / commission / collections / cancellation-closure); an LLM (tested against both a local and a cloud model) drafts a reply grounded in the retrieved replies, gated by a similarity-confidence check that defers to a human when there's no confident match. Diagram box layout is a structural reference from `rep_assistant_pipeline.pptx` only (no branding copied); no PII, credentials, or raw customer data from that codebase appear in this deck |
| Operational email assistant — merged into the ORBIC application | **Roadmap** | No email-classification, retrieval, or auto-reply code exists inside this repository; the pipeline above runs standalone and has not been connected to a live inbox or wired into the ORBIC app |
| Enrollment / Billing / Payment audits | Built | `app/components/Sidebar.tsx` "Audit" section — three dedicated nav items and pages |
| Commission audit (dedicated surface) | **Roadmap** | No dedicated commission-audit page found beyond the commission report itself |
| Report generation & library | **In Progress** | `app/components/Sidebar.tsx` — `{ label: "Reports", soon: true }` |
| Application branding "ORBIC" / "Energy Intelligence" | — | `app/components/Sidebar.tsx` — literal rendered text in the live app's own UI |
| 140 PUCT-certified REPs operating in ERCOT | — (external market fact) | PUCT Directory of Retail Electric Providers, puc.texas.gov |
| Top 3 incumbents (NRG Energy, Vistra, Direct Energy) hold 63–78% of Texas residential retail share | — (external market fact) | Published market-concentration research on the Texas residential retail market, ScienceDirect |
| 13 states + DC have full residential electricity choice; RESA reports 16.5M residential customers on competitive supply | — (external market fact) | Retail Energy Supply Association (RESA) 2024 Energy Trend Report |
| VertexOne / VXretail — CIS/billing platform, 400+ cloud customers, named live ERCOT REP customers (Graviti Power, Gridmatic Retail, Summer Energy Northeast) | — (external market fact) | VertexOne VXretail product page and customer press releases, vertexone.ai |
| Kraken Technologies (Octopus Energy) — 5-year platform deal with Champion Energy Services, Texas residential (2025) | — (external market fact) | Octopus Energy Group press release |
| ORBIC go-to-market pricing ($2.50/meter/month under 10k meters, $2.00/meter/month at 10k+; target segment 0–50k meters) | — (ORBIC's own stated pricing, not a market fact) | Business decision, not derived from repository code |

## Claims intentionally excluded

The following were deliberately **not** included anywhere in the deck because
they are not verifiable from the repository or documentation:

- Any customer names, customer count, or logos for ORBIC itself.
- Any revenue figures, historical financials, or sales pipeline/forecast
  numbers. (ORBIC's own go-to-market pricing and an explicitly-labeled
  illustrative ARR-per-REP range are shown on Slide 17 — see "Verified
  claims" above — but no revenue forecast, deal count, or pipeline claim is
  made.)
- A market-size figure derived from ORBIC's own unverified estimates.
  (Slide 17's market-structure figures are external, sourced facts — PUCT
  REP counts, published concentration research, RESA — not an invented
  TAM/SAM/SOM.)
- Any specific cost-savings or efficiency percentages (including the source
  flyer's unverified 50% cost-savings claim, which is not used anywhere).
- Any claim that ORBIC has a partnership, integration, or vendor
  relationship with any other company. (Slide 18 names competitors and
  cites their own public deals — e.g. Kraken's deal with Champion Energy
  Services — as sourced competitive intelligence about the market, not as
  a relationship ORBIC has with any of them.)
- Any claim that ORBIC is in production use by a named REP today. (Slide 19
  cites 15 years of production experience without naming the REP, and
  frames it as past-tense proof of maturity, not a live customer
  reference.)
- Forecast accuracy percentages — the checkpoint system's thresholds are
  cited (defined in code), but no historical accuracy track record is
  asserted.
- Condo/apartment-specific handling as a named capability — a targeted
  search of `docs/` for condo/apartment/multi-unit terminology returned no
  matches; the deck instead cites the one verified, related fact (the
  Multi-Meter Portal's Unit Number field) rather than asserting an
  unverified feature.
- Any credentials, internal domains, or internal notification emails
  discovered in `broker/PORTAL.md` or `consumer/PORTAL.md` during research —
  none of that material is repeated here or in any deck file.

## Branding rule

"ORBIC" is used throughout the deck, its notes, and this README. "AmeriPower"
does not appear anywhere in the generated deck content, filenames, or asset
metadata, except as a citation of the pre-existing source documentation
filename `docs/AMERIPOWER_RISK_PORTFOLIO_MD.md` in this README's claims
table — that file was not created for this task and was left untouched per
instructions not to modify files without asking. "EnertSol" is not used as
ORBIC branding anywhere; the two external reference files (an EnertSol
product flyer and a `rep_assistant_pipeline.pptx` diagram) were inspected
only for product-context and diagram-shape inspiration — no company name,
email, website, or domain from either source was copied into this deck.

## Verification performed

- `grep -rni "ameripower|enertsol|Amit@2025|Portal@2024|amit@enertsol|broker.enertsol|consumer.enertsol"` across
  `deck.py`, `diagrams.py`, and this README — only hits are the citation of
  `docs/AMERIPOWER_RISK_PORTFOLIO_MD.md` described above and this README's
  own documentation of that citation; zero credential or domain matches.
- The built `.pptx` was unzipped and every slide/notes XML file was
  text-searched for the same set of terms — **zero matches**.
- A PIL-based word-wrap simulation was run against every `textbox()` call in
  `deck.py` to check for text overflowing its declared box — **no overflow
  issues detected** across all 22 slides.
- Confirmed all 22 slides have non-empty speaker notes and the `.pptx`
  round-trips through `python-pptx` (opens, is editable, correct slide
  count).
- The ERCOT price-forecasting and hedging slides were additionally grepped
  for "trading algorithm" and "speculat*" per the explicit tone instruction
  to frame this section as hedging/risk-management, not trading — **zero
  matches**.
- Every Built/Partially Built/In Progress/Roadmap label in the deck was
  cross-checked against the source file/line in the table above.

## Capabilities intentionally labeled Partially Built, In Progress, or Roadmap

- Broker Portal's own pricing-quote engine — **Roadmap**
- Payments (core app) — **Roadmap**
- Seasonal NOAA forecast layer — **Roadmap**
- Live MTM market-price feeds — **Roadmap**
- ERCOT bid/offer-stack data — **Roadmap**
- DAM price forecasting model (gradient-boosted quantile regression) — **Roadmap**
- DAM/RTM hedging framework (spread forecast, spike-risk score, hedge ratio engine) — **Roadmap**
- Backtested performance of the hedging framework — **Roadmap** (TBD, no numbers presented)
- Shadow Settlements bill-estimate step — **In Progress**
- Shadow Settlements comparison/reconciliation/audit steps — **Roadmap**
- Collections MVO execution and demand-letter/legal-escalation workflow — **Partially Built**
- Collections Agent (autonomous LLM actor) — **Roadmap**
- Operational email assistant — standalone retrieval + drafting pipeline — **Partially Built**
- Operational email assistant — merged into the ORBIC application — **Roadmap**
- Commission audit (dedicated surface) — **Roadmap**
- Report generation & library — **In Progress**
- ERCOT MIS / SMT automation — **Roadmap**
