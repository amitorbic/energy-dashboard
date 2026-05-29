import React from "react";
import Layout from "../../components/Layout";
import { useRouter } from "next/router";

const modules = [
  {
    label: "Daily Matrix — Commercial",
    href: "/pricing/daily_matrix_commercial",
    icon: "📊",
  },
  {
    label: "Daily Matrix — Residential",
    href: "/pricing/daily_matrix_residential",
    icon: "🏠",
  },
  { label: "Gas Strip", href: "/pricing/gas-strip", icon: "⛽" },
  { label: "Heat Rate", href: "/pricing/heat-rate", icon: "🔥" },
  { label: "Consumption", href: "/pricing/consumption", icon: "📈" },
  { label: "Margin", href: "/pricing/margin", icon: "💹" },
  { label: "TDSP", href: "/pricing/tdsp", icon: "🔌" },
  { label: "Supplier", href: "/pricing/supplier", icon: "🏭" },
  { label: "Send Pricing Emails", href: "/pricing/email", icon: "📧" },
];

const DailyPricingHome = () => {
  const router = useRouter();

  return (
    <Layout title="Daily Pricing">
      <div className="max-w-5xl mx-auto p-6 space-y-8">
        <header className="border-b border-slate-800 pb-6">
          <h1 className="text-3xl font-black text-white uppercase tracking-tighter">
            Daily Pricing
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Manage pricing data and view daily matrices
          </p>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {modules.map((m) => (
            <div
              key={m.href}
              onClick={() => router.push(m.href)}
              className="bg-slate-800 rounded-lg p-6 space-y-3 border border-slate-700 hover:border-red-500 transition-colors cursor-pointer"
            >
              <div className="text-2xl">{m.icon}</div>
              <h2 className="text-white font-bold text-sm">{m.label}</h2>
              <span className="text-red-400 text-xs font-bold">Open →</span>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
};

export default DailyPricingHome;
