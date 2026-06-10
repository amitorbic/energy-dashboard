import { useEffect, useState } from "react";
import EnrollmentLayout from "../../../components/EnrollmentLayout";
import api from "../../../utils/api";

const dispRate = (r: string) =>
  r ? (parseFloat(r) / 100).toFixed(4) : "";

function rowBg(r: any): string {
  if (r.clean_record_flag === 1) return "bg-green-50";
  if (r.billed_flag === 1)       return "bg-orange-50";
  if (r.flag_remarks === 1)      return "bg-red-50";
  return "";
}

function taxBadge(taxError: number) {
  if (taxError === 0) return null;
  if (taxError === 2) return <span className="text-orange-500 font-medium text-xs">Cert?</span>;
  return <span className="text-red-500 font-medium text-xs">Error</span>;
}

export default function TemplateComparison() {
  const [rows, setRows]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/enrollment/reports/template-comparison")
      .then((r) => setRows(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const approve = async (esid: string) => {
    if (!confirm("Approve this enrollment against template?")) return;
    await api.patch(`/enrollment/${esid}/approve`, { sid: null, type: "template" });
    api.get("/enrollment/reports/template-comparison")
      .then((r) => setRows(r.data))
      .catch(console.error);
  };

  return (
    <EnrollmentLayout title="Enrollment – Template Comparison">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-800">Template Comparison</h2>
        <div className="flex gap-3 text-xs">
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-200 rounded-sm inline-block" /> Clean</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-orange-200 rounded-sm inline-block" /> Billed</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-200 rounded-sm inline-block" /> Remark</span>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["#","ESID","Broker","Enrl Rate","Comm","Term","Start","Tmpl Name","Tmpl Rate","Tmpl Comm","Meter","Tax Exempt","Tax","Remarks","Approve"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 ? (
                <tr><td colSpan={15} className="px-3 py-6 text-center text-gray-400">No records</td></tr>
              ) : rows.map((r, i) => (
                <tr key={`${r.esid}-${i}`} className={`hover:bg-opacity-80 ${rowBg(r)}`}>
                  <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                  <td className="px-3 py-2 font-mono text-gray-800 whitespace-nowrap">{r.esid}</td>
                  <td className="px-3 py-2 text-gray-600">{r.broker_code}</td>
                  <td className="px-3 py-2 text-gray-600">{dispRate(r.contract_rate)}</td>
                  <td className="px-3 py-2 text-gray-600">{r.enrol_comm}</td>
                  <td className="px-3 py-2 text-gray-600">{r.contract_term}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.contract_start_date}</td>
                  <td className="px-3 py-2 text-gray-700">{r.customer_name}</td>
                  <td className="px-3 py-2 text-gray-600">{r.contract_rate_template}</td>
                  <td className="px-3 py-2 text-gray-600">{r.template_comm}</td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-xs ${r.meter_fee_check === 1 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                      {r.meter_fee_check === 1 ? "✓" : "✗"} {r.meter_fees}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{r.tax_exempt}</td>
                  <td className="px-3 py-2">{taxBadge(r.tax_error)}</td>
                  <td className="px-3 py-2 text-red-600 font-medium">{r.remarks}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => approve(r.esid)}
                      className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200">
                      Approve
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
