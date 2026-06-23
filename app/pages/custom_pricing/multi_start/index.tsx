import React, { useState, useEffect } from "react";
import Layout from "../../../components/Layout";
import api from "../../../utils/api";
import { useRouter } from "next/router";

interface MspRecord {
  sid: number;
  customer_name: string;
  broker_code: string;
  esids: string;
  terms: string;
  mills: string;
  broker_mill: string;
  comments: string;
  updated_at: string;
}

const MspLog = () => {
  const router = useRouter();
  const [records, setRecords] = useState<MspRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api
      .get("/msp/list")
      .then((res) => {
        setRecords(res.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleDelete = async (sid: number) => {
    if (!confirm("Delete this MSP record?")) return;
    await api.delete(`/msp/${sid}`);
    setRecords((prev) => prev.filter((r) => r.sid !== sid));
  };

  const filtered = records.filter(
    (r) =>
      r.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.broker_code?.toLowerCase().includes(search.toLowerCase()) ||
      r.esids?.includes(search),
  );

  return (
    <Layout title="Multiple Start Pricing">
      <div className="max-w-7xl mx-auto p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-5">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/pricing")}
              className="text-slate-400 hover:text-white text-sm"
            >
              ← Pricing
            </button>
            <h1 className="text-2xl font-black text-white uppercase tracking-tighter">
              Multiple Start Pricing
            </h1>
            {!loading && (
              <span className="bg-slate-700 text-slate-300 text-xs px-2 py-1 rounded font-mono">
                {records.length} records
              </span>
            )}
          </div>
          <button
            onClick={() => router.push("/custom_pricing/multi_start/add")}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm font-bold uppercase transition"
          >
            + New MSP
          </button>
        </div>

        <input
          type="text"
          placeholder="Search by customer, broker or ESI ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-slate-800 text-white px-4 py-2 rounded border border-slate-700 focus:outline-none focus:border-red-500 text-sm"
        />

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
                  <th className="p-3 text-left">Customer</th>
                  <th className="p-3 text-left">Broker</th>
                  <th className="p-3 text-left">ESI IDs</th>
                  <th className="p-3 text-left">Terms</th>
                  <th className="p-3 text-left">Updated</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.sid}
                    className="border-t border-slate-800 hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="p-3 font-semibold text-white">
                      {r.customer_name}
                    </td>
                    <td className="p-3 text-slate-400">{r.broker_code}</td>
                    <td className="p-3 text-xs font-mono text-slate-400 truncate max-w-40">
                      {r.esids}
                    </td>
                    <td className="p-3 text-slate-400 font-mono text-xs">
                      {r.terms}
                    </td>
                    <td className="p-3 text-slate-500 text-xs">
                      {r.updated_at
                        ? new Date(r.updated_at).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-2 justify-center">
                        <button
                          onClick={() =>
                            router.push(
                              `/custom_pricing/multi_start/add?sid=${r.sid}`,
                            )
                          }
                          className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-xs font-bold"
                        >
                          Price
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              await api.post(`/msp/send-email`, { sid: r.sid });
                              alert("Email sent!");
                            } catch (err: any) {
                              alert(
                                err.response?.data?.detail || "Send failed",
                              );
                            }
                          }}
                          className="bg-blue-700 hover:bg-blue-600 text-white px-3 py-1 rounded text-xs font-bold"
                        >
                          Send
                        </button>
                        <button
                          onClick={() => handleDelete(r.sid)}
                          className="bg-red-900 hover:bg-red-800 text-red-300 px-3 py-1 rounded text-xs font-bold"
                        >
                          Delete
                        </button>
                      </div>
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

export default MspLog;
