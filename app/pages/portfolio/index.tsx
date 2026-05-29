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
  fixed: number;
  lmp: number;
  total_usage_kwh: number;
  estimated_mw: number;
  earliest_end: string;
  latest_end: string;
}

interface PortfolioSummary {
  total_customers: number;
  active: number;
  expired: number;
  fixed: number;
  lmp: number;
  mtm: number;
  earliest_end: string;
  latest_end: string;
  zones_count: number;
}

interface ExpiryRow {
  period: string;
  zone: string;
  customers_expiring: number;
  estimated_mw: number;
  contract_type: string;
}

const ZONE_COLORS: Record<string, string> = {
  NCENT: "bg-blue-600",
  COAST: "bg-emerald-600",
  SCENT: "bg-violet-600",
  SOUTH: "bg-orange-500",
  NORTH: "bg-cyan-600",
  EAST: "bg-rose-500",
  FWEST: "bg-amber-500",
  WEST: "bg-teal-500",
};

const ZONE_LIGHT: Record<string, string> = {
  NCENT: "bg-blue-50 text-blue-700 border-blue-200",
  COAST: "bg-emerald-50 text-emerald-700 border-emerald-200",
  SCENT: "bg-violet-50 text-violet-700 border-violet-200",
  SOUTH: "bg-orange-50 text-orange-700 border-orange-200",
  NORTH: "bg-cyan-50 text-cyan-700 border-cyan-200",
  EAST: "bg-rose-50 text-rose-700 border-rose-200",
  FWEST: "bg-amber-50 text-amber-700 border-amber-200",
  WEST: "bg-teal-50 text-teal-700 border-teal-200",
};

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
          <div className="text-slate-400 text-sm">Loading portfolio...</div>
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
            <h1 className="text-2xl font-bold text-slate-900">Portfolio</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Open position · Load forecast · Hedge coverage
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/portfolio/customers">
              <button className="px-4 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors">
                View Customers
              </button>
            </Link>
            <Link href="/portfolio/hedging">
              <button className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
                + Add Hedge
              </button>
            </Link>
          </div>
        </div>

        {/* ── KPI Cards ── */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide">
                Total Customers
              </p>
              <p className="text-3xl font-bold text-slate-900 mt-1">
                {fmt(summary.total_customers)}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {fmt(summary.active)} active · {fmt(summary.expired)} expired
              </p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide">
                Contract Mix
              </p>
              <p className="text-3xl font-bold text-slate-900 mt-1">
                {fmt(summary.fixed)}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Fixed · {fmt(summary.lmp)} LMP · {fmt(summary.mtm)} MTM
              </p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide">
                First Expiry
              </p>
              <p className="text-xl font-bold text-amber-600 mt-1">
                {fmtDate(summary.earliest_end)}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Earliest contract end
              </p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide">
                Portfolio Horizon
              </p>
              <p className="text-xl font-bold text-slate-900 mt-1">
                {fmtDate(summary.latest_end)}
              </p>
              <p className="text-xs text-slate-400 mt-1">Latest contract end</p>
            </div>
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="border-b border-slate-200">
          <div className="flex gap-6">
            {(["overview", "position", "forecast"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-3 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                  activeTab === tab
                    ? "border-red-600 text-red-600"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
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
                  className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() =>
                    (window.location.href = `/portfolio/customers?zone=${z.zone}`)
                  }
                >
                  <div
                    className={`${ZONE_COLORS[z.zone] || "bg-slate-600"} px-4 py-3`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-white font-bold text-lg">
                        {z.zone}
                      </span>
                      <span className="text-white/80 text-sm">
                        {fmt(z.customers)} customers
                      </span>
                    </div>
                  </div>
                  <div className="p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Active</span>
                      <span className="font-medium text-slate-700">
                        {fmt(z.active)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Fixed</span>
                      <span className="font-medium text-slate-700">
                        {fmt(z.fixed)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Avg Usage</span>
                      <span className="font-medium text-slate-700">
                        {fmt(
                          Number(z.total_usage_kwh) / Math.max(z.customers, 1),
                          0,
                        )}{" "}
                        kWh
                      </span>
                    </div>
                    <div className="pt-2 border-t border-slate-100">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Last expiry</span>
                        <span className="text-slate-600">
                          {fmtDate(z.latest_end)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Zone bar chart */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">
                Customer Distribution by Zone
              </h3>
              <div className="space-y-3">
                {zones.map((z) => {
                  const pct = summary
                    ? Math.round(
                        (z.customers / Number(summary.total_customers)) * 100,
                      )
                    : 0;
                  return (
                    <div key={z.zone} className="flex items-center gap-3">
                      <span
                        className={`text-xs font-mono font-bold w-14 ${
                          ZONE_LIGHT[z.zone]
                            ? ZONE_LIGHT[z.zone].split(" ")[1]
                            : "text-slate-600"
                        }`}
                      >
                        {z.zone}
                      </span>
                      <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${ZONE_COLORS[z.zone] || "bg-slate-400"} transition-all`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-500 w-20 text-right">
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
              <p className="text-sm text-slate-600">
                Contracts expiring by period — your open position to hedge
              </p>
              <div className="flex gap-2">
                {(["monthly", "yearly"] as const).map((g) => (
                  <button
                    key={g}
                    onClick={() => setGranularity(g)}
                    className={`px-3 py-1.5 text-xs rounded-lg capitalize transition-colors ${
                      granularity === g
                        ? "bg-red-600 text-white"
                        : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-3 text-xs text-slate-500 uppercase tracking-wide font-medium">
                      Period
                    </th>
                    <th className="text-left px-4 py-3 text-xs text-slate-500 uppercase tracking-wide font-medium">
                      Zone
                    </th>
                    <th className="text-left px-4 py-3 text-xs text-slate-500 uppercase tracking-wide font-medium">
                      Type
                    </th>
                    <th className="text-right px-4 py-3 text-xs text-slate-500 uppercase tracking-wide font-medium">
                      Customers
                    </th>
                    <th className="text-right px-4 py-3 text-xs text-slate-500 uppercase tracking-wide font-medium">
                      Est. MW
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {periods.map((period) =>
                    positionByPeriod[period].map((row, i) => (
                      <tr key={`${period}-${i}`} className="hover:bg-slate-50">
                        {i === 0 && (
                          <td
                            className="px-4 py-3 font-mono text-xs text-slate-700 font-semibold"
                            rowSpan={positionByPeriod[period].length}
                          >
                            {period}
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <span
                            className={`text-xs font-medium px-2 py-0.5 rounded border ${
                              ZONE_LIGHT[row.zone] ||
                              "bg-slate-50 text-slate-600 border-slate-200"
                            }`}
                          >
                            {row.zone}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {row.contract_type}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700">
                          {fmt(row.customers_expiring)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-900 font-medium">
                          {fmt(row.estimated_mw, 1)} MW
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
              {periods.length === 0 && (
                <div className="text-center py-12 text-slate-400 text-sm">
                  No open position data available
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Forecast Tab ── */}
        {activeTab === "forecast" && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-700">
                Load Forecast by Zone
              </h3>
              <div className="flex gap-2">
                <Link href="/portfolio/forecast">
                  <button className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700">
                    Full Forecast →
                  </button>
                </Link>
              </div>
            </div>
            <p className="text-sm text-slate-500">
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
                  className="border border-slate-200 rounded-lg p-3 text-center"
                >
                  <p className="text-xs font-medium text-slate-700">{m}</p>
                  <p className="text-xs text-slate-400 mt-1">Available</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
