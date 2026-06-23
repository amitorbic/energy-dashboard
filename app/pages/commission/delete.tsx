import React, { useState } from "react";
import Layout from "@/components/Layout";
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
    <Layout>
      {
        <div className="max-w-lg p-6">
          <h2 className="text-lg font-semibold text-orange-600 mb-4">
            Delete Commission Data
          </h2>

          <div className="bg-white border border-gray-200 rounded p-6 shadow-sm">
            {/* 2. Fixed unescaped apostrophe for 'month's' */}
            <p className="text-sm text-gray-600 mb-5">
              Select a month to delete all commission data for that period. This
              is typically done to clear the previous month&apos;s data before
              recalculating with the current payment summary.
            </p>

            {msg && (
              <div
                className={`mb-4 p-3 rounded text-sm border ${
                  msg.type === "success"
                    ? "bg-green-50 border-green-200 text-green-800"
                    : "bg-red-50 border-red-200 text-red-800"
                }`}
              >
                {msg.text}
              </div>
            )}

            <div className="flex items-end gap-4">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1 font-bold uppercase">
                  Select Month
                </label>
                <select
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-2 text-sm w-full text-black focus:border-orange-500 outline-none"
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
                className={`px-5 py-2 rounded text-white text-sm font-bold uppercase transition-all ${
                  loading || !month
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-red-600 hover:bg-red-700 active:scale-95"
                }`}
              >
                {loading ? "Deleting..." : "Delete Data"}
              </button>
            </div>

            <div className="mt-6 p-3 bg-red-50 border-l-4 border-red-500">
              <p className="text-xs text-red-700 font-semibold">
                Warning: This action is irreversible. Ensure you have reviewed
                the data in View Data before deleting.
              </p>
            </div>
          </div>
        </div>
      }
    </Layout>
  );
}
