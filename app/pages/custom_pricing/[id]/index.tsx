import { useState, useEffect, useRef } from "react";
import Layout from "../../../components/Layout";
import api from "../../../utils/api";
import { useRouter } from "next/router";
import { getUser } from "../../../utils/auth";

interface CustomerForm {
  company_name: string;
  esid: string;
  num_esids: number;
  nodal: string;
  broker_code: string;
  broker_fee: number;
  mills: number;
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

interface PriceResult {
  term: number;
  custom_price: number | null;
  total_kwh: number;
  matched_volume: number;
}

interface UsageSummary {
  profile_key: string;
  total_kwh: number;
}

interface ProfileMap {
  profile_key: string;
  zone: string;
}

const defaultForm: CustomerForm = {
  company_name: "",
  esid: "",
  num_esids: 1,
  nodal: "Included",
  broker_code: "",
  broker_fee: 0,
  mills: 0,
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

const sanitizeDate = (d: string) => (d === "0000-00-00" || !d ? "" : d);

const CustomerPricingPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const millsLabel = `${getUser()?.company_name ?? ""} Mills`.trim();

  const [form, setForm] = useState<CustomerForm>(defaultForm);
  const [brokerList, setBrokerList] = useState<
    { sid: number; broker_code: string; company_name: string }[]
  >([]);
  const [allProfiles, setAllProfiles] = useState<ProfileMap[]>([]);
  const [selectedProfiles, setSelectedProfiles] = useState<
    Record<string, number>
  >({});
  const [pricing, setPricing] = useState<PriceResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [saveMsg, setSaveMsg] = useState("");
  const [sendMsg, setSendMsg] = useState("");
  const [startDate, setStartDate] = useState("");
  const [terms, setTerms] = useState("6,12,18,24");
  const [fileSlots, setFileSlots] = useState<number[]>([0]);
  const fileRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    api
      .get("/brokers/dropdown")
      .then((res) => setBrokerList(res.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.get(`/customers/${id}`),
      api.get(`/customers/${id}/usage-summary`),
      api.get(`/pricing/profiles`),
    ])
      .then(([custRes, usageRes, profilesRes]) => {
        const c = custRes.data;
        const clean = {
          ...c,
          contract_start_date: sanitizeDate(c.contract_start_date),
          pricing_start_date: sanitizeDate(c.pricing_start_date),
        };
        setForm(clean);
        if (clean.contract_start_date) setStartDate(clean.contract_start_date);
        setAllProfiles(profilesRes.data || []);
        const usageData: UsageSummary[] = usageRes.data || [];
        const vols: Record<string, number> = {};
        usageData.forEach((u) => {
          vols[u.profile_key] = u.total_kwh;
        });
        setSelectedProfiles(vols);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

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

  const handleSaveCustomer = async () => {
    setSaving(true);
    setSaveMsg("");
    try {
      await api.put(`/customers/${id}`, form);
      setSaveMsg("Customer saved.");
    } catch {
      setSaveMsg("Save failed.");
    }
    setSaving(false);
  };

  const handleProfileToggle = (pk: string) => {
    setSelectedProfiles((prev) => {
      if (pk in prev) {
        const u = { ...prev };
        delete u[pk];
        return u;
      }
      return { ...prev, [pk]: 0 };
    });
  };

  const handleVolumeChange = (pk: string, val: string) => {
    setSelectedProfiles((prev) => ({ ...prev, [pk]: parseFloat(val) || 0 }));
  };

  const handleSaveProfiles = async () => {
    setSaving(true);
    setSaveMsg("");
    try {
      await api.post(`/customers/${id}/save-profiles`, {
        profiles: selectedProfiles,
        start_date: startDate,
      });
      setSaveMsg("Profiles saved.");
    } catch {
      setSaveMsg("Save failed.");
    }
    setSaving(false);
  };

  const handleCalculate = async () => {
    if (!startDate || !terms) return;
    setCalculating(true);
    try {
      const termList = terms
        .split(",")
        .map((t) => parseInt(t.trim()))
        .filter((t) => !isNaN(t));
      const res = await api.post(`/customers/${id}/custom-price`, {
        start_date: startDate,
        terms: termList,
        profiles: selectedProfiles,
      });
      setPricing(res.data);
    } catch {
      console.error("Pricing failed");
    }
    setCalculating(false);
  };

  const handleSendEmail = async () => {
    setSending(true);
    setSendMsg("");
    try {
      await api.post(`/email/send-single-custom`, {
        customer_id: id,
        terms: terms
          .split(",")
          .map((t) => parseInt(t.trim()))
          .filter((t) => !isNaN(t)),
        profiles: selectedProfiles,
        start_date: startDate,
      });
      setSendMsg("Email sent successfully.");
    } catch (err: any) {
      setSendMsg(err.response?.data?.detail || "Send failed.");
    }
    setSending(false);
  };

  const zones = ["South", "Coast", "North", "West"];
  const zoneDisplay: Record<string, string> = { Coast: "CenterPoint" };
  const totalVolume = Object.values(selectedProfiles).reduce(
    (s, v) => s + v,
    0,
  );

  if (loading)
    return (
      <Layout title="Customer Pricing">
        <div className="text-slate-500 text-center py-20 animate-pulse">
          Loading...
        </div>
      </Layout>
    );

  return (
    <Layout title={`${form.company_name} — Pricing`}>
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Header */}
        <header className="flex justify-between items-center border-b border-slate-800 pb-5">
          <div>
            <h1 className="text-3xl font-black text-white uppercase tracking-tighter">
              {form.company_name || "Customer Pricing"}
            </h1>
            <p className="text-slate-500 font-mono text-sm">{form.esid}</p>
          </div>
          <button
            onClick={() => router.push("/custom_pricing")}
            className="text-slate-400 hover:text-white text-sm px-4 py-2"
          >
            ← Back
          </button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* ── LEFT ── */}
          <div className="space-y-5">
            {/* Customer Details — editable inline */}
            <div className="bg-slate-800 rounded-lg p-5 space-y-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide border-b border-slate-700 pb-2">
                Customer details
              </p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Company Name", name: "company_name", span: 2 },
                  { label: "ESID", name: "esid" },
                  { label: "No. ESIDs", name: "num_esids", type: "number" },
                  { label: "Contact Person", name: "contact_person" },
                  {
                    label: "Contact Email",
                    name: "contact_email",
                    type: "email",
                  },
                  { label: "Contact Number", name: "contact_number" },
                  {
                    label: "Contract Start",
                    name: "contract_start_date",
                    type: "date",
                  },
                  {
                    label: "Pricing Start",
                    name: "pricing_start_date",
                    type: "date",
                  },
                  { label: "Broker Fee", name: "broker_fee", type: "number" },
                  {
                    label: millsLabel,
                    name: "mills",
                    type: "number",
                  },
                ].map(({ label, name, type = "text", span }) => (
                  <div key={name} className={span === 2 ? "col-span-2" : ""}>
                    <label className="text-xs text-slate-400 mb-1 block">
                      {label}
                    </label>
                    <input
                      type={type}
                      name={name}
                      value={(form as any)[name] ?? ""}
                      onChange={handleChange}
                      className="w-full bg-slate-700 text-white px-3 py-2 rounded text-sm border border-slate-600 focus:outline-none focus:border-red-500"
                    />
                  </div>
                ))}

