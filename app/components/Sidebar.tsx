"use client";
import Link from "next/link";
import { useRouter } from "next/router";
import { User } from "../utils/auth";

export interface NavItem {
  label: string;
  href?: string;
  soon?: boolean;
}

export interface NavSection {
  label: string;
  items: NavItem[];
  adminOnly?: boolean;
}

export const SECTIONS: NavSection[] = [
  {
    label: "Sales",
    items: [
      { label: "Pricing", href: "/pricing" },
      { label: "ESI ID Search", href: "/esi-search" },
      { label: "Daily Pricing", href: "/daily-pricing" },
      { label: "Document Parser", href: "/document-parser" },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Contracts", href: "/contracts" },
      { label: "Enrollment", href: "/enrollment" },
      { label: "Billing", href: "/billing" },
      { label: "Payments", soon: true },
      { label: "Commission", href: "/commission" },
      { label: "Past Due", href: "/past-due" },
    ],
  },
  {
    label: "Portfolio",
    items: [
      { label: "Portfolio", href: "/portfolio" },
      { label: "MTM", href: "/portfolio/mtm" },
    ],
  },
  {
    label: "Reports",
    items: [{ label: "Reports", soon: true }],
  },
  {
    label: "Audit",
    items: [
      { label: "Enrollment Audit", href: "/enrollment-audit" },
      { label: "Billing Audit", href: "/billing-audit" },
      { label: "Payment Audit", href: "/payments" },
    ],
  },
  {
    label: "Customers",
    items: [{ label: "Customers", href: "/customers" }],
  },
  {
    label: "Broker",
    items: [{ label: "Broker", href: "/broker" }],
  },
  {
    label: "Admin",
    items: [{ label: "Admin", href: "/admin" }],
    adminOnly: true,
  },
];

const ICONS: Record<string, React.ReactNode> = {
  Pricing: (
    <path d="M1.5 12 5 7l3 3 5-6" />
  ),
  "ESI ID Search": (
    <>
      <circle cx="6.5" cy="6.5" r="4.5" />
      <path d="M13 13l-3.5-3.5" />
    </>
  ),
  "Daily Pricing": <path d="M2 13V9M6 13V6M10 13V3M2 13h11" />,
  "Document Parser": (
    <>
      <path d="M2 3h11v9H2z" />
      <path d="M2 5.5h11M5 3v9" />
    </>
  ),
  Contracts: <path d="M2 5h11M2 7.5h11M2 10h7" />,
  Enrollment: <path d="M7.5 1.5 13 3.5v4c0 3.5-2.3 5.7-5.5 7-3.2-1.3-5.5-3.5-5.5-7v-4z" />,
  Billing: (
    <>
      <rect x="1.5" y="3" width="12" height="9" rx="1.2" />
      <path d="M1.5 6h12" />
    </>
  ),
  Payments: (
    <>
      <rect x="2" y="1.5" width="11" height="12" rx="1.2" />
      <path d="M4.5 5h6M4.5 7.5h6M4.5 10h3.5" />
    </>
  ),
  Commission: (
    <>
      <path d="M2 12V7l5.5-5 5.5 5v5" />
      <path d="M6 12V8h3v4" />
    </>
  ),
  "Past Due": <path d="M7.5 1v13M2 6l5.5-5 5.5 5" />,
  Portfolio: <rect x="1.5" y="5" width="12" height="8" rx="1" />,
  MTM: <path d="M1.5 12 5 7l3 3 5.5-6.5M9.5 3.5h4v4" />,
  Reports: <path d="M2 13V2M2 13h11" />,
  "Enrollment Audit": <path d="M7.5 1.5 13 3.5v4c0 3.5-2.3 5.7-5.5 7-3.2-1.3-5.5-3.5-5.5-7v-4z" />,
  "Billing Audit": <path d="M7.5 1.5 13 3.5v4c0 3.5-2.3 5.7-5.5 7-3.2-1.3-5.5-3.5-5.5-7v-4z" />,
  "Payment Audit": <path d="M7.5 1.5 13 3.5v4c0 3.5-2.3 5.7-5.5 7-3.2-1.3-5.5-3.5-5.5-7v-4z" />,
  Customers: <circle cx="7.5" cy="4.5" r="2.5" />,
  Broker: (
    <>
      <circle cx="4.5" cy="5" r="2" />
      <circle cx="10.5" cy="5" r="2" />
    </>
  ),
  Admin: <circle cx="7.5" cy="7.5" r="1.8" />,
};

