import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import BillingEngineLayout from "../../../components/BillingEngineLayout";
import api from "../../../utils/api";
import { isAdmin } from "../../../utils/auth";

// ── types ─────────────────────────────────────────────────────────────────────

interface Invoice {
  id: number;
  invoice_number: string;
  billing_period_id: number;
  esi_id: string;
  invoice_date: string | null;
  due_date: string | null;
  total_amount: number;
  supplier_charge: number;
  tdsp_total: number;
  tax_total: number;
  status: string;
  sent_at: string | null;
  paid_at: string | null;
  created_at: string;
}

interface ApprovedPeriod {
  billing_period_id: number;
  esi_id: string;
  customer_name: string | null;
  service_start: string | null;
  service_end: string | null;
  amount: number;
  status: string;
}

interface BulkResult {
  id: number;
  success: boolean;
  status?: string;
  invoice_number?: string;
  reason?: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "",      label: "All statuses" },
  { value: "draft", label: "Draft"        },
  { value: "sent",  label: "Sent"         },
  { value: "paid",  label: "Paid"         },
];

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  sent:  "bg-blue-50 text-blue-700",
  paid:  "bg-green-50 text-green-700",
};

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin text-gray-400" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function fmt2(v: number | null | undefined): string {
  if (v == null) return "—";
  return Number(v).toFixed(2);
}

const PAGE_SIZE = 200;

// ── page ──────────────────────────────────────────────────────────────────────

