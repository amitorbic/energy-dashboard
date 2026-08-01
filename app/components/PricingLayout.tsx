import React from "react";
import Layout from "./Layout";
import SectionNav from "./SectionNav";

const LINKS = [
  { label: "Custom Pricing", href: "/custom_pricing" },
  { label: "Send Pricing Email", href: "/pricing/email" },
];

interface Props {
  children: React.ReactNode;
  title?: string;
}

export default function PricingLayout({ children, title }: Props) {
  return (
    <Layout title={title}>
      <div className="flex gap-0 -mx-6 -mt-6 min-h-full">
        <SectionNav links={LINKS} />
        <div className="flex-1 p-6 min-w-0">{children}</div>
      </div>
    </Layout>
  );
}
