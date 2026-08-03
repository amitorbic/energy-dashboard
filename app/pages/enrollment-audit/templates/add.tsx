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
      <label className="block text-xs font-medium mb-1" style={{ color: "var(--ct-text-secondary)" }}>{label}</label>
      <input type={type}
        className="w-full border rounded-[var(--r-sm)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent-light)]"
        style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </div>
  );

  return (
    <EnrollmentLayout title="Enrollment – Add Template">
      <div className="max-w-xl">
        <h2 className="text-base font-semibold mb-5" style={{ color: "var(--ct-text-primary)" }}>Add Template</h2>

        <div className="rounded-[var(--r-lg)] border p-5 space-y-4" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
          {field("Customer Name", "customer_name")}

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--ct-text-secondary)" }}>Broker</label>
            <select
              className="w-full border rounded-[var(--r-sm)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent-light)]"
              style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
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
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--ct-text-secondary)" }}>Tax Exempt</label>
            <select
              className="w-full border rounded-[var(--r-sm)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent-light)]"
              style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
              value={form.tax_exempt}
              onChange={(e) => setForm({ ...form, tax_exempt: e.target.value })}>
              <option value="">None</option>
              <option value="Residential">Residential</option>
              <option value="Certificate">Certificate</option>
            </select>
          </div>

          {err && <p className="text-xs" style={{ color: "var(--danger-light)" }}>{err}</p>}

          <div className="flex gap-3 pt-1">
            <button onClick={save} disabled={saving}
              className="px-5 py-2 text-sm rounded-[var(--r-sm)] disabled:opacity-40" style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}>
              {saving ? "Saving…" : "Add Template"}
            </button>
            <button onClick={() => router.push("/enrollment/templates")}
              className="px-5 py-2 text-sm rounded-[var(--r-sm)] hover:opacity-80" style={{ background: "var(--ct-surface-hover)", color: "var(--ct-text-secondary)" }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </EnrollmentLayout>
  );
}
