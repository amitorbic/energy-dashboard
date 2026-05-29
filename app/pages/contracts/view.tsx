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
            className="border border-gray-300 rounded px-3 py-1.5 text-sm w-72 focus:outline-none focus:ring-1 focus:ring-sky-400"
            placeholder="Search customer, contract no, broker..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && load(1, search)}
          />
          <button
            onClick={() => load(1, search)}
            className="px-4 py-1.5 text-sm bg-sky-600 text-white rounded hover:bg-sky-700"
          >
            Search
          </button>
          {search && (
            <button
              onClick={() => { setSearch(""); load(1, ""); }}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Clear
            </button>
          )}
          <span className="text-xs text-gray-400 ml-auto">{total} records</span>
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {["Contract No", "Customer", "Broker", "Term", "Start Date", "Rate", "Company Quote", "Type", "Sent By", "Date"].map(h => (
                  <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="text-center py-8 text-sm text-gray-400">Loading...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-8 text-sm text-gray-400">No confirmations found</td></tr>
              ) : rows.map((r, i) => (
                <tr key={r.sid} className={`border-b border-gray-100 hover:bg-sky-50 cursor-pointer ${i % 2 === 0 ? "" : "bg-gray-50/50"}`}
                  onClick={() => router.push(`/contracts/edit?sid=${r.sid}`)}>
                  <td className="px-3 py-2 font-mono text-xs text-sky-700">{r.contract_no}</td>
                  <td className="px-3 py-2 font-medium text-gray-800">{r.customer_name}</td>
                  <td className="px-3 py-2 text-gray-600">{r.broker_name || r.broker_code}</td>
                  <td className="px-3 py-2 text-gray-600">{r.term}mo</td>
                  <td className="px-3 py-2 text-gray-600">{r.start_date}</td>
                  <td className="px-3 py-2 text-gray-600">{r.contract_rate}</td>
                  <td className="px-3 py-2 text-gray-600">{r.ap_quote}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium
                      ${r.type_of_contract === "renewal" ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"}`}>
                      {r.lmp ? "LMP" : r.type_of_contract}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{r.sent_by}</td>
                  <td className="px-3 py-2 text-gray-400 text-xs">{r.date_modified}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center gap-2 mt-4 justify-end">
            <button disabled={page === 1} onClick={() => load(page - 1)}
              className="px-3 py-1 text-sm border rounded disabled:opacity-40 hover:bg-gray-50">← Prev</button>
            <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
            <button disabled={page === totalPages} onClick={() => load(page + 1)}
              className="px-3 py-1 text-sm border rounded disabled:opacity-40 hover:bg-gray-50">Next →</button>
          </div>
        )}
      </div>
    </ContractLayout>
  );
}
