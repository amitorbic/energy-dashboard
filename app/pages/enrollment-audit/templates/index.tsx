import { useEffect, useState } from "react";
import EnrollmentLayout from "../../../components/EnrollmentLayout";
import api from "../../../utils/api";

interface Template {
  sid: number;
  customer_name: string;
  contract_rate: string;
  commission: string;
  broker_code: string;
  broker_name?: string;
  meter_fee: string;
  tax_exempt: string;
  contract_end_date: string;
}

const TAX_OPTIONS = ["", "Residential", "Certificate"];

function EditModal({ tmpl, onClose, onSaved }: { tmpl: Template; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ ...tmpl });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    setSaving(true); setErr("");
    try {
      await api.put(`/enrollment/templates/${tmpl.sid}`, {
        customer_name: form.customer_name,
        contract_rate: form.contract_rate,
        commission: form.commission,
        broker_code: form.broker_code,
        meter_fee: form.meter_fee,
        tax_exempt: form.tax_exempt,
        contract_end_date: form.contract_end_date,
      });
      onSaved();
    } catch (e: any) {
      setErr(e?.response?.data?.detail || "Save failed.");
    } finally { setSaving(false); }
  };

  const field = (label: string, key: keyof Template) => (
    <div key={key as string}>
      <label className="block text-xs font-medium mb-1" style={{ color: "var(--ct-text-secondary)" }}>{label}</label>
      <input className="w-full border rounded-[var(--r-sm)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent-light)]"
        style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
        value={form[key] as string}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="rounded-[var(--r-lg)] shadow-xl w-full max-w-lg p-6" style={{ background: "var(--ct-surface)" }}>
        <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--ct-text-primary)" }}>Edit Template — {tmpl.customer_name}</h3>
        <div className="grid grid-cols-2 gap-3">
          {field("Customer Name", "customer_name")}
          {field("Broker Code", "broker_code")}
          {field("Contract Rate", "contract_rate")}
          {field("Commission", "commission")}
          {field("Meter Fee", "meter_fee")}
          {field("Contract End Date", "contract_end_date")}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--ct-text-secondary)" }}>Tax Exempt</label>
            <select className="w-full border rounded-[var(--r-sm)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent-light)]"
              style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
              value={form.tax_exempt}
              onChange={(e) => setForm({ ...form, tax_exempt: e.target.value })}>
              {TAX_OPTIONS.map((o) => <option key={o} value={o}>{o || "None"}</option>)}
            </select>
          </div>
        </div>
        {err && <p className="mt-2 text-xs" style={{ color: "var(--danger-light)" }}>{err}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm hover:opacity-80" style={{ color: "var(--ct-text-secondary)" }}>Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 text-sm rounded-[var(--r-sm)] disabled:opacity-40" style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TemplateList() {
  const [rows, setRows]         = useState<Template[]>([]);
  const [search, setSearch]     = useState("");
  const [loading, setLoading]   = useState(true);
  const [editRow, setEditRow]   = useState<Template | null>(null);

  const load = (q?: string) => {
    setLoading(true);
    const qs = q ? `?search=${encodeURIComponent(q)}` : "";
    api.get(`/enrollment/templates${qs}`)
      .then((r) => setRows(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const remove = async (sid: number) => {
    if (!confirm("Delete this template?")) return;
    await api.delete(`/enrollment/templates/${sid}`);
    load(search || undefined);
  };

  return (
    <EnrollmentLayout title="Enrollment – Templates">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="text-base font-semibold" style={{ color: "var(--ct-text-primary)" }}>Template List</h2>
        <div className="flex gap-2">
          <input
            className="border rounded-[var(--r-sm)] px-3 py-1.5 text-xs w-48 outline-none focus:border-[var(--accent-light)]"
            style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
            placeholder="Search customer name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load(search || undefined)}
          />
          <button onClick={() => load(search || undefined)}
            className="px-3 py-1.5 text-xs rounded-[var(--r-sm)]" style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}>Search</button>
          <button onClick={() => { setSearch(""); load(); }}
            className="px-3 py-1.5 text-xs rounded-[var(--r-sm)] hover:opacity-80" style={{ background: "var(--ct-surface-hover)", color: "var(--ct-text-secondary)" }}>Reset</button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: "var(--ct-text-muted)" }}>Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--r-md)] border" style={{ borderColor: "var(--ct-border-default)" }}>
          <table className="w-full text-xs">
            <thead className="border-b" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}>
              <tr>
                {["#","Customer","Broker","Broker Name","Rate","Comm","Meter Fee","Tax Exempt","End Date","Actions"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap" style={{ color: "var(--ct-text-muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y" style={{ background: "var(--ct-surface)" }}>
              {rows.length === 0 ? (
                <tr><td colSpan={10} className="px-3 py-6 text-center" style={{ color: "var(--ct-text-muted)" }}>No templates</td></tr>
              ) : rows.map((r, i) => (
                <tr key={r.sid} className="hover:bg-[var(--ct-surface-hover)]">
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-muted)" }}>{i + 1}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.customer_name}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.broker_code}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.broker_name}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.contract_rate}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.commission}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.meter_fee}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.tax_exempt}</td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--ct-text-secondary)" }}>{r.contract_end_date}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button onClick={() => setEditRow(r)}
                        className="px-2 py-1 rounded-[var(--r-sm)] text-xs hover:opacity-80" style={{ background: "var(--accent-light-tint)", color: "var(--accent-light)" }}>Edit</button>
                      <button onClick={() => remove(r.sid)}
                        className="px-2 py-1 rounded-[var(--r-sm)] text-xs hover:opacity-80" style={{ background: "var(--danger-light-tint)", color: "var(--danger-light)" }}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editRow && (
        <EditModal
          tmpl={editRow}
          onClose={() => setEditRow(null)}
          onSaved={() => { setEditRow(null); load(search || undefined); }}
        />
      )}
    </EnrollmentLayout>
  );
}
