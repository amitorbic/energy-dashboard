import React, { useState, useEffect, useRef } from "react";
import Layout from "../../components/Layout";
import api from "../../utils/api";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────────
interface DamEntry {
  id: number;
  oper_date: string;
  hour_ending: number;
  zone: string;
  location: string;
  volume_mw: number;
  dam_price: number;
  deal_number: string;
  counterparty: string;
  buy_sell: string;
  source: string;
  total_cost: number;
}

interface DamSummary {
  stats: {
    days: number;
    deals: number;
    total_mw: number;
    avg_dam_price: number;
    min_price: number;
    max_price: number;
    total_cost: number;
  };
  by_location: {
    location: string;
    zone: string;
    hours: number;
    total_mw: number;
    avg_mw: number;
    avg_price: number;
    min_price: number;
    max_price: number;
    total_cost: number;
  }[];
  hourly: {
    hour_ending: number;
    total_mw: number;
    avg_price: number;
    total_cost: number;
  }[];
}

const LOCATIONS = [
  "HB_HOUSTON",
  "HB_NORTH",
  "HB_SOUTH",
  "HB_WEST",
  "LZ_HOUSTON",
  "LZ_NORTH",
  "LZ_SOUTH",
  "LZ_WEST",
];

const LOCATION_COLORS: Record<string, string> = {
  HB_HOUSTON: "bg-emerald-100 text-emerald-700 border-emerald-200",
  HB_NORTH: "bg-blue-100 text-blue-700 border-blue-200",
  HB_SOUTH: "bg-orange-100 text-orange-700 border-orange-200",
  HB_WEST: "bg-teal-100 text-teal-700 border-teal-200",
  LZ_HOUSTON: "bg-emerald-50 text-emerald-600 border-emerald-100",
  LZ_NORTH: "bg-blue-50 text-blue-600 border-blue-100",
  LZ_SOUTH: "bg-orange-50 text-orange-600 border-orange-100",
  LZ_WEST: "bg-teal-50 text-teal-600 border-teal-100",
};

function today() {
  return new Date().toISOString().split("T")[0];
}
function fmt(n: number | null, dec = 2) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

// Hourly entry grid — 24 hours × volume + price
interface HourRow {
  volume_mw: string;
  dam_price: string;
}

