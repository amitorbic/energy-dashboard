import { useEffect, useState } from "react";
import EnrollmentLayout from "../../components/EnrollmentLayout";
import api from "../../utils/api";

const fmtTs = (ts: string) =>
  ts ? new Date(parseInt(ts) * 1000).toLocaleString("en-US") : "";

export default function EnrollmentUserLog() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/enrollment/user-log")
      .then((r) => setRows(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <EnrollmentLayout title="Enrollment – User Log">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-800">User Log</h2>
        <span className="text-xs text-gray-400">{rows.length} entries</span>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["#","Date","User","ESID","ESIDs","Comments"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {rows.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">No log entries</td></tr>
              ) : rows.map((r, i) => (
                <tr key={r.sid} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmtTs(r.date_modified)}</td>
                  <td className="px-3 py-2 text-gray-700 font-medium">{r.user}</td>
                  <td className="px-3 py-2 font-mono text-gray-600">{r.esid}</td>
                  <td className="px-3 py-2 text-gray-600 text-center">{r.num_esid}</td>
                  <td className="px-3 py-2 text-gray-600"
                    dangerouslySetInnerHTML={{ __html: (r.comments || "").replace(/<br\s*\/?>/gi, " ") }}
                  />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </EnrollmentLayout>
  );
}
