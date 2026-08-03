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
        <header className="flex justify-between items-center border-b pb-6" style={{ borderColor: "var(--ct-border-default)" }}>
          <h1 className="text-3xl font-black uppercase tracking-tighter" style={{ color: "var(--ct-text-primary)" }}>
            Broker Log
          </h1>
          <button
            onClick={() => router.push("/broker")}
            className="text-sm hover:opacity-80"
            style={{ color: "var(--ct-text-muted)" }}
          >
            ← Back
          </button>
        </header>

        {loading ? (
          <div className="text-center py-20 italic animate-pulse" style={{ color: "var(--ct-text-muted)" }}>
            Loading...
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-20 italic" style={{ color: "var(--ct-text-muted)" }}>
            No logs found.
          </div>
        ) : (
          <div className="rounded-[var(--r-lg)] border overflow-hidden" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="uppercase text-xs" style={{ background: "var(--ct-surface-hover)", color: "var(--ct-text-muted)" }}>
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
                    className="border-t hover:bg-[var(--ct-surface-hover)] transition-colors"
                    style={{ borderColor: "var(--ct-border-subtle)" }}
                  >
                    <td className="p-3 font-mono" style={{ color: "var(--ct-text-primary)" }}>
                      {log.broker_code}
                    </td>
                    <td className="p-3" style={{ color: "var(--ct-text-primary)" }}>{log.company_name}</td>
                    <td className="p-3" style={{ color: "var(--ct-text-secondary)" }}>{log.email_type}</td>
                    <td className="p-3 text-xs" style={{ color: "var(--ct-text-muted)" }}>
                      {log.sent_to}
                    </td>
                    <td className="p-3 text-center" style={{ color: "var(--ct-text-secondary)" }}>
                      {log.sent_at}
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className="px-2 py-1 rounded-[var(--r-sm)] text-xs font-bold"
                        style={log.status === "sent"
                          ? { background: "var(--success-light-tint)", color: "var(--success-light)" }
                          : { background: "var(--danger-light-tint)", color: "var(--danger-light)" }}
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
