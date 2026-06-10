import { useEffect, useState } from "react";
import EnrollmentLayout from "../../components/EnrollmentLayout";
import api from "../../utils/api";
import { isAdmin } from "../../utils/auth";

const fmtDate = (ts: number) =>
  ts ? new Date(ts * 1000).toLocaleDateString("en-US") : "";
const fmtTs = (ts: string) =>
  ts ? new Date(parseInt(ts) * 1000).toLocaleString("en-US") : "";
const dispRate = (r: string) =>
  r ? (parseFloat(r) / 100).toFixed(4) : "";

function getDifferenceMonths(start: string, end: string): number {
  if (!start || !end) return 0;
  const year  = +end.slice(6, 10) - +start.slice(6, 10);
  const month = +end.slice(0, 2)  - +start.slice(0, 2);
  const days  = +end.slice(3, 5)  - +start.slice(3, 5);
  return year * 12 + month + (days > 15 ? 1 : 0);
}

function rowBg(r: any): string {
  const s = r.enrollment_status || "";
  if (s.startsWith("Completed"))  return "bg-green-50";
  if (s.startsWith("Scheduled"))  return "bg-blue-50";
  if (s.includes("Cancelled"))    return "bg-red-50";
  const diff = getDifferenceMonths(r.contract_start_date, r.contract_end_date);
  if (diff !== parseInt(r.contract_term || "0")) return "bg-yellow-50";
  return "";
}

