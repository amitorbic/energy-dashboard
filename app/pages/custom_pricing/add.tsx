import React, { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import api from "../../utils/api";
import { useRouter } from "next/router";
import PricingLayout from "../../components/PricingLayout";

// 1. Define Interface
interface CustomerForm {
  company_name: string;
  esid: string;
  num_esids: number;
  nodal: string;
  sender_email: string;
  broker_code: string;
  broker_fee: number;
  ameripower_mills: number;
  credit_status: string;
  contract_start_date: string;
  pricing_start_date: string;
  intermediate_months: number;
  contact_person: string;
  contact_number: string;
  contact_email: string;
  billing_address: string;
  comments: string;
}

// 2. Define Default Values
const defaultForm: CustomerForm = {
  company_name: "",
  esid: "",
  num_esids: 1,
  nodal: "Included",
  sender_email: "",
  broker_code: "",
  broker_fee: 0,
  ameripower_mills: 0,
  credit_status: "Pending",
  contract_start_date: "",
  pricing_start_date: "",
  intermediate_months: 0,
  contact_person: "",
  contact_number: "",
  contact_email: "",
  billing_address: "",
  comments: "",
};

// 3. Field Component
interface FieldProps {
  label: string;
  name: keyof CustomerForm;
  type?: string;
  options?: string[] | null;
  value: string | number;
  onChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => void;
}

const Field = ({
  label,
  name,
  type = "text",
  options = null,
  value,
  onChange,
}: FieldProps) => (
  <div className="flex flex-col gap-1">
    <label className="text-slate-400 text-xs uppercase font-bold">
      {label}
    </label>
    {options ? (
      <select
        name={name}
        value={value}
        onChange={onChange}
        className="bg-slate-700 text-white px-3 py-2 rounded text-sm border border-slate-600 focus:outline-none focus:border-red-500"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    ) : (
      <input
        type={type}
        name={name}
        value={value ?? ""}
        onChange={onChange}
        className="bg-slate-700 text-white px-3 py-2 rounded text-sm border border-slate-600 focus:outline-none focus:border-red-500"
      />
    )}
  </div>
);

const AddCustomer = () => {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [brokerList, setBrokerList] = useState<
    { sid: number; broker_code: string; company_name: string }[]
  >([]);

  useEffect(() => {
    api
      .get("/brokers/dropdown")
      .then((res) => setBrokerList(res.data))
      .catch(() => {});
  }, []);

  const [prefillProfiles] = useState<Record<string, number>>(() => {
    if (typeof window === "undefined") return {};
    const params = new URLSearchParams(window.location.search);
    const source = params.get("source");

    if (source === "upload") {
      const data = sessionStorage.getItem("prefill_usage");
      if (data) return JSON.parse(data).profiles || {};
    }

    if (source === "renewal") {
      const data = sessionStorage.getItem("prefill_renewal");
      if (data) {
        const r = JSON.parse(data);
        // Strip the full profile name to short name
        // BUSMEDLF_COAST_IDR_WS_NOTOU → BUSMEDLF_COAST
        const shortName = r.load_profile
          ? r.load_profile.split("_IDR")[0].split("_WS")[0]
          : null;
        if (shortName && r.contract_renewal_usage) {
          return { [shortName]: parseFloat(r.contract_renewal_usage) };
        }
      }
    }
    return {};
  });

  // Initialize form state using a function to avoid cascading renders
  const [form, setForm] = useState<CustomerForm>(() => {
    if (typeof window === "undefined") return defaultForm;
    const params = new URLSearchParams(window.location.search);
    const source = params.get("source");

    if (source === "upload") {
      const data = sessionStorage.getItem("prefill_usage");
      if (data) {
        const parsed = JSON.parse(data);
        return {
          ...defaultForm,
          esid: parsed.esid || "",
          num_esids: parsed.num_esids || 1,
        };
      }
    }

    if (source === "renewal") {
      const data = sessionStorage.getItem("prefill_renewal");
      if (data) {
        const r = JSON.parse(data);
        sessionStorage.removeItem("prefill_renewal");
        return {
          ...defaultForm,
          esid: r.premise_id,
          num_esids: r.num_esids || 1,
          company_name: r.company_name,
          broker_code: r.broker_code,
          contact_person: `${r.cust_first_name} ${r.cust_last_name}`,
          contact_email: r.cust_email,
          contact_number: r.cust_phone1,
          billing_address: `${r.billing_address}, ${r.billing_city}, ${r.billing_state} ${r.billing_zip}`,
          contract_start_date: r.contract_end_date
            ? new Date(r.contract_end_date).toISOString().split("T")[0]
            : "", // end date becomes new start
          credit_status: "Approved",
        };
      }
    }
    return defaultForm;
  });

  // Removed setPrefillProfiles as it was unused (Error Fix)

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]:
        typeof prev[name as keyof CustomerForm] === "number"
          ? Number(value)
          : value,
    }));
  };

  const handleSubmit = async () => {
    if (!form.company_name || !form.esid) {
      setError("Company name and ESID are required.");
      return;
    }
    setSaving(true);
    try {
      const res = await api.post("/customers", form);
      const newId = res.data.id;

      if (Object.keys(prefillProfiles).length > 0) {
        await api.post(`/customers/${newId}/save-profiles`, {
          profiles: prefillProfiles,
        });
      }

      sessionStorage.removeItem("prefill_usage");
      sessionStorage.removeItem("prefill_renewal");
      router.push(`/custom_pricing/${newId}`);
    } catch (err) {
      console.error(err);
      setError("Failed to save customer.");
      setSaving(false);
    }
  };

  return (
    <PricingLayout title="Add Customer">
      <div className="max-w-5xl mx-auto p-6 space-y-8">
        <header className="flex justify-between items-center border-b border-slate-800 pb-6">
          <h1 className="text-3xl font-black text-white uppercase tracking-tighter">
            Add Customer
          </h1>
          <button
            onClick={() => router.push("/custom_pricing")}
            className="text-slate-400 hover:text-white text-sm"
          >
            ← Back
          </button>
        </header>
        {router.query.source === "upload" && (
          <div className="bg-blue-900/50 border border-blue-500 text-white px-4 py-3 rounded text-sm">
            ℹ️ First usage file parsed and profiles pre-filled. You can upload
            additional files after saving on the pricing page.
          </div>
        )}

        {error && (
          <div className="bg-red-900/50 border border-red-500 text-red-300 px-4 py-3 rounded text-sm">
            {error}
          </div>
        )}

        <div className="bg-slate-800 rounded-lg p-6 space-y-6">
          <h2 className="text-white font-bold text-sm uppercase border-b border-slate-700 pb-2">
            Meter Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field
              label="ESID"
              name="esid"
              value={form.esid}
              onChange={handleChange}
            />
            <Field
              label="Number of ESIDs"
              name="num_esids"
              type="number"
              value={form.num_esids}
              onChange={handleChange}
            />
            <Field
              label="Nodal & RUC"
              name="nodal"
              options={["Included", "Excluded"]}
              value={form.nodal}
              onChange={handleChange}
            />
            <Field
              label="Sender Email"
              name="sender_email"
              value={form.sender_email}
              onChange={handleChange}
            />
            <Field
              label="Broker Fee"
              name="broker_fee"
              type="number"
              value={form.broker_fee}
              onChange={handleChange}
            />
            <Field
              label="ORBIC Mills"
              name="ameripower_mills"
              type="number"
              value={form.ameripower_mills}
              onChange={handleChange}
            />
            <Field
              label="Credit Status"
              name="credit_status"
              options={["Pending", "Approved"]}
              value={form.credit_status}
              onChange={handleChange}
            />
            <Field
              label="Contract Start Date"
              name="contract_start_date"
              type="date"
              value={form.contract_start_date}
              onChange={handleChange}
            />
            <Field
              label="Pricing Start Date"
              name="pricing_start_date"
              type="date"
              value={form.pricing_start_date}
              onChange={handleChange}
            />
            <Field
              label="Intermediate Months"
              name="intermediate_months"
              type="number"
              value={form.intermediate_months}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="bg-slate-800 rounded-lg p-6 space-y-6">
          <h2 className="text-white font-bold text-sm uppercase border-b border-slate-700 pb-2">
            Customer Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field
              label="Company Name"
              name="company_name"
              value={form.company_name}
              onChange={handleChange}
            />
            <div className="flex flex-col gap-1">
              <label className="text-slate-400 text-xs uppercase font-bold">
                Broker
              </label>
              <select
                name="broker_code"
                value={form.broker_code}
                onChange={handleChange}
                className="bg-slate-700 text-white px-3 py-2 rounded text-sm border border-slate-600 focus:outline-none focus:border-red-500"
              >
                <option value="">-- Select Broker --</option>
                {brokerList.map((b) => (
                  <option key={b.sid} value={b.broker_code}>
                    {b.company_name} ({b.broker_code})
                  </option>
                ))}
              </select>
            </div>
            <Field
              label="Contact Person"
              name="contact_person"
              value={form.contact_person}
              onChange={handleChange}
            />
            <Field
              label="Contact Number"
              name="contact_number"
              value={form.contact_number}
              onChange={handleChange}
            />
            <Field
              label="Contact Email"
              name="contact_email"
              type="email"
              value={form.contact_email}
              onChange={handleChange}
            />
            <div className="flex flex-col gap-1 col-span-1 md:col-span-2">
              <label className="text-slate-400 text-xs uppercase font-bold">
                Billing Address
              </label>
              <input
                type="text"
                name="billing_address"
                value={form.billing_address}
                onChange={handleChange}
                className="bg-slate-700 text-white px-3 py-2 rounded text-sm border border-slate-600 focus:outline-none focus:border-red-500"
              />
            </div>
            <div className="flex flex-col gap-1 col-span-1 md:col-span-2">
              <label className="text-slate-400 text-xs uppercase font-bold">
                Comments
              </label>
              <textarea
                name="comments"
                value={form.comments}
                onChange={handleChange}
                rows={3}
                className="bg-slate-700 text-white px-3 py-2 rounded text-sm border border-slate-600 focus:outline-none focus:border-red-500"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="bg-red-600 hover:bg-red-700 text-white px-8 py-2 rounded text-sm font-bold uppercase transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Customer"}
          </button>
          <button
            onClick={() => router.push("/custom_pricing")}
            className="bg-slate-700 hover:bg-slate-600 text-white px-8 py-2 rounded text-sm font-bold uppercase transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </PricingLayout>
  );
};

export default AddCustomer;
