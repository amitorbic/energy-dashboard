import { useCallback, useEffect, useState } from "react";
import BillingEngineLayout from "../../components/BillingEngineLayout";
import api from "../../utils/api";

// ── types ─────────────────────────────────────────────────────────────────────

interface Mapping {
  id: number;
  tdsp_duns: string | null;
  charge_code: string;
  charge_description: string | null;
  billing_category: string;
  is_taxable: number;
  is_per_unit: number | null;
  is_passthrough: number;
  notes: string | null;
  created_at: string;
}

interface FormState {
  tdsp_duns:          string;
  charge_code:        string;
  charge_description: string;
  billing_category:   string;
  is_taxable:         boolean;
  is_per_unit:        boolean | null;
  is_passthrough:     boolean;
  notes:              string;
}

const BLANK_FORM: FormState = {
  tdsp_duns:          "",
  charge_code:        "",
  charge_description: "",
  billing_category:   "distribution",
  is_taxable:         false,
  is_per_unit:        true,
  is_passthrough:     true,
  notes:              "",
};

const CATEGORIES = [
  "transmission", "distribution", "customer_charge", "metering",
  "surcharge", "tax", "misc", "excluded",
];

const CAT_COLORS: Record<string, string> = {
  transmission:    "bg-blue-50 text-blue-700",
  distribution:    "bg-indigo-50 text-indigo-700",
  customer_charge: "bg-purple-50 text-purple-700",
  metering:        "bg-cyan-50 text-cyan-700",
  surcharge:       "bg-orange-50 text-orange-700",
  tax:             "bg-yellow-50 text-yellow-700",
  misc:            "bg-gray-100 text-gray-600",
  excluded:        "bg-red-50 text-red-600",
};

