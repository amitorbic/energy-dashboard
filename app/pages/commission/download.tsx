import { useState, useEffect } from "react";
import api from "../../utils/api";

type BrokerOption = { vendor: string; company_name: string };
type MonthOption = { label: string; value: string };

export default function DownloadCommissionFiles() {
  const [brokers, setBrokers] = useState<BrokerOption[]>([]);
  const [months, setMonths] = useState<MonthOption[]>([]);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    api.get('/commission/vendors').then(res => setBrokers(res.data));
    api.get('/commission/months').then(res => {
      const m: MonthOption[] = res.data;
      setMonths(m);
      if (m.length > 0) setSelectedMonth(m[0].value);
    });
  }, []);

  async function handleDownload(vendor: string, companyName: string) {
    setDownloading(vendor);
    try {
      const res = await api.get(
        `/commission/download/${vendor}?month=${selectedMonth}`,
        { responseType: 'blob' },
      );
      const blob: Blob = res.data;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = (res.headers['content-disposition'] as string) || "";
      const match = cd.match(/filename=(.+)/);
      a.download = match ? match[1] : `${companyName}_commission.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--accent-light)" }}>
        Download Commission Files
      </h2>

      {/* Month selector */}
      <div className="rounded-[var(--r-md)] border p-4 mb-5 flex items-end gap-4" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
        <div>
          <label className="block text-xs mb-1" style={{ color: "var(--ct-text-muted)" }}>Month</label>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="rounded-[var(--r-sm)] border px-3 py-1.5 text-sm min-w-[180px] focus:outline-none focus:border-[var(--accent-light)]"
            style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
          >
            {months.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Broker list */}
      <div className="rounded-[var(--r-md)] border overflow-hidden" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}>
              <th className="px-4 py-2 text-left text-xs font-medium" style={{ color: "var(--ct-text-muted)" }}>
                #
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium" style={{ color: "var(--ct-text-muted)" }}>
                Vendor
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium" style={{ color: "var(--ct-text-muted)" }}>
                Company
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium" style={{ color: "var(--ct-text-muted)" }}>
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {brokers.map((b, i) => (
              <tr
                key={b.vendor}
                className="border-b hover:bg-[var(--ct-surface-hover)]"
                style={{ borderColor: "var(--ct-border-subtle)" }}
              >
                <td className="px-4 py-2 text-xs" style={{ color: "var(--ct-text-muted)" }}>{i + 1}</td>
                <td className="px-4 py-2 font-mono text-xs" style={{ color: "var(--ct-text-secondary)" }}>
                  {b.vendor}
                </td>
                <td className="px-4 py-2" style={{ color: "var(--ct-text-primary)" }}>
                  {b.company_name || b.vendor}
                </td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => handleDownload(b.vendor, b.company_name)}
                    disabled={downloading === b.vendor}
                    className="px-3 py-1 rounded-[var(--r-sm)] text-xs font-medium transition-colors"
                    style={downloading === b.vendor
                      ? { background: "var(--ct-text-muted)", color: "#ffffff", cursor: "not-allowed" }
                      : { background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
                  >
                    {downloading === b.vendor ? "Generating..." : "Download"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
