import React, { useState, useEffect, useRef } from "react";
import Layout from "../../../components/Layout";
import api from "../../../utils/api";
import { useRouter } from "next/router";
import { getUser } from "../../../utils/auth";

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

const panelCls = "rounded-[var(--r-lg)] border p-5 space-y-3";
const panelStyle = {
  background: "var(--ct-surface)",
  borderColor: "var(--ct-border-default)",
};
const panelHeadingCls = "text-xs font-bold uppercase tracking-wide";
const panelHeadingStyle = { color: "var(--ct-text-muted)" };
const inputCls =
  "w-full px-3 py-2 rounded-[var(--r-md)] border focus:outline-none focus:border-[var(--accent-light)] text-sm";
const inputStyle = {
  background: "var(--ct-canvas)",
  color: "var(--ct-text-primary)",
  borderColor: "var(--ct-border-default)",
};
const labelCls = "text-xs mb-1 block";
const labelStyle = { color: "var(--ct-text-muted)" };
const secondaryBtnCls =
  "py-2 rounded-[var(--r-md)] text-xs font-bold uppercase transition-colors border";
const secondaryBtnStyle = {
  background: "var(--ct-surface-hover)",
  borderColor: "var(--ct-border-default)",
  color: "var(--ct-text-primary)",
};

