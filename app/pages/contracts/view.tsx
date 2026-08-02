"use client";
import { useEffect, useState } from "react";
import ContractLayout from "../../components/ContractLayout";
import { useRouter } from "next/router";
import api from "../../utils/api";

interface Confirmation {
  sid: number;
  contract_no: string;
  customer_name: string;
  broker_code: string;
  broker_name: string;
  term: string;
  start_date: string;
  contract_rate: string;
  ap_quote: string;
  type_of_contract: string;
  lmp: number;
  sent_by: string;
  date_modified: string;
}

export default function ViewConfirmations() {
  const router = useRouter();
  const [rows, setRows]       = useState<Confirmation[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [search, setSearch]   = useState("");
  const [loading, setLoading] = useState(false);
  const limit = 50;

  const load = async (p = 1, q = search) => {
    setLoading(true);
    try {
      const r = await api.get(`/contracts/list?page=${p}&limit=${limit}&search=${encodeURIComponent(q)}`);
      setRows(r.data.data);
      setTotal(r.data.total);
      setPage(p);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(1, ""); }, []);

  const totalPages = Math.ceil(total / limit);

  return (
    <ContractLayout title="View All Confirmations">
      <div className="max-w-6xl">

        {/* Search */}
        <div className="flex items-center gap-3 mb-4">
          <input
            className="rounded-[var(--r-md)] px-3 py-1.5 text-sm w-72 border focus:outline-none focus:border-[var(--accent-light)]"
            style={{ background: "var(--ct-surface)", color: "var(--ct-text-primary)", borderColor: "var(--ct-border-default)" }}
            placeholder="Search customer, contract no, broker..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && load(1, search)}
          />
          <button
            onClick={() => load(1, search)}
            className="px-4 py-1.5 text-sm rounded-[var(--r-md)] transition-colors"
            style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
          >
            Search
          </button>
          {search && (
            <button
              onClick={() => { setSearch(""); load(1, ""); }}
              className="text-xs transition-colors"
              style={{ color: "var(--ct-text-muted)" }}
            >
              Clear
            </button>
          )}
          <span className="text-xs ml-auto" style={{ color: "var(--ct-text-muted)" }}>{total} records</span>
        </div>

        {/* Table */}
        <div
          className="rounded-[var(--r-lg)] border overflow-hidden"
          style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}>
                {["Contract No", "Customer", "Broker", "Term", "Start Date", "Rate", "Company Quote", "Type", "Sent By", "Date"].map(h => (
                  <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ct-text-muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="text-center py-8 text-sm" style={{ color: "var(--ct-text-muted)" }}>Loading...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-8 text-sm" style={{ color: "var(--ct-text-muted)" }}>No confirmations found</td></tr>
              ) : rows.map((r, i) => (
                <tr key={r.sid} className="border-b cursor-pointer transition-colors hover:bg-[var(--ct-surface-hover)]"
                  style={{ borderColor: "var(--ct-border-subtle)", background: i % 2 === 0 ? "transparent" : "var(--ct-canvas)" }}
                  onClick={() => router.push(`/contracts/edit?sid=${r.sid}`)}>
                  <td className="px-3 py-2 font-mono text-xs" style={{ color: "var(--accent-light)" }}>{r.contract_no}</td>
                  <td className="px-3 py-2 font-medium" style={{ color: "var(--ct-text-primary)" }}>{r.customer_name}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.broker_name || r.broker_code}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.term}mo</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.start_date}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.contract_rate}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.ap_quote}</td>
                  <td className="px-3 py-2">
                    <span
                      className="text-xs px-2 py-0.5 rounded-[var(--r-sm)] font-medium"
                      style={{ background: "var(--accent-light-tint)", color: "var(--accent-light)" }}
                    >
                      {r.lmp ? "LMP" : r.type_of_contract}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs" style={{ color: "var(--ct-text-muted)" }}>{r.sent_by}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: "var(--ct-text-muted)" }}>{r.date_modified}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center gap-2 mt-4 justify-end">
            <button disabled={page === 1} onClick={() => load(page - 1)}
              className="px-3 py-1 text-sm rounded-[var(--r-md)] border disabled:opacity-40 transition-colors hover:bg-[var(--ct-surface-hover)]"
              style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}>← Prev</button>
            <span className="text-sm" style={{ color: "var(--ct-text-muted)" }}>Page {page} of {totalPages}</span>
            <button disabled={page === totalPages} onClick={() => load(page + 1)}
              className="px-3 py-1 text-sm rounded-[var(--r-md)] border disabled:opacity-40 transition-colors hover:bg-[var(--ct-surface-hover)]"
              style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}>Next →</button>
          </div>
        )}
      </div>
    </ContractLayout>
  );
}
