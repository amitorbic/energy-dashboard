import React, { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import api from "../../utils/api";
import { useRouter } from "next/router";

interface Broker {
  sid: number;
  broker_code: string;
  company_name: string;
  broker_name: string;
  phone_number: string;
  pricing_email: string;
  regular_status: string;
  commission_status: string;
  daily_pricing_email1: string;
  daily_pricing_email2: string;
  daily_pricing_email3: string;
  daily_pricing_email4: string;
  daily_pricing_email5: string;
}

const BrokerList = () => {
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const router = useRouter();

  useEffect(() => {
    api
      .get("/brokers")
      .then((res) => {
        setBrokers(res.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleStatusToggle = async (sid: number, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "inactive" : "active";
    await api.patch(`/brokers/${sid}/status`, { status: newStatus });
    setBrokers((prev) =>
      prev.map((b) =>
        b.sid === sid ? { ...b, regular_status: newStatus } : b,
      ),
    );
  };

  const handleDelete = async (sid: number) => {
    if (!confirm("Delete this broker?")) return;
    await api.delete(`/brokers/${sid}`);
    setBrokers((prev) => prev.filter((b) => b.sid !== sid));
  };

  const filtered = brokers.filter((b) => {
    const matchesSearch =
      b.company_name?.toLowerCase().includes(search.toLowerCase()) ||
      b.broker_code?.toLowerCase().includes(search.toLowerCase()) ||
      b.broker_name?.toLowerCase().includes(search.toLowerCase());
    if (activeTab === "active")
      return matchesSearch && b.regular_status === "active";
    if (activeTab === "inactive")
      return matchesSearch && b.regular_status !== "active";
    if (activeTab === "pricing") return matchesSearch && b.daily_pricing_email1;
    return matchesSearch;
  });

  const tabs = [
    { key: "all", label: "All Brokers" },
    { key: "active", label: "Active" },
    { key: "inactive", label: "Inactive" },
    { key: "pricing", label: "Receiving Pricing" },
  ];

  return (
    <Layout title="Broker Database">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <header className="flex justify-between items-center border-b pb-6" style={{ borderColor: "var(--ct-border-default)" }}>
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tighter" style={{ color: "var(--ct-text-primary)" }}>
              Broker Database
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--ct-text-muted)" }}>
              {brokers.length} brokers total
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => router.push("/broker/view")}
              className="px-4 py-2 rounded-[var(--r-md)] text-sm font-bold uppercase border hover:bg-[var(--ct-surface-hover)]"
              style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)", color: "var(--ct-text-secondary)" }}
            >
              View List
            </button>
            <button
              onClick={() => router.push("/broker/activate")}
              className="px-4 py-2 rounded-[var(--r-md)] text-sm font-bold uppercase border hover:bg-[var(--ct-surface-hover)]"
              style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)", color: "var(--ct-text-secondary)" }}
            >
              Activate/Deactivate
            </button>
            <button
              onClick={() => router.push("/broker/log")}
              className="px-4 py-2 rounded-[var(--r-md)] text-sm font-bold uppercase border hover:bg-[var(--ct-surface-hover)]"
              style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)", color: "var(--ct-text-secondary)" }}
            >
              Broker Log
            </button>
            <button
              onClick={() => router.push("/broker/add")}
              className="px-6 py-2 rounded-[var(--r-md)] text-sm font-bold uppercase transition-colors hover:opacity-90"
              style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
            >
              + Add Broker
            </button>
          </div>
        </header>

        {/* Tabs */}
        <div className="flex gap-2 border-b" style={{ borderColor: "var(--ct-border-default)" }}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="px-4 py-2 text-sm font-bold uppercase transition-colors border-b-2 -mb-px"
              style={activeTab === tab.key
                ? { color: "var(--accent-light)", borderColor: "var(--accent-light)" }
                : { color: "var(--ct-text-muted)", borderColor: "transparent" }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="Search by company, broker code or name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2 rounded-[var(--r-md)] border outline-none focus:border-[var(--accent-light)]"
          style={{ background: "var(--ct-surface)", color: "var(--ct-text-primary)", borderColor: "var(--ct-border-default)" }}
        />

        {loading ? (
          <div className="text-center py-20 italic animate-pulse" style={{ color: "var(--ct-text-muted)" }}>
            Loading...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 italic" style={{ color: "var(--ct-text-muted)" }}>
            No brokers found.
          </div>
        ) : (
          <div className="rounded-[var(--r-lg)] border overflow-hidden" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="uppercase text-xs" style={{ background: "var(--ct-surface-hover)", color: "var(--ct-text-muted)" }}>
                  <th className="p-3 text-left">Broker Code</th>
                  <th className="p-3 text-left">Company</th>
                  <th className="p-3 text-left">Broker Name</th>
                  <th className="p-3 text-left">Phone</th>
                  <th className="p-3 text-left">Pricing Email</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => (
                  <tr
                    key={b.sid}
                    className="border-t hover:bg-[var(--ct-surface-hover)] transition-colors"
                    style={{ borderColor: "var(--ct-border-subtle)" }}
                  >
                    <td className="p-3 font-mono font-bold" style={{ color: "var(--ct-text-primary)" }}>
                      {b.broker_code}
                    </td>
                    <td className="p-3" style={{ color: "var(--ct-text-primary)" }}>{b.company_name}</td>
                    <td className="p-3" style={{ color: "var(--ct-text-secondary)" }}>{b.broker_name}</td>
                    <td className="p-3" style={{ color: "var(--ct-text-secondary)" }}>{b.phone_number}</td>
                    <td className="p-3 text-xs" style={{ color: "var(--ct-text-muted)" }}>
                      {b.pricing_email}
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() =>
                          handleStatusToggle(b.sid, b.regular_status)
                        }
                        className="px-3 py-1 rounded-[var(--r-sm)] text-xs font-bold transition-colors"
                        style={b.regular_status === "active"
                          ? { background: "var(--success-light-tint)", color: "var(--success-light)" }
                          : b.regular_status === "partial"
                            ? { background: "var(--amber-light-tint)", color: "var(--amber-light)" }
                            : { background: "var(--ct-surface-hover)", color: "var(--ct-text-muted)" }}
                      >
                        {b.regular_status === "active"
                          ? "Active"
                          : b.regular_status === "partial"
                            ? "Partial"
                            : "Inactive"}
                      </button>
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex gap-2 justify-center">
                        <button
                          onClick={() => router.push(`/broker/${b.sid}/edit`)}
                          className="px-3 py-1 rounded-[var(--r-sm)] text-xs font-bold"
                          style={{ background: "var(--accent-light-tint)", color: "var(--accent-light)" }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(b.sid)}
                          className="px-3 py-1 rounded-[var(--r-sm)] text-xs font-bold"
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

export default BrokerList;
