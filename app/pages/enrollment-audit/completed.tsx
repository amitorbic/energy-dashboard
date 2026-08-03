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

function rowBg(r: any): string {
  const s = r.enrollment_status || "";
  if (s.startsWith("Completed")) return "var(--success-light-tint)";
  return "var(--ct-surface-hover)";
}

// ── Status Modal (reused from view) ──────────────────────────────────────────
const STATUS_OPTIONS = [
  "None","Scheduled","Switch Hold on ESI ID","Pending permit",
  "Cancelled","Completed",
];
const STATUS_OPTIONS_ADMIN = [...STATUS_OPTIONS, "Cancelled By Customer"];
const COMMENT_OPTIONS = [
  "None","Notify broker","Follow up broker",
  "Notified Customer","Account Re-enrolled","Cancelled by Customer",
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
    setSaving(true); setErr("");
    try {
      await api.patch(`/enrollment/${row.esid}/status`, {
        radio1, txtdate, txtdate1, comment,
        comment_others: commentOthers ? "on" : "",
        txtarea, status_old: row.enrollment_status || "-",
      });
      onSaved();
    } catch (e: any) {
      setErr(e?.response?.data?.detail || "Save failed.");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="rounded-[var(--r-lg)] shadow-xl w-full max-w-md p-6" style={{ background: "var(--ct-surface)" }}>
        <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--ct-text-primary)" }}>Status Check — {row.esid}</h3>
        <p className="text-xs mb-3" style={{ color: "var(--ct-text-muted)" }}>Current: <strong>{row.enrollment_status || "—"}</strong></p>
        <div className="space-y-1 mb-3">
          {(admin ? STATUS_OPTIONS_ADMIN : STATUS_OPTIONS).map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--ct-text-secondary)" }}>
              <input type="radio" name="status" value={o} checked={radio1 === o} onChange={() => setRadio1(o)} style={{ accentColor: "var(--accent-light)" }} />
              {o}
            </label>
          ))}
        </div>
        {radio1 === "Scheduled" && (
          <div className="mb-3">
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--ct-text-secondary)" }}>Scheduled Date</label>
            <input type="date" className="border rounded-[var(--r-sm)] px-2 py-1 text-sm w-full outline-none focus:border-[var(--accent-light)]"
              style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
              value={txtdate} onChange={(e) => setTxtdate(e.target.value)} />
          </div>
        )}
        {radio1 === "Completed" && (
          <div className="mb-3">
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--ct-text-secondary)" }}>Completed Date <span style={{ color: "var(--danger-light)" }}>*</span></label>
            <input type="date" className="border rounded-[var(--r-sm)] px-2 py-1 text-sm w-full outline-none focus:border-[var(--accent-light)]"
              style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
              value={txtdate1} onChange={(e) => setTxtdate1(e.target.value)} />
          </div>
        )}
        <div className="space-y-1 mb-3">
          {COMMENT_OPTIONS.map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--ct-text-secondary)" }}>
              <input type="radio" name="comment" value={o} checked={comment === o} onChange={() => setComment(o)} style={{ accentColor: "var(--accent-light)" }} />
              {o}
            </label>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm mb-2 cursor-pointer" style={{ color: "var(--ct-text-secondary)" }}>
          <input type="checkbox" checked={commentOthers} onChange={(e) => setCommentOthers(e.target.checked)} style={{ accentColor: "var(--accent-light)" }} />
          Others
        </label>
        {commentOthers && (
          <textarea rows={2} className="w-full border rounded-[var(--r-sm)] px-3 py-1.5 text-sm mb-2 resize-none outline-none focus:border-[var(--accent-light)]"
            style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
            placeholder="Enter other comment…" value={txtarea} onChange={(e) => setTxtarea(e.target.value)} />
        )}
        {err && <p className="text-xs mb-2" style={{ color: "var(--danger-light)" }}>{err}</p>}
        <div className="flex justify-end gap-2 mt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm hover:opacity-80" style={{ color: "var(--ct-text-secondary)" }}>Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-[var(--r-sm)] disabled:opacity-40" style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}>
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
      <div className="rounded-[var(--r-lg)] shadow-xl w-full max-w-2xl p-6 max-h-[80vh] flex flex-col" style={{ background: "var(--ct-surface)" }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold" style={{ color: "var(--ct-text-primary)" }}>Log — {esid}</h3>
          <button onClick={onClose} className="text-lg leading-none hover:opacity-70" style={{ color: "var(--ct-text-muted)" }}>×</button>
        </div>
        {loading ? <p className="text-sm" style={{ color: "var(--ct-text-muted)" }}>Loading…</p> : (
          <div className="overflow-y-auto flex-1">
            {entries.length === 0 ? <p className="text-sm" style={{ color: "var(--ct-text-muted)" }}>No log entries.</p> : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 border-b" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}>
                  <tr>{["Date","User","Comments"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: "var(--ct-text-muted)" }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y">
                  {entries.map((e, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--ct-text-muted)" }}>{fmtTs(e.date_modified)}</td>
                      <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{e.user}</td>
                      <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}
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
type ModalState = { type: "status"; row: any } | { type: "log"; esid: string } | null;

export default function CompletedEnrollments() {
  const [rows, setRows]     = useState<any[]>([]);
  const [sort, setSort]     = useState<SortMode>("default");
  const [loading, setLoading] = useState(true);
  const [modal, setModal]   = useState<ModalState>(null);
  const admin = isAdmin();

  const load = (s: SortMode) => {
    setLoading(true);
    const qs = s !== "default" ? `?sort=${s}` : "";
    api.get(`/enrollment/completed${qs}`)
      .then((r) => { setRows(r.data); setSort(s); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load("default"); }, []);

  const refresh = () => load(sort);

  const approveRow = async (esid: string) => {
    if (!confirm("Mark as checked?")) return;
    await api.patch(`/enrollment/${esid}/action`, { type: "update" });
    refresh();
  };

  const sortBtn = (label: string, s: SortMode) => (
    <button key={s} onClick={() => load(s)}
      className="px-3 py-1.5 text-xs rounded-[var(--r-sm)] border transition-colors"
      style={sort === s
        ? { background: "var(--accent-light)", color: "var(--accent-light-on-solid)", borderColor: "var(--accent-light)" }
        : { background: "var(--ct-surface)", color: "var(--ct-text-secondary)", borderColor: "var(--ct-border-default)" }}>
      {label}
    </button>
  );

  return (
    <EnrollmentLayout title="Enrollment – Completed">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-base font-semibold" style={{ color: "var(--ct-text-primary)" }}>Completed Enrollments</h2>
        <div className="flex gap-2">
          {sortBtn("Last 8 months", "default")}
          {sortBtn("All by Date", "date")}
          {sortBtn("By Comment", "comment")}
          {sortBtn("By Status", "status")}
        </div>
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: "var(--ct-text-muted)" }}>Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--r-md)] border" style={{ borderColor: "var(--ct-border-default)" }}>
          <table className="w-full text-xs">
            <thead className="border-b" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}>
              <tr>
                {["#","ESID","Company","Broker","Rate","Term","Comm","Meter","Status","Added","Actions"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap" style={{ color: "var(--ct-text-muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.length === 0 ? (
                <tr><td colSpan={11} className="px-3 py-6 text-center" style={{ color: "var(--ct-text-muted)" }}>No records</td></tr>
              ) : rows.map((r, i) => (
                <tr key={r.esid} className="hover:opacity-90" style={{ background: rowBg(r) }}>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-muted)" }}>{i + 1}</td>
                  <td className="px-3 py-2 font-mono whitespace-nowrap" style={{ color: "var(--ct-text-primary)" }}>{r.esid}</td>
                  <td className="px-3 py-2 max-w-[150px] truncate" style={{ color: "var(--ct-text-secondary)" }}>{r.company_name}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.broker_code}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{dispRate(r.contract_rate)}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.contract_term}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.commission}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.meter_fees}</td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--ct-text-secondary)" }}>{r.enrollment_status}</td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--ct-text-muted)" }}>{fmtDate(r.date_added)}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1 flex-wrap">
                      <button onClick={() => setModal({ type: "status", row: r })}
                        className="px-2 py-1 rounded-[var(--r-sm)] text-xs hover:opacity-80" style={{ background: "var(--accent-light-tint)", color: "var(--accent-light)" }}>Status</button>
                      <button onClick={() => setModal({ type: "log", esid: r.esid })}
                        className="px-2 py-1 rounded-[var(--r-sm)] text-xs hover:opacity-80" style={{ background: "var(--ct-surface-hover)", color: "var(--ct-text-secondary)" }}>Log</button>
                      {admin && (
                        <button onClick={() => approveRow(r.esid)}
                          className="px-2 py-1 rounded-[var(--r-sm)] text-xs hover:opacity-80" style={{ background: "var(--accent-light-tint)", color: "var(--accent-light)" }}>Approve</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal?.type === "status" && <StatusModal row={modal.row} onClose={() => setModal(null)} onSaved={() => { setModal(null); refresh(); }} />}
      {modal?.type === "log"    && <LogModal esid={modal.esid} onClose={() => setModal(null)} />}
    </EnrollmentLayout>
  );
}
