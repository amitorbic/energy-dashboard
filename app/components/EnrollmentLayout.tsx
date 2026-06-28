import React from "react";
import Layout from "./Layout";
import Link from "next/link";
import { useRouter } from "next/router";

const SECTIONS = [
  {
    heading: null,
    links: [{ label: "Enrollment Home", href: "/enrollment-audit" }],
  },
  {
    heading: "Process",
    links: [
      { label: "Upload Spreadsheet",   href: "/enrollment-audit/upload" },
      { label: "View Enrollments",     href: "/enrollment-audit/view" },
      { label: "Completed",            href: "/enrollment-audit/completed" },
      { label: "Canceled",             href: "/enrollment-audit/canceled" },
    ],
  },
  {
    heading: "Reports",
    links: [
      { label: "Enrl / Confirmation",  href: "/enrollment-audit/reports/comparison" },
      { label: "Pending Confirmations",href: "/enrollment-audit/reports/pending-confirmations" },
      { label: "No Confirmations",     href: "/enrollment-audit/reports/no-confirmations" },
      { label: "Template Comparison",  href: "/enrollment-audit/reports/template-comparison" },
      { label: "Check List",           href: "/enrollment-audit/reports/checked" },
      { label: "Non Billed >35d",      href: "/enrollment-audit/reports/non-billed" },
    ],
  },
  {
    heading: "Downloads",
    links: [
      { label: "Download Completed",  href: "/enrollment-audit/reports/download-completed" },
      { label: "Download Pending",    href: "/enrollment-audit/reports/download-pending" },
    ],
  },
  {
    heading: "Templates",
    links: [
      { label: "Template List",  href: "/enrollment-audit/templates" },
      { label: "Add Template",   href: "/enrollment-audit/templates/add" },
    ],
  },
  {
    heading: null,
    links: [{ label: "User Log", href: "/enrollment-audit/user-log" }],
  },
];

interface Props {
  children: React.ReactNode;
  title?: string;
}

export default function EnrollmentLayout({ children, title }: Props) {
  const router = useRouter();

  return (
    <Layout title={title}>
      <div className="flex gap-0 -mx-4 -mt-6">
        {/* Sidebar */}
        <aside className="w-56 min-h-screen bg-white border-r border-gray-200 pt-4 flex-shrink-0 overflow-y-auto">
          {SECTIONS.map((section, si) => (
            <div key={si} className={si > 0 ? "mt-1" : ""}>
              {section.heading && (
                <p className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {section.heading}
                </p>
              )}
              {section.links.map((item) => {
                const active = router.pathname === item.href;
                return (
                  <Link key={item.href} href={item.href}>
                    <div
                      className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors cursor-pointer ${
                        active
                          ? "bg-blue-600 text-white font-medium"
                          : "text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          active ? "bg-white" : "bg-gray-400"
                        }`}
                      />
                      {item.label}
                    </div>
                  </Link>
                );
              })}
            </div>
          ))}
        </aside>

        {/* Page content */}
        <div className="flex-1 p-6 min-w-0">{children}</div>
      </div>
    </Layout>
  );
}
