import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import api from "../../utils/api";
import { isLoggedIn, isAdmin } from "../../utils/auth";

interface LogEntry {
  customer_name: string;
  sr: number;
  esid: string;
  service_address: string;
  unit_number: string;
  city: string;
  zip: string;
  status: string;
  date_time: string;
}

export default function AdminLogsPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filtered, setFiltered] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"All" | "Add" | "Cancel">("All");

  useEffect(() => {
    if (!isLoggedIn() || !isAdmin()) { router.replace("/login"); return; }
    api.get("/admin/logs")
      .then((res) => {
        setLogs(res.data);
        setFiltered(res.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    let result = logs;
    if (filter !== "All") {
      result = result.filter((l) => l.status === filter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (l) =>
          l.customer_name?.toLowerCase().includes(q) ||
          l.esid?.toLowerCase().includes(q) ||
          l.service_address?.toLowerCase().includes(q) ||
          l.city?.toLowerCase().includes(q)
      );
    }
    setFiltered(result);
  }, [logs, search, filter]);

  function formatDate(dt: string) {
    if (!dt) return "—";
    return new Date(dt).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  return (
    <Layout title="Activity Logs">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Activity Logs</h2>
            <p className="text-gray-500 text-sm mt-1">
              All meter add and cancel requests
            </p>
          </div>
          <button
            onClick={() => router.push("/admin")}
            className="text-gray-500 hover:text-gray-700 text-sm"
          >
            ← Admin
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by customer, ESI ID, address..."
            className="flex-1 min-w-48 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            {(["All", "Add", "Cancel"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  filter === f
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
            Loading logs...
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
            No activity found.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
              Showing {filtered.length} of {logs.length} entries
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="p-4 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Customer</th>
                    <th className="p-4 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">ESI ID</th>
                    <th className="p-4 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Service Address</th>
                    <th className="p-4 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">City</th>
                    <th className="p-4 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">ZIP</th>
                    <th className="p-4 text-center text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Action</th>
                    <th className="p-4 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Date / Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((log, i) => (
                    <tr key={`${log.sr}-${i}`} className="hover:bg-gray-50">
                      <td className="p-4 font-medium text-gray-900 whitespace-nowrap">{log.customer_name}</td>
                      <td className="p-4 font-mono text-gray-700 whitespace-nowrap">{log.esid}</td>
                      <td className="p-4 text-gray-600">
                        {log.service_address}{log.unit_number ? `, ${log.unit_number}` : ""}
                      </td>
                      <td className="p-4 text-gray-600 whitespace-nowrap">{log.city}</td>
                      <td className="p-4 text-gray-500 whitespace-nowrap">{log.zip}</td>
                      <td className="p-4 text-center whitespace-nowrap">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          log.status === "Add"
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}>
                          {log.status}
                        </span>
                      </td>
                      <td className="p-4 text-gray-500 text-xs whitespace-nowrap">
                        {formatDate(log.date_time)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
