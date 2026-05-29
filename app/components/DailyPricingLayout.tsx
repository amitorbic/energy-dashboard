import React from "react";
import Layout from "./Layout";
import { useRouter } from "next/router";
import Link from "next/link";

const LINKS = [
  { label: "Home", href: "/daily-pricing" },
  {
    label: "Daily Matrix — Commercial",
    href: "/pricing/daily_matrix_commercial",
  },
  {
    label: "Daily Matrix — Residential",
    href: "/pricing/daily_matrix_residential",
  },
  { label: "Gas Strip", href: "/pricing/gas-strip" },
  { label: "Heat Rate", href: "/pricing/heat-rate" },
  { label: "Consumption", href: "/pricing/consumption" },
  { label: "Margin", href: "/pricing/margin" },
  { label: "TDSP", href: "/pricing/tdsp" },
  { label: "Supplier", href: "/pricing/supplier" },
  { label: "Send Pricing Email", href: "/pricing/email" },
];

interface Props {
  children: React.ReactNode;
  title?: string;
}

export default function DailyPricingLayout({ children, title }: Props) {
  const router = useRouter();

  return (
    <Layout title={title}>
      <div className="flex gap-0 -mx-4 -mt-6">
        <aside className="w-52 min-h-screen bg-white border-r border-gray-200 pt-4 flex-shrink-0">
          {LINKS.map((item) => {
            const active = router.pathname === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm transition-colors cursor-pointer ${
                    active
                      ? "bg-red-600 text-white font-medium"
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
        <div className="flex-1 p-6 min-w-0">{children}</div>
      </div>
    </Layout>
  );
}
