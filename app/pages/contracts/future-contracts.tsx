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
            className="border border-gray-300 rounded px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-1 focus:ring-sky-400"
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <span className="text-xs text-gray-400 ml-auto">{filtered.length} records</span>
          <button
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="px-4 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-40"
          >
            Download CSV
          </button>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {["Contract No","Customer","Broker","Term","Start Date","Rate","Company Quote","ESIDs","Type"].map(h => (
                  <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-8 text-sm text-gray-400">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-sm text-gray-400">No future contracts found</td></tr>
              ) : filtered.map((r, i) => (
                <tr key={r.sid} className={`border-b border-gray-100 ${i % 2 === 0 ? "" : "bg-gray-50/50"}`}>
                  <td className="px-3 py-2 font-mono text-xs text-sky-700">{r.contract_no}</td>
                  <td className="px-3 py-2 font-medium text-gray-800">{r.customer_name}</td>
                  <td className="px-3 py-2 text-gray-600">{r.broker_name || r.broker_code}</td>
                  <td className="px-3 py-2 text-gray-600">{r.term}mo</td>
                  <td className="px-3 py-2 text-gray-600 font-medium text-green-700">{r.start_date}</td>
                  <td className="px-3 py-2 text-gray-600">{r.contract_rate}</td>
                  <td className="px-3 py-2 text-gray-600">{r.ap_quote}</td>
                  <td className="px-3 py-2 text-gray-600">{r.esid_count}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium
                      ${r.type_of_contract === "renewal" ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"}`}>
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
