import React, { useState, useEffect, useCallback } from "react";
//import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001/api";

interface CommissionRow {
  sid: number;
  vendor: string;
  vendor_id: string;
  vendor_name?: string;
  premise_id?: string;
  company_name: string;
  cust_status: string;
  service_start_date?: string;
  service_end_date?: string;
  commission_rate: string | number;
  commission_amount: string | number;
  kwh_usage: string | number;
  month: string;
  comments: string;
  double_payment?: boolean;
  variance_pct?: number;
  [key: string]: string | number | boolean | null | undefined;
}
type MonthOption = {
  label: string;
  value: string;
};
type BrokerOption = {
  vendor: string;
  company_name: string;
};

const DISPLAY_COLUMNS = [
  { key: "vendor", label: "Vendor" },
  { key: "vendor_id", label: "Vendor ID" },
  { key: "vendor_name", label: "Vendor Name" },
  { key: "premise_id", label: "Premise ID" },
  { key: "company_name", label: "Company" },
  { key: "cust_status", label: "Status" },
  { key: "service_start_date", label: "Svc Start" },
  { key: "service_end_date", label: "Svc End" },
  { key: "commission_rate", label: "Comm Rate" },
  { key: "commission_amount", label: "Comm Amount" },
  { key: "kwh_usage", label: "kWh Usage" },
  { key: "month", label: "Month" },
  { key: "comments", label: "Comments" },
];

const uid = 1;
const userName = "admin";

