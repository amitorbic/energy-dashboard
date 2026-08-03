import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import api from "../../utils/api";
import { getUser, isAdmin, isLoggedIn, User } from "../../utils/auth";

// ── types ─────────────────────────────────────────────────────────────────────

interface AddonType {
  id: number;
  code: string;
  description: string;
  calculation_basis: "flat" | "usage_based";
  is_taxable: boolean;
  is_active: boolean;
  current_rate: number | null;
  rate_effective_from: string | null;
  created_at: string;
  updated_at: string;
}

interface Rate {
  id: number;
  addon_type_id: number;
  rate: number;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
}

interface TypeForm {
  code: string;
  description: string;
  calculation_basis: "flat" | "usage_based";
  is_taxable: boolean;
}

interface RateForm {
  rate: string;
  effective_from: string;
}

const BLANK_TYPE: TypeForm = {
  code: "",
  description: "",
  calculation_basis: "usage_based",
  is_taxable: false,
};

const BLANK_RATE: RateForm = { rate: "", effective_from: "" };

// ── small helpers ─────────────────────────────────────────────────────────────

function Spinner({ sm }: { sm?: boolean }) {
  const cls = sm ? "w-3.5 h-3.5" : "w-4 h-4";
  return (
    <svg className={`${cls} animate-spin`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div
        onClick={() => onChange(!checked)}
        className="relative w-8 h-4 rounded-full transition-colors"
        style={{ background: checked ? "var(--accent-light)" : "var(--ct-border-strong)" }}
      >
        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
      </div>
      <span className="text-xs" style={{ color: "var(--ct-text-muted)" }}>{label}</span>
    </label>
  );
}

function fmtDate(d: string) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtRate(r: number | null) {
  if (r === null) return <span className="italic text-xs" style={{ color: "var(--ct-text-muted)" }}>No rate</span>;
  return <span className="font-mono" style={{ color: "var(--accent-light)" }}>${r.toFixed(6)}</span>;
}

// ── Rate history panel ────────────────────────────────────────────────────────

function RatePanel({
  type,
  rates,
  loadingRates,
  rateForm,
  setRateForm,
  addingRate,
  rateErr,
  onAddRate,
}: {
  type: AddonType;
  rates: Rate[];
  loadingRates: boolean;
  rateForm: RateForm;
  setRateForm: (f: RateForm) => void;
  addingRate: boolean;
  rateErr: string;
  onAddRate: () => void;
}) {
  const inputStyle: React.CSSProperties = {
    background: "var(--ct-surface)",
    borderColor: "var(--ct-border-default)",
    color: "var(--ct-text-primary)",
  };
  const inputCls =
    "border text-xs rounded-[var(--r-sm)] px-2.5 py-1.5 outline-none focus:border-[var(--accent-light)]";

  return (
    <div className="mt-1 rounded-[var(--r-lg)] border overflow-hidden" style={{ borderColor: "var(--ct-border-default)", background: "var(--ct-surface)" }}>
      {/* header */}
      <div className="px-4 py-2.5 border-b flex items-center justify-between" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}>
        <span className="text-xs font-semibold" style={{ color: "var(--ct-text-secondary)" }}>
          Rate history —{" "}
          <span className="font-mono" style={{ color: "var(--accent-light)" }}>{type.code}</span>
          <span className="ml-2 font-normal" style={{ color: "var(--ct-text-muted)" }}>({type.calculation_basis === "flat" ? "$/month flat" : "$/kWh usage-based"})</span>
        </span>
        {loadingRates && <Spinner sm />}
      </div>

      {/* rate table */}
      <div className="divide-y" style={{ borderColor: "var(--ct-border-subtle)" }}>
        {!loadingRates && rates.length === 0 && (
          <p className="px-4 py-3 text-xs italic" style={{ color: "var(--ct-text-muted)" }}>No rates yet. Add one below.</p>
        )}
        {rates.map((r) => (
          <div key={r.id} className="px-4 py-2.5 flex items-center justify-between text-xs">
            <div className="flex items-center gap-3">
              <span className="font-mono" style={{ color: "var(--accent-light)" }}>${r.rate.toFixed(6)}</span>
              <span style={{ color: "var(--ct-text-secondary)" }}>
                {fmtDate(r.effective_from)}
                {" – "}
                {r.effective_to ? fmtDate(r.effective_to) : (
                  <span className="font-medium" style={{ color: "var(--success-light)" }}>current</span>
                )}
              </span>
            </div>
            {r.effective_to === null && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-[var(--r-sm)] border"
                style={{ color: "var(--success-light)", background: "var(--success-light-tint)", borderColor: "var(--success-light-tint)" }}
              >
                OPEN
              </span>
            )}
          </div>
        ))}
      </div>

      {/* add rate form */}
      <div className="px-4 py-3 border-t" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}>
        <p className="text-[10px] font-medium uppercase tracking-wide mb-2" style={{ color: "var(--ct-text-muted)" }}>Add new rate</p>
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <label className="block text-[10px] mb-1" style={{ color: "var(--ct-text-muted)" }}>Rate ({type.calculation_basis === "flat" ? "$/month" : "$/kWh"})</label>
            <input
              type="number"
              step="0.000001"
              min="0"
              value={rateForm.rate}
              onChange={(e) => setRateForm({ ...rateForm, rate: e.target.value })}
              placeholder="0.001234"
              className={`${inputCls} w-32`}
              style={inputStyle}
            />
          </div>
          <div>
            <label className="block text-[10px] mb-1" style={{ color: "var(--ct-text-muted)" }}>Effective from</label>
            <input
              type="date"
              value={rateForm.effective_from}
              onChange={(e) => setRateForm({ ...rateForm, effective_from: e.target.value })}
              className={`${inputCls} w-36`}
              style={inputStyle}
            />
          </div>
          <button
            onClick={onAddRate}
            disabled={addingRate || !rateForm.rate || !rateForm.effective_from}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-[var(--r-sm)] transition-colors disabled:opacity-40 hover:opacity-90"
            style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
          >
            {addingRate && <Spinner sm />}
            Add Rate
          </button>
        </div>
        {rateErr && <p className="mt-2 text-xs" style={{ color: "var(--danger-light)" }}>{rateErr}</p>}
      </div>
    </div>
  );
}