// ── Edit Modal ────────────────────────────────────────────────────────────────
function EditModal({ row, onClose, onSaved }: { row: any; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    company_name: row.company_name || "",
    broker_code: row.broker_code || "",
    contract_rate: dispRate(row.contract_rate),
    commission: row.commission || "",
    contract_start_date: row.contract_start_date || "",
    contract_end_date: row.contract_end_date || "",
    zone: row.zone || "",
    meter_fees: row.meter_fees || "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    setSaving(true);
    setErr("");
    try {
      await api.patch(`/enrollment/${row.esid}/edit`, {
        ...form,
        company_name_old: row.company_name,
        contract_end_date_old: row.contract_end_date,
      });
      onSaved();
    } catch (e: any) {
      setErr(e?.response?.data?.detail || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, key: keyof typeof form) => (
    <div key={key}>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
        <h3 className="text-sm font-semibold text-gray-800 mb-4">Edit Enrollment — {row.esid}</h3>
        <div className="grid grid-cols-2 gap-3">
          {field("Company Name", "company_name")}
          {field("Broker Code", "broker_code")}
          {field("Contract Rate", "contract_rate")}
          {field("Commission", "commission")}
          {field("Start Date (MM/DD/YYYY)", "contract_start_date")}
          {field("End Date (MM/DD/YYYY)", "contract_end_date")}
          {field("Zone", "zone")}
          {field("Meter Fees", "meter_fees")}
        </div>
        {err && <p className="mt-2 text-xs text-red-500">{err}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-40">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Status Modal ──────────────────────────────────────────────────────────────
const STATUS_OPTIONS = [
  "None", "Scheduled", "Switch Hold on ESI ID", "Pending permit",
  "Cancelled", "Completed",
];
const STATUS_OPTIONS_ADMIN = [...STATUS_OPTIONS, "Cancelled By Customer"];
const COMMENT_OPTIONS = [
  "None", "Notify broker", "Follow up broker",
  "Notified Customer", "Account Re-enrolled", "Cancelled by Customer",
];

function StatusModal({ row, onClose, onSaved }: { row: any; onClose: () => void; onSaved: () => void }) {
  const admin = isAdmin();
  const [radio1, setRadio1] = useState(row.enrollment_status?.split("-")[0] || "None");
  const [txtdate, setTxtdate] = useState("");
  const [txtdate1, setTxtdate1] = useState("");
  const [comment, setComment] = useState("");
  const [commentOthers, setCommentOthers] = useState(false);
  const [txtarea, setTxtarea] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    setSaving(true);
    setErr("");
    try {
      await api.patch(`/enrollment/${row.esid}/status`, {
        radio1,
        txtdate,
        txtdate1,
        comment,
        comment_others: commentOthers ? "on" : "",
        txtarea,
        status_old: row.enrollment_status || "-",
      });
      onSaved();
    } catch (e: any) {
      setErr(e?.response?.data?.detail || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const opts = admin ? STATUS_OPTIONS_ADMIN : STATUS_OPTIONS;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <h3 className="text-sm font-semibold text-gray-800 mb-4">Status Check — {row.esid}</h3>
        <p className="text-xs text-gray-500 mb-3">Current: <strong>{row.enrollment_status || "—"}</strong></p>

        <div className="space-y-1 mb-3">
          {opts.map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="radio" name="status" value={o} checked={radio1 === o} onChange={() => setRadio1(o)} />
              {o}
            </label>
          ))}
        </div>

        {radio1 === "Scheduled" && (
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">Scheduled Date</label>
            <input type="date" className="border border-gray-300 rounded px-2 py-1 text-sm w-full"
              value={txtdate} onChange={(e) => setTxtdate(e.target.value)} />
          </div>
        )}
        {radio1 === "Completed" && (
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">Completed Date <span className="text-red-500">*</span></label>
            <input type="date" className="border border-gray-300 rounded px-2 py-1 text-sm w-full"
              value={txtdate1} onChange={(e) => setTxtdate1(e.target.value)} />
          </div>
        )}

        <div className="space-y-1 mb-3">
          {COMMENT_OPTIONS.map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="radio" name="comment" value={o} checked={comment === o} onChange={() => setComment(o)} />
              {o}
            </label>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700 mb-2 cursor-pointer">
          <input type="checkbox" checked={commentOthers} onChange={(e) => setCommentOthers(e.target.checked)} />
          Others
        </label>
        {commentOthers && (
          <textarea rows={2} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm mb-2 resize-none"
            placeholder="Enter other comment…" value={txtarea} onChange={(e) => setTxtarea(e.target.value)} />
        )}

        {err && <p className="text-xs text-red-500 mb-2">{err}</p>}
        <div className="flex justify-end gap-2 mt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-40">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Log Modal ─────────────────────────────────────────────────────────────────
function LogModal({ esid, onClose }: { esid: string; onClose: () => void }) {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/enrollment/${esid}/log`)
      .then((r) => setEntries(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [esid]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-6 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-800">Log — {esid}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          <div className="overflow-y-auto flex-1">
            {entries.length === 0 ? (
              <p className="text-sm text-gray-400">No log entries.</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                  <tr>
                    {["Date","User","Comments"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-medium text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {entries.map((e, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtTs(e.date_modified)}</td>
                      <td className="px-3 py-2 text-gray-700">{e.user}</td>
                      <td className="px-3 py-2 text-gray-600"
                        dangerouslySetInnerHTML={{ __html: (e.comments || "").replace(/<br\s*\/?>/gi, "<br/>") }} />
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
type SortMode = "default" | "date" | "comment" | "status";
type ModalState =
  | { type: "edit";   row: any }
  | { type: "status"; row: any }
  | { type: "log";    esid: string }
  | null;

export default function ViewEnrollments() {
  const [rows, setRows]     = useState<any[]>([]);
  const [sort, setSort]     = useState<SortMode>("default");
  const [loading, setLoading] = useState(true);
  const [modal, setModal]   = useState<ModalState>(null);
  const admin = isAdmin();

  const load = (s: SortMode) => {
    setLoading(true);
    const qs = s !== "default" ? `?sort=${s}` : "";
    api.get(`/enrollment/view${qs}`)
      .then((r) => { setRows(r.data); setSort(s); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load("default"); }, []);

  const refresh = () => load(sort);

  const clearRow = async (esid: string) => {
    if (!confirm("Mark this enrollment as cleared?")) return;
    await api.patch(`/enrollment/${esid}/clear`);
    refresh();
  };

  const deleteRow = async (esid: string) => {
    if (!confirm("Soft-delete this enrollment?")) return;
    await api.patch(`/enrollment/${esid}/action`, { type: "delete" });
    refresh();
  };

  const sortBtn = (label: string, s: SortMode) => (
    <button
      key={s}
      onClick={() => load(s)}
      className={`px-3 py-1.5 text-xs rounded border transition-colors ${
        sort === s
          ? "bg-blue-600 text-white border-blue-600"
          : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
      }`}
    >
      {label}
    </button>
  );

  return (
    <EnrollmentLayout title="Enrollment – View">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-base font-semibold text-gray-800">View Enrollments</h2>
        <div className="flex gap-2">
          {sortBtn("Default", "default")}
          {sortBtn("By Date", "date")}
          {sortBtn("By Comment", "comment")}
          {sortBtn("By Status", "status")}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["#","ESID","Company","Broker","Rate","Term","Zone","Status","Added","Actions"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 ? (
                <tr><td colSpan={10} className="px-3 py-6 text-center text-gray-400">No records</td></tr>
              ) : rows.map((r, i) => (
                <tr key={r.esid} className={`hover:bg-gray-50 ${rowBg(r)}`}>
                  <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                  <td className="px-3 py-2 font-mono text-gray-800 whitespace-nowrap">{r.esid}</td>
                  <td className="px-3 py-2 text-gray-700 max-w-[160px] truncate">{r.company_name}</td>
                  <td className="px-3 py-2 text-gray-600">{r.broker_code}</td>
                  <td className="px-3 py-2 text-gray-600">{dispRate(r.contract_rate)}</td>
                  <td className="px-3 py-2 text-gray-600">{r.contract_term}</td>
                  <td className="px-3 py-2 text-gray-600">{r.zone}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.enrollment_status}</td>
                  <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{fmtDate(r.date_added)}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1 flex-wrap">
                      <button onClick={() => setModal({ type: "edit", row: r })}
                        className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200">Edit</button>
                      <button onClick={() => setModal({ type: "status", row: r })}
                        className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs hover:bg-yellow-200">Status</button>
                      <button onClick={() => setModal({ type: "log", esid: r.esid })}
                        className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200">Log</button>
                      <button onClick={() => clearRow(r.esid)}
                        className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200">Clear</button>
                      {admin && (
                        <button onClick={() => deleteRow(r.esid)}
                          className="px-2 py-1 bg-red-100 text-red-600 rounded text-xs hover:bg-red-200">Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal?.type === "edit"   && <EditModal   row={modal.row}  onClose={() => setModal(null)} onSaved={() => { setModal(null); refresh(); }} />}
      {modal?.type === "status" && <StatusModal row={modal.row}  onClose={() => setModal(null)} onSaved={() => { setModal(null); refresh(); }} />}
      {modal?.type === "log"    && <LogModal    esid={modal.esid} onClose={() => setModal(null)} />}
    </EnrollmentLayout>
  );
}
