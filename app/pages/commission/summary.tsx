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
      <h2 className="text-lg font-semibold text-orange-600 mb-4">
        Review Summary
      </h2>

      <div className="bg-white border border-gray-200 rounded p-4 mb-4 flex gap-4 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Vendor</label>
          <select
            value={selectedVendor}
            onChange={(e) => handleVendorChange(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm min-w-[200px]"
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
            className="text-sm text-blue-600 hover:underline"
          >
            {showingHistory ? "Show last 12 months" : "+ Show full history"}
          </button>
        )}
      </div>

      {msg && (
        <div
          className={`mb-4 px-4 py-2 rounded text-sm ${msg.type === "success" ? "bg-green-50 border border-green-200 text-green-800" : "bg-red-50 border border-red-200 text-red-800"}`}
        >
          {msg.text}
        </div>
      )}

      {hasErrors && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-800 text-sm font-medium">
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
              color: "text-blue-700",
            },
            {
              label: showingHistory
                ? "Total Payments (all time)"
                : "Total Payments (12 months)",
              value: Math.abs(totalPayment),
              color: "text-green-700",
            },
            {
              label: "Current Balance",
              value: latestBalance,
              color: latestBalance < 0 ? "text-red-600" : "text-gray-800",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-white border border-gray-200 rounded p-4"
            >
              <p className="text-xs text-gray-500">{stat.label}</p>
              <p className={`text-xl font-semibold mt-1 ${stat.color}`}>
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

      <div className="bg-white border border-gray-200 rounded overflow-auto">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            Loading...
          </div>
        ) : !selectedVendor ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            Select a vendor to view history.
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            No data found.
          </div>
        ) : (
          <table className="w-full text-sm text-black">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-200">
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 w-8">
                  ✓
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">
                  S.No
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">
                  Month
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">
                  Payment
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">
                  Owed
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">
                  Balance
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">
                  Comments
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={row.sid}
                  className={`border-b border-gray-100 hover:bg-gray-50 ${row.audit_status === "error" ? "bg-red-50" : ""}`}
                >
                  <td className="px-3 py-2">
                    {row.audit_status === "ok" ? (
                      <span className="text-green-500 font-bold">✓</span>
                    ) : (
                      <span className="text-red-500 font-bold">✗</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-400 text-xs">{i + 1}</td>
                  <td className="px-3 py-2 font-medium">{row.month}</td>
                  <td
                    className={`px-3 py-2 font-medium ${parseFloat(String(row.payment || 0)) < 0 ? "text-red-600" : "text-gray-500"}`}
                  >
                    {row.payment
                      ? `$${parseFloat(String(row.payment)).toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-green-700 font-medium">
                    {row.owed
                      ? `$${parseFloat(String(row.owed)).toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                      : "—"}
                  </td>
                  <td
                    className={`px-3 py-2 font-medium ${parseFloat(String(row.balance || 0)) < 0 ? "text-red-600" : "text-gray-800"}`}
                  >
                    $
                    {Math.abs(
                      parseFloat(String(row.balance || 0)),
                    ).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    {parseFloat(String(row.balance || 0)) < 0 && (
                      <span className="text-xs font-normal"> CR</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-500 text-xs max-w-[200px] truncate">
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
            className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700"
          >
            Add Payment
          </button>
          <button
            onClick={() => {
              setModalType("adjustment");
              setShowModal(true);
            }}
            className="bg-amber-500 text-white px-4 py-1.5 rounded text-sm hover:bg-amber-600"
          >
            Add Adjustment
          </button>
          <button
            onClick={downloadCSV}
            className="bg-green-600 text-white px-4 py-1.5 rounded text-sm hover:bg-green-700"
          >
            Download CSV
          </button>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 shadow-xl">
            <h3 className="text-base font-semibold text-gray-800 mb-4 capitalize">
              Add {modalType} — {selectedVendor}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Amount (negative for payment received)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={modalAmount}
                  onChange={(e) => setModalAmount(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-1.5 text-sm w-full text-black"
                  placeholder="-300.62"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Comments
                </label>
                <input
                  type="text"
                  value={modalComments}
                  onChange={(e) => setModalComments(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-1.5 text-sm w-full text-black"
                  placeholder="Reason..."
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={handleManualEntry}
                disabled={modalLoading || !modalAmount}
                className={`px-5 py-1.5 rounded text-white text-sm font-medium ${modalLoading || !modalAmount ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"}`}
              >
                {modalLoading ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="px-5 py-1.5 rounded text-sm bg-gray-200 text-gray-700 hover:bg-gray-300"
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
