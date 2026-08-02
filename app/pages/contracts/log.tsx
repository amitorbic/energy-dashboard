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

const ACTION_STYLES: Record<string, { background: string; color: string }> = {
  created: { background: "var(--success-light-tint)", color: "var(--success-light)" },
  sent: { background: "var(--info-light-tint)", color: "var(--info-light)" },
  edited: { background: "var(--amber-light-tint)", color: "var(--amber-light)" },
  revised: { background: "var(--accent-light-tint)", color: "var(--accent-light)" },
  deleted: { background: "var(--danger-light-tint)", color: "var(--danger-light)" },
};
const DEFAULT_ACTION_STYLE = { background: "var(--ct-surface-hover)", color: "var(--ct-text-secondary)" };

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
          <p className="text-sm" style={{ color: "var(--ct-text-muted)" }}>
            Complete audit trail of all confirmation activity.
          </p>
          <span className="text-xs" style={{ color: "var(--ct-text-muted)" }}>{total} entries</span>
        </div>

        <div
          className="rounded-[var(--r-lg)] border overflow-hidden"
          style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}>
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
                    className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide"
                    style={{ color: "var(--ct-text-muted)" }}
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
                    className="text-center py-8 text-sm"
                    style={{ color: "var(--ct-text-muted)" }}
                  >
                    Loading...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="text-center py-8 text-sm"
                    style={{ color: "var(--ct-text-muted)" }}
                  >
                    No log entries found
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr
                    key={r.log_id}
                    className="border-b"
                    style={{ borderColor: "var(--ct-border-subtle)", background: i % 2 === 0 ? "transparent" : "var(--ct-canvas)" }}
                  >
                    <td className="px-3 py-2 text-xs whitespace-nowrap" style={{ color: "var(--ct-text-muted)" }}>
                      {r.action_at}
                    </td>
                    <td className="px-3 py-2 font-medium" style={{ color: "var(--ct-text-secondary)" }}>
                      {r.user_name || r.action_by}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="text-xs px-2 py-0.5 rounded-[var(--r-sm)] font-medium capitalize"
                        style={ACTION_STYLES[r.action] || DEFAULT_ACTION_STYLE}
                      >
                        {r.action}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs" style={{ color: "var(--accent-light)" }}>
                      {r.contract_no}
                    </td>
                    <td className="px-3 py-2 text-xs" style={{ color: "var(--ct-text-muted)" }}>
                      #{r.sid}
                    </td>
                    <td className="px-3 py-2 text-xs" style={{ color: "var(--ct-text-muted)" }}>
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
              className="px-3 py-1 text-sm rounded-[var(--r-md)] border disabled:opacity-40 transition-colors hover:bg-[var(--ct-surface-hover)]"
              style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
            >
              ← Prev
            </button>
            <span className="text-sm" style={{ color: "var(--ct-text-muted)" }}>
              Page {page} of {totalPages}
            </span>
            <button
              disabled={page === totalPages}
              onClick={() => load(page + 1)}
              className="px-3 py-1 text-sm rounded-[var(--r-md)] border disabled:opacity-40 transition-colors hover:bg-[var(--ct-surface-hover)]"
              style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </ContractLayout>
  );
}
