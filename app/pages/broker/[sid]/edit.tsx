import React, { useState, useEffect } from "react";
import Layout from "../../../components/Layout";
import api from "../../../utils/api";
import { useRouter } from "next/router";

// 1. Move the sub-component OUTSIDE the main component to fix "react-hooks/static-components"
// 2. Add an interface to replace "any" and fix "@typescript-eslint/no-explicit-any"
interface BrokerForm {
  [key: string]: string | number | undefined;
  broker_code?: string;
  company_name?: string;
  broker_name?: string;
  phone_number?: string;
  vendor?: string;
  split?: number;
  payment_term?: string;
  terms_upfront?: string;
  upfront_flag?: string;
  regular_status?: string;
}

interface FormFieldProps {
  label: string;
  name: string;
  type?: string;
  // 1. Remove 'boolean' from here. Inputs only want string, number, or undefined.
  value: string | number | undefined;
  onChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => void;
}

const F = ({ label, name, type = "text", value, onChange }: FormFieldProps) => (
  <div className="flex flex-col gap-1">
    <label className="text-slate-400 text-xs uppercase font-bold">
      {label}
    </label>
    <input
      type={type}
      name={name}
      // 2. We use 'as any' ONLY if absolutely necessary, but here,
      // forcing it to a string or number via the interface fix above is better.
      value={value ?? ""}
      onChange={onChange}
      className="bg-slate-700 text-white px-3 py-2 rounded text-sm border border-slate-600 focus:outline-none focus:border-red-500"
    />
  </div>
);