// ── helpers ───────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function Toggle({
  checked, onChange, label,
}: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <div
        onClick={() => onChange(!checked)}
        className={`relative w-8 h-4 rounded-full transition-colors ${checked ? "bg-green-500" : "bg-gray-200"}`}
      >
        <span
          className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`}
        />
      </div>
      <span className="text-xs text-gray-600">{label}</span>
    </label>
  );
}

// Three-state control: Yes | No | Unknown (null)
function TriState({
  value, onChange, label,
}: { value: boolean | null; onChange: (v: boolean | null) => void; label: string }) {
  const opt = (v: boolean | null, text: string, activeCls: string) => (
    <button
      type="button"
      onClick={() => onChange(v)}
      className={`px-2.5 py-1 text-xs font-medium transition-colors border-r last:border-r-0 border-gray-200 ${
        value === v ? activeCls : "bg-white text-gray-500 hover:bg-gray-50"
      }`}
    >
      {text}
    </button>
  );
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-gray-500">{label}</span>
      <div className="flex rounded border border-gray-200 overflow-hidden w-fit">
        {opt(true,  "Yes",     "bg-blue-500 text-white")}
        {opt(false, "No",      "bg-gray-400 text-white")}
        {opt(null,  "Unknown", "bg-amber-400 text-white")}
      </div>
    </div>
  );
}

function PerUnitCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-amber-500 text-xs font-medium">?</span>;
  if (value)         return <span className="text-blue-500 font-bold">✓</span>;
  return               <span className="text-gray-200">—</span>;
}

// ── form panel ────────────────────────────────────────────────────────────────

interface FormPanelProps {
  form: FormState;
  editingId: number | null;
  saving: boolean;
  error: string;
  onChange: (f: FormState) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

function FormPanel({ form, editingId, saving, error, onChange, onSubmit, onCancel }: FormPanelProps) {
  const set = (k: keyof FormState, v: string | boolean | null) =>
    onChange({ ...form, [k]: v });

  const labelCls = "block text-xs text-gray-500 mb-1";
  const inputCls = "w-full text-xs border border-gray-200 rounded px-2.5 py-1.5 text-gray-800 focus:outline-none focus:ring-1 focus:ring-green-400";

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">
        {editingId ? `Edit Mapping #${editingId}` : "Add Mapping"}
      </h3>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className={labelCls}>Charge Code *</label>
          <input
            value={form.charge_code}
            onChange={(e) => set("charge_code", e.target.value.toUpperCase())}
            disabled={!!editingId}
            placeholder="e.g. DIST_CHARGE"
            className={`${inputCls} ${editingId ? "bg-gray-50 text-gray-400" : ""}`}
          />
        </div>
        <div>
          <label className={labelCls}>TDSP DUNS (blank = universal)</label>
          <input
            value={form.tdsp_duns}
            onChange={(e) => set("tdsp_duns", e.target.value)}
            disabled={!!editingId}
            placeholder="Leave blank for all TDSPs"
            className={`${inputCls} ${editingId ? "bg-gray-50 text-gray-400" : ""}`}
          />
        </div>
      </div>

      <div className="mb-3">
        <label className={labelCls}>Description</label>
        <input
          value={form.charge_description}
          onChange={(e) => set("charge_description", e.target.value)}
          placeholder="Human-readable charge name"
          className={inputCls}
        />
      </div>

      <div className="mb-3">
        <label className={labelCls}>Billing Category *</label>
        <select
          value={form.billing_category}
          onChange={(e) => set("billing_category", e.target.value)}
          className={inputCls}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-5 mb-3">
        <Toggle
          checked={form.is_taxable}
          onChange={(v) => set("is_taxable", v)}
          label="Taxable"
        />
        <TriState
          value={form.is_per_unit}
          onChange={(v) => set("is_per_unit", v)}
          label="Per-unit (rate × qty)"
        />
        <Toggle
          checked={form.is_passthrough}
          onChange={(v) => set("is_passthrough", v)}
          label="Passthrough to customer"
        />
      </div>

      <div className="mb-4">
        <label className={labelCls}>Notes</label>
        <input
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="Optional notes"
          className={inputCls}
        />
      </div>

      {error && (
        <p className="text-xs text-red-500 mb-3">{error}</p>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={onSubmit}
          disabled={saving || !form.charge_code.trim()}
          className="flex items-center gap-2 px-4 py-1.5 bg-green-600 text-white text-xs font-medium rounded hover:bg-green-700 disabled:opacity-40 transition-colors"
        >
          {saving && <Spinner />}
          {editingId ? "Save Changes" : "Add Mapping"}
        </button>
        {editingId && (
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function ChargeMappingsPage() {
  const [rows, setRows]           = useState<Mapping[]>([]);
  const [loading, setLoading]     = useState(true);
  const [fetchErr, setFetchErr]   = useState("");
  const [form, setForm]           = useState<FormState>(BLANK_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving]       = useState(false);
  const [formErr, setFormErr]     = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFetchErr("");
    try {
      const res = await api.get("/billing-engine/charge-mappings");
      setRows(res.data);
    } catch (e: any) {
      setFetchErr(e?.response?.data?.detail ?? "Failed to load mappings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const startEdit = (m: Mapping) => {
    setEditingId(m.id);
    setForm({
      tdsp_duns:          m.tdsp_duns ?? "",
      charge_code:        m.charge_code,
      charge_description: m.charge_description ?? "",
      billing_category:   m.billing_category,
      is_taxable:         !!m.is_taxable,
      is_per_unit:        m.is_per_unit === null ? null : !!m.is_per_unit,
      is_passthrough:     !!m.is_passthrough,
      notes:              m.notes ?? "",
    });
    setFormErr("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(BLANK_FORM);
    setFormErr("");
  };

  const submit = async () => {
    if (!form.charge_code.trim()) return;
    setSaving(true);
    setFormErr("");
    try {
      const payload = {
        tdsp_duns:          form.tdsp_duns.trim() || null,
        charge_code:        form.charge_code.trim().toUpperCase(),
        charge_description: form.charge_description.trim() || null,
        billing_category:   form.billing_category,
        is_taxable:         form.is_taxable,
        is_per_unit:        form.is_per_unit,   // null passes through as-is
        is_passthrough:     form.is_passthrough,
        notes:              form.notes.trim() || null,
      };
      if (editingId) {
        await api.put(`/billing-engine/charge-mappings/${editingId}`, payload);
      } else {
        await api.post("/billing-engine/charge-mappings", payload);
      }
      cancelEdit();
      await load();
    } catch (e: any) {
      setFormErr(e?.response?.data?.detail ?? "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const deleteMapping = async (id: number) => {
    setDeletingId(id);
    try {
      await api.delete(`/billing-engine/charge-mappings/${id}`);
      setRows((r) => r.filter((m) => m.id !== id));
      if (editingId === id) cancelEdit();
    } catch (e: any) {
      alert(e?.response?.data?.detail ?? "Delete failed.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <BillingEngineLayout title="Charge Mappings">
      <div className="mb-6">
        <h2 className="text-base font-semibold text-gray-800">TDSP Charge Mappings</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Map 810 charge codes to billing categories. Unmapped codes appear in the Review → Unknown Charges tab.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">

        {/* form */}
        <div className="col-span-1">
          <FormPanel
            form={form}
            editingId={editingId}
            saving={saving}
            error={formErr}
            onChange={setForm}
            onSubmit={submit}
            onCancel={cancelEdit}
          />
        </div>

        {/* table */}
        <div className="col-span-2">
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">
                Mappings
                {!loading && <span className="ml-1.5 text-xs text-gray-400 font-normal">({rows.length})</span>}
              </span>
              <button
                onClick={load}
                disabled={loading}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 disabled:opacity-40"
              >
                {loading ? <Spinner /> : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
                Refresh
              </button>
            </div>

            {fetchErr && (
              <div className="px-4 py-3 text-sm text-red-500">{fetchErr}</div>
            )}

            {loading ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">Loading…</div>
            ) : rows.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">No mappings yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-500 font-medium">Code</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-medium">Description</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-medium">Category</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-medium">TDSP</th>
                      <th className="px-3 py-2 text-center text-gray-500 font-medium">Tax</th>
                      <th className="px-3 py-2 text-center text-gray-500 font-medium">Per-unit</th>
                      <th className="px-3 py-2 text-center text-gray-500 font-medium">Pass-thru</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.map((m) => (
                      <tr
                        key={m.id}
                        className={`hover:bg-gray-50 transition-colors ${editingId === m.id ? "bg-green-50" : ""}`}
                      >
                        <td className="px-3 py-2">
                          <span className="font-mono font-medium text-gray-800 bg-gray-100 px-1.5 py-0.5 rounded">
                            {m.charge_code}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-600 max-w-[12rem] truncate" title={m.charge_description ?? ""}>
                          {m.charge_description ?? <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${CAT_COLORS[m.billing_category] ?? "bg-gray-100 text-gray-600"}`}>
                            {m.billing_category.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-500 font-mono">
                          {m.tdsp_duns ?? <span className="text-gray-300 italic not-italic">universal</span>}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {m.is_taxable ? <span className="text-green-600 font-bold">✓</span> : <span className="text-gray-200">—</span>}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <PerUnitCell value={m.is_per_unit} />
                        </td>
                        <td className="px-3 py-2 text-center">
                          {m.is_passthrough ? <span className="text-green-600 font-bold">✓</span> : <span className="text-gray-200">—</span>}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2 justify-end">
                            <button
                              onClick={() => startEdit(m)}
                              className="text-xs text-blue-500 hover:text-blue-700 transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => deleteMapping(m.id)}
                              disabled={deletingId === m.id}
                              className="text-xs text-red-400 hover:text-red-600 disabled:opacity-40 transition-colors"
                            >
                              {deletingId === m.id ? "…" : "Delete"}
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
        </div>

      </div>
    </BillingEngineLayout>
  );
}
