import { useEffect, useState } from "react";
import EnrollmentLayout from "../../../components/EnrollmentLayout";
import api from "../../../utils/api";

const fmtDate = (ts: number) =>
  ts ? new Date(ts * 1000).toLocaleDateString("en-US") : "";
const dispRate = (r: string) =>
  r ? (parseFloat(r) / 100).toFixed(4) : "";

export default function NonBilled() {
  const [rows, setRows]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/enrollment/reports/non-billed")
      .then((r) => setRows(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <EnrollmentLayout title="Enrollment – Non Billed">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-800">Non-Billed Accounts (&gt;35 Days)</h2>
        <span className="text-xs text-gray-400">{rows.length} records</span>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["#","Days","ESID","Company","Broker","Rate","Term","Zone","Start","End","Meter","Status","Added"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {rows.length === 0 ? (
                <tr><td colSpan={13} className="px-3 py-6 text-center text-gray-400">No non-billed accounts</td></tr>
              ) : rows.map((r, i) => (
                <tr key={r.esid} className={`hover:bg-gray-50 ${r.days_diff > 60 ? "bg-red-50" : ""}`}>
                  <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                  <td className="px-3 py-2 font-bold text-red-600 text-center">{r.days_diff}</td>
                  <td className="px-3 py-2 font-mono text-gray-800 whitespace-nowrap">{r.esid}</td>
                  <td className="px-3 py-2 text-gray-700 max-w-[140px] truncate">{r.company_name}</td>
                  <td className="px-3 py-2 text-gray-600">{r.broker_code}</td>
                  <td className="px-3 py-2 text-gray-600">{dispRate(r.contract_rate)}</td>
                  <td className="px-3 py-2 text-gray-600">{r.contract_term}</td>
                  <td className="px-3 py-2 text-gray-600">{r.zone}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.contract_start_date}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.contract_end_date}</td>
                  <td className="px-3 py-2 text-gray-600">{r.meter_fees}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.enrollment_status}</td>
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
