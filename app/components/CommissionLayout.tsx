import React from "react";
import Layout from "./Layout";
import { useRouter } from "next/router";
import Link from "next/link"; // Added Link import

const LINKS = [
  { label: "Update Data", href: "/commission/upload" },
  { label: "View Data", href: "/commission/view" },
  { label: "Commission Exceptions", href: "/commission/exceptions" },
  { label: "Delete Data", href: "/commission/delete" },
  { label: "Insert Payments", href: "/commission/payments" },
  { label: "Adjustments", href: "/commission/adjustments" },
  { label: "Review Summary", href: "/commission/summary" },
  { label: "Calculate Commission", href: "/commission/calculate" },
  { label: "Upload Files for Brokers", href: "/commission/broker-files" },
  { label: "Upfront History", href: "/commission/upfront" },
  { label: "Modify Email List", href: "/commission/email-list" },
  { label: "Email Log", href: "/commission/email-log" },
  { label: "User Log", href: "/commission/user-log" },
  { label: "Download Commission Files", href: "/commission/download" },
  { label: "Email Commission Files", href: "/commission/email-commission" },
];

interface Props {
  children: React.ReactNode;
  title?: string;
}

export default function CommissionLayout({ children, title }: Props) {
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
