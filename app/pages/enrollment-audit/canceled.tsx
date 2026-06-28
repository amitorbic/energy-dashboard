import { useEffect, useState } from "react";
import EnrollmentLayout from "../../components/EnrollmentLayout";
import api from "../../utils/api";

const fmtDate = (ts: number) =>
  ts ? new Date(ts * 1000).toLocaleDateString("en-US") : "";

export default function CanceledEnrollments() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/enrollment/canceled")
      .then((r) => setRows(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <EnrollmentLayout title="Enrollment – Canceled">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-800">Canceled Enrollments</h2>
        <span className="text-xs text-gray-400">{rows.length} records</span>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["#","ESID","Company","Broker","Rate","Term","Comm","Start","End","Status","Added"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {rows.length === 0 ? (
                <tr><td colSpan={11} className="px-3 py-6 text-center text-gray-400">No canceled enrollments</td></tr>
              ) : rows.map((r, i) => (
                <tr key={r.esid} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                  <td className="px-3 py-2 font-mono text-gray-800">{r.esid}</td>
                  <td className="px-3 py-2 text-gray-700">{r.company_name}</td>
                  <td className="px-3 py-2 text-gray-600">{r.broker_code}</td>
                  <td className="px-3 py-2 text-gray-600">{r.contract_rate ? (parseFloat(r.contract_rate) / 100).toFixed(4) : ""}</td>
                  <td className="px-3 py-2 text-gray-600">{r.contract_term}</td>
                  <td className="px-3 py-2 text-gray-600">{r.commission}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.contract_start_date}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.contract_end_date}</td>
                  <td className="px-3 py-2 text-gray-600">{r.enrollment_status}</td>
                  <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{fmtDate(r.date_added)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </EnrollmentLayout>
  );
}
