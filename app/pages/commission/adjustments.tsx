//import Layout from "@/components/Layout";
import React, { useState, useEffect, useCallback } from "react";

// 1. Defined Interface for Adjustments
interface Adjustment {
  sid: number;
  vendor: string;
  month: string;
  owed: string | number;
  comments: string;
}

// 2. Define the API constant (or import it)
const API =
  process.env.NEXT_PUBLIC_API_URL || "${process.env.NEXT_PUBLIC_API_URL}/api";

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
      const res = await fetch(`${API}/commission/adjustments`);
      const json = await res.json();
      setRows(Array.isArray(json) ? json : []);
    } catch (err) {
      console.error("Load failed", err);
    }
  }, []);

  useEffect(() => {
    // We create an internal async function to handle the "cascading render" warning
    const initData = async () => {
      try {
        // Fetch vendors
        const vendorRes = await fetch(`${API}/commission/vendors`);
        const vendorJson = await vendorRes.json();
        setVendors(vendorJson);

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
    const res = await fetch(
      `${API}/commission/adjustments?uid=${uid}&user_name=${userName}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      },
    );
    if (res.ok) {
      setMsg({ type: "success", text: "Adjustment added." });
      setForm({ vendor: "", month: "", owed: "", comments: "" });
      loadAdjustments();
    } else {
      setMsg({ type: "error", text: "Failed to add adjustment." });
    }
  }

  async function handleDelete(sid: number) {
    if (!confirm("Delete this adjustment?")) return;
    const res = await fetch(
      `${API}/commission/adjustments/${sid}?uid=${uid}&user_name=${userName}`,
      { method: "DELETE" },
    );
    if (res.ok) {
      setMsg({ type: "success", text: "Adjustment deleted." });
      loadAdjustments();
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
      <h2 className="text-lg font-semibold text-orange-600 mb-4">
        Adjustments
      </h2>

      {msg && (
        <div
          className={`mb-4 px-4 py-2 rounded text-sm ${
            msg.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">
          Insert Adjustment
        </h3>
        <form onSubmit={handleAdd} className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Vendor</label>
            <select
              value={form.vendor}
              onChange={(e) =>
                setForm((p) => ({ ...p, vendor: e.target.value }))
              }
              className="border border-gray-300 rounded px-3 py-1.5 text-sm w-full text-black"
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
            <label className="block text-xs text-gray-500 mb-1">Month</label>
            <select
              value={form.month}
              onChange={(e) =>
                setForm((p) => ({ ...p, month: e.target.value }))
              }
              className="border border-gray-300 rounded px-3 py-1.5 text-sm w-full text-black"
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
            <label className="block text-xs text-gray-500 mb-1">
              Owed Amount
            </label>
            <input
              type="number"
              step="0.01"
              value={form.owed}
              onChange={(e) => setForm((p) => ({ ...p, owed: e.target.value }))}
              className="border border-gray-300 rounded px-3 py-1.5 text-sm w-full text-black"
              placeholder="e.g. -500.00"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Comments</label>
            <input
              type="text"
              value={form.comments}
              onChange={(e) =>
                setForm((p) => ({ ...p, comments: e.target.value }))
              }
              className="border border-gray-300 rounded px-3 py-1.5 text-sm w-full text-black"
              placeholder="Reason for adjustment"
            />
          </div>

          <div className="col-span-2">
            <button
              type="submit"
              className="bg-orange-500 text-white px-6 py-1.5 rounded text-sm hover:bg-orange-600"
            >
              Add Adjustment
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white border border-gray-200 rounded overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-100 border-b border-gray-200">
              {["#", "Vendor", "Month", "Owed", "Comments", "Action"].map(
                (h) => (
                  <th
                    key={h}
                    className="px-3 py-2 text-left text-xs font-medium text-gray-600 uppercase"
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
                  className="px-3 py-6 text-center text-gray-400 text-sm"
                >
                  No adjustments yet.
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={row.sid}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="px-3 py-2 text-gray-400 text-xs">{i + 1}</td>
                  <td className="px-3 py-2 font-medium text-black">
                    {row.vendor}
                  </td>
                  <td className="px-3 py-2 text-black">{row.month}</td>
                  <td
                    className={`px-3 py-2 font-medium ${parseFloat(String(row.owed)) < 0 ? "text-red-600" : "text-green-700"}`}
                  >
                    ${parseFloat(String(row.owed || 0)).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-gray-500">{row.comments}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => handleDelete(row.sid)}
                      className="bg-red-500 text-white px-2 py-0.5 rounded text-xs hover:bg-red-600"
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