function isItemActive(pathname: string, href?: string) {
  if (!href) return false;
  return pathname === href || pathname.startsWith(href + "/");
}

interface Props {
  user: User | null;
  onLogout: () => void;
}

export default function Sidebar({ user, onLogout }: Props) {
  const router = useRouter();
  const isAdmin = user?.role === "1";

  return (
    <nav
      className="w-[232px] shrink-0 sticky top-0 flex flex-col h-screen overflow-y-auto"
      style={{
        background: "var(--sb-canvas)",
        borderRight: "1px solid var(--sb-border-strong)",
        color: "var(--sb-text-primary)",
      }}
      aria-label="Primary navigation"
    >
      <Link
        href="/"
        className="flex items-center gap-2.5 px-4 pb-3.5 mb-1.5 shrink-0"
        style={{ borderBottom: "1px solid var(--sb-border-subtle)" }}
      >
        <svg width="19" height="19" viewBox="0 0 20 20" fill="none">
          <path d="M11 1 3 11h5l-2 8 9-11h-6l2-7Z" fill="var(--accent-dark)" />
        </svg>
        <div>
          <div className="font-bold text-[13.5px] leading-tight">ORBIC</div>
          <div
            className="text-[9.5px] uppercase tracking-wide mt-0.5"
            style={{ color: "var(--sb-text-muted)" }}
          >
            Energy Intelligence
          </div>
        </div>
      </Link>

      <div className="flex-1">
        {SECTIONS.filter((s) => !s.adminOnly || isAdmin).map((section) => (
          <div key={section.label} className="mt-2">
            <div
              className="text-[9.5px] font-semibold uppercase tracking-wider px-4 pt-1 pb-1"
              style={{ color: "var(--sb-text-muted)", letterSpacing: ".08em" }}
            >
              {section.label}
            </div>
            {section.items.map((item) => {
              const active = isItemActive(router.pathname, item.href);
              const icon = ICONS[item.label];
              const content = (
                <>
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 15 15"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    className="shrink-0 opacity-85"
                  >
                    {icon}
                  </svg>
                  <span>{item.label}</span>
                  {item.soon && (
                    <span
                      className="ml-auto text-[8px] font-bold tracking-wide px-1.5 py-0.5 rounded-full"
                      style={{
                        background: "var(--sb-surface-hover)",
                        color: "var(--sb-text-muted)",
                      }}
                    >
                      Soon
                    </span>
                  )}
                </>
              );
              const className = "flex items-center gap-2 px-4 py-[6.5px] text-[12.5px] border-l-2";
              const style = active
                ? {
                    background: "var(--accent-dark-tint)",
                    color: "var(--sb-text-primary)",
                    borderLeftColor: "var(--accent-dark)",
                    fontWeight: 600,
                  }
                : {
                    color: item.soon ? "var(--sb-text-muted)" : "var(--sb-text-secondary)",
                    borderLeftColor: "transparent",
                  };
              if (item.soon || !item.href) {
                return (
                  <div key={item.label} className={className} style={style}>
                    {content}
                  </div>
                );
              }
              return (
                <Link key={item.href} href={item.href} className={className} style={style}>
                  {content}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      {user && (
        <div
          className="px-4 py-3 text-[11px] shrink-0"
          style={{ borderTop: "1px solid var(--sb-border-subtle)" }}
        >
          <div style={{ color: "var(--sb-text-secondary)" }}>{user.username}</div>
          <button
            onClick={onLogout}
            className="mt-1.5 text-[11px] transition-colors"
            style={{ color: "var(--sb-text-muted)" }}
          >
            Log out
          </button>
        </div>
      )}
    </nav>
  );
}
