import React, { useState, useCallback, useEffect } from "react";
import Layout from "../../components/Layout";
import api from "../../utils/api";
import {
  BarChart,
  LineChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

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

interface BlockHourRow {
  hour_ending: number;
  date: string;
  load_mw: number;
  supply_mw: number;
  net_mw: number;
}

interface HourBlocksSummary {
  min_load_mw: number;
  max_load_mw: number;
  avg_load_mw: number;
  total_hours: number;
}

interface HourBlocksResponse {
  rows: BlockHourRow[];
  summary: HourBlocksSummary;
  block_type: string;
  load_type: string;
  zones: string[];
}

// ── Constants ──────────────────────────────────────────────────────────────────
const ALL_ZONES = ["HOUSTON", "NORTH", "SOUTH", "WEST"];
const ZONES = ["HOUSTON", "NORTH", "SOUTH", "WEST"] as const;
const HOUR_BLOCK_TYPES = ["7x16", "5x16", "2x16", "7x8", "7x24"] as const;
const HOUR_BLOCK_LOAD_TYPES = ["Forecast", "Actual"] as const;
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
  if (n === 0) return <span style={{ color: "var(--ct-text-muted)" }}>—</span>;
  const color = n > 0 ? "var(--success-light)" : "var(--danger-light)";
  return (
    <span style={{ color, fontWeight: 600 }}>
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
    <div className="rounded-[var(--r-lg)] border overflow-hidden" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}>
        <div>
          <span className="font-semibold text-sm" style={{ color: "var(--ct-text-primary)" }}>{label}</span>
          <span className="ml-3 text-xs" style={{ color: "var(--ct-text-muted)" }}>{subtitle}</span>
        </div>
        <div className="flex rounded-[var(--r-sm)] overflow-hidden text-xs">
          {(["zone", "hourly"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="px-3 py-1 capitalize transition-colors"
              style={view === v
                ? { background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }
                : { background: "var(--ct-surface)", color: "var(--ct-text-secondary)" }}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {view === "zone" ? (
        <div className="grid grid-cols-4 divide-x" style={{ borderColor: "var(--ct-border-subtle)" }}>
          {ZONES.map((zone) => (
            <div key={zone} className="p-4 text-center">
              <div className="text-xs mb-1" style={{ color: "var(--ct-text-muted)" }}>{zone}</div>
              <div className="text-lg font-bold" style={{ color: "var(--ct-text-primary)" }}>
                {(loadData.daily_totals[zone] ?? 0).toFixed(1)}
              </div>
              <div className="text-xs" style={{ color: "var(--ct-text-muted)" }}>MWh</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr style={{ background: "var(--ct-surface-hover)" }}>
                <th className="px-3 py-2 text-left sticky left-0" style={{ color: "var(--ct-text-muted)", background: "var(--ct-surface-hover)" }}>
                  Hour
                </th>
                {ZONES.map((z) => (
                  <th key={z} className="px-3 py-2 text-right" style={{ color: "var(--ct-text-muted)" }}>
                    {z}
                  </th>
                ))}
                <th className="px-3 py-2 text-right" style={{ color: "var(--ct-text-muted)" }}>TOTAL</th>
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
                    className="border-t hover:bg-[var(--ct-surface-hover)]"
                    style={{ borderColor: "var(--ct-border-subtle)" }}
                  >
                    <td className="px-3 py-1.5 sticky left-0" style={{ color: "var(--ct-text-muted)", background: "var(--ct-surface)" }}>
                      {he}
                    </td>
                    {ZONES.map((z) => (
                      <td
                        key={z}
                        className="px-3 py-1.5 text-right tabular-nums"
                        style={{ color: "var(--ct-text-secondary)" }}
                      >
                        {(loadData.zones[z][idx] ?? 0).toFixed(3)}
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-right font-medium tabular-nums" style={{ color: "var(--accent-light)" }}>
                      {rowTotal.toFixed(3)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2" style={{ borderColor: "var(--ct-border-strong)", background: "var(--ct-surface-hover)" }}>
                <td className="px-3 py-2 font-semibold sticky left-0" style={{ color: "var(--ct-text-muted)", background: "var(--ct-surface-hover)" }}>
                  TOTAL
                </td>
                {ZONES.map((z) => (
                  <td
                    key={z}
                    className="px-3 py-2 text-right font-semibold tabular-nums"
                    style={{ color: "var(--ct-text-primary)" }}
                  >
                    {(loadData.daily_totals[z] ?? 0).toFixed(1)}
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-semibold tabular-nums" style={{ color: "var(--accent-light)" }}>
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
        <div className="px-4 py-2 border-t text-xs" style={{ borderColor: "var(--ct-border-subtle)", color: "var(--ct-text-muted)" }}>
          Settlement run:{" "}
          <span style={{ color: "var(--ct-text-secondary)" }}>{loadData.settlement_run}</span>
          &ensp;·&ensp;Date:{" "}
          <span style={{ color: "var(--ct-text-secondary)" }}>{loadData.oper_date}</span>
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
      <div className="flex items-center justify-center py-8 text-sm" style={{ color: "var(--ct-text-muted)" }}>
        Loading actual load data…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[var(--r-md)] border p-4 text-sm" style={{ background: "var(--danger-light-tint)", borderColor: "var(--danger-light-tint)", color: "var(--danger-light)" }}>
        Failed to load data: {error}
      </div>
    );
  }

  if (!data || (!data.with_losses.has_data && !data.unadjusted.has_data)) {
    return (
      <div className="rounded-[var(--r-md)] border p-6 text-center text-sm" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)", color: "var(--ct-text-muted)" }}>
        No settlement data loaded for {operDate} / {settlementRun}.
        <br />
        <code className="text-xs mt-1 block" style={{ color: "var(--ct-text-secondary)" }}>
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
    <div className="flex items-center gap-3 mt-3 pt-3 border-t" style={{ borderColor: "var(--ct-border-default)" }}>
      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ct-text-muted)" }}>
        Settlement:
      </span>
      <div className="flex flex-col gap-0.5">
        <label className="text-xs" style={{ color: "var(--ct-text-muted)" }}>Operating Date</label>
        <select
          className="border rounded-[var(--r-sm)] px-2 py-1 text-xs outline-none focus:border-[var(--accent-light)]"
          style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)", color: "var(--ct-text-secondary)" }}
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
        <label className="text-xs" style={{ color: "var(--ct-text-muted)" }}>Settlement Run</label>
        <select
          className="border rounded-[var(--r-sm)] px-2 py-1 text-xs outline-none focus:border-[var(--accent-light)]"
          style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)", color: "var(--ct-text-secondary)" }}
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

// ── HourBlocksTab ───────────────────────────────────────────────────────────────
function HourBlockBarChart({ rows }: { rows: BlockHourRow[] }) {
  const [chartType, setChartType] = useState<"bar" | "line">("bar");

  const chartData = rows.map((r) => ({
    label: `${r.date} ${r.hour_ending}`,
    Load: r.load_mw,
    Supply: r.supply_mw,
    Net: r.net_mw,
  }));
  const chartWidth = Math.max(800, rows.length * 20);

  return (
    <div className="rounded-[var(--r-lg)] border p-4" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ct-text-secondary)" }}>
          Load Shape
        </p>
        <div className="flex gap-1">
          <button
            onClick={() => setChartType("bar")}
            className="px-2.5 py-1 text-xs rounded-[var(--r-sm)] border"
            style={chartType === "bar"
              ? { background: "var(--accent-light)", color: "var(--accent-light-on-solid)", borderColor: "var(--accent-light)" }
              : { background: "var(--ct-surface)", color: "var(--ct-text-secondary)", borderColor: "var(--ct-border-default)" }}
          >
            Bar
          </button>
          <button
            onClick={() => setChartType("line")}
            className="px-2.5 py-1 text-xs rounded-[var(--r-sm)] border"
            style={chartType === "line"
              ? { background: "var(--accent-light)", color: "var(--accent-light-on-solid)", borderColor: "var(--accent-light)" }
              : { background: "var(--ct-surface)", color: "var(--ct-text-secondary)", borderColor: "var(--ct-border-default)" }}
          >
            Line
          </button>
        </div>
      </div>
      <div className="overflow-x-auto w-full">
        <div style={{ minWidth: chartWidth }}>
          <ResponsiveContainer width="100%" height={300}>
            {chartType === "bar" ? (
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--ct-border-subtle)" />
                <XAxis dataKey="label" interval={3} tick={{ fontSize: 11, fill: "var(--ct-text-muted)" }} />
                <YAxis tick={{ fontSize: 11, fill: "var(--ct-text-muted)" }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Load" fill="#0d9488" />
                <Bar dataKey="Supply" fill="#10b981" />
                <Bar dataKey="Net" fill="#ef4444" />
              </BarChart>
            ) : (
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--ct-border-subtle)" />
                <XAxis dataKey="label" interval={3} tick={{ fontSize: 11, fill: "var(--ct-text-muted)" }} />
                <YAxis tick={{ fontSize: 11, fill: "var(--ct-text-muted)" }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="Load" stroke="#0d9488" dot={false} />
                <Line type="monotone" dataKey="Supply" stroke="#10b981" dot={false} />
                <Line type="monotone" dataKey="Net" stroke="#ef4444" dot={false} />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function HourBlocksTab() {
  const [fromDate, setFromDate] = useState(today());
  const [throughDate, setThroughDate] = useState(today());
  const [loadType, setLoadType] =
    useState<(typeof HOUR_BLOCK_LOAD_TYPES)[number]>("Forecast");
  const [forecastType, setForecastType] = useState("ERCOT Shape Forecast");
  const [blockType, setBlockType] =
    useState<(typeof HOUR_BLOCK_TYPES)[number]>("7x16");
  const [zones, setZones] = useState<string[]>([...ALL_ZONES]);
  const [data, setData] = useState<HourBlocksResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [ran, setRan] = useState(false);

  function toggleBlockZone(z: string) {
    setZones((zs) => (zs.includes(z) ? zs.filter((x) => x !== z) : [...zs, z]));
  }

  const runBlocks = useCallback(async () => {
    setLoading(true);
    setRan(true);
    try {
      const res = await api.post("/portfolio/position/blocks", {
        from_date: fromDate,
        through_date: throughDate,
        load_type: loadType,
        forecast_type: forecastType,
        block_type: blockType,
        zones,
      });
      setData(res.data);
    } catch (e) {
      console.error(e);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [fromDate, throughDate, loadType, forecastType, blockType, zones]);

  return (
    <div className="space-y-4">
      {/* Selection Criteria Panel */}
      <div className="rounded-[var(--r-lg)] border p-5 space-y-5" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
        <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--ct-text-primary)" }}>
          Hour Blocks — Selection Criteria
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Date Range */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide border-b pb-1" style={{ color: "var(--ct-text-secondary)", borderColor: "var(--ct-border-subtle)" }}>
              Date Range
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs w-14" style={{ color: "var(--ct-text-muted)" }}>From</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="flex-1 text-xs border rounded-[var(--r-sm)] px-2 py-1 outline-none focus:border-[var(--accent-light)]"
                style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs w-14" style={{ color: "var(--ct-text-muted)" }}>Through</span>
              <input
                type="date"
                value={throughDate}
                onChange={(e) => setThroughDate(e.target.value)}
                className="flex-1 text-xs border rounded-[var(--r-sm)] px-2 py-1 outline-none focus:border-[var(--accent-light)]"
                style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
              />
            </div>
          </div>

          {/* Load Type */}
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide border-b pb-1 mb-2" style={{ color: "var(--ct-text-secondary)", borderColor: "var(--ct-border-subtle)" }}>
              Load Type
            </p>
            {HOUR_BLOCK_LOAD_TYPES.map((lt) => (
              <button
                key={lt}
                onClick={() => setLoadType(lt)}
                className="w-full text-left px-3 py-1.5 text-xs rounded-[var(--r-sm)] mb-1 flex items-center gap-2 transition-colors hover:bg-[var(--ct-surface-hover)]"
                style={loadType === lt
                  ? { background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }
                  : { color: "var(--ct-text-secondary)" }}
              >
                <span
                  className="w-3 h-3 rounded-full border flex-shrink-0"
                  style={loadType === lt
                    ? { background: "var(--accent-light-on-solid)", borderColor: "var(--accent-light-on-solid)" }
                    : { borderColor: "var(--ct-border-strong)" }}
                />
                {lt}
              </button>
            ))}
          </div>

          {/* Forecast Type */}
          {loadType === "Forecast" && (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide border-b pb-1 mb-2" style={{ color: "var(--ct-text-secondary)", borderColor: "var(--ct-border-subtle)" }}>
                Forecast Type
              </p>
              {LOAD_TYPES.filter((lt) => !ACTUAL_LOAD_TYPES.includes(lt)).map((lt) => (
                <button
                  key={lt}
                  onClick={() => setForecastType(lt)}
                  className="w-full text-left px-3 py-1.5 text-xs rounded-[var(--r-sm)] mb-1 flex items-center gap-2 transition-colors hover:bg-[var(--ct-surface-hover)]"
                  style={forecastType === lt
                    ? { background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }
                    : { color: "var(--ct-text-secondary)" }}
                >
                  <span
                    className="w-3 h-3 rounded-full border flex-shrink-0"
                    style={forecastType === lt
                      ? { background: "var(--accent-light-on-solid)", borderColor: "var(--accent-light-on-solid)" }
                      : { borderColor: "var(--ct-border-strong)" }}
                  />
                  {lt}
                </button>
              ))}
            </div>
          )}

          {/* Block Type */}
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide border-b pb-1 mb-2" style={{ color: "var(--ct-text-secondary)", borderColor: "var(--ct-border-subtle)" }}>
              Block Type
            </p>
            {HOUR_BLOCK_TYPES.map((b) => (
              <button
                key={b}
                onClick={() => setBlockType(b)}
                className="w-full text-left px-3 py-1.5 text-xs rounded-[var(--r-sm)] mb-1 flex items-center gap-2 transition-colors hover:bg-[var(--ct-surface-hover)]"
                style={blockType === b
                  ? { background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }
                  : { color: "var(--ct-text-secondary)" }}
              >
                <span
                  className="w-3 h-3 rounded-full border flex-shrink-0"
                  style={blockType === b
                    ? { background: "var(--accent-light-on-solid)", borderColor: "var(--accent-light-on-solid)" }
                    : { borderColor: "var(--ct-border-strong)" }}
                />
                {b}
              </button>
            ))}
          </div>

          {/* Zones */}
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide border-b pb-1 mb-2" style={{ color: "var(--ct-text-secondary)", borderColor: "var(--ct-border-subtle)" }}>
              Zones
            </p>
            {ALL_ZONES.map((z) => (
              <button
                key={z}
                onClick={() => toggleBlockZone(z)}
                className="w-full text-left px-3 py-1.5 text-xs rounded-[var(--r-sm)] mb-1 flex items-center gap-2 transition-colors"
                style={zones.includes(z)
                  ? { background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }
                  : { background: "var(--ct-surface-hover)", color: "var(--ct-text-muted)" }}
              >
                <span
                  className="w-3 h-3 rounded-sm border flex-shrink-0"
                  style={zones.includes(z)
                    ? { background: "var(--accent-light-on-solid)", borderColor: "var(--accent-light-on-solid)" }
                    : { borderColor: "var(--ct-border-strong)" }}
                />
                {z}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t" style={{ borderColor: "var(--ct-border-default)" }}>
          <button
            onClick={runBlocks}
            disabled={loading}
            className="px-6 py-2 text-sm font-semibold rounded-[var(--r-lg)] disabled:opacity-50 transition-colors hover:opacity-90"
            style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
          >
            {loading ? "Loading..." : "▶  Run Hour Blocks"}
          </button>
        </div>
      </div>

      {/* Results */}
      {ran && !loading && data && (
        <>
          {/* Summary card */}
          <div className="rounded-[var(--r-lg)] border p-5" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-xs uppercase tracking-wide mb-1" style={{ color: "var(--ct-text-muted)" }}>Min MW</div>
                <div className="text-xl font-bold" style={{ color: "var(--ct-text-primary)" }}>{data.summary.min_load_mw.toFixed(1)}</div>
              </div>
              <div className="text-center">
                <div className="text-xs uppercase tracking-wide mb-1" style={{ color: "var(--ct-text-muted)" }}>Max MW</div>
                <div className="text-xl font-bold" style={{ color: "var(--ct-text-primary)" }}>{data.summary.max_load_mw.toFixed(1)}</div>
              </div>
              <div className="text-center">
                <div className="text-xs uppercase tracking-wide mb-1" style={{ color: "var(--ct-text-muted)" }}>Avg MW</div>
                <div className="text-xl font-bold" style={{ color: "var(--ct-text-primary)" }}>{data.summary.avg_load_mw.toFixed(1)}</div>
              </div>
              <div className="text-center">
                <div className="text-xs uppercase tracking-wide mb-1" style={{ color: "var(--ct-text-muted)" }}>Total Hours</div>
                <div className="text-xl font-bold" style={{ color: "var(--ct-text-primary)" }}>{data.summary.total_hours}</div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t text-sm text-center" style={{ borderColor: "var(--ct-border-subtle)", color: "var(--ct-text-secondary)" }}>
              Max flat block you can buy:{" "}
              <span className="font-bold" style={{ color: "var(--accent-light)" }}>
                {data.summary.min_load_mw.toFixed(1)} MW
              </span>
            </div>
          </div>

          {/* Bar chart */}
          <HourBlockBarChart rows={data.rows} />

          {/* Hourly shape table */}
          <div className="rounded-[var(--r-lg)] overflow-hidden border" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
            <div className="px-4 py-2 border-b text-xs" style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-muted)" }}>
              Block Type: <span style={{ color: "var(--ct-text-secondary)" }}>{data.block_type}</span>
              &ensp;·&ensp;Load Type: <span style={{ color: "var(--ct-text-secondary)" }}>{data.load_type}</span>
              &ensp;·&ensp;Zones: <span style={{ color: "var(--ct-text-secondary)" }}>{data.zones.join(", ")}</span>
            </div>
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b sticky top-0" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}>
                    <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--ct-text-muted)" }}>Hour</th>
                    <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--ct-text-muted)" }}>Date</th>
                    <th className="text-right px-3 py-2 font-medium" style={{ color: "var(--ct-text-muted)" }}>Load MW</th>
                    <th className="text-right px-3 py-2 font-medium" style={{ color: "var(--ct-text-muted)" }}>Supply MW</th>
                    <th className="text-right px-3 py-2 font-medium" style={{ color: "var(--ct-text-muted)" }}>Net MW</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, i) => (
                    <tr key={i} className="border-b hover:bg-[var(--ct-surface-hover)]" style={{ borderColor: "var(--ct-border-subtle)" }}>
                      <td className="px-3 py-1.5" style={{ color: "var(--ct-text-secondary)" }}>
                        HE{String(row.hour_ending).padStart(2, "0")}
                      </td>
                      <td className="px-3 py-1.5" style={{ color: "var(--ct-text-secondary)" }}>{row.date}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: "var(--ct-text-primary)" }}>
                        {row.load_mw.toFixed(1)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: "var(--ct-text-secondary)" }}>
                        {row.supply_mw.toFixed(1)}
                      </td>
                      <td
                        className="px-3 py-1.5 text-right tabular-nums font-semibold"
                        style={{ color: row.net_mw < 0 ? "var(--danger-light)" : "var(--success-light)" }}
                      >
                        {row.net_mw > 0 ? "+" : ""}
                        {row.net_mw.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {ran && !loading && !data && (
        <div className="rounded-[var(--r-md)] border p-4 text-sm" style={{ background: "var(--danger-light-tint)", borderColor: "var(--danger-light-tint)", color: "var(--danger-light)" }}>
          Failed to load hour blocks data.
        </div>
      )}
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
  const [chartType, setChartType] = useState<"bar" | "line">("bar");
  const [loading, setLoading] = useState(false);
  const [showCriteria, setShowCriteria] = useState(true);
  const [ran, setRan] = useState(false);
  const [activeTab, setActiveTab] = useState<"position" | "hour_blocks">("position");

  // ── Actual load state ──────────────────────────────────────────────────────
  const [operDate, setOperDate] = useState(today());
  const [settlementRun, setSettlementRun] = useState("RTM_FINAL2");

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

  // Structural row-hierarchy shading (not status color): net/net_zone rows are
  // calculated-result totals so they collapse to the shared accent tint per the
  // calculated-result convention; header/zone/supply are plain structural rows.
  const ROW_STYLES: Record<string, React.CSSProperties> = {
    net: { background: "var(--accent-light-tint)", color: "var(--ct-text-primary)", fontWeight: 700 },
    net_zone: { background: "var(--accent-light-tint)", color: "var(--ct-text-primary)" },
    header: { background: "var(--ct-surface-hover)", color: "var(--ct-text-secondary)", fontWeight: 600 },
    zone: { background: "var(--ct-surface)", color: "var(--ct-text-secondary)" },
    supply: { background: "var(--ct-surface-hover)", color: "var(--ct-text-secondary)" },
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Layout title="Position Screen">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold" style={{ color: "var(--ct-text-primary)" }}>
              Position Screen
            </h1>
            <p className="text-xs mt-0.5" style={{ color: "var(--ct-text-muted)" }}>
              Forecast · Supply · Net Position
            </p>
          </div>
          {activeTab === "position" && (
            <div className="flex gap-2">
              <button
                onClick={() => setShowCriteria((v) => !v)}
                className="px-3 py-1.5 text-xs border rounded-[var(--r-sm)] hover:bg-[var(--ct-surface-hover)]"
                style={{ borderColor: "var(--ct-border-default)", background: "var(--ct-surface)", color: "var(--ct-text-secondary)" }}
              >
                {showCriteria ? "Hide" : "Show"} Criteria
              </button>
              {ran && (
                <button
                  onClick={runPosition}
                  className="px-3 py-1.5 text-xs border rounded-[var(--r-sm)] hover:bg-[var(--ct-surface-hover)]"
                  style={{ borderColor: "var(--ct-border-default)", background: "var(--ct-surface)", color: "var(--ct-text-secondary)" }}
                >
                  ↻ Refresh
                </button>
              )}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="border-b" style={{ borderColor: "var(--ct-border-default)" }}>
          <div className="flex gap-6">
            {(["position", "hour_blocks"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="pb-3 text-sm font-medium transition-colors border-b-2 -mb-px"
                style={activeTab === tab
                  ? { borderColor: "var(--accent-light)", color: "var(--accent-light)" }
                  : { borderColor: "transparent", color: "var(--ct-text-muted)" }}
              >
                {tab === "position" ? "Position Screen" : "Hour Blocks"}
              </button>
            ))}
          </div>
        </div>

        {activeTab === "hour_blocks" && <HourBlocksTab />}

        {/* Selection Criteria Panel */}
        {activeTab === "position" && showCriteria && (
          <div className="rounded-[var(--r-lg)] border p-5 space-y-5" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--ct-text-primary)" }}>
                AMERI Position Screen — Selection Criteria
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Left column — Time Range */}
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide border-b pb-1" style={{ color: "var(--ct-text-secondary)", borderColor: "var(--ct-border-subtle)" }}>
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
                      className="w-full text-left px-3 py-1.5 text-xs rounded-[var(--r-sm)] transition-colors hover:bg-[var(--ct-surface-hover)]"
                      style={criteria.granularity === g
                        ? { background: "var(--accent-light)", color: "var(--accent-light-on-solid)", fontWeight: 600 }
                        : { color: "var(--ct-text-secondary)" }}
                    >
                      {g === "fifteen_min"
                        ? "Fifteen-Minute"
                        : g === "hour_blocks"
                          ? "Hour Blocks"
                          : g.charAt(0).toUpperCase() + g.slice(1)}
                    </button>
                  ))}
                </div>

                <p className="text-xs font-semibold uppercase tracking-wide border-b pb-1 pt-2" style={{ color: "var(--ct-text-secondary)", borderColor: "var(--ct-border-subtle)" }}>
                  Date Range
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs w-12" style={{ color: "var(--ct-text-muted)" }}>From</span>
                    <input
                      type="date"
                      value={criteria.from_date}
                      onChange={(e) =>
                        setCriteria((c) => ({
                          ...c,
                          from_date: e.target.value,
                        }))
                      }
                      className="flex-1 text-xs border rounded-[var(--r-sm)] px-2 py-1 outline-none focus:border-[var(--accent-light)]"
                      style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
                    />
                    <select
                      value={criteria.from_he}
                      onChange={(e) =>
                        setCriteria((c) => ({ ...c, from_he: +e.target.value }))
                      }
                      className="text-xs border rounded-[var(--r-sm)] px-1 py-1 outline-none focus:border-[var(--accent-light)]"
                      style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
                    >
                      {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => (
                        <option key={h} value={h}>
                          HE {String(h).padStart(2, "0")}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs w-12" style={{ color: "var(--ct-text-muted)" }}>Through</span>
                    <input
                      type="date"
                      value={criteria.through_date}
                      onChange={(e) =>
                        setCriteria((c) => ({
                          ...c,
                          through_date: e.target.value,
                        }))
                      }
                      className="flex-1 text-xs border rounded-[var(--r-sm)] px-2 py-1 outline-none focus:border-[var(--accent-light)]"
                      style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
                    />
                    <select
                      value={criteria.through_he}
                      onChange={(e) =>
                        setCriteria((c) => ({
                          ...c,
                          through_he: +e.target.value,
                        }))
                      }
                      className="text-xs border rounded-[var(--r-sm)] px-1 py-1 outline-none focus:border-[var(--accent-light)]"
                      style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
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
                    <p className="text-xs" style={{ color: "var(--ct-text-muted)" }}>Block Type</p>
                    {(["7x8", "7x16", "5x16", "7x24"] as const).map((b) => (
                      <button
                        key={b}
                        onClick={() =>
                          setCriteria((c) => ({ ...c, block_type: b }))
                        }
                        className="mr-2 px-2 py-1 text-xs rounded-[var(--r-sm)] border"
                        style={criteria.block_type === b
                          ? { background: "var(--accent-light)", color: "var(--accent-light-on-solid)", borderColor: "var(--accent-light)" }
                          : { borderColor: "var(--ct-border-default)", color: "var(--ct-text-secondary)" }}
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
                  <div className="flex items-center justify-between border-b pb-1 mb-2" style={{ borderColor: "var(--ct-border-subtle)" }}>
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ct-text-secondary)" }}>
                      Load Zones
                    </p>
                    <div className="flex gap-1">
                      <button
                        onClick={() =>
                          setCriteria((c) => ({ ...c, zones: [...ALL_ZONES] }))
                        }
                        className="text-xs hover:underline"
                        style={{ color: "var(--accent-light)" }}
                      >
                        ALL ON
                      </button>
                      <span style={{ color: "var(--ct-border-strong)" }}>|</span>
                      <button
                        onClick={() =>
                          setCriteria((c) => ({ ...c, zones: [] }))
                        }
                        className="text-xs hover:underline"
                        style={{ color: "var(--accent-light)" }}
                      >
                        ALL OFF
                      </button>
                    </div>
                  </div>
                  {ALL_ZONES.map((z) => (
                    <button
                      key={z}
                      onClick={() => toggleZone(z)}
                      className="w-full text-left px-3 py-1.5 text-xs rounded-[var(--r-sm)] mb-1 flex items-center gap-2 transition-colors"
                      style={criteria.zones.includes(z)
                        ? { background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }
                        : { background: "var(--ct-surface-hover)", color: "var(--ct-text-muted)" }}
                    >
                      <span
                        className="w-3 h-3 rounded-sm border flex items-center justify-center"
                        style={criteria.zones.includes(z)
                          ? { background: "var(--accent-light-on-solid)", borderColor: "var(--accent-light-on-solid)" }
                          : { borderColor: "var(--ct-border-strong)" }}
                      >
                        {criteria.zones.includes(z) && (
                          <span className="text-xs" style={{ color: "var(--accent-light)" }}>✓</span>
                        )}
                      </span>
                      {z}
                    </button>
                  ))}
                </div>

                <div>
                  <div className="flex items-center justify-between border-b pb-1 mb-2" style={{ borderColor: "var(--ct-border-subtle)" }}>
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ct-text-secondary)" }}>
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
                        className="text-xs hover:underline"
                        style={{ color: "var(--accent-light)" }}
                      >
                        ALL ON
                      </button>
                      <span style={{ color: "var(--ct-border-strong)" }}>|</span>
                      <button
                        onClick={() =>
                          setCriteria((c) => ({ ...c, categorization: [] }))
                        }
                        className="text-xs hover:underline"
                        style={{ color: "var(--accent-light)" }}
                      >
                        ALL OFF
                      </button>
                    </div>
                  </div>
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => toggleCategory(cat)}
                      className="w-full text-left px-3 py-1.5 text-xs rounded-[var(--r-sm)] mb-1 transition-colors"
                      style={criteria.categorization.includes(cat)
                        ? { background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }
                        : { background: "var(--ct-surface-hover)", color: "var(--ct-text-muted)" }}
                    >
                      {cat === "All Customers" ? cat : `Risk Category: ${cat}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Right column */}
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide border-b pb-1 mb-2" style={{ color: "var(--ct-text-secondary)", borderColor: "var(--ct-border-subtle)" }}>
                    Load Type
                  </p>
                  {LOAD_TYPES.map((lt) => (
                    <button
                      key={lt}
                      onClick={() =>
                        setCriteria((c) => ({ ...c, load_type: lt }))
                      }
                      className="w-full text-left px-3 py-1.5 text-xs rounded-[var(--r-sm)] mb-1 flex items-center gap-2 transition-colors hover:bg-[var(--ct-surface-hover)]"
                      style={criteria.load_type === lt
                        ? { background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }
                        : { color: "var(--ct-text-secondary)" }}
                    >
                      <span
                        className="w-3 h-3 rounded-full border flex-shrink-0"
                        style={criteria.load_type === lt
                          ? { background: "var(--accent-light-on-solid)", borderColor: "var(--accent-light-on-solid)" }
                          : { borderColor: "var(--ct-border-strong)" }}
                      />
                      {lt}
                    </button>
                  ))}
                </div>

                <div>
                  <div className="flex items-center justify-between border-b pb-1 mb-2" style={{ borderColor: "var(--ct-border-subtle)" }}>
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ct-text-secondary)" }}>
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
                        className="text-xs hover:underline"
                        style={{ color: "var(--accent-light)" }}
                      >
                        ALL ON
                      </button>
                      <span style={{ color: "var(--ct-border-strong)" }}>|</span>
                      <button
                        onClick={() =>
                          setCriteria((c) => ({ ...c, sections: [] }))
                        }
                        className="text-xs hover:underline"
                        style={{ color: "var(--accent-light)" }}
                      >
                        ALL OFF
                      </button>
                    </div>
                  </div>
                  {SECTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => toggleSection(s)}
                      className="w-full text-left px-3 py-1.5 text-xs rounded-[var(--r-sm)] mb-1 transition-colors"
                      style={criteria.sections.includes(s)
                        ? { background: "var(--accent-light-tint)", color: "var(--accent-light)", fontWeight: 500 }
                        : { color: "var(--ct-text-muted)" }}
                    >
                      {s}
                    </button>
                  ))}
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide border-b pb-1 mb-2" style={{ color: "var(--ct-text-secondary)", borderColor: "var(--ct-border-subtle)" }}>
                    Loss Factors
                  </p>
                  {(["current", "override"] as const).map((lf) => (
                    <button
                      key={lf}
                      onClick={() =>
                        setCriteria((c) => ({ ...c, loss_factors: lf }))
                      }
                      className="w-full text-left px-3 py-1.5 text-xs rounded-[var(--r-sm)] mb-1 flex items-center gap-2 hover:bg-[var(--ct-surface-hover)]"
                      style={criteria.loss_factors === lf
                        ? { background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }
                        : { color: "var(--ct-text-secondary)" }}
                    >
                      <span
                        className="w-3 h-3 rounded-full border flex-shrink-0"
                        style={criteria.loss_factors === lf
                          ? { background: "var(--accent-light-on-solid)", borderColor: "var(--accent-light-on-solid)" }
                          : { borderColor: "var(--ct-border-strong)" }}
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
            <div className="flex flex-col gap-3 pt-2 border-t" style={{ borderColor: "var(--ct-border-default)" }}>
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
                  className="px-6 py-2 text-sm font-semibold rounded-[var(--r-lg)] disabled:opacity-50 transition-colors hover:opacity-90"
                  style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
                >
                  {loading ? "Loading..." : "▶  Run Position"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Position Grid */}
        {activeTab === "position" && ran && !loading && (
          <div className="rounded-[var(--r-lg)] overflow-hidden border" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}>
                    <th className="text-left px-3 py-2 sticky left-0 min-w-[180px] bg-slate-900 text-white font-semibold">
                      Name
                    </th>
                    <th className="text-right px-2 py-2 font-medium min-w-[80px]" style={{ color: "var(--ct-text-muted)" }}>
                      Total
                    </th>
                    {hours.map((h) => (
                      <th
                        key={h}
                        className="text-right px-2 py-2 font-medium min-w-[70px]"
                        style={{ color: "var(--ct-text-muted)" }}
                      >
                        HE{String(h).padStart(2, "0")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const rowStyle = ROW_STYLES[row.type] || {};
                    return (
                    <tr
                      key={i}
                      className="border-b"
                      style={{ borderColor: "var(--ct-border-subtle)", ...rowStyle }}
                    >
                      <td className="px-3 py-1.5 sticky left-0 bg-slate-900 text-white">
                        {row.name}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {row.type.includes("net") ? (
                          fmtNet(row.total)
                        ) : (
                          <span style={{ color: "var(--ct-text-muted)" }}>
                            {fmt(row.total)}
                          </span>
                        )}
                      </td>
                      {row.hours.map((v, hi) => (
                        <td key={hi} className="px-2 py-1.5 text-right">
                          {row.type.includes("net") ? (
                            fmtNet(v)
                          ) : (
                            <span style={{ color: "var(--ct-text-muted)" }}>
                              {v === 0 ? "—" : fmt(v)}
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Actual Load Section — only when Actual load type selected and ran */}
        {activeTab === "position" && ran && !loading && isActualLoadType && (
          <ActualLoadSection
            operDate={operDate}
            settlementRun={settlementRun}
          />
        )}

        {/* Graph */}
        {activeTab === "position" && ran && !loading && (
          <div className="rounded-[var(--r-lg)] border p-6" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold" style={{ color: "var(--ct-text-primary)" }}>
                Supply vs Load — {criteria.from_date}
              </h3>
              <div className="flex gap-1">
                <button
                  onClick={() => setChartType("bar")}
                  className="px-2.5 py-1 text-xs rounded-[var(--r-sm)] border"
                  style={chartType === "bar"
                    ? { background: "var(--accent-light)", color: "var(--accent-light-on-solid)", borderColor: "var(--accent-light)" }
                    : { background: "var(--ct-surface)", color: "var(--ct-text-secondary)", borderColor: "var(--ct-border-default)" }}
                >
                  Bar
                </button>
                <button
                  onClick={() => setChartType("line")}
                  className="px-2.5 py-1 text-xs rounded-[var(--r-sm)] border"
                  style={chartType === "line"
                    ? { background: "var(--accent-light)", color: "var(--accent-light-on-solid)", borderColor: "var(--accent-light)" }
                    : { background: "var(--ct-surface)", color: "var(--ct-text-secondary)", borderColor: "var(--ct-border-default)" }}
                >
                  Line
                </button>
              </div>
            </div>
            {(() => {
              const loadRow = rows.find((r) => r.type === "header");
              const supplyRow = rows.find(
                (r) => r.type === "supply" && r.name === "Net Supply",
              );
              const netRow = rows.find(
                (r) => r.type === "net" && r.name === "Net Position",
              );
              const chartData = hours.map((h, i) => ({
                hour: h,
                Load: loadRow?.hours[i] ?? 0,
                Supply: supplyRow?.hours[i] ?? 0,
                Net: netRow?.hours[i] ?? 0,
              }));
              const chartWidth = Math.max(800, hours.length * 20);

              return (
                <div className="overflow-x-auto w-full">
                  <div style={{ minWidth: chartWidth }}>
                    <ResponsiveContainer width="100%" height={300}>
                      {chartType === "bar" ? (
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--ct-border-subtle)" />
                          <XAxis
                            dataKey="hour"
                            interval={3}
                            tick={{ fontSize: 11, fill: "var(--ct-text-muted)" }}
                          />
                          <YAxis tick={{ fontSize: 11, fill: "var(--ct-text-muted)" }} />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="Load" fill="#0d9488" />
                          <Bar dataKey="Supply" fill="#10b981" />
                          <Bar dataKey="Net" fill="#ef4444" />
                        </BarChart>
                      ) : (
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--ct-border-subtle)" />
                          <XAxis
                            dataKey="hour"
                            interval={3}
                            tick={{ fontSize: 11, fill: "var(--ct-text-muted)" }}
                          />
                          <YAxis tick={{ fontSize: 11, fill: "var(--ct-text-muted)" }} />
                          <Tooltip />
                          <Legend />
                          <Line type="monotone" dataKey="Load" stroke="#0d9488" dot={false} />
                          <Line type="monotone" dataKey="Supply" stroke="#10b981" dot={false} />
                          <Line type="monotone" dataKey="Net" stroke="#ef4444" dot={false} />
                        </LineChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </Layout>
  );
}
