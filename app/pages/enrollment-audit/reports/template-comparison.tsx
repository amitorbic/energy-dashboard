import { useEffect, useState } from "react";
import EnrollmentLayout from "../../../components/EnrollmentLayout";
import api from "../../../utils/api";

const dispRate = (r: string) =>
  r ? (parseFloat(r) / 100).toFixed(4) : "";

// Row highlight reflects genuine reconciliation status, not decoration.
function rowBg(r: any): string | undefined {
  if (r.clean_record_flag === 1) return "var(--success-light-tint)";
  if (r.billed_flag === 1)       return "var(--amber-light-tint)";
  if (r.flag_remarks === 1)      return "var(--danger-light-tint)";
  return undefined;
}

function taxBadge(taxError: number) {
  if (taxError === 0) return null;
  if (taxError === 2) return <span className="font-medium text-xs" style={{ color: "var(--amber-light)" }}>Cert?</span>;
  return <span className="font-medium text-xs" style={{ color: "var(--danger-light)" }}>Error</span>;
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
        <h2 className="text-base font-semibold" style={{ color: "var(--ct-text-primary)" }}>Template Comparison</h2>
        <div className="flex gap-3 text-xs">
          <span className="flex items-center gap-1" style={{ color: "var(--ct-text-secondary)" }}><span className="w-3 h-3 rounded-[var(--r-sm)] inline-block" style={{ background: "var(--success-light)" }} /> Clean</span>
          <span className="flex items-center gap-1" style={{ color: "var(--ct-text-secondary)" }}><span className="w-3 h-3 rounded-[var(--r-sm)] inline-block" style={{ background: "var(--amber-light)" }} /> Billed</span>
          <span className="flex items-center gap-1" style={{ color: "var(--ct-text-secondary)" }}><span className="w-3 h-3 rounded-[var(--r-sm)] inline-block" style={{ background: "var(--danger-light)" }} /> Remark</span>
        </div>
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: "var(--ct-text-muted)" }}>Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--r-md)] border" style={{ borderColor: "var(--ct-border-default)" }}>
          <table className="w-full text-xs">
            <thead className="border-b" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}>
              <tr>
                {["#","ESID","Broker","Enrl Rate","Comm","Term","Start","Tmpl Name","Tmpl Rate","Tmpl Comm","Meter","Tax Exempt","Tax","Remarks","Approve"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap" style={{ color: "var(--ct-text-muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.length === 0 ? (
                <tr><td colSpan={15} className="px-3 py-6 text-center" style={{ color: "var(--ct-text-muted)" }}>No records</td></tr>
              ) : rows.map((r, i) => (
                <tr key={`${r.esid}-${i}`} className="hover:opacity-90" style={{ background: rowBg(r) }}>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-muted)" }}>{i + 1}</td>
                  <td className="px-3 py-2 font-mono whitespace-nowrap" style={{ color: "var(--ct-text-primary)" }}>{r.esid}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.broker_code}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{dispRate(r.contract_rate)}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.enrol_comm}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.contract_term}</td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--ct-text-secondary)" }}>{r.contract_start_date}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.customer_name}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.contract_rate_template}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.template_comm}</td>
                  <td className="px-3 py-2">
                    <span className="px-1.5 py-0.5 rounded-[var(--r-sm)] text-xs"
                      style={r.meter_fee_check === 1
                        ? { background: "var(--success-light-tint)", color: "var(--success-light)" }
                        : { background: "var(--danger-light-tint)", color: "var(--danger-light)" }}>
                      {r.meter_fee_check === 1 ? "✓" : "✗"} {r.meter_fees}
                    </span>
                  </td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.tax_exempt}</td>
                  <td className="px-3 py-2">{taxBadge(r.tax_error)}</td>
                  <td className="px-3 py-2 font-medium" style={{ color: "var(--danger-light)" }}>{r.remarks}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => approve(r.esid)}
                      className="px-2 py-1 rounded-[var(--r-sm)] text-xs hover:opacity-80" style={{ background: "var(--accent-light-tint)", color: "var(--accent-light)" }}>
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
