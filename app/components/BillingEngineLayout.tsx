import React from "react";
import Layout from "./Layout";
import SectionNav from "./SectionNav";

const LINKS = [
  { label: "Upload EDI Files", href: "/billing/upload" },
  { label: "Review",           href: "/billing/review" },
  { label: "Billing Periods",  href: "/billing/periods" },
  { label: "Charge Mappings",  href: "/billing/charge-mappings" },
  { label: "Invoices",         href: "/billing/invoices" },
  { label: "Revert",           href: "/billing/revert" },
  { label: "Unpost",           href: "/billing/unpost" },
];

interface Props {
  children: React.ReactNode;
  title?: string;
}

export default function BillingEngineLayout({ children, title }: Props) {
  return (
    <Layout title={title}>
      <div className="flex gap-0 -mx-6 -mt-6 min-h-full">
        <SectionNav links={LINKS} />
        <div className="flex-1 p-6 min-w-0">{children}</div>
      </div>
    </Layout>
  );
}
