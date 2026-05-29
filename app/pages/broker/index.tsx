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
        <header className="flex justify-between items-center border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-3xl font-black text-white uppercase tracking-tighter">
              Broker Database
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              {brokers.length} brokers total
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => router.push("/broker/view")}
              className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded text-sm font-bold uppercase"
            >
              View List
            </button>
            <button
              onClick={() => router.push("/broker/activate")}
              className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded text-sm font-bold uppercase"
            >
              Activate/Deactivate
            </button>
            <button
              onClick={() => router.push("/broker/log")}
              className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded text-sm font-bold uppercase"
            >
              Broker Log
            </button>
            <button
              onClick={() => router.push("/broker/add")}
              className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded text-sm font-bold uppercase"
            >
              + Add Broker
            </button>
          </div>
        </header>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-slate-800">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-bold uppercase transition-colors ${
                activeTab === tab.key
                  ? "text-red-400 border-b-2 border-red-400"
                  : "text-slate-500 hover:text-white"
              }`}
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
          className="w-full bg-slate-800 text-white px-4 py-2 rounded border border-slate-700 focus:outline-none focus:border-red-500"
        />

        {loading ? (
          <div className="text-slate-500 text-center py-20 italic animate-pulse">
            Loading...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-slate-500 text-center py-20 italic">
            No brokers found.
          </div>
        ) : (
          <div className="bg-slate-900 rounded-lg border border-slate-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800 text-slate-400 uppercase text-xs">
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
                    className="border-t border-slate-800 hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="p-3 text-white font-mono font-bold">
                      {b.broker_code}
                    </td>
                    <td className="p-3 text-white">{b.company_name}</td>
                    <td className="p-3 text-slate-400">{b.broker_name}</td>
                    <td className="p-3 text-slate-400">{b.phone_number}</td>
                    <td className="p-3 text-slate-400 text-xs">
                      {b.pricing_email}
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() =>
                          handleStatusToggle(b.sid, b.regular_status)
                        }
                        className={`px-3 py-1 rounded text-xs font-bold transition-colors ${
                          b.regular_status === "active"
                            ? "bg-green-900 text-green-300 hover:bg-green-800"
                            : b.regular_status === "partial"
                              ? "bg-yellow-900 text-yellow-300 hover:bg-yellow-800"
                              : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                        }`}
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
                          className="bg-blue-900 hover:bg-blue-800 text-blue-300 px-3 py-1 rounded text-xs font-bold"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(b.sid)}
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

export default BrokerList;