function emptyHours(): Record<number, HourRow> {
  const h: Record<number, HourRow> = {};
  for (let i = 1; i <= 24; i++) h[i] = { volume_mw: "", dam_price: "" };
  return h;
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function DamPage() {
  const [entries, setEntries] = useState<DamEntry[]>([]);
  const [summary, setSummary] = useState<DamSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"entry" | "book" | "summary">(
    "entry",
  );
  const [selectedDate, setSelectedDate] = useState(today());

  // Manual entry form
  const [entryDate, setEntryDate] = useState(today());
  const [entryLocation, setEntryLocation] = useState("LZ_NORTH");
  const [entryDeal, setEntryDeal] = useState("");
  const [entryCP, setEntryCP] = useState("");
  const [entryBS, setEntryBS] = useState("Buy");
  const [hours, setHours] = useState<Record<number, HourRow>>(emptyHours());
  const [saving, setSaving] = useState(false);
  const [entryError, setEntryError] = useState("");
  const [entrySuccess, setEntrySuccess] = useState("");

  // File upload
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadDate, setUploadDate] = useState(today());
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);

  useEffect(() => {
    fetchEntries();
    fetchSummary();
  }, [selectedDate]);

  async function fetchEntries() {
    setLoading(true);
    try {
      const r = await api.get(`/dam?oper_date=${selectedDate}`);
      setEntries(r.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function fetchSummary() {
    try {
      const r = await api.get(`/dam/summary?oper_date=${selectedDate}`);
      setSummary(r.data);
    } catch (e) {
      console.error(e);
    }
  }

  function setHourField(
    he: number,
    field: "volume_mw" | "dam_price",
    val: string,
  ) {
    const parts = val.split(".");
    if (parts[1] && parts[1].length > 2) return;
    setHours((h) => ({ ...h, [he]: { ...h[he], [field]: val } }));
  }

  function fillPrice(price: string) {
    setHours((h) => {
      const updated = { ...h };
      for (let i = 1; i <= 24; i++) {
        if (updated[i].volume_mw)
          updated[i] = { ...updated[i], dam_price: price };
      }
      return updated;
    });
  }

  function fillVolume(vol: string) {
    setHours((h) => {
      const updated = { ...h };
      for (let i = 1; i <= 24; i++)
        updated[i] = { ...updated[i], volume_mw: vol };
      return updated;
    });
  }

  async function handleSave() {
    setEntryError("");
    setEntrySuccess("");
    const hasData = Object.values(hours).some(
      (h) => h.volume_mw && parseFloat(h.volume_mw) > 0,
    );
    if (!hasData) {
      setEntryError("Enter at least one hour with volume > 0");
      return;
    }

    setSaving(true);
    try {
      const hoursPayload: Record<string, any> = {};
      for (let i = 1; i <= 24; i++) {
        if (hours[i].volume_mw && parseFloat(hours[i].volume_mw) > 0) {
          hoursPayload[i] = {
            volume_mw: parseFloat(hours[i].volume_mw),
            dam_price: parseFloat(hours[i].dam_price || "0"),
          };
        }
      }
      const res = await api.post("/dam", {
        oper_date: entryDate,
        location: entryLocation,
        deal_number: entryDeal,
        counterparty: entryCP,
        buy_sell: entryBS,
        hours: hoursPayload,
      });
      setEntrySuccess(
        `Saved — ${res.data.inserted} inserted, ${res.data.updated} updated`,
      );
      setHours(emptyHours());
      setEntryDeal("");
      if (entryDate === selectedDate) {
        fetchEntries();
        fetchSummary();
      }
    } catch (e: any) {
      setEntryError(e?.response?.data?.detail || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.post(`/dam/upload?oper_date=${uploadDate}`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setUploadResult(res.data);
      if (uploadDate === selectedDate) {
        fetchEntries();
        fetchSummary();
      }
    } catch (e: any) {
      setUploadResult({ error: e?.response?.data?.detail || "Upload failed" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this DAM entry?")) return;
    await api.delete(`/dam/${id}`);
    fetchEntries();
    fetchSummary();
  }

  // Group entries by location
  const byLocation = entries.reduce(
    (acc, e) => {
      if (!acc[e.location]) acc[e.location] = [];
      acc[e.location].push(e);
      return acc;
    },
    {} as Record<string, DamEntry[]>,
  );

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <Layout title="DAM Purchases">
      <div className="space-y-6">
        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">DAM Purchases</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Day ahead market · Manual entry · File upload
            </p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-red-400"
            />
            <Link href="/portfolio/position">
              <button className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50">
                ← Position Screen
              </button>
            </Link>
          </div>
        </div>

        {/* ── KPIs ── */}
        {summary?.stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide">
                Total MW
              </p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {fmt(summary.stats.total_mw, 0)}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Across all locations
              </p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide">
                Avg DAM Price
              </p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                ${fmt(summary.stats.avg_dam_price)}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                ${fmt(summary.stats.min_price)} – $
                {fmt(summary.stats.max_price)}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide">
                Total Cost
              </p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                $
                {Number(summary.stats.total_cost || 0).toLocaleString("en-US", {
                  maximumFractionDigits: 0,
                })}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide">
                Deals
              </p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {summary.stats.deals || 0}
              </p>
              <p className="text-xs text-slate-400 mt-1">{selectedDate}</p>
            </div>
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="border-b border-slate-200">
          <div className="flex gap-6">
            {(["entry", "book", "summary"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-3 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                  activeTab === tab
                    ? "border-red-600 text-red-600"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {tab === "entry"
                  ? "Manual Entry"
                  : tab === "book"
                    ? "DAM Book"
                    : "Summary"}
              </button>
            ))}
          </div>
        </div>

        {/* ── Manual Entry Tab ── */}
        {activeTab === "entry" && (
          <div className="space-y-4">
            {/* Upload section */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-3">
                Upload DAM Spreadsheet
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="date"
                  value={uploadDate}
                  onChange={(e) => setUploadDate(e.target.value)}
                  className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-red-400"
                />
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-200 file:text-slate-700 hover:file:bg-slate-300"
                />
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="px-4 py-2 text-sm bg-slate-700 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors"
                >
                  {uploading ? "Uploading..." : "↑ Upload"}
                </button>
              </div>
              {uploadResult && (
                <div
                  className={`mt-3 p-3 rounded-lg text-xs ${
                    uploadResult.error
                      ? "bg-red-50 text-red-600 border border-red-200"
                      : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  }`}
                >
                  {uploadResult.error
                    ? `Error: ${uploadResult.error}`
                    : `✓ ${uploadResult.inserted} inserted · ${uploadResult.updated} updated · ${uploadResult.skipped} skipped`}
                  {uploadResult.errors?.length > 0 && (
                    <div className="mt-1 text-red-500">
                      {uploadResult.errors
                        .slice(0, 3)
                        .map((e: string, i: number) => (
                          <div key={i}>{e}</div>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Manual entry form */}
            <div className="bg-white rounded-xl border-2 border-red-100 p-5 space-y-4">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                Manual Entry
              </p>

              {/* Form header fields */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div>
                  <label className="text-xs text-slate-500 font-medium">
                    Oper Date
                  </label>
                  <input
                    type="date"
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-medium">
                    Location
                  </label>
                  <select
                    value={entryLocation}
                    onChange={(e) => setEntryLocation(e.target.value)}
                    className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-400"
                  >
                    {LOCATIONS.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-medium">
                    Deal Number
                  </label>
                  <input
                    type="text"
                    value={entryDeal}
                    onChange={(e) => setEntryDeal(e.target.value)}
                    placeholder="PW1467279NL"
                    className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-red-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-medium">
                    Counterparty
                  </label>
                  <input
                    type="text"
                    value={entryCP}
                    onChange={(e) => setEntryCP(e.target.value)}
                    placeholder="QLUMN"
                    className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-medium">
                    Buy/Sell
                  </label>
                  <div className="mt-1 flex gap-2">
                    {["Buy", "Sell"].map((bs) => (
                      <button
                        key={bs}
                        onClick={() => setEntryBS(bs)}
                        className={`flex-1 py-2 text-sm rounded-lg border transition-colors ${
                          entryBS === bs
                            ? bs === "Buy"
                              ? "bg-emerald-600 text-white border-emerald-600"
                              : "bg-red-600 text-white border-red-600"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {bs}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Quick fill */}
              <div className="flex items-center gap-3 bg-slate-50 rounded-lg p-3">
                <span className="text-xs text-slate-500 font-medium">
                  Quick Fill:
                </span>
                <input
                  type="number"
                  placeholder="Volume MW"
                  step="0.01"
                  onWheel={(e) => e.currentTarget.blur()}
                  className="w-28 border border-slate-200 rounded px-2 py-1 text-xs font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  onBlur={(e) => {
                    if (e.target.value) fillVolume(e.target.value);
                    e.target.value = "";
                  }}
                />
                <input
                  type="number"
                  placeholder="Price $/MWh"
                  step="0.01"
                  onWheel={(e) => e.currentTarget.blur()}
                  className="w-28 border border-slate-200 rounded px-2 py-1 text-xs font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  onBlur={(e) => {
                    if (e.target.value) fillPrice(e.target.value);
                    e.target.value = "";
                  }}
                />
                <span className="text-xs text-slate-400">
                  Fill all non-zero hours
                </span>
              </div>

              {/* Hourly grid */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-2 py-2 text-slate-500 font-medium w-16">
                        HE
                      </th>
                      <th className="text-left px-2 py-2 text-slate-500 font-medium">
                        Volume (MW)
                      </th>
                      <th className="text-left px-2 py-2 text-slate-500 font-medium">
                        DAM Price ($/MWh)
                      </th>
                      <th className="text-left px-2 py-2 text-slate-500 font-medium w-16">
                        HE
                      </th>
                      <th className="text-left px-2 py-2 text-slate-500 font-medium">
                        Volume (MW)
                      </th>
                      <th className="text-left px-2 py-2 text-slate-500 font-medium">
                        DAM Price ($/MWh)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((he) => (
                      <tr key={he} className="border-b border-slate-100">
                        {/* Left column HE01-12 */}
                        <td className="px-2 py-1 font-mono text-slate-600 font-semibold">
                          HE{String(he).padStart(2, "0")}
                        </td>
                        <td className="px-2 py-1">
                          <input
                            type="number"
                            value={hours[he].volume_mw}
                            onChange={(e) =>
                              setHourField(he, "volume_mw", e.target.value)
                            }
                            onBlur={(e) => {
                              if (e.target.value)
                                setHourField(
                                  he,
                                  "volume_mw",
                                  Number(e.target.value).toFixed(2),
                                );
                            }}
                            placeholder="0.00"
                            step="0.01"
                            onWheel={(e) => e.currentTarget.blur()}
                            className="w-full border border-slate-200 rounded px-2 py-1 font-mono focus:outline-none focus:border-red-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            type="number"
                            value={hours[he].dam_price}
                            onChange={(e) =>
                              setHourField(he, "dam_price", e.target.value)
                            }
                            onBlur={(e) => {
                              if (e.target.value)
                                setHourField(
                                  he,
                                  "dam_price",
                                  Number(e.target.value).toFixed(2),
                                );
                            }}
                            placeholder="0.00"
                            step="0.01"
                            onWheel={(e) => e.currentTarget.blur()}
                            className="w-full border border-slate-200 rounded px-2 py-1 font-mono focus:outline-none focus:border-red-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </td>

                        {/* Right column HE13-24 */}
                        <td className="px-2 py-1 font-mono text-slate-600 font-semibold">
                          HE{String(he + 12).padStart(2, "0")}
                        </td>
                        <td className="px-2 py-1">
                          <input
                            type="number"
                            value={hours[he + 12].volume_mw}
                            onChange={(e) =>
                              setHourField(he + 12, "volume_mw", e.target.value)
                            }
                            onBlur={(e) => {
                              if (e.target.value)
                                setHourField(
                                  he + 12,
                                  "volume_mw",
                                  Number(e.target.value).toFixed(2),
                                );
                            }}
                            placeholder="0.00"
                            step="0.01"
                            onWheel={(e) => e.currentTarget.blur()}
                            className="w-full border border-slate-200 rounded px-2 py-1 font-mono focus:outline-none focus:border-red-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            type="number"
                            value={hours[he + 12].dam_price}
                            onChange={(e) =>
                              setHourField(he + 12, "dam_price", e.target.value)
                            }
                            onBlur={(e) => {
                              if (e.target.value)
                                setHourField(
                                  he + 12,
                                  "dam_price",
                                  Number(e.target.value).toFixed(2),
                                );
                            }}
                            placeholder="0.00"
                            step="0.01"
                            onWheel={(e) => e.currentTarget.blur()}
                            className="w-full border border-slate-200 rounded px-2 py-1 font-mono focus:outline-none focus:border-red-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Error / success */}
              {entryError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
                  ⚠ {entryError}
                </p>
              )}
              {entrySuccess && (
                <p className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg">
                  ✓ {entrySuccess}
                </p>
              )}

              {/* Save */}
              <div className="flex justify-end pt-2 border-t">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-6 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-semibold transition-colors"
                >
                  {saving ? "Saving..." : "Save DAM Entry"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── DAM Book Tab ── */}
        {activeTab === "book" && (
          <div className="space-y-4">
            {loading ? (
              <div className="text-center py-12 text-slate-400 text-sm">
                Loading...
              </div>
            ) : entries.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center">
                <p className="text-slate-400 text-sm">
                  No DAM entries for {selectedDate}
                </p>
              </div>
            ) : (
              Object.entries(byLocation).map(([loc, locEntries]) => (
                <div
                  key={loc}
                  className="bg-white rounded-xl border border-slate-200 overflow-hidden"
                >
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
                    <div className="flex items-center gap-3">
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded border ${
                          LOCATION_COLORS[loc] ||
                          "bg-slate-100 text-slate-600 border-slate-200"
                        }`}
                      >
                        {loc}
                      </span>
                      <span className="text-xs text-slate-500">
                        {locEntries.length} hours ·{" "}
                        {fmt(
                          locEntries.reduce(
                            (s, e) => s + Number(e.volume_mw),
                            0,
                          ),
                          0,
                        )}{" "}
                        total MW · Avg $
                        {fmt(
                          locEntries.reduce(
                            (s, e) => s + Number(e.dam_price),
                            0,
                          ) / locEntries.length,
                        )}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400">
                      {locEntries[0]?.deal_number} ·{" "}
                      {locEntries[0]?.counterparty}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className="text-left px-3 py-2 text-slate-400 font-medium">
                            HE
                          </th>
                          <th className="text-right px-3 py-2 text-slate-400 font-medium">
                            Volume MW
                          </th>
                          <th className="text-right px-3 py-2 text-slate-400 font-medium">
                            DAM Price
                          </th>
                          <th className="text-right px-3 py-2 text-slate-400 font-medium">
                            Total Cost
                          </th>
                          <th className="text-left px-3 py-2 text-slate-400 font-medium">
                            Source
                          </th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {locEntries.map((e) => (
                          <tr
                            key={e.id}
                            className="border-b border-slate-50 hover:bg-slate-50"
                          >
                            <td className="px-3 py-1.5 font-mono font-semibold text-slate-700">
                              HE{String(e.hour_ending).padStart(2, "0")}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono text-slate-900">
                              {fmt(e.volume_mw)} MW
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono text-slate-900">
                              ${fmt(e.dam_price)}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono text-slate-600">
                              ${fmt(e.total_cost)}
                            </td>
                            <td className="px-3 py-1.5 text-slate-400">
                              {e.source === "MIS_AUTO" ? "Upload" : "Manual"}
                            </td>
                            <td className="px-3 py-1.5">
                              <button
                                onClick={() => handleDelete(e.id)}
                                className="text-red-400 hover:text-red-600 text-xs"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Summary Tab ── */}
        {activeTab === "summary" && summary && (
          <div className="space-y-4">
            {/* By location */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-700">
                  DAM Position by Location
                </h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left px-4 py-2 text-xs text-slate-500 uppercase font-medium">
                      Location
                    </th>
                    <th className="text-left px-4 py-2 text-xs text-slate-500 uppercase font-medium">
                      Zone
                    </th>
                    <th className="text-right px-4 py-2 text-xs text-slate-500 uppercase font-medium">
                      Hours
                    </th>
                    <th className="text-right px-4 py-2 text-xs text-slate-500 uppercase font-medium">
                      Total MW
                    </th>
                    <th className="text-right px-4 py-2 text-xs text-slate-500 uppercase font-medium">
                      Avg MW
                    </th>
                    <th className="text-right px-4 py-2 text-xs text-slate-500 uppercase font-medium">
                      Avg Price
                    </th>
                    <th className="text-right px-4 py-2 text-xs text-slate-500 uppercase font-medium">
                      Total Cost
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.by_location.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="text-center py-8 text-slate-400 text-sm"
                      >
                        No DAM entries for {selectedDate}
                      </td>
                    </tr>
                  ) : (
                    summary.by_location.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-4 py-2">
                          <span
                            className={`text-xs font-medium px-2 py-0.5 rounded border ${
                              LOCATION_COLORS[r.location] ||
                              "bg-slate-100 text-slate-600 border-slate-200"
                            }`}
                          >
                            {r.location}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-xs text-slate-500">
                          {r.zone}
                        </td>
                        <td className="px-4 py-2 text-right text-slate-700">
                          {r.hours}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-slate-900 font-medium">
                          {fmt(r.total_mw, 0)} MW
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-slate-600">
                          {fmt(r.avg_mw)} MW
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-slate-900">
                          ${fmt(r.avg_price)}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-slate-600">
                          $
                          {Number(r.total_cost).toLocaleString("en-US", {
                            maximumFractionDigits: 0,
                          })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
