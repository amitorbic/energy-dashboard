import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import api from "../../utils/api";
// ── Types ─────────────────────────────────────────────────────────────────────

interface Payment {
  id: number;
  esiid: string;
  customer_name: string;
  payment_date: string;
  received_date: string;
  amount: number;
  method: string;
  applied_to: string;
  balance_before: number;
  balance_after: number;
  usage_balance_after: number;
  etf_balance_after: number;
  triggered_etf_flag: boolean;
  status: string;
  source: string;
  entered_by: string;
  is_bounced: boolean;
  bounce_reason?: string;
  created_at: string;
}

interface DailySummary {
  date: string;
  total_received: number;
  payment_count: number;
  by_method: Record<string, number>;
  etf_flags_triggered: number;
  bounced_count: number;
  bounced_amount: number;
  accounts_resolved: number;
}

interface ListResponse {
  total: number;
  page: number;
  page_size: number;
  results: Payment[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    n,
  );

const STATUS_STYLE: Record<string, string> = {
  POSTED: "bg-green-100 text-green-700",
  BOUNCED: "bg-red-100 text-red-700",
  REVERSED: "bg-amber-100 text-amber-700",
  UNDER_REVIEW: "bg-purple-100 text-purple-700",
};

const METHOD_STYLE: Record<string, string> = {
  ACH: "bg-blue-100 text-blue-700",
  CC: "bg-indigo-100 text-indigo-700",
  CHECK: "bg-amber-100 text-amber-700",
  WIRE: "bg-green-100 text-green-700",
  OTHER: "bg-gray-100 text-gray-600",
};

// ── Bounce Modal ──────────────────────────────────────────────────────────────

function BounceModal({
  payment,
  onClose,
  onConfirm,
}: {
  payment: Payment;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
        <h3 className="text-base font-semibold text-gray-900">
          Mark payment as bounced
        </h3>
        <div className="text-sm text-gray-600 space-y-1 bg-gray-50 rounded p-3">
          <p className="font-medium text-gray-800">{payment.customer_name}</p>
          <p>
            {fmt(payment.amount)} via {payment.method}
          </p>
          <p className="text-red-600 text-xs mt-2">
            This will reverse the balance update on the account.
          </p>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">
            Bounce reason
          </label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="NSF, Account closed, Stop payment..."
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-sm border border-gray-300 rounded text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            disabled={!reason.trim() || loading}
            onClick={async () => {
              setLoading(true);
              await onConfirm(reason);
              setLoading(false);
            }}
            className="flex-1 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Recording..." : "Mark bounced"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PaymentsPage() {
  const router = useRouter();

  const [payments, setPayments] = useState<Payment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [bounceTarget, setBounceTarget] = useState<Payment | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [bouncedOnly, setBouncedOnly] = useState(false);
  const [etfOnly, setEtfOnly] = useState(false);

  const PAGE_SIZE = 50;

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(PAGE_SIZE),
    });
    if (search) params.set("customer_name", search);
    if (statusFilter) params.set("status", statusFilter);
    if (methodFilter) params.set("method", methodFilter);
    if (sourceFilter) params.set("source", sourceFilter);
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    if (bouncedOnly) params.set("bounced_only", "true");
    if (etfOnly) params.set("etf_flag_only", "true");

    try {
      const res = await api.get(`/payments?${params}`);
      const data: ListResponse = res.data;
      setPayments(data.results ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, [
    page,
    search,
    statusFilter,
    methodFilter,
    sourceFilter,
    dateFrom,
    dateTo,
    bouncedOnly,
    etfOnly,
  ]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  useEffect(() => {
    api.get('/payments/summary/today')
      .then((res) => setSummary(res.data))
      .catch(() => {});
  }, []);

  const handleBounce = async (reason: string) => {
    if (!bounceTarget) return;
    await api.patch(`/payments/${bounceTarget.id}/bounce`, { bounce_reason: reason });
    setBounceTarget(null);
    fetchPayments();
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <Layout title="Payment Ledger">
      {bounceTarget && (
        <BounceModal
          payment={bounceTarget}
          onClose={() => setBounceTarget(null)}
          onConfirm={handleBounce}
        />
      )}

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          Failed to load payments: {error}
        </div>
      )}

      {/* Today's summary bar */}
      {summary && (
        <div className="bg-white rounded-lg border border-gray-200 px-5 py-3 mb-5 flex flex-wrap items-center gap-6 text-sm">
          <span className="font-medium text-gray-500">Today</span>
          <span>
            <span className="font-semibold text-gray-900">
              {fmt(summary.total_received)}
            </span>
            <span className="text-gray-400 ml-1">
              ({summary.payment_count} payments)
            </span>
          </span>
          {summary.bounced_count > 0 && (
            <span className="text-red-600 font-medium">
              {summary.bounced_count} bounced
              <span className="text-red-400 font-normal ml-1">
                ({fmt(summary.bounced_amount)})
              </span>
            </span>
          )}
          {summary.etf_flags_triggered > 0 && (
            <span className="text-amber-600 font-medium">
              {summary.etf_flags_triggered} ETF flag
              {summary.etf_flags_triggered > 1 ? "s" : ""}
            </span>
          )}
          {summary.accounts_resolved > 0 && (
            <span className="text-green-600 font-medium">
              {summary.accounts_resolved} resolved
            </span>
          )}
          <div className="ml-auto flex gap-4 text-xs text-gray-400">
            {summary.by_method &&
              Object.entries(summary.by_method).map(([m, v]) => (
                <span key={m}>
                  {m} {fmt(v)}
                </span>
              ))}
          </div>
          <button
            onClick={() => router.push("/payments/upload")}
            className="ml-2 px-4 py-1.5 text-sm bg-sky-500 hover:bg-sky-600 text-white rounded font-medium transition-colors"
          >
            + Upload sheet
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 px-5 py-4 mb-4">
        <div className="flex flex-wrap gap-2 items-center">
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search customer..."
            className="border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-sky-500 w-48"
          />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-600 outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="">All statuses</option>
            <option value="POSTED">Posted</option>
            <option value="BOUNCED">Bounced</option>
            <option value="REVERSED">Reversed</option>
          </select>
          <select
            value={methodFilter}
            onChange={(e) => {
              setMethodFilter(e.target.value);
              setPage(1);
            }}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-600 outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="">All methods</option>
            {["ACH", "CC", "CHECK", "WIRE", "OTHER"].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select
            value={sourceFilter}
            onChange={(e) => {
              setSourceFilter(e.target.value);
              setPage(1);
            }}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-600 outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="">All sources</option>
            <option value="PAYMENT_SHEET">Payment sheet</option>
            <option value="BILLING_SHEET">Billing sheet</option>
            <option value="MANUAL">Manual</option>
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-600 outline-none focus:ring-2 focus:ring-sky-500"
          />
          <span className="text-gray-400 text-sm">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-600 outline-none focus:ring-2 focus:ring-sky-500"
          />
          <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={bouncedOnly}
              onChange={(e) => {
                setBouncedOnly(e.target.checked);
                setPage(1);
              }}
              className="rounded accent-red-500"
            />
            Bounced only
          </label>
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
            ETF flag only
          </label>
          <span className="ml-auto text-sm text-gray-400">
            {(total ?? 0).toLocaleString()} total
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
                <th className="text-left px-4 py-3 font-medium">Customer</th>
                <th className="text-left px-4 py-3 font-medium">ESIID</th>
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-right px-4 py-3 font-medium">Amount</th>
                <th className="text-left px-4 py-3 font-medium">Method</th>
                <th className="text-left px-4 py-3 font-medium">Applied to</th>
                <th className="text-right px-4 py-3 font-medium">
                  Balance after
                </th>
                <th className="text-right px-4 py-3 font-medium">
                  Usage after
                </th>
                <th className="text-right px-4 py-3 font-medium">ETF after</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={12} className="py-16 text-center text-gray-400">
                    Loading...
                  </td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-16 text-center text-gray-400">
                    No payments found
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-800 max-w-[160px] truncate">
                      {p.customer_name}
                    </td>
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">
                      {p.esiid}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {new Date(p.payment_date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {fmt(p.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${METHOD_STYLE[p.method] || "bg-gray-100 text-gray-600"}`}
                      >
                        {p.method}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {p.applied_to}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={
                          p.balance_after === 0
                            ? "font-semibold text-green-600"
                            : "text-gray-700"
                        }
                      >
                        {fmt(p.balance_after)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">
                      {fmt(p.usage_balance_after)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {p.etf_balance_after > 0 ? (
                        <span
                          className={
                            p.triggered_etf_flag
                              ? "text-amber-600 font-medium"
                              : "text-gray-500"
                          }
                        >
                          {fmt(p.etf_balance_after)}
                          {p.triggered_etf_flag && (
                            <span className="ml-1 text-xs bg-amber-100 text-amber-700 px-1 py-0.5 rounded">
                              ETF
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLE[p.status] || "bg-gray-100 text-gray-600"}`}
                      >
                        {p.status.toLowerCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {p.source.replace(/_/g, " ").toLowerCase()}
                    </td>
                    <td className="px-4 py-3">
                      {p.status === "POSTED" && (
                        <button
                          onClick={() => setBounceTarget(p)}
                          className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                          title="Mark as bounced"
                        >
                          Bounce
                        </button>
                      )}
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
                className="px-3 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-30 transition-colors"
              >
                ←
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`px-3 py-1 rounded border transition-colors ${
                      p === page
                        ? "bg-sky-500 border-sky-500 text-white"
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-30 transition-colors"
              >
                →
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
