import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import PastDueLayout from "../../components/PastDueLayout";

const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8001";

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

const TIER_STYLE: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-700",
  HIGH: "bg-orange-100 text-orange-700",
  MEDIUM: "bg-amber-100 text-amber-700",
  LOW: "bg-green-100 text-green-700",
};

const STAGE_STYLE: Record<string, string> = {
  REMINDER: "bg-blue-100 text-blue-700",
  DNP_NOTICE: "bg-orange-100 text-orange-700",
  DNP_ACTIVE: "bg-red-100 text-red-700",
  MVO: "bg-red-200 text-red-800",
  EMAIL_OUTREACH: "bg-sky-100 text-sky-700",
  CHASING: "bg-amber-100 text-amber-700",
  DEMAND_SENT: "bg-orange-100 text-orange-700",
  IN_LEGAL: "bg-red-100 text-red-700",
  RESOLVED: "bg-green-100 text-green-700",
  WRITTEN_OFF: "bg-gray-100 text-gray-500",
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
    const res = await fetch(`${API}/api/collections/dashboard`);
    if (res.ok) setSummary(await res.json());
  };

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
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
      const res = await fetch(`${API}/api/collections/accounts?${params}`);
      const data: ListResponse = await res.json();
      setAccounts(data.results ?? []);
      setTotal(data.total ?? 0);
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
      {/* ── Summary cards ── */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
          {[
            {
              label: "Total accounts",
              value: summary.total_accounts,
              color: "text-gray-900",
            },
            {
              label: "At risk",
              value: fmt(summary.total_at_risk),
              color: "text-red-600",
            },
            {
              label: "Active track",
              value: summary.active_track_count,
              color: "text-blue-600",
            },
            {
              label: "Inactive track",
              value: summary.inactive_track_count,
              color: "text-indigo-600",
            },
            {
              label: "Pending approvals",
              value: summary.pending_approvals,
              color:
                summary.pending_approvals > 0
                  ? "text-amber-600"
                  : "text-gray-400",
            },
            {
              label: "ETF open",
              value: summary.etf_open_count,
              color:
                summary.etf_open_count > 0 ? "text-amber-600" : "text-gray-400",
            },
            {
              label: "Critical",
              value: summary.critical_accounts,
              color:
                summary.critical_accounts > 0
                  ? "text-red-600"
                  : "text-gray-400",
            },
            {
              label: "Resolved / mo",
              value: summary.resolved_this_month,
              color: "text-green-600",
            },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-white rounded-lg border border-gray-200 px-3 py-3"
            >
              <p className="text-xs text-gray-400 mb-1 leading-tight">
                {s.label}
              </p>
              <p className={`text-lg font-semibold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Aging buckets ── */}
      {summary?.aging && summary.aging.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 px-5 py-4 mb-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-700">Aging breakdown</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 uppercase tracking-wide">
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
              <tbody className="divide-y divide-gray-100">
                {summary.aging.map((row) => (
                  <tr key={row.track}>
                    <td className="py-2 pr-6 font-medium text-gray-700">
                      {row.track}
                    </td>
                    <td className="py-2 pr-4 text-right text-blue-600">
                      {fmt(row.bucket_1_30)}
                    </td>
                    <td className="py-2 pr-4 text-right text-amber-600">
                      {fmt(row.bucket_31_60)}
                    </td>
                    <td className="py-2 pr-4 text-right text-orange-600">
                      {fmt(row.bucket_61_90)}
                    </td>
                    <td className="py-2 pr-4 text-right text-red-600">
                      {fmt(row.bucket_91_120)}
                    </td>
                    <td className="py-2 pr-4 text-right text-red-700 font-medium">
                      {fmt(row.bucket_120_plus)}
                    </td>
                    <td className="py-2 pr-4 text-right font-semibold text-gray-900">
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
      <div className="bg-white rounded-lg border border-gray-200 px-5 py-4 mb-4">
        {/* Track tabs */}
        <div className="flex gap-1 mb-4 border-b border-gray-200 -mx-5 px-5">
          {(["ALL", "ACTIVE", "INACTIVE"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setActiveTab(t);
                setPage(1);
              }}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors
                ${activeTab === t ? "border-sky-500 text-sky-600" : "border-transparent text-gray-400 hover:text-gray-600"}`}
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
                className="px-3 py-1.5 text-sm font-medium text-amber-600 flex items-center gap-1.5 hover:bg-amber-50 rounded transition-colors"
              >
                <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs flex items-center justify-center font-bold">
                  {summary.pending_approvals}
                </span>
                Pending approvals
              </button>
            )}
            <button
              onClick={() => router.push("/past-due/upload")}
              className="px-4 py-1.5 text-sm bg-sky-500 hover:bg-sky-600 text-white rounded font-medium transition-colors"
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
            className="border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-sky-500 w-56"
          />
          <select
            value={stageFilter}
            onChange={(e) => {
              setStageFilter(e.target.value);
              setPage(1);
            }}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-600 outline-none focus:ring-2 focus:ring-sky-500"
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
            className="border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-600 outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="">All tiers</option>
            {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={etfOnly}
              onChange={(e) => {
                setEtfOnly(e.target.checked);
                setPage(1);
              }}
              className="rounded accent-amber-500"
            />
            ETF open
          </label>
          <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={legalOnly}
              onChange={(e) => {
                setLegalOnly(e.target.checked);
                setPage(1);
              }}
              className="rounded accent-red-500"
            />
            In legal
          </label>
          <span className="ml-auto text-sm text-gray-400">
            {(total ?? 0).toLocaleString()} accounts
          </span>
        </div>
      </div>

      {/* ── Account table ── */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
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
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={11} className="py-16 text-center text-gray-400">
                    Loading...
                  </td>
                </tr>
              ) : accounts.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-16 text-center text-gray-400">
                    No accounts found
                  </td>
                </tr>
              ) : (
                accounts.map((a) => (
                  <tr
                    key={a.id}
                    onClick={() => router.push(`/past-due/${a.id}`)}
                    className="hover:bg-sky-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800 truncate max-w-[180px]">
                        {a.customer_name}
                      </p>
                      <p className="text-xs text-gray-400">
                        {a.account_number}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 font-mono">
                      {a.esiid}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium
                        ${a.track === "ACTIVE" ? "bg-blue-100 text-blue-700" : "bg-indigo-100 text-indigo-700"}`}
                      >
                        {a.track}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${STAGE_STYLE[a.stage] || "bg-gray-100 text-gray-600"}`}
                      >
                        {STAGE_LABEL[a.stage] || a.stage}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {fmt(a.total_due)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {fmt(a.usage_balance)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {a.etf_amount > 0 ? (
                        <span
                          className={
                            a.etf_flag
                              ? "text-amber-600 font-medium"
                              : "text-gray-500"
                          }
                        >
                          {fmt(a.etf_amount)}
                          {a.etf_flag && (
                            <span className="ml-1 text-xs bg-amber-100 text-amber-700 px-1 rounded">
                              !
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`font-medium ${a.days_overdue > 90 ? "text-red-600" : a.days_overdue > 60 ? "text-orange-600" : a.days_overdue > 30 ? "text-amber-600" : "text-gray-600"}`}
                      >
                        {a.days_overdue}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${TIER_STYLE[a.delinquency_tier] || "bg-gray-100 text-gray-500"}`}
                      >
                        {a.delinquency_tier}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-[120px] truncate">
                      {a.broker_name || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {a.is_legal && (
                          <span className="px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-700">
                            Legal
                          </span>
                        )}
                        {a.is_dnp_active && (
                          <span className="px-1.5 py-0.5 rounded text-xs bg-orange-100 text-orange-700">
                            DNP
                          </span>
                        )}
                        {a.is_flagged && (
                          <span className="px-1.5 py-0.5 rounded text-xs bg-yellow-100 text-yellow-700">
                            ⚑
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="border-t border-gray-200 px-4 py-3 flex items-center justify-between text-sm text-gray-500">
            <span>
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)}{" "}
              of {total.toLocaleString()}
            </span>
            <div className="flex gap-1">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-30"
              >
                ←
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`px-3 py-1 rounded border transition-colors ${p === page ? "bg-sky-500 border-sky-500 text-white" : "border-gray-200 hover:bg-gray-50"}`}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-30"
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
