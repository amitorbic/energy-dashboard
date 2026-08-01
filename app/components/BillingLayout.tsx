import React from "react";
import Layout from "./Layout";
import SectionNav from "./SectionNav";

const LINKS = [
  { label: "Upload Billing File", href: "/billing-audit/upload" },
  { label: "View Billing Exceptions", href: "/billing-audit/exceptions" },
  { label: "View Last Exceptions", href: "/billing-audit/exceptions/last" },
  { label: "PHP ↔ Python Test", href: "/billing-audit/exception-test" },
  { label: "Email Recipients", href: "/billing-audit/recipients" },
];

interface Props {
  children: React.ReactNode;
  title?: string;
}

export default function BillingLayout({ children, title }: Props) {
  return (
    <Layout title={title}>
      <div className="flex gap-0 -mx-6 -mt-6 min-h-full">
        <SectionNav links={LINKS} />
        <div className="flex-1 p-6 min-w-0">{children}</div>
      </div>
    </Layout>
  );
}