// ── type form ─────────────────────────────────────────────────────────────────

function TypeForm({
  form,
  editingId,
  saving,
  err,
  onChange,
  onSubmit,
  onCancel,
}: {
  form: TypeForm;
  editingId: number | null;
  saving: boolean;
  err: string;
  onChange: (f: TypeForm) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const inputStyle: React.CSSProperties = {
    background: "var(--ct-surface)",
    borderColor: "var(--ct-border-default)",
    color: "var(--ct-text-primary)",
  };
  const inputCls =
    "w-full border text-xs rounded-[var(--r-sm)] px-2.5 py-1.5 outline-none focus:border-[var(--accent-light)]";
  const labelCls = "block text-[10px] uppercase tracking-wide mb-1";

  return (
    <div className="rounded-[var(--r-lg)] border p-4" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
      <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--ct-text-primary)" }}>
        {editingId ? `Edit Type #${editingId}` : "New Addon Charge Type"}
      </h3>

      <div className="space-y-3">
        <div>
          <label className={labelCls} style={{ color: "var(--ct-text-muted)" }}>Code *</label>
          <input
            value={form.code}
            onChange={(e) => onChange({ ...form, code: e.target.value.toUpperCase() })}
            disabled={!!editingId}
            placeholder="e.g. ANCSVC"
            className={`${inputCls} ${editingId ? "opacity-50 cursor-not-allowed" : ""}`}
            style={inputStyle}
          />
        </div>

        <div>
          <label className={labelCls} style={{ color: "var(--ct-text-muted)" }}>Description *</label>
          <input
            value={form.description}
            onChange={(e) => onChange({ ...form, description: e.target.value })}
            placeholder="Ancillary Services Charge"
            className={inputCls}
            style={inputStyle}
          />
        </div>

        <div>
          <label className={labelCls} style={{ color: "var(--ct-text-muted)" }}>Calculation Basis *</label>
          <select
            value={form.calculation_basis}
            onChange={(e) => onChange({ ...form, calculation_basis: e.target.value as "flat" | "usage_based" })}
            className={inputCls}
            style={inputStyle}
          >
            <option value="usage_based">Usage-based ($/kWh × kWh)</option>
            <option value="flat">Flat ($/month, prorated)</option>
          </select>
        </div>

        <Toggle
          checked={form.is_taxable}
          onChange={(v) => onChange({ ...form, is_taxable: v })}
          label="Taxable"
        />

        {editingId && (
          <div className="pt-1 border-t" style={{ borderColor: "var(--ct-border-subtle)" }}>
            <p className="text-[10px] mb-2" style={{ color: "var(--ct-text-muted)" }}>Code cannot be changed after creation. Use deactivation to retire a type.</p>
          </div>
        )}
      </div>

      {err && <p className="mt-3 text-xs" style={{ color: "var(--danger-light)" }}>{err}</p>}

      <div className="flex items-center gap-2 mt-4">
        <button
          onClick={onSubmit}
          disabled={saving || !form.code.trim() || !form.description.trim()}
          className="flex items-center gap-2 px-4 py-1.5 text-xs font-semibold rounded-[var(--r-sm)] transition-colors disabled:opacity-40 hover:opacity-90"
          style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
        >
          {saving && <Spinner sm />}
          {editingId ? "Save Changes" : "Create Type"}
        </button>
        {editingId && (
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs rounded-[var(--r-sm)] border transition-colors hover:bg-[var(--ct-surface-hover)]"
            style={{ color: "var(--ct-text-secondary)", borderColor: "var(--ct-border-default)" }}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function AdminAddonChargeTypes() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // type list
  const [types, setTypes] = useState<AddonType[]>([]);
  const [loading, setLoading] = useState(true);
  const [listErr, setListErr] = useState("");

  // type form (add / edit)
  const [form, setForm] = useState<TypeForm>(BLANK_TYPE);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState("");

  // rate panel
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [rates, setRates] = useState<Rate[]>([]);
  const [loadingRates, setLoadingRates] = useState(false);
  const [rateForm, setRateForm] = useState<RateForm>(BLANK_RATE);
  const [addingRate, setAddingRate] = useState(false);
  const [rateErr, setRateErr] = useState("");

  // auth gate
  useEffect(() => {
    if (!isLoggedIn()) {
      router.push("/login");
      return;
    }
    const u = getUser();
    setUser(u);
    setAuthChecked(true);
    if (!isAdmin()) return; // will render access denied below
  }, []);

  // load types
  const loadTypes = useCallback(async () => {
    setLoading(true);
    setListErr("");
    try {
      const res = await api.get("/admin/addon-charge-types");
      setTypes(res.data);
    } catch (e: any) {
      setListErr(e?.response?.data?.detail ?? "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authChecked && isAdmin()) loadTypes();
  }, [authChecked, loadTypes]);

  // load rates when selection changes
  const loadRates = useCallback(async (typeId: number) => {
    setLoadingRates(true);
    setRateErr("");
    setRates([]);
    try {
      const res = await api.get(`/admin/addon-charge-types/${typeId}/rates`);
      setRates(res.data);
    } catch {
      setRates([]);
    } finally {
      setLoadingRates(false);
    }
  }, []);

  const selectType = (t: AddonType) => {
    if (selectedId === t.id) {
      setSelectedId(null);
      setRates([]);
      return;
    }
    setSelectedId(t.id);
    setRateForm(BLANK_RATE);
    setRateErr("");
    loadRates(t.id);
  };

  // submit type form
  const submitType = async () => {
    setSaving(true);
    setFormErr("");
    try {
      if (editingId) {
        await api.put(`/admin/addon-charge-types/${editingId}`, {
          description:       form.description,
          calculation_basis: form.calculation_basis,
          is_taxable:        form.is_taxable,
        });
      } else {
        await api.post("/admin/addon-charge-types", form);
      }
      setForm(BLANK_TYPE);
      setEditingId(null);
      await loadTypes();
    } catch (e: any) {
      setFormErr(e?.response?.data?.detail ?? "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (t: AddonType) => {
    setEditingId(t.id);
    setForm({
      code:              t.code,
      description:       t.description,
      calculation_basis: t.calculation_basis,
      is_taxable:        t.is_taxable,
    });
    setFormErr("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(BLANK_TYPE);
    setFormErr("");
  };

  const toggleActive = async (t: AddonType) => {
    try {
      await api.put(`/admin/addon-charge-types/${t.id}`, { is_active: !t.is_active });
      await loadTypes();
    } catch (e: any) {
      alert(e?.response?.data?.detail ?? "Update failed.");
    }
  };

  // add rate
  const addRate = async () => {
    if (!selectedId) return;
    setAddingRate(true);
    setRateErr("");
    try {
      const res = await api.post(`/admin/addon-charge-types/${selectedId}/rates`, {
        rate:           parseFloat(rateForm.rate),
        effective_from: rateForm.effective_from,
      });
      setRates(res.data);
      setRateForm(BLANK_RATE);
      // refresh type list so current_rate column updates
      await loadTypes();
    } catch (e: any) {
      setRateErr(e?.response?.data?.detail ?? "Failed to add rate.");
    } finally {
      setAddingRate(false);
    }
  };

  // ── render ──────────────────────────────────────────────────────────────────

  if (!authChecked) return null;

  if (!isAdmin()) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--ct-canvas)" }}>
        <div className="text-center">
          <p className="font-semibold text-lg" style={{ color: "var(--danger-light)" }}>Access denied</p>
          <p className="text-sm mt-1" style={{ color: "var(--ct-text-muted)" }}>This section requires admin privileges.</p>
          <button
            onClick={() => router.push("/")}
            className="mt-4 text-xs underline hover:opacity-80"
            style={{ color: "var(--accent-light)" }}
          >
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  const selectedType = types.find((t) => t.id === selectedId) ?? null;

  return (
    <div className="min-h-screen" style={{ background: "var(--ct-canvas)" }}>
      <div className="fixed inset-0 bg-[linear-gradient(rgba(16,23,40,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(16,23,40,0.025)_1px,transparent_1px)] bg-[size:48px_48px] pointer-events-none" />

      {/* header */}
      <header className="relative z-10 border-b backdrop-blur-sm" style={{ borderColor: "var(--ct-border-default)", background: "rgba(255,255,255,0.9)" }}>
        <div className="max-w-screen-xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="text-xs transition-colors hover:opacity-80"
              style={{ color: "var(--ct-text-muted)" }}
            >
              ← Dashboard
            </button>
            <span style={{ color: "var(--ct-border-strong)" }}>|</span>
            <span
              className="text-xs px-2 py-0.5 rounded-[var(--r-sm)] font-medium border"
              style={{ background: "var(--danger-light-tint)", borderColor: "var(--danger-light-tint)", color: "var(--danger-light)" }}
            >
              Admin
            </span>
            <span className="text-sm font-semibold" style={{ color: "var(--ct-text-primary)" }}>Addon Charge Types</span>
          </div>
          {user && (
            <span className="text-xs" style={{ color: "var(--ct-text-muted)" }}>{user.username}</span>
          )}
        </div>
      </header>

      <main className="relative z-10 max-w-screen-xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-lg font-bold" style={{ color: "var(--ct-text-primary)" }}>Addon Charge Type Management</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--ct-text-muted)" }}>
            Define reusable supplier addon charges (ANCSVC, LINELOSS, etc.) and manage their effective-dated rate history.
            Rates are stored per calendar month; the close-out logic runs automatically when a new rate is added.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-5">

          {/* left: type form */}
          <div className="col-span-1">
            <TypeForm
              form={form}
              editingId={editingId}
              saving={saving}
              err={formErr}
              onChange={setForm}
              onSubmit={submitType}
              onCancel={cancelEdit}
            />
          </div>

          {/* right: type table + rate panel */}
          <div className="col-span-2 space-y-4">
            {/* type table */}
            <div className="rounded-[var(--r-lg)] border overflow-hidden" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
              <div className="px-4 py-3 border-b flex items-center justify-between" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}>
                <span className="text-sm font-semibold" style={{ color: "var(--ct-text-primary)" }}>
                  Types
                  {!loading && (
                    <span className="ml-1.5 text-xs font-normal" style={{ color: "var(--ct-text-muted)" }}>({types.length})</span>
                  )}
                </span>
                <button
                  onClick={loadTypes}
                  disabled={loading}
                  className="flex items-center gap-1 text-xs transition-colors disabled:opacity-40 hover:opacity-80"
                  style={{ color: "var(--ct-text-muted)" }}
                >
                  {loading ? <Spinner sm /> : (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  )}
                  Refresh
                </button>
              </div>

              {listErr && (
                <div className="px-4 py-3 text-sm" style={{ color: "var(--danger-light)" }}>{listErr}</div>
              )}

              {loading ? (
                <div className="px-4 py-10 flex justify-center">
                  <Spinner />
                </div>
              ) : types.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--ct-text-muted)" }}>
                  No addon charge types yet. Create one using the form.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}>
                      <tr>
                        <th className="px-3 py-2.5 text-left font-medium" style={{ color: "var(--ct-text-muted)" }}>Code</th>
                        <th className="px-3 py-2.5 text-left font-medium" style={{ color: "var(--ct-text-muted)" }}>Description</th>
                        <th className="px-3 py-2.5 text-left font-medium" style={{ color: "var(--ct-text-muted)" }}>Basis</th>
                        <th className="px-3 py-2.5 text-center font-medium" style={{ color: "var(--ct-text-muted)" }}>Tax</th>
                        <th className="px-3 py-2.5 text-right font-medium" style={{ color: "var(--ct-text-muted)" }}>Current Rate</th>
                        <th className="px-3 py-2.5 text-left font-medium" style={{ color: "var(--ct-text-muted)" }}>Effective</th>
                        <th className="px-3 py-2.5 text-center font-medium" style={{ color: "var(--ct-text-muted)" }}>Active</th>
                        <th className="px-3 py-2.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: "var(--ct-border-subtle)" }}>
                      {types.map((t) => (
                        <>
                          <tr
                            key={t.id}
                            onClick={() => selectType(t)}
                            className="cursor-pointer transition-colors hover:bg-[var(--ct-surface-hover)]"
                            style={{
                              ...(selectedId === t.id
                                ? { background: "var(--accent-light-tint)", borderLeft: "2px solid var(--accent-light)" }
                                : {}),
                              opacity: t.is_active ? 1 : 0.5,
                            }}
                          >
                            <td className="px-3 py-2.5">
                              <span
                                className="font-mono font-semibold px-1.5 py-0.5 rounded-[var(--r-sm)] text-[11px]"
                                style={{ color: "var(--ct-text-primary)", background: "var(--ct-surface-hover)" }}
                              >
                                {t.code}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 max-w-[10rem] truncate" style={{ color: "var(--ct-text-secondary)" }} title={t.description}>
                              {t.description}
                            </td>
                            <td className="px-3 py-2.5">
                              <span
                                className="inline-flex px-1.5 py-0.5 rounded-[var(--r-sm)] text-[10px] font-medium"
                                style={{ background: "var(--accent-light-tint)", color: "var(--accent-light)" }}
                              >
                                {t.calculation_basis === "flat" ? "flat" : "$/kWh"}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {t.is_taxable
                                ? <span className="font-bold" style={{ color: "var(--success-light)" }}>✓</span>
                                : <span style={{ color: "var(--ct-text-muted)" }}>—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              {fmtRate(t.current_rate)}
                            </td>
                            <td className="px-3 py-2.5" style={{ color: "var(--ct-text-muted)" }}>
                              {t.rate_effective_from ? fmtDate(t.rate_effective_from) : "—"}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleActive(t); }}
                                className="text-[10px] px-1.5 py-0.5 rounded-[var(--r-sm)] border transition-colors hover:opacity-80"
                                style={t.is_active
                                  ? { borderColor: "var(--success-light-tint)", color: "var(--success-light)" }
                                  : { borderColor: "var(--ct-border-default)", color: "var(--ct-text-muted)" }}
                              >
                                {t.is_active ? "Active" : "Inactive"}
                              </button>
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => startEdit(t)}
                                  className="text-xs transition-colors hover:opacity-80"
                                  style={{ color: "var(--accent-light)" }}
                                >
                                  Edit
                                </button>
                                <span
                                  className="text-[10px] transition-colors"
                                  style={{ color: selectedId === t.id ? "var(--accent-light)" : "var(--ct-text-muted)" }}
                                >
                                  {selectedId === t.id ? "▲ rates" : "▼ rates"}
                                </span>
                              </div>
                            </td>
                          </tr>

                          {/* inline rate panel */}
                          {selectedId === t.id && selectedType && (
                            <tr key={`${t.id}-rates`}>
                              <td colSpan={8} className="px-3 pb-3 pt-0" style={{ background: "var(--accent-light-tint)" }}>
                                <RatePanel
                                  type={selectedType}
                                  rates={rates}
                                  loadingRates={loadingRates}
                                  rateForm={rateForm}
                                  setRateForm={setRateForm}
                                  addingRate={addingRate}
                                  rateErr={rateErr}
                                  onAddRate={addRate}
                                />
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
