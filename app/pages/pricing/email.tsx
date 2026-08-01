import React, { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import api from "../../utils/api";

interface Broker {
  sid: number;
  broker_code: string;
  company_name: string;
  daily_pricing_email1: string;
  pricing_email: string;
  mills1: string;
  customer_count?: number;
}

interface MatrixRow {
  zone: string;
  [key: string]: string | number;
}

interface CustomerPreview {
  company: string;
  start_date: string;
  num_esids: number;
  credit_status: string;
  terms: number[];
  prices: Record<string, string>;
}

interface PreviewBroker {
  broker: string;
  broker_code: string;
  mills: string | number;
  terms: number[];
  matrix: MatrixRow[];
  customers: CustomerPreview[];
}

interface MonthData {
  label: string;
  start_date: string;
  matrix: MatrixRow[];
  terms: number[];
}

interface PreviewData {
  type: string;
  price_type?: string;
  months: MonthData[];
  brokers?: PreviewBroker[]; // Fixed name here to match definition
}

const EmailPricingPage = () => {
  const [activeTab, setActiveTab] = useState<"daily" | "custom">("daily");
  const [brokerType, setBrokerType] = useState<"regular" | "irregular">(
    "regular",
  );
  const [priceType, setPriceType] = useState("commercial");
  const [startDate, setStartDate] = useState("");
  const [terms, setTerms] = useState("6,12,18,24");
  const [numMonths, setNumMonths] = useState(6);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [selectedBrokers, setSelectedBrokers] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{
    sent: string[];
    failed: string[];
  } | null>(null);

  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handlePreview = async () => {
    if (selectedBrokers.length === 0) return;
    try {
      const termList = terms
        .split(",")
        .map((t) => parseInt(t.trim()))
        .filter((t) => !isNaN(t));
      const termString = termList.join(",");

      const months = [];
      const base = new Date(startDate);
      for (let i = 0; i < numMonths; i++) {
        const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
        const dateStr = d.toISOString().slice(0, 10);
        const label =
          d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }) +
          " Start";
        months.push({ dateStr, label });
      }

      const monthData = await Promise.all(
        months.map(async (m) => {
          const res = await api.get(
            `/pricing/daily-matrix?start_month=${m.dateStr}&terms=${termString}&price_type=${priceType}`,
          );
          return {
            label: m.label,
            start_date: m.dateStr,
            matrix: res.data as MatrixRow[],
            terms: termList,
          };
        }),
      );

      setPreviewData({
        type: "daily",
        price_type: priceType,
        months: monthData,
      });
    } catch (err) {
      console.error("Preview failed", err);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setSelectedBrokers([]);
      try {
        let endpoint = "";
        if (activeTab === "daily") {
          endpoint =
            brokerType === "regular"
              ? "/email/brokers/regular"
              : "/email/brokers/irregular";
        } else {
          endpoint = "/email/brokers/custom";
        }

        const res = await api.get(endpoint);
        setBrokers(res.data);

        if (activeTab === "daily" && brokerType === "regular") {
          setSelectedBrokers(res.data.map((b: Broker) => b.sid));
        }
      } catch (err) {
        console.error("Failed to load brokers", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [activeTab, brokerType]);

  const toggleBroker = (sid: number) => {
    setSelectedBrokers((prev) =>
      prev.includes(sid) ? prev.filter((id) => id !== sid) : [...prev, sid],
    );
  };

  const selectAll = () => {
    setSelectedBrokers(brokers.map((b) => b.sid));
  };

  const handleSend = async () => {
    if (selectedBrokers.length === 0) return;
    setSending(true);
    setResult(null);
    try {
      const termList = terms
        .split(",")
        .map((t) => parseInt(t.trim()))
        .filter((t) => !isNaN(t));
      let res;
      if (activeTab === "daily") {
        res = await api.post("/email/daily", {
          broker_ids: selectedBrokers,
          start_date: startDate,
          terms: termList,
          price_type: priceType,
          num_months: numMonths,
        });
      } else {
        res = await api.post("/email/custom", {
          broker_ids: selectedBrokers,
          terms: termList,
        });
      }
      setResult(res.data);
    } catch (err) {
      console.error("Send failed", err);
    }
    setSending(false);
  };

  return (
    <Layout title="Email Pricing">
      <div className="max-w-5xl mx-auto p-6 space-y-8">
        <header className="border-b pb-6" style={{ borderColor: "var(--ct-border-subtle)" }}>
          <h1 className="text-3xl font-black uppercase tracking-tighter" style={{ color: "var(--ct-text-primary)" }}>
            Email Pricing
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--ct-text-secondary)" }}>
            Send pricing emails to brokers
          </p>
        </header>

        <div className="flex gap-2 border-b" style={{ borderColor: "var(--ct-border-subtle)" }}>
          {(["daily", "custom"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                setResult(null);
              }}
              className="px-6 py-2 text-sm font-bold uppercase transition-colors border-b-2"
              style={
                activeTab === tab
                  ? { color: "var(--accent-light)", borderColor: "var(--accent-light)" }
                  : { color: "var(--ct-text-muted)", borderColor: "transparent" }
              }
            >
              {tab === "daily" ? "Daily Pricing" : "Custom Pricing"}
            </button>
          ))}
        </div>

        <div className="rounded-[var(--r-lg)] p-6 space-y-4 border" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
          <div className="flex justify-between items-center border-b pb-2" style={{ borderColor: "var(--ct-border-default)" }}>
            <h2 className="font-bold text-sm uppercase" style={{ color: "var(--ct-text-primary)" }}>
              Configuration
            </h2>
            <button
              onClick={handlePreview}
              disabled={selectedBrokers.length === 0}
              className="text-xs font-bold uppercase hover:underline disabled:opacity-50"
              style={{ color: "var(--accent-light)" }}
            >
              Preview Pricing Data
            </button>
          </div>
          {activeTab === "daily" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs uppercase font-bold" style={{ color: "var(--ct-text-muted)" }}>
                    Broker Type
                  </label>
                  <div className="flex gap-4">
                    {(["regular", "irregular"] as const).map((type) => (
                      <label
                        key={type}
                        className="flex items-center gap-2 text-sm cursor-pointer"
                        style={{ color: "var(--ct-text-secondary)" }}
                      >
                        <input
                          type="radio"
                          checked={brokerType === type}
                          onChange={() => setBrokerType(type)}
                          className="accent-[var(--accent-light)]"
                        />
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs uppercase font-bold" style={{ color: "var(--ct-text-muted)" }}>
                    Price Type
                  </label>
                  <select
                    value={priceType}
                    onChange={(e) => setPriceType(e.target.value)}
                    className="px-3 py-2 rounded text-sm border"
                    style={{ background: "var(--ct-canvas)", borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
                  >
                    <option value="commercial">Commercial</option>
                    <option value="residential">Residential</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs uppercase font-bold" style={{ color: "var(--ct-text-muted)" }}>
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="px-3 py-2 rounded text-sm border"
                    style={{ background: "var(--ct-canvas)", borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs uppercase font-bold" style={{ color: "var(--ct-text-muted)" }}>
                    Months to Include
                  </label>
                  <input
                    type="number"
                    value={numMonths}
                    onChange={(e) => setNumMonths(parseInt(e.target.value))}
                    min={1}
                    max={12}
                    className="px-3 py-2 rounded text-sm border"
                    style={{ background: "var(--ct-canvas)", borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs uppercase font-bold" style={{ color: "var(--ct-text-muted)" }}>
                  Terms
                </label>
                <input
                  type="text"
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  placeholder="6,12,18,24"
                  className="px-3 py-2 rounded text-sm border w-48"
                  style={{ background: "var(--ct-canvas)", borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
                />
              </div>
            </>
          )}

          {activeTab === "custom" && (
            <div className="text-sm italic" style={{ color: "var(--ct-text-muted)" }}>
              Terms are automatically calculated per customer based on their
              contract start date.
            </div>
          )}
        </div>

        <div className="rounded-[var(--r-lg)] p-6 space-y-4 border" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
          <div className="flex justify-between items-center border-b pb-2" style={{ borderColor: "var(--ct-border-default)" }}>
            <h2 className="font-bold text-sm uppercase" style={{ color: "var(--ct-text-primary)" }}>
              Select Brokers ({selectedBrokers.length}/{brokers.length}{" "}
              selected)
            </h2>
            <button
              onClick={selectAll}
              className="text-xs font-bold transition-colors"
              style={{ color: "var(--accent-light)" }}
            >
              Select All
            </button>
          </div>

          {loading ? (
            <div className="italic text-sm animate-pulse" style={{ color: "var(--ct-text-muted)" }}>
              Loading brokers...
            </div>
          ) : brokers.length === 0 ? (
            <div className="italic text-sm" style={{ color: "var(--ct-text-muted)" }}>
              No brokers available.
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {brokers.map((b) => (
                <div
                  key={b.sid}
                  onClick={() => toggleBroker(b.sid)}
                  className="flex items-center justify-between p-3 rounded cursor-pointer transition-colors border"
                  style={
                    selectedBrokers.includes(b.sid)
                      ? { background: "var(--accent-light-tint)", borderColor: "var(--accent-light)" }
                      : { background: "var(--ct-canvas)", borderColor: "transparent" }
                  }
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedBrokers.includes(b.sid)}
                      onChange={() => toggleBroker(b.sid)}
                      className="accent-[var(--accent-light)] w-4 h-4"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div>
                      <p className="font-semibold text-sm" style={{ color: "var(--ct-text-primary)" }}>
                        {b.company_name}
                      </p>
                      <p className="text-xs font-mono" style={{ color: "var(--ct-text-muted)" }}>
                        {b.broker_code}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    {activeTab === "daily" && (
                      <p className="text-xs" style={{ color: "var(--ct-text-muted)" }}>
                        {b.daily_pricing_email1}
                      </p>
                    )}
                    {activeTab === "custom" && (
                      <p className="text-xs" style={{ color: "var(--ct-text-muted)" }}>
                        {b.customer_count} customer
                        {b.customer_count !== 1 ? "s" : ""}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-4 items-center">
          <button
            onClick={handleSend}
            disabled={
              sending ||
              selectedBrokers.length === 0 ||
              (activeTab === "daily" && !startDate)
            }
            className="px-8 py-3 rounded text-sm font-bold uppercase transition-colors disabled:opacity-50"
            style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
          >
            {sending
              ? "Sending..."
              : `Send to ${selectedBrokers.length} Broker${selectedBrokers.length !== 1 ? "s" : ""}`}
          </button>

          {activeTab === "daily" && (
            <button
              onClick={handlePreview}
              disabled={selectedBrokers.length === 0 || !startDate}
              className="px-6 py-3 rounded text-sm font-bold uppercase transition-colors disabled:opacity-50 border"
              style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
            >
              Preview Prices
            </button>
          )}

          {sending && (
            <span className="text-sm animate-pulse" style={{ color: "var(--ct-text-muted)" }}>
              Please wait — generating and sending emails...
            </span>
          )}
        </div>

        {previewData && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div
              className="rounded-[var(--r-lg)] w-full max-w-5xl max-h-[90vh] overflow-y-auto mx-4 border shadow-2xl"
              style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}
            >
              <div
                className="flex justify-between items-center p-4 border-b sticky top-0 z-10"
                style={{ borderColor: "var(--ct-border-default)", background: "var(--ct-surface)" }}
              >
                <h2 className="font-bold uppercase" style={{ color: "var(--ct-text-primary)" }}>
                  Preview — Prices to Send
                </h2>
                <button
                  onClick={() => setPreviewData(null)}
                  className="text-xl transition-colors"
                  style={{ color: "var(--ct-text-muted)" }}
                >
                  ✕
                </button>
              </div>

              <div className="p-6 space-y-8">
                {previewData.type === "daily" && (
                  <div className="space-y-6">
                    {previewData.months.map((month: MonthData) => (
                      <div key={month.start_date} className="space-y-2">
                        <span className="font-bold text-sm" style={{ color: "var(--accent-light)" }}>
                          {month.label}
                        </span>
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr style={{ background: "var(--ct-surface-hover)", color: "var(--ct-text-muted)" }}>
                              <th className="p-2 text-left border" style={{ borderColor: "var(--ct-border-subtle)" }}>
                                Zone
                              </th>
                              {(previewData.price_type?.includes("residential")
                                ? ["Residential"]
                                : ["Low", "Medium", "High"]
                              ).map((lf: string) =>
                                month.terms.map((t: number) => (
                                  <th
                                    key={`${lf}-${t}`}
                                    className="p-2 border"
                                    style={{ borderColor: "var(--ct-border-subtle)" }}
                                  >
                                    {lf} {t}mo
                                  </th>
                                )),
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {month.matrix.map((row: MatrixRow) => (
                              <tr
                                key={row.zone}
                                className="border-b hover:bg-[var(--ct-surface-hover)]"
                                style={{ borderColor: "var(--ct-border-subtle)" }}
                              >
                                <td
                                  className="p-2 font-bold border"
                                  style={{ color: "var(--ct-text-primary)", borderColor: "var(--ct-border-subtle)" }}
                                >
                                  {(
                                    {
                                      Coast: "CenterPoint",
                                    } as Record<string, string>
                                  )[row.zone] || row.zone}
                                </td>
                                {(previewData.price_type?.includes(
                                  "residential",
                                )
                                  ? ["Residential"]
                                  : ["Low", "Medium", "High"]
                                ).map((lf: string) =>
                                  month.terms.map((t: number) => (
                                    <td
                                      key={`${lf}-${t}`}
                                      className="p-2 text-center font-mono border"
                                      style={{ color: "var(--ct-text-secondary)", borderColor: "var(--ct-border-subtle)" }}
                                    >
                                      {row[`${lf}_${t}`]}
                                    </td>
                                  )),
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="h-1 rounded" style={{ background: "var(--accent-light)" }}></div>
                      </div>
                    ))}
                  </div>
                )}

                {previewData.type === "custom" &&
                  previewData.brokers?.map((b: PreviewBroker) => (
                    <div key={b.broker_code} className="space-y-3">
                      <h3 className="font-bold" style={{ color: "var(--accent-light)" }}>
                        {b.broker}{" "}
                        <span className="font-mono text-xs ml-2" style={{ color: "var(--ct-text-muted)" }}>
                          {b.broker_code}
                        </span>
                      </h3>
                      {b.customers.length === 0 ? (
                        <p className="italic text-sm" style={{ color: "var(--ct-text-muted)" }}>
                          No customers with pricing data.
                        </p>
                      ) : (
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr style={{ background: "var(--ct-surface-hover)", color: "var(--ct-text-muted)" }}>
                              <th className="p-2 text-left border" style={{ borderColor: "var(--ct-border-subtle)" }}>
                                Company
                              </th>
                              <th className="p-2 border" style={{ borderColor: "var(--ct-border-subtle)" }}>
                                Start
                              </th>
                              <th className="p-2 border" style={{ borderColor: "var(--ct-border-subtle)" }}>
                                ESIDs
                              </th>
                              <th className="p-2 border" style={{ borderColor: "var(--ct-border-subtle)" }}>
                                Credit
                              </th>
                              {b.customers[0]?.terms.map((t: number) => (
                                <th
                                  key={t}
                                  className="p-2 border"
                                  style={{ borderColor: "var(--ct-border-subtle)" }}
                                >
                                  {t}mo
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {b.customers.map((c: CustomerPreview) => (
                              <tr
                                key={c.company}
                                className="border-b hover:bg-[var(--ct-surface-hover)]"
                                style={{ borderColor: "var(--ct-border-subtle)" }}
                              >
                                <td
                                  className="p-2 font-bold border"
                                  style={{ color: "var(--ct-text-primary)", borderColor: "var(--ct-border-subtle)" }}
                                >
                                  {c.company}
                                </td>
                                <td className="p-2 border" style={{ color: "var(--ct-text-secondary)", borderColor: "var(--ct-border-subtle)" }}>
                                  {c.start_date}
                                </td>
                                <td
                                  className="p-2 text-center border"
                                  style={{ color: "var(--ct-text-secondary)", borderColor: "var(--ct-border-subtle)" }}
                                >
                                  {c.num_esids}
                                </td>
                                <td className="p-2 border" style={{ color: "var(--ct-text-secondary)", borderColor: "var(--ct-border-subtle)" }}>
                                  {c.credit_status}
                                </td>
                                {c.terms.map((t: number) => (
                                  <td
                                    key={t}
                                    className="p-2 text-center font-mono border"
                                    style={{ color: "var(--ct-text-secondary)", borderColor: "var(--ct-border-subtle)" }}
                                  >
                                    {c.prices[String(t)] ?? "N/A"}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  ))}
              </div>

              <div
                className="p-4 border-t sticky bottom-0 flex gap-3"
                style={{ borderColor: "var(--ct-border-default)", background: "var(--ct-surface)" }}
              >
                <button
                  onClick={() => {
                    setPreviewData(null);
                    handleSend();
                  }}
                  className="px-6 py-2 rounded text-sm font-bold uppercase"
                  style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
                >
                  Looks Good — Send Now
                </button>
                <button
                  onClick={() => setPreviewData(null)}
                  className="px-6 py-2 rounded text-sm font-bold uppercase border"
                  style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {preview && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="rounded-[var(--r-lg)] w-full max-w-3xl max-h-screen overflow-y-auto mx-4" style={{ background: "var(--ct-surface)" }}>
              <div
                className="flex justify-between items-center p-4 border-b sticky top-0"
                style={{ borderColor: "var(--ct-border-default)", background: "var(--ct-surface)" }}
              >
                <h2 className="font-bold" style={{ color: "var(--ct-text-primary)" }}>Email Preview</h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => window.print()}
                    className="px-4 py-1.5 rounded text-sm font-bold border"
                    style={{ background: "var(--ct-canvas)", borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
                  >
                    Print
                  </button>
                  <button
                    onClick={() => setPreview(null)}
                    className="px-4 py-1.5 rounded text-sm font-bold"
                    style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
                  >
                    Close
                  </button>
                </div>
              </div>
              <div
                className="p-4"
                dangerouslySetInnerHTML={{ __html: preview }}
              />
            </div>
          </div>
        )}

        {result && (
          <div className="rounded-[var(--r-lg)] p-6 space-y-4 border" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
            <h2 className="font-bold text-sm uppercase border-b pb-2" style={{ color: "var(--ct-text-primary)", borderColor: "var(--ct-border-default)" }}>
              Send Results
            </h2>
            {result.sent.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase mb-2" style={{ color: "var(--success-light)" }}>
                  ✓ Sent ({result.sent.length})
                </p>
                {result.sent.map((name) => (
                  <p key={name} className="text-sm" style={{ color: "var(--ct-text-secondary)" }}>
                    • {name}
                  </p>
                ))}
              </div>
            )}
            {result.failed.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase mb-2" style={{ color: "var(--danger-light)" }}>
                  ✗ Failed ({result.failed.length})
                </p>
                {result.failed.map((msg) => (
                  <p key={msg} className="text-sm" style={{ color: "var(--ct-text-muted)" }}>
                    • {msg}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default EmailPricingPage;
