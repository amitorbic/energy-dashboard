import React from "react";
import Layout from "./Layout";
import SectionNav, { SectionNavGroup } from "./SectionNav";

const GROUPS: SectionNavGroup[] = [
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
  return (
    <Layout title={title}>
      <div className="flex gap-0 -mx-6 -mt-6 min-h-full">
        <SectionNav groups={GROUPS} />
        <div className="flex-1 p-6 min-w-0">{children}</div>
      </div>
    </Layout>
  );
}
