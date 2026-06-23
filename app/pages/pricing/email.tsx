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
        <header className="border-b border-slate-800 pb-6">
          <h1 className="text-3xl font-black text-white uppercase tracking-tighter">
            Email Pricing
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Send pricing emails to brokers
          </p>
        </header>

        <div className="flex gap-2 border-b border-slate-800">
          {(["daily", "custom"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                setResult(null);
              }}
              className={`px-6 py-2 text-sm font-bold uppercase transition-colors ${
                activeTab === tab
                  ? "text-red-400 border-b-2 border-red-400"
                  : "text-slate-500 hover:text-white"
              }`}
            >
              {tab === "daily" ? "Daily Pricing" : "Custom Pricing"}
            </button>
          ))}
        </div>

        <div className="bg-slate-800 rounded-lg p-6 space-y-4">
          <div className="flex justify-between items-center border-b border-slate-700 pb-2">
            <h2 className="text-white font-bold text-sm uppercase">
              Configuration
            </h2>
            <button
              onClick={handlePreview}
              disabled={selectedBrokers.length === 0}
              className="text-blue-400 text-xs font-bold uppercase hover:underline disabled:opacity-50"
            >
              Preview Pricing Data
            </button>
          </div>
          {activeTab === "daily" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-slate-400 text-xs uppercase font-bold">
                    Broker Type
                  </label>
                  <div className="flex gap-4">
                    {(["regular", "irregular"] as const).map((type) => (
                      <label
                        key={type}
                        className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer"
                      >
                        <input
                          type="radio"
                          checked={brokerType === type}
                          onChange={() => setBrokerType(type)}
                          className="accent-red-500"
                        />
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-slate-400 text-xs uppercase font-bold">
                    Price Type
                  </label>
                  <select
                    value={priceType}
                    onChange={(e) => setPriceType(e.target.value)}
                    className="bg-slate-700 text-white px-3 py-2 rounded text-sm border border-slate-600"
                  >
                    <option value="commercial">Commercial</option>
                    <option value="residential">Residential</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-slate-400 text-xs uppercase font-bold">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-slate-700 text-white px-3 py-2 rounded text-sm border border-slate-600"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-slate-400 text-xs uppercase font-bold">
                    Months to Include
                  </label>
                  <input
                    type="number"
                    value={numMonths}
                    onChange={(e) => setNumMonths(parseInt(e.target.value))}
                    min={1}
                    max={12}
                    className="bg-slate-700 text-white px-3 py-2 rounded text-sm border border-slate-600"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-slate-400 text-xs uppercase font-bold">
                  Terms
                </label>
                <input
                  type="text"
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  placeholder="6,12,18,24"
                  className="bg-slate-700 text-white px-3 py-2 rounded text-sm border border-slate-600 w-48"
                />
              </div>
            </>
          )}

          {activeTab === "custom" && (
            <div className="text-slate-400 text-sm italic">
              Terms are automatically calculated per customer based on their
              contract start date.
            </div>
          )}
        </div>

        <div className="bg-slate-800 rounded-lg p-6 space-y-4">
          <div className="flex justify-between items-center border-b border-slate-700 pb-2">
            <h2 className="text-white font-bold text-sm uppercase">
              Select Brokers ({selectedBrokers.length}/{brokers.length}{" "}
              selected)
            </h2>
            <button
              onClick={selectAll}
              className="text-red-400 text-xs font-bold hover:text-red-300"
            >
              Select All
            </button>
          </div>

          {loading ? (
            <div className="text-slate-500 italic text-sm animate-pulse">
              Loading brokers...
            </div>
          ) : brokers.length === 0 ? (
            <div className="text-slate-500 italic text-sm">
              No brokers available.
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {brokers.map((b) => (
                <div
                  key={b.sid}
                  onClick={() => toggleBroker(b.sid)}
                  className={`flex items-center justify-between p-3 rounded cursor-pointer transition-colors ${
                    selectedBrokers.includes(b.sid)
                      ? "bg-red-900/40 border border-red-500"
                      : "bg-slate-700 hover:bg-slate-600"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedBrokers.includes(b.sid)}
                      onChange={() => toggleBroker(b.sid)}
                      className="accent-red-500 w-4 h-4"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div>
                      <p className="text-white font-semibold text-sm">
                        {b.company_name}
                      </p>
                      <p className="text-slate-400 text-xs font-mono">
                        {b.broker_code}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    {activeTab === "daily" && (
                      <p className="text-slate-400 text-xs">
                        {b.daily_pricing_email1}
                      </p>
                    )}
                    {activeTab === "custom" && (
                      <p className="text-slate-400 text-xs">
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
            className="bg-red-600 hover:bg-red-700 text-white px-8 py-3 rounded text-sm font-bold uppercase transition-colors disabled:opacity-50"
          >
            {sending
              ? "Sending..."
              : `Send to ${selectedBrokers.length} Broker${selectedBrokers.length !== 1 ? "s" : ""}`}
          </button>

          {activeTab === "daily" && (
            <button
              onClick={handlePreview}
              disabled={selectedBrokers.length === 0 || !startDate}
              className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-3 rounded text-sm font-bold uppercase transition-colors disabled:opacity-50"
            >
              Preview Prices
            </button>
          )}

          {sending && (
            <span className="text-slate-400 text-sm animate-pulse">
              Please wait — generating and sending emails...
            </span>
          )}
        </div>

        {previewData && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-slate-900 rounded-lg w-full max-w-5xl max-h-[90vh] overflow-y-auto mx-4 border border-slate-700 shadow-2xl">
              <div className="flex justify-between items-center p-4 border-b border-slate-700 sticky top-0 bg-slate-900 z-10">
                <h2 className="text-white font-bold uppercase">
                  Preview — Prices to Send
                </h2>
                <button
                  onClick={() => setPreviewData(null)}
                  className="text-slate-400 hover:text-white text-xl"
                >
                  ✕
                </button>
              </div>

              <div className="p-6 space-y-8">
                {previewData.type === "daily" && (
                  <div className="space-y-6">
                    {previewData.months.map((month: MonthData) => (
                      <div key={month.start_date} className="space-y-2">
                        <span className="text-red-400 font-bold text-sm">
                          {month.label}
                        </span>
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-800 text-slate-400">
                              <th className="p-2 text-left border border-slate-700">
                                Zone
                              </th>
                              {(previewData.price_type?.includes("residential")
                                ? ["Residential"]
                                : ["Low", "Medium", "High"]
                              ).map((lf: string) =>
                                month.terms.map((t: number) => (
                                  <th
                                    key={`${lf}-${t}`}
                                    className="p-2 border border-slate-700"
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
                                className="border-b border-slate-700 hover:bg-slate-800"
                              >
                                <td className="p-2 text-white font-bold border border-slate-700">
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
                                      className="p-2 text-center text-slate-300 font-mono border border-slate-700"
                                    >
                                      {row[`${lf}_${t}`]}
                                    </td>
                                  )),
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="h-1 bg-red-600 rounded"></div>
                      </div>
                    ))}
                  </div>
                )}

                {previewData.type === "custom" &&
                  previewData.brokers?.map((b: PreviewBroker) => (
                    <div key={b.broker_code} className="space-y-3">
                      <h3 className="text-red-400 font-bold">
                        {b.broker}{" "}
                        <span className="text-slate-500 font-mono text-xs ml-2">
                          {b.broker_code}
                        </span>
                      </h3>
                      {b.customers.length === 0 ? (
                        <p className="text-slate-500 italic text-sm">
                          No customers with pricing data.
                        </p>
                      ) : (
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-800 text-slate-400">
                              <th className="p-2 text-left border border-slate-700">
                                Company
                              </th>
                              <th className="p-2 border border-slate-700">
                                Start
                              </th>
                              <th className="p-2 border border-slate-700">
                                ESIDs
                              </th>
                              <th className="p-2 border border-slate-700">
                                Credit
                              </th>
                              {b.customers[0]?.terms.map((t: number) => (
                                <th
                                  key={t}
                                  className="p-2 border border-slate-700"
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
                                className="border-b border-slate-700 hover:bg-slate-800"
                              >
                                <td className="p-2 text-white font-bold border border-slate-700">
                                  {c.company}
                                </td>
                                <td className="p-2 text-slate-300 border border-slate-700">
                                  {c.start_date}
                                </td>
                                <td className="p-2 text-center text-slate-300 border border-slate-700">
                                  {c.num_esids}
                                </td>
                                <td className="p-2 text-slate-300 border border-slate-700">
                                  {c.credit_status}
                                </td>
                                {c.terms.map((t: number) => (
                                  <td
                                    key={t}
                                    className="p-2 text-center text-slate-300 font-mono border border-slate-700"
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

              <div className="p-4 border-t border-slate-700 sticky bottom-0 bg-slate-900 flex gap-3">
                <button
                  onClick={() => {
                    setPreviewData(null);
                    handleSend();
                  }}
                  className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded text-sm font-bold uppercase"
                >
                  Looks Good — Send Now
                </button>
                <button
                  onClick={() => setPreviewData(null)}
                  className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-2 rounded text-sm font-bold uppercase"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {preview && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg w-full max-w-3xl max-h-screen overflow-y-auto mx-4">
              <div className="flex justify-between items-center p-4 border-b sticky top-0 bg-white">
                <h2 className="font-bold text-slate-800">Email Preview</h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => window.print()}
                    className="bg-slate-200 hover:bg-slate-300 text-slate-800 px-4 py-1.5 rounded text-sm font-bold"
                  >
                    Print
                  </button>
                  <button
                    onClick={() => setPreview(null)}
                    className="bg-red-600 text-white px-4 py-1.5 rounded text-sm font-bold"
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
          <div className="bg-slate-800 rounded-lg p-6 space-y-4">
            <h2 className="text-white font-bold text-sm uppercase border-b border-slate-700 pb-2">
              Send Results
            </h2>
            {result.sent.length > 0 && (
              <div>
                <p className="text-green-400 text-xs font-bold uppercase mb-2">
                  ✓ Sent ({result.sent.length})
                </p>
                {result.sent.map((name) => (
                  <p key={name} className="text-slate-300 text-sm">
                    • {name}
                  </p>
                ))}
              </div>
            )}
            {result.failed.length > 0 && (
              <div>
                <p className="text-red-400 text-xs font-bold uppercase mb-2">
                  ✗ Failed ({result.failed.length})
                </p>
                {result.failed.map((msg) => (
                  <p key={msg} className="text-slate-400 text-sm">
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
