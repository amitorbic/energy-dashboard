import React, { useState, useEffect, useCallback } from "react";
import api from "../../utils/api";

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

      const res = await api.get(`/commission/data?${params}`);
      setRows(Array.isArray(res.data) ? res.data : []);
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
    api.get('/commission/vendors').then(res => setBrokers(res.data));
    api.get('/commission/months').then(res => {
      const m: MonthOption[] = res.data;
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
    try {
      await api.put(`/commission/data/${sid}?uid=${uid}&user_name=${userName}`, editData);
      setMsg({ type: "success", text: "Row updated successfully." });
      setEditingSid(null);
      fetchData();
    } catch {
      setMsg({ type: "error", text: "Update failed." });
    }
  }

  async function deleteRow(sid: number) {
    if (!confirm("Delete this row?")) return;
    try {
      await api.delete(`/commission/data/${sid}?uid=${uid}&user_name=${userName}`);
      setMsg({ type: "success", text: "Row deleted." });
      fetchData();
    } catch {
      setMsg({ type: "error", text: "Delete failed." });
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

  const auditFlagStyle = (row: CommissionRow): React.CSSProperties | undefined => {
    if (row.double_payment) return { background: "var(--danger-light-tint)" };
    if (row.variance_pct) return { background: "var(--amber-light-tint)" };
    return undefined;
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--ct-canvas)" }}>
      <div className="border-b px-6 py-4" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)", boxShadow: "var(--shadow-content)" }}>
        <h1 className="text-xl font-bold uppercase tracking-tighter" style={{ color: "var(--ct-text-primary)" }}>
          Commission Data
        </h1>
        <p className="text-xs font-bold" style={{ color: "var(--ct-text-muted)" }}>
          AUDIT & VIEW INTERFACE
        </p>
      </div>

      <div className="flex">
        <main className="flex-1 p-8 overflow-auto">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-black uppercase tracking-widest" style={{ color: "var(--ct-text-primary)" }}>
              Data Repository
            </h2>
            {rows.length > 0 && (
              <button
                onClick={downloadCSV}
                className="px-5 py-2 rounded-[var(--r-sm)] shadow-md text-xs font-bold uppercase transition-colors"
                style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
              >
                Export to CSV
              </button>
            )}
          </div>

          {msg && (
            <div
              className="mb-6 p-4 rounded-[var(--r-md)] text-sm font-medium border-l-4 shadow-sm"
              style={msg.type === "success"
                ? { background: "var(--success-light-tint)", color: "var(--success-light)", borderColor: "var(--success-light)" }
                : { background: "var(--danger-light-tint)", color: "var(--danger-light)", borderColor: "var(--danger-light)" }}
            >
              {msg.text}
            </div>
          )}

          {/* Filters */}
          <div className="rounded-[var(--r-md)] border p-4 mb-4" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
            <div className="flex flex-wrap gap-6 items-start">
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--ct-text-muted)" }}>
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
                  className="rounded-[var(--r-sm)] border px-2 py-1 text-sm h-28 min-w-[200px]"
                  style={{ borderColor: "var(--ct-border-default)" }}
                >
                  {brokers.map((b) => (
                    <option key={b.vendor} value={b.vendor}>
                      {b.company_name || b.vendor}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--ct-text-muted)" }}>
                  Period Range
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={fromMonth}
                    onChange={(e) => {
                      setFromMonth(e.target.value);
                      setQuickPeriod("");
                    }}
                    className="rounded-[var(--r-sm)] border px-2 py-1.5 text-sm min-w-[160px]"
                    style={{ borderColor: "var(--ct-border-default)" }}
                  >
                    {months.map((m: MonthOption) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <span className="text-sm" style={{ color: "var(--ct-text-muted)" }}>to</span>
                  <select
                    value={toMonth}
                    onChange={(e) => {
                      setToMonth(e.target.value);
                      setQuickPeriod("");
                    }}
                    className="rounded-[var(--r-sm)] border px-2 py-1.5 text-sm min-w-[160px]"
                    style={{ borderColor: "var(--ct-border-default)" }}
                  >
                    {months.map((m: MonthOption) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-1 mt-2">
                  <span className="text-xs self-center mr-1" style={{ color: "var(--ct-text-muted)" }}>
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
                      className="px-2 py-0.5 rounded-[var(--r-sm)] text-xs border transition-colors hover:border-[var(--accent-light)]"
                      style={quickPeriod === String(n)
                        ? { background: "var(--accent-light)", color: "var(--accent-light-on-solid)", borderColor: "var(--accent-light)" }
                        : { background: "var(--ct-surface)", color: "var(--ct-text-secondary)", borderColor: "var(--ct-border-default)" }}
                    >
                      {n}mo
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs mb-2" style={{ color: "var(--ct-text-muted)" }}>
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
                      className="flex items-center gap-2 text-sm cursor-pointer"
                      style={{ color: "var(--ct-text-secondary)" }}
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
                        className="rounded-[var(--r-sm)]"
                        style={{ accentColor: "var(--accent-light)" }}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="self-end flex gap-2">
                <button
                  onClick={fetchData}
                  className="px-5 py-1.5 rounded-[var(--r-sm)] text-sm transition-colors"
                  style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
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
                  className="px-5 py-1.5 rounded-[var(--r-sm)] text-sm transition-colors hover:bg-[var(--ct-surface-hover)]"
                  style={{ background: "var(--ct-surface-hover)", color: "var(--ct-text-secondary)" }}
                >
                  Clear
                </button>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-[var(--r-lg)] border shadow-sm overflow-hidden" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
            {loading ? (
              <div className="p-20 text-center font-bold animate-pulse" style={{ color: "var(--ct-text-muted)" }}>
                Scanning ORBIC Database...
              </div>
            ) : rows.length === 0 ? (
              <div className="p-20 text-center" style={{ color: "var(--ct-text-muted)" }}>
                No records found for current criteria.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] min-w-[1500px]">
                  <thead className="border-b" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}>
                    <tr>
                      {DISPLAY_COLUMNS.map((col) => (
                        <th
                          key={col.key}
                          className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest whitespace-nowrap"
                          style={{ color: "var(--ct-text-muted)" }}
                        >
                          {col.label}
                        </th>
                      ))}
                      <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--ct-text-muted)" }}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: "var(--ct-border-subtle)" }}>
                    {rows.map((row) => (
                      <tr
                        key={row.sid}
                        className="transition-colors hover:bg-[var(--ct-surface-hover)]"
                        style={auditFlagStyle(row)}
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
                                    className="rounded-[var(--r-sm)] border px-2 py-1 w-full text-xs font-bold"
                                    style={{ borderColor: "var(--accent-light)" }}
                                  />
                                ) : (
                                  <span style={{ color: "var(--ct-text-muted)" }}>
                                    {row[col.key]}
                                  </span>
                                )}
                              </td>
                            ))}
                            <td className="px-4 py-2 flex gap-2">
                              <button
                                onClick={() => saveEdit(row.sid)}
                                className="px-3 py-1 rounded-[var(--r-sm)] text-[10px] font-bold uppercase"
                                style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingSid(null)}
                                className="px-3 py-1 rounded-[var(--r-sm)] text-[10px] font-bold uppercase"
                                style={{ background: "var(--ct-text-muted)", color: "#ffffff" }}
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
                                className="px-4 py-3 whitespace-nowrap"
                                style={{ color: "var(--ct-text-secondary)" }}
                              >
                                {col.key === "commission_amount"
                                  ? Number(row[col.key] ?? 0).toFixed(4)
                                  : (row[col.key] ?? "")}
                                {col.key === "commission_amount" &&
                                  row.variance_pct && (
                                    <span className="ml-2 font-bold" style={{ color: "var(--amber-light)" }}>
                                      (+{row.variance_pct}%)
                                    </span>
                                  )}
                              </td>
                            ))}
                            <td className="px-4 py-3 flex gap-2">
                              <button
                                onClick={() => startEdit(row)}
                                className="font-bold uppercase text-[10px] hover:underline"
                                style={{ color: "var(--accent-light)" }}
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => deleteRow(row.sid)}
                                className="font-bold uppercase text-[10px] hover:underline"
                                style={{ color: "var(--danger-light)" }}
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
