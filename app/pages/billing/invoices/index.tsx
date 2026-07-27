import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import BillingEngineLayout from "../../../components/BillingEngineLayout";
import api from "../../../utils/api";

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

  const [rows, setRows]       = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [offset, setOffset]   = useState(0);
  const hasMore               = rows.length === PAGE_SIZE;

  const [statusFilter, setStatusFilter] = useState("");
  const [esiInput, setEsiInput]         = useState("");
  const [esiFilter, setEsiFilter]       = useState("");

  const esiRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    fetchInvoices(offset, statusFilter, esiFilter);
  }, [fetchInvoices, offset, statusFilter, esiFilter]);

  const applyEsiSearch = () => {
    setOffset(0);
    setEsiFilter(esiInput.trim());
  };

  const handleStatusChange = (v: string) => {
    setOffset(0);
    setStatusFilter(v);
  };

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

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

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
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
                  <td colSpan={10} className="px-4 py-8 text-center text-sm text-gray-400">Loading…</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-sm text-gray-400">No invoices found.</td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => router.push(`/billing/periods/${r.billing_period_id}`)}
                    className="hover:bg-green-50 cursor-pointer transition-colors"
                  >
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
    </BillingEngineLayout>
  );
}
