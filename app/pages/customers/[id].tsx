import { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import api from "../../utils/api";
import { useRouter } from "next/router";
import { isAdmin } from "../../utils/auth";

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

interface EditForm {
  // Contact (all users)
  customer_first_name: string;
  customer_last_name: string;
  customer_email: string;
  customer_phone: string;
  billing_address: string;
  billing_city: string;
  billing_state: string;
  billing_zip: string;
  premise_address: string;
  attn: string;
  // Contract terms (admin only)
  energy_rate: string;
  contract_end_date: string;
  contract_start_date: string;
  load_profile: string;
  contract_type: string;
  plan_group: string;
  annual_usage_kwh: string;
  other_charge: string;
  broker_id: string;
  broker_name: string;
  comm_rate: string;
  // Tax exemptions (admin only)
  city_tax_exempt: string;
  county_tax_exempt: string;
  state_tax_exempt: string;
  grt_tax_exempt: string;
  puc_tax_exempt: string;
  mtacda_tax_exempt: string;
  spdt_tax_exempt: string;
  spdt2_tax_exempt: string;
}

const parseZone = (lp: string | null) => {
  if (!lp) return "";
  const parts = lp.split("_");
  return parts.length >= 2 ? parts[1] : "";
};

// Read-only display field
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
    <p className={`text-sm text-slate-200 ${mono ? "font-mono" : ""}`}>{value || "—"}</p>
  </div>
);

// Permanently locked field — shown to all users with a lock indicator
const LockedField = ({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) => (
  <div>
    <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5 flex items-center gap-1">
      {label}
      <svg className="w-3 h-3 text-slate-600" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
          clipRule="evenodd"
        />
      </svg>
    </p>
    <p className={`text-sm text-slate-400 ${mono ? "font-mono" : ""}`}>{value || "—"}</p>
  </div>
);

// Editable input field
const InputField = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) => (
  <div>
    <label className="text-xs text-slate-500 uppercase tracking-wide block mb-1">
      {label}
    </label>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-slate-800 border border-slate-700 text-white text-sm px-3 py-2 rounded focus:outline-none focus:border-red-500 transition-colors"
    />
  </div>
);

// Tax toggle — admin only
const TaxToggle = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) => {
  const isExempt = value === "100" || value === "1";
  return (
    <div>
      <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      <button
        type="button"
        onClick={() => onChange(isExempt ? "0" : "100")}
        className={`text-xs px-3 py-1 rounded font-semibold transition-colors ${
          isExempt
            ? "bg-green-900/50 text-green-400 border border-green-700"
            : "bg-slate-800 text-slate-400 border border-slate-700"
        }`}
      >
        {isExempt ? "Exempt" : "Taxable"}
      </button>
    </div>
  );
};

