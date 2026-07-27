import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import BillingEngineLayout from "../../components/BillingEngineLayout";
import api from "../../utils/api";

// ── types ─────────────────────────────────────────────────────────────────────

interface BillingPeriod {
  id: number;
  esi_id: string;
  service_start: string;
  service_end: string;
  billing_days: number;
  usage_kwh: number | null;
  contract_rate: number | null;
  meter_fee: number | null;
  has_810: number;
  flags: string | null;
  status: "draft" | "reviewed" | "approved" | "invoiced";
  created_at: string;
  tdsp_total: number;
  total_charge: number;
}

// ── helpers ───────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "",         label: "All statuses" },
  { value: "draft",    label: "Draft"        },
  { value: "reviewed", label: "Reviewed"     },
  { value: "approved", label: "Approved"     },
  { value: "invoiced", label: "Invoiced"     },
];

const STATUS_COLORS: Record<string, string> = {
  draft:    "bg-gray-100 text-gray-600",
  reviewed: "bg-blue-50 text-blue-700",
  approved: "bg-green-50 text-green-700",
  invoiced: "bg-purple-50 text-purple-700",
};

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

function FlagTag({ label }: { label: string }) {
  return (
    <span className="inline-flex px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-50 text-yellow-700 border border-yellow-200">
      {label.replace(/_/g, " ")}
    </span>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 200;

export default function BillingPeriodsPage() {
  const router = useRouter();

  const [rows, setRows]       = useState<BillingPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [offset, setOffset]   = useState(0);
  const hasMore               = rows.length === PAGE_SIZE;

  // filters
  const [statusFilter, setStatusFilter] = useState("");
  const [esiInput, setEsiInput]         = useState("");
  const [esiFilter, setEsiFilter]       = useState("");  // committed on Enter/Search

  const esiRef = useRef<HTMLInputElement>(null);

  const fetchPeriods = useCallback(async (off: number, status: string, esi: string) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(off) });
      if (status) params.set("status", status);
      if (esi)    params.set("esi_id", esi);
      const res = await api.get(`/billing-engine/periods?${params}`);
      setRows(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Failed to load billing periods.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch when offset or committed filters change
  useEffect(() => {
    fetchPeriods(offset, statusFilter, esiFilter);
  }, [fetchPeriods, offset, statusFilter, esiFilter]);

  const applyEsiSearch = () => {
    setOffset(0);
    setEsiFilter(esiInput.trim());
  };

  const handleStatusChange = (v: string) => {
    setOffset(0);
    setStatusFilter(v);
  };

  const handlePrev = () => setOffset((o) => Math.max(0, o - PAGE_SIZE));
  const handleNext = () => setOffset((o) => o + PAGE_SIZE);

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <BillingEngineLayout title="Billing Periods">
      {/* header */}
      <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Billing Periods</h2>
          <p className="text-xs text-gray-400 mt-0.5">Click a row to view detail and approve.</p>
        </div>

        {/* filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* status dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="text-sm border border-gray-200 rounded px-2.5 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-green-400"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {/* ESI ID search */}
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

          {/* refresh */}
          <button
            onClick={() => fetchPeriods(offset, statusFilter, esiFilter)}
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

      {/* table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-3 py-2.5 text-left text-gray-500 font-medium">ESI ID</th>
                <th className="px-3 py-2.5 text-left text-gray-500 font-medium whitespace-nowrap">Service Period</th>
                <th className="px-3 py-2.5 text-right text-gray-500 font-medium">Usage kWh</th>
                <th className="px-3 py-2.5 text-right text-gray-500 font-medium">Rate ¢/kWh</th>
                <th className="px-3 py-2.5 text-right text-gray-500 font-medium">TDSP Total</th>
                <th className="px-3 py-2.5 text-right text-gray-500 font-medium">Total Charge</th>
                <th className="px-3 py-2.5 text-center text-gray-500 font-medium">810</th>
                <th className="px-3 py-2.5 text-left text-gray-500 font-medium">Status</th>
                <th className="px-3 py-2.5 text-left text-gray-500 font-medium">Flags</th>
                <th className="px-3 py-2.5 text-left text-gray-500 font-medium whitespace-nowrap">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-sm text-gray-400">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-sm text-gray-400">
                    No billing periods found.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const flags: string[] = (() => {
                    try { return r.flags ? JSON.parse(r.flags) : []; }
                    catch { return []; }
                  })();
                  const rateCents = r.contract_rate != null
                    ? (Number(r.contract_rate) * 100).toFixed(4)
                    : "—";

                  return (
                    <tr
                      key={r.id}
                      onClick={() => router.push(`/billing/periods/${r.id}`)}
                      className="hover:bg-green-50 cursor-pointer transition-colors"
                    >
                      <td className="px-3 py-2 text-gray-800 font-mono text-xs">{r.esi_id}</td>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                        {r.service_start} – {r.service_end}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {fmt2(r.usage_kwh)}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">{rateCents}</td>
                      <td className="px-3 py-2 text-right text-gray-700">${fmt2(r.tdsp_total)}</td>
                      <td className="px-3 py-2 text-right font-medium text-gray-800">
                        ${fmt2(r.total_charge)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {r.has_810 ? (
                          <span className="text-green-600 font-bold">✓</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-600"}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {flags.map((f) => <FlagTag key={f} label={f} />)}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-gray-400 whitespace-nowrap">
                        {r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* pagination */}
        {!loading && rows.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500 bg-gray-50">
            <span>
              Showing {offset + 1}–{offset + rows.length}
              {hasMore ? "+" : ""}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrev}
                disabled={offset === 0}
                className="px-2.5 py-1 rounded border border-gray-200 bg-white hover:bg-gray-100 disabled:opacity-40 transition-colors"
              >
                ← Prev
              </button>
              <span className="px-2">Page {currentPage}</span>
              <button
                onClick={handleNext}
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
