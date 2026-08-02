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

const STATUS_COLORS: Record<string, { background: string; color: string }> = {
  draft: { background: "var(--ct-surface-hover)", color: "var(--ct-text-secondary)" },
  reviewed: { background: "var(--info-light-tint)", color: "var(--info-light)" },
  approved: { background: "var(--success-light-tint)", color: "var(--success-light)" },
  invoiced: { background: "var(--accent-light-tint)", color: "var(--accent-light)" },
};
const DEFAULT_STATUS_COLOR = { background: "var(--ct-surface-hover)", color: "var(--ct-text-secondary)" };

function fmt2(v: number | null | undefined): string {
  if (v == null) return "—";
  return Number(v).toFixed(2);
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" style={{ color: "var(--ct-text-muted)" }} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function FlagTag({ label }: { label: string }) {
  return (
    <span
      className="inline-flex px-1.5 py-0.5 rounded-[var(--r-sm)] text-xs font-medium border"
      style={{ background: "var(--amber-light-tint)", color: "var(--amber-light)", borderColor: "var(--amber-light-border)" }}
    >
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
          <h2 className="text-base font-semibold" style={{ color: "var(--ct-text-primary)" }}>Billing Periods</h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--ct-text-muted)" }}>Click a row to view detail and approve.</p>
        </div>

        {/* filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* status dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="text-sm rounded-[var(--r-sm)] px-2.5 py-1.5 border focus:outline-none focus:border-[var(--accent-light)]"
            style={{ background: "var(--ct-surface)", color: "var(--ct-text-secondary)", borderColor: "var(--ct-border-default)" }}
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
              className="text-sm rounded-[var(--r-sm)] px-2.5 py-1.5 w-44 border focus:outline-none focus:border-[var(--accent-light)]"
              style={{ background: "var(--ct-surface)", color: "var(--ct-text-secondary)", borderColor: "var(--ct-border-default)" }}
            />
            <button
              onClick={applyEsiSearch}
              className="px-3 py-1.5 text-xs rounded-[var(--r-sm)] border transition-colors hover:bg-[var(--ct-surface-hover)]"
              style={{ background: "var(--ct-surface-hover)", color: "var(--ct-text-secondary)", borderColor: "var(--ct-border-default)" }}
            >
              Search
            </button>
            {esiFilter && (
              <button
                onClick={() => { setEsiInput(""); setEsiFilter(""); setOffset(0); }}
                className="px-2 py-1.5 text-xs transition-colors hover:text-[var(--ct-text-secondary)]"
                style={{ color: "var(--ct-text-muted)" }}
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
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-[var(--r-sm)] border disabled:opacity-40 transition-colors hover:bg-[var(--ct-surface-hover)]"
            style={{ color: "var(--ct-text-muted)", borderColor: "var(--ct-border-default)" }}
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
        <div className="mb-4 px-4 py-3 rounded-[var(--r-md)] text-sm" style={{ background: "var(--danger-light-tint)", color: "var(--danger-light)" }}>
          {error}
        </div>
      )}

      {/* table */}
      <div className="rounded-[var(--r-lg)] border overflow-hidden" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-subtle)" }}>
              <tr>
                <th className="px-3 py-2.5 text-left font-medium" style={{ color: "var(--ct-text-muted)" }}>ESI ID</th>
                <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap" style={{ color: "var(--ct-text-muted)" }}>Service Period</th>
                <th className="px-3 py-2.5 text-right font-medium" style={{ color: "var(--ct-text-muted)" }}>Usage kWh</th>
                <th className="px-3 py-2.5 text-right font-medium" style={{ color: "var(--ct-text-muted)" }}>Rate ¢/kWh</th>
                <th className="px-3 py-2.5 text-right font-medium" style={{ color: "var(--ct-text-muted)" }}>TDSP Total</th>
                <th className="px-3 py-2.5 text-right font-medium" style={{ color: "var(--ct-text-muted)" }}>Total Charge</th>
                <th className="px-3 py-2.5 text-center font-medium" style={{ color: "var(--ct-text-muted)" }}>810</th>
                <th className="px-3 py-2.5 text-left font-medium" style={{ color: "var(--ct-text-muted)" }}>Status</th>
                <th className="px-3 py-2.5 text-left font-medium" style={{ color: "var(--ct-text-muted)" }}>Flags</th>
                <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap" style={{ color: "var(--ct-text-muted)" }}>Created</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "var(--ct-border-subtle)" }}>
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-sm" style={{ color: "var(--ct-text-muted)" }}>
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-sm" style={{ color: "var(--ct-text-muted)" }}>
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
                      className="cursor-pointer transition-colors hover:bg-[var(--ct-surface-hover)]"
                    >
                      <td className="px-3 py-2 font-mono text-xs" style={{ color: "var(--ct-text-primary)" }}>{r.esi_id}</td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--ct-text-secondary)" }}>
                        {r.service_start} – {r.service_end}
                      </td>
                      <td className="px-3 py-2 text-right" style={{ color: "var(--ct-text-secondary)" }}>
                        {fmt2(r.usage_kwh)}
                      </td>
                      <td className="px-3 py-2 text-right" style={{ color: "var(--ct-text-secondary)" }}>{rateCents}</td>
                      <td className="px-3 py-2 text-right" style={{ color: "var(--ct-text-secondary)" }}>${fmt2(r.tdsp_total)}</td>
                      <td className="px-3 py-2 text-right font-medium" style={{ color: "var(--ct-text-primary)" }}>
                        ${fmt2(r.total_charge)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {r.has_810 ? (
                          <span className="font-bold" style={{ color: "var(--success-light)" }}>✓</span>
                        ) : (
                          <span style={{ color: "var(--ct-text-muted)", opacity: 0.5 }}>—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex px-1.5 py-0.5 rounded-[var(--r-sm)] text-xs font-medium" style={STATUS_COLORS[r.status] ?? DEFAULT_STATUS_COLOR}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {flags.map((f) => <FlagTag key={f} label={f} />)}
                        </div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--ct-text-muted)" }}>
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
          <div className="px-4 py-3 border-t flex items-center justify-between text-xs" style={{ borderColor: "var(--ct-border-subtle)", background: "var(--ct-surface-hover)", color: "var(--ct-text-muted)" }}>
            <span>
              Showing {offset + 1}–{offset + rows.length}
              {hasMore ? "+" : ""}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrev}
                disabled={offset === 0}
                className="px-2.5 py-1 rounded-[var(--r-sm)] border disabled:opacity-40 transition-colors hover:bg-[var(--ct-surface-hover)]"
                style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}
              >
                ← Prev
              </button>
              <span className="px-2">Page {currentPage}</span>
              <button
                onClick={handleNext}
                disabled={!hasMore}
                className="px-2.5 py-1 rounded-[var(--r-sm)] border disabled:opacity-40 transition-colors hover:bg-[var(--ct-surface-hover)]"
                style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}
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
