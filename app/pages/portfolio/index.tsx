import React, { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import api from "../../utils/api";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────────
interface ZoneSummary {
  zone: string;
  customers: number;
  active: number;
  expired: number;
  future: number;
  future_customers?: number;
  fixed: number;
  future_contracts: number;
  lmp: number;
  mtm: number;
  mcp: number;
  mcp2: number;
  unknown_contracts: number;
  total_usage_kwh: number;
  estimated_mw: number;
  earliest_end: string;
  latest_end: string;
}

interface PortfolioSummary {
  total_customers: number;
  active: number;
  expired: number;
  future: number;
  future_customers?: number;
  fixed: number;
  future_contracts: number;
  lmp: number;
  mtm: number;
  mcp: number;
  mcp2: number;
  unknown_contracts: number;
  earliest_end: string;
  latest_end: string;
  zones_count: number;
  unsynced_contracts?: {
    available: boolean;
    total: number;
    by_reason: {
      premise_id_null: number;
      load_profile_null: number;
      end_date_null: number;
      end_date_unparseable: number;
    };
  };
}

interface ExpiryRow {
  period: string;
  zone: string;
  customers_expiring: number;
  estimated_mw: number;
  contract_type: string;
}

function fmt(n: number | null | undefined, decimals = 0) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function PortfolioHome() {
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [zones, setZones] = useState<ZoneSummary[]>([]);
  const [position, setPosition] = useState<ExpiryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    "overview" | "position" | "forecast"
  >("overview");
  const [granularity, setGranularity] = useState<"monthly" | "yearly">(
    "monthly",
  );

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    fetchPosition();
  }, [granularity]);

  async function fetchAll() {
    try {
      const [s, z] = await Promise.all([
        api.get("/portfolio/summary"),
        api.get("/portfolio/by-zone"),
      ]);
      setSummary(Array.isArray(s.data) ? s.data[0] : s.data);
      setZones(z.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function fetchPosition() {
    try {
      const r = await api.get(
        `/portfolio/open-position?granularity=${granularity}`,
      );
      setPosition(r.data.expiry_schedule || []);
    } catch (e) {
      console.error(e);
    }
  }

  // Group position by period
  const positionByPeriod = position.reduce(
    (acc, row) => {
      const p = row.period;
      if (!acc[p]) acc[p] = [];
      acc[p].push(row);
      return acc;
    },
    {} as Record<string, ExpiryRow[]>,
  );

  const periods = Object.keys(positionByPeriod).sort();

  if (loading) {
    return (
      <Layout title="Portfolio">
        <div className="flex items-center justify-center h-64">
          <div className="text-sm" style={{ color: "var(--ct-text-muted)" }}>Loading portfolio...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Portfolio">
      <div className="space-y-6">
        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "var(--ct-text-primary)" }}>Portfolio</h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--ct-text-muted)" }}>
              Open position · Load forecast · Hedge coverage
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/portfolio/hedging">
              <button className="px-4 py-2 text-sm rounded-[var(--r-lg)] transition-colors hover:opacity-90"
                style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}>
                + Add Hedge
              </button>
            </Link>
          </div>
        </div>

        {/* ── Unknown contract type banner ── */}
        {summary && (summary.unknown_contracts ?? 0) > 0 && (
          <div
            className="rounded-[var(--r-lg)] border px-4 py-3 flex items-center gap-3"
            style={{ background: "var(--amber-light-tint,#fffbeb)", borderColor: "var(--amber-light,#d97706)" }}
          >
            <span className="text-sm font-semibold" style={{ color: "var(--amber-light,#d97706)" }}>
              {fmt(summary.unknown_contracts)} contract{summary.unknown_contracts !== 1 ? "s" : ""} with unrecognized type
            </span>
            <span className="text-sm" style={{ color: "var(--ct-text-secondary)" }}>
              — shown as Unknown in the mix below. Re-upload or correct in the database to assign a valid type (Fix, Future, LMP, MTM, MCP, MCP2).
            </span>
          </div>
        )}

        {/* ── Unsynced contract_renewal rows banner ── */}
        {summary?.unsynced_contracts?.available && summary.unsynced_contracts.total > 0 && (
          <div
            className="rounded-[var(--r-lg)] border px-4 py-3 flex flex-col gap-1"
            style={{ background: "var(--amber-light-tint,#fffbeb)", borderColor: "var(--amber-light,#d97706)" }}
          >
            <span className="text-sm font-semibold" style={{ color: "var(--amber-light,#d97706)" }}>
              {fmt(summary.unsynced_contracts.total)} contract record{summary.unsynced_contracts.total !== 1 ? "s" : ""} not shown in Portfolio
            </span>
            <span className="text-sm" style={{ color: "var(--ct-text-secondary)" }}>
              Missing data in the contract list: {fmt(summary.unsynced_contracts.by_reason.premise_id_null)} without an ESI ID,{" "}
              {fmt(summary.unsynced_contracts.by_reason.load_profile_null)} without a load profile,{" "}
              {fmt(summary.unsynced_contracts.by_reason.end_date_null)} without an end date,{" "}
              {fmt(summary.unsynced_contracts.by_reason.end_date_unparseable)} with an end date not in MM/DD/YYYY format.
              Correct the source records to include them.
            </span>
          </div>
        )}

        {/* ── KPI Cards ── */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-[var(--r-lg)] border p-4" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
              <p className="text-xs uppercase tracking-wide" style={{ color: "var(--ct-text-muted)" }}>
                Total Customers
              </p>
              <p className="text-3xl font-bold mt-1" style={{ color: "var(--ct-text-primary)" }}>
                {fmt(summary.total_customers)}
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--ct-text-muted)" }}>
                {fmt(summary.active)} active · {fmt(summary.expired)} expired
              </p>
              {(summary.future_customers ?? 0) > 0 && (
                <p className="text-xs mt-1" style={{ color: "var(--ct-text-muted)" }}>
                  Future contracts (not yet started): {fmt(summary.future_customers)}
                </p>
              )}
            </div>
            <div className="rounded-[var(--r-lg)] border p-4 col-span-1 md:col-span-2" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
              <p className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--ct-text-muted)" }}>
                Contract Mix
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {[
                  { label: "Fix",     val: summary.fixed },
                  { label: "Future",  val: summary.future_contracts },
                  { label: "LMP",     val: summary.lmp },
                  { label: "MTM",     val: summary.mtm },
                  { label: "MCP",     val: summary.mcp },
                  { label: "MCP2",    val: summary.mcp2 },
                  { label: "Unknown", val: summary.unknown_contracts },
                ].filter(t => (t.val ?? 0) > 0).map(t => (
                  <span key={t.label} className="text-sm">
                    <span className="font-bold" style={{ color: "var(--ct-text-primary)" }}>{fmt(t.val)}</span>
                    <span className="ml-1" style={{ color: "var(--ct-text-muted)" }}>{t.label}</span>
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-[var(--r-lg)] border p-4" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
              <p className="text-xs uppercase tracking-wide" style={{ color: "var(--ct-text-muted)" }}>
                First Expiry
              </p>
              <p className="text-xl font-bold mt-1" style={{ color: "var(--amber-light)" }}>
                {fmtDate(summary.earliest_end)}
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--ct-text-muted)" }}>
                Earliest contract end
              </p>
            </div>
            <div className="rounded-[var(--r-lg)] border p-4" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
              <p className="text-xs uppercase tracking-wide" style={{ color: "var(--ct-text-muted)" }}>
                Portfolio Horizon
              </p>
              <p className="text-xl font-bold mt-1" style={{ color: "var(--ct-text-primary)" }}>
                {fmtDate(summary.latest_end)}
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--ct-text-muted)" }}>Latest contract end</p>
            </div>
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="border-b" style={{ borderColor: "var(--ct-border-default)" }}>
          <div className="flex gap-6">
            {(["overview", "position", "forecast"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="pb-3 text-sm font-medium capitalize transition-colors border-b-2 -mb-px"
                style={activeTab === tab
                  ? { borderColor: "var(--accent-light)", color: "var(--accent-light)" }
                  : { borderColor: "transparent", color: "var(--ct-text-muted)" }}
              >
                {tab === "overview"
                  ? "Zone Overview"
                  : tab === "position"
                    ? "Open Position"
                    : "Forecast"}
              </button>
            ))}
          </div>
        </div>

        {/* ── Zone Overview Tab ── */}
        {activeTab === "overview" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {zones.map((z) => (
                <div
                  key={z.zone}
                  className="rounded-[var(--r-lg)] border overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                  style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}
                  onClick={() =>
                    (window.location.href = `/portfolio/customers?zone=${z.zone}`)
                  }
                >
                  <div className="px-4 py-3" style={{ background: "var(--accent-light)" }}>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-lg" style={{ color: "var(--accent-light-on-solid)" }}>
                        {z.zone}
                      </span>
                      <span className="text-sm" style={{ color: "var(--accent-light-on-solid)", opacity: 0.8 }}>
                        {fmt(z.customers)} customers
                      </span>
                    </div>
                  </div>
                  <div className="p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span style={{ color: "var(--ct-text-muted)" }}>Active</span>
                      <span className="font-medium" style={{ color: "var(--ct-text-secondary)" }}>
                        {fmt(z.active)}
                      </span>
                    </div>
                    {(z.future_customers ?? 0) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span style={{ color: "var(--ct-text-muted)" }}>Future (not yet started)</span>
                        <span className="font-medium" style={{ color: "var(--ct-text-secondary)" }}>
                          {fmt(z.future_customers)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span style={{ color: "var(--ct-text-muted)" }}>Fixed</span>
                      <span className="font-medium" style={{ color: "var(--ct-text-secondary)" }}>
                        {fmt(z.fixed)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span style={{ color: "var(--ct-text-muted)" }}>Avg Usage</span>
                      <span className="font-medium" style={{ color: "var(--ct-text-secondary)" }}>
                        {fmt(
                          Number(z.total_usage_kwh) / Math.max(z.customers, 1),
                          0,
                        )}{" "}
                        kWh
                      </span>
                    </div>
                    <div className="pt-2 border-t" style={{ borderColor: "var(--ct-border-subtle)" }}>
                      <div className="flex justify-between text-xs">
                        <span style={{ color: "var(--ct-text-muted)" }}>Last expiry</span>
                        <span style={{ color: "var(--ct-text-secondary)" }}>
                          {fmtDate(z.latest_end)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Zone bar chart */}
            <div className="rounded-[var(--r-lg)] border p-6" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
              <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--ct-text-primary)" }}>
                Customer Distribution by Zone
              </h3>
              <div className="space-y-3">
                {zones.map((z) => {
                  const pct = summary && Number(summary.total_customers) > 0
                    ? Math.round(
                        (z.customers / Number(summary.total_customers)) * 100,
                      )
                    : 0;
                  return (
                    <div key={z.zone} className="flex items-center gap-3">
                      <span className="text-xs font-mono font-bold w-14" style={{ color: "var(--ct-text-secondary)" }}>
                        {z.zone}
                      </span>
                      <div className="flex-1 rounded-full h-5 overflow-hidden" style={{ background: "var(--ct-surface-hover)" }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, background: "var(--accent-light)" }}
                        />
                      </div>
                      <span className="text-xs w-20 text-right" style={{ color: "var(--ct-text-muted)" }}>
                        {fmt(z.customers)} ({pct}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Open Position Tab ── */}
        {activeTab === "position" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm" style={{ color: "var(--ct-text-secondary)" }}>
                Contracts expiring by period — your open position to hedge
              </p>
              <div className="flex gap-2">
                {(["monthly", "yearly"] as const).map((g) => (
                  <button
                    key={g}
                    onClick={() => setGranularity(g)}
                    className="px-3 py-1.5 text-xs rounded-[var(--r-lg)] capitalize transition-colors"
                    style={granularity === g
                      ? { background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }
                      : { background: "var(--ct-surface)", border: "1px solid var(--ct-border-default)", color: "var(--ct-text-secondary)" }}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[var(--r-lg)] border overflow-hidden" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}>
                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wide font-medium" style={{ color: "var(--ct-text-muted)" }}>
                      Period
                    </th>
                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wide font-medium" style={{ color: "var(--ct-text-muted)" }}>
                      Zone
                    </th>
                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wide font-medium" style={{ color: "var(--ct-text-muted)" }}>
                      Type
                    </th>
                    <th className="text-right px-4 py-3 text-xs uppercase tracking-wide font-medium" style={{ color: "var(--ct-text-muted)" }}>
                      Customers
                    </th>
                    <th className="text-right px-4 py-3 text-xs uppercase tracking-wide font-medium" style={{ color: "var(--ct-text-muted)" }}>
                      Est. MW
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: "var(--ct-border-subtle)" }}>
                  {periods.map((period) =>
                    positionByPeriod[period].map((row, i) => (
                      <tr key={`${period}-${i}`} className="hover:bg-[var(--ct-surface-hover)]">
                        {i === 0 && (
                          <td
                            className="px-4 py-3 font-mono text-xs font-semibold"
                            style={{ color: "var(--ct-text-primary)" }}
                            rowSpan={positionByPeriod[period].length}
                          >
                            {period}
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <span className="text-xs font-medium px-2 py-0.5 rounded-[var(--r-sm)]"
                            style={{ background: "var(--accent-light-tint)", color: "var(--accent-light)" }}>
                            {row.zone}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: "var(--ct-text-muted)" }}>
                          {row.contract_type}
                        </td>
                        <td className="px-4 py-3 text-right" style={{ color: "var(--ct-text-secondary)" }}>
                          {fmt(row.customers_expiring)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-medium" style={{ color: "var(--ct-text-primary)" }}>
                          {fmt(row.estimated_mw, 1)} MW
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
              {periods.length === 0 && (
                <div className="text-center py-12 text-sm" style={{ color: "var(--ct-text-muted)" }}>
                  No open position data available
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Forecast Tab ── */}
        {activeTab === "forecast" && (
          <div className="rounded-[var(--r-lg)] border p-6" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold" style={{ color: "var(--ct-text-primary)" }}>
                Load Forecast by Zone
              </h3>
              <div className="flex gap-2">
                <Link href="/portfolio/forecast">
                  <button className="px-3 py-1.5 text-xs rounded-[var(--r-lg)] hover:opacity-90"
                    style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}>
                    Full Forecast →
                  </button>
                </Link>
              </div>
            </div>
            <p className="text-sm" style={{ color: "var(--ct-text-muted)" }}>
              Detailed 5-method forecast available in the Forecast module.
              Includes day-ahead, weekly, monthly and long-term views.
            </p>
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                "Base Pattern",
                "Weather Adjusted",
                "ERCOT Bias",
                "Analog Day",
              ].map((m) => (
                <div
                  key={m}
                  className="rounded-[var(--r-md)] border p-3 text-center"
                  style={{ borderColor: "var(--ct-border-default)" }}
                >
                  <p className="text-xs font-medium" style={{ color: "var(--ct-text-secondary)" }}>{m}</p>
                  <p className="text-xs mt-1" style={{ color: "var(--ct-text-muted)" }}>Available</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
