import { useEffect, useState } from "react";
import EnrollmentLayout from "../../../components/EnrollmentLayout";
import api from "../../../utils/api";

const fmtDate = (ts: number) =>
  ts ? new Date(ts * 1000).toLocaleDateString("en-US") : "";
const fmtTs = (ts: string) =>
  ts ? new Date(parseInt(ts) * 1000).toLocaleDateString("en-US") : "";
const dispRate = (r: string) =>
  r ? (parseFloat(r) / 100).toFixed(4) : "";

// Row highlight reflects genuine reconciliation status, not decoration.
function rowBg(r: any): string | undefined {
  if (r.clean_record_flag === 1)  return "var(--success-light-tint)";
  if (r.billed_flag === 1)        return "var(--amber-light-tint)";
  if (r.flag_remarks === 1)       return "var(--danger-light-tint)";
  return undefined;
}

// ── Approve Modal ─────────────────────────────────────────────────────────────
function ApproveModal({ row, onClose, onSaved }: { row: any; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<"confirmation" | "template">("confirmation");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    setSaving(true); setErr("");
    try {
      await api.patch(`/enrollment/${row.esid}/approve`, {
        sid: type === "confirmation" ? row.sid : null,
        type,
      });
      onSaved();
    } catch (e: any) {
      setErr(e?.response?.data?.detail || "Failed.");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="rounded-[var(--r-lg)] shadow-xl w-full max-w-sm p-6" style={{ background: "var(--ct-surface)" }}>
        <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--ct-text-primary)" }}>Approve — {row.esid}</h3>
        <p className="text-xs mb-3" style={{ color: "var(--ct-text-muted)" }}>{row.company_name}</p>
        <div className="space-y-2 mb-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--ct-text-secondary)" }}>
            <input type="radio" checked={type === "confirmation"} onChange={() => setType("confirmation")} style={{ accentColor: "var(--accent-light)" }} />
            Confirmation (SID: {row.sid})
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--ct-text-secondary)" }}>
            <input type="radio" checked={type === "template"} onChange={() => setType("template")} style={{ accentColor: "var(--accent-light)" }} />
            Template
          </label>
        </div>
        {err && <p className="text-xs mb-2" style={{ color: "var(--danger-light)" }}>{err}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm hover:opacity-80" style={{ color: "var(--ct-text-secondary)" }}>Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-[var(--r-sm)] disabled:opacity-40" style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}>
            {saving ? "Saving…" : "Approve"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ComparisonReport() {
  const [rows, setRows]     = useState<any[]>([]);
  const [start, setStart]   = useState("");
  const [end, setEnd]       = useState("");
  const [loading, setLoading] = useState(true);
  const [approveRow, setApproveRow] = useState<any | null>(null);

  const load = (s?: string, e?: string) => {
    setLoading(true);
    const qs = s && e ? `?start=${s}&end=${e}` : "";
    api.get(`/enrollment/reports/comparison${qs}`)
      .then((r) => setRows(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const refresh = () => load(start || undefined, end || undefined);

  const handleSearch = () => {
    if (start && end) load(start, end);
    else load();
  };

  const toggleCheck = async (esid: string, field: string, val: number) => {
    const newVal = val === 1 ? 0 : 1;
    await api.patch(`/enrollment/${esid}/edit`, { [field]: newVal });
    refresh();
  };

  return (
    <EnrollmentLayout title="Enrollment – Comparison">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="text-base font-semibold" style={{ color: "var(--ct-text-primary)" }}>Enrl / Confirmation Comparison</h2>
        <div className="flex items-center gap-2">
          <input type="date" className="border rounded-[var(--r-sm)] px-2 py-1 text-xs outline-none focus:border-[var(--accent-light)]"
            style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
            value={start} onChange={(e) => setStart(e.target.value)} />
          <span className="text-xs" style={{ color: "var(--ct-text-muted)" }}>to</span>
          <input type="date" className="border rounded-[var(--r-sm)] px-2 py-1 text-xs outline-none focus:border-[var(--accent-light)]"
            style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
            value={end} onChange={(e) => setEnd(e.target.value)} />
          <button onClick={handleSearch}
            className="px-3 py-1.5 text-xs rounded-[var(--r-sm)]" style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}>
            Search
          </button>
          <button onClick={() => { setStart(""); setEnd(""); load(); }}
            className="px-3 py-1.5 text-xs rounded-[var(--r-sm)] hover:opacity-80" style={{ background: "var(--ct-surface-hover)", color: "var(--ct-text-secondary)" }}>
            Reset
          </button>
        </div>
      </div>

      <div className="flex gap-3 mb-4 text-xs">
        <span className="flex items-center gap-1" style={{ color: "var(--ct-text-secondary)" }}><span className="w-3 h-3 rounded-[var(--r-sm)] inline-block" style={{ background: "var(--success-light)" }} /> Clean</span>
        <span className="flex items-center gap-1" style={{ color: "var(--ct-text-secondary)" }}><span className="w-3 h-3 rounded-[var(--r-sm)] inline-block" style={{ background: "var(--amber-light)" }} /> Billed</span>
        <span className="flex items-center gap-1" style={{ color: "var(--ct-text-secondary)" }}><span className="w-3 h-3 rounded-[var(--r-sm)] inline-block" style={{ background: "var(--danger-light)" }} /> Remark</span>
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: "var(--ct-text-muted)" }}>Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--r-md)] border" style={{ borderColor: "var(--ct-border-default)" }}>
          <table className="w-full text-xs">
            <thead className="border-b" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}>
              <tr>
                {[
                  "#","ESID","Company","Broker","Enrl Rate","Term","Zone",
                  "Conf Name","Conf Rate","Conf Term","Profiles","Conf Date",
                  "Meter","Tax Exempt","Remarks","Status","Approve",
                ].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap" style={{ color: "var(--ct-text-muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.length === 0 ? (
                <tr><td colSpan={17} className="px-3 py-6 text-center" style={{ color: "var(--ct-text-muted)" }}>No records</td></tr>
              ) : rows.map((r, i) => (
                <tr key={`${r.esid}-${i}`} className="hover:opacity-90" style={{ background: rowBg(r) }}>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-muted)" }}>{i + 1}</td>
                  <td className="px-3 py-2 font-mono whitespace-nowrap" style={{ color: "var(--ct-text-primary)" }}>{r.esid}</td>
                  <td className="px-3 py-2 max-w-[130px] truncate" style={{ color: "var(--ct-text-secondary)" }}>{r.company_name}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.broker_code}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{dispRate(r.contract_rate)}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.contract_term}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.zone}</td>
                  <td className="px-3 py-2 max-w-[130px] truncate" style={{ color: "var(--ct-text-secondary)" }}>{r.customer_name}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.contract_rate_comm}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.term}</td>
                  <td className="px-3 py-2 max-w-[120px]" style={{ color: "var(--ct-text-muted)" }}>
                    {(r.profiles || []).join(", ")}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--ct-text-muted)" }}>{fmtTs(r.date_modified)}</td>
                  <td className="px-3 py-2">
                    <span className="px-1.5 py-0.5 rounded-[var(--r-sm)] text-xs"
                      style={r.meter_fee_check === 1
                        ? { background: "var(--success-light-tint)", color: "var(--success-light)" }
                        : { background: "var(--danger-light-tint)", color: "var(--danger-light)" }}>
                      {r.meter_fee_check === 1 ? "✓" : "✗"} {r.enrollment_meter}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {r.tax_error === 1 && <span className="font-medium" style={{ color: "var(--danger-light)" }}>Error</span>}
                    {r.tax_error_certificate === 1 && <span className="font-medium" style={{ color: "var(--amber-light)" }}>Cert?</span>}
                    {r.tax_certificate === 1 && !r.tax_error && !r.tax_error_certificate && (
                      <span style={{ color: "var(--success-light)" }}>Cert ✓</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-medium" style={{ color: "var(--danger-light)" }}>{r.remarks}</td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--ct-text-secondary)" }}>{r.enrollment_status}</td>
                  <td className="px-3 py-2">
                    {r.sid && (
                      <button onClick={() => setApproveRow(r)}
                        className="px-2 py-1 rounded-[var(--r-sm)] text-xs hover:opacity-80 whitespace-nowrap" style={{ background: "var(--accent-light-tint)", color: "var(--accent-light)" }}>
                        Approve
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {approveRow && (
        <ApproveModal
          row={approveRow}
          onClose={() => setApproveRow(null)}
          onSaved={() => { setApproveRow(null); refresh(); }}
        />
      )}
    </EnrollmentLayout>
  );
}
