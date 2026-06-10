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
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
        value={form[key] as string}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
        <h3 className="text-sm font-semibold text-gray-800 mb-4">Edit Template — {tmpl.customer_name}</h3>
        <div className="grid grid-cols-2 gap-3">
          {field("Customer Name", "customer_name")}
          {field("Broker Code", "broker_code")}
          {field("Contract Rate", "contract_rate")}
          {field("Commission", "commission")}
          {field("Meter Fee", "meter_fee")}
          {field("Contract End Date", "contract_end_date")}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tax Exempt</label>
            <select className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              value={form.tax_exempt}
              onChange={(e) => setForm({ ...form, tax_exempt: e.target.value })}>
              {TAX_OPTIONS.map((o) => <option key={o} value={o}>{o || "None"}</option>)}
            </select>
          </div>
        </div>
        {err && <p className="mt-2 text-xs text-red-500">{err}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-40">
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
        <h2 className="text-base font-semibold text-gray-800">Template List</h2>
        <div className="flex gap-2">
          <input
            className="border border-gray-300 rounded px-3 py-1.5 text-xs w-48 focus:outline-none focus:ring-1 focus:ring-blue-400"
            placeholder="Search customer name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load(search || undefined)}
          />
          <button onClick={() => load(search || undefined)}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">Search</button>
          <button onClick={() => { setSearch(""); load(); }}
            className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded hover:bg-gray-200">Reset</button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["#","Customer","Broker","Broker Name","Rate","Comm","Meter Fee","Tax Exempt","End Date","Actions"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {rows.length === 0 ? (
                <tr><td colSpan={10} className="px-3 py-6 text-center text-gray-400">No templates</td></tr>
              ) : rows.map((r, i) => (
                <tr key={r.sid} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                  <td className="px-3 py-2 text-gray-700">{r.customer_name}</td>
                  <td className="px-3 py-2 text-gray-600">{r.broker_code}</td>
                  <td className="px-3 py-2 text-gray-600">{r.broker_name}</td>
                  <td className="px-3 py-2 text-gray-600">{r.contract_rate}</td>
                  <td className="px-3 py-2 text-gray-600">{r.commission}</td>
                  <td className="px-3 py-2 text-gray-600">{r.meter_fee}</td>
                  <td className="px-3 py-2 text-gray-600">{r.tax_exempt}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.contract_end_date}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button onClick={() => setEditRow(r)}
                        className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200">Edit</button>
                      <button onClick={() => remove(r.sid)}
                        className="px-2 py-1 bg-red-100 text-red-600 rounded text-xs hover:bg-red-200">Delete</button>
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
