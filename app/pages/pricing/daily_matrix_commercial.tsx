import React, { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import DailyMatrixTable from "../../components/pricing/DailyMatrixTable";
import api, { exportMatrixExcel } from "../../utils/api";

interface EmailBroker {
  sid: number;
  broker_code: string;
  company_name: string;
}

const secondaryBtnCls =
  "px-6 py-2 rounded text-sm font-bold uppercase transition-colors border";
const secondaryBtnStyle = {
  background: "var(--ct-surface)",
  borderColor: "var(--ct-border-default)",
  color: "var(--ct-text-primary)",
};

const DailyMatrixCommercial = () => {
  const [currentTime, setCurrentTime] = useState<string>(
    new Date().toLocaleDateString("en-CA"),
  );
  const [terms, setTerms] = useState([6, 12, 18, 24]);
  const [termsInput, setTermsInput] = useState("6,12,18,24");
  const [termsError, setTermsError] = useState("");
  const [priceType, setPriceType] = useState("commercial");
  const [startMonths, setStartMonths] = useState<
    { label: string; value: string }[]
  >([]);
  const [startDateInput, setStartDateInput] = useState("2026-04-01");
  const [numMonths, setNumMonths] = useState(6);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailBrokers, setEmailBrokers] = useState<
    { sid: number; broker_code: string; company_name: string }[]
  >([]);
  const [selectedEmailBrokers, setSelectedEmailBrokers] = useState<number[]>(
    [],
  );
  const [emailBrokerType, setEmailBrokerType] = useState<
    "regular" | "irregular"
  >("regular");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{
    sent: string[];
    failed: string[];
  } | null>(null);

  const loadEmailBrokers = async (type: "regular" | "irregular") => {
    const res = await api.get(`/email/brokers/${type}`);
    setEmailBrokers(res.data);
    if (type === "regular")
      setSelectedEmailBrokers(res.data.map((b: EmailBroker) => b.sid));
    else setSelectedEmailBrokers([]);
  };

  const handleSendEmail = async () => {
    setSending(true);
    try {
      const termList = terms;
      const res = await api.post("/email/daily", {
        broker_ids: selectedEmailBrokers,
        start_date: startMonths[0]?.value,
        terms: termList,
        price_type: priceType,
        num_months: startMonths.length,
      });
      setSendResult(res.data);
    } catch {
      console.error("Send failed");
    }
    setSending(false);
  };

  useEffect(() => {
    const timer = setInterval(
      () => setCurrentTime(new Date().toLocaleTimeString()),
      1000,
    );
    return () => clearInterval(timer);
  }, []);

  const applySettings = () => {
    const parsed = termsInput
      .split(",")
      .map((t) => parseInt(t.trim()))
      .filter((t) => !isNaN(t));
    if (parsed.length === 0 || parsed.length > 6) {
      setTermsError("Enter 1–6 comma-separated numbers");
      return;
    }
    setTermsError("");
    setTerms(parsed);

    const months = [];
    const base = new Date(startDateInput);
    for (let i = 0; i < numMonths; i++) {
      const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
      const label = d.toLocaleDateString("en-US", {
        month: "short",
        year: "2-digit",
      });

      // FIX: Use local date formatting instead of toISOString()
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const value = `${year}-${month}-${day}`;

      months.push({ label, value });
    }
    setStartMonths(months);
  };

  const isSweetspot = priceType === "sweetspot_commercial";
  const handleExport = async () => {
    try {
      // 1. Call the API helper we added to api.ts
      // Add priceType as the 4th argument
      const res = await exportMatrixExcel(
        startDateInput,
        terms,
        numMonths,
        priceType,
      );

      // 2. Create the download link for the Blob (binary data)
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `ORBIC_Matrix_${startDateInput}.xlsx`);
      document.body.appendChild(link);
      link.click();

      // 3. Clean up the memory
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export Error:", err);
      alert("Could not generate Excel. Please try again.");
    }
  };

  return (
    <Layout title="Commercial Pricing Matrix">
      <div className="max-w-7xl mx-auto p-6 space-y-8">
        <header
          className="flex justify-between items-end border-b pb-6"
          style={{ borderColor: "var(--ct-border-default)" }}
        >
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tighter" style={{ color: "var(--ct-text-primary)" }}>
              Commercial Matrix
            </h1>
            <p className="font-mono text-sm uppercase" style={{ color: "var(--ct-text-muted)" }}>
              Run Time: {currentTime || "Initializing..."}
            </p>
          </div>
        </header>

        <div
          className="rounded-[var(--r-lg)] p-5 flex flex-wrap gap-6 items-end border"
          style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase font-bold" style={{ color: "var(--ct-text-muted)" }}>
              Price Type
            </label>
            <select
              value={priceType}
              onChange={(e) => setPriceType(e.target.value)}
              className="px-3 py-2 rounded-[var(--r-md)] text-sm border focus:outline-none focus:border-[var(--accent-light)]"
              style={{ background: "var(--ct-canvas)", color: "var(--ct-text-primary)", borderColor: "var(--ct-border-default)" }}
            >
              <option value="commercial">Commercial</option>
              <option value="sweetspot_commercial">Sweet Spot</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase font-bold" style={{ color: "var(--ct-text-muted)" }}>
              Start Date
            </label>
            <input
              type="date"
              value={startDateInput}
              onChange={(e) => setStartDateInput(e.target.value)}
              className="px-3 py-2 rounded-[var(--r-md)] text-sm border focus:outline-none focus:border-[var(--accent-light)]"
              style={{ background: "var(--ct-canvas)", color: "var(--ct-text-primary)", borderColor: "var(--ct-border-default)" }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase font-bold" style={{ color: "var(--ct-text-muted)" }}>
              Months to Show
            </label>
            <input
              type="number"
              min={1}
              max={24}
              value={numMonths}
              onChange={(e) => setNumMonths(parseInt(e.target.value))}
              className="px-3 py-2 rounded-[var(--r-md)] text-sm w-24 border focus:outline-none focus:border-[var(--accent-light)]"
              style={{ background: "var(--ct-canvas)", color: "var(--ct-text-primary)", borderColor: "var(--ct-border-default)" }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase font-bold" style={{ color: "var(--ct-text-muted)" }}>
              Terms (comma separated, max 6)
            </label>
            <input
              type="text"
              value={isSweetspot ? "Auto" : termsInput}
              onChange={(e) => setTermsInput(e.target.value)}
              disabled={isSweetspot}
              className={`px-3 py-2 rounded-[var(--r-md)] text-sm w-48 border focus:outline-none focus:border-[var(--accent-light)] ${isSweetspot ? "opacity-50 cursor-not-allowed" : ""}`}
              style={{ background: "var(--ct-canvas)", color: "var(--ct-text-primary)", borderColor: "var(--ct-border-default)" }}
            />
            {termsError && (
              <span className="text-xs" style={{ color: "var(--danger-light)" }}>{termsError}</span>
            )}
          </div>
          <button
            onClick={() => {
              setPriceType(
                priceType === "residential"
                  ? "sweetspot_residential"
                  : "sweetspot_commercial",
              );
              applySettings();
            }}
            className={secondaryBtnCls}
            style={secondaryBtnStyle}
          >
            Sweet Spot
          </button>

          <button
            onClick={applySettings}
            className="px-6 py-2 rounded text-sm font-bold uppercase transition-colors"
            style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
          >
            Apply
          </button>
          <button
            onClick={handleExport}
            className={`${secondaryBtnCls} flex items-center gap-2`}
            style={secondaryBtnStyle}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Export Excel
          </button>
          <button
            onClick={() => {
              setShowEmailModal(true);
              loadEmailBrokers("regular");
            }}
            className={secondaryBtnCls}
            style={secondaryBtnStyle}
          >
            Send Email
          </button>
        </div>
        {showEmailModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div
              className="rounded-[var(--r-lg)] w-full max-w-lg mx-4 space-y-4 p-6 border"
              style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)", boxShadow: "var(--shadow-content)" }}
            >
              <div className="flex justify-between items-center">
                <h2 className="font-bold uppercase" style={{ color: "var(--ct-text-primary)" }}>
                  Send Pricing Email
                </h2>
                <button
                  onClick={() => {
                    setShowEmailModal(false);
                    setSendResult(null);
                  }}
                  className="text-xl transition-colors"
                  style={{ color: "var(--ct-text-muted)" }}
                >
                  ✕
                </button>
              </div>

              {/* Broker type toggle */}
              <div className="flex gap-4">
                {(["regular", "irregular"] as const).map((type) => (
                  <label
                    key={type}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                    style={{ color: "var(--ct-text-secondary)" }}
                  >
                    <input
                      type="radio"
                      checked={emailBrokerType === type}
                      onChange={() => {
                        setEmailBrokerType(type);
                        loadEmailBrokers(type);
                      }}
                      style={{ accentColor: "var(--accent-light)" }}
                    />
                    {type.charAt(0).toUpperCase() + type.slice(1)} Brokers
                  </label>
                ))}
              </div>

              {/* Broker list */}
              <div className="max-h-64 overflow-y-auto space-y-2">
                {emailBrokers.map((b) => (
                  <div
                    key={b.sid}
                    onClick={() =>
                      setSelectedEmailBrokers((prev) =>
                        prev.includes(b.sid)
                          ? prev.filter((id) => id !== b.sid)
                          : [...prev, b.sid],
                      )
                    }
                    className="flex items-center gap-3 p-3 rounded-[var(--r-md)] cursor-pointer transition-colors border"
                    style={
                      selectedEmailBrokers.includes(b.sid)
                        ? { background: "var(--accent-light-tint)", borderColor: "var(--accent-light)" }
                        : { background: "var(--ct-canvas)", borderColor: "var(--ct-border-default)" }
                    }
                  >
                    <input
                      type="checkbox"
                      checked={selectedEmailBrokers.includes(b.sid)}
                      onChange={() => {}}
                      className="w-4 h-4"
                      style={{ accentColor: "var(--accent-light)" }}
                    />
                    <div>
                      <p className="text-sm font-semibold" style={{ color: "var(--ct-text-primary)" }}>
                        {b.company_name}
                      </p>
                      <p className="text-xs font-mono" style={{ color: "var(--ct-text-muted)" }}>
                        {b.broker_code}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Send result */}
              {sendResult && (
                <div className="space-y-2">
                  {sendResult.sent.length > 0 && (
                    <p className="text-xs" style={{ color: "var(--success-light)" }}>
                      ✓ Sent to: {sendResult.sent.join(", ")}
                    </p>
                  )}
                  {sendResult.failed.length > 0 && (
                    <p className="text-xs" style={{ color: "var(--danger-light)" }}>
                      ✗ Failed: {sendResult.failed.join(", ")}
                    </p>
                  )}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleSendEmail}
                  disabled={
                    sending ||
                    selectedEmailBrokers.length === 0 ||
                    startMonths.length === 0
                  }
                  className="px-6 py-2 rounded text-sm font-bold uppercase disabled:opacity-50"
                  style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
                >
                  {sending
                    ? "Sending..."
                    : `Send to ${selectedEmailBrokers.length} Broker${selectedEmailBrokers.length !== 1 ? "s" : ""}`}
                </button>
              </div>
            </div>
          </div>
        )}

        {startMonths.length === 0 ? (
          <div className="text-center py-20 italic" style={{ color: "var(--ct-text-muted)" }}>
            Select options above and click Apply to generate the matrix.
          </div>
        ) : (
          startMonths.map((month) => (
            <DailyMatrixTable
              key={`${month.value}-${priceType}`}
              startMonthLabel={month.label}
              startDate={month.value}
              terms={terms}
              priceType={priceType}
            />
          ))
        )}
      </div>
    </Layout>
  );
};

export default DailyMatrixCommercial;
