# ORBIC Investor Presentation

`ORBIC_Investor_Presentation.pptx` — a 12-slide, fully editable investor deck for
**ORBIC**, positioned as the energy intelligence engine for retail energy
providers (REPs) operating in ERCOT.

## Files

| Path | Purpose |
|---|---|
| `ORBIC_Investor_Presentation.pptx` | The deliverable — 12 slides, native editable text/shapes/tables, dark energy-command-center theme, speaker notes on every slide. |
| `deck.py` | Assembles the PPTX from scratch using `python-pptx`. Run after editing copy/layout. |
| `diagrams.py` | Generates every diagram PNG in `assets/` using Pillow (PIL). Run after changing diagram content. |
| `assets/` | The 7 diagram PNGs actually embedded in the deck (see table below). No screenshots — see "Why diagrams, not screenshots" below. |

## Regenerating the deck

```bash
cd docs/investor_deck
pip install python-pptx        # Pillow/matplotlib already in the repo's environment
python diagrams.py             # writes assets/*.png
python deck.py                 # writes ORBIC_Investor_Presentation.pptx
```

Both scripts are idempotent — safe to re-run any time. Neither script touches
the application database, source app code, or any file outside
`docs/investor_deck/`.

## Why diagrams, not screenshots

The original brief asked for verified application screenshots. Capturing them
required either real login credentials or writing a bootstrap admin user into
the live tenant database (the only code path that creates a usable login —
`api/scripts/provision_tenant.py`). No demo/seed credentials exist anywhere in
the repo. Per explicit user direction, this was resolved by **skipping live
screenshots entirely** in favor of clean diagrams built directly from the
verified component code (`Sidebar.tsx` nav structure, table schemas, router
signatures) — no database writes, no login attempts, no live app access.

## Slide map

| # | Title | Key visual |
|---|---|---|
| 1 | Cover — ORBIC | `hero_graphic.png` |
| 2 | The retail energy industry problem | native cards |
| 3 | ORBIC's solution | `lifecycle_ring.png` |
| 4 | Why ORBIC is different | native comparison rows |
| 5 | ORBIC application architecture | `architecture_diagram.png` + verified stats |
| 6 | Customer and contract lifecycle | `contract_lifecycle.png` |
| 7 | Portfolio and risk intelligence | `risk_composite.png` + module cards |
| 8 | AI operating layer | `ai_agent_diagram.png` |
| 9 | Forecasting and monitoring advantage | `forecast_layers.png` |
| 10 | Current product maturity | native status table |
| 11 | Target customers and business model | native two-column layout |
| 12 | Long-term vision and investment opportunity | `hero_graphic.png` + pillar cards |

## Verified claims and their sources

Every capability in the deck is labeled **Built**, **Operational**,
**Partially Built**, or **Roadmap**. Nothing is claimed as complete unless a
specific file confirms it. No customer names, revenue, market size, savings
figures, accuracy percentages, partnerships, or production-usage claims are
made anywhere in the deck — none of those are verified, so none are asserted.

