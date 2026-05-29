"use client";
import { useEffect, useState } from "react";
import ContractLayout from "../../components/ContractLayout";
import { useRouter } from "next/router";
import api from "../../utils/api";

const INPUT =
  "w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-sky-400";
const LABEL = "text-sm font-medium text-gray-600 text-right pr-2";
const ERR = "text-red-500 text-xs mt-0.5";

interface Broker {
  sid: number;
  broker_code: string;
  company_name: string;
  broker_name: string;
  confirmation_email: string | null;
  split: string | null;
}

interface FormOptions {
  contract_no: string;
  brokers: Broker[];
  users: { uid: number; name: string }[];
}

type Step = 1 | 2 | 3;

export default function SendLMPConfirmationPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [opts, setOpts] = useState<FormOptions | null>(null);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentResult, setSentResult] = useState<{
    contract_no: string;
    sid: number;
  } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState<Record<string, any>>({
    contract_no: "",
    type_of_contract: "new",
    uid: "",
    customer_name: "",
    broker_code: "",
    broker_name: "",
    esid_count: "",
    esiid: "",
    contract_rate: "", // mills e.g. 3.5
    ap_quote: "", // mills e.g. 3.0
    comment: "",
    comment_mail: "",
    start_date: "",
    asap: false,
    meter_read: false,
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
    sent_by: "",
    lmp: 1, // always 1 for LMP page
    term: "Month to Month",
  });

  useEffect(() => {
    api.get("/contracts/form-options").then((r) => {
      setOpts(r.data);
      setForm((f) => ({ ...f, contract_no: r.data.contract_no }));
    });
  }, []);

  // Pre-fill for edit
  useEffect(() => {
    const { sid } = router.query;
    if (!sid || !opts) return;
    api.get(`/contracts/${sid}`).then((r) => {
      const d = r.data;
      setForm((f) => ({
        ...f,
        ...d,
        lmp: 1,
        term: "Month to Month",
        asap: !d.start_date || d.start_date === "ASAP",
        credit_status: !!d.credit_status,
        contract_received: !!d.contract_received,
        executed: !!d.executed,
        forwarded: !!d.forwarded,
        paper_bill: !!d.paper_bill,
      }));
    });
  }, [router.query.sid, opts]);

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const handleBrokerChange = (broker_code: string) => {
    const broker = opts?.brokers.find((b) => b.broker_code === broker_code);
    set("broker_code", broker_code);
    set("broker_name", broker?.company_name || "");
    set("send_to_email", broker?.confirmation_email || "");
    set("broker_split", broker?.split || "");
  };

  // Commission = contract_rate - ap_quote (in mills, displayed as $/kWh)
  const commission = () => {
    const cr = parseFloat(form.contract_rate);
    const aq = parseFloat(form.ap_quote);
    if (!isNaN(cr) && !isNaN(aq)) return (cr - aq).toFixed(1);
    return "—";
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.customer_name) e.customer_name = "Customer name required";
    if (!form.broker_code) e.broker_code = "Select a broker";
    if (!form.contract_rate) e.contract_rate = "Contract rate required";
    if (!form.ap_quote) e.ap_quote = "Company quote required";
    if (!form.esid_count) e.esid_count = "Number of ESIIDs required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const buildPayload = () => ({
    ...form,
    lmp: 1,
    term: "Month to Month",
    start_date: form.asap
      ? new Date().toISOString().split("T")[0]
      : form.start_date,
    volumes: "{}",
    total_volume: "0",
    profiles_display: "",
    // Pass commission so email template can use it directly
    lmp_commission: commission(),
  });

  const handlePreview = async () => {
    if (!validate()) return;
    setPreviewLoading(true);
    try {
      const r = await api.post("/contracts/preview-lmp-html", buildPayload());
      setPreviewHtml(r.data.html);
      setStep(2);
    } catch {
      setErrors((e) => ({ ...e, _general: "Failed to generate preview." }));
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSend = async () => {
    setSending(true);
    try {
      const r = await api.post("/contracts/send-email", buildPayload());
      setSentResult({ contract_no: form.contract_no, sid: r.data.sid });
      setStep(3);
    } catch {
      setErrors({ _general: "Send failed. Please try again." });
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

  const row = (label: string, content: React.ReactNode, errKey?: string) => (
    <div className="grid grid-cols-[220px_1fr] items-start gap-2 py-1.5">
      <span className={LABEL}>{label}</span>
      <div>
        {content}
        {errKey && errors[errKey] && <p className={ERR}>{errors[errKey]}</p>}
      </div>
    </div>
  );

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
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium
            ${step === n ? "bg-sky-600 text-white" : step > n ? "bg-green-600 text-white" : "bg-gray-100 text-gray-400"}`}
          >
            <span
              className={`w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold
              ${step === n ? "bg-white text-sky-600" : step > n ? "bg-white text-green-600" : "bg-gray-300 text-gray-500"}`}
            >
              {step > n ? "✓" : n}
            </span>
            {label}
          </div>
          {i < 2 && (
            <div
              className={`w-8 h-0.5 ${step > n ? "bg-green-400" : "bg-gray-200"}`}
            />
          )}
        </div>
      ))}
    </div>
  );

  if (!opts)
    return (
      <ContractLayout title="Send LMP Confirmation Emails">
        <div className="text-sm text-gray-500 p-8">Loading...</div>
      </ContractLayout>
    );

  // ── STEP 1 ────────────────────────────────────────────────────────────────
  if (step === 1)
    return (
      <ContractLayout title="Send LMP Confirmation Emails">
        <div className="max-w-3xl">
          <StepBar />

          {/* LMP badge */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs bg-purple-100 text-purple-700 px-3 py-1 rounded font-medium">
              LMP Contract — Month to Month — Fixed Spread
            </span>
          </div>

          {errors._general && (
            <div className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded mb-4">
              {errors._general}
            </div>
          )}

          {/* Contract Details */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
              Contract Details
            </h2>

            {row(
              "Type of Contract",
              <select
                className={INPUT}
                value={form.type_of_contract}
                onChange={(e) => set("type_of_contract", e.target.value)}
              >
                <option value="new">New</option>
                <option value="renewal">Renewal</option>
              </select>,
            )}

            {row(
              "Deal Person",
              <select
                className={INPUT}
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
            )}

            {row(
              "Contract Number",
              <input
                className={INPUT}
                value={form.contract_no}
                onChange={(e) => set("contract_no", e.target.value)}
              />,
            )}

            {row(
              "Customer Name",
              <input
                className={INPUT}
                value={form.customer_name}
                onChange={(e) => set("customer_name", e.target.value)}
                placeholder="Enter customer name"
              />,
              "customer_name",
            )}

            {row(
              "Term",
              <input className={INPUT} value="Month to Month" disabled />,
            )}

            {row(
              "Number of ESIIDs",
              <input
                className={INPUT}
                type="number"
                value={form.esid_count}
                onChange={(e) => set("esid_count", e.target.value)}
              />,
              "esid_count",
            )}

            {row(
              "Broker",
              <select
                className={INPUT}
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
                className={INPUT}
                value={form.sent_by}
                onChange={(e) => set("sent_by", e.target.value)}
                placeholder="AmeriPower contract confirm..."
              />,
            )}
          </div>

          {/* LMP Rates */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
              LMP Rates (mills)
            </h2>

            {row(
              "Contract Rate (mills)",
              <div>
                <input
                  className={INPUT}
                  type="number"
                  step="0.1"
                  value={form.contract_rate}
                  onChange={(e) => set("contract_rate", e.target.value)}
                  placeholder="e.g. 3.5 → LMP + 0.035"
                />
                {form.contract_rate && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Displays as: LMP +{" "}
                    {(parseFloat(form.contract_rate) / 100).toFixed(3)}
                  </p>
                )}
              </div>,
              "contract_rate",
            )}

            {row(
              "Company Quote (mills)",
              <div>
                <input
                  className={INPUT}
                  type="number"
                  step="0.1"
                  value={form.ap_quote}
                  onChange={(e) => set("ap_quote", e.target.value)}
                  placeholder="e.g. 3.0 → LMP + 0.030"
                />
                {form.ap_quote && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Displays as: LMP +{" "}
                    {(parseFloat(form.ap_quote) / 100).toFixed(3)}
                  </p>
                )}
              </div>,
              "ap_quote",
            )}

            {/* Live commission preview */}
            {form.contract_rate && form.ap_quote && (
              <div className="grid grid-cols-[220px_1fr] items-start gap-2 py-1.5">
                <span className={LABEL}>Commission</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-green-700">
                    {commission()} mills ={" "}
                    {(
                      (parseFloat(form.contract_rate) -
                        parseFloat(form.ap_quote)) /
                      100
                    ).toFixed(4)}{" "}
                    $/kWh
                  </span>
                </div>
              </div>
            )}

            {row(
              "Comments",
              <textarea
                className={INPUT}
                rows={3}
                value={form.comment}
                onChange={(e) => set("comment", e.target.value)}
              />,
            )}
          </div>

          {/* Dates & Flags */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
              Dates & Flags
            </h2>

            {row(
              "Start Date",
              <div className="flex items-center gap-4">
                <input
                  className={`${INPUT} w-40`}
                  type="date"
                  value={form.start_date}
                  disabled={form.asap}
                  onChange={(e) => set("start_date", e.target.value)}
                />
                <label className="flex items-center gap-1.5 text-sm text-gray-600">
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
                <label className="flex items-center gap-1.5 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={form.meter_read}
                    onChange={(e) => set("meter_read", e.target.checked)}
                  />
                  Meter read
                </label>
              </div>,
            )}

            <div className="grid grid-cols-2 gap-x-8 gap-y-2 mt-3 ml-4">
              {(
                [
                  ["credit_status", "Credit status"],
                  ["contract_received", "Contract received / signed"],
                  ["executed", "Executed"],
                  ["forwarded", "Forwarded for enrollment"],
                ] as [string, string][]
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center gap-2 text-sm text-gray-600"
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
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
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
                    className="flex items-center gap-2 text-sm text-gray-600"
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
          <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
              Customer & Billing
            </h2>

            {row(
              "ESIID(s)",
              <textarea
                className={INPUT}
                rows={2}
                value={form.esiid}
                onChange={(e) => set("esiid", e.target.value)}
                placeholder="One per line or comma-separated"
              />,
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
                className={INPUT}
                type="email"
                value={form.customer_email}
                onChange={(e) => set("customer_email", e.target.value)}
              />,
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
                    className="flex items-center gap-2 text-sm text-gray-600"
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
                className={`${INPUT} w-48`}
                value={form.meter_fees}
                onChange={(e) => set("meter_fees", e.target.value)}
                placeholder="ex. 5.00, 7.00, 10.00"
              />,
            )}

            {row(
              "Comments / Notes",
              <textarea
                className={INPUT}
                rows={2}
                value={form.comment_mail}
                onChange={(e) => set("comment_mail", e.target.value)}
              />,
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handlePreview}
              disabled={previewLoading}
              className="px-6 py-2 text-sm font-medium rounded bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {previewLoading ? "Generating preview..." : "Preview Email →"}
            </button>
            <span className="text-xs text-gray-400">Step 1 of 3</span>
          </div>
        </div>
      </ContractLayout>
    );

  // ── STEP 2 ────────────────────────────────────────────────────────────────
  if (step === 2)
    return (
      <ContractLayout title="Send LMP Confirmation Emails">
        <div className="max-w-3xl">
          <StepBar />

          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-4">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800">
                  Email Preview — LMP Contract
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Contract #{form.contract_no} — {form.customer_name}
                </p>
              </div>
              <button
                onClick={() => setStep(1)}
                className="text-xs text-sky-600 hover:underline"
              >
                ← Edit form
              </button>
            </div>
            <div className="p-4 bg-gray-50">
              <iframe
                srcDoc={previewHtml}
                className="w-full rounded border border-gray-200 bg-white"
                style={{ minHeight: "520px" }}
                title="LMP Email Preview"
              />
            </div>
          </div>

          {/* Rate summary strip */}
          <div className="bg-purple-50 border border-purple-100 rounded-lg px-5 py-3 mb-4 grid grid-cols-3 gap-3 text-xs">
            {[
              [
                "Contract Rate",
                `LMP + ${(parseFloat(form.contract_rate || "0") / 100).toFixed(3)}`,
              ],
              [
                "Company Quote",
                `LMP + ${(parseFloat(form.ap_quote || "0") / 100).toFixed(3)}`,
              ],
              ["Commission", `${commission()} mills`],
            ].map(([label, val]) => (
              <div key={label}>
                <p className="text-purple-400 font-medium">{label}</p>
                <p className="text-purple-800 font-semibold">{val}</p>
              </div>
            ))}
          </div>

          {errors._general && (
            <div className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded mb-4">
              {errors._general}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={() => setStep(1)}
              className="px-5 py-2 text-sm rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
            >
              ← Back to Form
            </button>
            <button
              onClick={handleSend}
              disabled={sending}
              className="px-6 py-2 text-sm font-medium rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
            >
              {sending ? "Sending..." : "Send Email →"}
            </button>
            <span className="text-xs text-gray-400">Step 2 of 3</span>
          </div>
        </div>
      </ContractLayout>
    );

  // ── STEP 3 ────────────────────────────────────────────────────────────────
  return (
    <ContractLayout title="Send LMP Confirmation Emails">
      <div className="max-w-3xl">
        <StepBar />
        <div className="bg-white border border-gray-200 rounded-lg px-8 py-10 text-center">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-green-600 text-xl font-bold">✓</span>
          </div>
          <h2 className="text-lg font-semibold text-gray-800 mb-1">
            LMP Confirmation Sent
          </h2>
          <p className="text-sm text-gray-500 mb-1">
            Contract{" "}
            <span className="font-medium text-gray-700">
              #{sentResult?.contract_no}
            </span>{" "}
            sent successfully.
          </p>
          <p className="text-xs text-gray-400 mb-6">
            Record ID: {sentResult?.sid}
          </p>
          <div className="flex justify-center gap-3">
            <button
              onClick={handleStartOver}
              className="px-5 py-2 text-sm rounded bg-sky-600 text-white hover:bg-sky-700"
            >
              Send Another
            </button>
            <button
              onClick={() => router.push("/contracts/view")}
              className="px-5 py-2 text-sm rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
            >
              View All Confirmations
            </button>
          </div>
        </div>
      </div>
    </ContractLayout>
  );
}
