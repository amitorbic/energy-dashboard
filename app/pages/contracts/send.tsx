"use client";
import { useEffect, useState } from "react";
import ContractLayout from "../../components/ContractLayout";
import api from "../../utils/api";
import { useRouter } from "next/router";
import { getUser } from "../../utils/auth";

interface RenewalCustomer {
  id: number;
  company_name: string;
  broker_code: string;
  broker_name: string;
  confirmation_email: string | null;
  contact_email: string | null;
  split: string | null;
  esids: { esid: string; end_date: string }[];
}
const PROFILES_BY_ZONE: Record<string, string[]> = {
  SOUTH: [
    "BUSHILF_SOUTH",
    "BUSLOLF_SOUTH",
    "BUSMEDLF_SOUTH",
    "BUSNODEM_SOUTH",
    "RESLOWR_SOUTH",
  ],
  CENTERPOINT: [
    "BUSHILF_COAST",
    "BUSLOLF_COAST",
    "BUSMEDLF_COAST",
    "BUSNODEM_COAST",
    "RESLOWR_COAST",
  ],
  NORTH: [
    "BUSHILF_NORTH",
    "BUSLOLF_NORTH",
    "BUSMEDLF_NORTH",
    "BUSNODEM_NORTH",
    "RESLOWR_NORTH",
  ],
  WEST: [
    "BUSHILF_WEST",
    "BUSLOLF_WEST",
    "BUSMEDLF_WEST",
    "BUSNODEM_WEST",
    "RESLOWR_WEST",
  ],
};

const inputCls =
  "w-full rounded-[var(--r-sm)] px-3 py-1.5 text-sm border focus:outline-none focus:border-[var(--accent-light)]";
const inputStyle = { background: "var(--ct-surface)", color: "var(--ct-text-primary)", borderColor: "var(--ct-border-default)" };
const labelCls = "text-sm font-medium text-right pr-2";
const labelStyle = { color: "var(--ct-text-secondary)" };
const errCls = "text-xs mt-0.5";
const errStyle = { color: "var(--danger-light)" };

interface Broker {
  sid: number;
  broker_code: string;
  company_name: string;
  broker_name: string;
  confirmation_email: string | null;
  confirmation_flag: number;
  split: string | null; // ← add this
}

interface FormOptions {
  contract_no: string;
  brokers: Broker[];
  users: { uid: number; name: string }[];
}

type Step = 1 | 2 | 3;
type ProfileVolumes = Record<string, string>;

