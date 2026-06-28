import { useEffect, useState } from "react";
import EnrollmentLayout from "../../../components/EnrollmentLayout";
import api from "../../../utils/api";

const fmtTs = (ts: string) =>
  ts ? new Date(parseInt(ts) * 1000).toLocaleDateString("en-US") : "";

export default function PendingConfirmations() {
  const [rows, setRows]       = useState<any[]>([]);
  const [search, setSearch]   = useState("");
  const [loading, setLoading] = useState(true);

  const load = (q?: string) => {
    setLoading(true);
    const qs = q ? `?search=${encodeURIComponent(q)}` : "";
    api.get(`/enrollment/reports/pending-confirmations${qs}`)
      .then((r) => setRows(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const dismiss = async (sid: number) => {
    if (!confirm("Dismiss this confirmation?")) return;
    await api.patch(`/enrollment/confirmation/${sid}/dismiss`);
    load(search || undefined);
  };

  return (
    <EnrollmentLayout title="Enrollment – Pending Confirmations">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="text-base font-semibold text-gray-800">Pending Confirmations</h2>
        <div className="flex gap-2">
          <input
            className="border border-gray-300 rounded px-3 py-1.5 text-xs w-48 focus:outline-none focus:ring-1 focus:ring-blue-400"
            placeholder="Search customer name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load(search || undefined)}
          />
          <button onClick={() => load(search || undefined)}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">
            Search
          </button>
          <button onClick={() => { setSearch(""); load(); }}
            className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded hover:bg-gray-200">
            Reset
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["#","Date","Customer","Broker","Rate","Comm","Term","Meter","Tax Exempt","Start Date","ESIIDs","Profiles","Dismiss"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {rows.length === 0 ? (
                <tr><td colSpan={13} className="px-3 py-6 text-center text-gray-400">No pending confirmations</td></tr>
              ) : rows.map((r, i) => (
                <tr key={r.sid} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtTs(r.date_modified)}</td>
                  <td className="px-3 py-2 text-gray-700">{r.customer_name}</td>
                  <td className="px-3 py-2 text-gray-600">{r.broker_name}</td>
                  <td className="px-3 py-2 text-gray-600">{r.contract_rate}</td>
                  <td className="px-3 py-2 text-gray-600">{r.commission}</td>
                  <td className="px-3 py-2 text-gray-600">{r.term}</td>
                  <td className="px-3 py-2 text-gray-600">{r.meter_fees}</td>
                  <td className="px-3 py-2 text-gray-600">{r.tax_exempt}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.start_date}</td>
                  <td className="px-3 py-2 text-gray-600 text-center">{r.esid_count}</td>
                  <td className="px-3 py-2 text-gray-500 max-w-[120px] truncate">
                    {(r.profiles || []).join(", ")}
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => dismiss(r.sid)}
                      className="px-2 py-1 bg-red-100 text-red-600 rounded text-xs hover:bg-red-200">
                      Dismiss
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </EnrollmentLayout>
  );
}
