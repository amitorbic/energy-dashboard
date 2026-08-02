import React, { useState, useEffect, useCallback } from "react";
import api from "../../utils/api";

interface Adjustment {
  sid: number;
  vendor: string;
  month: string;
  owed: string | number;
  comments: string;
}


export default function Adjustments() {
  // 3. Proper Types for State
  const [rows, setRows] = useState<Adjustment[]>([]);
  const [vendors, setVendors] = useState<
    { vendor: string; company_name: string }[]
  >([]);

  // Dummy user data - replace with your actual auth logic (e.g., const { uid, userName } = useUser())
  const uid = 1;
  const userName = "Amit";

  const [form, setForm] = useState({
    vendor: "",
    month: "",
    owed: "",
    comments: "",
  });

  const [msg, setMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // 4. Wrap loadAdjustments in useCallback to fix hoisting and dependency issues
  const loadAdjustments = useCallback(async () => {
    try {
      const res = await api.get('/commission/adjustments');
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Load failed", err);
    }
  }, []);

  useEffect(() => {
    // We create an internal async function to handle the "cascading render" warning
    const initData = async () => {
      try {
        const vendorRes = await api.get('/commission/vendors');
        setVendors(vendorRes.data);

        // Fetch adjustments
        await loadAdjustments();
      } catch (err) {
        console.error("Initialization failed", err);
      }
    };

    initData();
  }, [loadAdjustments]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post(`/commission/adjustments?uid=${uid}&user_name=${userName}`, form);
      setMsg({ type: "success", text: "Adjustment added." });
      setForm({ vendor: "", month: "", owed: "", comments: "" });
      loadAdjustments();
    } catch {
      setMsg({ type: "error", text: "Failed to add adjustment." });
    }
  }

  async function handleDelete(sid: number) {
    if (!confirm("Delete this adjustment?")) return;
    try {
      await api.delete(`/commission/adjustments/${sid}?uid=${uid}&user_name=${userName}`);
      setMsg({ type: "success", text: "Adjustment deleted." });
      loadAdjustments();
    } catch {
      setMsg({ type: "error", text: "Delete failed." });
    }
  }

  const MONTHS = [
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
  ];

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--accent-light)" }}>
        Adjustments
      </h2>

      {msg && (
        <div
          className="mb-4 px-4 py-2 rounded-[var(--r-md)] text-sm border"
          style={msg.type === "success"
            ? { background: "var(--success-light-tint)", borderColor: "var(--success-light-tint)", color: "var(--success-light)" }
            : { background: "var(--danger-light-tint)", borderColor: "var(--danger-light-tint)", color: "var(--danger-light)" }}
        >
          {msg.text}
        </div>
      )}

      <div className="rounded-[var(--r-md)] border p-5 mb-6" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
        <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--ct-text-secondary)" }}>
          Insert Adjustment
        </h3>
        <form onSubmit={handleAdd} className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--ct-text-muted)" }}>Vendor</label>
            <select
              value={form.vendor}
              onChange={(e) =>
                setForm((p) => ({ ...p, vendor: e.target.value }))
              }
              className="rounded-[var(--r-sm)] border px-3 py-1.5 text-sm w-full focus:outline-none focus:border-[var(--accent-light)]"
              style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
              required
            >
              <option value="">Select vendor</option>
              {vendors.map((v) => (
                <option key={v.vendor} value={v.vendor}>
                  {v.company_name || v.vendor}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--ct-text-muted)" }}>Month</label>
            <select
              value={form.month}
              onChange={(e) =>
                setForm((p) => ({ ...p, month: e.target.value }))
              }
              className="rounded-[var(--r-sm)] border px-3 py-1.5 text-sm w-full focus:outline-none focus:border-[var(--accent-light)]"
              style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
              required
            >
              <option value="">Select month</option>
              {MONTHS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--ct-text-muted)" }}>
              Owed Amount
            </label>
            <input
              type="number"
              step="0.01"
              value={form.owed}
              onChange={(e) => setForm((p) => ({ ...p, owed: e.target.value }))}
              className="rounded-[var(--r-sm)] border px-3 py-1.5 text-sm w-full focus:outline-none focus:border-[var(--accent-light)]"
              style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
              placeholder="e.g. -500.00"
              required
            />
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--ct-text-muted)" }}>Comments</label>
            <input
              type="text"
              value={form.comments}
              onChange={(e) =>
                setForm((p) => ({ ...p, comments: e.target.value }))
              }
              className="rounded-[var(--r-sm)] border px-3 py-1.5 text-sm w-full focus:outline-none focus:border-[var(--accent-light)]"
              style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
              placeholder="Reason for adjustment"
            />
          </div>

          <div className="col-span-2">
            <button
              type="submit"
              className="px-6 py-1.5 rounded-[var(--r-sm)] text-sm transition-colors"
              style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
            >
              Add Adjustment
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-[var(--r-md)] border overflow-auto" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}>
              {["#", "Vendor", "Month", "Owed", "Comments", "Action"].map(
                (h) => (
                  <th
                    key={h}
                    className="px-3 py-2 text-left text-xs font-medium uppercase"
                    style={{ color: "var(--ct-text-muted)" }}
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-6 text-center text-sm"
                  style={{ color: "var(--ct-text-muted)" }}
                >
                  No adjustments yet.
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={row.sid}
                  className="border-b hover:bg-[var(--ct-surface-hover)]"
                  style={{ borderColor: "var(--ct-border-subtle)" }}
                >
                  <td className="px-3 py-2 text-xs" style={{ color: "var(--ct-text-muted)" }}>{i + 1}</td>
                  <td className="px-3 py-2 font-medium" style={{ color: "var(--ct-text-primary)" }}>
                    {row.vendor}
                  </td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-primary)" }}>{row.month}</td>
                  <td
                    className="px-3 py-2 font-medium"
                    style={{ color: parseFloat(String(row.owed)) < 0 ? "var(--danger-light)" : "var(--success-light)" }}
                  >
                    ${parseFloat(String(row.owed || 0)).toFixed(2)}
                  </td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{row.comments}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => handleDelete(row.sid)}
                      className="px-2 py-0.5 rounded-[var(--r-sm)] text-xs transition-colors"
                      style={{ background: "var(--danger-light)", color: "var(--danger-light-on-solid)" }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
