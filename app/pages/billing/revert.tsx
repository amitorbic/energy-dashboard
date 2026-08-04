import { useCallback, useEffect, useMemo, useState } from "react";
import BillingEngineLayout from "../../components/BillingEngineLayout";
import api from "../../utils/api";
import { isAdmin } from "../../utils/auth";
import { RevertConfirmDialog } from "../../components/RevertUnpostDialogs";

// ── types ─────────────────────────────────────────────────────────────────────

interface CorrectionRow {
  billing_period_id: number;
  invoice_id: number | null;
  invoice_number: string | null;
  esi_id: string;
  customer_name: string | null;
  service_start: string | null;
  service_end: string | null;
  amount: number;
  charges_count: number;
  status: string;
}

interface BulkResult {
  id: number;
  success: boolean;
  status?: string;
  reason?: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────

// Only statuses that come before "sent" -- this page is Revert-only, so
// "sent"/"paid"/"void" are never offered as a filter and are also stripped
// from any results defensively below.
const STATUS_OPTIONS = [
  { value: "",         label: "All statuses" },
  { value: "draft",    label: "Draft"        },
  { value: "reviewed", label: "Reviewed"     },
  { value: "approved", label: "Approved"     },
  { value: "invoiced", label: "Invoiced"     },
  { value: "posted",   label: "Posted"       },
];

const STATUS_COLORS: Record<string, string> = {
  draft:    "bg-gray-100 text-gray-600",
  reviewed: "bg-blue-50 text-blue-700",
  approved: "bg-green-50 text-green-700",
  invoiced: "bg-purple-50 text-purple-700",
  posted:   "bg-indigo-50 text-indigo-700",
};

function isTerminal(status: string) {
  return status === "paid" || status === "void";
}
function isRevertEligible(status: string) {
  return !isTerminal(status) && status !== "sent";
}

function fmt2(v: number | null | undefined): string {
  if (v == null) return "—";
  return Number(v).toFixed(2);
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin text-gray-400" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

const PAGE_SIZE = 100;

// ── page ──────────────────────────────────────────────────────────────────────

export default function BillingRevertPage() {
  const admin = isAdmin();

  const [rows, setRows]       = useState<CorrectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [offset, setOffset]   = useState(0);
  const hasMore                = rows.length === PAGE_SIZE;

  // filters
  const [esiInput, setEsiInput]     = useState("");
  const [esiFilter, setEsiFilter]   = useState("");
  const [billInput, setBillInput]   = useState("");
  const [billFilter, setBillFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom]     = useState("");
  const [dateTo, setDateTo]         = useState("");

  // bulk selection (revert-eligible rows only)
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // single-row Revert
  const [revertTarget, setRevertTarget] = useState<CorrectionRow | null>(null);
  const [revertBusy, setRevertBusy]     = useState(false);
  const [revertMsg, setRevertMsg]       = useState("");

  // bulk revert
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkBusy, setBulkBusy]               = useState(false);
  const [bulkResults, setBulkResults]         = useState<BulkResult[] | null>(null);
  const [bulkError, setBulkError]             = useState("");

  const fetchRows = useCallback(async (
    off: number, esi: string, bill: string, status: string, from: string, to: string,
  ) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(off) });
      if (esi)    params.set("esi_id", esi);
      if (bill)   params.set("bill_number", bill);
      if (status) params.set("status", status);
      if (from)   params.set("date_from", from);
      if (to)     params.set("date_to", to);
      const res = await api.get(`/admin/billing-corrections?${params}`);
      // Defensive filter: this page only ever shows Revert-eligible rows,
      // regardless of what the (Revert-only) status dropdown was set to.
      setRows((res.data as CorrectionRow[]).filter((r) => isRevertEligible(r.status)));
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Failed to load results.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRows(offset, esiFilter, billFilter, statusFilter, dateFrom, dateTo);
  }, [fetchRows, offset, esiFilter, billFilter, statusFilter, dateFrom, dateTo]);

  const refresh = () => fetchRows(offset, esiFilter, billFilter, statusFilter, dateFrom, dateTo);

  const applySearch = () => {
    setOffset(0);
    setEsiFilter(esiInput.trim());
    setBillFilter(billInput.trim());
  };

  const handleStatusChange = (v: string) => { setOffset(0); setStatusFilter(v); };
  const handleDateFrom     = (v: string) => { setOffset(0); setDateFrom(v); };
  const handleDateTo       = (v: string) => { setOffset(0); setDateTo(v); };

  const clearAll = () => {
    setEsiInput(""); setEsiFilter("");
    setBillInput(""); setBillFilter("");
    setStatusFilter(""); setDateFrom(""); setDateTo("");
    setOffset(0);
  };

  const eligibleIds = useMemo(
    () => rows.filter((r) => isRevertEligible(r.status)).map((r) => r.billing_period_id),
    [rows],
  );
  const allEligibleSelected = eligibleIds.length > 0 && eligibleIds.every((id) => selected.has(id));

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected(allEligibleSelected ? new Set() : new Set(eligibleIds));
  };

  // clear selection of any rows that are no longer eligible/present after a refresh
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set<number>();
      prev.forEach((id) => { if (eligibleIds.includes(id)) next.add(id); });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const doRevert = async () => {
    if (!revertTarget) return;
    setRevertBusy(true);
    setRevertMsg("");
    try {
      await api.post(`/admin/billing-periods/${revertTarget.billing_period_id}/revert`);
      setRevertTarget(null);
      await refresh();
    } catch (e: any) {
      setRevertMsg(e?.response?.data?.detail ?? "Revert failed.");
    } finally {
      setRevertBusy(false);
    }
  };

  const doBulkRevert = async () => {
    setBulkBusy(true);
    setBulkError("");
    try {
      const res = await api.post(`/admin/billing-periods/bulk-revert`, {
        billing_period_ids: Array.from(selected),
      });
      setBulkResults(res.data.results);
      setShowBulkConfirm(false);
      await refresh();
    } catch (e: any) {
      setBulkError(e?.response?.data?.detail ?? "Bulk revert failed.");
    } finally {
      setBulkBusy(false);
    }
  };

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const colCount = admin ? 9 : 8;

  return (
    <BillingEngineLayout title="Billing Revert">
      {/* header */}
      <div className="mb-5">
        <h2 className="text-base font-semibold text-gray-800">Billing Revert</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Global search across bills/periods that are still eligible for a direct Revert to
          Draft (anything before &quot;sent&quot;) — bills already sent to a customer must be
          unposted first, from the separate <span className="font-mono">/billing/unpost</span> page.
        </p>
      </div>

      {/* filters */}
      <div className="mb-4 flex items-end gap-2 flex-wrap bg-white border border-gray-200 rounded-lg p-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">ESI ID</label>
          <input
            type="text"
            placeholder="ESI ID…"
            value={esiInput}
            onChange={(e) => setEsiInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applySearch()}
            className="text-sm border border-gray-200 rounded px-2.5 py-1.5 text-gray-700 w-40 focus:outline-none focus:ring-1 focus:ring-green-400"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Bill Number</label>
          <input
            type="text"
            placeholder="Bill number…"
            value={billInput}
            onChange={(e) => setBillInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applySearch()}
            className="text-sm border border-gray-200 rounded px-2.5 py-1.5 text-gray-700 w-36 focus:outline-none focus:ring-1 focus:ring-green-400"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="text-sm border border-gray-200 rounded px-2.5 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-green-400"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Service From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => handleDateFrom(e.target.value)}
            className="text-sm border border-gray-200 rounded px-2.5 py-1.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-green-400"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Service To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => handleDateTo(e.target.value)}
            className="text-sm border border-gray-200 rounded px-2.5 py-1.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-green-400"
          />
        </div>
        <button
          onClick={applySearch}
          className="px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded border border-gray-200 hover:bg-gray-200 transition-colors"
        >
          Search
        </button>
        <button
          onClick={clearAll}
          className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-600"
        >
          Clear filters
        </button>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40 transition-colors ml-auto"
        >
          {loading ? <Spinner /> : (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">{error}</div>
      )}

      {admin && selected.size > 0 && (
        <div className="mb-3 flex items-center justify-between px-3 py-2 bg-red-50 border border-red-200 rounded">
          <span className="text-xs text-red-700">{selected.size} period(s) selected for bulk revert</span>
          <div className="flex items-center gap-3">
            <button onClick={() => setSelected(new Set())} className="text-xs text-gray-500 hover:text-gray-700">
              Clear selection
            </button>
            <button
              onClick={() => { setBulkResults(null); setBulkError(""); setShowBulkConfirm(true); }}
              className="px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            >
              Bulk Revert Selected ({selected.size})
            </button>
          </div>
        </div>
      )}

      {bulkResults && (
        <div className="mb-4 px-4 py-3 bg-gray-50 border border-gray-200 rounded text-xs">
          <div className="flex items-center justify-between mb-1">
            <p className="font-medium text-gray-700">
              Bulk revert results: {bulkResults.filter((r) => r.success).length} succeeded,{" "}
              {bulkResults.filter((r) => !r.success).length} skipped
            </p>
            <button onClick={() => setBulkResults(null)} className="text-gray-400 hover:text-gray-600">Dismiss</button>
          </div>
          <ul className="space-y-0.5">
            {bulkResults.map((r) => (
              <li key={r.id} className={r.success ? "text-green-700" : "text-red-600"}>
                Period #{r.id}: {r.success ? "reverted" : `skipped — ${r.reason}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {admin && (
                  <th className="px-3 py-2.5 text-center text-gray-500 font-medium">
                    <input
                      type="checkbox"
                      checked={allEligibleSelected}
                      onChange={toggleSelectAll}
                      disabled={eligibleIds.length === 0}
                      title="Select all eligible rows on this page"
                    />
                  </th>
                )}
                <th className="px-3 py-2.5 text-left text-gray-500 font-medium">Bill Number</th>
                <th className="px-3 py-2.5 text-left text-gray-500 font-medium">ESI ID</th>
                <th className="px-3 py-2.5 text-left text-gray-500 font-medium">Customer / Company</th>
                <th className="px-3 py-2.5 text-left text-gray-500 font-medium whitespace-nowrap">Service Start</th>
                <th className="px-3 py-2.5 text-left text-gray-500 font-medium whitespace-nowrap">Service End</th>
                <th className="px-3 py-2.5 text-right text-gray-500 font-medium">Amount</th>
                <th className="px-3 py-2.5 text-left text-gray-500 font-medium">Status</th>
                <th className="px-3 py-2.5 text-left text-gray-500 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={colCount} className="px-4 py-8 text-center text-sm text-gray-400">Loading…</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-4 py-8 text-center text-sm text-gray-400">No results found.</td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.billing_period_id} className="hover:bg-gray-50 transition-colors">
                    {admin && (
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={selected.has(r.billing_period_id)}
                          onChange={() => toggleSelect(r.billing_period_id)}
                        />
                      </td>
                    )}
                    <td className="px-3 py-2 font-mono text-gray-800 font-medium">{r.invoice_number ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-gray-700">{r.esi_id}</td>
                    <td className="px-3 py-2 text-gray-600">{r.customer_name ?? "—"}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.service_start ?? "—"}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.service_end ?? "—"}</td>
                    <td className="px-3 py-2 text-right text-gray-700">${fmt2(r.amount)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {!admin ? (
                        <span className="text-gray-300">—</span>
                      ) : (
                        <button
                          onClick={() => { setRevertMsg(""); setRevertTarget(r); }}
                          className="px-2.5 py-1 text-xs bg-white border border-red-300 text-red-600 rounded hover:bg-red-50 transition-colors"
                        >
                          Revert
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && rows.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500 bg-gray-50">
            <span>
              Showing {offset + 1}–{offset + rows.length}
              {hasMore ? "+" : ""}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                disabled={offset === 0}
                className="px-2.5 py-1 rounded border border-gray-200 bg-white hover:bg-gray-100 disabled:opacity-40 transition-colors"
              >
                ← Prev
              </button>
              <span className="px-2">Page {currentPage}</span>
              <button
                onClick={() => setOffset((o) => o + PAGE_SIZE)}
                disabled={!hasMore}
                className="px-2.5 py-1 rounded border border-gray-200 bg-white hover:bg-gray-100 disabled:opacity-40 transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {revertTarget && (
        <RevertConfirmDialog
          periodId={revertTarget.billing_period_id}
          chargesCount={revertTarget.charges_count}
          invoiceNumber={revertTarget.invoice_number}
          invoiceStatus={revertTarget.status}
          busy={revertBusy}
          errorMsg={revertMsg}
          onCancel={() => setRevertTarget(null)}
          onConfirm={doRevert}
        />
      )}

      {showBulkConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-red-200 bg-red-50">
              <p className="font-semibold text-red-700">Bulk Revert {selected.size} Period(s) to Draft?</p>
            </div>
            <div className="px-6 py-4 space-y-3 text-sm text-gray-700">
              <p>This action cannot be undone. For each selected period it will immediately:</p>
              <ul className="list-disc pl-5 space-y-1 text-gray-600">
                <li>Delete its invoice (if any) entirely.</li>
                <li>Wipe all its charge line(s) (energy, meter fee, TDSP, addon, tax).</li>
                <li>Reset its status back to <span className="font-mono">draft</span>.</li>
                <li>Recompute contract rate, meter fee, energy charge, TDSP charges, and flags from the still-linked EDI data.</li>
              </ul>
              <p className="text-gray-500">
                Periods with a sent or paid invoice can&apos;t be reverted and will be skipped with
                a reason instead — one blocked period won&apos;t stop the rest of the batch.
              </p>
              {bulkError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{bulkError}</p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={() => setShowBulkConfirm(false)}
                disabled={bulkBusy}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={doBulkRevert}
                disabled={bulkBusy}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700 disabled:opacity-40 transition-colors"
              >
                {bulkBusy && <Spinner />}
                Yes, Revert {selected.size} Period(s)
              </button>
            </div>
          </div>
        </div>
      )}
    </BillingEngineLayout>
  );
}
