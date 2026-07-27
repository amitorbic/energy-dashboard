import { useState, useEffect, useRef, useCallback } from "react";
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
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [search, setSearch] = useState("");
  const [expiryFilter, setExpiryFilter] = useState<"" | "expiring" | "expired">("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "pending" | "cancelled">("active");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback((q: string, status: string, expiry: string) => {
    setLoading(true);
    setHasSearched(true);
    const params = new URLSearchParams();
    if (q) params.set("search", q);
    if (status) params.set("status", status);
    if (expiry) params.set("expiry_filter", expiry);
    api
      .get(`/contract-renewal/list?${params}`)
      .then((res) => {
        setRows(res.data.rows || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Auto-fetch when navigating from index page expiry cards
  useEffect(() => {
    const f = router.query.filter as string | undefined;
    if (f === "expiring" || f === "expired") {
      setExpiryFilter(f);
      doSearch("", "active", f);
    }
  }, [router.query.filter, doSearch]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearch(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length >= 3) {
      debounceRef.current = setTimeout(() => {
        doSearch(q, statusFilter, expiryFilter);
      }, 500);
    } else if (expiryFilter) {
      debounceRef.current = setTimeout(() => {
        doSearch("", statusFilter, expiryFilter);
      }, 500);
    } else {
      setRows([]);
      setHasSearched(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && search.length >= 3) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      doSearch(search, statusFilter, expiryFilter);
    }
  };

  const handleStatusChange = (s: "" | "active" | "pending" | "cancelled") => {
    setStatusFilter(s);
    if (search.length >= 3 || expiryFilter) {
      doSearch(search, s, expiryFilter);
    }
  };

  const clearExpiryFilter = () => {
    setExpiryFilter("");
    router.replace("/customers/renewal-view", undefined, { shallow: true });
    if (search.length >= 3) {
      doSearch(search, statusFilter, "");
    } else {
      setRows([]);
      setHasSearched(false);
    }
  };

  const daysUntilExpiry = (dateStr: string) => {
    if (!dateStr) return null;
    return Math.round((new Date(dateStr).getTime() - Date.now()) / 86400000);
  };

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
      return <span className="text-xs bg-red-900/50 text-red-400 px-2 py-0.5 rounded">Expired</span>;
    if (days <= 60)
      return <span className="text-xs bg-yellow-900/50 text-yellow-400 px-2 py-0.5 rounded">{days}d left</span>;
    return <span className="text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded">{days}d left</span>;
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
            {hasSearched && !loading && (
              <span className="bg-slate-700 text-slate-300 text-xs px-2 py-1 rounded font-mono">
                {rows.length} results found
              </span>
            )}
            {expiryFilter && (
              <button
                onClick={clearExpiryFilter}
                className={`text-xs px-2 py-1 rounded font-semibold flex items-center gap-1 ${
                  expiryFilter === "expired"
                    ? "bg-red-900/50 text-red-400"
                    : "bg-yellow-900/50 text-yellow-400"
                }`}
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
              onClick={() => handleStatusChange(s)}
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
          placeholder="Search by company name, ESI ID, Customer ID, or email…"
          value={search}
          onChange={handleSearchChange}
          onKeyDown={handleKeyDown}
          className="w-full bg-slate-800 text-white px-4 py-2 rounded border border-slate-700 focus:outline-none focus:border-red-500 text-sm"
        />

        {/* Body */}
        {loading ? (
          <div className="text-slate-500 text-center py-20 animate-pulse">Loading...</div>
        ) : !hasSearched ? (
          <div className="text-slate-500 text-center py-20 text-sm">
            Search by Company Name, ESI ID, Customer ID, or Email to find customers.
          </div>
        ) : rows.length === 0 ? (
          <div className="text-slate-500 text-center py-20">No records found.</div>
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
                {rows.map((r) => (
                  <tr
                    key={r.serial}
                    onClick={() => router.push(`/customers/${r.serial}`)}
                    className="border-t border-slate-800 hover:bg-slate-800/40 transition-colors cursor-pointer"
                  >
                    <td className="p-3 font-semibold text-white">{r.company_name}</td>
                    <td className="p-3 font-mono text-xs text-slate-500">{r.cust_id || "—"}</td>
                    <td className="p-3 font-mono text-xs text-slate-400">{r.premise_id}</td>
                    <td className="p-3">{statusBadge(r.status)}</td>
                    <td className="p-3 text-slate-400">{r.broker_code}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-300">{r.contract_end_date}</span>
                        {expiryBadge(r.contract_end_date)}
                      </div>
                    </td>
                    <td className="p-3 text-right text-slate-300 font-mono">
                      {r.contract_rate ? parseFloat(r.contract_rate).toFixed(4) : "—"}
                    </td>
                    <td className="p-3 text-right text-slate-300 font-mono">
                      {r.contract_renewal_usage
                        ? Number(r.contract_renewal_usage).toLocaleString()
                        : "—"}
                    </td>
                    <td className="p-3 text-xs text-slate-400 font-mono">{r.load_profile}</td>
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
