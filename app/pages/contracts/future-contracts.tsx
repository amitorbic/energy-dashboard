"use client";
import { useEffect, useState } from "react";
import ContractLayout from "../../components/ContractLayout";
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
  esid_count: string;
  sent_by: string;
}

export default function FutureContracts() {
  const [rows, setRows]       = useState<Confirmation[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch]   = useState("");

  const load = async (q = "") => {
    setLoading(true);
    try {
      const r = await api.get(`/contracts/future?search=${encodeURIComponent(q)}`);
      setRows(r.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleExport = () => {
    const headers = ["Contract No","Customer","Broker","Term","Start Date","Contract Rate","Company Quote","ESIDs","Type","Sent By"];
    const csvRows = [
      headers.join(","),
      ...rows.map(r => [
        r.contract_no, `"${r.customer_name}"`, `"${r.broker_name || r.broker_code}"`,
        r.term, r.start_date, r.contract_rate, r.ap_quote,
        r.esid_count, r.type_of_contract, r.sent_by
      ].join(","))
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `future_contracts_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = rows.filter(r =>
    !search ||
    r.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.broker_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.contract_no?.includes(search)
  );

  return (
    <ContractLayout title="Future Contracts">
      <div className="max-w-6xl">

        <div className="flex items-center gap-3 mb-4">
          <input
            className="rounded-[var(--r-md)] px-3 py-1.5 text-sm w-64 border focus:outline-none focus:border-[var(--accent-light)]"
            style={{ background: "var(--ct-surface)", color: "var(--ct-text-primary)", borderColor: "var(--ct-border-default)" }}
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <span className="text-xs ml-auto" style={{ color: "var(--ct-text-muted)" }}>{filtered.length} records</span>
          <button
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="px-4 py-1.5 text-sm rounded-[var(--r-md)] border disabled:opacity-40 transition-colors hover:bg-[var(--ct-surface-hover)]"
            style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
          >
            Download CSV
          </button>
        </div>

        <div className="rounded-[var(--r-lg)] border overflow-hidden" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}>
                {["Contract No","Customer","Broker","Term","Start Date","Rate","Company Quote","ESIDs","Type"].map(h => (
                  <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ct-text-muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-8 text-sm" style={{ color: "var(--ct-text-muted)" }}>Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-sm" style={{ color: "var(--ct-text-muted)" }}>No future contracts found</td></tr>
              ) : filtered.map((r, i) => (
                <tr key={r.sid} className="border-b" style={{ borderColor: "var(--ct-border-subtle)", background: i % 2 === 0 ? "transparent" : "var(--ct-canvas)" }}>
                  <td className="px-3 py-2 font-mono text-xs" style={{ color: "var(--accent-light)" }}>{r.contract_no}</td>
                  <td className="px-3 py-2 font-medium" style={{ color: "var(--ct-text-primary)" }}>{r.customer_name}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.broker_name || r.broker_code}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.term}mo</td>
                  <td className="px-3 py-2 font-medium" style={{ color: "var(--accent-light)" }}>{r.start_date}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.contract_rate}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.ap_quote}</td>
                  <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.esid_count}</td>
                  <td className="px-3 py-2">
                    <span
                      className="text-xs px-2 py-0.5 rounded-[var(--r-sm)] font-medium"
                      style={{ background: "var(--accent-light-tint)", color: "var(--accent-light)" }}
                    >
                      {r.type_of_contract}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ContractLayout>
  );
}
