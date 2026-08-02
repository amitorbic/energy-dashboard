import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import PastDueLayout from "../../components/PastDueLayout";
import api from "../../utils/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DashboardSummary {
  total_accounts: number;
  total_at_risk: number;
  active_track_count: number;
  inactive_track_count: number;
  pending_approvals: number;
  etf_open_count: number;
  critical_accounts: number;
  resolved_this_month: number;
  by_stage: Array<{ stage: string; count: number; total_due: number }>;
  aging: Array<{
    track: string;
    bucket_1_30: number;
    bucket_31_60: number;
    bucket_61_90: number;
    bucket_91_120: number;
    bucket_120_plus: number;
    total_due: number;
  }>;
}

interface Account {
  id: number;
  customer_name: string;
  account_number: string;
  esiid: string;
  track: string;
  stage: string;
  total_due: number;
  usage_balance: number;
  etf_amount: number;
  etf_flag: boolean;
  days_overdue: number;
  delinquency_tier: string;
  is_legal: boolean;
  is_dnp_active: boolean;
  is_flagged: boolean;
  broker_name: string | null;
  assigned_to: string | null;
  priority: string;
  created_at: string;
}

interface ListResponse {
  total: number;
  page: number;
  page_size: number;
  results: Account[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    n,
  );

// Semantic tiers, shared across tier/stage badges below. Only the design
// system's four semantic hues (danger/amber/success/info) plus neutral are
// available, so multi-hue severity scales (e.g. red/orange/amber/green)
// collapse onto this smaller vocabulary while preserving relative ordering.
const SEMANTIC: Record<string, { background: string; color: string }> = {
  danger: { background: "var(--danger-light-tint)", color: "var(--danger-light)" },
  amber: { background: "var(--amber-light-tint)", color: "var(--amber-light)" },
  success: { background: "var(--success-light-tint)", color: "var(--success-light)" },
  info: { background: "var(--info-light-tint)", color: "var(--info-light)" },
  neutral: { background: "var(--ct-surface-hover)", color: "var(--ct-text-secondary)" },
};

const TIER_TONE: Record<string, keyof typeof SEMANTIC> = {
  CRITICAL: "danger",
  HIGH: "danger",
  MEDIUM: "amber",
  LOW: "success",
};

const STAGE_TONE: Record<string, keyof typeof SEMANTIC> = {
  REMINDER: "info",
  DNP_NOTICE: "amber",
  DNP_ACTIVE: "danger",
  MVO: "danger",
  EMAIL_OUTREACH: "info",
  CHASING: "amber",
  DEMAND_SENT: "amber",
  IN_LEGAL: "danger",
  RESOLVED: "success",
  WRITTEN_OFF: "neutral",
};

const STAGE_LABEL: Record<string, string> = {
  REMINDER: "Reminder",
  DNP_NOTICE: "DNP Notice",
  DNP_ACTIVE: "DNP Active",
  MVO: "MVO",
  EMAIL_OUTREACH: "Email Outreach",
  CHASING: "Chasing",
  DEMAND_SENT: "Demand Sent",
  IN_LEGAL: "In Legal",
  RESOLVED: "Resolved",
  WRITTEN_OFF: "Written Off",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function PastDueDashboard() {
  const router = useRouter();

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"ALL" | "ACTIVE" | "INACTIVE">(
    "ALL",
  );

  // Filters
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [etfOnly, setEtfOnly] = useState(false);
  const [legalOnly, setLegalOnly] = useState(false);

  const PAGE_SIZE = 50;

  const fetchSummary = async () => {
    try {
      const res = await api.get('/collections/dashboard');
      setSummary(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load summary");
    }
  };

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(PAGE_SIZE),
    });
    if (activeTab !== "ALL") params.set("track", activeTab);
    if (search) params.set("search", search);
    if (stageFilter) params.set("stage", stageFilter);
    if (tierFilter) params.set("tier", tierFilter);
    if (etfOnly) params.set("etf_flag", "true");
    if (legalOnly) params.set("is_legal", "true");

    try {
      const res = await api.get(`/collections/accounts?${params}`);
      const data: ListResponse = res.data;
      setAccounts(data.results ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, [page, activeTab, search, stageFilter, tierFilter, etfOnly, legalOnly]);

  useEffect(() => {
    fetchSummary();
  }, []);
  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <PastDueLayout title="Past Due Portal">
      {error && (
        <div className="mb-4 rounded-[var(--r-lg)] border px-4 py-3 text-sm" style={{ background: "var(--danger-light-tint)", borderColor: "var(--danger-light-tint)", color: "var(--danger-light)" }}>
          Failed to load: {error}
        </div>
      )}

      {/* ── Summary cards ── */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
          {[
            {
              label: "Total accounts",
              value: summary.total_accounts,
              color: "var(--ct-text-primary)",
            },
            {
              label: "At risk",
              value: fmt(summary.total_at_risk),
              color: "var(--danger-light)",
            },
            {
              label: "Active track",
              value: summary.active_track_count,
              color: "var(--ct-text-primary)",
            },
            {
              label: "Inactive track",
              value: summary.inactive_track_count,
              color: "var(--ct-text-primary)",
            },
            {
              label: "Pending approvals",
              value: summary.pending_approvals,
              color:
                summary.pending_approvals > 0
                  ? "var(--amber-light)"
                  : "var(--ct-text-muted)",
            },
            {
              label: "ETF open",
              value: summary.etf_open_count,
              color:
                summary.etf_open_count > 0 ? "var(--amber-light)" : "var(--ct-text-muted)",
            },
            {
              label: "Critical",
              value: summary.critical_accounts,
              color:
                summary.critical_accounts > 0
                  ? "var(--danger-light)"
                  : "var(--ct-text-muted)",
            },
            {
              label: "Resolved / mo",
              value: summary.resolved_this_month,
              color: "var(--success-light)",
            },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-[var(--r-lg)] border px-3 py-3"
              style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}
            >
              <p className="text-xs mb-1 leading-tight" style={{ color: "var(--ct-text-muted)" }}>
                {s.label}
              </p>
              <p className="text-lg font-semibold" style={{ color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Aging buckets ── */}
      {summary?.aging && summary.aging.length > 0 && (
        <div className="rounded-[var(--r-lg)] border px-5 py-4 mb-5" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium" style={{ color: "var(--ct-text-secondary)" }}>Aging breakdown</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="uppercase tracking-wide" style={{ color: "var(--ct-text-muted)" }}>
                  <th className="text-left py-1 pr-6 font-medium">Track</th>
                  {[
                    "1–30 days",
                    "31–60",
                    "61–90",
                    "91–120",
                    "120+",
                    "Total",
                  ].map((h) => (
                    <th key={h} className="text-right py-1 pr-4 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: "var(--ct-border-subtle)" }}>
                {summary.aging.map((row) => (
                  <tr key={row.track}>
                    <td className="py-2 pr-6 font-medium" style={{ color: "var(--ct-text-secondary)" }}>
                      {row.track}
                    </td>
                    <td className="py-2 pr-4 text-right" style={{ color: "var(--info-light)" }}>
                      {fmt(row.bucket_1_30)}
                    </td>
                    <td className="py-2 pr-4 text-right" style={{ color: "var(--amber-light)" }}>
                      {fmt(row.bucket_31_60)}
                    </td>
                    <td className="py-2 pr-4 text-right" style={{ color: "var(--amber-light)" }}>
                      {fmt(row.bucket_61_90)}
                    </td>
                    <td className="py-2 pr-4 text-right" style={{ color: "var(--danger-light)" }}>
                      {fmt(row.bucket_91_120)}
                    </td>
                    <td className="py-2 pr-4 text-right font-medium" style={{ color: "var(--danger-light)" }}>
                      {fmt(row.bucket_120_plus)}
                    </td>
                    <td className="py-2 pr-4 text-right font-semibold" style={{ color: "var(--ct-text-primary)" }}>
                      {fmt(row.total_due)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Filters + tabs ── */}
      <div className="rounded-[var(--r-lg)] border px-5 py-4 mb-4" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
        {/* Track tabs */}
        <div className="flex gap-1 mb-4 border-b -mx-5 px-5" style={{ borderColor: "var(--ct-border-default)" }}>
          {(["ALL", "ACTIVE", "INACTIVE"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setActiveTab(t);
                setPage(1);
              }}
              className="px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors"
              style={activeTab === t
                ? { borderColor: "var(--accent-light)", color: "var(--accent-light)" }
                : { borderColor: "transparent", color: "var(--ct-text-muted)" }}
            >
              {t === "ALL"
                ? "All accounts"
                : t === "ACTIVE"
                  ? "Active customers"
                  : "Inactive / collections"}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 pb-1">
            {summary && summary.pending_approvals > 0 && (
              <button
                onClick={() => router.push("/past-due/approvals")}
                className="px-3 py-1.5 text-sm font-medium flex items-center gap-1.5 rounded-[var(--r-sm)] transition-colors hover:bg-[var(--amber-light-tint)]"
                style={{ color: "var(--amber-light)" }}
              >
                <span
                  className="w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold"
                  style={{ background: "var(--amber-light-tint)", color: "var(--amber-light)" }}
                >
                  {summary.pending_approvals}
                </span>
                Pending approvals
              </button>
            )}
            <button
              onClick={() => router.push("/past-due/upload")}
              className="px-4 py-1.5 text-sm rounded-[var(--r-sm)] font-medium transition-colors"
              style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
            >
              + Import AR sheet
            </button>
          </div>
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap gap-2 items-center">
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search name, ESIID, account..."
            className="rounded-[var(--r-sm)] border px-3 py-1.5 text-sm outline-none w-56 focus:border-[var(--accent-light)]"
            style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
          />
          <select
            value={stageFilter}
            onChange={(e) => {
              setStageFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-[var(--r-sm)] border px-3 py-1.5 text-sm outline-none focus:border-[var(--accent-light)]"
            style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-secondary)" }}
          >
            <option value="">All stages</option>
            {Object.entries(STAGE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <select
            value={tierFilter}
            onChange={(e) => {
              setTierFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-[var(--r-sm)] border px-3 py-1.5 text-sm outline-none focus:border-[var(--accent-light)]"
            style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-secondary)" }}
          >
            <option value="">All tiers</option>
            {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-sm cursor-pointer" style={{ color: "var(--ct-text-secondary)" }}>
            <input
              type="checkbox"
              checked={etfOnly}
              onChange={(e) => {
                setEtfOnly(e.target.checked);
                setPage(1);
              }}
              className="rounded-[var(--r-sm)]"
              style={{ accentColor: "var(--accent-light)" }}
            />
            ETF open
          </label>
          <label className="flex items-center gap-1.5 text-sm cursor-pointer" style={{ color: "var(--ct-text-secondary)" }}>
            <input
              type="checkbox"
              checked={legalOnly}
              onChange={(e) => {
                setLegalOnly(e.target.checked);
                setPage(1);
              }}
              className="rounded-[var(--r-sm)]"
              style={{ accentColor: "var(--accent-light)" }}
            />
            In legal
          </label>
          <span className="ml-auto text-sm" style={{ color: "var(--ct-text-muted)" }}>
            {(total ?? 0).toLocaleString()} accounts
          </span>
        </div>
      </div>

      {/* ── Account table ── */}
      <div className="rounded-[var(--r-lg)] border overflow-hidden" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)", color: "var(--ct-text-muted)" }}>
                <th className="text-left px-4 py-3 font-medium">Customer</th>
                <th className="text-left px-4 py-3 font-medium">ESIID</th>
                <th className="text-left px-4 py-3 font-medium">Track</th>
                <th className="text-left px-4 py-3 font-medium">Stage</th>
                <th className="text-right px-4 py-3 font-medium">Total due</th>
                <th className="text-right px-4 py-3 font-medium">Usage</th>
                <th className="text-right px-4 py-3 font-medium">ETF</th>
                <th className="text-right px-4 py-3 font-medium">Days</th>
                <th className="text-left px-4 py-3 font-medium">Tier</th>
                <th className="text-left px-4 py-3 font-medium">Broker</th>
                <th className="text-left px-4 py-3 font-medium">Flags</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "var(--ct-border-subtle)" }}>
              {loading ? (
                <tr>
                  <td colSpan={11} className="py-16 text-center" style={{ color: "var(--ct-text-muted)" }}>
                    Loading...
                  </td>
                </tr>
              ) : accounts.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-16 text-center" style={{ color: "var(--ct-text-muted)" }}>
                    No accounts found
                  </td>
                </tr>
              ) : (
                accounts.map((a) => {
                  const daysColor =
                    a.days_overdue > 90
                      ? "var(--danger-light)"
                      : a.days_overdue > 30
                        ? "var(--amber-light)"
                        : "var(--ct-text-secondary)";
                  const tierTone = SEMANTIC[TIER_TONE[a.delinquency_tier]] || SEMANTIC.neutral;
                  const stageTone = SEMANTIC[STAGE_TONE[a.stage]] || SEMANTIC.neutral;
                  return (
                    <tr
                      key={a.id}
                      onClick={() => router.push(`/past-due/${a.id}`)}
                      className="cursor-pointer transition-colors hover:bg-[var(--accent-light-tint)]"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium truncate max-w-[180px]" style={{ color: "var(--ct-text-primary)" }}>
                          {a.customer_name}
                        </p>
                        <p className="text-xs" style={{ color: "var(--ct-text-muted)" }}>
                          {a.account_number}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono" style={{ color: "var(--ct-text-muted)" }}>
                        {a.esiid}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="px-2 py-0.5 rounded-[var(--r-sm)] text-xs font-medium"
                          style={{ background: "var(--accent-light-tint)", color: "var(--accent-light)" }}
                        >
                          {a.track}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="px-2 py-0.5 rounded-[var(--r-sm)] text-xs font-medium"
                          style={stageTone}
                        >
                          {STAGE_LABEL[a.stage] || a.stage}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold" style={{ color: "var(--ct-text-primary)" }}>
                        {fmt(a.total_due)}
                      </td>
                      <td className="px-4 py-3 text-right" style={{ color: "var(--ct-text-secondary)" }}>
                        {fmt(a.usage_balance)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {a.etf_amount > 0 ? (
                          <span
                            style={{
                              color: a.etf_flag ? "var(--amber-light)" : "var(--ct-text-secondary)",
                              fontWeight: a.etf_flag ? 500 : 400,
                            }}
                          >
                            {fmt(a.etf_amount)}
                            {a.etf_flag && (
                              <span
                                className="ml-1 text-xs px-1 rounded-[var(--r-sm)]"
                                style={{ background: "var(--amber-light-tint)", color: "var(--amber-light)" }}
                              >
                                !
                              </span>
                            )}
                          </span>
                        ) : (
                          <span style={{ color: "var(--ct-text-muted)" }}>—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-medium" style={{ color: daysColor }}>
                          {a.days_overdue}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="px-2 py-0.5 rounded-[var(--r-sm)] text-xs font-medium"
                          style={tierTone}
                        >
                          {a.delinquency_tier}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs max-w-[120px] truncate" style={{ color: "var(--ct-text-secondary)" }}>
                        {a.broker_name || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {a.is_legal && (
                            <span className="px-1.5 py-0.5 rounded-[var(--r-sm)] text-xs" style={{ background: "var(--danger-light-tint)", color: "var(--danger-light)" }}>
                              Legal
                            </span>
                          )}
                          {a.is_dnp_active && (
                            <span className="px-1.5 py-0.5 rounded-[var(--r-sm)] text-xs" style={{ background: "var(--danger-light-tint)", color: "var(--danger-light)" }}>
                              DNP
                            </span>
                          )}
                          {a.is_flagged && (
                            <span className="px-1.5 py-0.5 rounded-[var(--r-sm)] text-xs" style={{ background: "var(--amber-light-tint)", color: "var(--amber-light)" }}>
                              ⚑
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="border-t px-4 py-3 flex items-center justify-between text-sm" style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-muted)" }}>
            <span>
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)}{" "}
              of {total.toLocaleString()}
            </span>
            <div className="flex gap-1">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1 rounded-[var(--r-sm)] border transition-colors hover:bg-[var(--ct-surface-hover)] disabled:opacity-30"
                style={{ borderColor: "var(--ct-border-default)" }}
              >
                ←
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className="px-3 py-1 rounded-[var(--r-sm)] border transition-colors"
                    style={p === page
                      ? { background: "var(--accent-light)", borderColor: "var(--accent-light)", color: "var(--accent-light-on-solid)" }
                      : { borderColor: "var(--ct-border-default)" }}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 rounded-[var(--r-sm)] border transition-colors hover:bg-[var(--ct-surface-hover)] disabled:opacity-30"
                style={{ borderColor: "var(--ct-border-default)" }}
              >
                →
              </button>
            </div>
          </div>
        )}
      </div>
    </PastDueLayout>
  );
}