| Claim used in deck | Status shown | Source |
|---|---|---|
| Layer 1 — DNA baseline forecast (12-yr ERCOT history) | Built | `docs/AMERIPOWER_RISK_PORTFOLIO_MD.md` "Forecast Engine — Layer Cake"; `ercot_load_history` table (~98,591 rows, 2015–2026) |
| Layer 2 — ERCOT growth factors | Built | Same doc, `forecast_growth_factors` table |
| Layer 3 — Seasonal NOAA (El Niño/La Niña) adjustment | **Roadmap** | Same doc: "⏳ ... to build"; `forecast_modifiers` table comment "Layer 3 — to build" |
| Layer 4 — 7-Day ERCOT LFC override, wired into live forecast path | Built | `api/controllers/portfolio.py`, `get_forecast_data()` — literal code comment `# Step 4b: Layer 4 — 7-Day Override from ercot_lfc_history`; consumed by the Position Screen |
| 4 nightly self-healing forecast checkpoints (7-Day Mirror Test, Historical Backtest, Energy Balance Sanity, Portfolio Ratio Check) | Built | `api/monitoring/checkpoint_runner.py` (`CHECKPOINT_NAMES`, thresholds, `run_checkpoint()`); surfaced via `api/routers/monitoring.py` and `app/pages/monitoring/checkpoints.tsx` |
| Manual Mark-to-Market (MTM) | Built | `docs/AMERIPOWER_RISK_PORTFOLIO_MD.md` MTM Engine section: "source: MANUAL now, API endpoint ready for future price feeds"; `mtm_results` table |
| Live MTM market-price feeds (CME DataMine, ICE, Bloomberg) | **Roadmap** | Same doc, explicitly listed as pending/future; no live feed integration exists in code |
| Risk Assessment Dashboard, 4-factor weighted (Position 40% / Price 25% / Customer 20% / Weather 15%) | Built | `api/controllers/risk.py` docstring and `STATUS_SCORE`/weighting logic; `api/routers/risk.py`; `app/pages/portfolio/risk.tsx`; confirmed via `git show --stat 22c9fbd` |
| Enrollment Engine — 6 contract types, MasterRoll generation (128-column XLSX), active-contract guard rules | Built | `api/routers/enrollment_engine.py`; `docs/ENROLLMENT_RULES.md` |
| Activation writes `contract_renewal` as single source of truth | Built | `api/routers/enrollment_engine.py`, `POST /activate/{customer_id}` |
| Enrollment-time county/exemption capture | **Roadmap** | `docs/BILLING_ENGINE.md` §5 "Open Items (not yet built)" |
| Billing Engine — EDI 867/810 ingestion → contract matching → tax → invoice | Built | `docs/BILLING_ENGINE.md`: "Core billing pipeline ... is built and verified" |
| Settlement reconciliation (3-way match) | **Roadmap** | `docs/AMERIPOWER_RISK_PORTFOLIO_MD.md` "Pending (In Order of Priority)" list |
| Orbi AI agent — tool-calling agent (GPT-4o-mini), 12 live tools against production FastAPI endpoints | Built | `app/pages/api/chat.ts` — full tool schema list, `executeTool()` implementation, grounding system prompt ("Never invent data — always call a tool") |
| DB-per-tenant multi-tenancy (one database + one app instance per REP) | Built | `docs/BILLING_ENGINE.md`; `api/scripts/provision_tenant.py` |
| Architecture stats: 109 frontend pages, 45 API routers, 39 controllers, 38 DB migrations | Built (counted directly) | `find app/pages -name "*.tsx" \| grep -v "/api/"`, `ls api/routers/*.py`, `ls api/controllers/*.py`, `ls api/migrations/*.sql` |
| Application branding "ORBIC" / "Energy Intelligence" | — | `app/components/Sidebar.tsx` — literal rendered text in the live app's own UI |

## Claims intentionally excluded

The following were deliberately **not** included anywhere in the deck because
they are not verifiable from the repository or documentation:

- Any customer names, customer count, or logos.
- Any revenue figures, pricing, or unit economics.
- Any market-size (TAM/SAM/SOM) figures.
- Any specific cost-savings or efficiency percentages attributed to ORBIC.
- Any partnership, integration, or vendor-relationship claims.
- Any claim that ORBIC is in production use by a named REP.
- Forecast accuracy percentages — the checkpoint system's GREEN/YELLOW/RED
  thresholds are cited (they are defined in code), but no historical accuracy
  track record is asserted since no such backtest results were reviewed.

Slide 11 ("Target customers and business model") deliberately describes *who*
ORBIC serves and *how* it is delivered (multi-tenant, DB-per-tenant, scripted
provisioning) rather than asserting any revenue model, pricing, or existing
customer base.

## Branding rule

"ORBIC" is used throughout the deck, its notes, and this README. "AmeriPower"
does not appear anywhere in the generated deck content, filenames, or asset
metadata. The one incidental occurrence in this repository is the pre-existing
source documentation filename `docs/AMERIPOWER_RISK_PORTFOLIO_MD.md`, which
`deck.py` cites in a code comment as a data source — that file was not
created for this task and was left untouched per instructions not to modify
files without asking.

## Verification performed

- `grep -rni ameripower` across `docs/investor_deck/` (source `.py`/`.md`
  files) — only hit is the citation described above.
- The built `.pptx` was unzipped and its full internal XML text-searched for
  "ameripower" — **zero matches**.
- Every PNG in `assets/` was checked for embedded metadata — none present.
- Every Built/Operational/Roadmap label in the deck was cross-checked against
  the source file/line in the table above.
