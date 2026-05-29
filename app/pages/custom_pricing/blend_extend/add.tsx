import React, { useState, useRef, useEffect } from "react";
import Layout from "../../../components/Layout";
import api from "../../../utils/api";
import { useRouter } from "next/router";

interface RenewalCustomer {
  cust_id: string;
  company_name: string;
  premise_id: string;
  contract_end_date: string;
  contract_renewal_usage: string;
  contract_rate: string;
  contract_rate_cents: number;
  load_profile: string;
  broker_code: string;
  broker_name: string; // add this
  remaining_months: number;
}

interface Quote {
  ext_term: number;
  total_term: number;
  new_rate: number | null;
  blended_rate: number | null;
}

interface CalcResult {
  current_rate: number;
  remaining_months: number;
  total_ann_usage: number;
  profiles: Record<string, number>;
  quotes: Quote[];
  customers: any[];
}

const DEFAULT_TERMS = "6,12,18,24";

const BlendExtend = () => {
  const router = useRouter();
  const { sid: urlSid } = router.query;
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [brokerList, setBrokerList] = useState<
    { sid: number; broker_code: string; company_name: string }[]
  >([]);
  const [selectedBroker, setSelectedBroker] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<RenewalCustomer[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selected, setSelected] = useState<RenewalCustomer[]>([]);

  // Form fields
  const [extensionTerms, setExtensionTerms] = useState(DEFAULT_TERMS);
  const [startDate, setStartDate] = useState("");
  const [currentRateOverride, setCurrentRateOverride] = useState("");

  // Profiles — editable
  const [profiles, setProfiles] = useState<Record<string, number>>({});

  // Results
  const [result, setResult] = useState<CalcResult | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState("");
  const [profilesEdited, setProfilesEdited] = useState(false);
  const [offerForm, setOfferForm] = useState({
    ameripower_mills: "",
    broker_mills: "",
    message: "",
  });
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedSid, setSavedSid] = useState<number | null>(null);

  // Search debounce
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.get(
          `/bne/search?q=${encodeURIComponent(searchQuery)}`,
        );
        const filtered = res.data.filter(
          (r: RenewalCustomer) =>
            !selected.find((s) => s.cust_id === r.cust_id),
        );
        setSearchResults(filtered);
        setShowDropdown(true);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, selected]);

  useEffect(() => {
    api
      .get("/brokers/dropdown")
      .then((res) => setBrokerList(res.data))
      .catch(() => {});
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node))
        setShowDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectCustomer = (c: RenewalCustomer) => {
    const newSelected = [...selected, c];
    setSelected(newSelected);
    setSearchQuery("");
    setShowDropdown(false);
    setResult(null);
    // Merge profiles
    mergeProfiles(newSelected);
    setProfilesEdited(false);
    if (!selectedBroker && c.broker_code) setSelectedBroker(c.broker_code);
  };

  const removeCustomer = (cust_id: string) => {
    const newSelected = selected.filter((s) => s.cust_id !== cust_id);
    setSelected(newSelected);
    setResult(null);
    mergeProfiles(newSelected);
    setProfilesEdited(false);
  };

  const mergeProfiles = (customers: RenewalCustomer[]) => {
    const merged: Record<string, number> = {};
    customers.forEach((c) => {
      const profile = c.load_profile;
      const usage = parseFloat(c.contract_renewal_usage || "0");
      if (profile && usage > 0) {
        merged[profile] = (merged[profile] || 0) + usage;
      }
    });
    setProfiles(merged);
  };

  const handleProfileChange = (key: string, val: string) => {
    setProfiles((prev) => ({ ...prev, [key]: parseFloat(val) || 0 }));
    setProfilesEdited(true);
  };

  const handleCalculate = async () => {
    setError("");
    if (!selected.length) {
      setError("Select at least one customer.");
      return;
    }
    if (!startDate) {
      setError("Enter a start date.");
      return;
    }
    if (!extensionTerms) {
      setError("Enter extension terms.");
      return;
    }

    const terms = extensionTerms
      .split(",")
      .map((t) => parseInt(t.trim()))
      .filter((t) => !isNaN(t) && t > 0);

    if (!terms.length) {
      setError(
        "Invalid terms format. Use comma-separated numbers e.g. 6,12,18,24",
      );
      return;
    }

    setCalculating(true);
    try {
      const res = await api.post("/bne/calculate", {
        cust_ids: selected.map((s) => s.cust_id),
        extension_terms: terms,
        start_date: startDate,
        profiles: profilesEdited ? profiles : null,
        current_rate: currentRateOverride
          ? parseFloat(currentRateOverride)
          : null,
      });
      setResult(res.data);
      // Sync profiles with what backend used
      if (res.data.profiles) setProfiles(res.data.profiles);
      if (res.data.current_rate && !currentRateOverride) {
        setCurrentRateOverride(res.data.current_rate.toFixed(4));
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || "Calculation failed.");
    } finally {
      setCalculating(false);
    }
  };
  const handleOfferDownload = async () => {
    if (!result) return;
    setGeneratingPdf(true);
    try {
      const res = await api.post(
        "/bne/offer-pdf",
        {
          customer_name: selected.map((s) => s.company_name).join(", "),
          broker_name: selected[0]?.broker_name || "",
          current_rate: result.current_rate,
          terms_left: result.remaining_months,
          total_volume: result.total_ann_usage,
          contract_end_date: selected[0]?.contract_end_date || "",
          ameripower_mills: parseFloat(offerForm.ameripower_mills) || 0,
          broker_mills: parseFloat(offerForm.broker_mills) || 0,
          message: offerForm.message,
          quotes: result.quotes,
        },
        { responseType: "blob" },
      );

      // Trigger download
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `BNE_Offer_${selected[0]?.company_name || "offer"}.pdf`,
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setError("PDF generation failed.");
    } finally {
      setGeneratingPdf(false);
    }
  };
  const handleSave = async () => {
    if (!result || !selected.length) return;
    setSaving(true);
    try {
      const res = await api.post("/bne/save", {
        sid: urlSid ? parseInt(urlSid as string) : null,
        customer_name: selected.map((s) => s.company_name).join(", "),
        //broker_code: selected[0]?.broker_code || "",
        esid: selected.map((s) => s.premise_id).join(", "),
        cust_ids: JSON.stringify(selected.map((s) => s.cust_id)),
        current_rate: String(result.current_rate),
        terms_left: selected[0]?.contract_end_date || "",
        extension_terms: extensionTerms,
        profiles: JSON.stringify(profiles),
        volume: JSON.stringify(profiles),
        ameripower_mills: offerForm.ameripower_mills || "0",
        broker_mill: offerForm.broker_mills || "0",
        start_date: startDate || null,
        comments: offerForm.message || "",
        broker_code: selectedBroker,
      });
      setSavedSid(res.data.sid);
    } catch {
      setError("Save failed.");
    } finally {
      setSaving(false);
    }
  };
  useEffect(() => {
    if (!router.isReady || !urlSid) return;
    api
      .get(`/bne/${urlSid}`)
      .then(async (res) => {
        const r = res.data;
        setExtensionTerms(r.extension_terms || DEFAULT_TERMS);
        setStartDate(r.start_date || "");
        setCurrentRateOverride(r.current_rate || "");
        setOfferForm({
          ameripower_mills: r.ameripower_mills || "",
          broker_mills: r.broker_mill || "",
          message: r.comments || "",
        });
        setSavedSid(parseInt(urlSid as string));
        if (r.broker_code) setSelectedBroker(r.broker_code);

        // Parse profiles
        try {
          const p = JSON.parse(r.profiles || "{}");
          setProfiles(p);
          setProfilesEdited(true);
        } catch {}

        // ── Re-fetch customers from contract_renewal ──
        try {
          const cust_ids = JSON.parse(r.cust_ids || "[]");
          if (cust_ids.length) {
            // Search each cust_id and populate selected
            const customers = await Promise.all(
              cust_ids.map((cid: string) =>
                api
                  .get(`/bne/search?q=${encodeURIComponent(cid)}`)
                  .then((res) => res.data.find((c: any) => c.cust_id === cid))
                  .catch(() => null),
              ),
            );
            const valid = customers.filter(Boolean);
            setSelected(valid);
          }
        } catch {}

        try {
          const cust_ids = JSON.parse(r.cust_ids || "[]");
          console.log("cust_ids from record:", cust_ids);
          if (cust_ids.length) {
            const res = await api.get(
              `/bne/customers?ids=${cust_ids.join(",")}`,
            );
            console.log("customers fetched:", res.data);
            setSelected(res.data);
          }
        } catch (e) {
          console.log("customer fetch error:", e);
        }
      })
      .catch(() => {});
  }, [urlSid, router.isReady]);

  const inputCls =
    "w-full bg-slate-800 text-white px-3 py-2 rounded-lg border border-slate-600 focus:outline-none focus:border-red-500 text-sm";
  const labelCls = "text-xs text-slate-400 mb-1 block";

  return (
    <Layout title="Blend & Extend Pricing">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4 border-b border-slate-800 pb-5">
          <button
            onClick={() => router.push("/pricing")}
            className="text-slate-400 hover:text-white text-sm"
          >
            ← Pricing
          </button>
          <div>
            <h1 className="text-2xl font-black text-white uppercase tracking-tighter">
              Blend &amp; Extend Pricing
            </h1>
            <p className="text-slate-400 text-xs mt-0.5">
              Calculate blended rates across multiple extension terms
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* ── LEFT PANEL ── */}
          <div className="space-y-5">
            {/* Customer Search */}
            <div className="bg-slate-900 rounded-xl border border-slate-700 p-5 space-y-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                Customer
              </p>
              <div className="relative" ref={dropdownRef}>
                <input
                  ref={searchRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => searchResults.length && setShowDropdown(true)}
                  placeholder="Search by company name or ESI ID..."
                  className={inputCls}
                />
                {searching && (
                  <div className="absolute right-3 top-2.5 w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                )}
                {showDropdown && searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-600 rounded-lg z-20 max-h-60 overflow-y-auto shadow-xl">
                    {searchResults.map((r) => (
                      <div
                        key={r.cust_id}
                        onClick={() => selectCustomer(r)}
                        className="px-4 py-3 hover:bg-slate-700 cursor-pointer border-b border-slate-700 last:border-0"
                      >
                        <p className="text-white text-sm font-semibold">
                          {r.company_name}
                        </p>
                        <p className="text-slate-400 text-xs mt-0.5 font-mono">
                          ESI: {r.premise_id} &nbsp;·&nbsp; Rate:{" "}
                          {r.contract_rate_cents?.toFixed(4)}¢ &nbsp;·&nbsp;
                          Ends: {r.contract_end_date} &nbsp;·&nbsp;
                          {r.remaining_months} mo left
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                <div className="bg-slate-900 rounded-xl border border-slate-700 p-5 space-y-3">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                    Broker
                  </p>
                  <select
                    value={selectedBroker}
                    onChange={(e) => setSelectedBroker(e.target.value)}
                    className="w-full bg-slate-800 text-white px-3 py-2 rounded-lg border border-slate-600 focus:outline-none focus:border-red-500 text-sm"
                  >
                    <option value="">Select broker</option>
                    {brokerList.map((b) => (
                      <option key={b.sid} value={b.broker_code}>
                        {b.company_name} ({b.broker_code})
                      </option>
                    ))}
                  </select>
                </div>
                {showDropdown &&
                  !searching &&
                  searchResults.length === 0 &&
                  searchQuery.length >= 2 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-600 rounded-lg z-20 px-4 py-3 text-slate-400 text-sm">
                      No active fixed-rate customers found
                    </div>
                  )}
              </div>

              {/* Selected chips */}
              {selected.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selected.map((s) => (
                    <span
                      key={s.cust_id}
                      className="flex items-center gap-1.5 bg-slate-700 border border-slate-600 rounded-full px-3 py-1 text-xs text-white"
                    >
                      {s.company_name}
                      <button
                        onClick={() => removeCustomer(s.cust_id)}
                        className="text-slate-400 hover:text-white"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Extension Settings */}
            <div className="bg-slate-900 rounded-xl border border-slate-700 p-5 space-y-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                Extension settings
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Extension terms (months)</label>
                  <input
                    type="text"
                    value={extensionTerms}
                    onChange={(e) => setExtensionTerms(e.target.value)}
                    className={inputCls}
                    placeholder="6,12,18,24"
                  />
                  <p className="text-xs text-slate-500 mt-1">Comma separated</p>
                </div>
                <div>
                  <label className={labelCls}>Start date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>
                    Current rate (¢/kWh)
                    <span className="text-slate-500 ml-1">
                      — auto-filled from DB, editable
                    </span>
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={currentRateOverride}
                    onChange={(e) => setCurrentRateOverride(e.target.value)}
                    className={inputCls}
                    placeholder={
                      selected.length
                        ? "Will auto-fill after first calculate"
                        : "Select customer first"
                    }
                  />
                </div>
              </div>
            </div>

            {/* Profiles & Volumes */}
            {Object.keys(profiles).length > 0 && (
              <div className="bg-slate-900 rounded-xl border border-slate-700 p-5 space-y-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                  Profiles &amp; volumes — editable
                </p>
                <div className="space-y-2">
                  {Object.entries(profiles).map(([key, val]) => (
                    <div key={key} className="flex items-center gap-3">
                      <span className="text-xs font-mono text-slate-300 flex-1 truncate">
                        {key}
                      </span>
                      <input
                        type="number"
                        value={val}
                        onChange={(e) =>
                          handleProfileChange(key, e.target.value)
                        }
                        className="w-36 bg-slate-800 text-white px-3 py-1.5 rounded-lg border border-slate-600 focus:outline-none focus:border-red-500 text-sm text-right font-mono"
                      />
                      <span className="text-xs text-slate-500">kWh/yr</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-xs pt-2 border-t border-slate-700">
                  <span className="text-slate-400">Total annual usage</span>
                  <span className="text-white font-mono font-bold">
                    {Object.values(profiles)
                      .reduce((a, b) => a + b, 0)
                      .toLocaleString()}{" "}
                    kWh
                  </span>
                </div>
              </div>
            )}

            {error && <p className="text-red-400 text-xs">{error}</p>}

            <button
              onClick={handleCalculate}
              disabled={calculating}
              className="w-full bg-red-600 hover:bg-red-700 disabled:bg-slate-600 text-white py-3 rounded-lg text-sm font-bold uppercase tracking-wide transition"
            >
              {calculating ? "Calculating..." : "Calculate B&E Rates"}
            </button>
          </div>

          {/* ── RIGHT PANEL — Results ── */}
          <div className="bg-slate-900 rounded-xl border border-slate-700 p-5">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-4">
              B&amp;E Pricing results
            </p>

            {!result ? (
              <div className="text-center py-16 text-slate-500 text-sm space-y-2">
                <p className="text-3xl">📊</p>
                <p>Select a customer and calculate to see blended rates</p>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Summary */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    {
                      label: "Current rate",
                      val: `${result.current_rate.toFixed(4)} ¢`,
                    },
                    {
                      label: "Months remaining",
                      val: `${result.remaining_months} mo`,
                    },
                    {
                      label: "Annual usage",
                      val: `${Math.round(result.total_ann_usage).toLocaleString()} kWh`,
                    },
                  ].map(({ label, val }) => (
                    <div
                      key={label}
                      className="bg-slate-800 rounded-lg p-3 text-center"
                    >
                      <p className="text-xs text-slate-400 mb-1">{label}</p>
                      <p className="text-white font-bold text-sm font-mono">
                        {val}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Quotes table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-800">
                        <th className="text-left px-4 py-2.5 text-xs text-slate-400 uppercase tracking-wide rounded-tl-lg">
                          Extension
                        </th>
                        <th className="text-center px-4 py-2.5 text-xs text-slate-400 uppercase tracking-wide">
                          Ext / Total months
                        </th>
                        <th className="text-right px-4 py-2.5 text-xs text-slate-400 uppercase tracking-wide">
                          New rate (¢)
                        </th>
                        <th className="text-right px-4 py-2.5 text-xs text-slate-400 uppercase tracking-wide rounded-tr-lg">
                          Blended rate (¢)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.quotes.map((q, i) => (
                        <tr
                          key={q.ext_term}
                          className={`border-t border-slate-800 ${i % 2 === 0 ? "" : "bg-slate-800/30"}`}
                        >
                          <td className="px-4 py-3 text-white font-semibold">
                            {q.ext_term} month ext.
                          </td>
                          <td className="px-4 py-3 text-center text-slate-300 font-mono">
                            {q.ext_term} / {q.total_term}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-300 font-mono">
                            {q.new_rate !== null ? q.new_rate.toFixed(4) : "—"}
                          </td>
                          <td className="px-4 py-3 text-right font-mono">
                            {q.blended_rate !== null ? (
                              <span className="text-green-400 font-bold text-base">
                                {q.blended_rate.toFixed(4)}
                              </span>
                            ) : (
                              <span className="text-slate-500">N/A</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Offer PDF section */}
                {result && (
                  <div className="bg-slate-800 rounded-lg p-4 space-y-3 mt-4">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                      Generate offer PDF
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-slate-400 mb-1 block">
                          AmeriPower mills
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          value={offerForm.ameripower_mills}
                          onChange={(e) =>
                            setOfferForm((p) => ({
                              ...p,
                              ameripower_mills: e.target.value,
                            }))
                          }
                          className="w-full bg-slate-700 text-white px-3 py-2 rounded-lg border border-slate-600 focus:outline-none focus:border-red-500 text-sm"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-400 mb-1 block">
                          Broker mills
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          value={offerForm.broker_mills}
                          onChange={(e) =>
                            setOfferForm((p) => ({
                              ...p,
                              broker_mills: e.target.value,
                            }))
                          }
                          className="w-full bg-slate-700 text-white px-3 py-2 rounded-lg border border-slate-600 focus:outline-none focus:border-red-500 text-sm"
                          placeholder="0"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs text-slate-400 mb-1 block">
                          Message (optional)
                        </label>
                        <input
                          type="text"
                          value={offerForm.message}
                          onChange={(e) =>
                            setOfferForm((p) => ({
                              ...p,
                              message: e.target.value,
                            }))
                          }
                          className="w-full bg-slate-700 text-white px-3 py-2 rounded-lg border border-slate-600 focus:outline-none focus:border-red-500 text-sm"
                          placeholder="Custom message for offer..."
                        />
                      </div>
                    </div>
                    <button
                      onClick={handleOfferDownload}
                      disabled={generatingPdf}
                      className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-slate-600 text-white py-2.5 rounded-lg text-sm font-bold uppercase transition"
                    >
                      {generatingPdf ? "Generating..." : "Download Offer PDF"}
                    </button>
                  </div>
                )}
                {result && (
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full bg-slate-700 hover:bg-slate-600 disabled:bg-slate-600 text-white py-2.5 rounded-lg text-sm font-bold uppercase transition mt-2"
                  >
                    {saving
                      ? "Saving..."
                      : savedSid
                        ? `Saved — BNE #${savedSid}`
                        : urlSid
                          ? "Update Record"
                          : "Save Record"}
                  </button>
                )}
                {savedSid && (
                  <button
                    onClick={async () => {
                      if (!selectedBroker) {
                        setError("Select a broker first.");
                        return;
                      }
                      try {
                        await api.post(`/bne/send-email`, {
                          sid: savedSid,
                          broker_code: selectedBroker,
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

                {/* Formula note */}
                <p className="text-xs text-slate-500 text-center">
                  Formula: (current_rate × rem_vol + new_rate × ext_vol) /
                  total_vol
                </p>

                {/* Per customer breakdown if multiple */}
                {result.customers.length > 1 && (
                  <div className="bg-slate-800 rounded-lg p-4">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">
                      Customer breakdown
                    </p>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-slate-500 uppercase">
                          <th className="text-left py-1">Customer</th>
                          <th className="text-right py-1">Rate (¢)</th>
                          <th className="text-right py-1">Rem. months</th>
                          <th className="text-right py-1">Ann. usage</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.customers.map((c: any) => (
                          <tr
                            key={c.cust_id}
                            className="border-t border-slate-700"
                          >
                            <td className="py-1.5 text-white">
                              {c.company_name}
                            </td>
                            <td className="py-1.5 text-right text-slate-300 font-mono">
                              {c.contract_rate_cents?.toFixed(4)}
                            </td>
                            <td className="py-1.5 text-right text-slate-300">
                              {c.remaining_months}
                            </td>
                            <td className="py-1.5 text-right text-slate-300">
                              {Number(c.annual_usage).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default BlendExtend;
