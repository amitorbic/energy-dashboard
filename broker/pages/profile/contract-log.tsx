import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { isLoggedIn, isAdmin } from "../../utils/auth";
import api from "../../utils/api";

interface Broker { broker_id: string; name: string; }
interface LogRow {
  sr:           number;
  broker_name:  string;
  company_name: string;
  contr_date:   number;
  contr_date1:  string;
}
interface LogResponse { brokers: Broker[]; logs: LogRow[]; }

/**
 * Mirrors contract_log.php — admin only.
 *
 * PHP SQL:
 *   SELECT broker_id, name FROM contract_user ORDER BY name ASC
 *   SELECT * FROM contract_log
 *   WHERE broker_name LIKE '%:vendor%' AND company_name LIKE '%:com_name%'
 *   AND contr_date BETWEEN :str_date AND :end_date
 *   (contr_date stored as Unix timestamp — Python converts date strings via datetime.timestamp())
 *
 * Default: last 7 days.
 * Space encoding: PHP uses str_replace('___',' ',$_POST['vendor_id'])
 *   → we send vendor name directly (server handles the decode).
 * Edit link: contract_log.php?sr= → links to /forms/contract-commercial?sr=X
 */
export default function ContractLogPage() {
  const router = useRouter();

  const [brokers,  setBrokers]  = useState<Broker[]>([]);
  const [vendorId, setVendorId] = useState("");
  const [comName,  setComName]  = useState("");
  const [strDate,  setStrDate]  = useState("");
  const [endDate,  setEndDate]  = useState("");
  const [logs,     setLogs]     = useState<LogRow[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) { router.replace("/"); return; }
    if (!isAdmin())    { router.replace("/home"); return; }

    // Load with default (last 7 days) and populate broker list
    fetchLogs();
  }, []);

  async function fetchLogs(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    try {
      const res = await api.get<LogResponse>("/profile/admin/contract-log", {
        params: {
          vendor_id: vendorId,
          com_name:  comName,
          str_date:  strDate,
          end_date:  endDate,
        },
      });
      setBrokers(res.data.brokers);
      setLogs(res.data.logs);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }

  const inp = "border border-gray-300 rounded px-2 py-1 text-sm";

  return (
    <Layout>
      <section className="mb-3">
        <h2 className="text-xl font-bold text-gray-800">Contract Log</h2>
      </section>

      {/* Search form — mirrors contract_log.php */}
      <form onSubmit={fetchLogs} className="mb-4">
        <table>
          <tbody>
            <tr>
              <td className="pr-3 py-1 w-36 text-sm">Broker :</td>
              <td className="py-1">
                <select className={`${inp} w-56`} value={vendorId}
                  onChange={e => setVendorId(e.target.value)}>
                  <option value="">All Brokers</option>
                  {brokers.map(b => (
                    <option key={b.broker_id} value={b.broker_id}>{b.name}</option>
                  ))}
                </select>
              </td>
            </tr>
            <tr>
              <td className="pr-3 py-1 text-sm">Company Name :</td>
              <td><input className={`${inp} w-56`} value={comName} name="com_name"
                onChange={e => setComName(e.target.value)} /></td>
            </tr>
            <tr>
              <td className="pr-3 py-1 text-sm">From Date :</td>
              <td><input type="date" className={inp} value={strDate} name="str_date"
                onChange={e => setStrDate(e.target.value)} /></td>
            </tr>
            <tr>
              <td className="pr-3 py-1 text-sm">To Date :</td>
              <td><input type="date" className={inp} value={endDate} name="end_date"
                onChange={e => setEndDate(e.target.value)} /></td>
            </tr>
            <tr>
              <td className="h-10">&nbsp;</td>
              <td>
                <input type="submit" value={loading ? "Searching…" : "Search"}
                  disabled={loading}
                  className="border border-gray-300 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 text-sm px-4 py-1 cursor-pointer" />
              </td>
            </tr>
          </tbody>
        </table>
      </form>

      {/* Results — mirrors contract_log.php display */}
      {searched && (
        logs.length === 0 ? (
          <p className="text-sm text-gray-500">No records found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="border-collapse text-sm" style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  {["Sr", "Broker", "Company", "Date", "Edit"].map(h => (
                    <th key={h}
                      className="border border-gray-300 px-3 py-2 bg-gray-100 text-left text-xs font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((row, i) => (
                  <tr key={row.sr} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="border border-gray-300 px-3 py-1.5">{row.sr}</td>
                    <td className="border border-gray-300 px-3 py-1.5">{row.broker_name}</td>
                    <td className="border border-gray-300 px-3 py-1.5">{row.company_name}</td>
                    <td className="border border-gray-300 px-3 py-1.5">
                      {row.contr_date1 || new Date(row.contr_date * 1000).toLocaleDateString()}
                    </td>
                    <td className="border border-gray-300 px-3 py-1.5 text-center">
                      {/* mirrors contract_log.php edit link → contract_form.php?pass=@@edit@@ */}
                      <button
                        onClick={() => router.push(`/forms/contract-commercial?sr=${row.sr}&mode=edit`)}
                        className="text-blue-600 hover:underline text-xs"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </Layout>
  );
}
