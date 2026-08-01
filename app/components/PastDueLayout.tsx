import React from "react";
import Layout from "./Layout";
import SectionNav, { SectionNavLink } from "./SectionNav";
import { useRouter } from "next/router";

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

  const LINKS: SectionNavLink[] = [
    { label: "Dashboard", href: "/past-due", active: isActive("/past-due") },
    { label: "Active Accounts", href: "/past-due?track=ACTIVE", active: isActive("/past-due?track=ACTIVE") },
    { label: "Inactive / Collections", href: "/past-due?track=INACTIVE", active: isActive("/past-due?track=INACTIVE") },
    { label: "Approval Queue", href: "/past-due/approvals" },
    { label: "Import AR Sheet", href: "/past-due/upload" },
    { label: "ARR Exposure", href: "/past-due/reports/arr", comingSoon: true },
    { label: "Aging Report", href: "/past-due/reports/aging", comingSoon: true },
    { label: "ETF Open", href: "/past-due/reports/etf", comingSoon: true },
  ];

  return (
    <Layout title={title}>
      <div className="flex gap-0 -mx-6 -mt-6 min-h-full">
        <SectionNav links={LINKS} title="Past Due Portal" />
        <div className="flex-1 p-6 min-w-0">{children}</div>
      </div>
    </Layout>
  );
}
