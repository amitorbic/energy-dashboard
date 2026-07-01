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
  status: string;
}

const RenewalView = () => {
  const router = useRouter();
  const [rows, setRows] = useState<RenewalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [total, setTotal] = useState(0);
  const [expiryFilter, setExpiryFilter] = useState<"" | "expiring" | "expired">("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "pending" | "cancelled">("active");

  useEffect(() => {
    const f = router.query.filter as string | undefined;
    if (f === "expiring" || f === "expired") setExpiryFilter(f);
  }, [router.query.filter]);

  useEffect(() => {
    setLoading(true);
    const params = statusFilter ? `?status=${statusFilter}` : "";
    api
      .get(`/contract-renewal/list${params}`)
      .then((res) => {
        setRows(res.data.rows || res.data);
        setTotal(res.data.total || res.data.length);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [statusFilter]);

  const daysUntilExpiry = (dateStr: string) => {
    if (!dateStr) return null;
    return Math.round((new Date(dateStr).getTime() - Date.now()) / 86400000);
  };

  const filtered = rows.filter((r) => {
    if (search) {
      const q = search.toLowerCase();
      const matchesSearch =
        r.company_name?.toLowerCase().includes(q) ||
        r.premise_id?.includes(search) ||
        r.broker_code?.toLowerCase().includes(q);
      if (!matchesSearch) return false;
    }
    if (expiryFilter) {
      const days = daysUntilExpiry(r.contract_end_date);
      if (days === null) return false;
      if (expiryFilter === "expired") return days < 0;
      if (expiryFilter === "expiring") return days >= 0 && days <= 60;
    }
    return true;
  });

  const statusBadge = (s: string) => {
    if (s === "active")    return <span className="text-xs bg-green-900/50 text-green-400 px-2 py-0.5 rounded">active</span>;
    if (s === "pending")   return <span className="text-xs bg-yellow-900/50 text-yellow-400 px-2 py-0.5 rounded">pending</span>;
    if (s === "cancelled") return <span className="text-xs bg-slate-700 text-red-400/70 px-2 py-0.5 rounded">cancelled</span>;
    return <span className="text-xs bg-slate-800 text-slate-500 px-2 py-0.5 rounded">{s || "—"}</span>;
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
                {filtered.length}{expiryFilter ? ` / ${total}` : ""} records
              </span>
            )}
            {expiryFilter && (
              <button
                onClick={() => { setExpiryFilter(""); router.replace("/customers/renewal-view", undefined, { shallow: true }); }}
                className={`text-xs px-2 py-1 rounded font-semibold flex items-center gap-1 ${expiryFilter === "expired" ? "bg-red-900/50 text-red-400" : "bg-yellow-900/50 text-yellow-400"}`}
              >
                {expiryFilter === "expired" ? "Expired" : "Expiring ≤60d"} ✕
              </button>
            )}
          </div>
          <button
            onClick={() => router.push("/customers/renewal-upload")}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm font-bold uppercase transition"
          >
            Upload new file
          </button>
        </div>

        {/* Status filter */}
        <div className="flex gap-2">
          {(["active", "pending", "cancelled", ""] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`text-xs px-3 py-1.5 rounded font-semibold uppercase transition ${
                statusFilter === s
                  ? "bg-red-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              {s === "" ? "All" : s}
            </button>
          ))}
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
                  <th className="p-3 text-left font-mono">Cust ID</th>
                  <th className="p-3 text-left">ESI ID</th>
                  <th className="p-3 text-left">Status</th>
                  <th className="p-3 text-left">Broker</th>
                  <th className="p-3 text-left">End date</th>
                  <th className="p-3 text-right">Rate ($)</th>
                  <th className="p-3 text-right">Usage (kWh/yr)</th>
                  <th className="p-3 text-left">Load profile</th>
                  <th className="p-3 text-left">Contact</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.serial}
                    onClick={() => router.push(`/customers/${r.serial}`)}
                    className="border-t border-slate-800 hover:bg-slate-800/40 transition-colors cursor-pointer"
                  >
                    <td className="p-3 font-semibold text-white">
                      {r.company_name}
                    </td>
                    <td className="p-3 font-mono text-xs text-slate-500">
                      {r.cust_id || "—"}
                    </td>
                    <td className="p-3 font-mono text-xs text-slate-400">
                      {r.premise_id}
                    </td>
                    <td className="p-3">
                      {statusBadge(r.status)}
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
