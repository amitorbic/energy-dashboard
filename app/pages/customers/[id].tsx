import React, { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import api from "../../utils/api";
import { useRouter } from "next/router";

interface CustomerDetail {
  id: number;
  esi_id: string | null;
  company_name: string | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  broker_id: string | null;
  broker_name: string | null;
  energy_rate: string | null;
  annual_usage_kwh: string | null;
  contract_end_date: string | null;
  contract_start_date: string | null;
  contract_type: string | null;
  load_profile: string | null;
  plan_group: string | null;
  cust_type: string | null;
  billing_address: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_zip: string | null;
  premise_address: string | null;
  premise_address2: string | null;
  premise_city: string | null;
  premise_state: string | null;
  premise_zip: string | null;
  comm_rate: string | null;
  bill_mode: string | null;
  other_charge: string | null;
  city_tax_exempt: string | null;
  county_tax_exempt: string | null;
  state_tax_exempt: string | null;
  grt_tax_exempt: number | null;
  puc_tax_exempt: number | null;
  mtacda_tax_exempt: string | null;
  spdt_tax_exempt: string | null;
  spdt2_tax_exempt: string | null;
  attn: string | null;
  summary: string;
}

interface ContactForm {
  customer_email: string;
  customer_phone: string;
  customer_first_name: string;
  customer_last_name: string;
  billing_address: string;
  billing_city: string;
  billing_state: string;
  billing_zip: string;
  premise_address: string;
  attn: string;
}

const parseZone = (loadProfile: string | null): string => {
  if (!loadProfile) return "";
  const parts = loadProfile.split("_");
  return parts.length >= 2 ? parts[1] : "";
};

const taxLabel = (val: string | number | null | undefined): string => {
  if (val === null || val === undefined || val === "") return "—";
  if (val === "100" || val === 100 || val === 1) return "Exempt";
  if (val === "0" || val === 0) return "Taxable";
  return String(val);
};

const Field = ({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) => (
  <div>
    <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">{label}</p>
    <p className={`text-sm text-slate-200 ${mono ? "font-mono" : ""}`}>
      {value || "—"}
    </p>
  </div>
);

const TaxField = ({ label, val }: { label: string; val: string | number | null | undefined }) => {
  const text = taxLabel(val);
  return (
    <div>
      <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">{label}</p>
      <p className={`text-sm font-mono ${text === "Exempt" ? "text-green-400" : "text-slate-300"}`}>
        {text}
      </p>
    </div>
  );
};

const CustomerDetailPage = () => {
  const router = useRouter();
  const { id } = router.query;

  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [form, setForm] = useState<ContactForm>({
    customer_email: "",
    customer_phone: "",
    customer_first_name: "",
    customer_last_name: "",
    billing_address: "",
    billing_city: "",
    billing_state: "",
    billing_zip: "",
    premise_address: "",
    attn: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    if (!id) return;
    api
      .get(`/contract-renewal/${id}`)
      .then((res) => {
        const d: CustomerDetail = res.data;
        setCustomer(d);
        setForm({
          customer_email: d.customer_email ?? "",
          customer_phone: d.customer_phone ?? "",
          customer_first_name: d.customer_first_name ?? "",
          customer_last_name: d.customer_last_name ?? "",
          billing_address: d.billing_address ?? "",
          billing_city: d.billing_city ?? "",
          billing_state: d.billing_state ?? "",
          billing_zip: d.billing_zip ?? "",
          premise_address: d.premise_address ?? "",
          attn: d.attn ?? "",
        });
        setLoading(false);
      })
      .catch((err) => {
        if (err.response?.status === 404) setNotFound(true);
        setLoading(false);
      });
  }, [id]);

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    setSaveMsg("");
    setSaveError(false);
    try {
      const res = await api.put(`/contract-renewal/${id}`, form);
      setCustomer(res.data);
      setSaveMsg("Saved successfully.");
      setTimeout(() => setSaveMsg(""), 4000);
    } catch {
      setSaveMsg("Save failed — please try again.");
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Layout title="Customer Detail">
        <div className="text-slate-500 text-center py-20 animate-pulse">Loading...</div>
      </Layout>
    );
  }

  if (notFound || !customer) {
    return (
      <Layout title="Not Found">
        <div className="max-w-2xl mx-auto p-6 text-center space-y-3">
          <p className="text-slate-400 text-lg">Record not found.</p>
          <button
            onClick={() => router.push("/customers/renewal-view")}
            className="text-red-400 hover:text-red-300 text-sm"
          >
            ← Back to list
          </button>
        </div>
      </Layout>
    );
  }

  const zone = parseZone(customer.load_profile);
  const rateCents = customer.energy_rate
    ? (parseFloat(customer.energy_rate) * 100).toFixed(4)
    : null;
  const serviceAddress = customer.premise_address ?? customer.premise_address2;

  const editFields: [keyof ContactForm, string][] = [
    ["customer_first_name", "First name"],
    ["customer_last_name", "Last name"],
    ["customer_email", "Email"],
    ["customer_phone", "Phone"],
    ["billing_address", "Billing address"],
    ["billing_city", "Billing city"],
    ["billing_state", "Billing state"],
    ["billing_zip", "Billing zip"],
    ["premise_address", "Service address (line 1)"],
    ["attn", "Attention"],
  ];

  return (
    <Layout title={customer.company_name ?? "Customer Detail"}>
      <div className="max-w-5xl mx-auto p-6 space-y-6">

        {/* Header */}
        <div className="border-b border-slate-800 pb-5">
          <div className="mb-3">
            <button
              onClick={() => router.push("/customers/renewal-view")}
              className="text-slate-400 hover:text-white text-sm"
            >
              ← Renewal list
            </button>
          </div>
          <h1 className="text-2xl font-black text-white uppercase tracking-tighter">
            {customer.company_name}
          </h1>
          {customer.summary && (
            <p className="text-slate-400 text-xs mt-1.5 font-mono leading-relaxed">
              {customer.summary}
            </p>
          )}
        </div>

        {/* Contract Details */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
            Contract Details
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
            <Field label="Contract type" value={customer.contract_type} />
            <Field label="Rate (¢/kWh)" value={rateCents} mono />
            <Field label="End date" value={customer.contract_end_date} mono />
            <Field label="Start date" value={customer.contract_start_date} mono />
            <Field
              label="Annual usage (kWh)"
              value={
                customer.annual_usage_kwh
                  ? Number(customer.annual_usage_kwh).toLocaleString()
                  : null
              }
              mono
            />
            <Field
              label="Broker"
              value={
                customer.broker_name
                  ? `${customer.broker_name} (${customer.broker_id})`
                  : customer.broker_id
              }
            />
            <Field label="Comm rate" value={customer.comm_rate} mono />
            <Field label="Bill mode" value={customer.bill_mode} />
            <Field label="Plan group" value={customer.plan_group} mono />
            <Field label="Account type" value={customer.cust_type} />
            <Field label="Other charge" value={customer.other_charge} mono />
          </div>
          <div className="mt-4 pt-4 border-t border-slate-800">
            <Field label="Load profile" value={customer.load_profile} mono />
          </div>
        </section>

        {/* Service Location */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
            Service Location
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
            <div className="col-span-2 sm:col-span-3">
              <Field label="ESI ID" value={customer.esi_id} mono />
            </div>
            <Field label="Service address" value={serviceAddress} />
            <Field label="City" value={customer.premise_city} />
            <Field label="State" value={customer.premise_state} />
            <Field label="Zip" value={customer.premise_zip} mono />
            <Field label="Zone" value={zone || null} />
          </div>
        </section>

        {/* Contact Info — editable */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
            Contact Info{" "}
            <span className="text-slate-600 font-normal normal-case tracking-normal ml-1">
              editable
            </span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {editFields.map(([field, label]) => (
              <div key={field}>
                <label className="text-xs text-slate-500 uppercase tracking-wide block mb-1">
                  {label}
                </label>
                <input
                  type="text"
                  value={form[field]}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, [field]: e.target.value }))
                  }
                  className="w-full bg-slate-800 border border-slate-700 text-white text-sm px-3 py-2 rounded focus:outline-none focus:border-red-500 transition-colors"
                />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-5">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-5 py-2 rounded text-sm font-bold uppercase transition"
            >
              {saving ? "Saving…" : "Save contact info"}
            </button>
            {saveMsg && (
              <span className={`text-sm ${saveError ? "text-red-400" : "text-green-400"}`}>
                {saveMsg}
              </span>
            )}
          </div>
        </section>

        {/* Tax Exemptions — read-only */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
            Tax Exemptions
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
            <TaxField label="City" val={customer.city_tax_exempt} />
            <TaxField label="County" val={customer.county_tax_exempt} />
            <TaxField label="State" val={customer.state_tax_exempt} />
            <TaxField label="GRT" val={customer.grt_tax_exempt} />
            <TaxField label="PUC" val={customer.puc_tax_exempt} />
            <TaxField label="MTACDA" val={customer.mtacda_tax_exempt} />
            <TaxField label="SPDT" val={customer.spdt_tax_exempt} />
            <TaxField label="SPDT2" val={customer.spdt2_tax_exempt} />
          </div>
        </section>

      </div>
    </Layout>
  );
};

export default CustomerDetailPage;
