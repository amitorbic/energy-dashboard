import React, { useState, useEffect } from "react";
import Layout from "../../../components/Layout";
import api from "../../../utils/api";
import { useRouter } from "next/router";

interface BneRecord {
  sid: number;
  customer_name: string;
  broker_code: string;
  esid: string;
  current_rate: string;
  terms_left: string;
  extension_terms: string;
  mills: string;
  broker_mill: string;
  comments: string;
  updated_at: string;
}

const secondaryBtnCls =
  "px-3 py-1 rounded text-xs font-bold border transition-colors";
const secondaryBtnStyle = {
  background: "var(--ct-surface)",
  borderColor: "var(--ct-border-default)",
  color: "var(--ct-text-primary)",
};

const BneLog = () => {
  const router = useRouter();
  const [records, setRecords] = useState<BneRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api
      .get("/bne/list")
      .then((res) => {
        setRecords(res.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleDelete = async (sid: number) => {
    if (!confirm("Delete this B&E record?")) return;
    await api.delete(`/bne/${sid}`);
    setRecords((prev) => prev.filter((r) => r.sid !== sid));
  };

  const filtered = records.filter(
    (r) =>
      r.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.broker_code?.toLowerCase().includes(search.toLowerCase()) ||
      r.esid?.includes(search),
  );

  return (
    <Layout title="Blend & Extend Log">
      <div className="max-w-7xl mx-auto p-6 space-y-5">
        {/* Header */}
        <div
          className="flex items-center justify-between border-b pb-5"
          style={{ borderColor: "var(--ct-border-subtle)" }}
        >
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/pricing")}
              className="text-sm transition-colors"
              style={{ color: "var(--ct-text-muted)" }}
            >
              ← Pricing
            </button>
            <h1
              className="text-2xl font-black uppercase tracking-tighter"
              style={{ color: "var(--ct-text-primary)" }}
            >
              Blend &amp; Extend Log
            </h1>
            {!loading && (
              <span
                className="text-xs px-2 py-1 rounded font-mono"
                style={{ background: "var(--ct-surface-hover)", color: "var(--ct-text-secondary)" }}
              >
                {records.length} records
              </span>
            )}
          </div>
          <button
            onClick={() => router.push("/custom_pricing/blend_extend/add")}
            className="px-4 py-2 rounded text-sm font-bold uppercase transition-colors"
            style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
          >
            + New B&amp;E
          </button>
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search by customer, broker or ESI ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2 rounded border focus:outline-none focus:border-[var(--accent-light)] text-sm"
          style={{ background: "var(--ct-surface)", color: "var(--ct-text-primary)", borderColor: "var(--ct-border-default)" }}
        />

        {/* Table */}
        {loading ? (
          <div className="text-center py-20 animate-pulse" style={{ color: "var(--ct-text-muted)" }}>
            Loading...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20" style={{ color: "var(--ct-text-muted)" }}>
            No records found.
          </div>
        ) : (
          <div
            className="rounded-[var(--r-lg)] border overflow-x-auto"
            style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="uppercase text-xs"
                  style={{ background: "var(--ct-surface-hover)", color: "var(--ct-text-muted)" }}
                >
                  <th className="p-3 text-left">Customer</th>
                  <th className="p-3 text-left">Broker</th>
                  <th className="p-3 text-left">ESI ID</th>
                  <th className="p-3 text-right">Current rate</th>
                  <th className="p-3 text-left">End date</th>
                  <th className="p-3 text-left">Terms</th>
                  <th className="p-3 text-left">Updated</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.sid}
                    className="border-t transition-colors hover:bg-[var(--ct-surface-hover)]"
                    style={{ borderColor: "var(--ct-border-subtle)" }}
                  >
                    <td className="p-3 font-semibold" style={{ color: "var(--ct-text-primary)" }}>
                      {r.customer_name}
                    </td>
                    <td className="p-3" style={{ color: "var(--ct-text-secondary)" }}>{r.broker_code}</td>
                    <td className="p-3 text-xs font-mono truncate max-w-32" style={{ color: "var(--ct-text-secondary)" }}>
                      {r.esid}
                    </td>
                    <td className="p-3 text-right font-mono" style={{ color: "var(--ct-text-primary)" }}>
                      {r.current_rate
                        ? parseFloat(r.current_rate).toFixed(4)
                        : "—"}{" "}
                      ¢
                    </td>
                    <td className="p-3" style={{ color: "var(--ct-text-primary)" }}>{r.terms_left}</td>
                    <td className="p-3 font-mono text-xs" style={{ color: "var(--ct-text-secondary)" }}>
                      {r.extension_terms}
                    </td>
                    <td className="p-3 text-xs" style={{ color: "var(--ct-text-muted)" }}>
                      {r.updated_at
                        ? new Date(r.updated_at).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-2 justify-center">
                        <button
                          onClick={() =>
                            router.push(
                              `/custom_pricing/blend_extend/add?sid=${r.sid}`,
                            )
                          }
                          className={secondaryBtnCls}
                          style={secondaryBtnStyle}
                        >
                          Price
                        </button>
                        <button
                          onClick={() => handleDelete(r.sid)}
                          className="px-3 py-1 rounded text-xs font-bold transition-colors"
                          style={{ background: "var(--danger-light-tint)", color: "var(--danger-light)" }}
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

export default BneLog;
