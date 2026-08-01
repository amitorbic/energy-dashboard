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

const inputClass =
  "w-full px-3 py-2 rounded text-sm border focus:outline-none focus:border-[var(--accent-light)]";
const inputStyle = {
  background: "var(--ct-canvas)",
  color: "var(--ct-text-primary)",
  borderColor: "var(--ct-border-default)",
};
const panelClass = "rounded-[var(--r-lg)] p-5 space-y-4 border";
const panelStyle = { background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" };
const panelHeadingClass =
  "text-xs font-bold uppercase tracking-wide border-b pb-2";
const panelHeadingStyle = { color: "var(--ct-text-muted)", borderColor: "var(--ct-border-default)" };
const fieldLabelClass = "text-xs mb-1 block";
const fieldLabelStyle = { color: "var(--ct-text-muted)" };
const secondaryBtnClass =
  "px-5 py-2 rounded text-xs font-bold uppercase transition-colors border disabled:opacity-50";
const secondaryBtnStyle = {
  background: "var(--ct-surface)",
  borderColor: "var(--ct-border-default)",
  color: "var(--ct-text-primary)",
};

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
        <div className="text-center py-20 animate-pulse" style={{ color: "var(--ct-text-muted)" }}>
          Loading...
        </div>
      </Layout>
    );

  return (
    <Layout title={`${form.company_name} — Pricing`}>
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Header */}
        <header className="flex justify-between items-center border-b pb-5" style={{ borderColor: "var(--ct-border-subtle)" }}>
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tighter" style={{ color: "var(--ct-text-primary)" }}>
              {form.company_name || "Customer Pricing"}
            </h1>
            <p className="font-mono text-sm" style={{ color: "var(--ct-text-secondary)" }}>{form.esid}</p>
          </div>
          <button
            onClick={() => router.push("/custom_pricing")}
            className="text-sm px-4 py-2 transition-colors"
            style={{ color: "var(--ct-text-muted)" }}
          >
            ← Back
          </button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* ── LEFT ── */}
          <div className="space-y-5">
            {/* Customer Details — editable inline */}
            <div className={panelClass} style={panelStyle}>
              <p className={panelHeadingClass} style={panelHeadingStyle}>
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
                    <label className={fieldLabelClass} style={fieldLabelStyle}>
                      {label}
                    </label>
                    <input
                      type={type}
                      name={name}
                      value={(form as any)[name] ?? ""}
                      onChange={handleChange}
                      className={inputClass}
                      style={inputStyle}
                    />
                  </div>
                ))}

                {/* Broker dropdown */}
                <div>
                  <label className={fieldLabelClass} style={fieldLabelStyle}>
                    Broker
                  </label>
                  <select
                    name="broker_code"
                    value={form.broker_code}
                    onChange={handleChange}
                    className={inputClass}
                    style={inputStyle}
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
                  <label className={fieldLabelClass} style={fieldLabelStyle}>
                    Credit Status
                  </label>
                  <select
                    name="credit_status"
                    value={form.credit_status}
                    onChange={handleChange}
                    className={inputClass}
                    style={inputStyle}
                  >
                    <option value="Pending">Pending</option>
                    <option value="Approved">Approved</option>
                  </select>
                </div>

                {/* Nodal */}
                <div>
                  <label className={fieldLabelClass} style={fieldLabelStyle}>
                    Nodal & RUC
                  </label>
                  <select
                    name="nodal"
                    value={form.nodal}
                    onChange={handleChange}
                    className={inputClass}
                    style={inputStyle}
                  >
                    <option value="Included">Included</option>
                    <option value="Excluded">Excluded</option>
                  </select>
                </div>

                {/* Billing Address */}
                <div className="col-span-2">
                  <label className={fieldLabelClass} style={fieldLabelStyle}>
                    Billing Address
                  </label>
                  <input
                    type="text"
                    name="billing_address"
                    value={form.billing_address ?? ""}
                    onChange={handleChange}
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>

                {/* Comments */}
                <div className="col-span-2">
                  <label className={fieldLabelClass} style={fieldLabelStyle}>
                    Comments
                  </label>
                  <textarea
                    name="comments"
                    value={form.comments ?? ""}
                    onChange={handleChange}
                    rows={2}
                    className={`${inputClass} resize-none`}
                    style={inputStyle}
                  />
                </div>
              </div>

              <button
                onClick={handleSaveCustomer}
                disabled={saving}
                className={secondaryBtnClass}
                style={secondaryBtnStyle}
              >
                {saving ? "Saving..." : "Save Customer"}
              </button>
              {saveMsg && (
                <span className="text-xs ml-3" style={{ color: "var(--success-light)" }}>{saveMsg}</span>
              )}
            </div>

            {/* Upload Usage */}
            <div className={panelClass} style={panelStyle}>
              <p className={panelHeadingClass} style={panelHeadingStyle}>
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
                      className="text-sm rounded border px-2 py-1 w-64 file:border-0 file:px-3 file:py-1 file:rounded file:text-xs file:font-bold file:uppercase file:cursor-pointer"
                      style={{
                        background: "var(--ct-canvas)",
                        color: "var(--ct-text-primary)",
                        borderColor: "var(--ct-border-default)",
                      }}
                    />
                    <span className="text-xs" style={{ color: "var(--ct-text-muted)" }}>File {i + 1}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                {fileSlots.length < 5 && (
                  <button
                    onClick={() => setFileSlots((p) => [...p, p.length])}
                    className={secondaryBtnClass}
                    style={secondaryBtnStyle}
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
                  className="px-4 py-2 rounded text-sm font-bold uppercase disabled:opacity-50"
                  style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
                >
                  {uploading ? "Uploading..." : "Upload All"}
                </button>
              </div>
              {uploadMsg && (
                <p className="text-xs" style={{ color: "var(--ct-text-secondary)" }}>{uploadMsg}</p>
              )}
            </div>

            {/* Profile & Volume */}
            <div className={panelClass} style={panelStyle}>
              <div className="flex justify-between items-center border-b pb-2" style={{ borderColor: "var(--ct-border-default)" }}>
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--ct-text-muted)" }}>
                  Profile &amp; volume
                </p>
                <span className="text-xs font-mono" style={{ color: "var(--ct-text-muted)" }}>
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
                      <p className="text-xs font-bold uppercase mb-2" style={{ color: "var(--accent-light)" }}>
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
                              className="accent-[var(--accent-light)] w-4 h-4 cursor-pointer"
                            />
                            <span className="font-mono text-xs w-40" style={{ color: "var(--ct-text-secondary)" }}>
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
                                className="px-2 py-1 rounded text-xs border w-28 focus:outline-none focus:border-[var(--accent-light)]"
                                style={{ background: "var(--ct-canvas)", color: "var(--ct-text-primary)", borderColor: "var(--ct-border-default)" }}
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
                className={secondaryBtnClass}
                style={secondaryBtnStyle}
              >
                {saving ? "Saving..." : "Save Profiles"}
              </button>
            </div>
          </div>

          {/* ── RIGHT ── */}
          <div className="space-y-5">
            {/* Pricing Controls */}
            <div className={panelClass} style={panelStyle}>
              <p className={panelHeadingClass} style={panelHeadingStyle}>
                Custom pricing
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={fieldLabelClass} style={fieldLabelStyle}>
                    Start date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className={fieldLabelClass} style={fieldLabelStyle}>
                    Terms
                  </label>
                  <input
                    type="text"
                    value={terms}
                    onChange={(e) => setTerms(e.target.value)}
                    placeholder="6,12,18,24"
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
              </div>
              <button
                onClick={handleCalculate}
                disabled={
                  calculating || Object.keys(selectedProfiles).length === 0
                }
                className="w-full py-2.5 rounded text-sm font-bold uppercase transition-colors disabled:opacity-50"
                style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
              >
                {calculating ? "Calculating..." : "Calculate Price"}
              </button>
            </div>

            {/* Results */}
            {pricing.length > 0 && (
              <div className={panelClass} style={panelStyle}>
                <p className={panelHeadingClass} style={panelHeadingStyle}>
                  Results
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="uppercase text-xs" style={{ background: "var(--ct-surface-hover)", color: "var(--ct-text-muted)" }}>
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
                        className="border-t transition-colors hover:bg-[var(--ct-surface-hover)]"
                        style={{ borderColor: "var(--ct-border-default)" }}
                      >
                        <td className="p-3 text-center font-bold" style={{ color: "var(--ct-text-primary)" }}>
                          {p.term} mo
                        </td>
                        <td className="p-3 text-center font-mono font-bold text-lg" style={{ color: "var(--accent-light)" }}>
                          {p.custom_price !== null
                            ? p.custom_price.toFixed(4)
                            : "N/A"}
                        </td>
                        <td className="p-3 text-center" style={{ color: "var(--ct-text-secondary)" }}>
                          {p.total_kwh.toLocaleString()}
                        </td>
                        <td className="p-3 text-center" style={{ color: "var(--ct-text-secondary)" }}>
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
                  className="w-full py-2.5 rounded text-sm font-bold uppercase transition-colors disabled:opacity-50"
                  style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
                >
                  {sending ? "Sending..." : "Send Pricing Email"}
                </button>
                {sendMsg && (
                  <p
                    className="text-xs text-center"
                    style={{ color: sendMsg.includes("success") ? "var(--success-light)" : "var(--danger-light)" }}
                  >
                    {sendMsg}
                  </p>
                )}
              </div>
            )}

            {/* Customer summary */}
            <div className={panelClass} style={panelStyle}>
              <p className={`${panelHeadingClass} mb-3`} style={panelHeadingStyle}>
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
                    <span style={{ color: "var(--ct-text-muted)" }}>{label}: </span>
                    <span className="font-semibold" style={{ color: "var(--ct-text-secondary)" }}>
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
