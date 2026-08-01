import React from "react";
import Layout from "./Layout";
import SectionNav from "./SectionNav";

const LINKS = [
  { label: "Home", href: "/contracts" },
  { label: "Upload usage", href: "/contracts/upload" },
  { label: "Custom pricing confirmation", href: "/contracts/custom-pricing" },
  { label: "Send confirmation emails", href: "/contracts/send" },
  { label: "Send LMP confirmation emails", href: "/contracts/send-lmp" },
  { label: "Edit confirmations", href: "/contracts/edit" },
  { label: "View all confirmations", href: "/contracts/view" },
  { label: "User log", href: "/contracts/log" },
  { label: "Welcome letter", href: "/contracts/welcome-letter" },
  { label: "Download enrollment checks", href: "/contracts/enrollment-checks" },
  { label: "Future contracts", href: "/contracts/future-contracts" },
];

interface Props {
  children: React.ReactNode;
  title?: string;
}

export default function ContractLayout({ children, title }: Props) {
  return (
    <Layout title={title}>
      <div className="flex gap-0 -mx-6 -mt-6 min-h-full">
        <SectionNav links={LINKS} />
        <div className="flex-1 p-6 min-w-0">{children}</div>
      </div>
    </Layout>
  );
}
