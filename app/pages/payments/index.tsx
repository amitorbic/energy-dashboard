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

// Status carries genuine meaning (posted/bounced/reversed/under review) so it
// keeps semantic tokens; UNDER_REVIEW has no dedicated hue in the design
// system, so it borrows info (a neutral "needs attention" signal).
const STATUS_STYLE: Record<string, { background: string; color: string }> = {
  POSTED: { background: "var(--success-light-tint)", color: "var(--success-light)" },
  BOUNCED: { background: "var(--danger-light-tint)", color: "var(--danger-light)" },
  REVERSED: { background: "var(--amber-light-tint)", color: "var(--amber-light)" },
  UNDER_REVIEW: { background: "var(--info-light-tint)", color: "var(--info-light)" },
};

// Payment method is a category label, not a status — collapses to the shared
// accent tint (same treatment as the Track badge in past-due/index.tsx).
const METHOD_TINT = { background: "var(--accent-light-tint)", color: "var(--accent-light)" };

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
      <div className="rounded-[var(--r-lg)] shadow-xl w-full max-w-md p-6 space-y-4" style={{ background: "var(--ct-surface)" }}>
        <h3 className="text-base font-semibold" style={{ color: "var(--ct-text-primary)" }}>
          Mark payment as bounced
        </h3>
        <div className="text-sm space-y-1 rounded-[var(--r-md)] p-3" style={{ color: "var(--ct-text-secondary)", background: "var(--ct-surface-hover)" }}>
          <p className="font-medium" style={{ color: "var(--ct-text-primary)" }}>{payment.customer_name}</p>
          <p>
            {fmt(payment.amount)} via {payment.method}
          </p>
          <p className="text-xs mt-2" style={{ color: "var(--danger-light)" }}>
            This will reverse the balance update on the account.
          </p>
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--ct-text-secondary)" }}>
            Bounce reason
          </label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="NSF, Account closed, Stop payment..."
            className="w-full rounded-[var(--r-sm)] border px-3 py-2 text-sm outline-none focus:border-[var(--accent-light)]"
            style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-sm rounded-[var(--r-sm)] border transition-colors hover:bg-[var(--ct-surface-hover)]"
            style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-secondary)" }}
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
            className="flex-1 py-2 text-sm rounded-[var(--r-sm)] font-medium disabled:opacity-40 transition-colors"
            style={{ background: "var(--danger-light)", color: "#ffffff" }}
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
        <div className="mb-4 rounded-[var(--r-lg)] border px-4 py-3 text-sm" style={{ background: "var(--danger-light-tint)", borderColor: "var(--danger-light-tint)", color: "var(--danger-light)" }}>
          Failed to load payments: {error}
        </div>
      )}

      {/* Today's summary bar */}
      {summary && (
        <div className="rounded-[var(--r-lg)] border px-5 py-3 mb-5 flex flex-wrap items-center gap-6 text-sm" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
          <span className="font-medium" style={{ color: "var(--ct-text-muted)" }}>Today</span>
          <span>
            <span className="font-semibold" style={{ color: "var(--ct-text-primary)" }}>
              {fmt(summary.total_received)}
            </span>
            <span className="ml-1" style={{ color: "var(--ct-text-muted)" }}>
              ({summary.payment_count} payments)
            </span>
          </span>
          {summary.bounced_count > 0 && (
            <span className="font-medium" style={{ color: "var(--danger-light)" }}>
              {summary.bounced_count} bounced
              <span className="font-normal ml-1" style={{ color: "var(--danger-light)" }}>
                ({fmt(summary.bounced_amount)})
              </span>
            </span>
          )}
          {summary.etf_flags_triggered > 0 && (
            <span className="font-medium" style={{ color: "var(--amber-light)" }}>
              {summary.etf_flags_triggered} ETF flag
              {summary.etf_flags_triggered > 1 ? "s" : ""}
            </span>
          )}
          {summary.accounts_resolved > 0 && (
            <span className="font-medium" style={{ color: "var(--success-light)" }}>
              {summary.accounts_resolved} resolved
            </span>
          )}
          <div className="ml-auto flex gap-4 text-xs" style={{ color: "var(--ct-text-muted)" }}>
            {summary.by_method &&
              Object.entries(summary.by_method).map(([m, v]) => (
                <span key={m}>
                  {m} {fmt(v)}
                </span>
              ))}
          </div>
          <button
            onClick={() => router.push("/payments/upload")}
            className="ml-2 px-4 py-1.5 text-sm rounded-[var(--r-sm)] font-medium transition-colors"
            style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
          >
            + Upload sheet
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="rounded-[var(--r-lg)] border px-5 py-4 mb-4" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search customer..."
            className="rounded-[var(--r-sm)] border px-3 py-1.5 text-sm outline-none w-48 focus:border-[var(--accent-light)]"
            style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
          />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-[var(--r-sm)] border px-3 py-1.5 text-sm outline-none focus:border-[var(--accent-light)]"
            style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-secondary)" }}
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
            className="rounded-[var(--r-sm)] border px-3 py-1.5 text-sm outline-none focus:border-[var(--accent-light)]"
            style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-secondary)" }}
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
            className="rounded-[var(--r-sm)] border px-3 py-1.5 text-sm outline-none focus:border-[var(--accent-light)]"
            style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-secondary)" }}
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
            className="rounded-[var(--r-sm)] border px-3 py-1.5 text-sm outline-none focus:border-[var(--accent-light)]"
            style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-secondary)" }}
          />
          <span className="text-sm" style={{ color: "var(--ct-text-muted)" }}>to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
            className="rounded-[var(--r-sm)] border px-3 py-1.5 text-sm outline-none focus:border-[var(--accent-light)]"
            style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-secondary)" }}
          />
          <label className="flex items-center gap-1.5 text-sm cursor-pointer" style={{ color: "var(--ct-text-secondary)" }}>
            <input
              type="checkbox"
              checked={bouncedOnly}
              onChange={(e) => {
                setBouncedOnly(e.target.checked);
                setPage(1);
              }}
              className="rounded"
              style={{ accentColor: "var(--accent-light)" }}
            />
            Bounced only
          </label>
          <label className="flex items-center gap-1.5 text-sm cursor-pointer" style={{ color: "var(--ct-text-secondary)" }}>
            <input
              type="checkbox"
              checked={etfOnly}
              onChange={(e) => {
                setEtfOnly(e.target.checked);
                setPage(1);
              }}
              className="rounded"
              style={{ accentColor: "var(--accent-light)" }}
            />
            ETF flag only
          </label>
          <span className="ml-auto text-sm" style={{ color: "var(--ct-text-muted)" }}>
            {(total ?? 0).toLocaleString()} total
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-[var(--r-lg)] border overflow-hidden" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)", color: "var(--ct-text-muted)" }}>
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
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={12} className="py-16 text-center" style={{ color: "var(--ct-text-muted)" }}>
                    Loading...
                  </td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-16 text-center" style={{ color: "var(--ct-text-muted)" }}>
                    No payments found
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-[var(--ct-surface-hover)] transition-colors" style={{ borderColor: "var(--ct-border-subtle)" }}>
                    <td className="px-4 py-3 font-medium max-w-[160px] truncate" style={{ color: "var(--ct-text-primary)" }}>
                      {p.customer_name}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--ct-text-muted)" }}>
                      {p.esiid}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--ct-text-secondary)" }}>
                      {new Date(p.payment_date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold" style={{ color: "var(--ct-text-primary)" }}>
                      {fmt(p.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="px-2 py-0.5 rounded-[var(--r-sm)] text-xs font-medium"
                        style={METHOD_TINT}
                      >
                        {p.method}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--ct-text-muted)" }}>
                      {p.applied_to}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        style={p.balance_after === 0
                          ? { fontWeight: 600, color: "var(--success-light)" }
                          : { color: "var(--ct-text-secondary)" }}
                      >
                        {fmt(p.balance_after)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right" style={{ color: "var(--ct-text-muted)" }}>
                      {fmt(p.usage_balance_after)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {p.etf_balance_after > 0 ? (
                        <span
                          style={p.triggered_etf_flag
                            ? { fontWeight: 500, color: "var(--amber-light)" }
                            : { color: "var(--ct-text-muted)" }}
                        >
                          {fmt(p.etf_balance_after)}
                          {p.triggered_etf_flag && (
                            <span className="ml-1 text-xs px-1 py-0.5 rounded-[var(--r-sm)]" style={{ background: "var(--amber-light-tint)", color: "var(--amber-light)" }}>
                              ETF
                            </span>
                          )}
                        </span>
                      ) : (
                        <span style={{ color: "var(--ct-text-muted)" }}>—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="px-2 py-0.5 rounded-[var(--r-sm)] text-xs font-medium"
                        style={STATUS_STYLE[p.status] || { background: "var(--ct-surface-hover)", color: "var(--ct-text-secondary)" }}
                      >
                        {p.status.toLowerCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--ct-text-muted)" }}>
                      {p.source.replace(/_/g, " ").toLowerCase()}
                    </td>
                    <td className="px-4 py-3">
                      {p.status === "POSTED" && (
                        <button
                          onClick={() => setBounceTarget(p)}
                          className="text-xs transition-colors hover:text-[var(--danger-light)]"
                          style={{ color: "var(--ct-text-muted)" }}
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
          <div className="border-t px-4 py-3 flex items-center justify-between text-sm" style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-muted)" }}>
            <span>
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)}{" "}
              of {total.toLocaleString()}
            </span>
            <div className="flex gap-1">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1 rounded-[var(--r-sm)] border transition-colors disabled:opacity-30 hover:bg-[var(--ct-surface-hover)]"
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
                    className="px-3 py-1 rounded-[var(--r-sm)] border transition-colors hover:bg-[var(--ct-surface-hover)]"
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
                className="px-3 py-1 rounded-[var(--r-sm)] border transition-colors disabled:opacity-30 hover:bg-[var(--ct-surface-hover)]"
                style={{ borderColor: "var(--ct-border-default)" }}
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
