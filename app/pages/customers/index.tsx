import React from "react";
import Layout from "../../components/Layout";
import { useRouter } from "next/router";

const cards = [
  {
    title: "Upload renewal data",
    description:
      "Import contract renewal CSV to refresh customer end dates, rates, usage and broker info.",
    action: "Upload file →",
    route: "/customers/renewal-upload",
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
        />
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
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
        />
      </svg>
    ),
    accent: "border-blue-600/40 hover:border-blue-500",
    iconBg: "bg-blue-900/40 text-blue-400",
    actionColor: "text-blue-400 group-hover:text-blue-300",
  },
];

const CustomersIndex = () => {
  const router = useRouter();

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

        {/* Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {cards.map((card) => (
            <button
              key={card.route}
              onClick={() => router.push(card.route)}
              className={`group bg-slate-900 border-2 rounded-xl p-6 text-left transition-all duration-200 ${card.accent} hover:bg-slate-800/60`}
            >
              <div
                className={`w-11 h-11 rounded-lg flex items-center justify-center mb-4 ${card.iconBg}`}
              >
                {card.icon}
              </div>
              <p className="text-white font-bold text-base mb-1">
                {card.title}
              </p>
              <p className="text-slate-400 text-sm leading-relaxed mb-4">
                {card.description}
              </p>
              <span
                className={`text-sm font-semibold transition-colors ${card.actionColor}`}
              >
                {card.action}
              </span>
            </button>
          ))}
        </div>
      </div>
    </Layout>
  );
};

export default CustomersIndex;
