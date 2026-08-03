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
        <h2 className="text-base font-semibold" style={{ color: "var(--ct-text-primary)" }}>User Log</h2>
        <span className="text-xs" style={{ color: "var(--ct-text-muted)" }}>{rows.length} entries</span>
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: "var(--ct-text-muted)" }}>Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--r-md)] border" style={{ borderColor: "var(--ct-border-default)" }}>
          <table className="w-full text-xs">
            <thead className="border-b" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}>
              <tr>
                {["#","Date","User","ESID","ESIDs","Comments"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap" style={{ color: "var(--ct-text-muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y" style={{ background: "var(--ct-surface)" }}>
              {rows.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center" style={{ color: "var(--ct-text-muted)" }}>No log entries</td></tr>
              ) : rows.map((r, i) => (
                <tr key={r.sid} className="hover:bg-[var(--ct-surface-hover)]">
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-muted)" }}>{i + 1}</td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--ct-text-secondary)" }}>{fmtTs(r.date_modified)}</td>
                  <td className="px-3 py-2 font-medium" style={{ color: "var(--ct-text-primary)" }}>{r.user}</td>
                  <td className="px-3 py-2 font-mono" style={{ color: "var(--ct-text-secondary)" }}>{r.esid}</td>
                  <td className="px-3 py-2 text-center" style={{ color: "var(--ct-text-secondary)" }}>{r.num_esid}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}
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