                {/* Broker dropdown */}
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">
                    Broker
                  </label>
                  <select
                    name="broker_code"
                    value={form.broker_code}
                    onChange={handleChange}
                    className="w-full bg-slate-700 text-white px-3 py-2 rounded text-sm border border-slate-600 focus:outline-none focus:border-red-500"
                  >
                    <option value="">-- Select --</option>
                    {brokerList.map((b) => (
                      <option key={b.sid} value={b.broker_code}>
                        {b.company_name} ({b.broker_code})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Credit Status */}
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">
                    Credit Status
                  </label>
                  <select
                    name="credit_status"
                    value={form.credit_status}
                    onChange={handleChange}
                    className="w-full bg-slate-700 text-white px-3 py-2 rounded text-sm border border-slate-600 focus:outline-none focus:border-red-500"
                  >
                    <option value="Pending">Pending</option>
                    <option value="Approved">Approved</option>
                  </select>
                </div>

                {/* Nodal */}
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">
                    Nodal & RUC
                  </label>
                  <select
                    name="nodal"
                    value={form.nodal}
                    onChange={handleChange}
                    className="w-full bg-slate-700 text-white px-3 py-2 rounded text-sm border border-slate-600 focus:outline-none focus:border-red-500"
                  >
                    <option value="Included">Included</option>
                    <option value="Excluded">Excluded</option>
                  </select>
                </div>

                {/* Billing Address */}
                <div className="col-span-2">
                  <label className="text-xs text-slate-400 mb-1 block">
                    Billing Address
                  </label>
                  <input
                    type="text"
                    name="billing_address"
                    value={form.billing_address ?? ""}
                    onChange={handleChange}
                    className="w-full bg-slate-700 text-white px-3 py-2 rounded text-sm border border-slate-600 focus:outline-none focus:border-red-500"
                  />
                </div>

                {/* Comments */}
                <div className="col-span-2">
                  <label className="text-xs text-slate-400 mb-1 block">
                    Comments
                  </label>
                  <textarea
                    name="comments"
                    value={form.comments ?? ""}
                    onChange={handleChange}
                    rows={2}
                    className="w-full bg-slate-700 text-white px-3 py-2 rounded text-sm border border-slate-600 focus:outline-none focus:border-red-500 resize-none"
                  />
                </div>
              </div>

              <button
                onClick={handleSaveCustomer}
                disabled={saving}
                className="bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-white px-5 py-2 rounded text-xs font-bold uppercase transition"
              >
                {saving ? "Saving..." : "Save Customer"}
              </button>
              {saveMsg && (
                <span className="text-green-400 text-xs ml-3">{saveMsg}</span>
              )}
            </div>

            {/* Upload Usage */}
            <div className="bg-slate-800 rounded-lg p-5 space-y-3">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide border-b border-slate-700 pb-2">
                Upload usage files
              </p>
              <div className="space-y-2">
                {fileSlots.map((slot, i) => (
                  <div key={slot} className="flex items-center gap-3">
                    <input
                      ref={(el) => {
                        fileRefs.current[i] = el;
                      }}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="bg-slate-700 text-white text-sm rounded border border-slate-600 px-2 py-1 w-64 file:bg-red-600 file:text-white file:border-0 file:px-3 file:py-1 file:rounded file:text-xs file:font-bold file:uppercase file:cursor-pointer"
                    />
                    <span className="text-slate-500 text-xs">File {i + 1}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                {fileSlots.length < 5 && (
                  <button
                    onClick={() => setFileSlots((p) => [...p, p.length])}
                    className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded text-sm font-bold"
                  >
                    + Add File
                  </button>
                )}
                <button
                  disabled={uploading}
                  onClick={async () => {
                    setUploading(true);
                    setUploadMsg("");
                    let inserted = 0;
                    let errors: string[] = [];
                    let first = true;
                    for (let i = 0; i < fileRefs.current.length; i++) {
                      const f = fileRefs.current[i];
                      if (!f?.files?.[0]) continue;
                      const fd = new FormData();
                      fd.append("file", f.files[0]);
                      try {
                        const res = await api.post(
                          `/customers/${id}/upload-usage?delete_existing=${first}`,
                          fd,
                          {
                            headers: { "Content-Type": "multipart/form-data" },
                          },
                        );
                        inserted += res.data.inserted || 0;
                        if (res.data.errors)
                          errors = [...errors, ...res.data.errors];
                        first = false;
                      } catch {
                        errors.push(`File ${i + 1} failed`);
                      }
                    }
                    setUploadMsg(
                      `Inserted ${inserted} records.${errors.length ? " Errors: " + errors.slice(0, 3).join(", ") : ""}`,
                    );
                    const usageRes = await api.get(
                      `/customers/${id}/usage-summary`,
                    );
                    const vols: Record<string, number> = {};
                    (usageRes.data as UsageSummary[]).forEach((u) => {
                      vols[u.profile_key] = u.total_kwh;
                    });
                    setSelectedProfiles(vols);
                    setUploading(false);
                  }}
                  className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-bold uppercase"
                >
                  {uploading ? "Uploading..." : "Upload All"}
                </button>
              </div>
              {uploadMsg && (
                <p className="text-slate-300 text-xs">{uploadMsg}</p>
              )}
            </div>

            {/* Profile & Volume */}
            <div className="bg-slate-800 rounded-lg p-5 space-y-3">
              <div className="flex justify-between items-center border-b border-slate-700 pb-2">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                  Profile &amp; volume
                </p>
                <span className="text-xs text-slate-400 font-mono">
                  Total: {totalVolume.toLocaleString()} KWH
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                {zones.map((zone) => {
                  const zoneProfiles = allProfiles.filter(
                    (p) => p.zone.toLowerCase() === zone.toLowerCase(),
                  );
                  if (!zoneProfiles.length) return null;
                  return (
                    <div key={zone}>
                      <p className="text-xs font-bold text-red-400 uppercase mb-2">
                        {zoneDisplay[zone] || zone}
                      </p>
                      {zoneProfiles.map((p) => {
                        const isSelected = p.profile_key in selectedProfiles;
                        return (
                          <div
                            key={p.profile_key}
                            className="flex items-center gap-2 mb-1.5"
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() =>
                                handleProfileToggle(p.profile_key)
                              }
                              className="accent-red-500 w-4 h-4 cursor-pointer"
                            />
                            <span className="text-slate-300 font-mono text-xs w-40">
                              {p.profile_key}
                            </span>
                            {isSelected && (
                              <input
                                type="number"
                                value={selectedProfiles[p.profile_key] || ""}
                                onChange={(e) =>
                                  handleVolumeChange(
                                    p.profile_key,
                                    e.target.value,
                                  )
                                }
                                placeholder="KWH"
                                className="bg-slate-700 text-white px-2 py-1 rounded text-xs border border-slate-600 w-28 focus:outline-none focus:border-red-500"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              <button
                onClick={handleSaveProfiles}
                disabled={saving}
                className="bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-white px-5 py-2 rounded text-xs font-bold uppercase transition"
              >
                {saving ? "Saving..." : "Save Profiles"}
              </button>
            </div>
          </div>

          {/* ── RIGHT ── */}
          <div className="space-y-5">
            {/* Pricing Controls */}
            <div className="bg-slate-800 rounded-lg p-5 space-y-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide border-b border-slate-700 pb-2">
                Custom pricing
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">
                    Start date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-slate-700 text-white px-3 py-2 rounded text-sm border border-slate-600 focus:outline-none focus:border-red-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">
                    Terms
                  </label>
                  <input
                    type="text"
                    value={terms}
                    onChange={(e) => setTerms(e.target.value)}
                    placeholder="6,12,18,24"
                    className="w-full bg-slate-700 text-white px-3 py-2 rounded text-sm border border-slate-600 focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>
              <button
                onClick={handleCalculate}
                disabled={
                  calculating || Object.keys(selectedProfiles).length === 0
                }
                className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white py-2.5 rounded text-sm font-bold uppercase transition"
              >
                {calculating ? "Calculating..." : "Calculate Price"}
              </button>
            </div>

            {/* Results */}
            {pricing.length > 0 && (
              <div className="bg-slate-800 rounded-lg p-5 space-y-4">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide border-b border-slate-700 pb-2">
                  Results
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-700 text-slate-400 uppercase text-xs">
                      <th className="p-3 text-center">Term</th>
                      <th className="p-3 text-center">Price (¢/kWh)</th>
                      <th className="p-3 text-center">Total KWH</th>
                      <th className="p-3 text-center">Matched Vol</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pricing.map((p) => (
                      <tr
                        key={p.term}
                        className="border-t border-slate-700 hover:bg-slate-700/50"
                      >
                        <td className="p-3 text-center text-white font-bold">
                          {p.term} mo
                        </td>
                        <td className="p-3 text-center text-red-400 font-mono font-bold text-lg">
                          {p.custom_price !== null
                            ? p.custom_price.toFixed(4)
                            : "N/A"}
                        </td>
                        <td className="p-3 text-center text-slate-400">
                          {p.total_kwh.toLocaleString()}
                        </td>
                        <td className="p-3 text-center text-slate-400">
                          {p.matched_volume.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Send Email */}
                <button
                  onClick={handleSendEmail}
                  disabled={sending}
                  className="w-full bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white py-2.5 rounded text-sm font-bold uppercase transition"
                >
                  {sending ? "Sending..." : "Send Pricing Email"}
                </button>
                {sendMsg && (
                  <p
                    className={`text-xs text-center ${sendMsg.includes("success") ? "text-green-400" : "text-red-400"}`}
                  >
                    {sendMsg}
                  </p>
                )}
              </div>
            )}

            {/* Customer summary */}
            <div className="bg-slate-800 rounded-lg p-5">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide border-b border-slate-700 pb-2 mb-3">
                Summary
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  ["Broker", form.broker_code],
                  ["Broker Fee", form.broker_fee],
                  [millsLabel, form.mills],
                  ["Credit Status", form.credit_status],
                  ["Nodal/RUC", form.nodal],
                  ["No. ESIDs", form.num_esids],
                ].map(([label, val]) => (
                  <div key={label as string}>
                    <span className="text-slate-500">{label}: </span>
                    <span className="text-slate-300 font-semibold">
                      {val as string}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default CustomerPricingPage;
