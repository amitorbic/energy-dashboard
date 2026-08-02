import { useCallback, useEffect, useState } from "react";
import BillingEngineLayout from "../../components/BillingEngineLayout";
import api from "../../utils/api";
import { isAdmin } from "../../utils/auth";

// ── types ─────────────────────────────────────────────────────────────────────

interface UnmatchedEsi {
  id: number;
  esi_id: string;
  service_start: string;
  service_end: string;
  usage_kwh: number | null;
  tdsp_name: string | null;
  created_at: string;
  original_filename: string | null;
  file_date: string | null;
}

interface UnknownCharge {
  id: number;
  esi_id: string;
  charge_code: string;
  charge_description: string | null;
  charge_amount: number;
  tdsp_name: string | null;
  service_start: string;
  service_end: string;
  created_at: string;
  original_filename: string | null;
}

interface ReadyToBill {
  id: number;
  esi_id: string;
  service_start: string;
  service_end: string;
  billing_days: number;
  usage_kwh: number | null;
  contract_rate: number;
  meter_fee: number | null;
  flags: string | null;
  status: string;
  created_at: string;
}

type TabKey = "unmatched" | "unknown" | "ready";

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(v: number | null | undefined, decimals = 4): string {
  if (v == null) return "—";
  return Number(v).toFixed(decimals);
}

function period(start: string, end: string) {
  return `${start} – ${end}`;
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" style={{ color: "var(--ct-text-muted)" }} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function EmptyRow({ cols, msg }: { cols: number; msg: string }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-8 text-center text-sm" style={{ color: "var(--ct-text-muted)" }}>
        {msg}
      </td>
    </tr>
  );
}

// ── tab badge ─────────────────────────────────────────────────────────────────

function Badge({ count, loading }: { count: number; loading: boolean }) {
  if (loading) return <span className="ml-1.5 text-xs" style={{ color: "var(--ct-text-muted)" }}>…</span>;
  if (count === 0) return null;
  return (
    <span
      className="ml-1.5 inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-xs font-semibold min-w-[1.25rem]"
      style={{ background: "var(--accent-light-tint)", color: "var(--accent-light)" }}
    >
      {count}
    </span>
  );
}

// ── tables ────────────────────────────────────────────────────────────────────

