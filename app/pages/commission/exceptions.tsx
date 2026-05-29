import { useState, useEffect } from "react";

const API =
  process.env.NEXT_PUBLIC_API_URL || "${process.env.NEXT_PUBLIC_API_URL}/api";

// 1. Defined strict interfaces to replace 'any'
interface ExceptionRow {
  sid: number;
  vendor: string;
  premise_id: string;
  company_name: string;
  cust_status: string;
  service_start_date: string;
  service_end_date: string;
  commission_rate: string | number;
  commission_amount: string | number;
  kwh_usage: string | number;
  month: string;
  exception_type: string;
  variance_pct?: number;
  missing_fields?: string[];
  comments?: string;
  double_payment?: boolean;
  [key: string]: unknown;
}

interface ExceptionData {
  total: number;
  summary: Record<string, number>;
  exceptions: Record<string, ExceptionRow[]>;
}

const EXCEPTION_LABELS: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  duplicate: { label: "Duplicate", color: "text-red-700", bg: "bg-red-100" },
  variance_30: {
    label: "+/- 30% Variance",
    color: "text-amber-700",
    bg: "bg-amber-100",
  },
  inactive: {
    label: "Inactive Customer",
    color: "text-orange-700",
    bg: "bg-orange-100",
  },
  zero_commission: {
    label: "Zero Commission",
    color: "text-blue-700",
    bg: "bg-blue-100",
  },
  negative_commission: {
    label: "Negative Commission",
    color: "text-purple-700",
    bg: "bg-purple-100",
  },
  expired_contract: {
    label: "Expired Contract",
    color: "text-pink-700",
    bg: "bg-pink-100",
  },
  rate_anomaly: {
    label: "Rate Anomaly",
    color: "text-cyan-700",
    bg: "bg-cyan-100",
  },
  missing_data: {
    label: "Missing Data",
    color: "text-gray-700",
    bg: "bg-gray-200",
  },
};

const uid = 1;
const userName = "admin";