const MultiStartAdd = () => {
  const router = useRouter();
  const { sid: urlSid } = router.query;
  const millsLabel = `${getUser()?.company_name ?? ""} Mills`.trim();
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
        setAmeriMills(r.mills || "");
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
        mills: ameriMills,
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

  return (
    <Layout title="Multiple Start Pricing">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div
          className="flex items-center gap-4 border-b pb-5"
          style={{ borderColor: "var(--ct-border-subtle)" }}
        >
          <button
            onClick={() => router.push("/custom_pricing/multi_start")}
            className="text-sm transition-colors"
            style={{ color: "var(--ct-text-muted)" }}
          >
            ← MSP Log
          </button>
          <div>
            <h1
              className="text-2xl font-black uppercase tracking-tighter"
              style={{ color: "var(--ct-text-primary)" }}
            >
              Multiple Start Pricing
            </h1>
            <p className="text-xs mt-0.5" style={{ color: "var(--ct-text-muted)" }}>
              Price customers with meters starting on different dates
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="space-y-5">
            <div className={panelCls} style={panelStyle}>
              <p className={panelHeadingCls} style={panelHeadingStyle}>
                Customer info
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls} style={labelStyle}>Customer name</label>
                  <input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className={inputCls}
                    style={inputStyle}
                    placeholder="e.g. ABC Corp"
                  />
                </div>
                <div>
                  <label className={labelCls} style={labelStyle}>Broker</label>
                  <select
                    value={brokerCode}
                    onChange={(e) => setBrokerCode(e.target.value)}
                    className={inputCls}
                    style={inputStyle}
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

            <div className={panelCls} style={panelStyle}>
              <p className={panelHeadingCls} style={panelHeadingStyle}>
                Pricing terms
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls} style={labelStyle}>Target end month</label>
                  <select
                    value={endMonth}
                    onChange={(e) => setEndMonth(parseInt(e.target.value))}
                    className={inputCls}
                    style={inputStyle}
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
                  <label className={labelCls} style={labelStyle}>{millsLabel}</label>
                  <input
                    type="number"
                    step="0.1"
                    value={ameriMills}
                    onChange={(e) => setAmeriMills(e.target.value)}
                    className={inputCls}
                    style={inputStyle}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className={labelCls} style={labelStyle}>Broker mills</label>
                  <input
                    type="number"
                    step="0.1"
                    value={brokerMills}
                    onChange={(e) => setBrokerMills(e.target.value)}
                    className={inputCls}
                    style={inputStyle}
                    placeholder="0"
                  />
                </div>
              </div>
            </div>

            <div className={panelCls + " space-y-4"} style={panelStyle}>
              <p className={panelHeadingCls} style={panelHeadingStyle}>
                Start date groups
              </p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={addManualGroup}
                  className={secondaryBtnCls}
                  style={secondaryBtnStyle}
                >
                  + Manual
                </button>
                <button
                  onClick={() => fileRef.current?.click()}
                  className={secondaryBtnCls}
                  style={secondaryBtnStyle}
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
                    className="w-full px-3 py-2 rounded-[var(--r-md)] border focus:outline-none focus:border-[var(--accent-light)] text-xs"
                    style={inputStyle}
                  />
                  {renewalSearching && (
                    <div
                      className="absolute right-2 top-2 w-3 h-3 border-2 border-t-transparent rounded-full animate-spin"
                      style={{ borderColor: "var(--accent-light)" }}
                    />
                  )}
                  {showRenewalDrop && renewalResults.length > 0 && (
                    <div
                      className="absolute top-full left-0 right-0 mt-1 rounded-[var(--r-md)] border z-20 max-h-48 overflow-y-auto"
                      style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)", boxShadow: "var(--shadow-content)" }}
                    >
                      {renewalResults.map((r) => (
                        <div
                          key={r.cust_id}
                          onClick={() => addFromRenewal(r)}
                          className="px-3 py-2 cursor-pointer border-b last:border-0 hover:bg-[var(--ct-surface-hover)]"
                          style={{ borderColor: "var(--ct-border-subtle)" }}
                        >
                          <p className="text-xs font-semibold" style={{ color: "var(--ct-text-primary)" }}>
                            {r.company_name}
                          </p>
                          <p className="text-xs" style={{ color: "var(--ct-text-muted)" }}>
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
                  className="rounded-[var(--r-md)] p-4 space-y-3 border"
                  style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase" style={{ color: "var(--ct-text-secondary)" }}>
                      Group {idx + 1}{" "}
                      {g.source !== "manual" && (
                        <span className="ml-2 text-xs normal-case" style={{ color: "var(--ct-text-muted)" }}>
                          ({g.source})
                        </span>
                      )}
                    </span>
                    <button
                      onClick={() => removeGroup(g.id)}
                      className="text-xs"
                      style={{ color: "var(--danger-light)" }}
                    >
                      Remove
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelCls} style={labelStyle}>Start date</label>
                      <input
                        type="date"
                        value={g.start_date}
                        onChange={(e) =>
                          updateGroup(g.id, "start_date", e.target.value)
                        }
                        className={inputCls}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label className={labelCls} style={labelStyle}>ESI ID(s)</label>
                      <input
                        type="text"
                        value={g.esid}
                        onChange={(e) =>
                          updateGroup(g.id, "esid", e.target.value)
                        }
                        className={inputCls}
                        style={inputStyle}
                        placeholder="optional"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className={labelCls} style={labelStyle}>Profiles &amp; volumes</label>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                      {Object.entries(ZONES).map(([zone, profileKeys]) => (
                        <div key={zone}>
                          <p className="text-xs font-bold uppercase mb-1" style={{ color: "var(--accent-light)" }}>
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
                                style={{ accentColor: "var(--accent-light)" }}
                              />
                              <label
                                htmlFor={`${g.id}_${pk}`}
                                className="text-xs flex-1 cursor-pointer"
                                style={{ color: "var(--ct-text-secondary)" }}
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
                                  className="w-24 px-2 py-1 rounded border text-xs text-right font-mono focus:outline-none focus:border-[var(--accent-light)]"
                                  style={inputStyle}
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

            <div className={panelCls} style={panelStyle}>
              <label className={labelCls} style={labelStyle}>Comments</label>
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                className={inputCls + " resize-none"}
                style={inputStyle}
                rows={2}
                placeholder="Optional notes..."
              />
            </div>
            {error && <p className="text-xs" style={{ color: "var(--danger-light)" }}>{error}</p>}
            <button
              onClick={handleCalculate}
              disabled={calculating}
              className="w-full py-3 rounded-[var(--r-md)] text-sm font-bold uppercase tracking-wide transition-colors disabled:opacity-50"
              style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
            >
              {calculating ? "Calculating..." : "Calculate MSP Rates"}
            </button>
          </div>

          <div className={panelCls} style={panelStyle}>
            <p className={panelHeadingCls + " mb-4"} style={panelHeadingStyle}>
              Results
            </p>
            {!result ? (
              <div className="text-center py-16 text-sm space-y-2" style={{ color: "var(--ct-text-muted)" }}>
                <p className="text-3xl">📊</p>
                <p>Add groups and calculate to see weighted rates</p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="rounded-[var(--r-md)] p-3 text-center" style={{ background: "var(--ct-surface-hover)" }}>
                  <p className="text-xs mb-1" style={{ color: "var(--ct-text-muted)" }}>
                    Total annual volume
                  </p>
                  <p className="font-bold font-mono" style={{ color: "var(--ct-text-primary)" }}>
                    {result.total_ann_volume?.toLocaleString() ??
                      result.total_volume.toLocaleString()}{" "}
                    kWh/yr
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr style={{ background: "var(--ct-surface-hover)" }}>
                        <th className="text-left px-3 py-2.5 text-xs uppercase" style={{ color: "var(--ct-text-muted)" }}>
                          Customer
                        </th>
                        <th className="text-center px-3 py-2.5 text-xs uppercase" style={{ color: "var(--ct-text-muted)" }}>
                          Meters
                        </th>
                        {result.end_dates?.map((ed) => (
                          <th
                            key={ed.end_date}
                            className="text-right px-3 py-2.5 text-xs uppercase"
                            style={{ color: "var(--ct-text-muted)" }}
                          >
                            {ed.end_date}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t" style={{ borderColor: "var(--ct-border-subtle)" }}>
                        <td className="px-3 py-3 font-semibold" style={{ color: "var(--ct-text-primary)" }}>
                          {customerName || "—"}
                        </td>
                        <td className="px-3 py-3 text-center" style={{ color: "var(--ct-text-secondary)" }}>
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
                                <span className="font-bold text-base" style={{ color: "var(--accent-light)" }}>
                                  {adj.toFixed(4)}
                                </span>
                              ) : (
                                <span style={{ color: "var(--ct-text-muted)" }}>N/A</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>

                {result.end_dates?.[0]?.groups && (
                  <div className="rounded-[var(--r-md)] p-4 space-y-2" style={{ background: "var(--ct-surface-hover)" }}>
                    <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--ct-text-muted)" }}>
                      Group breakdown — {result.end_dates[0].end_date}
                    </p>
                    {result.end_dates[0].groups.map((gr: any, i: number) => (
                      <div
                        key={i}
                        className="flex justify-between text-xs border-b pb-1.5 last:border-0"
                        style={{ borderColor: "var(--ct-border-default)" }}
                      >
                        <span style={{ color: "var(--ct-text-secondary)" }}>
                          Start {gr.start_date}{" "}
                          {gr.esid && (
                            <span className="ml-2 font-mono" style={{ color: "var(--ct-text-muted)" }}>
                              {gr.esid}
                            </span>
                          )}
                        </span>
                        <span className="font-mono" style={{ color: "var(--ct-text-muted)" }}>
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
                  className="w-full py-2.5 rounded-[var(--r-md)] text-sm font-bold uppercase transition-colors border disabled:opacity-50"
                  style={secondaryBtnStyle}
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
                    className="w-full py-2.5 rounded-[var(--r-md)] text-sm font-bold uppercase transition-colors mt-2"
                    style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
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
