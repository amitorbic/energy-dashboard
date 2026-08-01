import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { getUser, isAdmin, isLoggedIn, User } from "../utils/auth";

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

// All modules share one accent (--accent-dark) for border/bg/icon color so the
// grid reads as one consistent system rather than a per-card rainbow; the
// `color` field on each module is now unused for styling but left in place
// since it's still passed through unchanged elsewhere in this file's data shape.
const CARD_CLASS =
  "border-[var(--sb-border-default)] hover:border-[var(--accent-dark)] bg-[var(--sb-surface)] hover:bg-[var(--sb-surface-hover)]";
const ICON_CLASS = "text-[var(--accent-dark)]";

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
    <div className="min-h-screen" style={{ background: "var(--sb-canvas)" }}>
      {/* Background grid */}
      <div className="fixed inset-0 bg-[linear-gradient(rgba(38,198,217,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(38,198,217,0.02)_1px,transparent_1px)] bg-[size:48px_48px] pointer-events-none" />

      {/* Header */}
      <header
        className="relative z-10 border-b backdrop-blur-sm"
        style={{ borderColor: "var(--sb-border-subtle)", background: "color-mix(in srgb, var(--sb-canvas) 90%, transparent)" }}
      >
        <div className="max-w-screen-xl mx-auto px-6 h-14 flex items-center justify-between">
          <div
            className="flex items-center gap-2 font-bold text-lg tracking-tight"
            style={{ color: "var(--sb-text-primary)" }}
          >
            <span style={{ color: "var(--accent-dark)" }}>⚡</span>
            <span style={{ color: "var(--accent-dark)" }}>ORBIC</span>
            <span className="font-normal text-sm ml-1" style={{ color: "var(--sb-text-muted)" }}>
              Internal
            </span>
          </div>
          <div className="flex items-center gap-4">
            {user && (
              <span className="text-sm" style={{ color: "var(--sb-text-secondary)" }}>
                {user.username}
                <span
                  className="ml-2 text-xs border px-2 py-0.5 rounded-[var(--r-sm)]"
                  style={{
                    background: "var(--sb-surface)",
                    borderColor: "var(--sb-border-default)",
                    color: "var(--sb-text-muted)",
                  }}
                >
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
              className="text-sm border px-3 py-1.5 rounded-[var(--r-sm)] transition-colors"
              style={{ color: "var(--sb-text-muted)", borderColor: "var(--sb-border-default)" }}
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
          <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--sb-text-primary)" }}>
            Welcome back{user ? `, ${user.username}` : ""}
          </h1>
          <p className="text-sm" style={{ color: "var(--sb-text-secondary)" }}>
            ORBIC Energy Intelligence Platform — Texas ERCOT Market
          </p>
        </div>

        {/* Orbi AI Agent */}
        <Link
          href="/agent"
          className="group flex items-center gap-5 border rounded-[var(--r-lg)] p-5 mb-8 transition-all duration-200 hover:border-[var(--accent-dark)]"
          style={{ borderColor: "var(--sb-border-default)", background: "var(--sb-surface)" }}
        >
          <div className="text-3xl shrink-0">✨</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-sm" style={{ color: "var(--sb-text-primary)" }}>
                Orbi — AI Agent
              </h3>
              <span
                className="text-xs border px-2 py-0.5 rounded-[var(--r-full)] font-medium"
                style={{
                  background: "var(--accent-dark-tint)",
                  color: "var(--accent-dark)",
                  borderColor: "var(--accent-dark)",
                }}
              >
                New
              </span>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: "var(--sb-text-secondary)" }}>
              Ask Orbi about customers, contracts, pricing, portfolio data, past-due accounts, and more. Full-page chat with sortable tables and quick actions.
            </p>
          </div>
          <div
            className="text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            style={{ color: "var(--accent-dark)" }}
          >
            Open Orbi →
          </div>
        </Link>

        {/* Module grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {MODULES.map((mod) => (
            <Link
              key={mod.href}
              href={mod.href}
              className={`group block border rounded-[var(--r-lg)] p-5 transition-all duration-200 cursor-pointer ${CARD_CLASS}`}
            >
              <div className={`text-2xl mb-3 ${ICON_CLASS}`}>
                {mod.icon}
              </div>
              <h3 className="font-semibold text-sm mb-1" style={{ color: "var(--sb-text-primary)" }}>
                {mod.label}
              </h3>
              <p className="text-xs leading-relaxed" style={{ color: "var(--sb-text-secondary)" }}>
                {mod.description}
              </p>
              <div
                className={`mt-4 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity ${ICON_CLASS}`}
              >
                Open module →
              </div>
            </Link>
          ))}
        </div>

        {/* Admin section — visible to role=1 only */}
        {user && isAdmin() && (
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-3">
              <span
                className="text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: "var(--danger-dark)" }}
              >
                Admin
              </span>
              <div className="flex-1 h-px" style={{ background: "var(--danger-dark-tint)" }} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              <Link
                href="/admin/addon-charge-types"
                className="group block border rounded-[var(--r-lg)] p-5 transition-all duration-200 hover:border-[var(--danger-dark)]"
                style={{ borderColor: "var(--danger-dark-tint)", background: "var(--sb-surface)" }}
              >
                <div className="text-2xl mb-3" style={{ color: "var(--danger-dark)" }}>⚙</div>
                <h3 className="font-semibold text-sm mb-1" style={{ color: "var(--sb-text-primary)" }}>
                  Addon Charge Types
                </h3>
                <p className="text-xs leading-relaxed" style={{ color: "var(--sb-text-secondary)" }}>
                  Manage supplier addon charge definitions and effective-dated rate history (ANCSVC, LINELOSS, etc.)
                </p>
                <div
                  className="mt-4 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: "var(--danger-dark)" }}
                >
                  Open admin →
                </div>
              </Link>
              <Link
                href="/admin/test-data-generator"
                className="group block border rounded-[var(--r-lg)] p-5 transition-all duration-200 hover:border-[var(--danger-dark)]"
                style={{ borderColor: "var(--danger-dark-tint)", background: "var(--sb-surface)" }}
              >
                <div className="text-2xl mb-3" style={{ color: "var(--danger-dark)" }}>🧪</div>
                <h3 className="font-semibold text-sm mb-1" style={{ color: "var(--sb-text-primary)" }}>
                  Test Data Generator
                </h3>
                <p className="text-xs leading-relaxed" style={{ color: "var(--sb-text-secondary)" }}>
                  Generate synthetic 867/810 EDI files for a set of ESI IDs, for testing billing and enrollment flows.
                </p>
                <div
                  className="mt-4 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: "var(--danger-dark)" }}
                >
                  Open admin →
                </div>
              </Link>
            </div>
          </div>
        )}

        {/* Footer */}
        <div
          className="mt-16 pt-6 border-t text-center text-xs"
          style={{ borderColor: "var(--sb-border-subtle)", color: "var(--sb-text-muted)" }}
        >
          ORBIC Internal Applications · ERCOT Texas Market
        </div>
      </main>
    </div>
  );
}
