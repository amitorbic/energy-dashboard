import React from "react";
import Layout from "./Layout";
import { useRouter } from "next/router";
import Link from "next/link";

const LINKS = [
  { label: "Dashboard", href: "/past-due" },
  { label: "Active Accounts", href: "/past-due?track=ACTIVE" },
  { label: "Inactive / Collections", href: "/past-due?track=INACTIVE" },
  { label: "Approval Queue", href: "/past-due/approvals" },
  { label: "Import AR Sheet", href: "/past-due/upload" },
  { label: "ARR Exposure", href: "/past-due/reports/arr" },
  { label: "Aging Report", href: "/past-due/reports/aging" },
  { label: "ETF Open", href: "/past-due/reports/etf" },
];

interface Props {
  children: React.ReactNode;
  title?: string;
}

export default function PastDueLayout({ children, title }: Props) {
  const router = useRouter();

  const isActive = (href: string) => {
    if (href === "/past-due")
      return router.pathname === "/past-due" && !router.query.track;
    if (href.includes("?track=")) {
      return (
        router.pathname === "/past-due" &&
        router.query.track === href.split("=")[1]
      );
    }
    return router.pathname === href;
  };

  return (
    <Layout title={title}>
      <div className="flex gap-0 -mx-4 -mt-6">
        {/* Sidebar */}
        <aside className="w-52 min-h-screen bg-white border-r border-gray-200 pt-4 flex-shrink-0">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 mb-2">
            Past Due Portal
          </p>
          {LINKS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm transition-colors cursor-pointer
                  ${
                    active
                      ? "bg-sky-600 text-white font-medium"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${active ? "bg-white" : "bg-gray-400"}`}
                  />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </aside>

        {/* Page content */}
        <div className="flex-1 p-6 min-w-0">{children}</div>
      </div>
    </Layout>
  );
}
