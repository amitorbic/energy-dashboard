import { useEffect, useState } from "react";
import EnrollmentLayout from "../../../components/EnrollmentLayout";
import api from "../../../utils/api";

const fmtDate = (ts: number) =>
  ts ? new Date(ts * 1000).toLocaleDateString("en-US") : "";
const fmtTs = (ts: string) =>
  ts ? new Date(parseInt(ts) * 1000).toLocaleDateString("en-US") : "";
const dispRate = (r: string) =>
  r ? (parseFloat(r) / 100).toFixed(4) : "";

function rowBg(r: any): string {
  if (r.clean_record_flag === 1)  return "bg-green-50";
  if (r.billed_flag === 1)        return "bg-orange-50";
  if (r.flag_remarks === 1)       return "bg-red-50";
  return "";
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
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Approve — {row.esid}</h3>
        <p className="text-xs text-gray-500 mb-3">{row.company_name}</p>
        <div className="space-y-2 mb-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="radio" checked={type === "confirmation"} onChange={() => setType("confirmation")} />
            Confirmation (SID: {row.sid})
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="radio" checked={type === "template"} onChange={() => setType("template")} />
            Template
          </label>
        </div>
        {err && <p className="text-xs text-red-500 mb-2">{err}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-40">
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
        <h2 className="text-base font-semibold text-gray-800">Enrl / Confirmation Comparison</h2>
        <div className="flex items-center gap-2">
          <input type="date" className="border border-gray-300 rounded px-2 py-1 text-xs"
            value={start} onChange={(e) => setStart(e.target.value)} />
          <span className="text-xs text-gray-400">to</span>
          <input type="date" className="border border-gray-300 rounded px-2 py-1 text-xs"
            value={end} onChange={(e) => setEnd(e.target.value)} />
          <button onClick={handleSearch}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">
            Search
          </button>
          <button onClick={() => { setStart(""); setEnd(""); load(); }}
            className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded hover:bg-gray-200">
            Reset
          </button>
        </div>
      </div>

      <div className="flex gap-3 mb-4 text-xs">
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-200 rounded-sm inline-block" /> Clean</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-orange-200 rounded-sm inline-block" /> Billed</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-200 rounded-sm inline-block" /> Remark</span>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {[
                  "#","ESID","Company","Broker","Enrl Rate","Term","Zone",
                  "Conf Name","Conf Rate","Conf Term","Profiles","Conf Date",
                  "Meter","Tax Exempt","Remarks","Status","Approve",
                ].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 ? (
                <tr><td colSpan={17} className="px-3 py-6 text-center text-gray-400">No records</td></tr>
              ) : rows.map((r, i) => (
                <tr key={`${r.esid}-${i}`} className={`hover:bg-opacity-80 ${rowBg(r)}`}>
                  <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                  <td className="px-3 py-2 font-mono text-gray-800 whitespace-nowrap">{r.esid}</td>
                  <td className="px-3 py-2 text-gray-700 max-w-[130px] truncate">{r.company_name}</td>
                  <td className="px-3 py-2 text-gray-600">{r.broker_code}</td>
                  <td className="px-3 py-2 text-gray-600">{dispRate(r.contract_rate)}</td>
                  <td className="px-3 py-2 text-gray-600">{r.contract_term}</td>
                  <td className="px-3 py-2 text-gray-600">{r.zone}</td>
                  <td className="px-3 py-2 text-gray-700 max-w-[130px] truncate">{r.customer_name}</td>
                  <td className="px-3 py-2 text-gray-600">{r.contract_rate_comm}</td>
                  <td className="px-3 py-2 text-gray-600">{r.term}</td>
                  <td className="px-3 py-2 text-gray-500 max-w-[120px]">
                    {(r.profiles || []).join(", ")}
                  </td>
                  <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{fmtTs(r.date_modified)}</td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-xs ${r.meter_fee_check === 1 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                      {r.meter_fee_check === 1 ? "✓" : "✗"} {r.enrollment_meter}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {r.tax_error === 1 && <span className="text-red-500 font-medium">Error</span>}
                    {r.tax_error_certificate === 1 && <span className="text-orange-500 font-medium">Cert?</span>}
                    {r.tax_certificate === 1 && !r.tax_error && !r.tax_error_certificate && (
                      <span className="text-green-600">Cert ✓</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-red-600 font-medium">{r.remarks}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.enrollment_status}</td>
                  <td className="px-3 py-2">
                    {r.sid && (
                      <button onClick={() => setApproveRow(r)}
                        className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200 whitespace-nowrap">
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
