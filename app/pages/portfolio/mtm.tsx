import React, { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import api from "../../utils/api";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────────
interface MarketPrice {
  id: number;
  price_date: string;
  hour_ending: number;
  location: string;
  price: number;
  source: string;
  loaded_at: string;
}

interface MtmZoneRow {
  zone: string;
  deals: number;
  volume_mw: number;
  mtm_value: number;
}

interface MtmSummary {
  calc_date: string | null;
  total_deals: number;
  total_mtm_value: number;
  by_zone: MtmZoneRow[];
}

interface MtmDeal {
  id: number;
  calc_date: string;
  deal_number: string;
  instrument_type: string;
  location: string;
  zone: string;
  volume_mw: number;
  deal_price: number;
  market_price: number | null;
  basis: number;
  gas_price_current: number | null;
  mtm_value: number;
  delivery_start: string;
  delivery_end: string;
}

interface CalcResult {
  calc_date: string;
  deals_processed: number;
  deals_skipped: number;
  skipped_deals: string[];
  total_mtm_value: number;
}

// ── Constants ──────────────────────────────────────────────────────────────────
const ZONES = ["HOUSTON", "NORTH", "SOUTH", "WEST"];
const LOCATIONS = [
  "HB_HOUSTON",
  "HB_NORTH",
  "HB_SOUTH",
  "HB_WEST",
  "LZ_HOUSTON",
  "LZ_NORTH",
  "LZ_SOUTH",
  "LZ_WEST",
  "HH",
];
const HOURS = [{ value: 0, label: "Flat (all-day)" }].concat(
  Array.from({ length: 24 }, (_, i) => ({ value: i + 1, label: `HE${String(i + 1).padStart(2, "0")}` })),
);

function today() {
  return new Date().toISOString().split("T")[0];
}
function fmtPrice(n: number | null | undefined) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtVol(n: number | null | undefined) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function mtmColor(n: number) {
  if (n > 0) return "var(--success-light)";
  if (n < 0) return "var(--danger-light)";
  return "var(--ct-text-secondary)";
}

const EMPTY_PRICE_FORM = {
  location: "LZ_HOUSTON",
  hour_ending: "0",
  price: "",
};

// ── Component ──────────────────────────────────────────────────────────────────
export default function MtmPage() {
  // Market Prices
  const [priceDate, setPriceDate] = useState(today());
  const [prices, setPrices] = useState<MarketPrice[]>([]);
  const [priceForm, setPriceForm] = useState({ ...EMPTY_PRICE_FORM });
  const [savingPrice, setSavingPrice] = useState(false);
  const [priceError, setPriceError] = useState("");
  const [loadingPrices, setLoadingPrices] = useState(false);

  // MTM Calculation
  const [calcDate, setCalcDate] = useState(today());
  const [calculating, setCalculating] = useState(false);
  const [calcResult, setCalcResult] = useState<CalcResult | null>(null);
  const [calcError, setCalcError] = useState("");

  // MTM Results
  const [summary, setSummary] = useState<MtmSummary | null>(null);
  const [deals, setDeals] = useState<MtmDeal[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);

  useEffect(() => {
    fetchPrices(priceDate);
  }, [priceDate]);

  useEffect(() => {
    fetchResults();
  }, []);

  async function fetchPrices(d: string) {
    setLoadingPrices(true);
    try {
      const r = await api.get(`/mtm/prices?price_date=${d}`);
      setPrices(r.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingPrices(false);
    }
  }

  async function fetchResults(calc_date?: string) {
    setLoadingResults(true);
    try {
      const s = await api.get("/mtm/summary");
      setSummary(s.data);
      const useDate = calc_date || s.data.calc_date;
      if (useDate) {
        const d = await api.get(`/mtm/by-deal?calc_date=${useDate}`);
        setDeals(d.data);
      } else {
        setDeals([]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingResults(false);
    }
  }

  async function handleAddPrice() {
    setPriceError("");
    if (!priceForm.price || parseFloat(priceForm.price) <= 0) {
      setPriceError("Price must be greater than 0");
      return;
    }
    setSavingPrice(true);
    try {
      await api.post("/mtm/prices/upload", [
        {
          price_date: priceDate,
          hour_ending: parseInt(priceForm.hour_ending, 10),
          location: priceForm.location,
          price: parseFloat(priceForm.price),
          source: "MANUAL",
        },
      ]);
      setPriceForm({ ...EMPTY_PRICE_FORM, location: priceForm.location });
      await fetchPrices(priceDate);
    } catch (e: any) {
      setPriceError(e?.response?.data?.detail || "Failed to save price");
    } finally {
      setSavingPrice(false);
    }
  }

  async function handleRunMtm() {
    setCalcError("");
    setCalculating(true);
    try {
      const r = await api.post("/mtm/calculate", { price_date: calcDate });
      setCalcResult(r.data);
      await fetchResults(calcDate);
    } catch (e: any) {
      setCalcError(e?.response?.data?.detail || "Failed to run MTM");
    } finally {
      setCalculating(false);
    }
  }

  const totalMtm = summary?.total_mtm_value ?? 0;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <Layout title="Mark-to-Market">
      <div className="space-y-6">
        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold" style={{ color: "var(--ct-text-primary)" }}>
              Mark-to-Market
            </h1>
            <p className="text-xs mt-0.5" style={{ color: "var(--ct-text-muted)" }}>
              Hedge book valuation against current market prices
            </p>
          </div>
          <Link href="/portfolio/hedging">
            <button
              className="px-3 py-2 text-sm border rounded-[var(--r-lg)] hover:bg-[var(--ct-surface-hover)]"
              style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)", color: "var(--ct-text-secondary)" }}
            >
              ← Hedge Book
            </button>
          </Link>
        </div>

        {/* ── A. Market Prices ── */}
        <div className="rounded-[var(--r-lg)] border p-5 space-y-4" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
          <h2 className="text-sm font-bold" style={{ color: "var(--ct-text-primary)" }}>
            Market Prices
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ct-text-secondary)" }}>
                Date
              </label>
              <input
                type="date"
                value={priceDate}
                onChange={(e) => setPriceDate(e.target.value)}
                className="mt-1 w-full border rounded-[var(--r-lg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-light)]"
                style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ct-text-secondary)" }}>
                Location
              </label>
              <select
                value={priceForm.location}
                onChange={(e) => setPriceForm((f) => ({ ...f, location: e.target.value }))}
                className="mt-1 w-full border rounded-[var(--r-lg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-light)]"
                style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
              >
                {LOCATIONS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ct-text-secondary)" }}>
                Hour
              </label>
              <select
                value={priceForm.hour_ending}
                onChange={(e) => setPriceForm((f) => ({ ...f, hour_ending: e.target.value }))}
                className="mt-1 w-full border rounded-[var(--r-lg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-light)]"
                style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
              >
                {HOURS.map((h) => (
                  <option key={h.value} value={h.value}>
                    {h.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ct-text-secondary)" }}>
                Price {priceForm.location === "HH" ? "($/MMBtu)" : "($/MWh)"}
              </label>
              <input
                type="number"
                value={priceForm.price}
                onChange={(e) => setPriceForm((f) => ({ ...f, price: e.target.value }))}
                placeholder="0.00"
                step="0.01"
                min="0"
                onWheel={(e) => e.currentTarget.blur()}
                className="mt-1 w-full border rounded-[var(--r-lg)] px-3 py-2 text-sm font-mono outline-none focus:border-[var(--accent-light)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
              />
            </div>

            <div>
              <button
                onClick={handleAddPrice}
                disabled={savingPrice}
                className="w-full px-4 py-2 text-sm rounded-[var(--r-lg)] disabled:opacity-50 font-semibold transition-colors hover:opacity-90"
                style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
              >
                {savingPrice ? "Saving..." : "Add Price"}
              </button>
            </div>
          </div>

          {priceError && (
            <p className="text-xs px-3 py-1.5 rounded-[var(--r-lg)] border" style={{ color: "var(--danger-light)", background: "var(--danger-light-tint)", borderColor: "var(--danger-light-tint)" }}>
              ⚠ {priceError}
            </p>
          )}

          <div className="rounded-[var(--r-lg)] border overflow-hidden" style={{ borderColor: "var(--ct-border-default)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}>
                  <th className="text-left px-4 py-2 text-xs uppercase tracking-wide font-medium" style={{ color: "var(--ct-text-muted)" }}>Location</th>
                  <th className="text-left px-4 py-2 text-xs uppercase tracking-wide font-medium" style={{ color: "var(--ct-text-muted)" }}>Hour</th>
                  <th className="text-right px-4 py-2 text-xs uppercase tracking-wide font-medium" style={{ color: "var(--ct-text-muted)" }}>Price</th>
                  <th className="text-left px-4 py-2 text-xs uppercase tracking-wide font-medium" style={{ color: "var(--ct-text-muted)" }}>Source</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: "var(--ct-border-subtle)" }}>
                {loadingPrices ? (
                  <tr>
                    <td colSpan={4} className="text-center py-6 text-sm" style={{ color: "var(--ct-text-muted)" }}>Loading...</td>
                  </tr>
                ) : prices.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-6 text-sm" style={{ color: "var(--ct-text-muted)" }}>No prices entered for this date</td>
                  </tr>
                ) : (
                  prices.map((p) => (
                    <tr key={p.id} className="hover:bg-[var(--ct-surface-hover)]">
                      <td className="px-4 py-2 text-xs font-medium" style={{ color: "var(--ct-text-primary)" }}>{p.location}</td>
                      <td className="px-4 py-2 text-xs" style={{ color: "var(--ct-text-secondary)" }}>
                        {p.hour_ending === 0 ? "Flat" : `HE${String(p.hour_ending).padStart(2, "0")}`}
                      </td>
                      <td className="px-4 py-2 text-right font-mono" style={{ color: "var(--ct-text-primary)" }}>${fmtPrice(p.price)}</td>
                      <td className="px-4 py-2 text-xs" style={{ color: "var(--ct-text-muted)" }}>{p.source}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── B. MTM Calculation ── */}
        <div className="rounded-[var(--r-lg)] border p-5 space-y-4" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
          <h2 className="text-sm font-bold" style={{ color: "var(--ct-text-primary)" }}>
            MTM Calculation
          </h2>

          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ct-text-secondary)" }}>
                Calc Date
              </label>
              <input
                type="date"
                value={calcDate}
                onChange={(e) => setCalcDate(e.target.value)}
                className="mt-1 border rounded-[var(--r-lg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-light)]"
                style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
              />
            </div>
            <button
              onClick={handleRunMtm}
              disabled={calculating}
              className="px-5 py-2 text-sm rounded-[var(--r-lg)] disabled:opacity-50 font-semibold transition-colors hover:opacity-90"
              style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
            >
              {calculating ? "Running..." : "Run MTM"}
            </button>

            {summary?.calc_date && (
              <div className="text-xs" style={{ color: "var(--ct-text-muted)" }}>
                Last calculated: <span style={{ color: "var(--ct-text-primary)" }}>{fmtDate(summary.calc_date)}</span>
                {" · "}Total MTM:{" "}
                <span className="font-mono font-bold" style={{ color: mtmColor(totalMtm) }}>
                  ${fmtPrice(totalMtm)}
                </span>
              </div>
            )}
          </div>

          {calcError && (
            <p className="text-xs px-3 py-1.5 rounded-[var(--r-lg)] border" style={{ color: "var(--danger-light)", background: "var(--danger-light-tint)", borderColor: "var(--danger-light-tint)" }}>
              ⚠ {calcError}
            </p>
          )}

          {calcResult && (
            <div className="rounded-[var(--r-lg)] border px-4 py-3 text-xs space-y-1" style={{ background: "var(--accent-light-tint)", borderColor: "var(--accent-light-tint)" }}>
              <div style={{ color: "var(--accent-light)" }}>
                Processed {calcResult.deals_processed} deal{calcResult.deals_processed === 1 ? "" : "s"} for {fmtDate(calcResult.calc_date)}
                {calcResult.deals_skipped > 0 && ` · ${calcResult.deals_skipped} skipped (no market price)`}
              </div>
              {calcResult.skipped_deals.length > 0 && (
                <div style={{ color: "var(--ct-text-muted)" }}>Skipped: {calcResult.skipped_deals.join(", ")}</div>
              )}
            </div>
          )}
        </div>

        {/* ── C. MTM Results ── */}
        <div className="space-y-4">
          {/* Summary by zone */}
          <div className="rounded-[var(--r-lg)] border overflow-hidden" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
            <div className="px-4 py-3 border-b" style={{ borderColor: "var(--ct-border-subtle)" }}>
              <h3 className="text-sm font-semibold" style={{ color: "var(--ct-text-primary)" }}>MTM Summary by Zone</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-subtle)" }}>
                  <th className="text-left px-4 py-2 text-xs uppercase font-medium" style={{ color: "var(--ct-text-muted)" }}>Zone</th>
                  <th className="text-right px-4 py-2 text-xs uppercase font-medium" style={{ color: "var(--ct-text-muted)" }}>Deals</th>
                  <th className="text-right px-4 py-2 text-xs uppercase font-medium" style={{ color: "var(--ct-text-muted)" }}>Volume MW</th>
                  <th className="text-right px-4 py-2 text-xs uppercase font-medium" style={{ color: "var(--ct-text-muted)" }}>MTM Value</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: "var(--ct-border-subtle)" }}>
                {loadingResults ? (
                  <tr>
                    <td colSpan={4} className="text-center py-8 text-sm" style={{ color: "var(--ct-text-muted)" }}>Loading...</td>
                  </tr>
                ) : !summary || summary.by_zone.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-8 text-sm" style={{ color: "var(--ct-text-muted)" }}>No MTM results yet — run a calculation above</td>
                  </tr>
                ) : (
                  <>
                    {summary.by_zone.map((r) => (
                      <tr key={r.zone} className="hover:bg-[var(--ct-surface-hover)]">
                        <td className="px-4 py-2">
                          <span className="text-xs font-medium px-2 py-0.5 rounded-[var(--r-sm)]" style={{ background: "var(--accent-light-tint)", color: "var(--accent-light)" }}>
                            {r.zone}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right" style={{ color: "var(--ct-text-secondary)" }}>{r.deals}</td>
                        <td className="px-4 py-2 text-right font-mono" style={{ color: "var(--ct-text-primary)" }}>{fmtVol(r.volume_mw)}</td>
                        <td className="px-4 py-2 text-right font-mono font-medium" style={{ color: mtmColor(r.mtm_value) }}>
                          ${fmtPrice(r.mtm_value)}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2" style={{ borderColor: "var(--ct-border-default)" }}>
                      <td className="px-4 py-2 text-xs font-bold uppercase" style={{ color: "var(--ct-text-primary)" }}>Total</td>
                      <td className="px-4 py-2 text-right font-bold" style={{ color: "var(--ct-text-primary)" }}>{summary.total_deals}</td>
                      <td className="px-4 py-2 text-right"></td>
                      <td className="px-4 py-2 text-right font-mono font-bold" style={{ color: mtmColor(summary.total_mtm_value) }}>
                        ${fmtPrice(summary.total_mtm_value)}
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>

          {/* By deal */}
          <div className="rounded-[var(--r-lg)] border overflow-hidden" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
            <div className="px-4 py-3 border-b" style={{ borderColor: "var(--ct-border-subtle)" }}>
              <h3 className="text-sm font-semibold" style={{ color: "var(--ct-text-primary)" }}>MTM by Deal</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-subtle)" }}>
                    <th className="text-left px-4 py-2 text-xs uppercase font-medium" style={{ color: "var(--ct-text-muted)" }}>Deal #</th>
                    <th className="text-left px-4 py-2 text-xs uppercase font-medium" style={{ color: "var(--ct-text-muted)" }}>Type</th>
                    <th className="text-left px-4 py-2 text-xs uppercase font-medium" style={{ color: "var(--ct-text-muted)" }}>Location</th>
                    <th className="text-right px-4 py-2 text-xs uppercase font-medium" style={{ color: "var(--ct-text-muted)" }}>Volume MW</th>
                    <th className="text-right px-4 py-2 text-xs uppercase font-medium" style={{ color: "var(--ct-text-muted)" }}>Deal Price</th>
                    <th className="text-right px-4 py-2 text-xs uppercase font-medium" style={{ color: "var(--ct-text-muted)" }}>Market Price</th>
                    <th className="text-right px-4 py-2 text-xs uppercase font-medium" style={{ color: "var(--ct-text-muted)" }}>Basis</th>
                    <th className="text-right px-4 py-2 text-xs uppercase font-medium" style={{ color: "var(--ct-text-muted)" }}>Gas Price</th>
                    <th className="text-right px-4 py-2 text-xs uppercase font-medium" style={{ color: "var(--ct-text-muted)" }}>MTM Value</th>
                    <th className="text-left px-4 py-2 text-xs uppercase font-medium" style={{ color: "var(--ct-text-muted)" }}>Period</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: "var(--ct-border-subtle)" }}>
                  {loadingResults ? (
                    <tr>
                      <td colSpan={10} className="text-center py-8 text-sm" style={{ color: "var(--ct-text-muted)" }}>Loading...</td>
                    </tr>
                  ) : deals.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="text-center py-8 text-sm" style={{ color: "var(--ct-text-muted)" }}>No MTM results yet — run a calculation above</td>
                    </tr>
                  ) : (
                    <>
                      {deals.map((d) => (
                        <tr key={d.id} className="hover:bg-[var(--ct-surface-hover)]">
                          <td className="px-4 py-2 font-mono text-xs font-semibold" style={{ color: "var(--ct-text-primary)" }}>{d.deal_number}</td>
                          <td className="px-4 py-2 text-xs" style={{ color: "var(--ct-text-muted)" }}>{d.instrument_type?.replace("_", " ")}</td>
                          <td className="px-4 py-2 text-xs" style={{ color: "var(--ct-text-muted)" }}>{d.location || "—"}</td>
                          <td className="px-4 py-2 text-right font-mono" style={{ color: "var(--ct-text-primary)" }}>{fmtVol(d.volume_mw)}</td>
                          <td className="px-4 py-2 text-right font-mono" style={{ color: "var(--ct-text-primary)" }}>${fmtPrice(d.deal_price)}</td>
                          <td className="px-4 py-2 text-right font-mono" style={{ color: "var(--ct-text-primary)" }}>{d.market_price != null ? `$${fmtPrice(d.market_price)}` : "—"}</td>
                          <td className="px-4 py-2 text-right font-mono" style={{ color: "var(--ct-text-secondary)" }}>{d.basis ? `$${fmtPrice(d.basis)}` : "—"}</td>
                          <td className="px-4 py-2 text-right font-mono" style={{ color: "var(--ct-text-secondary)" }}>{d.gas_price_current != null ? `$${fmtPrice(d.gas_price_current)}` : "—"}</td>
                          <td className="px-4 py-2 text-right font-mono font-semibold" style={{ color: mtmColor(d.mtm_value) }}>${fmtPrice(d.mtm_value)}</td>
                          <td className="px-4 py-2 text-xs" style={{ color: "var(--ct-text-muted)" }}>
                            {fmtDate(d.delivery_start)} → {fmtDate(d.delivery_end)}
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t-2" style={{ borderColor: "var(--ct-border-default)" }}>
                        <td colSpan={8} className="px-4 py-2 text-xs font-bold uppercase text-right" style={{ color: "var(--ct-text-primary)" }}>Total MTM</td>
                        <td className="px-4 py-2 text-right font-mono font-bold" style={{ color: mtmColor(summary?.total_mtm_value ?? 0) }}>
                          ${fmtPrice(summary?.total_mtm_value ?? 0)}
                        </td>
                        <td></td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