// Read-only tax display (non-admin)
const TaxField = ({
  label,
  val,
}: {
  label: string;
  val: string | number | null | undefined;
}) => {
  const text =
    val === "100" || val === 100 || val === 1
      ? "Exempt"
      : val === "0" || val === 0
      ? "Taxable"
      : "—";
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
  const [admin, setAdmin] = useState(false);
  const [form, setForm] = useState<EditForm>({
    customer_first_name: "", customer_last_name: "",
    customer_email: "", customer_phone: "",
    billing_address: "", billing_city: "", billing_state: "", billing_zip: "",
    premise_address: "", attn: "",
    energy_rate: "", contract_end_date: "", contract_start_date: "",
    load_profile: "", contract_type: "", plan_group: "",
    annual_usage_kwh: "", other_charge: "",
    broker_id: "", broker_name: "", comm_rate: "",
    city_tax_exempt: "0", county_tax_exempt: "0", state_tax_exempt: "0",
    grt_tax_exempt: "0", puc_tax_exempt: "0",
    mtacda_tax_exempt: "0", spdt_tax_exempt: "0", spdt2_tax_exempt: "0",
  });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    setAdmin(isAdmin());
  }, []);

  useEffect(() => {
    if (!id) return;
    api
      .get(`/contract-renewal/${id}`)
      .then((res) => {
        const d: CustomerDetail = res.data;
        setCustomer(d);
        setForm({
          customer_first_name: d.customer_first_name ?? "",
          customer_last_name: d.customer_last_name ?? "",
          customer_email: d.customer_email ?? "",
          customer_phone: d.customer_phone ?? "",
          billing_address: d.billing_address ?? "",
          billing_city: d.billing_city ?? "",
          billing_state: d.billing_state ?? "",
          billing_zip: d.billing_zip ?? "",
          premise_address: d.premise_address ?? "",
          attn: d.attn ?? "",
          energy_rate: d.energy_rate ?? "",
          contract_end_date: d.contract_end_date ?? "",
          contract_start_date: d.contract_start_date ?? "",
          load_profile: d.load_profile ?? "",
          contract_type: d.contract_type ?? "",
          plan_group: d.plan_group ?? "",
          annual_usage_kwh: d.annual_usage_kwh ?? "",
          other_charge: d.other_charge ?? "",
          broker_id: d.broker_id ?? "",
          broker_name: d.broker_name ?? "",
          comm_rate: d.comm_rate ?? "",
          city_tax_exempt: d.city_tax_exempt ?? "0",
          county_tax_exempt: d.county_tax_exempt ?? "0",
          state_tax_exempt: d.state_tax_exempt ?? "0",
          grt_tax_exempt: String(d.grt_tax_exempt ?? "0"),
          puc_tax_exempt: String(d.puc_tax_exempt ?? "0"),
          mtacda_tax_exempt: d.mtacda_tax_exempt ?? "0",
          spdt_tax_exempt: d.spdt_tax_exempt ?? "0",
          spdt2_tax_exempt: d.spdt2_tax_exempt ?? "0",
        });
        setLoading(false);
      })
      .catch((err) => {
        if (err.response?.status === 404) setNotFound(true);
        setLoading(false);
      });
  }, [id]);

  const set = (field: keyof EditForm) => (v: string) =>
    setForm((prev) => ({ ...prev, [field]: v }));

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    setSaveMsg("");
    setSaveError(false);

    const payload: Partial<EditForm> = admin
      ? { ...form }
      : {
          customer_first_name: form.customer_first_name,
          customer_last_name: form.customer_last_name,
          customer_email: form.customer_email,
          customer_phone: form.customer_phone,
          billing_address: form.billing_address,
          billing_city: form.billing_city,
          billing_state: form.billing_state,
          billing_zip: form.billing_zip,
          premise_address: form.premise_address,
          attn: form.attn,
        };

    try {
      const res = await api.put(`/contract-renewal/${id}`, payload);
      setCustomer(res.data);
      setSaveMsg("Saved successfully.");
      setTimeout(() => setSaveMsg(""), 4000);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Save failed — please try again.";
      setSaveMsg(msg);
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
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black text-white uppercase tracking-tighter">
                {customer.company_name}
              </h1>
              {customer.summary && (
                <p className="text-slate-400 text-xs mt-1.5 font-mono leading-relaxed">
                  {customer.summary}
                </p>
              )}
            </div>
            {admin ? (
              <span className="shrink-0 text-xs px-2.5 py-1 rounded-full bg-green-900/40 text-green-400 border border-green-800 font-semibold">
                Admin — full edit access
              </span>
            ) : (
              <span className="shrink-0 text-xs px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-semibold">
                Contact info only
              </span>
            )}
          </div>
        </div>

        {/* Contract Details */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
            Contract Details
            {admin && (
              <span className="ml-2 text-slate-600 font-normal normal-case tracking-normal">
                editable
              </span>
            )}
          </h2>
          {admin ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <InputField label="Contract type" value={form.contract_type} onChange={set("contract_type")} />
                <InputField label="Rate ($/kWh)" value={form.energy_rate} onChange={set("energy_rate")} />
                <InputField label="Plan group" value={form.plan_group} onChange={set("plan_group")} />
                <InputField label="End date" value={form.contract_end_date} onChange={set("contract_end_date")} />
                <InputField label="Start date" value={form.contract_start_date} onChange={set("contract_start_date")} />
                <InputField label="Annual usage (kWh)" value={form.annual_usage_kwh} onChange={set("annual_usage_kwh")} />
                <InputField label="Broker ID" value={form.broker_id} onChange={set("broker_id")} />
                <InputField label="Broker name" value={form.broker_name} onChange={set("broker_name")} />
                <InputField label="Comm rate" value={form.comm_rate} onChange={set("comm_rate")} />
                <InputField label="Meter fee" value={form.other_charge} onChange={set("other_charge")} />
              </div>
              <div className="pt-3 border-t border-slate-800">
                <InputField label="Load profile" value={form.load_profile} onChange={set("load_profile")} />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
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
                <Field label="Plan group" value={customer.plan_group} mono />
                <Field label="Meter fee" value={customer.other_charge} mono />
              </div>
              <div className="pt-3 border-t border-slate-800">
                <Field label="Load profile" value={customer.load_profile} mono />
              </div>
            </div>
          )}
        </section>

        {/* Service Location — ESI ID, premise address, zip always locked */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
            Service Location
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
            <div className="col-span-2 sm:col-span-3">
              <LockedField label="ESI ID" value={customer.esi_id} mono />
            </div>
            <div className="col-span-2 sm:col-span-2">
              <LockedField label="Service address" value={serviceAddress} />
            </div>
            <LockedField label="Zip" value={customer.premise_zip} mono />
            <Field label="City" value={customer.premise_city} />
            <Field label="State" value={customer.premise_state} />
            <Field label="Zone" value={zone || null} />
          </div>
        </section>

        {/* Contact Info — editable for all */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
            Contact Info{" "}
            <span className="text-slate-600 font-normal normal-case tracking-normal ml-1">
              editable
            </span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InputField label="First name" value={form.customer_first_name} onChange={set("customer_first_name")} />
            <InputField label="Last name" value={form.customer_last_name} onChange={set("customer_last_name")} />
            <InputField label="Email" value={form.customer_email} onChange={set("customer_email")} />
            <InputField label="Phone" value={form.customer_phone} onChange={set("customer_phone")} />
            <InputField label="Billing address" value={form.billing_address} onChange={set("billing_address")} />
            <InputField label="Billing city" value={form.billing_city} onChange={set("billing_city")} />
            <InputField label="Billing state" value={form.billing_state} onChange={set("billing_state")} />
            <InputField label="Billing zip" value={form.billing_zip} onChange={set("billing_zip")} />
            <InputField label="Service address (line 1)" value={form.premise_address} onChange={set("premise_address")} />
            <InputField label="Attention" value={form.attn} onChange={set("attn")} />
          </div>
        </section>

        {/* Tax Exemptions */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
            Tax Exemptions
            {admin && (
              <span className="ml-2 text-slate-600 font-normal normal-case tracking-normal">
                editable
              </span>
            )}
          </h2>
          {admin ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
              <TaxToggle label="City" value={form.city_tax_exempt} onChange={set("city_tax_exempt")} />
              <TaxToggle label="County" value={form.county_tax_exempt} onChange={set("county_tax_exempt")} />
              <TaxToggle label="State" value={form.state_tax_exempt} onChange={set("state_tax_exempt")} />
              <TaxToggle label="GRT" value={form.grt_tax_exempt} onChange={set("grt_tax_exempt")} />
              <TaxToggle label="PUC" value={form.puc_tax_exempt} onChange={set("puc_tax_exempt")} />
              <TaxToggle label="MTACDA" value={form.mtacda_tax_exempt} onChange={set("mtacda_tax_exempt")} />
              <TaxToggle label="SPDT" value={form.spdt_tax_exempt} onChange={set("spdt_tax_exempt")} />
              <TaxToggle label="SPDT2" value={form.spdt2_tax_exempt} onChange={set("spdt2_tax_exempt")} />
            </div>
          ) : (
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
          )}
        </section>

        {/* Save */}
        <div className="flex items-center gap-4 pb-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-6 py-2 rounded text-sm font-bold uppercase transition"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          {saveMsg && (
            <span className={`text-sm ${saveError ? "text-red-400" : "text-green-400"}`}>
              {saveMsg}
            </span>
          )}
        </div>

      </div>
    </Layout>
  );
};

export default CustomerDetailPage;
