import React, { useEffect, useState } from "react";
import Layout from "../../components/Layout";
import api from "../../utils/api";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

// ── Types ──────────────────────────────────────────────────────────────────────
type Status = "GREEN" | "YELLOW" | "RED";

interface PositionHorizon {
  load_mw: number;
  supply_mw: number;
  short_pct: number;
  status: Status;
  score: number;
  weight: number;
}

interface PositionRisk {
  score: number;
  status: Status;
  message?: string;
  details?: Record<string, PositionHorizon>;
}

interface PriceRisk {
  score: number;
  status: Status;
  message?: string;
  total_mtm: number;
  mtm_pct: number;
  deal_count: number;
}

interface CustomerRisk {
  score: number;
  status: Status;
  message?: string;
  total_at_risk: number;
  critical_count: number;
  high_count: number;
  total_open: number;
  critical_pct: number;
}

interface WeatherRisk {
  score: number;
  status: Status;
  message?: string;
  lfc_avg_mw: number;
  prior_year_avg_mw: number;
  deviation_pct: number;
}

interface OverallRisk {
  score_date: string;
  overall_score: number;
  overall_status: Status;
  position: PositionRisk;
  price: PriceRisk;
  customer: CustomerRisk;
  weather: WeatherRisk;
  calculated_at: string;
}

interface HistoryRow {
  score_date: string;
  overall_score: number;
  overall_status: Status;
}

const HORIZON_ORDER = ["Day Ahead", "Week Ahead", "Month Ahead", "Long Term"];

// ── Helpers ──────────────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<Status, string> = {
  GREEN: "var(--success-light)",
  YELLOW: "#d97706",
  RED: "var(--danger-light)",
};

const STATUS_TINT: Record<Status, string> = {
  GREEN: "var(--success-light-tint)",
  YELLOW: "#fef3c7",
  RED: "var(--danger-light-tint)",
};

