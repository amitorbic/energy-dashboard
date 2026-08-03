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
            <h1 className="text-xl font-bold" style={{ color: "var(--ct-text-primary)" }}>DAM Purchases</h1>
            <p className="text-xs mt-0.5" style={{ color: "var(--ct-text-muted)" }}>
              Day ahead market · Manual entry · File upload
            </p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-sm border rounded-[var(--r-lg)] px-3 py-2 outline-none focus:border-[var(--accent-light)]"
              style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
            />
            <Link href="/portfolio/position">
              <button className="px-3 py-2 text-sm border rounded-[var(--r-lg)] hover:bg-[var(--ct-surface-hover)]"
                style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)", color: "var(--ct-text-secondary)" }}>
                ← Position Screen
              </button>
            </Link>
          </div>
        </div>

        {/* ── KPIs ── */}
        {summary?.stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-[var(--r-lg)] border p-4" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
              <p className="text-xs uppercase tracking-wide" style={{ color: "var(--ct-text-muted)" }}>
                Total MW
              </p>
              <p className="text-2xl font-bold mt-1" style={{ color: "var(--ct-text-primary)" }}>
                {fmt(summary.stats.total_mw, 0)}
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--ct-text-muted)" }}>
                Across all locations
              </p>
            </div>
            <div className="rounded-[var(--r-lg)] border p-4" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
              <p className="text-xs uppercase tracking-wide" style={{ color: "var(--ct-text-muted)" }}>
                Avg DAM Price
              </p>
              <p className="text-2xl font-bold mt-1" style={{ color: "var(--ct-text-primary)" }}>
                ${fmt(summary.stats.avg_dam_price)}
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--ct-text-muted)" }}>
                ${fmt(summary.stats.min_price)} – $
                {fmt(summary.stats.max_price)}
              </p>
            </div>
            <div className="rounded-[var(--r-lg)] border p-4" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
              <p className="text-xs uppercase tracking-wide" style={{ color: "var(--ct-text-muted)" }}>
                Total Cost
              </p>
              <p className="text-2xl font-bold mt-1" style={{ color: "var(--ct-text-primary)" }}>
                $
                {Number(summary.stats.total_cost || 0).toLocaleString("en-US", {
                  maximumFractionDigits: 0,
                })}
              </p>
            </div>
            <div className="rounded-[var(--r-lg)] border p-4" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
              <p className="text-xs uppercase tracking-wide" style={{ color: "var(--ct-text-muted)" }}>
                Deals
              </p>
              <p className="text-2xl font-bold mt-1" style={{ color: "var(--ct-text-primary)" }}>
                {summary.stats.deals || 0}
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--ct-text-muted)" }}>{selectedDate}</p>
            </div>
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="border-b" style={{ borderColor: "var(--ct-border-default)" }}>
          <div className="flex gap-6">
            {(["entry", "book", "summary"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="pb-3 text-sm font-medium capitalize transition-colors border-b-2 -mb-px"
                style={activeTab === tab
                  ? { borderColor: "var(--accent-light)", color: "var(--accent-light)" }
                  : { borderColor: "transparent", color: "var(--ct-text-muted)" }}
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
            <div className="rounded-[var(--r-lg)] border p-4" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--ct-text-secondary)" }}>
                Upload DAM Spreadsheet
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="date"
                  value={uploadDate}
                  onChange={(e) => setUploadDate(e.target.value)}
                  className="text-sm border rounded-[var(--r-lg)] px-3 py-2 outline-none focus:border-[var(--accent-light)]"
                  style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
                />
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-[var(--r-lg)] file:border-0 file:text-xs file:font-semibold hover:file:opacity-90"
                  style={{ color: "var(--ct-text-secondary)" }}
                />
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="px-4 py-2 text-sm rounded-[var(--r-lg)] disabled:opacity-50 transition-colors hover:opacity-90"
                  style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
                >
                  {uploading ? "Uploading..." : "↑ Upload"}
                </button>
              </div>
              {uploadResult && (
                <div
                  className="mt-3 p-3 rounded-[var(--r-lg)] text-xs border"
                  style={uploadResult.error
                    ? { background: "var(--danger-light-tint)", color: "var(--danger-light)", borderColor: "var(--danger-light-tint)" }
                    : { background: "var(--success-light-tint)", color: "var(--success-light)", borderColor: "var(--success-light-tint)" }}
                >
                  {uploadResult.error
                    ? `Error: ${uploadResult.error}`
                    : `✓ ${uploadResult.inserted} inserted · ${uploadResult.updated} updated · ${uploadResult.skipped} skipped`}
                  {uploadResult.errors?.length > 0 && (
                    <div className="mt-1" style={{ color: "var(--danger-light)" }}>
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
            <div className="rounded-[var(--r-lg)] border-2 p-5 space-y-4" style={{ background: "var(--ct-surface)", borderColor: "var(--accent-light-tint)" }}>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ct-text-secondary)" }}>
                Manual Entry
              </p>

              {/* Form header fields */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div>
                  <label className="text-xs font-medium" style={{ color: "var(--ct-text-muted)" }}>
                    Oper Date
                  </label>
                  <input
                    type="date"
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    className="mt-1 w-full border rounded-[var(--r-lg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-light)]"
                    style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium" style={{ color: "var(--ct-text-muted)" }}>
                    Location
                  </label>
                  <select
                    value={entryLocation}
                    onChange={(e) => setEntryLocation(e.target.value)}
                    className="mt-1 w-full border rounded-[var(--r-lg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-light)]"
                    style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
                  >
                    {LOCATIONS.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium" style={{ color: "var(--ct-text-muted)" }}>
                    Deal Number
                  </label>
                  <input
                    type="text"
                    value={entryDeal}
                    onChange={(e) => setEntryDeal(e.target.value)}
                    placeholder="PW1467279NL"
                    className="mt-1 w-full border rounded-[var(--r-lg)] px-3 py-2 text-sm font-mono outline-none focus:border-[var(--accent-light)]"
                    style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium" style={{ color: "var(--ct-text-muted)" }}>
                    Counterparty
                  </label>
                  <input
                    type="text"
                    value={entryCP}
                    onChange={(e) => setEntryCP(e.target.value)}
                    placeholder="QLUMN"
                    className="mt-1 w-full border rounded-[var(--r-lg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-light)]"
                    style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium" style={{ color: "var(--ct-text-muted)" }}>
                    Buy/Sell
                  </label>
                  <div className="mt-1 flex gap-2">
                    {["Buy", "Sell"].map((bs) => (
                      <button
                        key={bs}
                        onClick={() => setEntryBS(bs)}
                        className="flex-1 py-2 text-sm rounded-[var(--r-lg)] border transition-colors"
                        style={entryBS === bs
                          ? bs === "Buy"
                            ? { background: "var(--success-light)", color: "#ffffff", borderColor: "var(--success-light)" }
                            : { background: "var(--danger-light)", color: "#ffffff", borderColor: "var(--danger-light)" }
                          : { borderColor: "var(--ct-border-default)", color: "var(--ct-text-secondary)" }}
                      >
                        {bs}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Quick fill */}
              <div className="flex items-center gap-3 rounded-[var(--r-lg)] p-3" style={{ background: "var(--ct-surface-hover)" }}>
                <span className="text-xs font-medium" style={{ color: "var(--ct-text-muted)" }}>
                  Quick Fill:
                </span>
                <input
                  type="number"
                  placeholder="Volume MW"
                  step="0.01"
                  onWheel={(e) => e.currentTarget.blur()}
                  className="w-28 border rounded-[var(--r-sm)] px-2 py-1 text-xs font-mono outline-none focus:border-[var(--accent-light)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
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
                  className="w-28 border rounded-[var(--r-sm)] px-2 py-1 text-xs font-mono outline-none focus:border-[var(--accent-light)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
                  onBlur={(e) => {
                    if (e.target.value) fillPrice(e.target.value);
                    e.target.value = "";
                  }}
                />
                <span className="text-xs" style={{ color: "var(--ct-text-muted)" }}>
                  Fill all non-zero hours
                </span>
              </div>

              {/* Hourly grid */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}>
                      <th className="text-left px-2 py-2 font-medium w-16" style={{ color: "var(--ct-text-muted)" }}>
                        HE
                      </th>
                      <th className="text-left px-2 py-2 font-medium" style={{ color: "var(--ct-text-muted)" }}>
                        Volume (MW)
                      </th>
                      <th className="text-left px-2 py-2 font-medium" style={{ color: "var(--ct-text-muted)" }}>
                        DAM Price ($/MWh)
                      </th>
                      <th className="text-left px-2 py-2 font-medium w-16" style={{ color: "var(--ct-text-muted)" }}>
                        HE
                      </th>
                      <th className="text-left px-2 py-2 font-medium" style={{ color: "var(--ct-text-muted)" }}>
                        Volume (MW)
                      </th>
                      <th className="text-left px-2 py-2 font-medium" style={{ color: "var(--ct-text-muted)" }}>
                        DAM Price ($/MWh)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((he) => (
                      <tr key={he} className="border-b" style={{ borderColor: "var(--ct-border-subtle)" }}>
                        {/* Left column HE01-12 */}
                        <td className="px-2 py-1 font-mono font-semibold" style={{ color: "var(--ct-text-secondary)" }}>
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
                            className="w-full border rounded-[var(--r-sm)] px-2 py-1 font-mono outline-none focus:border-[var(--accent-light)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
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
                            className="w-full border rounded-[var(--r-sm)] px-2 py-1 font-mono outline-none focus:border-[var(--accent-light)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
                          />
                        </td>

                        {/* Right column HE13-24 */}
                        <td className="px-2 py-1 font-mono font-semibold" style={{ color: "var(--ct-text-secondary)" }}>
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
                            className="w-full border rounded-[var(--r-sm)] px-2 py-1 font-mono outline-none focus:border-[var(--accent-light)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
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
                            className="w-full border rounded-[var(--r-sm)] px-2 py-1 font-mono outline-none focus:border-[var(--accent-light)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Error / success */}
              {entryError && (
                <p className="text-xs px-3 py-2 rounded-[var(--r-lg)] border" style={{ color: "var(--danger-light)", background: "var(--danger-light-tint)", borderColor: "var(--danger-light-tint)" }}>
                  ⚠ {entryError}
                </p>
              )}
              {entrySuccess && (
                <p className="text-xs px-3 py-2 rounded-[var(--r-lg)] border" style={{ color: "var(--success-light)", background: "var(--success-light-tint)", borderColor: "var(--success-light-tint)" }}>
                  ✓ {entrySuccess}
                </p>
              )}

              {/* Save */}
              <div className="flex justify-end pt-2 border-t" style={{ borderColor: "var(--ct-border-default)" }}>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-6 py-2 text-sm rounded-[var(--r-lg)] disabled:opacity-50 font-semibold transition-colors hover:opacity-90"
                  style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
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
              <div className="text-center py-12 text-sm" style={{ color: "var(--ct-text-muted)" }}>
                Loading...
              </div>
            ) : entries.length === 0 ? (
              <div className="rounded-[var(--r-lg)] border border-dashed p-12 text-center" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
                <p className="text-sm" style={{ color: "var(--ct-text-muted)" }}>
                  No DAM entries for {selectedDate}
                </p>
              </div>
            ) : (
              Object.entries(byLocation).map(([loc, locEntries]) => (
                <div
                  key={loc}
                  className="rounded-[var(--r-lg)] border overflow-hidden"
                  style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}
                >
                  <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--ct-border-subtle)", background: "var(--ct-surface-hover)" }}>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-[var(--r-sm)]"
                        style={{ background: "var(--accent-light-tint)", color: "var(--accent-light)" }}>
                        {loc}
                      </span>
                      <span className="text-xs" style={{ color: "var(--ct-text-muted)" }}>
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
                    <span className="text-xs" style={{ color: "var(--ct-text-muted)" }}>
                      {locEntries[0]?.deal_number} ·{" "}
                      {locEntries[0]?.counterparty}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b" style={{ borderColor: "var(--ct-border-subtle)" }}>
                          <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--ct-text-muted)" }}>
                            HE
                          </th>
                          <th className="text-right px-3 py-2 font-medium" style={{ color: "var(--ct-text-muted)" }}>
                            Volume MW
                          </th>
                          <th className="text-right px-3 py-2 font-medium" style={{ color: "var(--ct-text-muted)" }}>
                            DAM Price
                          </th>
                          <th className="text-right px-3 py-2 font-medium" style={{ color: "var(--ct-text-muted)" }}>
                            Total Cost
                          </th>
                          <th className="text-left px-3 py-2 font-medium" style={{ color: "var(--ct-text-muted)" }}>
                            Source
                          </th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {locEntries.map((e) => (
                          <tr
                            key={e.id}
                            className="border-b hover:bg-[var(--ct-surface-hover)]"
                            style={{ borderColor: "var(--ct-border-subtle)" }}
                          >
                            <td className="px-3 py-1.5 font-mono font-semibold" style={{ color: "var(--ct-text-secondary)" }}>
                              HE{String(e.hour_ending).padStart(2, "0")}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono" style={{ color: "var(--ct-text-primary)" }}>
                              {fmt(e.volume_mw)} MW
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono" style={{ color: "var(--ct-text-primary)" }}>
                              ${fmt(e.dam_price)}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono" style={{ color: "var(--ct-text-secondary)" }}>
                              ${fmt(e.total_cost)}
                            </td>
                            <td className="px-3 py-1.5" style={{ color: "var(--ct-text-muted)" }}>
                              {e.source === "MIS_AUTO" ? "Upload" : "Manual"}
                            </td>
                            <td className="px-3 py-1.5">
                              <button
                                onClick={() => handleDelete(e.id)}
                                className="text-xs hover:opacity-80"
                                style={{ color: "var(--danger-light)" }}
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
            <div className="rounded-[var(--r-lg)] border overflow-hidden" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
              <div className="px-4 py-3 border-b" style={{ borderColor: "var(--ct-border-subtle)" }}>
                <h3 className="text-sm font-semibold" style={{ color: "var(--ct-text-primary)" }}>
                  DAM Position by Location
                </h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-subtle)" }}>
                    <th className="text-left px-4 py-2 text-xs uppercase font-medium" style={{ color: "var(--ct-text-muted)" }}>
                      Location
                    </th>
                    <th className="text-left px-4 py-2 text-xs uppercase font-medium" style={{ color: "var(--ct-text-muted)" }}>
                      Zone
                    </th>
                    <th className="text-right px-4 py-2 text-xs uppercase font-medium" style={{ color: "var(--ct-text-muted)" }}>
                      Hours
                    </th>
                    <th className="text-right px-4 py-2 text-xs uppercase font-medium" style={{ color: "var(--ct-text-muted)" }}>
                      Total MW
                    </th>
                    <th className="text-right px-4 py-2 text-xs uppercase font-medium" style={{ color: "var(--ct-text-muted)" }}>
                      Avg MW
                    </th>
                    <th className="text-right px-4 py-2 text-xs uppercase font-medium" style={{ color: "var(--ct-text-muted)" }}>
                      Avg Price
                    </th>
                    <th className="text-right px-4 py-2 text-xs uppercase font-medium" style={{ color: "var(--ct-text-muted)" }}>
                      Total Cost
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: "var(--ct-border-subtle)" }}>
                  {summary.by_location.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="text-center py-8 text-sm"
                        style={{ color: "var(--ct-text-muted)" }}
                      >
                        No DAM entries for {selectedDate}
                      </td>
                    </tr>
                  ) : (
                    summary.by_location.map((r, i) => (
                      <tr key={i} className="hover:bg-[var(--ct-surface-hover)]">
                        <td className="px-4 py-2">
                          <span className="text-xs font-medium px-2 py-0.5 rounded-[var(--r-sm)]"
                            style={{ background: "var(--accent-light-tint)", color: "var(--accent-light)" }}>
                            {r.location}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-xs" style={{ color: "var(--ct-text-muted)" }}>
                          {r.zone}
                        </td>
                        <td className="px-4 py-2 text-right" style={{ color: "var(--ct-text-secondary)" }}>
                          {r.hours}
                        </td>
                        <td className="px-4 py-2 text-right font-mono font-medium" style={{ color: "var(--ct-text-primary)" }}>
                          {fmt(r.total_mw, 0)} MW
                        </td>
                        <td className="px-4 py-2 text-right font-mono" style={{ color: "var(--ct-text-secondary)" }}>
                          {fmt(r.avg_mw)} MW
                        </td>
                        <td className="px-4 py-2 text-right font-mono" style={{ color: "var(--ct-text-primary)" }}>
                          ${fmt(r.avg_price)}
                        </td>
                        <td className="px-4 py-2 text-right font-mono" style={{ color: "var(--ct-text-secondary)" }}>
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