export default function InvoicesPage() {
  const router = useRouter();
  const admin = isAdmin();

  const [rows, setRows]       = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [offset, setOffset]   = useState(0);
  const hasMore               = rows.length === PAGE_SIZE;

  const [statusFilter, setStatusFilter] = useState("");
  const [esiInput, setEsiInput]         = useState("");
  const [esiFilter, setEsiFilter]       = useState("");

  const esiRef = useRef<HTMLInputElement>(null);

  // bulk-post (draft invoices only)
  const [selectedInvoices, setSelectedInvoices] = useState<Set<number>>(new Set());
  const [bulkPostBusy, setBulkPostBusy]         = useState(false);
  const [bulkPostResults, setBulkPostResults]   = useState<BulkResult[] | null>(null);
  const [bulkPostError, setBulkPostError]       = useState("");

  // approved billing periods awaiting invoice generation
  const [approvedRows, setApprovedRows]         = useState<ApprovedPeriod[]>([]);
  const [approvedLoading, setApprovedLoading]   = useState(true);
  const [approvedError, setApprovedError]       = useState("");
  const [selectedPeriods, setSelectedPeriods]   = useState<Set<number>>(new Set());
  const [bulkGenBusy, setBulkGenBusy]           = useState(false);
  const [bulkGenResults, setBulkGenResults]     = useState<BulkResult[] | null>(null);
  const [bulkGenError, setBulkGenError]         = useState("");

  const fetchInvoices = useCallback(async (off: number, status: string, esi: string) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(off) });
      if (status) params.set("status", status);
      if (esi)    params.set("esi_id", esi);
      const res = await api.get(`/billing-engine/invoices?${params}`);
      setRows(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Failed to load invoices.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchApprovedPeriods = useCallback(async () => {
    setApprovedLoading(true);
    setApprovedError("");
    try {
      const res = await api.get(`/admin/billing-corrections?status=approved&limit=500`);
      setApprovedRows(res.data);
    } catch (e: any) {
      setApprovedError(e?.response?.data?.detail ?? "Failed to load approved periods.");
    } finally {
      setApprovedLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvoices(offset, statusFilter, esiFilter);
  }, [fetchInvoices, offset, statusFilter, esiFilter]);

  useEffect(() => {
    fetchApprovedPeriods();
  }, [fetchApprovedPeriods]);

  const applyEsiSearch = () => {
    setOffset(0);
    setEsiFilter(esiInput.trim());
  };

  const handleStatusChange = (v: string) => {
    setOffset(0);
    setStatusFilter(v);
  };

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  // ── bulk-post ─────────────────────────────────────────────────────────────
  const draftIds = useMemo(() => rows.filter((r) => r.status === "draft").map((r) => r.id), [rows]);
  const allDraftSelected = draftIds.length > 0 && draftIds.every((id) => selectedInvoices.has(id));

  const toggleSelectInvoice = (id: number) => {
    setSelectedInvoices((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAllInvoices = () => {
    setSelectedInvoices(allDraftSelected ? new Set() : new Set(draftIds));
  };

  useEffect(() => {
    setSelectedInvoices((prev) => {
      const next = new Set<number>();
      prev.forEach((id) => { if (draftIds.includes(id)) next.add(id); });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const doBulkPost = async () => {
    setBulkPostBusy(true);
    setBulkPostError("");
    try {
      const res = await api.post(`/billing-engine/invoices/bulk-post`, {
        invoice_ids: Array.from(selectedInvoices),
      });
      setBulkPostResults(res.data.results);
      setSelectedInvoices(new Set());
      await fetchInvoices(offset, statusFilter, esiFilter);
    } catch (e: any) {
      setBulkPostError(e?.response?.data?.detail ?? "Bulk post failed.");
    } finally {
      setBulkPostBusy(false);
    }
  };

  // ── bulk-generate ─────────────────────────────────────────────────────────
  const approvedIds = useMemo(() => approvedRows.map((r) => r.billing_period_id), [approvedRows]);
  const allApprovedSelected = approvedIds.length > 0 && approvedIds.every((id) => selectedPeriods.has(id));

  const toggleSelectPeriod = (id: number) => {
    setSelectedPeriods((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAllPeriods = () => {
    setSelectedPeriods(allApprovedSelected ? new Set() : new Set(approvedIds));
  };

  useEffect(() => {
    setSelectedPeriods((prev) => {
      const next = new Set<number>();
      prev.forEach((id) => { if (approvedIds.includes(id)) next.add(id); });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvedRows]);

  const doBulkGenerate = async () => {
    setBulkGenBusy(true);
    setBulkGenError("");
    try {
      const res = await api.post(`/billing-engine/invoices/bulk-generate`, {
        billing_period_ids: Array.from(selectedPeriods),
      });
      setBulkGenResults(res.data.results);
      setSelectedPeriods(new Set());
      await fetchApprovedPeriods();
      await fetchInvoices(offset, statusFilter, esiFilter);
    } catch (e: any) {
      setBulkGenError(e?.response?.data?.detail ?? "Bulk generate failed.");
    } finally {
      setBulkGenBusy(false);
    }
  };

  return (
    <BillingEngineLayout title="Invoices">
      {/* header */}
      <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Invoices</h2>
          <p className="text-xs text-gray-400 mt-0.5">Click a row to view the full invoice.</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={statusFilter}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="text-sm border border-gray-200 rounded px-2.5 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-green-400"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <div className="flex items-center gap-1">
            <input
              ref={esiRef}
              type="text"
              placeholder="ESI ID search…"
              value={esiInput}
              onChange={(e) => setEsiInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyEsiSearch()}
              className="text-sm border border-gray-200 rounded px-2.5 py-1.5 text-gray-700 w-44 focus:outline-none focus:ring-1 focus:ring-green-400"
            />
            <button
              onClick={applyEsiSearch}
              className="px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded border border-gray-200 hover:bg-gray-200 transition-colors"
            >
              Search
            </button>
            {esiFilter && (
              <button
                onClick={() => { setEsiInput(""); setEsiFilter(""); setOffset(0); }}
                className="px-2 py-1.5 text-xs text-gray-400 hover:text-gray-600"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          <button
            onClick={() => fetchInvoices(offset, statusFilter, esiFilter)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40 transition-colors"
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
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">
          {error}
        </div>
      )}

      {admin && selectedInvoices.size > 0 && (
        <div className="mb-3 flex items-center justify-between px-3 py-2 bg-green-50 border border-green-200 rounded">
          <span className="text-xs text-green-700">{selectedInvoices.size} invoice(s) selected for bulk post</span>
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedInvoices(new Set())} className="text-xs text-gray-500 hover:text-gray-700">
              Clear selection
            </button>
            <button
              onClick={doBulkPost}
              disabled={bulkPostBusy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-40 transition-colors"
            >
              {bulkPostBusy && <Spinner />}
              Post Selected ({selectedInvoices.size})
            </button>
          </div>
        </div>
      )}

      {bulkPostError && (
        <div className="mb-3 px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">{bulkPostError}</div>
      )}

      {bulkPostResults && (
        <div className="mb-4 px-4 py-3 bg-gray-50 border border-gray-200 rounded text-xs">
          <div className="flex items-center justify-between mb-1">
            <p className="font-medium text-gray-700">
              Bulk post results: {bulkPostResults.filter((r) => r.success).length} succeeded,{" "}
              {bulkPostResults.filter((r) => !r.success).length} skipped
            </p>
            <button onClick={() => setBulkPostResults(null)} className="text-gray-400 hover:text-gray-600">Dismiss</button>
          </div>
          <ul className="space-y-0.5">
            {bulkPostResults.map((r) => (
              <li key={r.id} className={r.success ? "text-green-700" : "text-red-600"}>
                Invoice #{r.id}: {r.success ? "posted" : `skipped — ${r.reason}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {admin && (
                  <th className="px-3 py-2.5 text-center text-gray-500 font-medium">
                    <input
                      type="checkbox"
                      checked={allDraftSelected}
                      onChange={toggleSelectAllInvoices}
                      disabled={draftIds.length === 0}
                      title="Select all draft invoices on this page"
                    />
                  </th>
                )}
                <th className="px-3 py-2.5 text-left text-gray-500 font-medium">Invoice #</th>
                <th className="px-3 py-2.5 text-left text-gray-500 font-medium">ESI ID</th>
                <th className="px-3 py-2.5 text-left text-gray-500 font-medium whitespace-nowrap">Invoice Date</th>
                <th className="px-3 py-2.5 text-right text-gray-500 font-medium">Supplier ($)</th>
                <th className="px-3 py-2.5 text-right text-gray-500 font-medium">TDSP ($)</th>
                <th className="px-3 py-2.5 text-right text-gray-500 font-medium">Tax ($)</th>
                <th className="px-3 py-2.5 text-right text-gray-500 font-medium">Total ($)</th>
                <th className="px-3 py-2.5 text-left text-gray-500 font-medium">Status</th>
                <th className="px-3 py-2.5 text-left text-gray-500 font-medium whitespace-nowrap">Sent At</th>
                <th className="px-3 py-2.5 text-left text-gray-500 font-medium whitespace-nowrap">Paid At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={admin ? 11 : 10} className="px-4 py-8 text-center text-sm text-gray-400">Loading…</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={admin ? 11 : 10} className="px-4 py-8 text-center text-sm text-gray-400">No invoices found.</td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => router.push(`/billing/periods/${r.billing_period_id}`)}
                    className="hover:bg-green-50 cursor-pointer transition-colors"
                  >
                    {admin && (
                      <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedInvoices.has(r.id)}
                          disabled={r.status !== "draft"}
                          onChange={() => toggleSelectInvoice(r.id)}
                        />
                      </td>
                    )}
                    <td className="px-3 py-2 font-mono text-gray-800 font-medium">{r.invoice_number}</td>
                    <td className="px-3 py-2 font-mono text-gray-700">{r.esi_id}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.invoice_date ?? "—"}</td>
                    <td className="px-3 py-2 text-right text-gray-700">${fmt2(r.supplier_charge)}</td>
                    <td className="px-3 py-2 text-right text-gray-700">${fmt2(r.tdsp_total)}</td>
                    <td className="px-3 py-2 text-right text-gray-500">${fmt2(r.tax_total)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-800">${fmt2(r.total_amount)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-500"}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-400 whitespace-nowrap">
                      {r.sent_at ? new Date(r.sent_at).toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-2 text-gray-400 whitespace-nowrap">
                      {r.paid_at ? new Date(r.paid_at).toLocaleString() : "—"}
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
              Showing {offset + 1}–{offset + rows.length}{hasMore ? "+" : ""}
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

      {/* approved billing periods awaiting invoice generation */}
      <div className="mt-8 mb-3">
        <h2 className="text-base font-semibold text-gray-800">Approved Periods — Ready to Generate</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Billing periods in &quot;approved&quot; status with no invoice yet. Generating creates a
          draft invoice and moves the period to &quot;invoiced&quot;.
        </p>
      </div>

      {approvedError && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">
          {approvedError}
        </div>
      )}

      {admin && selectedPeriods.size > 0 && (
        <div className="mb-3 flex items-center justify-between px-3 py-2 bg-purple-50 border border-purple-200 rounded">
          <span className="text-xs text-purple-700">{selectedPeriods.size} period(s) selected for bulk generate</span>
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedPeriods(new Set())} className="text-xs text-gray-500 hover:text-gray-700">
              Clear selection
            </button>
            <button
              onClick={doBulkGenerate}
              disabled={bulkGenBusy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-40 transition-colors"
            >
              {bulkGenBusy && <Spinner />}
              Generate Invoices for Selected ({selectedPeriods.size})
            </button>
          </div>
        </div>
      )}

      {bulkGenError && (
        <div className="mb-3 px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">{bulkGenError}</div>
      )}

      {bulkGenResults && (
        <div className="mb-4 px-4 py-3 bg-gray-50 border border-gray-200 rounded text-xs">
          <div className="flex items-center justify-between mb-1">
            <p className="font-medium text-gray-700">
              Bulk generate results: {bulkGenResults.filter((r) => r.success).length} succeeded,{" "}
              {bulkGenResults.filter((r) => !r.success).length} skipped
            </p>
            <button onClick={() => setBulkGenResults(null)} className="text-gray-400 hover:text-gray-600">Dismiss</button>
          </div>
          <ul className="space-y-0.5">
            {bulkGenResults.map((r) => (
              <li key={r.id} className={r.success ? "text-green-700" : "text-red-600"}>
                Period #{r.id}: {r.success ? `generated as ${r.invoice_number}` : `skipped — ${r.reason}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {admin && (
                  <th className="px-3 py-2.5 text-center text-gray-500 font-medium">
                    <input
                      type="checkbox"
                      checked={allApprovedSelected}
                      onChange={toggleSelectAllPeriods}
                      disabled={approvedIds.length === 0}
                      title="Select all approved periods"
                    />
                  </th>
                )}
                <th className="px-3 py-2.5 text-left text-gray-500 font-medium">ESI ID</th>
                <th className="px-3 py-2.5 text-left text-gray-500 font-medium">Customer / Company</th>
                <th className="px-3 py-2.5 text-left text-gray-500 font-medium whitespace-nowrap">Service Start</th>
                <th className="px-3 py-2.5 text-left text-gray-500 font-medium whitespace-nowrap">Service End</th>
                <th className="px-3 py-2.5 text-right text-gray-500 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {approvedLoading ? (
                <tr>
                  <td colSpan={admin ? 6 : 5} className="px-4 py-8 text-center text-sm text-gray-400">Loading…</td>
                </tr>
              ) : approvedRows.length === 0 ? (
                <tr>
                  <td colSpan={admin ? 6 : 5} className="px-4 py-8 text-center text-sm text-gray-400">No approved periods awaiting invoice generation.</td>
                </tr>
              ) : (
                approvedRows.map((r) => (
                  <tr key={r.billing_period_id} className="hover:bg-gray-50 transition-colors">
                    {admin && (
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={selectedPeriods.has(r.billing_period_id)}
                          onChange={() => toggleSelectPeriod(r.billing_period_id)}
                        />
                      </td>
                    )}
                    <td className="px-3 py-2 font-mono text-gray-700">{r.esi_id}</td>
                    <td className="px-3 py-2 text-gray-600">{r.customer_name ?? "—"}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.service_start ?? "—"}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.service_end ?? "—"}</td>
                    <td className="px-3 py-2 text-right text-gray-700">${fmt2(r.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </BillingEngineLayout>
  );
}