function UnmatchedTable({ rows, loading, onRefresh }: {
  rows: UnmatchedEsi[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [rowError, setRowError]     = useState<{ id: number; msg: string } | null>(null);
  const admin = isAdmin();

  const handleDelete = async (row: UnmatchedEsi) => {
    if (!window.confirm(
      `Delete unmatched record for ESI ${row.esi_id} (${period(row.service_start, row.service_end)})?\n\n` +
      `This permanently removes this record. Blocked if it has already been matched to a billing period.`
    )) return;

    setRowError(null);
    setDeletingId(row.id);
    try {
      await api.delete(`/admin/edi-867-usage/${row.id}`);
      onRefresh();
    } catch (e: any) {
      setRowError({ id: row.id, msg: e?.response?.data?.detail ?? "Delete failed." });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="border-b" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-subtle)" }}>
          <tr>
            <th className="px-3 py-2.5 text-left font-medium" style={{ color: "var(--ct-text-muted)" }}>ESI ID</th>
            <th className="px-3 py-2.5 text-left font-medium" style={{ color: "var(--ct-text-muted)" }}>Service Period</th>
            <th className="px-3 py-2.5 text-right font-medium" style={{ color: "var(--ct-text-muted)" }}>Usage (kWh)</th>
            <th className="px-3 py-2.5 text-left font-medium" style={{ color: "var(--ct-text-muted)" }}>TDSP</th>
            <th className="px-3 py-2.5 text-left font-medium" style={{ color: "var(--ct-text-muted)" }}>Source File</th>
            <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap" style={{ color: "var(--ct-text-muted)" }}>Loaded At</th>
            {admin && <th className="px-3 py-2.5 text-right font-medium" style={{ color: "var(--ct-text-muted)" }}>&nbsp;</th>}
          </tr>
        </thead>
        <tbody className="divide-y" style={{ borderColor: "var(--ct-border-subtle)" }}>
          {loading ? (
            <EmptyRow cols={admin ? 7 : 6} msg="Loading…" />
          ) : rows.length === 0 ? (
            <EmptyRow cols={admin ? 7 : 6} msg="No unmatched ESI IDs." />
          ) : (
            rows.map((r) => (
              <tr key={r.id} className="transition-colors hover:bg-[var(--ct-surface-hover)]">
                <td className="px-3 py-2 font-mono" style={{ color: "var(--ct-text-primary)" }}>{r.esi_id}</td>
                <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--ct-text-secondary)" }}>
                  {period(r.service_start, r.service_end)}
                </td>
                <td className="px-3 py-2 text-right" style={{ color: "var(--ct-text-secondary)" }}>
                  {fmt(r.usage_kwh, 2)}
                </td>
                <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.tdsp_name ?? "—"}</td>
                <td className="px-3 py-2 max-w-xs truncate" style={{ color: "var(--ct-text-muted)" }} title={r.original_filename ?? ""}>
                  {r.original_filename ?? "—"}
                </td>
                <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--ct-text-muted)" }}>
                  {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
                </td>
                {admin && (
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => handleDelete(r)}
                      disabled={deletingId === r.id}
                      className="text-xs disabled:opacity-40 transition-colors hover:text-[var(--danger-light)]"
                      style={{ color: "var(--danger-light)" }}
                      title="Delete this record (blocked if already matched to a billing period)"
                    >
                      {deletingId === r.id ? "…" : "Delete"}
                    </button>
                    {rowError?.id === r.id && (
                      <p className="text-xs mt-1 max-w-[220px] ml-auto text-right" style={{ color: "var(--danger-light)" }}>{rowError.msg}</p>
                    )}
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function UnknownChargesTable({ rows, loading }: { rows: UnknownCharge[]; loading: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="border-b" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-subtle)" }}>
          <tr>
            <th className="px-3 py-2.5 text-left font-medium" style={{ color: "var(--ct-text-muted)" }}>Charge Code</th>
            <th className="px-3 py-2.5 text-left font-medium" style={{ color: "var(--ct-text-muted)" }}>Description</th>
            <th className="px-3 py-2.5 text-left font-medium" style={{ color: "var(--ct-text-muted)" }}>ESI ID</th>
            <th className="px-3 py-2.5 text-right font-medium" style={{ color: "var(--ct-text-muted)" }}>Amount ($)</th>
            <th className="px-3 py-2.5 text-left font-medium" style={{ color: "var(--ct-text-muted)" }}>Service Period</th>
            <th className="px-3 py-2.5 text-left font-medium" style={{ color: "var(--ct-text-muted)" }}>TDSP</th>
            <th className="px-3 py-2.5 text-left font-medium" style={{ color: "var(--ct-text-muted)" }}>Source File</th>
          </tr>
        </thead>
        <tbody className="divide-y" style={{ borderColor: "var(--ct-border-subtle)" }}>
          {loading ? (
            <EmptyRow cols={7} msg="Loading…" />
          ) : rows.length === 0 ? (
            <EmptyRow cols={7} msg="No unknown charge codes." />
          ) : (
            rows.map((r) => (
              <tr key={r.id} className="transition-colors hover:bg-[var(--ct-surface-hover)]">
                <td className="px-3 py-2">
                  <span
                    className="font-mono font-medium px-1.5 py-0.5 rounded-[var(--r-sm)]"
                    style={{ background: "var(--amber-light-tint)", color: "var(--amber-light)" }}
                  >
                    {r.charge_code}
                  </span>
                </td>
                <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.charge_description ?? "—"}</td>
                <td className="px-3 py-2 font-mono" style={{ color: "var(--ct-text-primary)" }}>{r.esi_id}</td>
                <td className="px-3 py-2 text-right" style={{ color: "var(--ct-text-secondary)" }}>
                  {Number(r.charge_amount).toFixed(2)}
                </td>
                <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--ct-text-secondary)" }}>
                  {period(r.service_start, r.service_end)}
                </td>
                <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.tdsp_name ?? "—"}</td>
                <td className="px-3 py-2 max-w-xs truncate" style={{ color: "var(--ct-text-muted)" }} title={r.original_filename ?? ""}>
                  {r.original_filename ?? "—"}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function ReadyToBillTable({ rows, loading }: { rows: ReadyToBill[]; loading: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="border-b" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-subtle)" }}>
          <tr>
            <th className="px-3 py-2.5 text-left font-medium" style={{ color: "var(--ct-text-muted)" }}>ESI ID</th>
            <th className="px-3 py-2.5 text-left font-medium" style={{ color: "var(--ct-text-muted)" }}>Service Period</th>
            <th className="px-3 py-2.5 text-right font-medium" style={{ color: "var(--ct-text-muted)" }}>Days</th>
            <th className="px-3 py-2.5 text-right font-medium" style={{ color: "var(--ct-text-muted)" }}>Usage (kWh)</th>
            <th className="px-3 py-2.5 text-right font-medium" style={{ color: "var(--ct-text-muted)" }}>Rate (¢/kWh)</th>
            <th className="px-3 py-2.5 text-right font-medium" style={{ color: "var(--ct-text-muted)" }}>Meter Fee ($)</th>
            <th className="px-3 py-2.5 text-left font-medium" style={{ color: "var(--ct-text-muted)" }}>Status</th>
          </tr>
        </thead>
        <tbody className="divide-y" style={{ borderColor: "var(--ct-border-subtle)" }}>
          {loading ? (
            <EmptyRow cols={7} msg="Loading…" />
          ) : rows.length === 0 ? (
            <EmptyRow cols={7} msg="No billing periods ready to bill." />
          ) : (
            rows.map((r) => {
              // contract_rate is stored as decimal (e.g. 0.054321) — display as ¢/kWh
              const rateCents = Number(r.contract_rate) * 100;
              return (
                <tr key={r.id} className="transition-colors hover:bg-[var(--ct-surface-hover)]">
                  <td className="px-3 py-2 font-mono" style={{ color: "var(--ct-text-primary)" }}>{r.esi_id}</td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--ct-text-secondary)" }}>
                    {period(r.service_start, r.service_end)}
                  </td>
                  <td className="px-3 py-2 text-right" style={{ color: "var(--ct-text-secondary)" }}>{r.billing_days}</td>
                  <td className="px-3 py-2 text-right" style={{ color: "var(--ct-text-secondary)" }}>
                    {fmt(r.usage_kwh, 2)}
                  </td>
                  <td className="px-3 py-2 text-right" style={{ color: "var(--ct-text-secondary)" }}>
                    {rateCents.toFixed(4)}
                  </td>
                  <td className="px-3 py-2 text-right" style={{ color: "var(--ct-text-secondary)" }}>
                    {r.meter_fee != null ? Number(r.meter_fee).toFixed(2) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className="inline-flex px-1.5 py-0.5 rounded-[var(--r-sm)] text-xs font-medium"
                      style={r.status === "reviewed"
                        ? { background: "var(--info-light-tint)", color: "var(--info-light)" }
                        : { background: "var(--ct-surface-hover)", color: "var(--ct-text-secondary)" }}
                    >
                      {r.status}
                    </span>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function BillingReviewPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("unmatched");

  const [unmatched, setUnmatched]   = useState<UnmatchedEsi[]>([]);
  const [unknown, setUnknown]       = useState<UnknownCharge[]>([]);
  const [ready, setReady]           = useState<ReadyToBill[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [r1, r2, r3] = await Promise.all([
        api.get("/billing-engine/review/unmatched-esi"),
        api.get("/billing-engine/review/unknown-charges"),
        api.get("/billing-engine/review/ready-to-bill"),
      ]);
      setUnmatched(r1.data);
      setUnknown(r2.data);
      setReady(r3.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Failed to load review data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const TABS: { key: TabKey; label: string; count: number }[] = [
    { key: "unmatched", label: "Unmatched ESI IDs",    count: unmatched.length },
    { key: "unknown",   label: "Unknown Charge Codes",  count: unknown.length   },
    { key: "ready",     label: "Ready to Bill",         count: ready.length     },
  ];

  return (
    <BillingEngineLayout title="Billing Review">
      {/* header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold" style={{ color: "var(--ct-text-primary)" }}>Billing Review</h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--ct-text-muted)" }}>
            Resolve exceptions before approving billing periods.
          </p>
        </div>
        <button
          onClick={loadAll}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-[var(--r-sm)] border disabled:opacity-40 transition-colors hover:bg-[var(--ct-surface-hover)]"
          style={{ color: "var(--ct-text-secondary)", borderColor: "var(--ct-border-default)" }}
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
        <div className="mb-4 px-4 py-3 rounded-[var(--r-md)] border text-sm" style={{ background: "var(--danger-light-tint)", borderColor: "var(--danger-light-tint)", color: "var(--danger-light)" }}>
          {error}
        </div>
      )}

      {/* tabs */}
      <div className="rounded-[var(--r-lg)] border overflow-hidden" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
        {/* tab bar */}
        <div className="flex border-b" style={{ borderColor: "var(--ct-border-default)", background: "var(--ct-surface-hover)" }}>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex items-center px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px"
              style={activeTab === tab.key
                ? { borderColor: "var(--accent-light)", color: "var(--accent-light)", background: "var(--ct-surface)" }
                : { borderColor: "transparent", color: "var(--ct-text-muted)" }}
            >
              {tab.label}
              <Badge count={tab.count} loading={loading} />
            </button>
          ))}
        </div>

        {/* tab content */}
        <div>
          {activeTab === "unmatched" && (
            <UnmatchedTable rows={unmatched} loading={loading} onRefresh={loadAll} />
          )}
          {activeTab === "unknown" && (
            <UnknownChargesTable rows={unknown} loading={loading} />
          )}
          {activeTab === "ready" && (
            <ReadyToBillTable rows={ready} loading={loading} />
          )}
        </div>
      </div>
    </BillingEngineLayout>
  );
}
