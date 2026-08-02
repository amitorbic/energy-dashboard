import React, { useState } from "react";
import api from "../../utils/api";

export default function DeleteCommissionData() {
  const [month, setMonth] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const uid = 1;
  const userName = "admin";

  const MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  async function handleDelete() {
    if (!month) {
      setMsg({ type: "error", text: "Please select a month." });
      return;
    }
    if (
      !confirm(
        `Delete ALL commission data for ${month}? This cannot be undone.`,
      )
    )
      return;

    setLoading(true);
    setMsg(null);
    try {
      const res = await api.delete(
        `/commission/data/month?month=${month}&uid=${uid}&user_name=${userName}`,
      );
      const json = res.data;
      setMsg({
        type: "success",
        text: `All commission data for ${json.month || month} deleted successfully.`,
      });
      setMonth("");
    } catch (err) {
      console.error("Delete request failed:", err);
      setMsg({ type: "error", text: "Delete failed." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {
        <div className="max-w-lg p-6">
          <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--accent-light)" }}>
            Delete Commission Data
          </h2>

          <div className="rounded-[var(--r-md)] border p-6 shadow-sm" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
            {/* 2. Fixed unescaped apostrophe for 'month's' */}
            <p className="text-sm mb-5" style={{ color: "var(--ct-text-secondary)" }}>
              Select a month to delete all commission data for that period. This
              is typically done to clear the previous month&apos;s data before
              recalculating with the current payment summary.
            </p>

            {msg && (
              <div
                className="mb-4 p-3 rounded-[var(--r-md)] text-sm border"
                style={msg.type === "success"
                  ? { background: "var(--success-light-tint)", borderColor: "var(--success-light-tint)", color: "var(--success-light)" }
                  : { background: "var(--danger-light-tint)", borderColor: "var(--danger-light-tint)", color: "var(--danger-light)" }}
              >
                {msg.text}
              </div>
            )}

            <div className="flex items-end gap-4">
              <div className="flex-1">
                <label className="block text-xs mb-1 font-bold uppercase" style={{ color: "var(--ct-text-muted)" }}>
                  Select Month
                </label>
                <select
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="rounded-[var(--r-sm)] border px-3 py-2 text-sm w-full outline-none focus:border-[var(--accent-light)]"
                  style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
                >
                  <option value="">Choose month...</option>
                  {MONTHS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleDelete}
                disabled={loading || !month}
                className="px-5 py-2 rounded-[var(--r-sm)] text-sm font-bold uppercase transition-all disabled:cursor-not-allowed active:scale-95"
                style={loading || !month
                  ? { background: "var(--ct-text-muted)", color: "#ffffff" }
                  : { background: "var(--danger-light)", color: "var(--danger-light-on-solid)" }}
              >
                {loading ? "Deleting..." : "Delete Data"}
              </button>
            </div>

            <div className="mt-6 p-3 border-l-4" style={{ background: "var(--danger-light-tint)", borderColor: "var(--danger-light)" }}>
              <p className="text-xs font-semibold" style={{ color: "var(--danger-light)" }}>
                Warning: This action is irreversible. Ensure you have reviewed
                the data in View Data before deleting.
              </p>
            </div>
          </div>
        </div>
      }
    </>
  );
}
