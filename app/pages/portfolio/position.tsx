import React, { useState, useCallback, useEffect } from "react";
import Layout from "../../components/Layout";
import api from "../../utils/api";

// ── Types ──────────────────────────────────────────────────────────────────────
interface PositionRow {
  name: string;
  total: number;
  hours: number[];
  type: "header" | "zone" | "supply" | "net" | "net_zone";
}

interface SelectionCriteria {
  from_date: string;
  from_he: number;
  through_date: string;
  through_he: number;
  granularity: "fifteen_min" | "hourly" | "daily" | "monthly" | "hour_blocks";
  zones: string[];
  categorization: string[];
  load_type: string;
  sections: string[];
  loss_factors: "current" | "override";
  block_type: "7x8" | "7x16" | "5x16" | "7x24";
}

interface ZoneHourly {
  HOUSTON: number[];
  NORTH: number[];
  SOUTH: number[];
  WEST: number[];
}

interface LoadData {
  oper_date: string;
  settlement_run: string;
  zones: ZoneHourly;
  daily_totals: Record<string, number>;
  has_data: boolean;
}

interface CombinedLoad {
  oper_date: string;
  settlement_run: string;
  with_losses: LoadData;
  unadjusted: LoadData;
}

interface AvailableDate {
  oper_date: string;
  settlement_run: string;
  loaded_at: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────
const ALL_ZONES = ["HOUSTON", "NORTH", "SOUTH", "WEST"];
const ZONES = ["HOUSTON", "NORTH", "SOUTH", "WEST"] as const;
const RUNS = ["RTM_INITIAL", "RTM_FINAL2", "RTM_TRUEUP3"] as const;
const HOUR_LABELS = Array.from(
  { length: 24 },
  (_, i) => `HE${String(i + 1).padStart(2, "0")}`,
);

const CATEGORIES = ["All Customers", "Fixed", "Variable", "MCP2", "Future"];
const LOAD_TYPES = [
  "ERCOT Shape Forecast", // rename current "Forecast"
  "DNA Forecast", // new
  "Smoothed Forecast",
  "Minimum Forecast",
  "Maximum Forecast",
  "Forecast Bands",
  "What-If Forecast",
  "Actual (With Losses)",
  "Actual (Unadjusted)",
];
const SECTIONS = [
  "Cost",
  "Imbalance Cost",
  "Net by Profile",
  "Net by Counterparty",
  "Supply/Sale Deals",
  "Retail Revenue",
];

const ACTUAL_LOAD_TYPES = ["Actual (With Losses)", "Actual (Unadjusted)"];

// ── Helpers ────────────────────────────────────────────────────────────────────
function today() {
  return new Date().toISOString().split("T")[0];
}
function tomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}
function fmt(n: number, dec = 3) {
  if (n === 0) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}
function fmtNet(n: number) {
  if (n === 0) return <span className="text-slate-300">—</span>;
  const cls =
    n > 0 ? "text-emerald-400 font-semibold" : "text-red-400 font-semibold";
  return (
    <span className={cls}>
      {n > 0 ? "+" : ""}
      {n.toFixed(3)}
    </span>
  );
}

// ── Actual Load Hooks ──────────────────────────────────────────────────────────
function useAvailableDates() {
  const [dates, setDates] = useState<AvailableDate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/portfolio/load/dates")
      .then((r) => setDates(r.data))
      .finally(() => setLoading(false));
  }, []);

  return { dates, loading };
}

function useCombinedLoad(
  operDate: string,
  settlementRun: string,
  enabled: boolean,
) {
  const [data, setData] = useState<CombinedLoad | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!operDate || !enabled) return;
    setLoading(true);
    setError(null);
    api
      .get(
        `/portfolio/load/combined?oper_date=${operDate}&settlement_run=${settlementRun}`,
      )
      .then((r) => setData(r.data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [operDate, settlementRun, enabled]);

  return { data, loading, error };
}

