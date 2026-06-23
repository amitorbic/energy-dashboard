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
      <h2 className="text-lg font-semibold text-orange-600 mb-4">
        Download Commission Files
      </h2>

      {/* Month selector */}
      <div className="bg-white border border-gray-200 rounded p-4 mb-5 flex items-end gap-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Month</label>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm min-w-[180px]"
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
      <div className="bg-white border border-gray-200 rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-100 border-b border-gray-200">
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">
                #
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">
                Vendor
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">
                Company
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {brokers.map((b, i) => (
              <tr
                key={b.vendor}
                className="border-b border-gray-100 hover:bg-gray-50"
              >
                <td className="px-4 py-2 text-gray-400 text-xs">{i + 1}</td>
                <td className="px-4 py-2 font-mono text-xs text-gray-600">
                  {b.vendor}
                </td>
                <td className="px-4 py-2 text-gray-800">
                  {b.company_name || b.vendor}
                </td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => handleDownload(b.vendor, b.company_name)}
                    disabled={downloading === b.vendor}
                    className={`px-3 py-1 rounded text-xs font-medium text-white ${
                      downloading === b.vendor
                        ? "bg-gray-400 cursor-not-allowed"
                        : "bg-green-600 hover:bg-green-700"
                    }`}
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