function fmtNum(n: number | null | undefined, digits = 1) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function fmtMoney(n: number | null | undefined) {
  if (n == null) return "—";
  const v = Number(n);
  const sign = v < 0 ? "-" : "";
  return `${sign}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtPct(n: number | null | undefined) {
  if (n == null) return "—";
  return `${Number(n) > 0 ? "+" : ""}${Number(n).toFixed(2)}%`;
}
function fmtDateTime(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className="text-xs font-semibold px-2.5 py-1 rounded-full"
      style={{ background: STATUS_TINT[status], color: STATUS_COLOR[status] }}
    >
      {status}
    </span>
  );
}

function ScoreValue({ score }: { score: number | null | undefined }) {
  return <span>{score == null ? "—" : Math.round(score)}</span>;
}

function TrendChart({ points }: { points: HistoryRow[] }) {
  const data = points.map((p) => ({ date: p.score_date, score: Number(p.overall_score) }));

  if (data.length < 2) {
    return (
      <div className="h-20 flex items-center justify-center text-xs" style={{ color: "var(--ct-text-muted)" }}>
        Not enough history yet — check back after a few days of calculations
      </div>
    );
  }

  const last = points[points.length - 1];
  const lineColor = last ? STATUS_COLOR[last.overall_status] : "var(--accent-light)";

  return (
    <div className="h-40">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "var(--ct-text-muted)" }}
            tickFormatter={(d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "var(--ct-text-muted)" }} />
          <Tooltip
            contentStyle={{ fontSize: 12, background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}
            labelFormatter={(d) => new Date(d as string).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          />
          <Line type="monotone" dataKey="score" stroke={lineColor} strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-[var(--r-lg)] border p-4 space-y-3"
      style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}
    >
      <h3 className="text-sm font-semibold" style={{ color: "var(--ct-text-primary)" }}>{title}</h3>
      {children}
    </div>
  );
}

function CardHeader({ score, status }: { score: number; status: Status }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-2xl font-bold" style={{ color: STATUS_COLOR[status] }}>
        <ScoreValue score={score} />
      </span>
      <StatusBadge status={status} />
    </div>
  );
}

function Message({ text }: { text: string }) {
  return (
    <p className="text-xs" style={{ color: "var(--ct-text-muted)" }}>{text}</p>
  );
}

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span style={{ color: "var(--ct-text-muted)" }}>{label}</span>
      <span className="font-mono font-medium" style={{ color: "var(--ct-text-primary)" }}>{value}</span>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function RiskPage() {
  const [risk, setRisk] = useState<OverallRisk | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    setError("");
    try {
      const [riskRes, historyRes] = await Promise.all([
        api.get("/risk/current"),
        api.get("/risk/history?days=7"),
      ]);
      setRisk(riskRes.data);
      setHistory(historyRes.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to load risk data");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout title="Portfolio Risk">
      <div className="space-y-6">
        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold" style={{ color: "var(--ct-text-primary)" }}>Portfolio Risk</h1>
            <p className="text-xs mt-0.5" style={{ color: "var(--ct-text-muted)" }}>
              Position, price, customer, and weather risk — weighted into a single daily score
            </p>
          </div>
          <button
            onClick={fetchAll}
            disabled={loading}
            className="px-3 py-2 text-sm border rounded-[var(--r-lg)] hover:bg-[var(--ct-surface-hover)] disabled:opacity-50"
            style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)", color: "var(--ct-text-secondary)" }}
          >
            {loading ? "Refreshing..." : "↻ Refresh"}
          </button>
        </div>

        {error && (
          <p className="text-xs px-3 py-2 rounded-[var(--r-lg)] border" style={{ color: "var(--danger-light)", background: "var(--danger-light-tint)", borderColor: "var(--danger-light-tint)" }}>
            ⚠ {error}
          </p>
        )}

        {loading && !risk ? (
          <div className="text-center py-12 text-sm" style={{ color: "var(--ct-text-muted)" }}>Loading...</div>
        ) : !risk ? (
          <div className="rounded-[var(--r-lg)] border border-dashed p-12 text-center" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
            <p className="text-sm" style={{ color: "var(--ct-text-muted)" }}>No risk data yet.</p>
          </div>
        ) : (
          <>
            {/* ── Overall score ── */}
            <div
              className="rounded-[var(--r-lg)] border p-6 flex items-center justify-between"
              style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}
            >
              <div>
                <p className="text-xs uppercase tracking-wide" style={{ color: "var(--ct-text-muted)" }}>Overall Risk Score</p>
                <div className="flex items-baseline gap-3 mt-1">
                  <span className="text-5xl font-bold" style={{ color: STATUS_COLOR[risk.overall_status] }}>
                    <ScoreValue score={risk.overall_score} />
                  </span>
                  <StatusBadge status={risk.overall_status} />
                </div>
                <p className="text-xs mt-2" style={{ color: "var(--ct-text-muted)" }}>
                  Last calculated: <span style={{ color: "var(--ct-text-primary)" }}>{fmtDateTime(risk.calculated_at)}</span>
                </p>
              </div>
              <div className="w-64 hidden sm:block">
                <TrendChart points={history} />
              </div>
            </div>

            {/* ── Four component cards ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Position Risk */}
              <Card title="Position Risk">
                <CardHeader score={risk.position.score} status={risk.position.status} />
                {risk.position.message && <Message text={risk.position.message} />}
                {risk.position.details && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-subtle)" }}>
                          <th className="text-left px-2 py-1.5 uppercase font-medium" style={{ color: "var(--ct-text-muted)" }}>Horizon</th>
                          <th className="text-right px-2 py-1.5 uppercase font-medium" style={{ color: "var(--ct-text-muted)" }}>Load MW</th>
                          <th className="text-right px-2 py-1.5 uppercase font-medium" style={{ color: "var(--ct-text-muted)" }}>Supply MW</th>
                          <th className="text-right px-2 py-1.5 uppercase font-medium" style={{ color: "var(--ct-text-muted)" }}>Short%</th>
                          <th className="text-right px-2 py-1.5 uppercase font-medium" style={{ color: "var(--ct-text-muted)" }}>Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y" style={{ borderColor: "var(--ct-border-subtle)" }}>
                        {HORIZON_ORDER.map((name) => {
                          const h = risk.position.details?.[name];
                          if (!h) return null;
                          return (
                            <tr key={name}>
                              <td className="px-2 py-1.5" style={{ color: "var(--ct-text-primary)" }}>{name}</td>
                              <td className="px-2 py-1.5 text-right font-mono" style={{ color: "var(--ct-text-secondary)" }}>{fmtNum(h.load_mw)}</td>
                              <td className="px-2 py-1.5 text-right font-mono" style={{ color: "var(--ct-text-secondary)" }}>{fmtNum(h.supply_mw)}</td>
                              <td className="px-2 py-1.5 text-right font-mono" style={{ color: "var(--ct-text-secondary)" }}>{fmtPct(h.short_pct)}</td>
                              <td className="px-2 py-1.5 text-right"><StatusBadge status={h.status} /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              {/* Price Risk */}
              <Card title="Price Risk">
                <CardHeader score={risk.price.score} status={risk.price.status} />
                {risk.price.message && <Message text={risk.price.message} />}
                <div className="space-y-1.5 pt-1">
                  <StatRow label="MTM P&L" value={<span style={{ color: risk.price.total_mtm >= 0 ? "var(--success-light)" : "var(--danger-light)" }}>{fmtMoney(risk.price.total_mtm)}</span>} />
                  <StatRow label="MTM %" value={fmtPct(risk.price.mtm_pct)} />
                  <StatRow label="Deal Count" value={risk.price.deal_count} />
                </div>
              </Card>

              {/* Customer Risk */}
              <Card title="Customer Risk">
                <CardHeader score={risk.customer.score} status={risk.customer.status} />
                {risk.customer.message && <Message text={risk.customer.message} />}
                <div className="space-y-1.5 pt-1">
                  <StatRow label="Total At Risk" value={fmtMoney(risk.customer.total_at_risk)} />
                  <StatRow label="Critical Accounts" value={risk.customer.critical_count} />
                  <StatRow label="High Accounts" value={risk.customer.high_count} />
                  <StatRow label="Open Accounts" value={risk.customer.total_open} />
                  <StatRow label="Critical %" value={fmtPct(risk.customer.critical_pct)} />
                </div>
              </Card>

              {/* Weather Risk */}
              <Card title="Weather Risk">
                <CardHeader score={risk.weather.score} status={risk.weather.status} />
                {risk.weather.message && <Message text={risk.weather.message} />}
                <div className="space-y-1.5 pt-1">
                  <StatRow label="LFC Avg MW (next 7d)" value={fmtNum(risk.weather.lfc_avg_mw)} />
                  <StatRow label="Prior Year Avg MW" value={fmtNum(risk.weather.prior_year_avg_mw)} />
                  <StatRow label="Deviation %" value={fmtPct(risk.weather.deviation_pct)} />
                </div>
              </Card>
            </div>

            {/* ── Trend chart (full width, small screens) ── */}
            <Card title="7-Day Trend">
              <TrendChart points={history} />
            </Card>
          </>
        )}
      </div>
    </Layout>
  );
}
