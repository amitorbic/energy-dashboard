import React from "react";
import Layout from "./Layout";
import { useRouter } from "next/router";
import Link from "next/link";

const LINKS = [
  { label: "Upload EDI Files", href: "/billing/upload" },
  { label: "Review",           href: "/billing/review" },
  { label: "Billing Periods",  href: "/billing/periods" },
  { label: "Charge Mappings",  href: "/billing/charge-mappings" },
  { label: "Invoices",         href: "/billing/invoices" },
];

interface Props {
  children: React.ReactNode;
  title?: string;
}

export default function BillingEngineLayout({ children, title }: Props) {
  const router = useRouter();

  return (
    <Layout title={title}>
      <div className="flex gap-0 -mx-4 -mt-6">
        {/* Sidebar */}
        <aside className="w-52 min-h-screen bg-white border-r border-gray-200 pt-4 flex-shrink-0">
          {LINKS.map((item) => {
            const active =
              router.pathname === item.href ||
              (item.href !== "/billing/upload" &&
                router.pathname.startsWith(item.href));
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
