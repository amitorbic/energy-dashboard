import React, { useState, useEffect, useCallback } from "react";
import api from "../../utils/api";

interface UserLogEntry {
  sid: number;
  user_name: string;
  broker_name?: string;
  action: string;
  date: string; // Timestamp from backend
}

export default function UserLog() {
  const [logs, setLogs] = useState<UserLogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  // 2. Wrap loadLogs in useCallback
  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/commission/logs/user');
      setLogs(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to fetch logs:", err);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // 3. Helper to format dates safely
  function formatDate(ts: string) {
    const num = parseInt(ts);
    if (isNaN(num)) return ts;
    // Assuming Unix timestamp (seconds) - multiply by 1000 for JS
    return new Date(num * 1000).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  return (
    <div className="p-6">
      <header className="mb-6">
        <h2 className="text-xl font-bold uppercase tracking-tight" style={{ color: "var(--accent-light)" }}>
          Audit Trail
        </h2>
        <p className="text-sm mt-1" style={{ color: "var(--ct-text-secondary)" }}>
          Full history of actions performed in the commission module: uploads,
          edits, deletes, and calculations.
        </p>
      </header>

      <div className="rounded-[var(--r-lg)] border shadow-sm overflow-hidden" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
        {loading ? (
          <div className="p-12 text-center text-sm animate-pulse" style={{ color: "var(--ct-text-muted)" }}>
            Fetching logs from database...
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-sm" style={{ color: "var(--ct-text-muted)" }}>
            No log entries found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}>
                <tr>
                  {[
                    "#",
                    "User",
                    "Broker Context",
                    "Action Performed",
                    "Date/Time",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest"
                      style={{ color: "var(--ct-text-muted)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: "var(--ct-border-subtle)" }}>
                {logs.map((log, i) => (
                  <tr
                    key={log.sid}
                    className="transition-colors hover:bg-[var(--accent-light-tint)]"
                  >
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--ct-text-muted)" }}>
                      {i + 1}
                    </td>
                    <td className="px-4 py-3 font-bold" style={{ color: "var(--ct-text-primary)" }}>
                      {log.user_name}
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--ct-text-secondary)" }}>
                      {log.broker_name || (
                        <span style={{ color: "var(--ct-text-muted)" }}>—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium max-w-[400px]" style={{ color: "var(--ct-text-secondary)" }}>
                      {log.action}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums" style={{ color: "var(--ct-text-muted)" }}>
                      {formatDate(log.date)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
