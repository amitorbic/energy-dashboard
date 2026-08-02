import { useState, useEffect } from "react";
import api from "../../utils/api";

interface CommissionSummary {
  sid: number;
  vendor: string;
  vendor_id: string;
  month: string;
  payment: string | number;
  owed: string | number;
  balance: string | number;
  audit_status?: "ok" | "error";
  comments?: string;
}

const uid = 1;
const userName = "admin";

export default function ReviewSummary() {
  const [vendors, setVendors] = useState<
    { vendor: string; company_name: string }[]
  >([]);
  const [selectedVendor, setSelectedVendor] = useState("");
  const [rows, setRows] = useState<CommissionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [showingHistory, setShowingHistory] = useState(false);
  const hasErrors = rows.some((r) => r.audit_status === "error");

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<"payment" | "adjustment">(
    "payment",
  );
  const [modalAmount, setModalAmount] = useState("");
  const [modalComments, setModalComments] = useState("");
  const [modalLoading, setModalLoading] = useState(false);

  // Restored missing msg state
  const [msg, setMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    api.get('/commission/vendors').then(res => setVendors(res.data));
  }, []);

  async function loadSummary(vendor: string, history = false) {
    if (!vendor) return;
    setLoading(true);
    setShowingHistory(history);
    try {
      const url = history
        ? `/commission/summary/history/${vendor}`
        : `/commission/summary?vendor=${vendor}`;
      const res = await api.get(url);
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to load summary:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleManualEntry() {
    if (!modalAmount || !selectedVendor) return;
    setModalLoading(true);
    setMsg(null);
    try {
      await api.post('/commission/summary/payment', {
        vendor: selectedVendor,
        amount: parseFloat(modalAmount),
        comments: modalComments,
        entry_type: modalType,
        uid,
        user_name: userName,
      });
      setMsg({ type: "success", text: `${modalType} added successfully.` });
      setShowModal(false);
      setModalAmount("");
      setModalComments("");
      loadSummary(selectedVendor, showingHistory);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      setMsg({ type: "error", text: typeof detail === 'string' ? detail : "Failed to add entry." });
    } finally {
      setModalLoading(false);
    }
  }

  function handleVendorChange(v: string) {
    setSelectedVendor(v);
    setRows([]);
    setShowingHistory(false);
    setMsg(null);
    if (v) loadSummary(v);
  }

  const totalOwed = rows.reduce(
    (s, r) => s + parseFloat(String(r.owed || 0)),
    0,
  );
  const totalPayment = rows.reduce(
    (s, r) => s + parseFloat(String(r.payment || 0)),
    0,
  );
  const latestBalance =
    rows.length > 0
      ? parseFloat(String(rows[rows.length - 1].balance || "0"))
      : 0;

  const downloadCSV = () => {
    if (!rows.length) return;
    const headers = ["Month", "Payment", "Owed", "Balance", "Comments"];
    const csvRows = rows.map((r) =>
      [
        r.month,
        r.payment || 0,
        r.owed || 0,
        r.balance || 0,
        (r.comments || "").replace(/,/g, ""),
      ].join(","),
    );
    const blob = new Blob([[headers.join(","), ...csvRows].join("\n")], {
      type: "text/csv",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `summary_${selectedVendor}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--accent-light)" }}>
        Review Summary
      </h2>

      <div className="rounded-[var(--r-md)] border p-4 mb-4 flex gap-4 items-end" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--ct-text-muted)" }}>Vendor</label>
          <select
            value={selectedVendor}
            onChange={(e) => handleVendorChange(e.target.value)}
            className="rounded-[var(--r-sm)] border px-3 py-1.5 text-sm min-w-[200px] focus:outline-none focus:border-[var(--accent-light)]"
            style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
          >
            <option value="">Select vendor...</option>
            {vendors.map((v) => (
              <option key={v.vendor} value={v.vendor}>
                {v.company_name || v.vendor}
              </option>
            ))}
          </select>
        </div>
        {selectedVendor && (
          <button
            onClick={() => loadSummary(selectedVendor, !showingHistory)}
            className="text-sm hover:underline"
            style={{ color: "var(--accent-light)" }}
          >
            {showingHistory ? "Show last 12 months" : "+ Show full history"}
          </button>
        )}
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

      {hasErrors && (
        <div className="mb-4 p-3 rounded-[var(--r-md)] border text-sm font-medium" style={{ background: "var(--danger-light-tint)", borderColor: "var(--danger-light-tint)", color: "var(--danger-light)" }}>
          ⚠ Balance chain error detected — one or more rows have incorrect
          balances.
        </div>
      )}

      {rows.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {[
            {
              label: showingHistory
                ? "Total Owed (all time)"
                : "Total Owed (12 months)",
              value: totalOwed,
              color: "var(--ct-text-primary)",
            },
            {
              label: showingHistory
                ? "Total Payments (all time)"
                : "Total Payments (12 months)",
              value: Math.abs(totalPayment),
              color: "var(--success-light)",
            },
            {
              label: "Current Balance",
              value: latestBalance,
              color: latestBalance < 0 ? "var(--danger-light)" : "var(--ct-text-primary)",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-[var(--r-md)] border p-4"
              style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}
            >
              <p className="text-xs" style={{ color: "var(--ct-text-muted)" }}>{stat.label}</p>
              <p className="text-xl font-semibold mt-1" style={{ color: stat.color }}>
                $
                {Math.abs(stat.value).toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                })}
                {stat.value < 0 && (
                  <span className="text-sm font-normal"> CR</span>
                )}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-[var(--r-md)] border overflow-auto" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
        {loading ? (
          <div className="p-8 text-center text-sm" style={{ color: "var(--ct-text-muted)" }}>
            Loading...
          </div>
        ) : !selectedVendor ? (
          <div className="p-8 text-center text-sm" style={{ color: "var(--ct-text-muted)" }}>
            Select a vendor to view history.
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm" style={{ color: "var(--ct-text-muted)" }}>
            No data found.
          </div>
        ) : (
          <table className="w-full text-sm" style={{ color: "var(--ct-text-primary)" }}>
            <thead>
              <tr className="border-b" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}>
                <th className="px-3 py-2 text-left text-xs font-medium w-8" style={{ color: "var(--ct-text-muted)" }}>
                  ✓
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: "var(--ct-text-muted)" }}>
                  S.No
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: "var(--ct-text-muted)" }}>
                  Month
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: "var(--ct-text-muted)" }}>
                  Payment
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: "var(--ct-text-muted)" }}>
                  Owed
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: "var(--ct-text-muted)" }}>
                  Balance
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: "var(--ct-text-muted)" }}>
                  Comments
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={row.sid}
                  className="border-b hover:bg-[var(--ct-surface-hover)]"
                  style={{
                    borderColor: "var(--ct-border-subtle)",
                    background: row.audit_status === "error" ? "var(--danger-light-tint)" : undefined,
                  }}
                >
                  <td className="px-3 py-2">
                    {row.audit_status === "ok" ? (
                      <span className="font-bold" style={{ color: "var(--success-light)" }}>✓</span>
                    ) : (
                      <span className="font-bold" style={{ color: "var(--danger-light)" }}>✗</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs" style={{ color: "var(--ct-text-muted)" }}>{i + 1}</td>
                  <td className="px-3 py-2 font-medium">{row.month}</td>
                  <td
                    className="px-3 py-2 font-medium"
                    style={{ color: parseFloat(String(row.payment || 0)) < 0 ? "var(--danger-light)" : "var(--ct-text-secondary)" }}
                  >
                    {row.payment
                      ? `$${parseFloat(String(row.payment)).toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 font-medium" style={{ color: "var(--accent-light)" }}>
                    {row.owed
                      ? `$${parseFloat(String(row.owed)).toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                      : "—"}
                  </td>
                  <td
                    className="px-3 py-2 font-medium"
                    style={{ color: parseFloat(String(row.balance || 0)) < 0 ? "var(--danger-light)" : "var(--ct-text-primary)" }}
                  >
                    $
                    {Math.abs(
                      parseFloat(String(row.balance || 0)),
                    ).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    {parseFloat(String(row.balance || 0)) < 0 && (
                      <span className="text-xs font-normal"> CR</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs max-w-[200px] truncate" style={{ color: "var(--ct-text-secondary)" }}>
                    {row.comments || ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {rows.length > 0 && (
        <div className="mt-4 flex gap-3">
          <button
            onClick={() => {
              setModalType("payment");
              setShowModal(true);
            }}
            className="px-4 py-1.5 rounded-[var(--r-sm)] text-sm transition-colors"
            style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
          >
            Add Payment
          </button>
          <button
            onClick={() => {
              setModalType("adjustment");
              setShowModal(true);
            }}
            className="px-4 py-1.5 rounded-[var(--r-sm)] text-sm transition-colors"
            style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
          >
            Add Adjustment
          </button>
          <button
            onClick={downloadCSV}
            className="px-4 py-1.5 rounded-[var(--r-sm)] text-sm transition-colors"
            style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
          >
            Download CSV
          </button>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="rounded-[var(--r-lg)] p-6 w-96 shadow-xl" style={{ background: "var(--ct-surface)" }}>
            <h3 className="text-base font-semibold mb-4 capitalize" style={{ color: "var(--ct-text-primary)" }}>
              Add {modalType} — {selectedVendor}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--ct-text-muted)" }}>
                  Amount (negative for payment received)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={modalAmount}
                  onChange={(e) => setModalAmount(e.target.value)}
                  className="rounded-[var(--r-sm)] border px-3 py-1.5 text-sm w-full focus:outline-none focus:border-[var(--accent-light)]"
                  style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
                  placeholder="-300.62"
                />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--ct-text-muted)" }}>
                  Comments
                </label>
                <input
                  type="text"
                  value={modalComments}
                  onChange={(e) => setModalComments(e.target.value)}
                  className="rounded-[var(--r-sm)] border px-3 py-1.5 text-sm w-full focus:outline-none focus:border-[var(--accent-light)]"
                  style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
                  placeholder="Reason..."
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={handleManualEntry}
                disabled={modalLoading || !modalAmount}
                className="px-5 py-1.5 rounded-[var(--r-sm)] text-sm font-medium transition-colors"
                style={modalLoading || !modalAmount
                  ? { background: "var(--ct-text-muted)", color: "#ffffff" }
                  : { background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
              >
                {modalLoading ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="px-5 py-1.5 rounded-[var(--r-sm)] text-sm transition-colors hover:bg-[var(--ct-surface-hover)]"
                style={{ background: "var(--ct-surface-hover)", color: "var(--ct-text-secondary)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
