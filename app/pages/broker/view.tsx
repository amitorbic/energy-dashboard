import React, { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import api from "../../utils/api";
import { useRouter } from "next/router";

interface Broker {
  sid: number;
  broker_code: string;
  company_name: string;
  broker_name: string;
  pricing_email: string;
  pricing_flag: number;
  daily_pricing_email1: string;
  daily_pricing_flag1: number;
  commission_email: string;
  commission_flag: number;
  confirmation_email: string;
  confirmation_flag: number;
}

const ViewBrokerList = () => {
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("pricing");
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

  const tabs = [
    { key: "pricing", label: "Pricing" },
    { key: "daily_pricing", label: "Daily Pricing" },
    { key: "commission", label: "Commission" },
    { key: "confirmation", label: "Confirmation" },
  ];

  const filtered = brokers.filter((b) => {
    if (activeTab === "pricing") return b.pricing_flag === 1;
    if (activeTab === "daily_pricing") return b.daily_pricing_flag1 === 1;
    if (activeTab === "commission") return b.commission_flag === 1;
    if (activeTab === "confirmation") return b.confirmation_flag === 1;
    return true;
  });

  return (
    <Layout title="View Broker List">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <header className="flex justify-between items-center border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-3xl font-black text-white uppercase tracking-tighter">
              View Broker List
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              {filtered.length} brokers in this category
            </p>
          </div>
          <button
            onClick={() => router.push("/broker")}
            className="text-slate-400 hover:text-white text-sm"
          >
            ← Back
          </button>
        </header>

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
              {tab.label} (
              {
                brokers.filter((b) => {
                  if (tab.key === "pricing") return b.pricing_flag === 1;
                  if (tab.key === "daily_pricing")
                    return b.daily_pricing_flag1 === 1;
                  if (tab.key === "commission") return b.commission_flag === 1;
                  if (tab.key === "confirmation")
                    return b.confirmation_flag === 1;
                  return false;
                }).length
              }
              )
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-slate-500 text-center py-20 italic animate-pulse">
            Loading...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-slate-500 text-center py-20 italic">
            No brokers in this category.
          </div>
        ) : (
          <div className="bg-slate-900 rounded-lg border border-slate-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800 text-slate-400 uppercase text-xs">
                  <th className="p-3 text-left">Broker Code</th>
                  <th className="p-3 text-left">Company</th>
                  <th className="p-3 text-left">Broker Name</th>
                  <th className="p-3 text-left">Email</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => (
                  <tr
                    key={b.sid}
                    className="border-t border-slate-800 hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="p-3 text-red-400 font-mono font-bold">
                      {b.broker_code}
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => router.push(`/broker/${b.sid}/edit`)}
                        className="text-white hover:text-red-400 font-semibold transition-colors"
                      >
                        {b.company_name}
                      </button>
                    </td>
                    <td className="p-3 text-slate-400">{b.broker_name}</td>
                    <td className="p-3 text-slate-400 text-xs">
                      {activeTab === "pricing" && b.pricing_email}
                      {activeTab === "daily_pricing" && b.daily_pricing_email1}
                      {activeTab === "commission" && b.commission_email}
                      {activeTab === "confirmation" && b.confirmation_email}
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

export default ViewBrokerList;