export default function ViewCommissionData() {
  // 1. Swapped 'Row' for 'CommissionRow'
  const [rows, setRows] = useState<CommissionRow[]>([]);
  const [brokers, setBrokers] = useState<BrokerOption[]>([]);
  const [months, setMonths] = useState<MonthOption[]>([]);
  const [selectedVendors, setSelectedVendors] = useState<string[]>([]);
  const [fromMonth, setFromMonth] = useState("");
  const [toMonth, setToMonth] = useState("");
  const [quickPeriod, setQuickPeriod] = useState("");
  const [checkDuplicate, setCheckDuplicate] = useState(false);
  const [checkVariance, setCheckVariance] = useState(false);
  const [checkCompare, setCheckCompare] = useState(false);
  const [checkInactive, setCheckInactive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingSid, setEditingSid] = useState<number | null>(null);

  // 2. Swapped 'Row' for 'Partial<CommissionRow>'
  const [editData, setEditData] = useState<Partial<CommissionRow>>({});
  const [msg, setMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      selectedVendors.forEach((v) => params.append("vendor", v));

      if (quickPeriod) {
        params.set("quick_period", quickPeriod);
      } else {
        if (fromMonth) params.set("from_month", fromMonth);
        if (toMonth) params.set("to_month", toMonth);
      }

      if (checkDuplicate) params.set("audit_mode", "double_payment");
      else if (checkVariance) params.set("audit_mode", "variance_30");
      else if (checkCompare) params.set("audit_mode", "compare");
      else if (checkInactive) params.set("audit_mode", "inactive");

      const res = await fetch(`${API}/commission/data?${params}`);
      const json = await res.json();
      setRows(Array.isArray(json) ? json : []);
    } finally {
      setLoading(false);
    }
  }, [
    selectedVendors,
    fromMonth,
    toMonth,
    quickPeriod,
    checkDuplicate,
    checkVariance,
    checkCompare,
    checkInactive,
  ]);

  useEffect(() => {
    fetch(`${API}/commission/vendors`)
      .then((r) => r.json())
      .then((data) => setBrokers(data));
    fetch(`${API}/commission/months`)
      .then((r) => r.json())
      .then((m: MonthOption[]) => {
        setMonths(m);
        if (m.length > 0) setFromMonth(m[0].value);
      });
  }, []);

  function startEdit(row: CommissionRow) {
    setEditingSid(row.sid);
    setEditData({
      commission_rate: row.commission_rate ?? "",
      commission_amount: row.commission_amount ?? "",
      comments: row.comments ?? "",
      cust_status: row.cust_status ?? "",
      kwh_usage: row.kwh_usage ?? "",
    });
  }

  async function saveEdit(sid: number) {
    const res = await fetch(
      `${API}/commission/data/${sid}?uid=${uid}&user_name=${userName}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editData),
      },
    );
    if (res.ok) {
      setMsg({ type: "success", text: "Row updated successfully." });
      setEditingSid(null);
      fetchData();
    } else {
      setMsg({ type: "error", text: "Update failed." });
    }
  }

  async function deleteRow(sid: number) {
    if (!confirm("Delete this row?")) return;
    const res = await fetch(
      `${API}/commission/data/${sid}?uid=${uid}&user_name=${userName}`,
      { method: "DELETE" },
    );
    if (res.ok) {
      setMsg({ type: "success", text: "Row deleted." });
      fetchData();
    }
  }

  function downloadCSV() {
    if (!rows.length) return;
    const headers = DISPLAY_COLUMNS.map((c) => c.label).join(",");
    const csvRows = rows.map((row) =>
      DISPLAY_COLUMNS.map((c) => {
        const val = String(row[c.key] ?? "").replace(/,/g, "");
        return `"${val}"`;
      }).join(","),
    );
    const blob = new Blob([[headers, ...csvRows].join("\n")], {
      type: "text/csv",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // 3. Fixed 'month' variable (used fromMonth as a fallback)
    a.download = `commission_data_${fromMonth || "export"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const auditFlagColor = (row: CommissionRow) => {
    if (row.double_payment) return "bg-red-50";
    if (row.variance_pct) return "bg-amber-50";
    return "";
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4 shadow-sm">
        <h1 className="text-xl font-bold text-gray-800 uppercase tracking-tighter">
          Commission Data
        </h1>
        <p className="text-xs text-gray-400 font-bold">
          AUDIT & VIEW INTERFACE
        </p>
      </div>

      <div className="flex">
        <main className="flex-1 p-8 overflow-auto">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-black text-gray-800 uppercase tracking-widest">
              Data Repository
            </h2>
            {rows.length > 0 && (
              <button
                onClick={downloadCSV}
                className="bg-green-600 text-white px-5 py-2 rounded shadow-md text-xs font-bold uppercase hover:bg-green-700"
              >
                Export to CSV
              </button>
            )}
          </div>

          {msg && (
            <div
              className={`mb-6 p-4 rounded text-sm font-medium border-l-4 shadow-sm ${
                msg.type === "success"
                  ? "bg-green-50 text-green-800 border-green-500"
                  : "bg-red-50 text-red-800 border-red-500"
              }`}
            >
              {msg.text}
            </div>
          )}

          {/* Filters */}
          <div className="bg-white border border-gray-200 rounded p-4 mb-4">
            <div className="flex flex-wrap gap-6 items-start">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Vendor IDs
                </label>
                <select
                  multiple
                  value={selectedVendors}
                  onChange={(e) =>
                    setSelectedVendors(
                      Array.from(e.target.selectedOptions, (o) => o.value),
                    )
                  }
                  className="border border-gray-300 rounded px-2 py-1 text-sm h-28 min-w-[200px]"
                >
                  {brokers.map((b) => (
                    <option key={b.vendor} value={b.vendor}>
                      {b.company_name || b.vendor}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Period Range
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={fromMonth}
                    onChange={(e) => {
                      setFromMonth(e.target.value);
                      setQuickPeriod("");
                    }}
                    className="border border-gray-300 rounded px-2 py-1.5 text-sm min-w-[160px]"
                  >
                    {months.map((m: MonthOption) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <span className="text-gray-400 text-sm">to</span>
                  <select
                    value={toMonth}
                    onChange={(e) => {
                      setToMonth(e.target.value);
                      setQuickPeriod("");
                    }}
                    className="border border-gray-300 rounded px-2 py-1.5 text-sm min-w-[160px]"
                  >
                    {months.map((m: MonthOption) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-1 mt-2">
                  <span className="text-xs text-gray-500 self-center mr-1">
                    Quick:
                  </span>
                  {[2, 3, 6, 9, 12].map((n) => (
                    <button
                      key={n}
                      onClick={() => {
                        setQuickPeriod(String(n));
                        setFromMonth("");
                        setToMonth("");
                      }}
                      className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                        quickPeriod === String(n)
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"
                      }`}
                    >
                      {n}mo
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-2">
                  Audit Options
                </label>
                <div className="space-y-1.5">
                  {[
                    {
                      key: "duplicate",
                      label: "Duplicate",
                      state: checkDuplicate,
                      set: setCheckDuplicate,
                    },
                    {
                      key: "variance",
                      label: "+/- 30% Variance",
                      state: checkVariance,
                      set: setCheckVariance,
                    },
                    {
                      key: "compare",
                      label: "Compare Periods",
                      state: checkCompare,
                      set: setCheckCompare,
                    },
                    {
                      key: "inactive",
                      label: "Inactive Customers",
                      state: checkInactive,
                      set: setCheckInactive,
                    },
                  ].map((opt) => (
                    <label
                      key={opt.key}
                      className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={opt.state}
                        onChange={(e) => {
                          setCheckDuplicate(false);
                          setCheckVariance(false);
                          setCheckCompare(false);
                          setCheckInactive(false);
                          opt.set(e.target.checked);
                        }}
                        className="rounded"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="self-end flex gap-2">
                <button
                  onClick={fetchData}
                  className="bg-blue-600 text-white px-5 py-1.5 rounded text-sm hover:bg-blue-700"
                >
                  Search
                </button>
                <button
                  onClick={() => {
                    setSelectedVendors([]);
                    setFromMonth("");
                    setToMonth("");
                    setQuickPeriod("");
                    setCheckDuplicate(false);
                    setCheckVariance(false);
                    setCheckCompare(false);
                    setCheckInactive(false);
                    setRows([]);
                  }}
                  className="bg-gray-200 text-gray-700 px-5 py-1.5 rounded text-sm hover:bg-gray-300"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-20 text-center text-gray-400 font-bold animate-pulse">
                Scanning AmeriPower Database...
              </div>
            ) : rows.length === 0 ? (
              <div className="p-20 text-center text-gray-400">
                No records found for current criteria.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] min-w-[1500px]">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {DISPLAY_COLUMNS.map((col) => (
                        <th
                          key={col.key}
                          className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap"
                        >
                          {col.label}
                        </th>
                      ))}
                      <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map((row) => (
                      <tr
                        key={row.sid}
                        className={`hover:bg-blue-50/30 transition-colors ${auditFlagColor(row)}`}
                      >
                        {editingSid === row.sid ? (
                          <>
                            {DISPLAY_COLUMNS.map((col) => (
                              <td key={col.key} className="px-2 py-2">
                                {[
                                  "commission_rate",
                                  "commission_amount",
                                  "comments",
                                  "cust_status",
                                  "kwh_usage",
                                ].includes(col.key) ? (
                                  <input
                                    value={String(
                                      editData[
                                        col.key as keyof CommissionRow
                                      ] ?? "",
                                    )}
                                    onChange={(e) =>
                                      setEditData(
                                        (p: Partial<CommissionRow>) => ({
                                          ...p,
                                          [col.key]: e.target.value,
                                        }),
                                      )
                                    }
                                    className="border border-orange-300 rounded px-2 py-1 w-full text-xs font-bold"
                                  />
                                ) : (
                                  <span className="text-gray-400">
                                    {row[col.key]}
                                  </span>
                                )}
                              </td>
                            ))}
                            <td className="px-4 py-2 flex gap-2">
                              <button
                                onClick={() => saveEdit(row.sid)}
                                className="bg-green-600 text-white px-3 py-1 rounded text-[10px] font-bold uppercase"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingSid(null)}
                                className="bg-gray-400 text-white px-3 py-1 rounded text-[10px] font-bold uppercase"
                              >
                                Esc
                              </button>
                            </td>
                          </>
                        ) : (
                          <>
                            {DISPLAY_COLUMNS.map((col) => (
                              <td
                                key={col.key}
                                className="px-4 py-3 text-gray-700 whitespace-nowrap"
                              >
                                {col.key === "commission_amount"
                                  ? Number(row[col.key] ?? 0).toFixed(4)
                                  : (row[col.key] ?? "")}
                                {col.key === "commission_amount" &&
                                  row.variance_pct && (
                                    <span className="ml-2 text-amber-600 font-bold">
                                      (+{row.variance_pct}%)
                                    </span>
                                  )}
                              </td>
                            ))}
                            <td className="px-4 py-3 flex gap-2">
                              <button
                                onClick={() => startEdit(row)}
                                className="text-blue-600 font-bold uppercase text-[10px] hover:underline"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => deleteRow(row.sid)}
                                className="text-red-600 font-bold uppercase text-[10px] hover:underline"
                              >
                                Del
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
