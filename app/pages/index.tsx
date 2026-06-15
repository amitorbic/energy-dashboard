import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { getUser, isLoggedIn, User } from "../utils/auth";

const MODULES = [
  {
    label: "Pricing",
    href: "/pricing",
    description: "Weighted average pricing, custom pricing, blend & extend",
    icon: "📊",
    color: "sky",
  },
  {
    label: "Broker Database",
    href: "/broker",
    description: "Manage broker accounts, commissions and status",
    icon: "🤝",
    color: "violet",
  },
  {
    label: "Customer Database",
    href: "/customers",
    description: "Customer accounts, ESI IDs and contract details",
    icon: "👥",
    color: "emerald",
  },
  {
    label: "Daily Pricing",
    href: "/daily-pricing",
    description: "ERCOT real-time pricing, day-ahead data",
    icon: "⚡",
    color: "amber",
  },
  {
    label: "Contract Confirmation",
    href: "/contracts",
    description: "Enrollment confirmations and contract management",
    icon: "📋",
    color: "blue",
  },
  {
    label: "Billing",
    href: "/billing",
    description: "Invoice generation, billing cycles and usage data",
    icon: "🧾",
    color: "teal",
  },
  {
    label: "Payments",
    href: "/payments",
    description: "Payment ledger, sheet uploads, ETF tracking and bounced ACH",
    icon: "💳",
    color: "indigo",
  },
  {
    label: "Past Due Portal",
    href: "/past-due",
    description: "Overdue accounts, deposits and collections",
    icon: "⚠️",
    color: "red",
  },
  {
    label: "Commission Data",
    href: "/commission",
    description: "Broker commissions, payments and adjustments",
    icon: "💰",
    color: "green",
  },
  {
    label: "Document Parser",
    href: "/document-parser",
    description: "Extract data from utility bills and contracts using AI Vision",
    icon: "🔍",
    color: "purple",
  },
];

const COLOR_MAP: Record<string, string> = {
  sky: "border-sky-500/30 hover:border-sky-500 bg-sky-500/5 hover:bg-sky-500/10",
  violet:
    "border-violet-500/30 hover:border-violet-500 bg-violet-500/5 hover:bg-violet-500/10",
  emerald:
    "border-emerald-500/30 hover:border-emerald-500 bg-emerald-500/5 hover:bg-emerald-500/10",
  amber:
    "border-amber-500/30 hover:border-amber-500 bg-amber-500/5 hover:bg-amber-500/10",
  blue: "border-blue-500/30 hover:border-blue-500 bg-blue-500/5 hover:bg-blue-500/10",
  teal: "border-teal-500/30 hover:border-teal-500 bg-teal-500/5 hover:bg-teal-500/10",
  indigo:
    "border-indigo-500/30 hover:border-indigo-500 bg-indigo-500/5 hover:bg-indigo-500/10",
  red: "border-red-500/30 hover:border-red-500 bg-red-500/5 hover:bg-red-500/10",
  green:
    "border-green-500/30 hover:border-green-500 bg-green-500/5 hover:bg-green-500/10",
  purple:
    "border-purple-500/30 hover:border-purple-500 bg-purple-500/5 hover:bg-purple-500/10",
};

const ICON_COLOR: Record<string, string> = {
  sky: "text-sky-400",
  violet: "text-violet-400",
  emerald: "text-emerald-400",
  amber: "text-amber-400",
  blue: "text-blue-400",
  teal: "text-teal-400",
  indigo: "text-indigo-400",
  red: "text-red-400",
  green: "text-green-400",
  purple: "text-purple-400",
};

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push("/login");
      return;
    }
    setUser(getUser());
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("ap_token");
    localStorage.removeItem("ap_user");
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Background grid */}
      <div className="fixed inset-0 bg-[linear-gradient(rgba(56,189,248,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(56,189,248,0.02)_1px,transparent_1px)] bg-[size:48px_48px] pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 border-b border-slate-800 bg-slate-900/90 backdrop-blur-sm">
        <div className="max-w-screen-xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-lg text-white tracking-tight">
            <span className="text-sky-400">⚡</span>
            <span className="text-sky-400">ORBIC</span>
            <span className="text-slate-600 font-normal text-sm ml-1">
              Internal
            </span>
          </div>
          <div className="flex items-center gap-4">
            {user && (
              <span className="text-slate-400 text-sm">
                {user.username}
                <span className="ml-2 text-xs bg-slate-800 border border-slate-700 px-2 py-0.5 rounded text-slate-500">
                  {user.role === "1"
                    ? "Admin"
                    : user.role === "2"
                      ? "Manager"
                      : "User"}
                </span>
              </span>
            )}
            <button
              onClick={handleLogout}
              className="text-sm text-slate-500 hover:text-white border border-slate-700 hover:border-slate-500 px-3 py-1.5 rounded transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 max-w-screen-xl mx-auto px-6 py-10">
        {/* Welcome */}
        <div className="mb-10">
          <h1 className="text-2xl font-bold text-white mb-1">
            Welcome back{user ? `, ${user.username}` : ""}
          </h1>
          <p className="text-slate-400 text-sm">
            ORBIC Energy Intelligence Platform — Texas ERCOT Market
          </p>
        </div>

        {/* Orbi AI Agent */}
        <Link
          href="/agent"
          className="group flex items-center gap-5 border border-blue-500/30 hover:border-blue-500 bg-blue-500/5 hover:bg-blue-500/10 rounded-xl p-5 mb-8 transition-all duration-200"
        >
          <div className="text-3xl shrink-0">✨</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-white font-semibold text-sm">Orbi — AI Agent</h3>
              <span className="text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full font-medium">
                New
              </span>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed">
              Ask Orbi about customers, contracts, pricing, portfolio data, past-due accounts, and more. Full-page chat with sortable tables and quick actions.
            </p>
          </div>
          <div className="text-xs font-medium text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            Open Orbi →
          </div>
        </Link>

        {/* Module grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {MODULES.map((mod) => (
            <Link
              key={mod.href}
              href={mod.href}
              className={`group block border rounded-xl p-5 transition-all duration-200 cursor-pointer ${COLOR_MAP[mod.color]}`}
            >
              <div className={`text-2xl mb-3 ${ICON_COLOR[mod.color]}`}>
                {mod.icon}
              </div>
              <h3 className="text-white font-semibold text-sm mb-1">
                {mod.label}
              </h3>
              <p className="text-slate-400 text-xs leading-relaxed">
                {mod.description}
              </p>
              <div
                className={`mt-4 text-xs font-medium ${ICON_COLOR[mod.color]} opacity-0 group-hover:opacity-100 transition-opacity`}
              >
                Open module →
              </div>
            </Link>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-16 pt-6 border-t border-slate-800 text-center text-slate-600 text-xs">
          ORBIC Internal Applications · ERCOT Texas Market
        </div>
      </main>
    </div>
  );
}
