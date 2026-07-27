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
        className={`relative w-8 h-4 rounded-full transition-colors ${checked ? "bg-sky-500" : "bg-slate-600"}`}
      >
        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
      </div>
      <span className="text-xs text-slate-400">{label}</span>
    </label>
  );
}

function fmtDate(d: string) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtRate(r: number | null) {
  if (r === null) return <span className="text-slate-500 italic text-xs">No rate</span>;
  return <span className="font-mono text-sky-300">${r.toFixed(6)}</span>;
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
  const inputCls =
    "bg-slate-700 border border-slate-600 text-white text-xs rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-sky-500 placeholder-slate-500";

  return (
    <div className="mt-1 border border-slate-700 rounded-lg bg-slate-800/60 overflow-hidden">
      {/* header */}
      <div className="px-4 py-2.5 bg-slate-700/40 border-b border-slate-700 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-300">
          Rate history —{" "}
          <span className="font-mono text-sky-400">{type.code}</span>
          <span className="ml-2 text-slate-500 font-normal">({type.calculation_basis === "flat" ? "$/month flat" : "$/kWh usage-based"})</span>
        </span>
        {loadingRates && <Spinner sm />}
      </div>

      {/* rate table */}
      <div className="divide-y divide-slate-700/50">
        {!loadingRates && rates.length === 0 && (
          <p className="px-4 py-3 text-xs text-slate-500 italic">No rates yet. Add one below.</p>
        )}
        {rates.map((r) => (
          <div key={r.id} className="px-4 py-2.5 flex items-center justify-between text-xs">
            <div className="flex items-center gap-3">
              <span className="font-mono text-sky-300">${r.rate.toFixed(6)}</span>
              <span className="text-slate-400">
                {fmtDate(r.effective_from)}
                {" – "}
                {r.effective_to ? fmtDate(r.effective_to) : (
                  <span className="text-green-400 font-medium">current</span>
                )}
              </span>
            </div>
            {r.effective_to === null && (
              <span className="text-green-500 text-[10px] bg-green-500/10 border border-green-500/30 px-1.5 py-0.5 rounded">
                OPEN
              </span>
            )}
          </div>
        ))}
      </div>

      {/* add rate form */}
      <div className="px-4 py-3 bg-slate-900/40 border-t border-slate-700">
        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-2">Add new rate</p>
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <label className="block text-[10px] text-slate-500 mb-1">Rate ({type.calculation_basis === "flat" ? "$/month" : "$/kWh"})</label>
            <input
              type="number"
              step="0.000001"
              min="0"
              value={rateForm.rate}
              onChange={(e) => setRateForm({ ...rateForm, rate: e.target.value })}
              placeholder="0.001234"
              className={`${inputCls} w-32`}
            />
          </div>
          <div>
            <label className="block text-[10px] text-slate-500 mb-1">Effective from</label>
            <input
              type="date"
              value={rateForm.effective_from}
              onChange={(e) => setRateForm({ ...rateForm, effective_from: e.target.value })}
              className={`${inputCls} w-36`}
            />
          </div>
          <button
            onClick={onAddRate}
            disabled={addingRate || !rateForm.rate || !rateForm.effective_from}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white text-xs font-medium rounded transition-colors"
          >
            {addingRate && <Spinner sm />}
            Add Rate
          </button>
        </div>
        {rateErr && <p className="mt-2 text-xs text-red-400">{rateErr}</p>}
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
  const inputCls =
    "w-full bg-slate-700 border border-slate-600 text-white text-xs rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-sky-500 placeholder-slate-500";
  const labelCls = "block text-[10px] text-slate-400 uppercase tracking-wide mb-1";

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-slate-200 mb-4">
        {editingId ? `Edit Type #${editingId}` : "New Addon Charge Type"}
      </h3>

      <div className="space-y-3">
        <div>
          <label className={labelCls}>Code *</label>
          <input
            value={form.code}
            onChange={(e) => onChange({ ...form, code: e.target.value.toUpperCase() })}
            disabled={!!editingId}
            placeholder="e.g. ANCSVC"
            className={`${inputCls} ${editingId ? "opacity-50 cursor-not-allowed" : ""}`}
          />
        </div>

        <div>
          <label className={labelCls}>Description *</label>
          <input
            value={form.description}
            onChange={(e) => onChange({ ...form, description: e.target.value })}
            placeholder="Ancillary Services Charge"
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls}>Calculation Basis *</label>
          <select
            value={form.calculation_basis}
            onChange={(e) => onChange({ ...form, calculation_basis: e.target.value as "flat" | "usage_based" })}
            className={inputCls}
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
          <div className="pt-1 border-t border-slate-700">
            <p className="text-[10px] text-slate-500 mb-2">Code cannot be changed after creation. Use deactivation to retire a type.</p>
          </div>
        )}
      </div>

      {err && <p className="mt-3 text-xs text-red-400">{err}</p>}

      <div className="flex items-center gap-2 mt-4">
        <button
          onClick={onSubmit}
          disabled={saving || !form.code.trim() || !form.description.trim()}
          className="flex items-center gap-2 px-4 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white text-xs font-semibold rounded transition-colors"
        >
          {saving && <Spinner sm />}
          {editingId ? "Save Changes" : "Create Type"}
        </button>
        {editingId && (
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs text-slate-400 border border-slate-600 rounded hover:bg-slate-700 transition-colors"
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
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 font-semibold text-lg">Access denied</p>
          <p className="text-slate-500 text-sm mt-1">This section requires admin privileges.</p>
          <button
            onClick={() => router.push("/")}
            className="mt-4 text-xs text-sky-400 hover:text-sky-300 underline"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  const selectedType = types.find((t) => t.id === selectedId) ?? null;

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="fixed inset-0 bg-[linear-gradient(rgba(56,189,248,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(56,189,248,0.02)_1px,transparent_1px)] bg-[size:48px_48px] pointer-events-none" />

      {/* header */}
      <header className="relative z-10 border-b border-slate-800 bg-slate-900/90 backdrop-blur-sm">
        <div className="max-w-screen-xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="text-slate-500 hover:text-white text-xs transition-colors"
            >
              ← Dashboard
            </button>
            <span className="text-slate-700">|</span>
            <span className="text-xs text-slate-500 bg-red-500/10 border border-red-500/20 text-red-400 px-2 py-0.5 rounded font-medium">
              Admin
            </span>
            <span className="text-sm font-semibold text-white">Addon Charge Types</span>
          </div>
          {user && (
            <span className="text-slate-500 text-xs">{user.username}</span>
          )}
        </div>
      </header>

      <main className="relative z-10 max-w-screen-xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-lg font-bold text-white">Addon Charge Type Management</h1>
          <p className="text-slate-500 text-xs mt-0.5">
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
            <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
              <div className="px-4 py-3 bg-slate-700/30 border-b border-slate-700 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-200">
                  Types
                  {!loading && (
                    <span className="ml-1.5 text-xs text-slate-500 font-normal">({types.length})</span>
                  )}
                </span>
                <button
                  onClick={loadTypes}
                  disabled={loading}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-white disabled:opacity-40 transition-colors"
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
                <div className="px-4 py-3 text-sm text-red-400">{listErr}</div>
              )}

              {loading ? (
                <div className="px-4 py-10 flex justify-center">
                  <Spinner />
                </div>
              ) : types.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-slate-500">
                  No addon charge types yet. Create one using the form.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-700/20 border-b border-slate-700">
                      <tr>
                        <th className="px-3 py-2.5 text-left text-slate-400 font-medium">Code</th>
                        <th className="px-3 py-2.5 text-left text-slate-400 font-medium">Description</th>
                        <th className="px-3 py-2.5 text-left text-slate-400 font-medium">Basis</th>
                        <th className="px-3 py-2.5 text-center text-slate-400 font-medium">Tax</th>
                        <th className="px-3 py-2.5 text-right text-slate-400 font-medium">Current Rate</th>
                        <th className="px-3 py-2.5 text-left text-slate-400 font-medium">Effective</th>
                        <th className="px-3 py-2.5 text-center text-slate-400 font-medium">Active</th>
                        <th className="px-3 py-2.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/40">
                      {types.map((t) => (
                        <>
                          <tr
                            key={t.id}
                            onClick={() => selectType(t)}
                            className={`cursor-pointer transition-colors ${
                              selectedId === t.id
                                ? "bg-sky-500/10 border-l-2 border-l-sky-500"
                                : "hover:bg-slate-700/30"
                            } ${!t.is_active ? "opacity-50" : ""}`}
                          >
                            <td className="px-3 py-2.5">
                              <span className="font-mono font-semibold text-slate-100 bg-slate-700 px-1.5 py-0.5 rounded text-[11px]">
                                {t.code}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-slate-300 max-w-[10rem] truncate" title={t.description}>
                              {t.description}
                            </td>
                            <td className="px-3 py-2.5">
                              <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                t.calculation_basis === "flat"
                                  ? "bg-violet-500/15 text-violet-300"
                                  : "bg-teal-500/15 text-teal-300"
                              }`}>
                                {t.calculation_basis === "flat" ? "flat" : "$/kWh"}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {t.is_taxable
                                ? <span className="text-green-400 font-bold">✓</span>
                                : <span className="text-slate-600">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              {fmtRate(t.current_rate)}
                            </td>
                            <td className="px-3 py-2.5 text-slate-500">
                              {t.rate_effective_from ? fmtDate(t.rate_effective_from) : "—"}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleActive(t); }}
                                className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                                  t.is_active
                                    ? "border-green-600/40 text-green-400 hover:bg-green-500/10"
                                    : "border-slate-600 text-slate-500 hover:bg-slate-700"
                                }`}
                              >
                                {t.is_active ? "Active" : "Inactive"}
                              </button>
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => startEdit(t)}
                                  className="text-xs text-sky-400 hover:text-sky-300 transition-colors"
                                >
                                  Edit
                                </button>
                                <span className={`text-[10px] transition-colors ${selectedId === t.id ? "text-sky-400" : "text-slate-600"}`}>
                                  {selectedId === t.id ? "▲ rates" : "▼ rates"}
                                </span>
                              </div>
                            </td>
                          </tr>

                          {/* inline rate panel */}
                          {selectedId === t.id && selectedType && (
                            <tr key={`${t.id}-rates`}>
                              <td colSpan={8} className="px-3 pb-3 pt-0 bg-sky-500/5">
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
