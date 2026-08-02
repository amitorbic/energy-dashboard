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
        className="relative w-8 h-4 rounded-full transition-colors"
        style={{ background: checked ? "var(--accent-light)" : "var(--ct-border-default)" }}
      >
        <span
          className={`absolute top-0.5 w-3 h-3 rounded-full shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`}
          style={{ background: "var(--ct-surface)" }}
        />
      </div>
      <span className="text-xs" style={{ color: "var(--ct-text-secondary)" }}>{label}</span>
    </label>
  );
}

// Three-state control: Yes | No | Unknown (null)
function TriState({
  value, onChange, label,
}: { value: boolean | null; onChange: (v: boolean | null) => void; label: string }) {
  const opt = (v: boolean | null, text: string, activeStyle: { background: string; color: string }) => (
    <button
      type="button"
      onClick={() => onChange(v)}
      className="px-2.5 py-1 text-xs font-medium transition-colors border-r last:border-r-0"
      style={
        value === v
          ? { ...activeStyle, borderColor: "var(--ct-border-default)" }
          : { background: "var(--ct-surface)", color: "var(--ct-text-muted)", borderColor: "var(--ct-border-default)" }
      }
    >
      {text}
    </button>
  );
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs" style={{ color: "var(--ct-text-muted)" }}>{label}</span>
      <div className="flex rounded-[var(--r-sm)] border overflow-hidden w-fit" style={{ borderColor: "var(--ct-border-default)" }}>
        {opt(true,  "Yes",     { background: "var(--accent-light)", color: "var(--accent-light-on-solid)" })}
        {opt(false, "No",      { background: "var(--ct-text-muted)", color: "#ffffff" })}
        {opt(null,  "Unknown", { background: "var(--amber-light)", color: "#ffffff" })}
      </div>
    </div>
  );
}

function PerUnitCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs font-medium" style={{ color: "var(--amber-light)" }}>?</span>;
  if (value)         return <span className="font-bold" style={{ color: "var(--accent-light)" }}>✓</span>;
  return               <span style={{ color: "var(--ct-text-muted)", opacity: 0.5 }}>—</span>;
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

  const labelCls = "block text-xs mb-1";
  const labelStyle = { color: "var(--ct-text-muted)" };
  const inputCls = "w-full text-xs rounded-[var(--r-sm)] px-2.5 py-1.5 border focus:outline-none focus:border-[var(--accent-light)]";
  const inputStyle = { background: "var(--ct-surface)", color: "var(--ct-text-primary)", borderColor: "var(--ct-border-default)" };

  return (
    <div className="rounded-[var(--r-lg)] border p-4" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
      <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--ct-text-secondary)" }}>
        {editingId ? `Edit Mapping #${editingId}` : "Add Mapping"}
      </h3>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className={labelCls} style={labelStyle}>Charge Code *</label>
          <input
            value={form.charge_code}
            onChange={(e) => set("charge_code", e.target.value.toUpperCase())}
            disabled={!!editingId}
            placeholder="e.g. DIST_CHARGE"
            className={inputCls}
            style={editingId ? { ...inputStyle, background: "var(--ct-surface-hover)", color: "var(--ct-text-muted)" } : inputStyle}
          />
        </div>
        <div>
          <label className={labelCls} style={labelStyle}>TDSP DUNS (blank = universal)</label>
          <input
            value={form.tdsp_duns}
            onChange={(e) => set("tdsp_duns", e.target.value)}
            disabled={!!editingId}
            placeholder="Leave blank for all TDSPs"
            className={inputCls}
            style={editingId ? { ...inputStyle, background: "var(--ct-surface-hover)", color: "var(--ct-text-muted)" } : inputStyle}
          />
        </div>
      </div>

      <div className="mb-3">
        <label className={labelCls} style={labelStyle}>Description</label>
        <input
          value={form.charge_description}
          onChange={(e) => set("charge_description", e.target.value)}
          placeholder="Human-readable charge name"
          className={inputCls}
          style={inputStyle}
        />
      </div>

      <div className="mb-3">
        <label className={labelCls} style={labelStyle}>Billing Category *</label>
        <select
          value={form.billing_category}
          onChange={(e) => set("billing_category", e.target.value)}
          className={inputCls}
          style={inputStyle}
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
        <label className={labelCls} style={labelStyle}>Notes</label>
        <input
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="Optional notes"
          className={inputCls}
          style={inputStyle}
        />
      </div>

      {error && (
        <p className="text-xs mb-3" style={{ color: "var(--danger-light)" }}>{error}</p>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={onSubmit}
          disabled={saving || !form.charge_code.trim()}
          className="flex items-center gap-2 px-4 py-1.5 text-xs font-medium rounded-[var(--r-sm)] disabled:opacity-40 transition-colors"
          style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
        >
          {saving && <Spinner />}
          {editingId ? "Save Changes" : "Add Mapping"}
        </button>
        {editingId && (
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs rounded-[var(--r-sm)] border transition-colors hover:bg-[var(--ct-surface-hover)]"
            style={{ color: "var(--ct-text-muted)", borderColor: "var(--ct-border-default)" }}
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
        <h2 className="text-base font-semibold" style={{ color: "var(--ct-text-primary)" }}>TDSP Charge Mappings</h2>
        <p className="text-xs mt-0.5" style={{ color: "var(--ct-text-muted)" }}>
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
          <div className="rounded-[var(--r-lg)] border overflow-hidden" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
            <div className="px-4 py-3 border-b flex items-center justify-between" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-subtle)" }}>
              <span className="text-sm font-semibold" style={{ color: "var(--ct-text-secondary)" }}>
                Mappings
                {!loading && <span className="ml-1.5 text-xs font-normal" style={{ color: "var(--ct-text-muted)" }}>({rows.length})</span>}
              </span>
              <button
                onClick={load}
                disabled={loading}
                className="flex items-center gap-1 text-xs disabled:opacity-40 transition-colors hover:text-[var(--ct-text-secondary)]"
                style={{ color: "var(--ct-text-muted)" }}
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
              <div className="px-4 py-3 text-sm" style={{ color: "var(--danger-light)" }}>{fetchErr}</div>
            )}

            {loading ? (
              <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--ct-text-muted)" }}>Loading…</div>
            ) : rows.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--ct-text-muted)" }}>No mappings yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="border-b" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-subtle)" }}>
                    <tr>
                      <th className="px-3 py-2 text-left font-medium" style={{ color: "var(--ct-text-muted)" }}>Code</th>
                      <th className="px-3 py-2 text-left font-medium" style={{ color: "var(--ct-text-muted)" }}>Description</th>
                      <th className="px-3 py-2 text-left font-medium" style={{ color: "var(--ct-text-muted)" }}>Category</th>
                      <th className="px-3 py-2 text-left font-medium" style={{ color: "var(--ct-text-muted)" }}>TDSP</th>
                      <th className="px-3 py-2 text-center font-medium" style={{ color: "var(--ct-text-muted)" }}>Tax</th>
                      <th className="px-3 py-2 text-center font-medium" style={{ color: "var(--ct-text-muted)" }}>Per-unit</th>
                      <th className="px-3 py-2 text-center font-medium" style={{ color: "var(--ct-text-muted)" }}>Pass-thru</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: "var(--ct-border-subtle)" }}>
                    {rows.map((m) => (
                      <tr
                        key={m.id}
                        className="transition-colors hover:bg-[var(--ct-surface-hover)]"
                        style={editingId === m.id ? { background: "var(--accent-light-tint)" } : undefined}
                      >
                        <td className="px-3 py-2">
                          <span className="font-mono font-medium px-1.5 py-0.5 rounded-[var(--r-sm)]" style={{ color: "var(--ct-text-primary)", background: "var(--ct-surface-hover)" }}>
                            {m.charge_code}
                          </span>
                        </td>
                        <td className="px-3 py-2 max-w-[12rem] truncate" style={{ color: "var(--ct-text-secondary)" }} title={m.charge_description ?? ""}>
                          {m.charge_description ?? <span style={{ color: "var(--ct-text-muted)", opacity: 0.6 }}>—</span>}
                        </td>
                        <td className="px-3 py-2">
                          <span className="inline-flex px-1.5 py-0.5 rounded-[var(--r-sm)] text-xs font-medium" style={{ background: "var(--accent-light-tint)", color: "var(--accent-light)" }}>
                            {m.billing_category.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono" style={{ color: "var(--ct-text-muted)" }}>
                          {m.tdsp_duns ?? <span style={{ opacity: 0.6, fontStyle: "italic" }}>universal</span>}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {m.is_taxable ? <span className="font-bold" style={{ color: "var(--accent-light)" }}>✓</span> : <span style={{ color: "var(--ct-text-muted)", opacity: 0.5 }}>—</span>}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <PerUnitCell value={m.is_per_unit} />
                        </td>
                        <td className="px-3 py-2 text-center">
                          {m.is_passthrough ? <span className="font-bold" style={{ color: "var(--accent-light)" }}>✓</span> : <span style={{ color: "var(--ct-text-muted)", opacity: 0.5 }}>—</span>}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2 justify-end">
                            <button
                              onClick={() => startEdit(m)}
                              className="text-xs transition-colors hover:opacity-80"
                              style={{ color: "var(--accent-light)" }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => deleteMapping(m.id)}
                              disabled={deletingId === m.id}
                              className="text-xs disabled:opacity-40 transition-colors hover:opacity-80"
                              style={{ color: "var(--danger-light)" }}
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
