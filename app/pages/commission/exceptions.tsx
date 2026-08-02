import { useState, useEffect } from "react";
import api from "../../utils/api";

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

// Exception types are tiered into two severity levels using the shared
// semantic palette: "danger" for financial errors that need urgent
// correction, "amber" for data-quality items that need review.
const EXCEPTION_LABELS: Record<
  string,
  { label: string; tier: "danger" | "amber" }
> = {
  duplicate: { label: "Duplicate", tier: "danger" },
  variance_30: { label: "+/- 30% Variance", tier: "amber" },
  inactive: { label: "Inactive Customer", tier: "amber" },
  zero_commission: { label: "Zero Commission", tier: "amber" },
  negative_commission: { label: "Negative Commission", tier: "danger" },
  expired_contract: { label: "Expired Contract", tier: "amber" },
  rate_anomaly: { label: "Rate Anomaly", tier: "amber" },
  missing_data: { label: "Missing Data", tier: "amber" },
};

const TIER_STYLE: Record<"danger" | "amber", { background: string; color: string }> = {
  danger: { background: "var(--danger-light-tint)", color: "var(--danger-light)" },
  amber: { background: "var(--amber-light-tint)", color: "var(--amber-light)" },
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
    api.get('/commission/months').then(res => {
      const m: { label: string; value: string }[] = res.data;
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
      const res = await api.get(`/commission/exceptions?month=${monthParam}`);
      setData(res.data);
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
    try {
      await api.put(`/commission/data/${sid}?uid=${uid}&user_name=${userName}`, editData);
      setMsg({ type: "success", text: "Row updated." });
      setEditingSid(null);
      runExceptions();
    } catch {
      setMsg({ type: "error", text: "Update failed." });
    }
  }

  async function handleDelete(sid: number) {
    if (!confirm("Delete this record from comm_bank?")) return;
    try {
      await api.delete(`/commission/data/${sid}?uid=${uid}&user_name=${userName}`);
      setMsg({ type: "success", text: "Record deleted." });
      runExceptions();
    } catch {
      setMsg({ type: "error", text: "Delete failed." });
    }
  }
  const getBadgeStyle = (row: ExceptionRow) => {
    if (row.exception_type === "rate_anomaly" && row.anomaly_level === "red") {
      return { label: "Rate Anomaly", tier: "danger" as const };
    }
    if (
      row.exception_type === "rate_anomaly" &&
      row.anomaly_level === "yellow"
    ) {
      return { label: "Rate Anomaly", tier: "amber" as const };
    }
    return (
      EXCEPTION_LABELS[row.exception_type] || EXCEPTION_LABELS.missing_data
    );
  };

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold mb-1" style={{ color: "var(--accent-light)" }}>
        Commission Exceptions
      </h2>
      <p className="text-sm mb-5" style={{ color: "var(--ct-text-secondary)" }}>
        Automated audit checks — review and resolve exceptions before finalizing
        commission.
      </p>

      <div className="rounded-[var(--r-md)] border p-4 mb-5 flex items-end gap-4" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--ct-text-muted)" }}>
            Select Month
          </label>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="rounded-[var(--r-sm)] border px-3 py-1.5 text-sm min-w-[180px] focus:outline-none focus:border-[var(--accent-light)]"
            style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
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
          className="px-5 py-1.5 rounded-[var(--r-sm)] text-sm font-medium transition-colors"
          style={loading || !selectedMonth
            ? { background: "var(--ct-text-muted)", color: "#ffffff", cursor: "not-allowed" }
            : { background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
        >
          {loading ? "Running..." : "Run Exceptions"}
        </button>
      </div>

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

      {data && (
        <div className="mb-5">
          <div className="flex flex-wrap gap-2 mb-3">
            <button
              onClick={() => setActiveFilter("all")}
              className="px-3 py-1 rounded-full text-xs font-medium border transition-colors"
              style={activeFilter === "all"
                ? { background: "var(--accent-light)", color: "var(--accent-light-on-solid)", borderColor: "var(--accent-light)" }
                : { background: "var(--ct-surface)", color: "var(--ct-text-secondary)", borderColor: "var(--ct-border-default)" }}
            >
              All ({data.total})
            </button>
            {Object.entries(data.summary).map(([type, count]) => {
              if (count === 0) return null;
              const meta =
                EXCEPTION_LABELS[type] || EXCEPTION_LABELS.missing_data;
              const tierStyle = TIER_STYLE[meta.tier];
              return (
                <button
                  key={type}
                  onClick={() => setActiveFilter(type)}
                  className="px-3 py-1 rounded-full text-xs font-medium border transition-colors"
                  style={activeFilter === type
                    ? { background: tierStyle.background, color: tierStyle.color, borderColor: tierStyle.color }
                    : { background: "var(--ct-surface)", color: "var(--ct-text-secondary)", borderColor: "var(--ct-border-default)" }}
                >
                  {meta.label} ({count})
                </button>
              );
            })}
          </div>
        </div>
      )}

      {data && (
        <div className="rounded-[var(--r-md)] border overflow-auto" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
          {filteredRows.length === 0 ? (
            <div className="p-8 text-center text-sm font-medium" style={{ color: "var(--success-light)" }}>
              ✓ No exceptions found for this check.
            </div>
          ) : (
            <table className="w-full text-xs min-w-[1100px]">
              <thead>
                <tr className="border-b" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}>
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
                      className="px-3 py-2 text-left font-medium"
                      style={{ color: "var(--ct-text-muted)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, i) => {
                  const meta = getBadgeStyle(row);
                  const tierStyle = TIER_STYLE[meta.tier];
                  const isEditing = editingSid === row.sid;
                  return (
                    <tr
                      key={`${row.sid}-${i}`}
                      className="border-b hover:bg-[var(--ct-surface-hover)]"
                      style={{ borderColor: "var(--ct-border-subtle)" }}
                    >
                      <td className="px-3 py-1.5" style={{ color: "var(--ct-text-muted)" }}>{i + 1}</td>
                      <td className="px-3 py-1.5">
                        <span
                          className="px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ background: tierStyle.background, color: tierStyle.color }}
                        >
                          {meta.label}
                          {row.variance_pct && ` (${row.variance_pct}%)`}
                          {row.missing_fields &&
                            ` — ${row.missing_fields.join(", ")}`}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 font-medium" style={{ color: "var(--ct-text-primary)" }}>{row.vendor}</td>
                      <td className="px-3 py-1.5 font-mono" style={{ color: "var(--ct-text-secondary)" }}>
                        {row.premise_id}
                      </td>
                      <td className="px-3 py-1.5 max-w-[140px] truncate" style={{ color: "var(--ct-text-secondary)" }}>
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
                            className="rounded-[var(--r-sm)] border px-1 py-0.5 w-12 text-xs focus:outline-none focus:border-[var(--accent-light)]"
                            style={{ borderColor: "var(--accent-light)" }}
                          />
                        ) : (
                          <span
                            className="px-1.5 py-0.5 rounded-[var(--r-sm)] text-xs font-medium"
                            style={row.cust_status === "A"
                              ? { background: "var(--success-light-tint)", color: "var(--success-light)" }
                              : { background: "var(--danger-light-tint)", color: "var(--danger-light)" }}
                          >
                            {row.cust_status}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5" style={{ color: "var(--ct-text-secondary)" }}>{row.service_start_date}</td>
                      <td className="px-3 py-1.5" style={{ color: "var(--ct-text-secondary)" }}>{row.service_end_date}</td>
                      <td className="px-3 py-1.5" style={{ color: "var(--ct-text-secondary)" }}>
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
                            className="rounded-[var(--r-sm)] border px-1 py-0.5 w-16 text-xs focus:outline-none focus:border-[var(--accent-light)]"
                            style={{ borderColor: "var(--accent-light)" }}
                          />
                        ) : (
                          row.commission_rate
                        )}
                      </td>
                      <td className="px-3 py-1.5" style={{ color: "var(--ct-text-secondary)" }}>
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
                            className="rounded-[var(--r-sm)] border px-1 py-0.5 w-20 text-xs focus:outline-none focus:border-[var(--accent-light)]"
                            style={{ borderColor: "var(--accent-light)" }}
                          />
                        ) : (
                          <span
                            style={parseFloat(String(row.commission_amount)) < 0
                              ? { color: "var(--danger-light)", fontWeight: 500 }
                              : undefined}
                          >
                            {parseFloat(
                              String(row.commission_amount || 0),
                            ).toFixed(4)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5" style={{ color: "var(--ct-text-secondary)" }}>{row.kwh_usage}</td>
                      <td className="px-3 py-1.5" style={{ color: "var(--ct-text-secondary)" }}>{row.month}</td>
                      <td className="px-3 py-1.5">
                        {isEditing ? (
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleEdit(row.sid)}
                              className="px-2 py-0.5 rounded-[var(--r-sm)] text-xs transition-colors"
                              style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingSid(null)}
                              className="px-2 py-0.5 rounded-[var(--r-sm)] text-xs transition-colors"
                              style={{ background: "var(--ct-text-muted)", color: "#ffffff" }}
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
                              className="px-2 py-0.5 rounded-[var(--r-sm)] text-xs transition-colors"
                              style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(row.sid)}
                              className="px-2 py-0.5 rounded-[var(--r-sm)] text-xs transition-colors"
                              style={{ background: "var(--danger-light)", color: "var(--danger-light-on-solid)" }}
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
        <div className="rounded-[var(--r-md)] border p-10 text-center text-sm" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)", color: "var(--ct-text-muted)" }}>
          {/* 2. Fixed unescaped entities error */}
          Select a month and click &quot;Run Exceptions&quot; to start the
          audit.
        </div>
      )}
    </div>
  );
}
