import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import EnrollmentLayout from "../../../components/EnrollmentLayout";
import api from "../../../utils/api";

interface Broker { broker_code: string; company_name: string; }

const EMPTY = {
  customer_name: "",
  contract_rate: "",
  commission: "",
  broker_code: "",
  meter_fee: "",
  tax_exempt: "",
  contract_end_date: "",
};

export default function AddTemplate() {
  const router = useRouter();
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [form, setForm]       = useState({ ...EMPTY });
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState("");

  useEffect(() => {
    api.get("/enrollment/brokers")
      .then((r) => setBrokers(r.data))
      .catch(console.error);
  }, []);

  const save = async () => {
    if (!form.customer_name || !form.broker_code) {
      setErr("Customer name and broker are required.");
      return;
    }
    setSaving(true); setErr("");
    try {
      await api.post("/enrollment/templates", form);
      router.push("/enrollment/templates");
    } catch (e: any) {
      setErr(e?.response?.data?.detail || "Save failed.");
      setSaving(false);
    }
  };

  const field = (label: string, key: keyof typeof form, type = "text") => (
    <div key={key}>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input type={type}
        className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </div>
  );

  return (
    <EnrollmentLayout title="Enrollment – Add Template">
      <div className="max-w-xl">
        <h2 className="text-base font-semibold text-gray-800 mb-5">Add Template</h2>

        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
          {field("Customer Name", "customer_name")}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Broker</label>
            <select
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              value={form.broker_code}
              onChange={(e) => setForm({ ...form, broker_code: e.target.value })}>
              <option value="">— Select broker —</option>
              {brokers.map((b) => (
                <option key={b.broker_code} value={b.broker_code}>
                  {b.company_name} ({b.broker_code})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {field("Contract Rate", "contract_rate")}
            {field("Commission", "commission")}
            {field("Meter Fee", "meter_fee")}
            {field("Contract End Date (MM/DD/YYYY)", "contract_end_date")}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tax Exempt</label>
            <select
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              value={form.tax_exempt}
              onChange={(e) => setForm({ ...form, tax_exempt: e.target.value })}>
              <option value="">None</option>
              <option value="Residential">Residential</option>
              <option value="Certificate">Certificate</option>
            </select>
          </div>

          {err && <p className="text-xs text-red-500">{err}</p>}

          <div className="flex gap-3 pt-1">
            <button onClick={save} disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-40">
              {saving ? "Saving…" : "Add Template"}
            </button>
            <button onClick={() => router.push("/enrollment/templates")}
              className="px-5 py-2 bg-gray-100 text-gray-600 text-sm rounded hover:bg-gray-200">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </EnrollmentLayout>
  );
}