export default function SendConfirmationPage() {
  const millsLabel = `${getUser()?.company_name ?? ""} Mills`.trim();
  const [step, setStep] = useState<Step>(1);
  const [opts, setOpts] = useState<FormOptions | null>(null);
  const [form, setForm] = useState<Record<string, any>>({
    contract_no: "",
    type_of_contract: "now",
    uid: "",
    customer_name: "",
    broker_code: "",
    broker_name: "",
    term: "",
    esiid: "",
    esid_count: "",
    contract_rate: "",
    mill: "",
    comment: "",
    comment_mail: "",
    comment_enrollment: "",
    start_date: "",
    asap: false,
    meter_read: false,
    prior_day: false,
    nodal: false,
    credit_status: true,
    contract_received: true,
    executed: true,
    forwarded: true,
    switch_flag: false,
    pmvi: false,
    mvi: false,
    paper_bill: false,
    customer_email: "",
    tax_exempt: "none",
    meter_fees: "",
    lmp: false,
    ap_quote: "",
    sent_by: "",
    send_to_email: "",
    sid: "",
    cust_first_name: "",
    cust_last_name: "",
    billing_address: "",
    billing_city: "",
    billing_state: "",
    billing_zip: "",
    plan_group: "",
    plan_id: "",
  });
  const [profiles, setProfiles] = useState<ProfileVolumes>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentResult, setSentResult] = useState<{
    contract_no: string;
    sid: number;
  } | null>(null);
  const removeEsid = (esid: string) => {
    setSelectedEsids((prev) => prev.filter((s) => s.esid !== esid));
  };

  const [renewalSearch, setRenewalSearch] = useState("");
  const [renewalResults, setRenewalResults] = useState<RenewalCustomer[]>([]);
  const router = useRouter();
  const [selectedEsids, setSelectedEsids] = useState<
    { esid: string; end_date: string; customer: RenewalCustomer }[]
  >([]);
  const toggleEsid = (
    customer: RenewalCustomer,
    e: { esid: string; end_date: string },
  ) => {
    setSelectedEsids((prev) => {
      const exists = prev.some((s) => s.esid === e.esid);
      if (exists) return prev.filter((s) => s.esid !== e.esid);
      return [...prev, { esid: e.esid, end_date: e.end_date, customer }];
    });
  };
  // Prefill from custom pricing or upload via query params
  useEffect(() => {
    const q = router.query;
    if (!q.source || !opts) return;

    if (q.customer_name) set("customer_name", q.customer_name as string);
    if (q.broker_code) {
      handleBrokerChange(q.broker_code as string);
    }
    if (q.esid_count) set("esid_count", q.esid_count as string);
    if (q.esiid) set("esiid", q.esiid as string);
    if (q.customer_email) set("customer_email", q.customer_email as string);
    if (q.mill) set("mill", q.mill as string);
    if (q.start_date) set("start_date", q.start_date as string);
    if (q.broker_split) set("broker_split", q.broker_split as string);

    // Set profiles from volumes JSON
    if (q.volumes) {
      try {
        const vols = JSON.parse(q.volumes as string);
        setProfiles(vols);
      } catch {}
    }
  }, [router.query.source, opts]);

  useEffect(() => {
    const { sid } = router.query;
    if (!sid || !opts) return;
    api.get(`/contracts/${sid}`).then((r) => {
      const d = r.data;
      const revMatch = (d.customer_name || "").match(/^(.*) - R(\d+)$/);
      const revisedName = revMatch
        ? `${revMatch[1]} - R${parseInt(revMatch[2], 10) + 1}`
        : `${d.customer_name || ""} - R1`;

      setForm((f) => ({
        ...f,
        ...d,
        customer_name: revisedName,
        asap: d.start_date === "ASAP" || !d.start_date,
        credit_status: !!d.credit_status,
        contract_received: !!d.contract_received,
        executed: !!d.executed,
        forwarded: !!d.forwarded,
        lmp: !!d.lmp,
        paper_bill: !!d.paper_bill,
      }));
      // Re-derive send_to_email and broker_split from broker_new.
      // d.send_to_email is the persisted address (preferred); fall back
      // to the live broker lookup if the column was empty on older records.
      if (d.broker_code) {
        if (!d.send_to_email) handleBrokerChange(d.broker_code);
        else set("send_to_email", d.send_to_email);
      }
      try {
        const vols = JSON.parse(d.volumes || "{}");
        setProfiles(vols);
      } catch {}
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.sid, opts]);

  const handleRenewalSearch = async (q: string) => {
    setRenewalSearch(q);
    if (q.length < 2) {
      setRenewalResults([]);
      return;
    }
    const r = await api.get(
      `/contracts/renewal-search?q=${encodeURIComponent(q)}`,
    );
    setRenewalResults(r.data);
  };

  useEffect(() => {
    api.get("/contracts/form-options").then((r) => {
      setOpts(r.data);
      setForm((f) => ({ ...f, contract_no: r.data.contract_no }));
    });
  }, []);

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const handleBrokerChange = (broker_code: string) => {
    const broker = opts?.brokers.find((b) => b.broker_code === broker_code);
    set("broker_code", broker_code);
    set("broker_name", broker?.company_name || "");
    // Auto-fill recipient from broker_new.confirmation_email
    set("send_to_email", broker?.confirmation_email || "");
    set("broker_split", broker?.split || ""); // ← add this
  };

  const toggleProfile = (p: string) => {
    setProfiles((prev) => {
      const next = { ...prev };
      if (next[p] !== undefined) delete next[p];
      else next[p] = "";
      return next;
    });
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.customer_name) e.customer_name = "Customer name required";
    if (!form.esid_count) e.esid_count = "Number of ESIIDs required";
    if (!form.contract_rate) e.contract_rate = "Contract rate required";
    if (!form.broker_code) e.broker_code = "Select a broker";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const buildPayload = () => ({
    ...form,
    start_date: form.asap
      ? new Date().toISOString().split("T")[0]
      : form.start_date,
    sid: form.sid || router.query.sid || undefined,
    volumes: JSON.stringify(profiles),
    total_volume: Object.values(profiles)
      .reduce((s, v) => s + (parseFloat(v) || 0), 0)
      .toString(),
    profiles_display: Object.keys(profiles).join(", "),
  });

  // Step 1 → Step 2: validate then generate preview HTML client-side
  const handlePreview = async () => {
    if (!validate()) return;
    setPreviewLoading(true);
    try {
      // Build preview HTML locally from form state — no DB write yet
      const r = await api.post("/contracts/preview-html", buildPayload());
      setPreviewHtml(r.data.html);
      if (r.data.ap_quote) {
        set("ap_quote", r.data.ap_quote);
      }
      setStep(2);
    } catch {
      setErrors((e) => ({
        ...e,
        _general: "Failed to generate preview. Try again.",
      }));
    } finally {
      setPreviewLoading(false);
    }
  };

  // Step 3: actual save + send
  const handleSend = async () => {
    setSending(true);
    try {
      const r = await api.post("/contracts/send-email", buildPayload());
      if (r.data.sid) set("sid", String(r.data.sid));
      if (r.data.status === "sent") {
        setSentResult({ contract_no: form.contract_no, sid: r.data.sid });
        setStep(3);
      } else {
        setErrors({ _general: r.data.message || "Record saved. No email was sent." });
      }
    } catch (e: any) {
      setErrors({ _general: e?.response?.data?.detail || "Send failed. Please try again." });
    } finally {
      setSending(false);
    }
  };

  const handleStartOver = () => {
    setStep(1);
    setSentResult(null);
    setPreviewHtml("");
    setErrors({});
    api.get("/contracts/form-options").then((r) => {
      setOpts(r.data);
      setForm((f) => ({ ...f, contract_no: r.data.contract_no }));
    });
  };

  const applySelectedEsids = () => {
    if (selectedEsids.length === 0) return;

    const first = selectedEsids[0].customer;

    const dates = selectedEsids
      .map((s) => s.end_date)
      .filter(Boolean)
      .sort();
    const earliestDate = dates[0] || "";

    set("customer_name", first.company_name);
    set("broker_code", first.broker_code);
    set("broker_name", first.broker_name || "");
    set("send_to_email", first.confirmation_email || "");
    set("broker_split", first.split || "");
    set("customer_email", first.contact_email || "");
    set("esid_count", selectedEsids.length);
    set("esiid", selectedEsids.map((s) => s.esid).join(", "));
    set("start_date", earliestDate);

    setRenewalResults([]);
    setRenewalSearch("");
  };

  const row = (label: string, content: React.ReactNode, errKey?: string) => (
    <div className="grid grid-cols-[220px_1fr] items-start gap-2 py-1.5">
      <span className={labelCls} style={labelStyle}>{label}</span>
      <div>
        {content}
        {errKey && errors[errKey] && <p className={errCls} style={errStyle}>{errors[errKey]}</p>}
      </div>
    </div>
  );

  // ── Step indicator ─────────────────────────────────────────────────────────
  const StepBar = () => (
    <div className="flex items-center gap-0 mb-6">
      {(
        [
          [1, "Fill Form"],
          [2, "Preview Email"],
          [3, "Sent"],
        ] as [number, string][]
      ).map(([n, label], i) => (
        <div key={n} className="flex items-center">
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-[var(--r-md)] text-xs font-medium"
            style={
              step === n
                ? { background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }
                : step > n
                ? { background: "var(--success-light)", color: "#ffffff" }
                : { background: "var(--ct-surface-hover)", color: "var(--ct-text-muted)" }
            }
          >
            <span
              className="w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold"
              style={
                step === n
                  ? { background: "var(--ct-surface)", color: "var(--accent-light)" }
                  : step > n
                  ? { background: "var(--ct-surface)", color: "var(--success-light)" }
                  : { background: "var(--ct-border-default)", color: "var(--ct-text-muted)" }
              }
            >
              {step > n ? "✓" : n}
            </span>
            {label}
          </div>
          {i < 2 && (
            <div
              className="w-8 h-0.5"
              style={{ background: step > n ? "var(--success-light)" : "var(--ct-border-default)" }}
            />
          )}
        </div>
      ))}
    </div>
  );

  if (!opts)
    return (
      <ContractLayout title="Send Confirmation Emails">
        <div className="text-sm p-8" style={{ color: "var(--ct-text-muted)" }}>Loading...</div>
      </ContractLayout>
    );

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 1 — Form
  // ════════════════════════════════════════════════════════════════════════════
  if (step === 1)
    return (
      <ContractLayout title="Send Confirmation Emails">
        <div className="max-w-3xl">
          <StepBar />

          {errors._general && (
            <div className="text-sm px-4 py-2 rounded-[var(--r-md)] mb-4" style={{ background: "var(--danger-light-tint)", color: "var(--danger-light)" }}>
              {errors._general}
            </div>
          )}

          {/* Contract Details */}
          <div className="rounded-[var(--r-lg)] border p-5 mb-4" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--ct-text-muted)" }}>
              Contract Details
            </h2>

            {row(
              "Type of Contract",
              <select
                className={inputCls}
                style={inputStyle}
                value={form.type_of_contract}
                onChange={(e) => set("type_of_contract", e.target.value)}
              >
                <option value="new">New</option>
                <option value="renewal">Renewal</option>
              </select>,
            )}

            {form.type_of_contract === "renewal" && (
              <div className="grid grid-cols-[220px_1fr] items-start gap-2 py-1.5">
                <span className={labelCls} style={labelStyle}>Search Customer / ESI ID</span>
                <div>
                  <input
                    className={inputCls}
                    style={inputStyle}
                    placeholder="Type customer name or ESI ID..."
                    value={renewalSearch}
                    onChange={(e) => handleRenewalSearch(e.target.value)}
                  />

                  {/* Search results */}
                  {renewalResults.length > 0 && (
                    <div
                      className="rounded-[var(--r-md)] mt-1 shadow-sm max-h-64 overflow-y-auto border"
                      style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}
                    >
                      {renewalResults.map((c) => (
                        <div
                          key={c.id}
                          className="border-b last:border-0"
                          style={{ borderColor: "var(--ct-border-subtle)" }}
                        >
                          <div className="px-3 py-2 text-xs font-medium" style={{ background: "var(--ct-surface-hover)", color: "var(--ct-text-secondary)" }}>
                            {c.company_name}
                            <span className="ml-2" style={{ color: "var(--ct-text-muted)" }}>
                              ({c.broker_code})
                            </span>
                          </div>
                          {(c.esids || []).map(
                            (e: { esid: string; end_date: string }) => (
                              <label
                                key={e.esid}
                                className="flex items-center gap-2 px-4 py-1.5 text-xs cursor-pointer transition-colors hover:bg-[var(--accent-light-tint)]"
                                style={{ color: "var(--ct-text-secondary)" }}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedEsids.some(
                                    (s) => s.esid === e.esid,
                                  )}
                                  onChange={() => toggleEsid(c, e)}
                                />
                                <span className="font-mono">{e.esid}</span>
                                {e.end_date && (
                                  <span className="ml-auto" style={{ color: "var(--ct-text-muted)" }}>
                                    exp: {e.end_date}
                                  </span>
                                )}
                              </label>
                            ),
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Selected ESIDs */}
                  {selectedEsids.length > 0 && (
                    <div className="mt-2 rounded-[var(--r-md)] p-2 border" style={{ background: "var(--accent-light-tint)", borderColor: "var(--accent-light)" }}>
                      <p className="text-xs font-medium mb-1" style={{ color: "var(--accent-light)" }}>
                        {selectedEsids.length} ESI ID
                        {selectedEsids.length > 1 ? "s" : ""} selected
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {selectedEsids.map((s) => (
                          <span
                            key={s.esid}
                            className="text-xs rounded-[var(--r-sm)] px-2 py-0.5 flex items-center gap-1 border"
                            style={{ background: "var(--ct-surface)", borderColor: "var(--accent-light)" }}
                          >
                            <span className="font-mono">{s.esid}</span>
                            <button
                              onClick={() => removeEsid(s.esid)}
                              className="ml-1 transition-colors hover:text-[var(--danger-light)]"
                              style={{ color: "var(--ct-text-muted)" }}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                      <button
                        onClick={applySelectedEsids}
                        className="mt-2 px-3 py-1 text-xs rounded-[var(--r-sm)] transition-colors"
                        style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
                      >
                        Apply to form →
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {row(
              "Deal Person",
              <select
                className={inputCls}
                style={inputStyle}
                value={form.uid}
                onChange={(e) => set("uid", e.target.value)}
              >
                <option value="">— Select —</option>
                {opts.users.map((u) => (
                  <option key={u.uid} value={u.uid}>
                    {u.name}
                  </option>
                ))}
              </select>,
              "uid",
            )}

            {row(
              "Contract Number",
              <input
                className={inputCls}
                style={inputStyle}
                value={form.contract_no}
                onChange={(e) => set("contract_no", e.target.value)}
              />,
            )}

            {row(
              "Customer Name",
              <input
                className={inputCls}
                style={inputStyle}
                value={form.customer_name}
                onChange={(e) => set("customer_name", e.target.value)}
                placeholder="Enter customer name"
              />,
              "customer_name",
            )}

            {row(
              "Term (months)",
              <input
                className={inputCls}
                style={inputStyle}
                type="number"
                value={form.term}
                onChange={(e) => set("term", e.target.value)}
              />,
              "term",
            )}

            {row(
              "Number of ESIIDs",
              <input
                className={inputCls}
                style={inputStyle}
                type="number"
                value={form.esid_count}
                onChange={(e) => set("esid_count", e.target.value)}
              />,
            )}

            {row(
              "Broker",
              <select
                className={inputCls}
                style={inputStyle}
                value={form.broker_code}
                onChange={(e) => handleBrokerChange(e.target.value)}
              >
                <option value="">— Select Broker —</option>
                {opts.brokers.map((b) => (
                  <option key={b.sid} value={b.broker_code}>
                    {b.company_name} ({b.broker_code})
                  </option>
                ))}
              </select>,
              "broker_code",
            )}

            {row(
              "Sender Name",
              <input
                className={inputCls}
                style={inputStyle}
                value={form.sent_by}
                onChange={(e) => set("sent_by", e.target.value)}
                placeholder="ORBIC contract confirm..."
              />,
            )}

            {row(
              "Contract Rate (¢/kWh)",
              <input
                className={inputCls}
                style={inputStyle}
                type="number"
                step="0.0001"
                value={form.contract_rate}
                onChange={(e) => set("contract_rate", e.target.value)}
              />,
              "contract_rate",
            )}

            {row(
              millsLabel,
              <div>
                <input
                  className={inputCls}
                  style={inputStyle}
                  type="number"
                  step="0.01"
                  value={form.mill}
                  onChange={(e) => set("mill", e.target.value)}
                />
                <p className="text-xs mt-0.5" style={{ color: "var(--ct-text-muted)" }}>
                  NOTE: This is a required field if there is a discount.
                </p>
              </div>,
            )}

            {row(
              "Company Quote ($/kWh)",
              <input
                className={inputCls}
                style={inputStyle}
                type="number"
                step="0.000001"
                value={form.ap_quote}
                onChange={(e) => set("ap_quote", e.target.value)}
                placeholder="Pre-calculated from pricing module"
              />,
            )}

            {row(
              "Comments",
              <textarea
                className={inputCls}
                style={inputStyle}
                rows={3}
                value={form.comment}
                onChange={(e) => set("comment", e.target.value)}
              />,
              "comment",
            )}
          </div>

          {/* Dates & Flags */}
          <div className="rounded-[var(--r-lg)] border p-5 mb-4" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--ct-text-muted)" }}>
              Dates & Flags
            </h2>

            {row(
              "Start Date",
              <div className="flex items-center gap-4">
                <input
                  className={`${inputCls} w-40`}
                  style={inputStyle}
                  type="date"
                  value={form.start_date}
                  disabled={form.asap}
                  onChange={(e) => set("start_date", e.target.value)}
                />
                <label className="flex items-center gap-1.5 text-sm" style={{ color: "var(--ct-text-secondary)" }}>
                  <input
                    type="checkbox"
                    checked={form.asap}
                    onChange={(e) => {
                      set("asap", e.target.checked);
                      if (e.target.checked) set("start_date", "");
                    }}
                  />
                  ASAP
                </label>
                <label className="flex items-center gap-1.5 text-sm" style={{ color: "var(--ct-text-secondary)" }}>
                  <input
                    type="checkbox"
                    checked={form.meter_read}
                    onChange={(e) => set("meter_read", e.target.checked)}
                  />
                  Meter read
                </label>
              </div>,
              "start_date",
            )}

            <div className="grid grid-cols-2 gap-x-8 gap-y-2 mt-3 ml-4">
              {(
                [
                  ["prior_day", "Prior day"],
                  ["nodal", "Nodal"],
                  ["credit_status", "Credit status"],
                  ["contract_received", "Contract received / signed"],
                  ["executed", "Executed"],
                  ["forwarded", "Forwarded for enrollment"],
                  ["lmp", "LMP"],
                ] as [string, string][]
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center gap-2 text-sm"
                  style={{ color: "var(--ct-text-secondary)" }}
                >
                  <input
                    type="checkbox"
                    checked={!!form[key]}
                    onChange={(e) => set(key, e.target.checked)}
                  />
                  {label}
                </label>
              ))}
            </div>

            <div className="mt-4 ml-4">
              <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--ct-text-muted)" }}>
                Check which applies
              </p>
              <div className="flex gap-6">
                {(
                  [
                    ["switch_flag", "Switch"],
                    ["pmvi", "PMVI"],
                    ["mvi", "MVI"],
                  ] as [string, string][]
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 text-sm"
                    style={{ color: "var(--ct-text-secondary)" }}
                  >
                    <input
                      type="checkbox"
                      checked={!!form[key]}
                      onChange={(e) => set(key, e.target.checked)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Customer & Billing */}
          <div className="rounded-[var(--r-lg)] border p-5 mb-4" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--ct-text-muted)" }}>
              Customer & Billing
            </h2>

            {row(
              "ESIID(s)",
              <textarea
                className={inputCls}
                style={inputStyle}
                rows={2}
                value={form.esiid}
                onChange={(e) => set("esiid", e.target.value)}
                placeholder="One per line or comma-separated"
              />,
              "esiid",
            )}

            {row(
              "Paper bill required",
              <input
                type="checkbox"
                checked={form.paper_bill}
                onChange={(e) => set("paper_bill", e.target.checked)}
                className="mt-1"
              />,
            )}

            {row(
              "Customer email",
              <input
                className={inputCls}
                style={inputStyle}
                type="email"
                value={form.customer_email}
                onChange={(e) => set("customer_email", e.target.value)}
              />,
              "customer_email",
            )}

            {row(
              "Tax exempt",
              <div className="flex flex-col gap-1">
                {(
                  [
                    ["none", "None"],
                    ["residential", "Residential Tax Exempt"],
                    ["certificate", "Certificate Tax Exempt"],
                  ] as [string, string][]
                ).map(([val, label]) => (
                  <label
                    key={val}
                    className="flex items-center gap-2 text-sm"
                    style={{ color: "var(--ct-text-secondary)" }}
                  >
                    <input
                      type="radio"
                      name="tax_exempt"
                      value={val}
                      checked={form.tax_exempt === val}
                      onChange={() => set("tax_exempt", val)}
                    />
                    {label}
                  </label>
                ))}
              </div>,
            )}

            {row(
              "Meter fees",
              <input
                className={`${inputCls} w-48`}
                style={inputStyle}
                value={form.meter_fees}
                onChange={(e) => set("meter_fees", e.target.value)}
                placeholder="ex. 5.00, 7.00, 10.00"
              />,
              "meter_fees",
            )}

            {row(
              "Comments / Notes",
              <textarea
                className={inputCls}
                style={inputStyle}
                rows={3}
                value={form.comment_mail}
                onChange={(e) => set("comment_mail", e.target.value)}
              />,
            )}
          </div>

          {/* Customer Details (auto-populated on upload) */}
          <div className="rounded-[var(--r-lg)] border p-5 mb-4" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
            <h2 className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--ct-text-muted)" }}>
              Customer Details
            </h2>
            <p className="text-xs mb-4" style={{ color: "var(--ct-text-muted)" }}>Auto-populated on upload — staff may fill manually</p>

            {row(
              "First Name",
              <input
                className={inputCls}
                style={inputStyle}
                value={form.cust_first_name}
                onChange={(e) => set("cust_first_name", e.target.value)}
                placeholder="First name"
              />,
            )}

            {row(
              "Last Name",
              <input
                className={inputCls}
                style={inputStyle}
                value={form.cust_last_name}
                onChange={(e) => set("cust_last_name", e.target.value)}
                placeholder="Last name"
              />,
            )}

            {row(
              "Billing Address",
              <input
                className={inputCls}
                style={inputStyle}
                value={form.billing_address}
                onChange={(e) => set("billing_address", e.target.value)}
                placeholder="Street address"
              />,
            )}

            {row(
              "City / State / ZIP",
              <div className="flex gap-2">
                <input
                  className={inputCls}
                  style={inputStyle}
                  value={form.billing_city}
                  onChange={(e) => set("billing_city", e.target.value)}
                  placeholder="City"
                />
                <input
                  className="w-20 rounded-[var(--r-sm)] px-3 py-1.5 text-sm border focus:outline-none focus:border-[var(--accent-light)]"
                  style={inputStyle}
                  value={form.billing_state}
                  onChange={(e) => set("billing_state", e.target.value)}
                  placeholder="State"
                />
                <input
                  className="w-28 rounded-[var(--r-sm)] px-3 py-1.5 text-sm border focus:outline-none focus:border-[var(--accent-light)]"
                  style={inputStyle}
                  value={form.billing_zip}
                  onChange={(e) => set("billing_zip", e.target.value)}
                  placeholder="ZIP"
                />
              </div>,
            )}

            {row(
              "Plan Group",
              <input
                className={inputCls}
                style={inputStyle}
                value={form.plan_group}
                onChange={(e) => set("plan_group", e.target.value)}
                placeholder="e.g. C1"
              />,
            )}

            {row(
              "Plan ID",
              <input
                className={inputCls}
                style={inputStyle}
                value={form.plan_id}
                onChange={(e) => set("plan_id", e.target.value)}
                placeholder="e.g. PNCPOSTPAY"
              />,
            )}
          </div>

          <div className="rounded-[var(--r-lg)] border p-5 mb-6" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--ct-text-muted)" }}>
                Profile & Volume
              </h2>
              <span className="text-xs" style={{ color: "var(--ct-text-muted)" }}>
                Total:{" "}
                {Object.values(profiles)
                  .reduce((s, v) => s + (parseFloat(v) || 0), 0)
                  .toLocaleString()}{" "}
                kWh
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              {Object.entries(PROFILES_BY_ZONE).map(([zone, profs]) => (
                <div key={zone}>
                  <p className="text-xs font-bold mb-2" style={{ color: "var(--accent-light)" }}>{zone}</p>
                  {profs.map((p) => (
                    <div key={p} className="flex items-center gap-2 mb-1.5">
                      <input
                        type="checkbox"
                        checked={profiles[p] !== undefined}
                        onChange={() => toggleProfile(p)}
                        id={`p_${p}`}
                      />
                      <label
                        htmlFor={`p_${p}`}
                        className="text-xs w-40 select-none"
                        style={{ color: "var(--ct-text-secondary)" }}
                      >
                        {p}
                      </label>
                      {profiles[p] !== undefined && (
                        <input
                          type="number"
                          className="rounded-[var(--r-sm)] px-2 py-0.5 text-xs w-28 border focus:outline-none focus:border-[var(--accent-light)]"
                          style={inputStyle}
                          placeholder="Volume"
                          value={profiles[p]}
                          onChange={(e) =>
                            setProfiles((prev) => ({
                              ...prev,
                              [p]: e.target.value,
                            }))
                          }
                        />
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="flex items-center gap-3">
            <button
              onClick={handlePreview}
              disabled={previewLoading}
              className="px-6 py-2 text-sm font-medium rounded-[var(--r-md)] disabled:opacity-50 transition-colors"
              style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
            >
              {previewLoading ? "Generating preview..." : "Preview Email →"}
            </button>
            <span className="text-xs" style={{ color: "var(--ct-text-muted)" }}>
              Step 1 of 3 — fill the form, then preview before sending
            </span>
          </div>
        </div>
      </ContractLayout>
    );

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 2 — Preview
  // ════════════════════════════════════════════════════════════════════════════
  if (step === 2)
    return (
      <ContractLayout title="Send Confirmation Emails">
        <div className="max-w-3xl">
          <StepBar />

          <div className="rounded-[var(--r-lg)] border overflow-hidden mb-4" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
            {/* Preview header */}
            <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: "var(--ct-border-subtle)" }}>
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--ct-text-primary)" }}>
                  Email Preview
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--ct-text-muted)" }}>
                  Contract #{form.contract_no} — {form.customer_name} — to:{" "}
                  {form.send_to_email || "no recipient set"}
                </p>
              </div>
              <button
                onClick={() => setStep(1)}
                className="text-xs hover:underline"
                style={{ color: "var(--accent-light)" }}
              >
                ← Edit form
              </button>
            </div>

            {/* Email HTML rendered in iframe */}
            <div className="p-4" style={{ background: "var(--ct-canvas)" }}>
              <iframe
                srcDoc={previewHtml}
                className="w-full rounded-[var(--r-md)] border"
                style={{ minHeight: "560px", borderColor: "var(--ct-border-default)", background: "var(--ct-surface)" }}
                title="Email Preview"
              />
            </div>
          </div>

          {/* Summary strip */}
          <div
            className="rounded-[var(--r-lg)] border px-5 py-3 mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs"
            style={{ background: "var(--accent-light-tint)", borderColor: "var(--accent-light)" }}
          >
            {[
              ["Customer", form.customer_name],
              ["Broker", form.broker_name],
              ["Term", form.term ? `${form.term} months` : "—"],
              ["Start Date", form.asap ? "ASAP" : form.start_date || "—"],
            ].map(([label, val]) => (
              <div key={label}>
                <p className="font-medium" style={{ color: "var(--accent-light)" }}>{label}</p>
                <p className="font-semibold" style={{ color: "var(--ct-text-primary)" }}>{val}</p>
              </div>
            ))}
          </div>

          {errors._general && (
            <div className="text-sm px-4 py-2 rounded-[var(--r-md)] mb-4" style={{ background: "var(--danger-light-tint)", color: "var(--danger-light)" }}>
              {errors._general}
            </div>
          )}

          {/* CTAs */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setStep(1);
                set("ap_quote", "");
              }}
              className="px-5 py-2 text-sm rounded-[var(--r-md)] border transition-colors hover:bg-[var(--ct-surface-hover)]"
              style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-secondary)" }}
            >
              ← Back to Form
            </button>
            <button
              onClick={handleSend}
              disabled={sending}
              className="px-6 py-2 text-sm font-medium rounded-[var(--r-md)] disabled:opacity-50 transition-colors"
              style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
            >
              {sending ? "Sending..." : "Send Email →"}
            </button>
            <span className="text-xs" style={{ color: "var(--ct-text-muted)" }}>
              Step 2 of 3 — verify details, then send
            </span>
          </div>
        </div>
      </ContractLayout>
    );

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 3 — Sent confirmation
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <ContractLayout title="Send Confirmation Emails">
      <div className="max-w-3xl">
        <StepBar />

        <div className="rounded-[var(--r-lg)] border px-8 py-10 text-center" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "var(--success-light-tint)" }}>
            <span className="text-xl font-bold" style={{ color: "var(--success-light)" }}>✓</span>
          </div>
          <h2 className="text-lg font-semibold mb-1" style={{ color: "var(--ct-text-primary)" }}>
            Confirmation Sent
          </h2>
          <p className="text-sm mb-1" style={{ color: "var(--ct-text-muted)" }}>
            Contract{" "}
            <span className="font-medium" style={{ color: "var(--ct-text-secondary)" }}>
              #{sentResult?.contract_no}
            </span>{" "}
            confirmation saved.
          </p>
          <p className="text-sm mb-1" style={{ color: "var(--ct-text-muted)" }}>
            Email sent to:{" "}
            <span className="font-medium" style={{ color: "var(--ct-text-secondary)" }}>
              {form.broker_name}
            </span>{" "}
            <span style={{ color: "var(--ct-text-muted)" }}>
              &lt;{form.send_to_email}&gt;
            </span>
          </p>
          <p className="text-xs mb-6" style={{ color: "var(--ct-text-muted)" }}>
            Record ID: {sentResult?.sid}
          </p>

          <div className="flex justify-center gap-3">
            <button
              onClick={handleStartOver}
              className="px-5 py-2 text-sm rounded-[var(--r-md)] transition-colors"
              style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
            >
              Send Another Confirmation
            </button>
            <button
              onClick={() => (window.location.href = "/contracts/view")}
              className="px-5 py-2 text-sm rounded-[var(--r-md)] border transition-colors hover:bg-[var(--ct-surface-hover)]"
              style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-secondary)" }}
            >
              View All Confirmations
            </button>
          </div>
        </div>
      </div>
    </ContractLayout>
  );
}
