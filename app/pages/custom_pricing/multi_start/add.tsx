import React, { useState, useEffect, useRef } from "react";
import Layout from "../../../components/Layout";
import api from "../../../utils/api";
import { useRouter } from "next/router";

interface ProfileGroup {
  id: string;
  start_date: string;
  esid: string;
  profiles: Record<string, number>;
  source: "manual" | "upload" | "renewal";
}

interface Quote {
  term: number;
  final_price: number | null;
}

interface CalcResult {
  total_volume: number;
  total_ann_volume?: number;
  total_meters?: number;
  group_results: any[];
  quotes: Quote[];
  end_dates?: {
    end_date: string;
    final_price: number | null;
    groups: any[];
  }[];
}

const DEFAULT_TERMS = "6,12,18,24";

const MultiStartAdd = () => {
  const router = useRouter();
  const { sid: urlSid } = router.query;
  const fileRef = useRef<HTMLInputElement>(null);

  // Form state
  const [customerName, setCustomerName] = useState("");
  const [brokerCode, setBrokerCode] = useState("");
  const [terms, setTerms] = useState(DEFAULT_TERMS);
  const [ameriMills, setAmeriMills] = useState("");
  const [brokerMills, setBrokerMills] = useState("");
  const [comments, setComments] = useState("");
  const [brokerList, setBrokerList] = useState<
    { broker_code: string; company_name: string }[]
  >([]);

  const ZONES: Record<string, string[]> = {
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

  // Groups
  const [groups, setGroups] = useState<ProfileGroup[]>([]);

  // Renewal search
  const [renewalQuery, setRenewalQuery] = useState("");
  const [renewalResults, setRenewalResults] = useState<any[]>([]);
  const [renewalSearching, setRenewalSearching] = useState(false);
  const [showRenewalDrop, setShowRenewalDrop] = useState(false);
  const renewalRef = useRef<HTMLDivElement>(null);

  // Results
  const [result, setResult] = useState<CalcResult | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedSid, setSavedSid] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [endMonth, setEndMonth] = useState(5); // default May

  // Load existing record
  useEffect(() => {
    if (!urlSid) return;
    api
      .get(`/msp/${urlSid}`)
      .then((res) => {
        const r = res.data;
        setCustomerName(r.customer_name || "");
        setBrokerCode(r.broker_code || "");
        setTerms(r.terms || DEFAULT_TERMS);
        setAmeriMills(r.ameripower_mills || "");
        setBrokerMills(r.broker_mill || "");
        setComments(r.comments || "");
        setSavedSid(parseInt(urlSid as string));
        try {
          const g = JSON.parse(r.groups || "[]");
          setGroups(
            g.map((grp: any, i: number) => ({
              id: `grp_${i}`,
              start_date: grp.start_date || "",
              esid: grp.esid || "",
              profiles: grp.profiles || {},
              source: "manual",
            })),
          );
        } catch (err) {
          console.error("Group parse error", err);
        }
      })
      .catch(() => {});
  }, [urlSid]);

  // Renewal search debounce
  useEffect(() => {
    if (renewalQuery.length < 2) {
      setRenewalResults([]);
      setShowRenewalDrop(false);
      return;
    }
    const timer = setTimeout(async () => {
      setRenewalSearching(true);
      try {
        const res = await api.get(
          `/bne/search?q=${encodeURIComponent(renewalQuery)}`,
        );
        setRenewalResults(res.data);
        setShowRenewalDrop(true);
      } catch {
        setRenewalResults([]);
      } finally {
        setRenewalSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [renewalQuery]);

  // Close renewal dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!renewalRef.current?.contains(e.target as Node))
        setShowRenewalDrop(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    api
      .get("/brokers/dropdown")
      .then((res) => setBrokerList(res.data))
      .catch(() => {});
  }, []);

  const addManualGroup = () => {
    setGroups((prev) => [
      ...prev,
      {
        id: `grp_${Date.now()}`,
        start_date: "",
        esid: "",
        profiles: {},
        source: "manual",
      },
    ]);
  };

  const removeGroup = (id: string) => {
    setGroups((prev) => prev.filter((g) => g.id !== id));
    setResult(null);
  };

  const updateGroup = (id: string, field: keyof ProfileGroup, value: any) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === id ? { ...g, [field]: value } : g)),
    );
    setResult(null);
  };

  const updateProfileVolume = (
    groupId: string,
    profileKey: string,
    value: string,
  ) => {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g;
        return {
          ...g,
          profiles: { ...g.profiles, [profileKey]: parseFloat(value) || 0 },
        };
      }),
    );
    setResult(null);
  };

  const addFromRenewal = async (r: any) => {
    const shortName = r.load_profile
      ? r.load_profile.split("_IDR")[0].split("_WS")[0]
      : r.load_profile;
    const endDate = new Date(r.contract_end_date);
    const day = endDate.getDate();
    let startDate: Date;
    if (day > 16) {
      startDate = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 1);
    } else {
      startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
    }
    const startDateStr = startDate.toISOString().split("T")[0];

    setGroups((prev) => [
      ...prev,
      {
        id: `grp_${Date.now()}`,
        start_date: startDateStr,
        esid: r.premise_id || "",
        profiles: { [shortName]: parseFloat(r.contract_renewal_usage || "0") },
        source: "renewal",
      },
    ]);
    if (!customerName) setCustomerName(r.company_name);
    if (!brokerCode) setBrokerCode(r.broker_code);
    setRenewalQuery("");
    setShowRenewalDrop(false);
    setResult(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    try {
      const formData = new FormData();
      Array.from(files).forEach((f) => formData.append("files", f));
      const res = await api.post("/customers/parse-usage-msp", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const parsed: any[] = res.data;
      const newGroups = parsed.map((p, i) => ({
        id: `grp_upload_${Date.now()}_${i}`,
        start_date: p.start_date || "",
        esid: p.esid || "",
        profiles: p.profiles || {},
        source: "upload" as const,
      }));
      setGroups((prev) => [...prev, ...newGroups]);
      if (parsed[0]?.customer_name && !customerName)
        setCustomerName(parsed[0].customer_name);
    } catch (err: any) {
      setError(
        "Upload failed: " + (err.response?.data?.detail || "unknown error"),
      );
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleCalculate = async () => {
    setError("");
    if (!groups.length) {
      setError("Add at least one group.");
      return;
    }

    const termList = terms
      .split(",")
      .map((t) => parseInt(t.trim()))
      .filter((t) => !isNaN(t) && t > 0);
    if (!termList.length) {
      setError("Invalid terms.");
      return;
    }

    for (const g of groups) {
      if (!g.start_date) {
        setError("All groups need a start date.");
        return;
      }
      if (!Object.keys(g.profiles).length) {
        setError("All groups need at least one profile.");
        return;
      }
    }

    setCalculating(true);
    try {
      const res = await api.post("/msp/calculate", {
        groups: groups.map((g) => ({
          start_date: g.start_date,
          esid: g.esid,
          profiles: Object.fromEntries(
            Object.entries(g.profiles).filter(([k, v]) => k && v > 0),
          ),
        })),
        end_month: endMonth,
      });
      setResult(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Calculation failed.");
    } finally {
      setCalculating(false);
    }
  };

  const handleSave = async () => {
    if (!customerName) {
      setError("Customer name required.");
      return;
    }
    setSaving(true);
    try {
      const allEsids = groups
        .map((g) => g.esid)
        .filter(Boolean)
        .join(", ");
      const res = await api.post("/msp/save", {
        sid: urlSid ? parseInt(urlSid as string) : null,
        customer_name: customerName,
        broker_code: brokerCode,
        esids: allEsids,
        groups: JSON.stringify(
          groups.map((g) => ({
            start_date: g.start_date,
            esid: g.esid,
            profiles: g.profiles,
          })),
        ),
        terms,
        ameripower_mills: ameriMills,
        broker_mill: brokerMills,
        comments,
      });
      setSavedSid(res.data.sid);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full bg-slate-800 text-white px-3 py-2 rounded-lg border border-slate-600 focus:outline-none focus:border-red-500 text-sm";
  const labelCls = "text-xs text-slate-400 mb-1 block";

  return (
    <Layout title="Multiple Start Pricing">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-4 border-b border-slate-800 pb-5">
          <button
            onClick={() => router.push("/custom_pricing/multi_start")}
            className="text-slate-400 hover:text-white text-sm"
          >
            ← MSP Log
          </button>
          <div>
            <h1 className="text-2xl font-black text-white uppercase tracking-tighter">
              Multiple Start Pricing
            </h1>
            <p className="text-slate-400 text-xs mt-0.5">
              Price customers with meters starting on different dates
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="space-y-5">
            <div className="bg-slate-900 rounded-xl border border-slate-700 p-5 space-y-3">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                Customer info
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Customer name</label>
                  <input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className={inputCls}
                    placeholder="e.g. ABC Corp"
                  />
                </div>
                <div>
                  <label className={labelCls}>Broker</label>
                  <select
                    value={brokerCode}
                    onChange={(e) => setBrokerCode(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">Select broker</option>
                    {brokerList.map((b) => (
                      <option key={b.broker_code} value={b.broker_code}>
                        {b.company_name} ({b.broker_code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="bg-slate-900 rounded-xl border border-slate-700 p-5 space-y-3">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                Pricing terms
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Target end month</label>
                  <select
                    value={endMonth}
                    onChange={(e) => setEndMonth(parseInt(e.target.value))}
                    className={inputCls}
                  >
                    {[
                      "Jan",
                      "Feb",
                      "Mar",
                      "Apr",
                      "May",
                      "Jun",
                      "Jul",
                      "Aug",
                      "Sep",
                      "Oct",
                      "Nov",
                      "Dec",
                    ].map((m, i) => (
                      <option key={i + 1} value={i + 1}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>ORBIC mills</label>
                  <input
                    type="number"
                    step="0.1"
                    value={ameriMills}
                    onChange={(e) => setAmeriMills(e.target.value)}
                    className={inputCls}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className={labelCls}>Broker mills</label>
                  <input
                    type="number"
                    step="0.1"
                    value={brokerMills}
                    onChange={(e) => setBrokerMills(e.target.value)}
                    className={inputCls}
                    placeholder="0"
                  />
                </div>
              </div>
            </div>

            <div className="bg-slate-900 rounded-xl border border-slate-700 p-5 space-y-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                Start date groups
              </p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={addManualGroup}
                  className="bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg text-xs font-bold uppercase"
                >
                  + Manual
                </button>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg text-xs font-bold uppercase"
                >
                  + Upload
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.txt,.xlsx"
                  multiple
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <div className="relative" ref={renewalRef}>
                  <input
                    type="text"
                    value={renewalQuery}
                    onChange={(e) => setRenewalQuery(e.target.value)}
                    placeholder="+ From renewal..."
                    className="w-full bg-slate-700 text-white px-3 py-2 rounded-lg border border-slate-600 focus:outline-none focus:border-red-500 text-xs"
                  />
                  {renewalSearching && (
                    <div className="absolute right-2 top-2 w-3 h-3 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                  )}
                  {showRenewalDrop && renewalResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-600 rounded-lg z-20 max-h-48 overflow-y-auto shadow-xl">
                      {renewalResults.map((r) => (
                        <div
                          key={r.cust_id}
                          onClick={() => addFromRenewal(r)}
                          className="px-3 py-2 hover:bg-slate-700 cursor-pointer border-b border-slate-700 last:border-0"
                        >
                          <p className="text-white text-xs font-semibold">
                            {r.company_name}
                          </p>
                          <p className="text-slate-400 text-xs">
                            ESI: {r.premise_id} · Ends: {r.contract_end_date}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {groups.map((g, idx) => (
                <div
                  key={g.id}
                  className="bg-slate-800 rounded-lg p-4 space-y-3 border border-slate-700"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300 uppercase">
                      Group {idx + 1}{" "}
                      {g.source !== "manual" && (
                        <span className="ml-2 text-xs text-slate-500 normal-case">
                          ({g.source})
                        </span>
                      )}
                    </span>
                    <button
                      onClick={() => removeGroup(g.id)}
                      className="text-slate-500 hover:text-red-400 text-xs"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelCls}>Start date</label>
                      <input
                        type="date"
                        value={g.start_date}
                        onChange={(e) =>
                          updateGroup(g.id, "start_date", e.target.value)
                        }
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>ESI ID(s)</label>
                      <input
                        type="text"
                        value={g.esid}
                        onChange={(e) =>
                          updateGroup(g.id, "esid", e.target.value)
                        }
                        className={inputCls}
                        placeholder="optional"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className={labelCls}>Profiles & volumes</label>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                      {Object.entries(ZONES).map(([zone, profileKeys]) => (
                        <div key={zone}>
                          <p className="text-xs font-bold text-red-400 uppercase mb-1">
                            {zone}
                          </p>
                          {profileKeys.map((pk) => (
                            <div
                              key={pk}
                              className="flex items-center gap-2 mb-1"
                            >
                              <input
                                type="checkbox"
                                id={`${g.id}_${pk}`}
                                checked={pk in g.profiles}
                                onChange={(e) => {
                                  if (e.target.checked)
                                    updateGroup(g.id, "profiles", {
                                      ...g.profiles,
                                      [pk]: 0,
                                    });
                                  else {
                                    const { [pk]: _, ...rest } = g.profiles;
                                    updateGroup(g.id, "profiles", rest);
                                  }
                                }}
                                className="accent-red-500"
                              />
                              <label
                                htmlFor={`${g.id}_${pk}`}
                                className="text-xs text-slate-300 flex-1 cursor-pointer"
                              >
                                {pk}
                              </label>
                              {pk in g.profiles && (
                                <input
                                  type="number"
                                  value={g.profiles[pk] || ""}
                                  onChange={(e) =>
                                    updateProfileVolume(
                                      g.id,
                                      pk,
                                      e.target.value,
                                    )
                                  }
                                  className="w-24 bg-slate-700 text-white px-2 py-1 rounded border border-slate-600 text-xs text-right font-mono focus:outline-none focus:border-red-500"
                                  placeholder="kWh/yr"
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-slate-900 rounded-xl border border-slate-700 p-5">
              <label className={labelCls}>Comments</label>
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                className={inputCls + " resize-none"}
                rows={2}
                placeholder="Optional notes..."
              />
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button
              onClick={handleCalculate}
              disabled={calculating}
              className="w-full bg-red-600 hover:bg-red-700 disabled:bg-slate-600 text-white py-3 rounded-lg text-sm font-bold uppercase tracking-wide transition"
            >
              {calculating ? "Calculating..." : "Calculate MSP Rates"}
            </button>
          </div>

          <div className="bg-slate-900 rounded-xl border border-slate-700 p-5">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-4">
              Results
            </p>
            {!result ? (
              <div className="text-center py-16 text-slate-500 text-sm space-y-2">
                <p className="text-3xl">📊</p>
                <p>Add groups and calculate to see weighted rates</p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="bg-slate-800 rounded-lg p-3 text-center">
                  <p className="text-xs text-slate-400 mb-1">
                    Total annual volume
                  </p>
                  <p className="text-white font-bold font-mono">
                    {result.total_ann_volume?.toLocaleString() ??
                      result.total_volume.toLocaleString()}{" "}
                    kWh/yr
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-800">
                        <th className="text-left px-3 py-2.5 text-xs text-slate-400 uppercase">
                          Customer
                        </th>
                        <th className="text-center px-3 py-2.5 text-xs text-slate-400 uppercase">
                          Meters
                        </th>
                        {result.end_dates?.map((ed) => (
                          <th
                            key={ed.end_date}
                            className="text-right px-3 py-2.5 text-xs text-slate-400 uppercase"
                          >
                            {ed.end_date}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-slate-800">
                        <td className="px-3 py-3 text-white font-semibold">
                          {customerName || "—"}
                        </td>
                        <td className="px-3 py-3 text-center text-slate-300">
                          {result.total_meters ?? 0}
                        </td>
                        {result.end_dates?.map((ed) => {
                          let adj = ed.final_price;
                          if (adj !== null && adj !== undefined) {
                            if (ameriMills) adj += parseFloat(ameriMills) / 10;
                            if (brokerMills)
                              adj += parseFloat(brokerMills) / 10;
                          }
                          return (
                            <td
                              key={ed.end_date}
                              className="px-3 py-3 text-right font-mono"
                            >
                              {adj !== null && adj !== undefined ? (
                                <span className="text-green-400 font-bold text-base">
                                  {adj.toFixed(4)}
                                </span>
                              ) : (
                                <span className="text-slate-500">N/A</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>

                {result.end_dates?.[0]?.groups && (
                  <div className="bg-slate-800 rounded-lg p-4 space-y-2">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">
                      Group breakdown — {result.end_dates[0].end_date}
                    </p>
                    {result.end_dates[0].groups.map((gr: any, i: number) => (
                      <div
                        key={i}
                        className="flex justify-between text-xs border-b border-slate-700 pb-1.5 last:border-0"
                      >
                        <span className="text-slate-300">
                          Start {gr.start_date}{" "}
                          {gr.esid && (
                            <span className="text-slate-500 ml-2 font-mono">
                              {gr.esid}
                            </span>
                          )}
                        </span>
                        <span className="text-slate-400 font-mono">
                          {gr.term_months}mo ·{" "}
                          {gr.period_volume?.toLocaleString()} kWh ·{" "}
                          {gr.price?.toFixed(4) ?? "N/A"} ¢
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full bg-slate-700 hover:bg-slate-600 disabled:bg-slate-600 text-white py-2.5 rounded-lg text-sm font-bold uppercase transition"
                >
                  {saving
                    ? "Saving..."
                    : savedSid
                      ? `Saved — MSP #${savedSid}`
                      : urlSid
                        ? "Update Record"
                        : "Save Record"}
                </button>
                {savedSid && (
                  <button
                    onClick={async () => {
                      if (!brokerCode) {
                        setError("Select a broker first.");
                        return;
                      }
                      try {
                        await api.post(`/msp/send-email`, {
                          sid: savedSid,
                          broker_code: brokerCode,
                        });
                        alert("Email sent!");
                      } catch (err: any) {
                        setError(err.response?.data?.detail || "Send failed.");
                      }
                    }}
                    className="w-full bg-blue-700 hover:bg-blue-600 text-white py-2.5 rounded-lg text-sm font-bold uppercase transition mt-2"
                  >
                    Send Pricing Email
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default MultiStartAdd;
