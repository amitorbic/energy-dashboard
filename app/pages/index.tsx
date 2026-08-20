import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { getUser, isLoggedIn, User } from "../utils/auth";
import { SECTIONS } from "../components/Sidebar";

// Presentation-only metadata per segment (icon/description have no equivalent
// in Sidebar.tsx's SECTIONS, which only carries per-item nav data). Labels,
// link targets and "soon" state are all derived from SECTIONS below, not
// hand-copied, so this can't drift the way the old MODULES list did.
const SEGMENT_META: Record<string, { description: string; icon: string }> = {
  Sales: { description: "Pricing, ESI ID search, daily market data and AI document parsing", icon: "📊" },
  Operations: { description: "Contracts, enrollment, billing, commission and past-due accounts", icon: "🧾" },
  Portfolio: { description: "Portfolio management and tracking", icon: "🗂️" },
  Reports: { description: "Reporting and analytics", icon: "📈" },
  Audit: { description: "Enrollment, billing and payment audit trails", icon: "🔎" },
  Customers: { description: "Customer accounts, ESI IDs and contract details", icon: "👥" },
  Broker: { description: "Broker accounts, commissions and status", icon: "🤝" },
  Admin: { description: "Supplier data configuration and testing utilities", icon: "⚙" },
};

// One card per Sidebar.tsx SECTIONS entry, linking to that section's first
// item that has a real href (skipping "soon" placeholders) — this is what
// Pricing/Contracts/Enrollment Audit resolved to when picked by hand for
// Sales/Operations/Audit, so deriving it here reproduces the same targets.
// A section with no linkable item (e.g. Reports, entirely "soon") renders
// as a disabled card instead.
const SEGMENTS = SECTIONS.map((section) => {
  const primary = section.items.find((item) => item.href);
  const meta = SEGMENT_META[section.label];
  return {
    label: section.label,
    href: primary?.href ?? null,
    soon: !primary,
    adminOnly: section.adminOnly,
    description: meta?.description,
    icon: meta?.icon,
  };
});

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

        {/* Segment grid — one card per Sidebar.tsx SECTIONS entry */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {SEGMENTS.filter((seg) => !seg.adminOnly || user?.role === "1").map((seg) => {
            const isAdminCard = seg.label === "Admin";
            const accent = isAdminCard ? "var(--danger-dark)" : "var(--accent-dark)";
            const accentTint = isAdminCard ? "var(--danger-dark-tint)" : "var(--accent-dark-tint)";

            if (seg.soon || !seg.href) {
              return (
                <div
                  key={seg.label}
                  className="block border rounded-[var(--r-lg)] p-5 opacity-60 cursor-default"
                  style={{ borderColor: "var(--sb-border-default)", background: "var(--sb-surface)" }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="text-2xl" style={{ color: "var(--sb-text-muted)" }}>{seg.icon}</div>
                    <span
                      className="text-[8px] font-bold tracking-wide px-1.5 py-0.5 rounded-full"
                      style={{ background: "var(--sb-surface-hover)", color: "var(--sb-text-muted)" }}
                    >
                      Soon
                    </span>
                  </div>
                  <h3 className="font-semibold text-sm mb-1" style={{ color: "var(--sb-text-primary)" }}>
                    {seg.label}
                  </h3>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--sb-text-secondary)" }}>
                    {seg.description}
                  </p>
                </div>
              );
            }

            return (
              <Link
                key={seg.label}
                href={seg.href}
                className={`group block border rounded-[var(--r-lg)] p-5 transition-all duration-200 cursor-pointer ${isAdminCard ? "hover:border-[var(--danger-dark)]" : CARD_CLASS}`}
                style={isAdminCard ? { borderColor: accentTint, background: "var(--sb-surface)" } : undefined}
              >
                <div className={isAdminCard ? "text-2xl mb-3" : `text-2xl mb-3 ${ICON_CLASS}`} style={isAdminCard ? { color: accent } : undefined}>
                  {seg.icon}
                </div>
                <h3 className="font-semibold text-sm mb-1" style={{ color: "var(--sb-text-primary)" }}>
                  {seg.label}
                </h3>
                <p className="text-xs leading-relaxed" style={{ color: "var(--sb-text-secondary)" }}>
                  {seg.description}
                </p>
                <div
                  className="mt-4 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: accent }}
                >
                  Open {seg.label.toLowerCase()} →
                </div>
              </Link>
            );
          })}
        </div>

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
