import { useCallback, useEffect, useState } from "react";
import BillingEngineLayout from "../../components/BillingEngineLayout";
import api from "../../utils/api";
import { isAdmin } from "../../utils/auth";
import { UnpostConfirmDialog } from "../../components/RevertUnpostDialogs";

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

// ── helpers ───────────────────────────────────────────────────────────────────

function isUnpostEligible(status: string) {
  return status === "sent";
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

// This page only ever lists invoices in "sent" status and only ever exposes
// the single-item Unpost action (with the required-reason / type-to-confirm /
// cooldown friction built into UnpostConfirmDialog) -- no bulk action here,
// per the deliberate-friction requirement that unposting stay single-item.
export default function BillingUnpostPage() {
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
  const [dateFrom, setDateFrom]     = useState("");
  const [dateTo, setDateTo]         = useState("");

  // single-row Unpost
  const [unpostTarget, setUnpostTarget] = useState<CorrectionRow | null>(null);
  const [unpostBusy, setUnpostBusy]     = useState(false);
  const [unpostMsg, setUnpostMsg]       = useState("");

  const fetchRows = useCallback(async (
    off: number, esi: string, bill: string, from: string, to: string,
  ) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(off), status: "sent" });
      if (esi)  params.set("esi_id", esi);
      if (bill) params.set("bill_number", bill);
      if (from) params.set("date_from", from);
      if (to)   params.set("date_to", to);
      const res = await api.get(`/admin/billing-corrections?${params}`);
      // Defensive filter: this page only ever shows Unpost-eligible ("sent") rows.
      setRows((res.data as CorrectionRow[]).filter((r) => isUnpostEligible(r.status)));
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Failed to load results.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRows(offset, esiFilter, billFilter, dateFrom, dateTo);
  }, [fetchRows, offset, esiFilter, billFilter, dateFrom, dateTo]);

  const refresh = () => fetchRows(offset, esiFilter, billFilter, dateFrom, dateTo);

  const applySearch = () => {
    setOffset(0);
    setEsiFilter(esiInput.trim());
    setBillFilter(billInput.trim());
  };

  const handleDateFrom = (v: string) => { setOffset(0); setDateFrom(v); };
  const handleDateTo   = (v: string) => { setOffset(0); setDateTo(v); };

  const clearAll = () => {
    setEsiInput(""); setEsiFilter("");
    setBillInput(""); setBillFilter("");
    setDateFrom(""); setDateTo("");
    setOffset(0);
  };

  const doUnpost = async (reason: string) => {
    if (!unpostTarget || !unpostTarget.invoice_id) return;
    setUnpostBusy(true);
    setUnpostMsg("");
    try {
      await api.post(`/admin/invoices/${unpostTarget.invoice_id}/unpost`, { reason });
      setUnpostTarget(null);
      await refresh();
    } catch (e: any) {
      setUnpostMsg(e?.response?.data?.detail ?? "Unpost failed.");
    } finally {
      setUnpostBusy(false);
    }
  };

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const colCount = 8;

  return (
    <BillingEngineLayout title="Billing Unpost">
      {/* header */}
      <div className="mb-5">
        <h2 className="text-base font-semibold text-gray-800">Billing Unpost</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Bills currently sent to a customer. Unposting is single-item only and requires a
          reason, typing the exact invoice number, and a short confirm cooldown — once
          unposted, use the separate <span className="font-mono">/billing/revert</span> page
          if the period also needs to be reverted to draft.
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
            className="text-sm border border-gray-200 rounded px-2.5 py-1.5 text-gray-700 w-40 focus:outline-none focus:ring-1 focus:ring-amber-400"
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
            className="text-sm border border-gray-200 rounded px-2.5 py-1.5 text-gray-700 w-36 focus:outline-none focus:ring-1 focus:ring-amber-400"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Service From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => handleDateFrom(e.target.value)}
            className="text-sm border border-gray-200 rounded px-2.5 py-1.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Service To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => handleDateTo(e.target.value)}
            className="text-sm border border-gray-200 rounded px-2.5 py-1.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
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

      {/* table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
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
                  <td colSpan={colCount} className="px-4 py-8 text-center text-sm text-gray-400">No sent bills found.</td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.billing_period_id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2 font-mono text-gray-800 font-medium">{r.invoice_number ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-gray-700">{r.esi_id}</td>
                    <td className="px-3 py-2 text-gray-600">{r.customer_name ?? "—"}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.service_start ?? "—"}</td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.service_end ?? "—"}</td>
                    <td className="px-3 py-2 text-right text-gray-700">${fmt2(r.amount)}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex px-1.5 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700">
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {!admin ? (
                        <span className="text-gray-300">—</span>
                      ) : (
                        <button
                          onClick={() => { setUnpostMsg(""); setUnpostTarget(r); }}
                          className="px-2.5 py-1 text-xs bg-white border border-amber-300 text-amber-700 rounded hover:bg-amber-50 transition-colors"
                        >
                          Unpost
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

      {unpostTarget && unpostTarget.invoice_number && (
        <UnpostConfirmDialog
          invoiceNumber={unpostTarget.invoice_number}
          busy={unpostBusy}
          errorMsg={unpostMsg}
          onCancel={() => setUnpostTarget(null)}
          onConfirm={doUnpost}
        />
      )}
    </BillingEngineLayout>
  );
}
