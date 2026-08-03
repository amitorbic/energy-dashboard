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
        <h2 className="text-base font-semibold" style={{ color: "var(--ct-text-primary)" }}>Pending Confirmations</h2>
        <div className="flex gap-2">
          <input
            className="border rounded-[var(--r-sm)] px-3 py-1.5 text-xs w-48 outline-none focus:border-[var(--accent-light)]"
            style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
            placeholder="Search customer name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load(search || undefined)}
          />
          <button onClick={() => load(search || undefined)}
            className="px-3 py-1.5 text-xs rounded-[var(--r-sm)]" style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}>
            Search
          </button>
          <button onClick={() => { setSearch(""); load(); }}
            className="px-3 py-1.5 text-xs rounded-[var(--r-sm)] hover:opacity-80" style={{ background: "var(--ct-surface-hover)", color: "var(--ct-text-secondary)" }}>
            Reset
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: "var(--ct-text-muted)" }}>Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--r-md)] border" style={{ borderColor: "var(--ct-border-default)" }}>
          <table className="w-full text-xs">
            <thead className="border-b" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}>
              <tr>
                {["#","Date","Customer","Broker","Rate","Comm","Term","Meter","Tax Exempt","Start Date","ESIIDs","Profiles","Dismiss"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap" style={{ color: "var(--ct-text-muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y" style={{ background: "var(--ct-surface)" }}>
              {rows.length === 0 ? (
                <tr><td colSpan={13} className="px-3 py-6 text-center" style={{ color: "var(--ct-text-muted)" }}>No pending confirmations</td></tr>
              ) : rows.map((r, i) => (
                <tr key={r.sid} className="hover:bg-[var(--ct-surface-hover)]">
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-muted)" }}>{i + 1}</td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--ct-text-muted)" }}>{fmtTs(r.date_modified)}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.customer_name}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.broker_name}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.contract_rate}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.commission}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.term}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.meter_fees}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.tax_exempt}</td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--ct-text-secondary)" }}>{r.start_date}</td>
                  <td className="px-3 py-2 text-center" style={{ color: "var(--ct-text-secondary)" }}>{r.esid_count}</td>
                  <td className="px-3 py-2 max-w-[120px] truncate" style={{ color: "var(--ct-text-muted)" }}>
                    {(r.profiles || []).join(", ")}
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => dismiss(r.sid)}
                      className="px-2 py-1 rounded-[var(--r-sm)] text-xs hover:opacity-80" style={{ background: "var(--danger-light-tint)", color: "var(--danger-light)" }}>
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
