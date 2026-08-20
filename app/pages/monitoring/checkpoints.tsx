import React, { useEffect, useState } from "react";
import Layout from "../../components/Layout";
import api from "../../utils/api";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  YAxis,
} from "recharts";

// ── Types ──────────────────────────────────────────────────────────────────────
type Status = "GREEN" | "YELLOW" | "RED";

interface Checkpoint {
  checkpoint_id: number;
  checkpoint_name: string;
  run_date: string;
  status: Status;
  score: number | null;
  threshold_green: number | null;
  threshold_red: number | null;
  message: string;
  details: Record<string, unknown>;
  created_at: string;
}

interface LatestResponse {
  checkpoints: Checkpoint[];
  overall_status: Status | "UNKNOWN";
}

interface HistoryResponse {
  days: number;
  since: string;
  history: Record<string, Checkpoint[]>;
}

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

function fmtScore(score: number | null) {
  if (score == null) return "—";
  return Math.abs(score) < 1 ? score.toFixed(4) : score.toFixed(2);
}

function StatusBadge({ status }: { status: Status | "UNKNOWN" }) {
  if (status === "UNKNOWN") {
    return (
      <span
        className="text-xs font-semibold px-2.5 py-1 rounded-full"
        style={{ background: "var(--ct-surface-hover)", color: "var(--ct-text-muted)" }}
      >
        UNKNOWN
      </span>
    );
  }
  return (
    <span
      className="text-xs font-semibold px-2.5 py-1 rounded-full"
      style={{ background: STATUS_TINT[status], color: STATUS_COLOR[status] }}
    >
      {status}
    </span>
  );
}

function TrendChart({ points }: { points: Checkpoint[] }) {
  const data = points
    .filter((p) => p.score != null)
    .slice(-7)
    .map((p) => ({ run_date: p.run_date, score: Number(p.score) }));

  if (data.length < 2) {
    return (
      <div className="h-12 flex items-center text-xs" style={{ color: "var(--ct-text-muted)" }}>
        Not enough history yet
      </div>
    );
  }

  const last = points[points.length - 1];
  const lineColor = last ? STATUS_COLOR[last.status] : "var(--accent-light)";

  return (
    <div className="h-12">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <YAxis hide domain={["auto", "auto"]} />
          <Line
            type="monotone"
            dataKey="score"
            stroke={lineColor}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function CheckpointsPage() {
  const [latest, setLatest] = useState<LatestResponse | null>(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    setError("");
    try {
      const [latestRes, historyRes] = await Promise.all([
        api.get("/monitoring/checkpoints"),
        api.get("/monitoring/checkpoints/history?days=7"),
      ]);
      setLatest(latestRes.data);
      setHistory(historyRes.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to load checkpoint data");
    } finally {
      setLoading(false);
    }
  }

  const checkpoints = latest?.checkpoints || [];

  return (
    <Layout title="Forecast Checkpoints">
      <div className="space-y-6">
        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold" style={{ color: "var(--ct-text-primary)" }}>
              Forecast Checkpoints
            </h1>
            <p className="text-xs mt-0.5" style={{ color: "var(--ct-text-muted)" }}>
              Nightly sanity checks on the forecast engine
            </p>
          </div>
          <div className="flex items-center gap-3">
            {latest && <StatusBadge status={latest.overall_status} />}
            <button
              onClick={fetchAll}
              disabled={loading}
              className="px-3 py-2 text-sm border rounded-[var(--r-lg)] hover:bg-[var(--ct-surface-hover)] disabled:opacity-50"
              style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)", color: "var(--ct-text-secondary)" }}
            >
              {loading ? "Refreshing..." : "↻ Refresh"}
            </button>
          </div>
        </div>

        {error && (
          <p className="text-xs px-3 py-2 rounded-[var(--r-lg)] border" style={{ color: "var(--danger-light)", background: "var(--danger-light-tint)", borderColor: "var(--danger-light-tint)" }}>
            ⚠ {error}
          </p>
        )}

        {loading && !latest ? (
          <div className="text-center py-12 text-sm" style={{ color: "var(--ct-text-muted)" }}>
            Loading...
          </div>
        ) : checkpoints.length === 0 ? (
          <div className="rounded-[var(--r-lg)] border border-dashed p-12 text-center" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
            <p className="text-sm" style={{ color: "var(--ct-text-muted)" }}>
              No checkpoint runs yet. The nightly job writes to forecast_checkpoints.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {checkpoints.map((cp) => {
              const trend = history?.history?.[String(cp.checkpoint_id)] || [];
              return (
                <div
                  key={cp.checkpoint_id}
                  className="rounded-[var(--r-lg)] border p-4 space-y-3"
                  style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wide" style={{ color: "var(--ct-text-muted)" }}>
                        Checkpoint {cp.checkpoint_id}
                      </p>
                      <p className="text-sm font-semibold mt-0.5" style={{ color: "var(--ct-text-primary)" }}>
                        {cp.checkpoint_name}
                      </p>
                    </div>
                    <StatusBadge status={cp.status} />
                  </div>

                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold" style={{ color: "var(--ct-text-primary)" }}>
                      {fmtScore(cp.score)}
                    </span>
                    {cp.threshold_green != null && (
                      <span className="text-xs" style={{ color: "var(--ct-text-muted)" }}>
                        green ≤ {cp.threshold_green} · red &gt; {cp.threshold_red}
                      </span>
                    )}
                  </div>

                  <p className="text-xs" style={{ color: "var(--ct-text-secondary)" }}>
                    {cp.message}
                  </p>

                  <TrendChart points={trend} />

                  <p className="text-xs pt-2 border-t" style={{ color: "var(--ct-text-muted)", borderColor: "var(--ct-border-subtle)" }}>
                    Last run {cp.run_date}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