export default function CommissionExceptions() {
  const [months, setMonths] = useState<{ label: string; value: string }[]>([]);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [data, setData] = useState<ExceptionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [editingSid, setEditingSid] = useState<number | null>(null);
  const [editData, setEditData] = useState<Partial<ExceptionRow>>({});
  const [msg, setMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    fetch(`${API}/commission/months`)
      .then((r) => r.json())
      .then((m: { label: string; value: string }[]) => {
        setMonths(m);
        if (m.length > 0) setSelectedMonth(m[0].value);
      });
  }, []);

  async function runExceptions() {
    if (!selectedMonth) return;
    setLoading(true);
    setData(null);
    try {
      const parts = selectedMonth.split("/");
      const monthParam =
        parts.length === 3
          ? `${parts[2]}-${parts[0].padStart(2, "0")}`
          : selectedMonth;
      const res = await fetch(
        `${API}/commission/exceptions?month=${monthParam}`,
      );
      const json = await res.json();
      setData(json);
      setActiveFilter("all");
    } finally {
      setLoading(false);
    }
  }

  const allRows: ExceptionRow[] = data
    ? Object.entries(data.exceptions).flatMap(([type, rows]) =>
        rows.map((r) => ({
          ...r,
          exception_type: r.exception_type || type,
        })),
      )
    : [];

  const filteredRows =
    activeFilter === "all" ? allRows : data?.exceptions[activeFilter] || [];

  async function handleEdit(sid: number) {
    const res = await fetch(
      `${API}/commission/data/${sid}?uid=${uid}&user_name=${userName}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editData),
      },
    );
    if (res.ok) {
      setMsg({ type: "success", text: "Row updated." });
      setEditingSid(null);
      runExceptions();
    } else {
      setMsg({ type: "error", text: "Update failed." });
    }
  }

  async function handleDelete(sid: number) {
    if (!confirm("Delete this record from comm_bank?")) return;
    const res = await fetch(
      `${API}/commission/data/${sid}?uid=${uid}&user_name=${userName}`,
      {
        method: "DELETE",
      },
    );
    if (res.ok) {
      setMsg({ type: "success", text: "Record deleted." });
      runExceptions();
    }
  }
  const getBadgeStyle = (row: ExceptionRow) => {
    if (row.exception_type === "rate_anomaly" && row.anomaly_level === "red") {
      return { label: "Rate Anomaly", bg: "bg-red-100", color: "text-red-700" };
    }
    if (
      row.exception_type === "rate_anomaly" &&
      row.anomaly_level === "yellow"
    ) {
      return {
        label: "Rate Anomaly",
        bg: "bg-yellow-100",
        color: "text-yellow-700",
      };
    }
    return (
      EXCEPTION_LABELS[row.exception_type] || EXCEPTION_LABELS.missing_data
    );
  };

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-orange-600 mb-1">
        Commission Exceptions
      </h2>
      <p className="text-sm text-gray-500 mb-5">
        Automated audit checks — review and resolve exceptions before finalizing
        commission.
      </p>

      <div className="bg-white border border-gray-200 rounded p-4 mb-5 flex items-end gap-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Select Month
          </label>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm min-w-[180px]"
          >
            <option value="">Choose month...</option>
            {months.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={runExceptions}
          disabled={loading || !selectedMonth}
          className={`px-5 py-1.5 rounded text-white text-sm font-medium ${
            loading || !selectedMonth
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-orange-500 hover:bg-orange-600"
          }`}
        >
          {loading ? "Running..." : "Run Exceptions"}
        </button>
      </div>

      {msg && (
        <div
          className={`mb-4 px-4 py-2 rounded text-sm ${msg.type === "success" ? "bg-green-50 border border-green-200 text-green-800" : "bg-red-50 border border-red-200 text-red-800"}`}
        >
          {msg.text}
        </div>
      )}

      {data && (
        <div className="mb-5">
          <div className="flex flex-wrap gap-2 mb-3">
            <button
              onClick={() => setActiveFilter("all")}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                activeFilter === "all"
                  ? "bg-gray-800 text-white border-gray-800"
                  : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
              }`}
            >
              All ({data.total})
            </button>
            {Object.entries(data.summary).map(([type, count]) => {
              if (count === 0) return null;
              const meta =
                EXCEPTION_LABELS[type] || EXCEPTION_LABELS.missing_data;
              return (
                <button
                  key={type}
                  onClick={() => setActiveFilter(type)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    activeFilter === type
                      ? `${meta.bg} ${meta.color} border-current`
                      : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
                  }`}
                >
                  {meta.label} ({count})
                </button>
              );
            })}
          </div>
        </div>
      )}

      {data && (
        <div className="bg-white border border-gray-200 rounded overflow-auto">
          {filteredRows.length === 0 ? (
            <div className="p-8 text-center text-green-600 text-sm font-medium">
              ✓ No exceptions found for this check.
            </div>
          ) : (
            <table className="w-full text-xs min-w-[1100px]">
              <thead>
                <tr className="bg-gray-100 border-b border-gray-200">
                  {[
                    "#",
                    "Exception",
                    "Vendor",
                    "Premise ID",
                    "Company",
                    "Status",
                    "Svc Start",
                    "Svc End",
                    "Comm Rate",
                    "Comm Amt",
                    "KWH",
                    "Month",
                    "Actions",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left text-gray-600 font-medium"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, i) => {
                  const meta = getBadgeStyle(row);
                  const isEditing = editingSid === row.sid;
                  return (
                    <tr
                      key={`${row.sid}-${i}`}
                      className="border-b border-gray-100 hover:bg-gray-50"
                    >
                      <td className="px-3 py-1.5 text-gray-400">{i + 1}</td>
                      <td className="px-3 py-1.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${meta.bg} ${meta.color}`}
                        >
                          {meta.label}
                          {row.variance_pct && ` (${row.variance_pct}%)`}
                          {row.missing_fields &&
                            ` — ${row.missing_fields.join(", ")}`}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 font-medium">{row.vendor}</td>
                      <td className="px-3 py-1.5 font-mono">
                        {row.premise_id}
                      </td>
                      <td className="px-3 py-1.5 max-w-[140px] truncate">
                        {row.company_name}
                      </td>
                      <td className="px-3 py-1.5">
                        {isEditing ? (
                          <input
                            value={
                              editData.cust_status ?? row.cust_status ?? ""
                            }
                            onChange={(e) =>
                              setEditData((p) => ({
                                ...p,
                                cust_status: e.target.value,
                              }))
                            }
                            className="border border-blue-300 rounded px-1 py-0.5 w-12 text-xs"
                          />
                        ) : (
                          <span
                            className={`px-1.5 py-0.5 rounded text-xs font-medium ${row.cust_status === "A" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                          >
                            {row.cust_status}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5">{row.service_start_date}</td>
                      <td className="px-3 py-1.5">{row.service_end_date}</td>
                      <td className="px-3 py-1.5">
                        {isEditing ? (
                          <input
                            value={
                              editData.commission_rate ??
                              row.commission_rate ??
                              ""
                            }
                            onChange={(e) =>
                              setEditData((p) => ({
                                ...p,
                                commission_rate: e.target.value,
                              }))
                            }
                            className="border border-blue-300 rounded px-1 py-0.5 w-16 text-xs"
                          />
                        ) : (
                          row.commission_rate
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        {isEditing ? (
                          <input
                            value={
                              editData.commission_amount ??
                              row.commission_amount ??
                              ""
                            }
                            onChange={(e) =>
                              setEditData((p) => ({
                                ...p,
                                commission_amount: e.target.value,
                              }))
                            }
                            className="border border-blue-300 rounded px-1 py-0.5 w-20 text-xs"
                          />
                        ) : (
                          <span
                            className={
                              parseFloat(String(row.commission_amount)) < 0
                                ? "text-red-600 font-medium"
                                : ""
                            }
                          >
                            {parseFloat(
                              String(row.commission_amount || 0),
                            ).toFixed(4)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5">{row.kwh_usage}</td>
                      <td className="px-3 py-1.5">{row.month}</td>
                      <td className="px-3 py-1.5">
                        {isEditing ? (
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleEdit(row.sid)}
                              className="bg-green-600 text-white px-2 py-0.5 rounded text-xs hover:bg-green-700"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingSid(null)}
                              className="bg-gray-400 text-white px-2 py-0.5 rounded text-xs"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-1">
                            <button
                              onClick={() => {
                                setEditingSid(row.sid);
                                setEditData({
                                  commission_rate: row.commission_rate,
                                  commission_amount: row.commission_amount,
                                  cust_status: row.cust_status,
                                  kwh_usage: row.kwh_usage,
                                  comments: row.comments,
                                });
                              }}
                              className="bg-blue-500 text-white px-2 py-0.5 rounded text-xs hover:bg-blue-600"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(row.sid)}
                              className="bg-red-500 text-white px-2 py-0.5 rounded text-xs hover:bg-red-600"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {!data && !loading && (
        <div className="bg-white border border-gray-200 rounded p-10 text-center text-gray-400 text-sm">
          {/* 2. Fixed unescaped entities error */}
          Select a month and click &quot;Run Exceptions&quot; to start the
          audit.
        </div>
      )}
    </div>
  );
}
