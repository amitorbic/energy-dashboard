import React, { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import api from "../../utils/api";
import { useRouter } from "next/router";

interface RenewalRow {
  serial: number;
  cust_id: string;
  company_name: string;
  premise_id: string;
  broker_code: string;
  broker_name: string;
  contract_end_date: string;
  contract_rate: string;
  contract_renewal_usage: string;
  load_profile: string;
  cust_email: string;
  cust_phone1: string;
}

const RenewalView = () => {
  const router = useRouter();
  const [rows, setRows] = useState<RenewalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [total, setTotal] = useState(0);

  useEffect(() => {
    api
      .get("/contract-renewal/list")
      .then((res) => {
        setRows(res.data.rows || res.data);
        setTotal(res.data.total || res.data.length);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = rows.filter(
    (r) =>
      r.company_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.premise_id?.includes(search) ||
      r.broker_code?.toLowerCase().includes(search.toLowerCase()),
  );

  const daysUntilExpiry = (dateStr: string) => {
    if (!dateStr) return null;
    const diff = Math.round(
      (new Date(dateStr).getTime() - Date.now()) / 86400000,
    );
    return diff;
  };

  const expiryBadge = (dateStr: string) => {
    const days = daysUntilExpiry(dateStr);
    if (days === null) return null;
    if (days < 0)
      return (
        <span className="text-xs bg-red-900/50 text-red-400 px-2 py-0.5 rounded">
          Expired
        </span>
      );
    if (days <= 60)
      return (
        <span className="text-xs bg-yellow-900/50 text-yellow-400 px-2 py-0.5 rounded">
          {days}d left
        </span>
      );
    return (
      <span className="text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded">
        {days}d left
      </span>
    );
  };

  return (
    <Layout title="Renewal Data">
      <div className="max-w-7xl mx-auto p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-5">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/customers")}
              className="text-slate-400 hover:text-white text-sm"
            >
              ← Customers
            </button>
            <h1 className="text-2xl font-black text-white uppercase tracking-tighter">
              Renewal Data
            </h1>
            {!loading && (
              <span className="bg-slate-700 text-slate-300 text-xs px-2 py-1 rounded font-mono">
                {total} records
              </span>
            )}
          </div>
          <button
            onClick={() => router.push("/customers/renewal-upload")}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm font-bold uppercase transition"
          >
            Upload new file
          </button>
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search by company, ESI ID or broker code..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-slate-800 text-white px-4 py-2 rounded border border-slate-700 focus:outline-none focus:border-red-500 text-sm"
        />

        {/* Table */}
        {loading ? (
          <div className="text-slate-500 text-center py-20 animate-pulse">
            Loading...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-slate-500 text-center py-20">
            No records found.
          </div>
        ) : (
          <div className="bg-slate-900 rounded-lg border border-slate-800 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800 text-slate-400 uppercase text-xs">
                  <th className="p-3 text-left">Company</th>
                  <th className="p-3 text-left">ESI ID</th>
                  <th className="p-3 text-left">Broker</th>
                  <th className="p-3 text-left">End date</th>
                  <th className="p-3 text-right">Rate (¢)</th>
                  <th className="p-3 text-right">Usage (kWh/yr)</th>
                  <th className="p-3 text-left">Load profile</th>
                  <th className="p-3 text-left">Contact</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.serial}
                    className="border-t border-slate-800 hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="p-3 font-semibold text-white">
                      {r.company_name}
                    </td>
                    <td className="p-3 font-mono text-xs text-slate-400">
                      {r.premise_id}
                    </td>
                    <td className="p-3 text-slate-400">{r.broker_code}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-300">
                          {r.contract_end_date}
                        </span>
                        {expiryBadge(r.contract_end_date)}
                      </div>
                    </td>
                    <td className="p-3 text-right text-slate-300 font-mono">
                      {r.contract_rate
                        ? parseFloat(r.contract_rate).toFixed(4)
                        : "—"}
                    </td>
                    <td className="p-3 text-right text-slate-300 font-mono">
                      {r.contract_renewal_usage
                        ? Number(r.contract_renewal_usage).toLocaleString()
                        : "—"}
                    </td>
                    <td className="p-3 text-xs text-slate-400 font-mono">
                      {r.load_profile}
                    </td>
                    <td className="p-3 text-xs text-slate-400">
                      {r.cust_email || r.cust_phone1 || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default RenewalView;
