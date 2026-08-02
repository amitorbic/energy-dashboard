import React, { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import DailyMatrixTable from "../../components/pricing/DailyMatrixTable";

const DailyMatrixPage = () => {
  const [currentTime, setCurrentTime] = useState<string>("");
  const [terms, setTerms] = useState([6, 12, 18, 24]);
  const [termsInput, setTermsInput] = useState("6,12,18,24");
  const [termsError, setTermsError] = useState("");
  const [priceType, setPriceType] = useState("commercial");
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

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Regenerate startMonths from startDateInput and numMonths
  const applySettings = () => {
    // Validate terms
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

    // Generate start months
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

  return (
    <Layout title="Daily Pricing Matrix">
      <div className="max-w-7xl mx-auto p-6 space-y-8">
        <header
          className="flex justify-between items-end border-b pb-6"
          style={{ borderColor: "var(--ct-border-default)" }}
        >
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tighter" style={{ color: "var(--ct-text-primary)" }}>
              Daily Matrix
            </h1>
            <p className="font-mono text-sm uppercase" style={{ color: "var(--ct-text-muted)" }}>
              Run Time: {currentTime || "Initializing..."}
            </p>
          </div>
          <div className="flex gap-2">
            {terms.map((t) => (
              <span
                key={t}
                className="px-3 py-1 rounded-[var(--r-md)] text-xs font-bold uppercase"
                style={{ background: "var(--accent-light-tint)", color: "var(--accent-light)" }}
              >
                {t} MO
              </span>
            ))}
          </div>
        </header>

        {/* Controls */}
        <div
          className="rounded-[var(--r-lg)] p-5 flex flex-wrap gap-6 items-end border"
          style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}
        >
          {/* Start Date */}
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

          {/* Number of months to show */}
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

          {/* Terms */}
          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase font-bold" style={{ color: "var(--ct-text-muted)" }}>
              Terms (comma separated, max 6)
            </label>
            <input
              type="text"
              value={priceType === "sweetspot" ? "Auto" : termsInput}
              onChange={(e) => setTermsInput(e.target.value)}
              disabled={priceType === "sweetspot"}
              placeholder="e.g. 6,12,18,24,36"
              className={`px-3 py-2 rounded-[var(--r-md)] text-sm w-48 border focus:outline-none focus:border-[var(--accent-light)] ${priceType === "sweetspot" ? "opacity-50 cursor-not-allowed" : ""}`}
              style={{ background: "var(--ct-canvas)", color: "var(--ct-text-primary)", borderColor: "var(--ct-border-default)" }}
            />
            {termsError && (
              <span className="text-xs" style={{ color: "var(--danger-light)" }}>{termsError}</span>
            )}
          </div>

          {/* Price Type */}
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
              <option value="residential">Residential</option>
              <option value="sweetspot">Sweet Spot</option>
            </select>
          </div>

          {/* Apply Button */}
          <button
            onClick={applySettings}
            className="px-6 py-2 rounded-[var(--r-md)] text-sm font-bold uppercase transition-colors"
            style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
          >
            Apply
          </button>
        </div>

        {/* Tables */}
        {startMonths.map((month) => (
          <DailyMatrixTable
            key={month.value}
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

export default DailyMatrixPage;
