import React from "react";
import Layout from "./Layout";
import { useRouter } from "next/router";
import Link from "next/link";

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
  const router = useRouter();

  return (
    <Layout title={title}>
      <div className="flex gap-0 -mx-4 -mt-6">
        {/* Sidebar */}
        <aside className="w-52 min-h-screen bg-white border-r border-gray-200 pt-4 flex-shrink-0">
          {LINKS.map((item) => {
            const active = router.pathname === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm transition-colors cursor-pointer ${
                    active
                      ? "bg-green-600 text-white font-medium"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      active ? "bg-white" : "bg-gray-400"
                    }`}
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
