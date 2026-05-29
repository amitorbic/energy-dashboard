import React, { useState, useEffect, useCallback } from "react";

// 1. Defined the interface for User Logs
interface UserLogEntry {
  sid: number;
  user_name: string;
  broker_name?: string;
  action: string;
  date: string; // Timestamp from backend
}

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001/api";

export default function UserLog() {
  const [logs, setLogs] = useState<UserLogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  // 2. Wrap loadLogs in useCallback
  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/commission/logs/user`);
      const json = await res.json();
      setLogs(Array.isArray(json) ? json : []);
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
        <h2 className="text-xl font-bold text-orange-600 uppercase tracking-tight">
          Audit Trail
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Full history of actions performed in the commission module: uploads,
          edits, deletes, and calculations.
        </p>
      </header>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400 text-sm animate-pulse">
            Fetching logs from database...
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-sm">
            No log entries found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
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
                      className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log, i) => (
                  <tr
                    key={log.sid}
                    className="hover:bg-blue-50/30 transition-colors"
                  >
                    <td className="px-4 py-3 text-gray-300 font-mono text-xs">
                      {i + 1}
                    </td>
                    <td className="px-4 py-3 font-bold text-gray-800">
                      {log.user_name}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {log.broker_name || (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700 font-medium max-w-[400px]">
                      {log.action}
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap tabular-nums">
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
