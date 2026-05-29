import React, { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import api from "../../utils/api";
import { useRouter } from "next/router";

interface BrokerLog {
  id: number;
  broker_code: string;
  company_name: string;
  email_type: string;
  sent_to: string;
  sent_at: string;
  status: string;
}

const BrokerLogPage = () => {
  const [logs, setLogs] = useState<BrokerLog[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    api
      .get("/brokers/logs")
      .then((res) => {
        setLogs(res.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <Layout title="Broker Log">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <header className="flex justify-between items-center border-b border-slate-800 pb-6">
          <h1 className="text-3xl font-black text-white uppercase tracking-tighter">
            Broker Log
          </h1>
          <button
            onClick={() => router.push("/broker")}
            className="text-slate-400 hover:text-white text-sm"
          >
            ← Back
          </button>
        </header>

        {loading ? (
          <div className="text-slate-500 text-center py-20 italic animate-pulse">
            Loading...
          </div>
        ) : logs.length === 0 ? (
          <div className="text-slate-500 text-center py-20 italic">
            No logs found.
          </div>
        ) : (
          <div className="bg-slate-900 rounded-lg border border-slate-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800 text-slate-400 uppercase text-xs">
                  <th className="p-3 text-left">Broker Code</th>
                  <th className="p-3 text-left">Company</th>
                  <th className="p-3 text-left">Email Type</th>
                  <th className="p-3 text-left">Sent To</th>
                  <th className="p-3 text-center">Sent At</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-t border-slate-800 hover:bg-slate-800/50"
                  >
                    <td className="p-3 text-white font-mono">
                      {log.broker_code}
                    </td>
                    <td className="p-3 text-white">{log.company_name}</td>
                    <td className="p-3 text-slate-400">{log.email_type}</td>
                    <td className="p-3 text-slate-400 text-xs">
                      {log.sent_to}
                    </td>
                    <td className="p-3 text-center text-slate-400">
                      {log.sent_at}
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`px-2 py-1 rounded text-xs font-bold ${
                          log.status === "sent"
                            ? "bg-green-900 text-green-300"
                            : "bg-red-900 text-red-300"
                        }`}
                      >
                        {log.status}
                      </span>
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

export default BrokerLogPage;