// ── LoadTable sub-component ────────────────────────────────────────────────────
function LoadTable({
  label,
  subtitle,
  loadData,
}: {
  label: string;
  subtitle: string;
  loadData: LoadData;
}) {
  const [view, setView] = useState<"zone" | "hourly">("zone");

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700">
        <div>
          <span className="font-semibold text-white text-sm">{label}</span>
          <span className="ml-3 text-xs text-slate-400">{subtitle}</span>
        </div>
        <div className="flex rounded overflow-hidden text-xs">
          {(["zone", "hourly"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1 capitalize ${
                view === v
                  ? "bg-blue-600 text-white"
                  : "bg-slate-700 text-slate-300 hover:bg-slate-600"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {view === "zone" ? (
        <div className="grid grid-cols-4 divide-x divide-slate-700">
          {ZONES.map((zone) => (
            <div key={zone} className="p-4 text-center">
              <div className="text-xs text-slate-400 mb-1">{zone}</div>
              <div className="text-lg font-bold text-white">
                {(loadData.daily_totals[zone] ?? 0).toFixed(1)}
              </div>
              <div className="text-xs text-slate-500">MWh</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="bg-slate-800">
                <th className="px-3 py-2 text-left text-slate-400 sticky left-0 bg-slate-800">
                  Hour
                </th>
                {ZONES.map((z) => (
                  <th key={z} className="px-3 py-2 text-right text-slate-400">
                    {z}
                  </th>
                ))}
                <th className="px-3 py-2 text-right text-slate-400">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {HOUR_LABELS.map((he, idx) => {
                const rowTotal = ZONES.reduce(
                  (s, z) => s + (loadData.zones[z][idx] ?? 0),
                  0,
                );
                return (
                  <tr
                    key={he}
                    className="border-t border-slate-800 hover:bg-slate-800/40"
                  >
                    <td className="px-3 py-1.5 text-slate-400 sticky left-0 bg-slate-900 hover:bg-slate-800/40">
                      {he}
                    </td>
                    {ZONES.map((z) => (
                      <td
                        key={z}
                        className="px-3 py-1.5 text-right text-slate-200 tabular-nums"
                      >
                        {(loadData.zones[z][idx] ?? 0).toFixed(3)}
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-right text-blue-300 font-medium tabular-nums">
                      {rowTotal.toFixed(3)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-600 bg-slate-800">
                <td className="px-3 py-2 text-slate-400 font-semibold sticky left-0 bg-slate-800">
                  TOTAL
                </td>
                {ZONES.map((z) => (
                  <td
                    key={z}
                    className="px-3 py-2 text-right text-white font-semibold tabular-nums"
                  >
                    {(loadData.daily_totals[z] ?? 0).toFixed(1)}
                  </td>
                ))}
                <td className="px-3 py-2 text-right text-blue-300 font-semibold tabular-nums">
                  {ZONES.reduce(
                    (s, z) => s + (loadData.daily_totals[z] ?? 0),
                    0,
                  ).toFixed(1)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {loadData.has_data && (
        <div className="px-4 py-2 border-t border-slate-800 text-xs text-slate-600">
          Settlement run:{" "}
          <span className="text-slate-400">{loadData.settlement_run}</span>
          &ensp;·&ensp;Date:{" "}
          <span className="text-slate-400">{loadData.oper_date}</span>
        </div>
      )}
    </div>
  );
}

// ── ActualLoadSection ──────────────────────────────────────────────────────────
function ActualLoadSection({
  operDate,
  settlementRun,
}: {
  operDate: string;
  settlementRun: string;
}) {
  const isActual = true; // always true when this component renders
  const { data, loading, error } = useCombinedLoad(
    operDate,
    settlementRun,
    isActual,
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-slate-400 text-sm">
        Loading actual load data…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded bg-red-900/20 border border-red-700 p-4 text-red-400 text-sm">
        Failed to load data: {error}
      </div>
    );
  }

  if (!data || (!data.with_losses.has_data && !data.unadjusted.has_data)) {
    return (
      <div className="rounded bg-slate-800/40 border border-slate-700 p-6 text-center text-slate-500 text-sm">
        No settlement data loaded for {operDate} / {settlementRun}.
        <br />
        <code className="text-slate-300 text-xs mt-1 block">
          python process_settlement.py --date {operDate}
        </code>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <LoadTable
        label="Actual Load — With Losses"
        subtitle="Source: POSTEDAML_* (DAI)"
        loadData={data.with_losses}
      />
      <LoadTable
        label="Actual Load — Unadjusted"
        subtitle="Source: LSEGUFE_* (LLS)"
        loadData={data.unadjusted}
      />
    </div>
  );
}

// ── LoadSelector ───────────────────────────────────────────────────────────────
function LoadSelector({
  operDate,
  settlementRun,
  onDateChange,
  onRunChange,
}: {
  operDate: string;
  settlementRun: string;
  onDateChange: (d: string) => void;
  onRunChange: (r: string) => void;
}) {
  const { dates, loading } = useAvailableDates();
  const uniqueDates = [...new Set(dates.map((d) => d.oper_date))];

  return (
    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-200">
      <span className="text-xs text-slate-500 font-semibold uppercase tracking-wide">
        Settlement:
      </span>
      <div className="flex flex-col gap-0.5">
        <label className="text-xs text-slate-400">Operating Date</label>
        <select
          className="bg-white border border-slate-200 rounded px-2 py-1 text-xs text-slate-700"
          value={operDate}
          onChange={(e) => onDateChange(e.target.value)}
          disabled={loading}
        >
          {loading && <option value="">Loading…</option>}
          {uniqueDates.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
          {!loading && uniqueDates.length === 0 && (
            <option value="">No data loaded</option>
          )}
        </select>
      </div>
      <div className="flex flex-col gap-0.5">
        <label className="text-xs text-slate-400">Settlement Run</label>
        <select
          className="bg-white border border-slate-200 rounded px-2 py-1 text-xs text-slate-700"
          value={settlementRun}
          onChange={(e) => onRunChange(e.target.value)}
        >
          {RUNS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function PositionScreen() {
  const [criteria, setCriteria] = useState<SelectionCriteria>({
    from_date: today(),
    from_he: 1,
    through_date: today(),
    through_he: 24,
    granularity: "hourly",
    zones: [...ALL_ZONES],
    categorization: ["All Customers"],
    load_type: "Forecast",
    sections: [...SECTIONS],
    loss_factors: "current",
    block_type: "7x16",
  });

  const [rows, setRows] = useState<PositionRow[]>([]);
  const [hours, setHours] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCriteria, setShowCriteria] = useState(true);
  const [ran, setRan] = useState(false);

  // ── Actual load state ──────────────────────────────────────────────────────
  const [operDate, setOperDate] = useState(today());
  const [settlementRun, setSettlementRun] = useState("RTM_FINAL");

  const isActualLoadType = ACTUAL_LOAD_TYPES.includes(criteria.load_type);

  // ── Fetch position data ────────────────────────────────────────────────────
  const runPosition = useCallback(async () => {
    setOperDate(criteria.from_date);
    setLoading(true);
    setShowCriteria(false);
    setRan(true);
    try {
      const res = await api.post("/portfolio/position", {
        ...criteria,
        settlement_run: settlementRun,
      });
      setRows(res.data.rows || []);
      setHours(res.data.hours || []);
    } catch (e) {
      console.error(e);
      const hrs = Array.from({ length: 24 }, (_, i) => i + 1);
      setHours(hrs);
      setRows(buildZeroRows(criteria.zones, hrs));
    } finally {
      setLoading(false);
    }
  }, [criteria]);

  function buildZeroRows(zones: string[], hrs: number[]): PositionRow[] {
    const z = Array(hrs.length).fill(0);
    return [
      { name: "Net Position", total: 0, hours: z, type: "net" },
      { name: "Load (With Losses)", total: 0, hours: z, type: "header" },
      ...zones.map((zone) => ({
        name: zone,
        total: 0,
        hours: z,
        type: "zone" as const,
      })),
      { name: "Net Supply", total: 0, hours: z, type: "supply" },
      ...zones.map((zone) => ({
        name: `LZ_${zone} Net Supply`,
        total: 0,
        hours: z,
        type: "supply" as const,
      })),
      { name: "Net by Zone", total: 0, hours: z, type: "net" },
      ...zones.map((zone) => ({
        name: `${zone} Net`,
        total: 0,
        hours: z,
        type: "net_zone" as const,
      })),
    ];
  }

  // ── Criteria helpers ───────────────────────────────────────────────────────
  function toggleZone(z: string) {
    setCriteria((c) => ({
      ...c,
      zones: c.zones.includes(z)
        ? c.zones.filter((x) => x !== z)
        : [...c.zones, z],
    }));
  }
  function toggleSection(s: string) {
    setCriteria((c) => ({
      ...c,
      sections: c.sections.includes(s)
        ? c.sections.filter((x) => x !== s)
        : [...c.sections, s],
    }));
  }
  function toggleCategory(cat: string) {
    setCriteria((c) => ({
      ...c,
      categorization: c.categorization.includes(cat)
        ? c.categorization.filter((x) => x !== cat)
        : [...c.categorization, cat],
    }));
  }

  const ROW_STYLES: Record<string, string> = {
    net: "bg-slate-700 text-white font-bold",
    net_zone: "bg-slate-600 text-slate-100",
    header: "bg-slate-800 text-slate-200 font-semibold",
    zone: "bg-slate-750 text-slate-300",
    supply: "bg-slate-700/50 text-slate-200",
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Layout title="Position Screen">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Position Screen
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Forecast · Supply · Net Position
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowCriteria((v) => !v)}
              className="px-3 py-1.5 text-xs border border-slate-300 rounded bg-white text-slate-600 hover:bg-slate-50"
            >
              {showCriteria ? "Hide" : "Show"} Criteria
            </button>
            {ran && (
              <button
                onClick={runPosition}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded bg-white text-slate-600 hover:bg-slate-50"
              >
                ↻ Refresh
              </button>
            )}
          </div>
        </div>

        {/* Selection Criteria Panel */}
        {showCriteria && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                AMERI Position Screen — Selection Criteria
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Left column — Time Range */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide border-b pb-1">
                  Time Range
                </p>
                <div className="space-y-1">
                  {(
                    [
                      "fifteen_min",
                      "hourly",
                      "daily",
                      "monthly",
                      "hour_blocks",
                    ] as const
                  ).map((g) => (
                    <button
                      key={g}
                      onClick={() =>
                        setCriteria((c) => ({ ...c, granularity: g }))
                      }
                      className={`w-full text-left px-3 py-1.5 text-xs rounded transition-colors ${
                        criteria.granularity === g
                          ? "bg-blue-600 text-white font-semibold"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {g === "fifteen_min"
                        ? "Fifteen-Minute"
                        : g === "hour_blocks"
                          ? "Hour Blocks"
                          : g.charAt(0).toUpperCase() + g.slice(1)}
                    </button>
                  ))}
                </div>

                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide border-b pb-1 pt-2">
                  Date Range
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 w-12">From</span>
                    <input
                      type="date"
                      value={criteria.from_date}
                      onChange={(e) =>
                        setCriteria((c) => ({
                          ...c,
                          from_date: e.target.value,
                        }))
                      }
                      className="flex-1 text-xs border border-slate-200 rounded px-2 py-1"
                    />
                    <select
                      value={criteria.from_he}
                      onChange={(e) =>
                        setCriteria((c) => ({ ...c, from_he: +e.target.value }))
                      }
                      className="text-xs border border-slate-200 rounded px-1 py-1"
                    >
                      {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => (
                        <option key={h} value={h}>
                          HE {String(h).padStart(2, "0")}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 w-12">Through</span>
                    <input
                      type="date"
                      value={criteria.through_date}
                      onChange={(e) =>
                        setCriteria((c) => ({
                          ...c,
                          through_date: e.target.value,
                        }))
                      }
                      className="flex-1 text-xs border border-slate-200 rounded px-2 py-1"
                    />
                    <select
                      value={criteria.through_he}
                      onChange={(e) =>
                        setCriteria((c) => ({
                          ...c,
                          through_he: +e.target.value,
                        }))
                      }
                      className="text-xs border border-slate-200 rounded px-1 py-1"
                    >
                      {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => (
                        <option key={h} value={h}>
                          HE {String(h).padStart(2, "0")}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {criteria.granularity === "hour_blocks" && (
                  <div className="space-y-1">
                    <p className="text-xs text-slate-500">Block Type</p>
                    {(["7x8", "7x16", "5x16", "7x24"] as const).map((b) => (
                      <button
                        key={b}
                        onClick={() =>
                          setCriteria((c) => ({ ...c, block_type: b }))
                        }
                        className={`mr-2 px-2 py-1 text-xs rounded border ${
                          criteria.block_type === b
                            ? "bg-blue-600 text-white border-blue-600"
                            : "border-slate-300 text-slate-600"
                        }`}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Middle column */}
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between border-b pb-1 mb-2">
                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                      Load Zones
                    </p>
                    <div className="flex gap-1">
                      <button
                        onClick={() =>
                          setCriteria((c) => ({ ...c, zones: [...ALL_ZONES] }))
                        }
                        className="text-xs text-blue-600 hover:underline"
                      >
                        ALL ON
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        onClick={() =>
                          setCriteria((c) => ({ ...c, zones: [] }))
                        }
                        className="text-xs text-blue-600 hover:underline"
                      >
                        ALL OFF
                      </button>
                    </div>
                  </div>
                  {ALL_ZONES.map((z) => (
                    <button
                      key={z}
                      onClick={() => toggleZone(z)}
                      className={`w-full text-left px-3 py-1.5 text-xs rounded mb-1 flex items-center gap-2 transition-colors ${
                        criteria.zones.includes(z)
                          ? "bg-blue-600 text-white"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      <span
                        className={`w-3 h-3 rounded-sm border flex items-center justify-center ${
                          criteria.zones.includes(z)
                            ? "bg-white border-white"
                            : "border-slate-400"
                        }`}
                      >
                        {criteria.zones.includes(z) && (
                          <span className="text-blue-600 text-xs">✓</span>
                        )}
                      </span>
                      {z}
                    </button>
                  ))}
                </div>

                <div>
                  <div className="flex items-center justify-between border-b pb-1 mb-2">
                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                      Categorization
                    </p>
                    <div className="flex gap-1">
                      <button
                        onClick={() =>
                          setCriteria((c) => ({
                            ...c,
                            categorization: [...CATEGORIES],
                          }))
                        }
                        className="text-xs text-blue-600 hover:underline"
                      >
                        ALL ON
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        onClick={() =>
                          setCriteria((c) => ({ ...c, categorization: [] }))
                        }
                        className="text-xs text-blue-600 hover:underline"
                      >
                        ALL OFF
                      </button>
                    </div>
                  </div>
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => toggleCategory(cat)}
                      className={`w-full text-left px-3 py-1.5 text-xs rounded mb-1 transition-colors ${
                        criteria.categorization.includes(cat)
                          ? "bg-blue-600 text-white"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {cat === "All Customers" ? cat : `Risk Category: ${cat}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Right column */}
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide border-b pb-1 mb-2">
                    Load Type
                  </p>
                  {LOAD_TYPES.map((lt) => (
                    <button
                      key={lt}
                      onClick={() =>
                        setCriteria((c) => ({ ...c, load_type: lt }))
                      }
                      className={`w-full text-left px-3 py-1.5 text-xs rounded mb-1 flex items-center gap-2 transition-colors ${
                        criteria.load_type === lt
                          ? "bg-blue-600 text-white"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      <span
                        className={`w-3 h-3 rounded-full border flex-shrink-0 ${
                          criteria.load_type === lt
                            ? "bg-white border-white"
                            : "border-slate-400"
                        }`}
                      />
                      {lt}
                    </button>
                  ))}
                </div>

                <div>
                  <div className="flex items-center justify-between border-b pb-1 mb-2">
                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                      Sections
                    </p>
                    <div className="flex gap-1">
                      <button
                        onClick={() =>
                          setCriteria((c) => ({
                            ...c,
                            sections: [...SECTIONS],
                          }))
                        }
                        className="text-xs text-blue-600 hover:underline"
                      >
                        ALL ON
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        onClick={() =>
                          setCriteria((c) => ({ ...c, sections: [] }))
                        }
                        className="text-xs text-blue-600 hover:underline"
                      >
                        ALL OFF
                      </button>
                    </div>
                  </div>
                  {SECTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => toggleSection(s)}
                      className={`w-full text-left px-3 py-1.5 text-xs rounded mb-1 transition-colors ${
                        criteria.sections.includes(s)
                          ? "bg-slate-200 text-slate-700 font-medium"
                          : "text-slate-400"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide border-b pb-1 mb-2">
                    Loss Factors
                  </p>
                  {(["current", "override"] as const).map((lf) => (
                    <button
                      key={lf}
                      onClick={() =>
                        setCriteria((c) => ({ ...c, loss_factors: lf }))
                      }
                      className={`w-full text-left px-3 py-1.5 text-xs rounded mb-1 flex items-center gap-2 ${
                        criteria.loss_factors === lf
                          ? "bg-blue-600 text-white"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      <span
                        className={`w-3 h-3 rounded-full border flex-shrink-0 ${
                          criteria.loss_factors === lf
                            ? "bg-white border-white"
                            : "border-slate-400"
                        }`}
                      />
                      {lf === "current"
                        ? "Use Current Loss Factors"
                        : "Override Loss Factors"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Run button row — includes LoadSelector when Actual type selected */}
            <div className="flex flex-col gap-3 pt-2 border-t">
              {isActualLoadType && (
                <LoadSelector
                  operDate={operDate}
                  settlementRun={settlementRun}
                  onDateChange={setOperDate}
                  onRunChange={setSettlementRun}
                />
              )}
              <div className="flex justify-end">
                <button
                  onClick={runPosition}
                  disabled={loading}
                  className="px-6 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? "Loading..." : "▶  Run Position"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Position Grid */}
        {ran && !loading && (
          <div className="bg-slate-900 rounded-xl overflow-hidden border border-slate-700">
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="bg-slate-800 border-b border-slate-600">
                    <th className="text-left px-3 py-2 text-slate-400 font-medium sticky left-0 bg-slate-800 min-w-[180px]">
                      Name
                    </th>
                    <th className="text-right px-2 py-2 text-slate-400 font-medium min-w-[80px]">
                      Total
                    </th>
                    {hours.map((h) => (
                      <th
                        key={h}
                        className="text-right px-2 py-2 text-slate-400 font-medium min-w-[70px]"
                      >
                        HE{String(h).padStart(2, "0")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr
                      key={i}
                      className={`border-b border-slate-800 ${ROW_STYLES[row.type] || ""}`}
                    >
                      <td
                        className={`px-3 py-1.5 sticky left-0 ${ROW_STYLES[row.type] || "bg-slate-900"}`}
                      >
                        {row.name}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {row.type.includes("net") ? (
                          fmtNet(row.total)
                        ) : (
                          <span className="text-slate-300">
                            {fmt(row.total)}
                          </span>
                        )}
                      </td>
                      {row.hours.map((v, hi) => (
                        <td key={hi} className="px-2 py-1.5 text-right">
                          {row.type.includes("net") ? (
                            fmtNet(v)
                          ) : (
                            <span className="text-slate-400">
                              {v === 0 ? "—" : fmt(v)}
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Actual Load Section — only when Actual load type selected and ran */}
        {ran && !loading && isActualLoadType && (
          <ActualLoadSection
            operDate={operDate}
            settlementRun={settlementRun}
          />
        )}

        {/* Graph placeholder */}
        {ran && !loading && (
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-700">
                Supply vs Load — {criteria.from_date}
              </h3>
              <div className="flex gap-3 text-xs">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0.5 bg-blue-500 inline-block" /> Load
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0.5 bg-emerald-500 inline-block" />{" "}
                  Supply
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0.5 bg-red-400 inline-block border-dashed border-t" />{" "}
                  Net Position
                </span>
              </div>
            </div>
            <div className="h-48 flex items-center justify-center text-slate-400 text-sm border border-dashed border-slate-200 rounded-lg">
              Graph renders after hedges are entered · Supply = 0 currently
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