const EditBroker = () => {
  const router = useRouter();
  const { sid } = router.query;

  // Use the interface instead of any
  const [form, setForm] = useState<BrokerForm>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!router.isReady || !sid) return;
    api
      .get(`/brokers/${sid}`)
      .then((res) => {
        setForm(res.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [sid, router.isReady]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await api.put(`/brokers/${sid}`, form);
      router.push("/broker");
    } catch {
      setError("Failed to update broker.");
      setSaving(false);
    }
  };

  if (loading)
    return (
      <Layout title="Edit Broker">
        <div className="text-slate-500 text-center py-20 italic animate-pulse">
          Loading...
        </div>
      </Layout>
    );

  return (
    <Layout title="Edit Broker">
      <div className="max-w-5xl mx-auto p-6 space-y-8">
        <header className="flex justify-between items-center border-b border-slate-800 pb-6">
          <h1 className="text-3xl font-black text-white uppercase tracking-tighter">
            Edit Broker
          </h1>
          <button
            onClick={() => router.push("/broker")}
            className="text-slate-400 hover:text-white text-sm"
          >
            ← Back
          </button>
        </header>

        {error && (
          <div className="bg-red-900/50 border border-red-500 text-red-300 px-4 py-3 rounded text-sm">
            {error}
          </div>
        )}

        <div className="bg-slate-800 rounded-lg p-6 space-y-4">
          <h2 className="text-white font-bold text-sm uppercase border-b border-slate-700 pb-2">
            Broker Information
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <F
              label="Broker Code"
              name="broker_code"
              value={form.broker_code}
              onChange={handleChange}
            />
            <F
              label="Company Name"
              name="company_name"
              value={form.company_name}
              onChange={handleChange}
            />
            <F
              label="Broker Name"
              name="broker_name"
              value={form.broker_name}
              onChange={handleChange}
            />
            <F
              label="Phone Number"
              name="phone_number"
              value={form.phone_number}
              onChange={handleChange}
            />
            <F
              label="Commission ID"
              name="vendor"
              value={form.vendor}
              onChange={handleChange}
            />
            <F
              label="Split Value"
              name="split"
              type="number"
              value={form.split}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="bg-slate-800 rounded-lg p-6 space-y-4">
          <h2 className="text-white font-bold text-sm uppercase border-b border-slate-700 pb-2">
            Email Configuration
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <F
              label="Pricing Email"
              name="pricing_email"
              value={form.pricing_email}
              onChange={handleChange}
            />
            <F
              label="Commission Email"
              name="commission_email"
              value={form.commission_email}
              onChange={handleChange}
            />
            <F
              label="Confirmation Email"
              name="confirmation_email"
              value={form.confirmation_email}
              onChange={handleChange}
            />
          </div>
          <h3 className="text-slate-400 text-xs uppercase font-bold mt-4">
            Daily Pricing Emails
          </h3>
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="grid grid-cols-3 gap-4 items-end">
              <div className="col-span-2">
                <F
                  label={`Daily Pricing Email ${n}`}
                  name={`daily_pricing_email${n}`}
                  value={form[`daily_pricing_email${n}`]}
                  onChange={handleChange}
                />
              </div>
              <F
                label={`Mills ${n}`}
                name={`mills${n}`}
                value={form[`mills${n}`]}
                onChange={handleChange}
              />
            </div>
          ))}
        </div>

        <div className="bg-slate-800 rounded-lg p-6 space-y-4">
          <h2 className="text-white font-bold text-sm uppercase border-b border-slate-700 pb-2">
            Commission & Terms
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-slate-400 text-xs uppercase font-bold">
                Payment Term
              </label>
              {[
                "Paid in next commission period",
                "Paid after first bill payment",
              ].map((opt) => (
                <label
                  key={opt}
                  className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer"
                >
                  <input
                    type="radio"
                    name="payment_term"
                    value={opt}
                    checked={form.payment_term === opt}
                    onChange={handleChange}
                    className="accent-red-500"
                  />
                  {opt}
                </label>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-slate-400 text-xs uppercase font-bold">
                Up Front Terms
              </label>
              {[
                "Annual up-front",
                "50% term up-front",
                "75% term up-front",
              ].map((opt) => (
                <label
                  key={opt}
                  className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer"
                >
                  <input
                    type="radio"
                    name="terms_upfront"
                    value={opt}
                    checked={form.terms_upfront === opt}
                    onChange={handleChange}
                    className="accent-red-500"
                  />
                  {opt}
                </label>
              ))}
            </div>
            <F
              label="Upfront Mills"
              name="upfront_mills"
              value={form.upfront_mills}
              onChange={handleChange}
            />
            <F
              label="Discount on Upfront (%)"
              name="discount_upfront"
              value={form.discount_upfront}
              onChange={handleChange}
            />
            <div className="flex flex-col gap-2">
              <label className="text-slate-400 text-xs uppercase font-bold">
                Upfront Calculation Status
              </label>
              <label className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.upfront_flag === "1"}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      upfront_flag: e.target.checked ? "1" : "0",
                    })
                  }
                  className="accent-red-500 w-4 h-4"
                />
                Enabled
              </label>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-slate-400 text-xs uppercase font-bold">
                Daily Pricing Status
              </label>
              {["Regular Pricing", "Irregular Pricing"].map((opt) => (
                <label
                  key={opt}
                  className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer"
                >
                  <input
                    type="radio"
                    name="regular_status"
                    value={opt.toLowerCase().replace(" ", "_")}
                    checked={
                      form.regular_status ===
                      opt.toLowerCase().replace(" ", "_")
                    }
                    onChange={handleChange}
                    className="accent-red-500"
                  />
                  {opt}
                </label>
              ))}
            </div>
            <F
              label="Commission Status"
              name="commission_status"
              value={form.commission_status}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="flex gap-4">
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="bg-red-600 hover:bg-red-700 text-white px-8 py-2 rounded text-sm font-bold uppercase disabled:opacity-50"
          >
            {saving ? "Saving..." : "Update Broker"}
          </button>
          <button
            onClick={() => router.push("/broker")}
            className="bg-slate-700 hover:bg-slate-600 text-white px-8 py-2 rounded text-sm font-bold uppercase"
          >
            Cancel
          </button>
        </div>
      </div>
    </Layout>
  );
};

export default EditBroker;
