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
    if (s === "active")
      return <span className="text-xs px-2 py-0.5 rounded-[var(--r-sm)]" style={{ background: "var(--success-light-tint)", color: "var(--success-light)" }}>active</span>;
    if (s === "pending")
      return <span className="text-xs px-2 py-0.5 rounded-[var(--r-sm)]" style={{ background: "var(--amber-light-tint)", color: "var(--amber-light)" }}>pending</span>;
    if (s === "cancelled")
      return <span className="text-xs px-2 py-0.5 rounded-[var(--r-sm)]" style={{ background: "var(--ct-surface-hover)", color: "var(--danger-light)" }}>cancelled</span>;
    return <span className="text-xs px-2 py-0.5 rounded-[var(--r-sm)]" style={{ background: "var(--ct-surface-hover)", color: "var(--ct-text-muted)" }}>{s || "—"}</span>;
  };

  const expiryBadge = (dateStr: string) => {
    const days = daysUntilExpiry(dateStr);
    if (days === null) return null;
    if (days < 0)
      return <span className="text-xs px-2 py-0.5 rounded-[var(--r-sm)]" style={{ background: "var(--danger-light-tint)", color: "var(--danger-light)" }}>Expired</span>;
    if (days <= 60)
      return <span className="text-xs px-2 py-0.5 rounded-[var(--r-sm)]" style={{ background: "var(--amber-light-tint)", color: "var(--amber-light)" }}>{days}d left</span>;
    return <span className="text-xs px-2 py-0.5 rounded-[var(--r-sm)]" style={{ background: "var(--ct-surface-hover)", color: "var(--ct-text-muted)" }}>{days}d left</span>;
  };

  return (
    <Layout title="Renewal Data">
      <div className="max-w-7xl mx-auto p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-5" style={{ borderColor: "var(--ct-border-default)" }}>
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/customers")}
              className="text-sm hover:opacity-80"
              style={{ color: "var(--ct-text-muted)" }}
            >
              ← Customers
            </button>
            <h1 className="text-2xl font-black uppercase tracking-tighter" style={{ color: "var(--ct-text-primary)" }}>
              Renewal Data
            </h1>
            {hasSearched && !loading && (
              <span className="text-xs px-2 py-1 rounded-[var(--r-sm)] font-mono" style={{ background: "var(--ct-surface-hover)", color: "var(--ct-text-secondary)" }}>
                {rows.length} results found
              </span>
            )}
            {expiryFilter && (
              <button
                onClick={clearExpiryFilter}
                className="text-xs px-2 py-1 rounded-[var(--r-sm)] font-semibold flex items-center gap-1"
                style={expiryFilter === "expired"
                  ? { background: "var(--danger-light-tint)", color: "var(--danger-light)" }
                  : { background: "var(--amber-light-tint)", color: "var(--amber-light)" }}
              >
                {expiryFilter === "expired" ? "Expired" : "Expiring ≤60d"} ✕
              </button>
            )}
          </div>
          <button
            onClick={() => router.push("/customers/renewal-upload")}
            className="px-4 py-2 rounded-[var(--r-md)] text-sm font-bold uppercase transition-colors hover:opacity-90"
            style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
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
              className="text-xs px-3 py-1.5 rounded-[var(--r-sm)] font-semibold uppercase transition-colors"
              style={statusFilter === s
                ? { background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }
                : { background: "var(--ct-surface-hover)", color: "var(--ct-text-muted)" }}
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
          className="w-full px-4 py-2 rounded-[var(--r-md)] border outline-none focus:border-[var(--accent-light)] text-sm"
          style={{ background: "var(--ct-surface)", color: "var(--ct-text-primary)", borderColor: "var(--ct-border-default)" }}
        />

        {/* Body */}
        {loading ? (
          <div className="text-center py-20 animate-pulse" style={{ color: "var(--ct-text-muted)" }}>Loading...</div>
        ) : !hasSearched ? (
          <div className="text-center py-20 text-sm" style={{ color: "var(--ct-text-muted)" }}>
            Search by Company Name, ESI ID, Customer ID, or Email to find customers.
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-20" style={{ color: "var(--ct-text-muted)" }}>No records found.</div>
        ) : (
          <div className="rounded-[var(--r-lg)] border overflow-x-auto" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="uppercase text-xs" style={{ background: "var(--ct-surface-hover)", color: "var(--ct-text-muted)" }}>
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
                    className="border-t hover:bg-[var(--ct-surface-hover)] transition-colors cursor-pointer"
                    style={{ borderColor: "var(--ct-border-subtle)" }}
                  >
                    <td className="p-3 font-semibold" style={{ color: "var(--ct-text-primary)" }}>{r.company_name}</td>
                    <td className="p-3 font-mono text-xs" style={{ color: "var(--ct-text-muted)" }}>{r.cust_id || "—"}</td>
                    <td className="p-3 font-mono text-xs" style={{ color: "var(--ct-text-secondary)" }}>{r.premise_id}</td>
                    <td className="p-3">{statusBadge(r.status)}</td>
                    <td className="p-3" style={{ color: "var(--ct-text-secondary)" }}>{r.broker_code}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span style={{ color: "var(--ct-text-secondary)" }}>{r.contract_end_date}</span>
                        {expiryBadge(r.contract_end_date)}
                      </div>
                    </td>
                    <td className="p-3 text-right font-mono" style={{ color: "var(--ct-text-secondary)" }}>
                      {r.contract_rate ? parseFloat(r.contract_rate).toFixed(4) : "—"}
                    </td>
                    <td className="p-3 text-right font-mono" style={{ color: "var(--ct-text-secondary)" }}>
                      {r.contract_renewal_usage
                        ? Number(r.contract_renewal_usage).toLocaleString()
                        : "—"}
                    </td>
                    <td className="p-3 text-xs font-mono" style={{ color: "var(--ct-text-muted)" }}>{r.load_profile}</td>
                    <td className="p-3 text-xs" style={{ color: "var(--ct-text-muted)" }}>
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
