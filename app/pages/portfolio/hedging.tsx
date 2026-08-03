import React, { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import api from "../../utils/api";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Hedge {
  id: number;
  deal_number: string;
  trade_date: string;
  delivery_start: string;
  delivery_end: string;
  block_type: string;
  zone: string;
  location: string;
  volume_mw: number;
  price: number;
  instrument_type: string;
  hr_value: number | null;
  gas_price: number | null;
  effective_price: number;
  counterparty: string;
  source: string;
  notes: string;
  delivery_days: number;
  entered_at: string;
}

interface HedgeSummary {
  stats: {
    total_deals: number;
    total_mw: number;
    total_mwh: number;
    avg_portfolio_price: number;
    earliest_delivery: string;
    latest_delivery: string;
    unique_deals: number;
  };
  by_zone: any[];
  monthly: any[];
}

const ZONES = ["HOUSTON", "NORTH", "SOUTH", "WEST"];
// Replace Zone selector with Location
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

const LOCATION_TO_ZONE: Record<string, string> = {
  HB_HOUSTON: "HOUSTON",
  HB_NORTH: "NORTH",
  HB_SOUTH: "SOUTH",
  HB_WEST: "WEST",
  LZ_HOUSTON: "HOUSTON",
  LZ_NORTH: "NORTH",
  LZ_SOUTH: "SOUTH",
  LZ_WEST: "WEST",
};
const BLOCK_TYPES = ["7x16", "7x8", "5x16", "7x24", "HOURLY"];
const INSTRUMENTS = ["FIXED", "HEAT_RATE", "GAS_BASIS", "INDEX"];
const SOURCES = ["ICE", "BILATERAL", "NYMEX"];

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
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const EMPTY_FORM = {
  deal_number: "",
  trade_date: today(),
  delivery_start: "",
  delivery_end: "",
  block_type: "7x16",
  location: "LZ_NORTH",
  zone: "NORTH",
  volume_mw: "",
  price: "",
  instrument_type: "FIXED",
  hr_value: "",
  gas_price: "",
  counterparty: "",
  source: "ICE",
  notes: "",
};

// ── Component ──────────────────────────────────────────────────────────────────
export default function HedgingPage() {
  const [hedges, setHedges] = useState<Hedge[]>([]);
  const [summary, setSummary] = useState<HedgeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [filterZone, setFilterZone] = useState("");
  const [activeTab, setActiveTab] = useState<"book" | "summary">("book");

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    try {
      const [h, s] = await Promise.all([
        api.get("/hedging"),
        api.get("/hedging/summary"),
      ]);
      setHedges(h.data);
      setSummary(s.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function setField(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
    setError("");
  }

  // Computed effective price for HR instruments
  const effectivePrice =
    form.instrument_type === "HEAT_RATE" && form.hr_value && form.gas_price
      ? (parseFloat(form.hr_value) * parseFloat(form.gas_price)).toFixed(4)
      : form.price;

  async function handleSave() {
    setError("");
    if (!form.deal_number.trim()) {
      setError("Deal number is mandatory");
      return;
    }
    if (!form.delivery_start) {
      setError("Delivery start date required");
      return;
    }
    if (!form.delivery_end) {
      setError("Delivery end date required");
      return;
    }
    if (!form.volume_mw || parseFloat(form.volume_mw) <= 0) {
      setError("Volume must be greater than 0");
      return;
    }
    if (
      form.instrument_type === "FIXED" &&
      (!form.price || parseFloat(form.price) <= 0)
    ) {
      setError("Price required for Fixed instrument");
      return;
    }
    if (
      form.instrument_type === "HEAT_RATE" &&
      (!form.hr_value || !form.gas_price)
    ) {
      setError("Heat rate and gas price required");
      return;
    }
    if (new Date(form.delivery_end) < new Date(form.delivery_start)) {
      setError("End date must be after start date");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        location: form.location, // ← make sure this is here
        zone: LOCATION_TO_ZONE[form.location] || form.zone,
        volume_mw: parseFloat(form.volume_mw),
        price:
          form.instrument_type === "HEAT_RATE"
            ? parseFloat(form.hr_value) * parseFloat(form.gas_price)
            : parseFloat(form.price),
        hr_value: form.hr_value ? parseFloat(form.hr_value) : null,
        gas_price: form.gas_price ? parseFloat(form.gas_price) : null,
      };

      if (editId) {
        await api.put(`/hedging/${editId}`, payload);
      } else {
        await api.post("/hedging", payload);
      }

      setForm({ ...EMPTY_FORM });
      setShowForm(false);
      setEditId(null);
      await fetchAll();
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to save hedge");
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(h: Hedge) {
    setForm({
      deal_number: h.deal_number,
      trade_date: h.trade_date?.split("T")[0] || today(),
      delivery_start: h.delivery_start?.split("T")[0] || "",
      delivery_end: h.delivery_end?.split("T")[0] || "",
      block_type: h.block_type,
      location: h.location || "LZ_NORTH", // ← add
      zone: h.zone || "NORTH", // ← add
      volume_mw: String(h.volume_mw),
      price: String(h.price),
      instrument_type: h.instrument_type,
      hr_value: h.hr_value ? String(h.hr_value) : "",
      gas_price: h.gas_price ? String(h.gas_price) : "",
      counterparty: h.counterparty || "",
      source: h.source || "ICE",
      notes: h.notes || "",
    });
    setEditId(h.id);
    setShowForm(true);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(id: number, deal: string) {
    if (!confirm(`Delete deal ${deal}? This cannot be undone.`)) return;
    await api.delete(`/hedging/${id}`);
    await fetchAll();
  }

  const filtered = filterZone
    ? hedges.filter((h) => h.zone === filterZone)
    : hedges;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <Layout title="Hedge Book">
      <div className="space-y-6">
        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold" style={{ color: "var(--ct-text-primary)" }}>Hedge Book</h1>
            <p className="text-xs mt-0.5" style={{ color: "var(--ct-text-muted)" }}>
              Forward purchases · DAM positions · Net supply
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/portfolio/position">
              <button className="px-3 py-2 text-sm border rounded-[var(--r-lg)] hover:bg-[var(--ct-surface-hover)]"
                style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)", color: "var(--ct-text-secondary)" }}>
                ← Position Screen
              </button>
            </Link>
            <button
              onClick={() => {
                setShowForm((v) => !v);
                setEditId(null);
                setForm({ ...EMPTY_FORM });
                setError("");
              }}
              className="px-4 py-2 text-sm rounded-[var(--r-lg)] transition-colors hover:opacity-90"
              style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
            >
              {showForm ? "✕ Cancel" : "+ Add Hedge"}
            </button>
          </div>
        </div>

        {/* ── Summary KPIs ── */}
        {summary?.stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-[var(--r-lg)] border p-4" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
              <p className="text-xs uppercase tracking-wide" style={{ color: "var(--ct-text-muted)" }}>
                Total Deals
              </p>
              <p className="text-2xl font-bold mt-1" style={{ color: "var(--ct-text-primary)" }}>
                {summary.stats.unique_deals || 0}
              </p>
            </div>
            <div className="rounded-[var(--r-lg)] border p-4" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
              <p className="text-xs uppercase tracking-wide" style={{ color: "var(--ct-text-muted)" }}>
                Total MW Hedged
              </p>
              <div className="rounded-[var(--r-lg)] border p-4" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
                <p className="text-xs uppercase tracking-wide" style={{ color: "var(--ct-text-muted)" }}>
                  Total MW (Block Size)
                </p>
                <p className="text-2xl font-bold mt-1" style={{ color: "var(--ct-text-primary)" }}>
                  {Number(summary.stats.total_mw || 0).toLocaleString()}
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--ct-text-muted)" }}>MW per hour</p>
              </div>

              <div className="rounded-[var(--r-lg)] border p-4" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
                <p className="text-xs uppercase tracking-wide" style={{ color: "var(--ct-text-muted)" }}>
                  Total MWh Hedged
                </p>
                <p className="text-2xl font-bold mt-1" style={{ color: "var(--ct-text-primary)" }}>
                  {Number(summary.stats.total_mwh || 0).toLocaleString()}
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--ct-text-muted)" }}>
                  Total energy hedged
                </p>
              </div>
            </div>
            <div className="rounded-[var(--r-lg)] border p-4" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
              <p className="text-xs uppercase tracking-wide" style={{ color: "var(--ct-text-muted)" }}>
                Avg Portfolio Price
              </p>
              <p className="text-2xl font-bold mt-1" style={{ color: "var(--ct-text-primary)" }}>
                ${fmt(summary.stats.avg_portfolio_price, 2)}
              </p>
            </div>
            <div className="rounded-[var(--r-lg)] border p-4" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
              <p className="text-xs uppercase tracking-wide" style={{ color: "var(--ct-text-muted)" }}>
                Delivery Window
              </p>
              <p className="text-sm font-bold mt-1" style={{ color: "var(--ct-text-primary)" }}>
                {fmtDate(summary.stats.earliest_delivery)}
              </p>
              <p className="text-xs" style={{ color: "var(--ct-text-muted)" }}>
                to {fmtDate(summary.stats.latest_delivery)}
              </p>
            </div>
          </div>
        )}

        {/* ── Add/Edit Form ── */}
        {showForm && (
          <div className="rounded-[var(--r-lg)] border-2 p-6 space-y-5" style={{ background: "var(--ct-surface)", borderColor: "var(--accent-light-tint)" }}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold" style={{ color: "var(--ct-text-primary)" }}>
                {editId
                  ? `Edit Hedge — ${form.deal_number}`
                  : "New Hedge Entry"}
              </h2>
              {error && (
                <p className="text-xs px-3 py-1.5 rounded-[var(--r-lg)] border" style={{ color: "var(--danger-light)", background: "var(--danger-light-tint)", borderColor: "var(--danger-light-tint)" }}>
                  ⚠ {error}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Row 1 */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ct-text-secondary)" }}>
                  Deal Number <span style={{ color: "var(--danger-light)" }}>*</span>
                </label>
                <input
                  type="text"
                  value={form.deal_number}
                  onChange={(e) => setField("deal_number", e.target.value)}
                  placeholder="e.g. PW1252856"
                  className="mt-1 w-full border rounded-[var(--r-lg)] px-3 py-2 text-sm font-mono outline-none focus:border-[var(--accent-light)]"
                  style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ct-text-secondary)" }}>
                  Trade Date
                </label>
                <input
                  type="date"
                  value={form.trade_date}
                  onChange={(e) => setField("trade_date", e.target.value)}
                  className="mt-1 w-full border rounded-[var(--r-lg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-light)]"
                  style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ct-text-secondary)" }}>
                  Location <span style={{ color: "var(--danger-light)" }}>*</span>
                </label>
                <select
                  value={form.location}
                  onChange={(e) => {
                    setField("location", e.target.value);
                    setField("zone", LOCATION_TO_ZONE[e.target.value]);
                  }}
                  className="mt-1 w-full border rounded-[var(--r-lg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-light)]"
                  style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
                >
                  {LOCATIONS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
                <p className="text-xs mt-1" style={{ color: "var(--ct-text-muted)" }}>
                  Zone: {LOCATION_TO_ZONE[form.location]}
                </p>
              </div>

              {/* Row 2 */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ct-text-secondary)" }}>
                  Delivery Start <span style={{ color: "var(--danger-light)" }}>*</span>
                </label>
                <input
                  type="date"
                  value={form.delivery_start}
                  onChange={(e) => setField("delivery_start", e.target.value)}
                  className="mt-1 w-full border rounded-[var(--r-lg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-light)]"
                  style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ct-text-secondary)" }}>
                  Delivery End <span style={{ color: "var(--danger-light)" }}>*</span>
                </label>
                <input
                  type="date"
                  value={form.delivery_end}
                  onChange={(e) => setField("delivery_end", e.target.value)}
                  className="mt-1 w-full border rounded-[var(--r-lg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-light)]"
                  style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ct-text-secondary)" }}>
                  Block Type
                </label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {BLOCK_TYPES.map((b) => (
                    <button
                      key={b}
                      onClick={() => setField("block_type", b)}
                      className="px-2.5 py-1 text-xs rounded-[var(--r-lg)] border transition-colors"
                      style={form.block_type === b
                        ? { background: "var(--accent-light)", color: "var(--accent-light-on-solid)", borderColor: "var(--accent-light)" }
                        : { borderColor: "var(--ct-border-default)", color: "var(--ct-text-secondary)" }}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>

              {/* Row 3 */}
              {/* Row 3 */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ct-text-secondary)" }}>
                  Volume (MW) <span style={{ color: "var(--danger-light)" }}>*</span>
                </label>
                <input
                  type="number"
                  value={form.volume_mw}
                  onChange={(e) => setField("volume_mw", e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  onWheel={(e) => e.currentTarget.blur()}
                  className="mt-1 w-full border rounded-[var(--r-lg)] px-3 py-2 text-sm font-mono outline-none focus:border-[var(--accent-light)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ct-text-secondary)" }}>
                  Instrument Type
                </label>
                <select
                  value={form.instrument_type}
                  onChange={(e) => setField("instrument_type", e.target.value)}
                  className="mt-1 w-full border rounded-[var(--r-lg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-light)]"
                  style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
                >
                  {INSTRUMENTS.map((i) => (
                    <option key={i} value={i}>
                      {i.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </div>

              {/* Price fields — change based on instrument type */}
              {form.instrument_type === "FIXED" ||
              form.instrument_type === "INDEX" ? (
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ct-text-secondary)" }}>
                    Price ($/MWh) <span style={{ color: "var(--danger-light)" }}>*</span>
                  </label>
                  <input
                    type="number"
                    value={form.price}
                    onChange={(e) => {
                      const val = e.target.value;
                      const parts = val.split(".");
                      if (parts[1] && parts[1].length > 2) return;
                      setField("price", val);
                    }}
                    onBlur={(e) => {
                      if (e.target.value) {
                        setField("price", Number(e.target.value).toFixed(2));
                      }
                    }}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    onWheel={(e) => e.currentTarget.blur()}
                    className="mt-1 w-full border rounded-[var(--r-lg)] px-3 py-2 text-sm font-mono outline-none focus:border-[var(--accent-light)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ct-text-secondary)" }}>
                      Heat Rate (BTU/kWh){" "}
                      <span style={{ color: "var(--danger-light)" }}>*</span>
                    </label>
                    <input
                      type="number"
                      value={form.hr_value}
                      onChange={(e) => setField("hr_value", e.target.value)}
                      placeholder="7.500"
                      step="0.001"
                      className="mt-1 w-full border rounded-[var(--r-lg)] px-3 py-2 text-sm font-mono outline-none focus:border-[var(--accent-light)]"
                      style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ct-text-secondary)" }}>
                      Gas Price ($/MMBtu){" "}
                      <span style={{ color: "var(--danger-light)" }}>*</span>
                    </label>
                    <input
                      type="number"
                      value={form.gas_price}
                      onChange={(e) => setField("gas_price", e.target.value)}
                      placeholder="3.500"
                      step="0.001"
                      className="mt-1 w-full border rounded-[var(--r-lg)] px-3 py-2 text-sm font-mono outline-none focus:border-[var(--accent-light)]"
                      style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
                    />
                  </div>
                </>
              )}

              {/* Row 4 */}
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ct-text-secondary)" }}>
                  Counterparty
                </label>
                <input
                  type="text"
                  value={form.counterparty}
                  onChange={(e) => setField("counterparty", e.target.value)}
                  placeholder="e.g. Shell Energy"
                  className="mt-1 w-full border rounded-[var(--r-lg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-light)]"
                  style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ct-text-secondary)" }}>
                  Source
                </label>
                <div className="mt-1 flex gap-1.5">
                  {SOURCES.map((s) => (
                    <button
                      key={s}
                      onClick={() => setField("source", s)}
                      className="px-3 py-1.5 text-xs rounded-[var(--r-lg)] border transition-colors"
                      style={form.source === s
                        ? { background: "var(--accent-light)", color: "var(--accent-light-on-solid)", borderColor: "var(--accent-light)" }
                        : { borderColor: "var(--ct-border-default)", color: "var(--ct-text-secondary)" }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ct-text-secondary)" }}>
                  Notes
                </label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={(e) => setField("notes", e.target.value)}
                  placeholder="Optional notes"
                  className="mt-1 w-full border rounded-[var(--r-lg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-light)]"
                  style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
                />
              </div>
            </div>

            {/* Effective price preview — calculated result, uses shared accent per convention */}
            {form.instrument_type === "HEAT_RATE" &&
              form.hr_value &&
              form.gas_price && (
                <div className="rounded-[var(--r-lg)] border px-4 py-2 flex items-center gap-3" style={{ background: "var(--accent-light-tint)", borderColor: "var(--accent-light-tint)" }}>
                  <span className="text-xs font-semibold" style={{ color: "var(--accent-light)" }}>
                    Effective Price:
                  </span>
                  <span className="text-sm font-mono font-bold" style={{ color: "var(--accent-light)" }}>
                    ${effectivePrice}/MWh
                  </span>
                  <span className="text-xs" style={{ color: "var(--accent-light)" }}>
                    ({form.hr_value} HR × ${form.gas_price} gas)
                  </span>
                </div>
              )}

            {/* Save button */}
            <div className="flex justify-end gap-3 pt-2 border-t" style={{ borderColor: "var(--ct-border-default)" }}>
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditId(null);
                  setError("");
                }}
                className="px-4 py-2 text-sm border rounded-[var(--r-lg)] hover:bg-[var(--ct-surface-hover)]"
                style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-secondary)" }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2 text-sm rounded-[var(--r-lg)] disabled:opacity-50 font-semibold transition-colors hover:opacity-90"
                style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
              >
                {saving ? "Saving..." : editId ? "Update Hedge" : "Save Hedge"}
              </button>
            </div>
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="border-b" style={{ borderColor: "var(--ct-border-default)" }}>
          <div className="flex gap-6">
            {(["book", "summary"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="pb-3 text-sm font-medium capitalize transition-colors border-b-2 -mb-px"
                style={activeTab === tab
                  ? { borderColor: "var(--accent-light)", color: "var(--accent-light)" }
                  : { borderColor: "transparent", color: "var(--ct-text-muted)" }}
              >
                {tab === "book" ? "Hedge Book" : "Summary"}
              </button>
            ))}
          </div>
        </div>

        {/* ── Hedge Book Tab ── */}
        {activeTab === "book" && (
          <div className="space-y-3">
            {/* Zone filter */}
            <div className="flex gap-2">
              <button
                onClick={() => setFilterZone("")}
                className="px-3 py-1.5 text-xs rounded-[var(--r-lg)] border transition-colors"
                style={!filterZone
                  ? { background: "var(--accent-light)", color: "var(--accent-light-on-solid)", borderColor: "var(--accent-light)" }
                  : { borderColor: "var(--ct-border-default)", color: "var(--ct-text-secondary)" }}
              >
                All Zones
              </button>
              {ZONES.map((z: string) => (
                <button
                  key={z}
                  onClick={() => setFilterZone(z)}
                  className="px-3 py-1.5 text-xs rounded-[var(--r-lg)] border transition-colors"
                  style={filterZone === z
                    ? { background: "var(--accent-light)", color: "var(--accent-light-on-solid)", borderColor: "var(--accent-light)" }
                    : { borderColor: "var(--ct-border-default)", color: "var(--ct-text-secondary)" }}
                >
                  {z}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="text-center py-12 text-sm" style={{ color: "var(--ct-text-muted)" }}>
                Loading...
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-[var(--r-lg)] border border-dashed p-12 text-center" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
                <p className="text-sm" style={{ color: "var(--ct-text-muted)" }}>No hedges entered yet</p>
                <p className="text-xs mt-1" style={{ color: "var(--ct-text-muted)" }}>
                  Click + Add Hedge to enter your first forward purchase
                </p>
              </div>
            ) : (
              <div className="rounded-[var(--r-lg)] border overflow-hidden" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}>
                      <th className="text-left px-4 py-3 text-xs uppercase tracking-wide font-medium" style={{ color: "var(--ct-text-muted)" }}>
                        Deal #
                      </th>
                      <th className="text-left px-4 py-3 text-xs uppercase tracking-wide font-medium" style={{ color: "var(--ct-text-muted)" }}>
                        Zone
                      </th>
                      <th className="text-left px-4 py-3 text-xs uppercase tracking-wide font-medium" style={{ color: "var(--ct-text-muted)" }}>
                        Block
                      </th>
                      <th className="text-left px-4 py-3 text-xs uppercase tracking-wide font-medium" style={{ color: "var(--ct-text-muted)" }}>
                        Delivery
                      </th>
                      <th className="text-right px-4 py-3 text-xs uppercase tracking-wide font-medium" style={{ color: "var(--ct-text-muted)" }}>
                        Volume MW
                      </th>
                      <th className="text-right px-4 py-3 text-xs uppercase tracking-wide font-medium" style={{ color: "var(--ct-text-muted)" }}>
                        Price
                      </th>
                      <th className="text-left px-4 py-3 text-xs uppercase tracking-wide font-medium" style={{ color: "var(--ct-text-muted)" }}>
                        Location
                      </th>
                      <th className="text-left px-4 py-3 text-xs uppercase tracking-wide font-medium" style={{ color: "var(--ct-text-muted)" }}>
                        Instrument
                      </th>
                      <th className="text-left px-4 py-3 text-xs uppercase tracking-wide font-medium" style={{ color: "var(--ct-text-muted)" }}>
                        Source
                      </th>
                      <th className="text-left px-4 py-3 text-xs uppercase tracking-wide font-medium" style={{ color: "var(--ct-text-muted)" }}>
                        Counterparty
                      </th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: "var(--ct-border-subtle)" }}>
                    {filtered.map((h) => (
                      <tr
                        key={h.id}
                        className="hover:bg-[var(--ct-surface-hover)] transition-colors"
                      >
                        <td className="px-4 py-3 font-mono text-xs font-semibold" style={{ color: "var(--ct-text-primary)" }}>
                          {h.deal_number}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-medium px-2 py-0.5 rounded-[var(--r-sm)]"
                            style={{ background: "var(--accent-light-tint)", color: "var(--accent-light)" }}>
                            {h.zone}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-medium px-2 py-0.5 rounded-[var(--r-sm)]"
                            style={{ background: "var(--accent-light-tint)", color: "var(--accent-light)" }}>
                            {h.block_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: "var(--ct-text-secondary)" }}>
                          <span>{fmtDate(h.delivery_start)}</span>
                          <span className="mx-1" style={{ color: "var(--ct-text-muted)" }}>→</span>
                          <span>{fmtDate(h.delivery_end)}</span>
                          <span className="ml-1" style={{ color: "var(--ct-text-muted)" }}>
                            ({h.delivery_days}d)
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-medium" style={{ color: "var(--ct-text-primary)" }}>
                          {Number(h.volume_mw).toLocaleString()} MW
                        </td>
                        <td className="px-4 py-3 text-right font-mono" style={{ color: "var(--ct-text-primary)" }}>
                          ${fmt(h.effective_price, 2)}
                          {h.instrument_type === "HEAT_RATE" && (
                            <div className="text-xs" style={{ color: "var(--ct-text-muted)" }}>
                              {h.hr_value} HR × ${h.gas_price}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: "var(--ct-text-muted)" }}>
                          {h.location || "—"}
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: "var(--ct-text-muted)" }}>
                          {h.instrument_type.replace("_", " ")}
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: "var(--ct-text-muted)" }}>
                          {h.source}
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: "var(--ct-text-muted)" }}>
                          {h.counterparty || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEdit(h)}
                              className="text-xs hover:underline"
                              style={{ color: "var(--accent-light)" }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(h.id, h.deal_number)}
                              className="text-xs hover:underline"
                              style={{ color: "var(--danger-light)" }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Summary Tab ── */}
        {activeTab === "summary" && summary && (
          <div className="space-y-4">
            {/* By zone */}
            <div className="rounded-[var(--r-lg)] border overflow-hidden" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
              <div className="px-4 py-3 border-b" style={{ borderColor: "var(--ct-border-subtle)" }}>
                <h3 className="text-sm font-semibold" style={{ color: "var(--ct-text-primary)" }}>
                  Hedged Position by Zone
                </h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-subtle)" }}>
                    <th className="text-left px-4 py-2 text-xs uppercase font-medium" style={{ color: "var(--ct-text-muted)" }}>
                      Zone
                    </th>
                    <th className="text-left px-4 py-2 text-xs uppercase font-medium" style={{ color: "var(--ct-text-muted)" }}>
                      Block
                    </th>
                    <th className="text-left px-4 py-2 text-xs uppercase font-medium" style={{ color: "var(--ct-text-muted)" }}>
                      Instrument
                    </th>
                    <th className="text-right px-4 py-2 text-xs uppercase font-medium" style={{ color: "var(--ct-text-muted)" }}>
                      Deals
                    </th>
                    <th className="text-right px-4 py-2 text-xs uppercase font-medium" style={{ color: "var(--ct-text-muted)" }}>
                      Total MW
                    </th>
                    <th className="text-right px-4 py-2 text-xs uppercase font-medium" style={{ color: "var(--ct-text-muted)" }}>
                      Avg Price
                    </th>
                    <th className="text-left px-4 py-2 text-xs uppercase font-medium" style={{ color: "var(--ct-text-muted)" }}>
                      Delivery
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: "var(--ct-border-subtle)" }}>
                  {summary.by_zone.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="text-center py-8 text-sm"
                        style={{ color: "var(--ct-text-muted)" }}
                      >
                        No hedges entered yet
                      </td>
                    </tr>
                  ) : (
                    summary.by_zone.map((r, i) => (
                      <tr key={i} className="hover:bg-[var(--ct-surface-hover)]">
                        <td className="px-4 py-2">
                          <span className="text-xs font-medium px-2 py-0.5 rounded-[var(--r-sm)]"
                            style={{ background: "var(--accent-light-tint)", color: "var(--accent-light)" }}>
                            {r.zone}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-xs" style={{ color: "var(--ct-text-secondary)" }}>
                          {r.block_type}
                        </td>
                        <td className="px-4 py-2 text-xs" style={{ color: "var(--ct-text-muted)" }}>
                          {r.instrument_type}
                        </td>
                        <td className="px-4 py-2 text-right" style={{ color: "var(--ct-text-secondary)" }}>
                          {r.deals}
                        </td>
                        <td className="px-4 py-2 text-right font-mono font-medium" style={{ color: "var(--ct-text-primary)" }}>
                          {Number(r.total_mw).toLocaleString()} MW
                        </td>
                        <td className="px-4 py-2 text-right font-mono" style={{ color: "var(--ct-text-primary)" }}>
                          ${fmt(r.avg_price, 4)}
                        </td>
                        <td className="px-4 py-2 text-xs" style={{ color: "var(--ct-text-muted)" }}>
                          {fmtDate(r.earliest_delivery)} →{" "}
                          {fmtDate(r.latest_delivery)}
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
