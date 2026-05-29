"use client";
import { useEffect, useState } from "react";
import ContractLayout from "../../components/ContractLayout";
import api from "../../utils/api";

interface LogEntry {
  log_id: number;
  sid: number;
  contract_no: string;
  action: string;
  action_by: string;
  action_at: string;
  user_name: string;
  notes: string;
}

const ACTION_COLORS: Record<string, string> = {
  created: "bg-green-50 text-green-700",
  sent: "bg-sky-50 text-sky-700",
  edited: "bg-amber-50 text-amber-700",
  revised: "bg-purple-50 text-purple-700",
  deleted: "bg-red-50 text-red-700",
};

export default function ConfirmationLog() {
  const [rows, setRows] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const limit = 50;

  const load = async (p = 1) => {
    setLoading(true);
    try {
      const r = await api.get(
        `/contracts/user-log/list?page=${p}&limit=${limit}`,
      );
      setRows(r.data.data);
      setTotal(r.data.total);
      setPage(p);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
  }, []);

  const totalPages = Math.ceil(total / limit);

  return (
    <ContractLayout title="User Log">
      <div className="max-w-5xl">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-500">
            Complete audit trail of all confirmation activity.
          </p>
          <span className="text-xs text-gray-400">{total} entries</span>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {[
                  "Date & Time",
                  "User",
                  "Action",
                  "Contract No",
                  "Record ID",
                  "Notes",
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="text-center py-8 text-sm text-gray-400"
                  >
                    Loading...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="text-center py-8 text-sm text-gray-400"
                  >
                    No log entries found
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr
                    key={r.log_id}
                    className={`border-b border-gray-100 ${i % 2 === 0 ? "" : "bg-gray-50/50"}`}
                  >
                    <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                      {r.action_at}
                    </td>
                    <td className="px-3 py-2 text-gray-700 font-medium">
                      {r.user_name || r.action_by}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded font-medium capitalize ${ACTION_COLORS[r.action] || "bg-gray-100 text-gray-600"}`}
                      >
                        {r.action}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-sky-700">
                      {r.contract_no}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-400">
                      #{r.sid}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {r.notes || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-2 mt-4 justify-end">
            <button
              disabled={page === 1}
              onClick={() => load(page - 1)}
              className="px-3 py-1 text-sm border rounded disabled:opacity-40 hover:bg-gray-50"
            >
              ← Prev
            </button>
            <span className="text-sm text-gray-500">
              Page {page} of {totalPages}
            </span>
            <button
              disabled={page === totalPages}
              onClick={() => load(page + 1)}
              className="px-3 py-1 text-sm border rounded disabled:opacity-40 hover:bg-gray-50"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </ContractLayout>
  );
}
