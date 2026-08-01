import React from "react";
import Layout from "./Layout";
import SectionNav, { SectionNavLink } from "./SectionNav";

const LINKS: SectionNavLink[] = [
  { label: "Update Data", href: "/commission/upload" },
  { label: "View Data", href: "/commission/view" },
  { label: "Commission Exceptions", href: "/commission/exceptions" },
  { label: "Delete Data", href: "/commission/delete" },
  { label: "Insert Payments", href: "/commission/payments" },
  { label: "Adjustments", href: "/commission/adjustments" },
  { label: "Review Summary", href: "/commission/summary" },
  { label: "Calculate Commission", href: "/commission/calculate" },
  { label: "Upload Files for Brokers", href: "/commission/broker-files", comingSoon: true },
  { label: "Upfront History",          href: "/commission/upfront",      comingSoon: true },
  { label: "Modify Email List",        href: "/commission/email-list",   comingSoon: true },
  { label: "Email Log",                href: "/commission/email-log",    comingSoon: true },
  { label: "User Log", href: "/commission/user-log" },
  { label: "Download Commission Files", href: "/commission/download" },
  { label: "Email Commission Files", href: "/commission/email-commission" },
];

interface Props {
  children: React.ReactNode;
  title?: string;
}

export default function CommissionLayout({ children, title }: Props) {
  return (
    <Layout title={title}>
      <div className="flex gap-0 -mx-6 -mt-6 min-h-full">
        <SectionNav links={LINKS} />
        <div className="flex-1 p-6 min-w-0">{children}</div>
      </div>
    </Layout>
  );
}
