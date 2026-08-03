import { useEffect, useState } from "react";
import EnrollmentLayout from "../../../components/EnrollmentLayout";
import api from "../../../utils/api";

const fmtDate = (ts: number) =>
  ts ? new Date(ts * 1000).toLocaleDateString("en-US") : "";
const dispRate = (r: string) =>
  r ? (parseFloat(r) / 100).toFixed(4) : "";

export default function CheckedEnrollments() {
  const [rows, setRows]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/enrollment/reports/checked")
      .then((r) => setRows(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <EnrollmentLayout title="Enrollment – Check List">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold" style={{ color: "var(--ct-text-primary)" }}>Check List (Approved)</h2>
        <span className="text-xs" style={{ color: "var(--ct-text-muted)" }}>{rows.length} records</span>
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: "var(--ct-text-muted)" }}>Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--r-md)] border" style={{ borderColor: "var(--ct-border-default)" }}>
          <table className="w-full text-xs">
            <thead className="border-b" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}>
              <tr>
                {["#","ESID","Company","Broker","Rate","Term","Zone","Start","End","Meter","Status","Added"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap" style={{ color: "var(--ct-text-muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y" style={{ background: "var(--ct-surface)" }}>
              {rows.length === 0 ? (
                <tr><td colSpan={12} className="px-3 py-6 text-center" style={{ color: "var(--ct-text-muted)" }}>No checked enrollments</td></tr>
              ) : rows.map((r, i) => (
                <tr key={r.esid} className="hover:bg-[var(--ct-surface-hover)]">
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-muted)" }}>{i + 1}</td>
                  <td className="px-3 py-2 font-mono whitespace-nowrap" style={{ color: "var(--ct-text-primary)" }}>{r.esid}</td>
                  <td className="px-3 py-2 max-w-[150px] truncate" style={{ color: "var(--ct-text-secondary)" }}>{r.company_name}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.broker_code}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{dispRate(r.contract_rate)}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.contract_term}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.zone}</td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--ct-text-secondary)" }}>{r.contract_start_date}</td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--ct-text-secondary)" }}>{r.contract_end_date}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.meter_fees}</td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--ct-text-secondary)" }}>{r.enrollment_status}</td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--ct-text-muted)" }}>{fmtDate(r.date_added)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </EnrollmentLayout>
  );
}
