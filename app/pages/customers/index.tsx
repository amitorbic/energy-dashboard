import { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import { useRouter } from "next/router";
import api from "../../utils/api";

interface Stats {
  expiringSoon: number | null;
  expired: number | null;
}

const CustomersIndex = () => {
  const router = useRouter();
  const [stats, setStats] = useState<Stats>({ expiringSoon: null, expired: null });

  useEffect(() => {
    api.get("/contract-renewal/list").then((res) => {
      const rows: { contract_end_date?: string }[] = res.data.rows ?? res.data ?? [];
      const today = Date.now();
      let expiringSoon = 0;
      let expired = 0;
      for (const r of rows) {
        if (!r.contract_end_date) continue;
        const diff = Math.round(
          (new Date(r.contract_end_date).getTime() - today) / 86400000
        );
        if (diff < 0) expired++;
        else if (diff <= 60) expiringSoon++;
      }
      setStats({ expiringSoon, expired });
    });
  }, []);

  const staticCards = [
    {
      title: "Upload renewal data",
      description:
        "Import contract renewal CSV to refresh customer end dates, rates, usage and broker info.",
      action: "Upload file →",
      route: "/customers/renewal-upload",
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
      ),
      accent: "border-amber-600/40 hover:border-amber-500",
      iconBg: "bg-amber-900/40 text-amber-400",
      actionColor: "text-amber-400 group-hover:text-amber-300",
    },
    {
      title: "View renewal data",
      description:
        "Browse all active customers — end dates, contract rates, usage volumes and expiry status.",
      action: "View records →",
      route: "/customers/renewal-view",
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
      accent: "border-blue-600/40 hover:border-blue-500",
      iconBg: "bg-blue-900/40 text-blue-400",
      actionColor: "text-blue-400 group-hover:text-blue-300",
    },
  ];

  return (
    <Layout title="Customer Database">
      <div className="max-w-4xl mx-auto p-6 space-y-8">
        {/* Header */}
        <div className="border-b border-slate-800 pb-6">
          <h1 className="text-3xl font-black text-white uppercase tracking-tighter">
            Customer Database
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Manage renewal contracts and customer data
          </p>
        </div>

        {/* Static cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {staticCards.map((card) => (
            <button
              key={card.route}
              onClick={() => router.push(card.route)}
              className={`group bg-slate-900 border-2 rounded-xl p-6 text-left transition-all duration-200 ${card.accent} hover:bg-slate-800/60`}
            >
              <div className={`w-11 h-11 rounded-lg flex items-center justify-center mb-4 ${card.iconBg}`}>
                {card.icon}
              </div>
              <p className="text-white font-bold text-base mb-1">{card.title}</p>
              <p className="text-slate-400 text-sm leading-relaxed mb-4">
                {card.description}
              </p>
              <span className={`text-sm font-semibold transition-colors ${card.actionColor}`}>
                {card.action}
              </span>
            </button>
          ))}
        </div>

        {/* Expiry stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <button
            onClick={() => router.push("/customers/renewal-view?filter=expiring")}
            className="group bg-slate-900 border-2 border-yellow-600/40 hover:border-yellow-500 rounded-xl p-6 text-left transition-all duration-200 hover:bg-slate-800/60"
          >
            <div className="w-11 h-11 rounded-lg flex items-center justify-center mb-4 bg-yellow-900/40 text-yellow-400">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex items-baseline gap-2 mb-1">
              <p className="text-white font-bold text-base">Expiring Soon</p>
              <span className="text-2xl font-black text-yellow-400 font-mono">
                {stats.expiringSoon === null ? "—" : stats.expiringSoon}
              </span>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed mb-4">
              Contracts expiring within the next 60 days that need renewal action.
            </p>
            <span className="text-sm font-semibold text-yellow-400 group-hover:text-yellow-300 transition-colors">
              View expiring →
            </span>
          </button>

          <button
            onClick={() => router.push("/customers/renewal-view?filter=expired")}
            className="group bg-slate-900 border-2 border-red-600/40 hover:border-red-500 rounded-xl p-6 text-left transition-all duration-200 hover:bg-slate-800/60"
          >
            <div className="w-11 h-11 rounded-lg flex items-center justify-center mb-4 bg-red-900/40 text-red-400">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="flex items-baseline gap-2 mb-1">
              <p className="text-white font-bold text-base">Expired</p>
              <span className="text-2xl font-black text-red-400 font-mono">
                {stats.expired === null ? "—" : stats.expired}
              </span>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed mb-4">
              Contracts past their end date with no active agreement in place.
            </p>
            <span className="text-sm font-semibold text-red-400 group-hover:text-red-300 transition-colors">
              View expired →
            </span>
          </button>
        </div>
      </div>
    </Layout>
  );
};

export default CustomersIndex;
