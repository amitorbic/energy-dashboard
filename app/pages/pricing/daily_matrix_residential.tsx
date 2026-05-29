import React, { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import DailyMatrixTable from "../../components/pricing/DailyMatrixTable";
import api, { exportMatrixExcel } from "../../utils/api";

interface EmailBroker {
  sid: number;
  broker_code: string;
  company_name: string;
}
const DailyMatrixResidential = () => {
  const [currentTime, setCurrentTime] = useState<string>("");
  const [terms, setTerms] = useState([6, 12, 18, 24]);
  const [termsInput, setTermsInput] = useState("6,12,18,24");
  const [termsError, setTermsError] = useState("");
  const [priceType, setPriceType] = useState("residential");
  const [startMonths, setStartMonths] = useState([
    { label: "Apr-26", value: "2026-04-01" },
    { label: "May-26", value: "2026-05-01" },
    { label: "Jun-26", value: "2026-06-01" },
    { label: "Jul-26", value: "2026-07-01" },
    { label: "Aug-26", value: "2026-08-01" },
    { label: "Sep-26", value: "2026-09-01" },
  ]);
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
      const value = d.toISOString().slice(0, 10);
      months.push({ label, value });
    }
    setStartMonths(months);
  };

  const isSweetspot = priceType === "sweetspot_residential";
  const handleExport = async () => {
    try {
      // Pass 'priceType' here (e.g., "residential")
      const res = await exportMatrixExcel(
        startDateInput,
        terms,
        numMonths,
        priceType,
      );

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `Residential_Matrix_${startDateInput}.xlsx`,
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export Error:", err);
    }
  };

  return (
    <Layout title="Residential Pricing Matrix">
      <div className="max-w-7xl mx-auto p-6 space-y-8">
        <header className="flex justify-between items-end border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-3xl font-black text-white uppercase tracking-tighter">
              Residential Matrix
            </h1>
            <p className="text-slate-500 font-mono text-sm uppercase">
              Run Time: {currentTime || "Initializing..."}
            </p>
          </div>
        </header>

        <div className="bg-slate-800 rounded-lg p-5 flex flex-wrap gap-6 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-slate-400 text-xs uppercase font-bold">
              Price Type
            </label>
            <select
              value={priceType}
              onChange={(e) => setPriceType(e.target.value)}
              className="bg-slate-700 text-white px-3 py-2 rounded text-sm border border-slate-600 focus:outline-none focus:border-red-500"
            >
              <option value="residential">Residential</option>
              <option value="sweetspot_residential">Sweet Spot</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-slate-400 text-xs uppercase font-bold">
              Start Date
            </label>
            <input
              type="date"
              value={startDateInput}
              onChange={(e) => setStartDateInput(e.target.value)}
              className="bg-slate-700 text-white px-3 py-2 rounded text-sm border border-slate-600 focus:outline-none focus:border-red-500"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-slate-400 text-xs uppercase font-bold">
              Months to Show
            </label>
            <input
              type="number"
              min={1}
              max={24}
              value={numMonths}
              onChange={(e) => setNumMonths(parseInt(e.target.value))}
              className="bg-slate-700 text-white px-3 py-2 rounded text-sm border border-slate-600 w-24 focus:outline-none focus:border-red-500"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-slate-400 text-xs uppercase font-bold">
              Terms (comma separated, max 6)
            </label>
            <input
              type="text"
              value={isSweetspot ? "Auto" : termsInput}
              onChange={(e) => setTermsInput(e.target.value)}
              disabled={isSweetspot}
              className={`bg-slate-700 text-white px-3 py-2 rounded text-sm border border-slate-600 w-48 focus:outline-none focus:border-red-500 ${isSweetspot ? "opacity-50 cursor-not-allowed" : ""}`}
            />
            {termsError && (
              <span className="text-red-400 text-xs">{termsError}</span>
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
            className="bg-slate-600 hover:bg-slate-500 text-white px-6 py-2 rounded text-sm font-bold uppercase transition-colors"
          >
            Sweet Spot
          </button>

          <button
            onClick={applySettings}
            className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded text-sm font-bold uppercase transition-colors"
          >
            Apply
          </button>
          <button
            onClick={handleExport}
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded text-sm font-bold uppercase transition-colors flex items-center gap-2"
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
            className="bg-slate-600 hover:bg-slate-500 text-white px-6 py-2 rounded text-sm font-bold uppercase transition-colors"
          >
            Send Email
          </button>
        </div>
        {showEmailModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-slate-800 rounded-lg w-full max-w-lg mx-4 space-y-4 p-6">
              <div className="flex justify-between items-center">
                <h2 className="text-white font-bold uppercase">
                  Send Pricing Email
                </h2>
                <button
                  onClick={() => {
                    setShowEmailModal(false);
                    setSendResult(null);
                  }}
                  className="text-slate-400 hover:text-white text-xl"
                >
                  ✕
                </button>
              </div>

              {/* Broker type toggle */}
              <div className="flex gap-4">
                {(["regular", "irregular"] as const).map((type) => (
                  <label
                    key={type}
                    className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer"
                  >
                    <input
                      type="radio"
                      checked={emailBrokerType === type}
                      onChange={() => {
                        setEmailBrokerType(type);
                        loadEmailBrokers(type);
                      }}
                      className="accent-red-500"
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
                    className={`flex items-center gap-3 p-3 rounded cursor-pointer transition-colors ${
                      selectedEmailBrokers.includes(b.sid)
                        ? "bg-red-900/40 border border-red-500"
                        : "bg-slate-700 hover:bg-slate-600"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedEmailBrokers.includes(b.sid)}
                      onChange={() => {}}
                      className="accent-red-500 w-4 h-4"
                    />
                    <div>
                      <p className="text-white text-sm font-semibold">
                        {b.company_name}
                      </p>
                      <p className="text-slate-400 text-xs font-mono">
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
                    <p className="text-green-400 text-xs">
                      ✓ Sent to: {sendResult.sent.join(", ")}
                    </p>
                  )}
                  {sendResult.failed.length > 0 && (
                    <p className="text-red-400 text-xs">
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
                  className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded text-sm font-bold uppercase disabled:opacity-50"
                >
                  {sending
                    ? "Sending..."
                    : `Send to ${selectedEmailBrokers.length} Broker${selectedEmailBrokers.length !== 1 ? "s" : ""}`}
                </button>
              </div>
            </div>
          </div>
        )}

        {startMonths.map((month) => (
          <DailyMatrixTable
            key={`${month.value}-${priceType}`}
            startMonthLabel={month.label}
            startDate={month.value}
            terms={terms}
            priceType={priceType}
          />
        ))}
      </div>
    </Layout>
  );
};

export default DailyMatrixResidential;
