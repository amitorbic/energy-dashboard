"use client";
import ContractLayout from "../../components/ContractLayout";
import { useRouter } from "next/router";

const SECTIONS = [
  {
    title: "Upload & Pricing",
    items: [
      {
        label: "Upload usage",
        href: "/contracts/upload",
        desc: "Upload usage data that feeds into confirmation summaries.",
        badge: "Upload",
        badgeColor: "bg-blue-50 text-blue-700",
      },
      {
        label: "Custom pricing confirmation",
        href: "/contracts/custom-pricing",
        desc: "Select a custom pricing record and customer — auto-fills confirmation details.",
        badge: "Pricing",
        badgeColor: "bg-green-50 text-green-700",
      },
    ],
  },
  {
    title: "Emails",
    items: [
      {
        label: "Send confirmation emails",
        href: "/contracts/send",
        desc: "Manually fill in contract details and send confirmation to brokers.",
      },
      {
        label: "Send LMP confirmation emails",
        href: "/contracts/send-lmp",
        desc: "Same as confirmation emails — LMP contract type variant.",
      },
    ],
  },
  {
    title: "Manage",
    items: [
      {
        label: "Edit confirmations",
        href: "/contracts/edit",
        desc: "List all confirmations — edit, send revised, or delete.",
      },
      {
        label: "View all confirmations",
        href: "/contracts/view",
        desc: "Read-only view of all confirmation records.",
      },
      {
        label: "Confirmation log",
        href: "/contracts/log",
        desc: "Audit trail — who created, edited, sent, or deleted.",
      },
    ],
  },
  {
    title: "Documents",
    items: [
      {
        label: "Welcome letter",
        href: "/contracts/welcome-letter",
        desc: "Generate an email-format welcome letter from confirmation details.",
      },
      {
        label: "Download enrollment checks",
        href: "/contracts/enrollment-checks",
        desc: "Coming soon — discuss when enrollment check page is built.",
        disabled: true,
      },
      {
        label: "Future contracts",
        href: "/contracts/future-contracts",
        desc: "View and export customer confirmations with future contract dates.",
      },
    ],
  },
];

export default function ContractsHome() {
  const router = useRouter();

  return (
    <ContractLayout title="Contract Confirmation">
      <div className="max-w-4xl">
        {/* Page intro */}
        <div className="mb-6">
          <p className="text-sm text-gray-500">
            Post-sales confirmation management — send, edit, and track contract
            confirmations for brokers.
          </p>
        </div>

        {/* Sections */}
        {SECTIONS.map((section) => (
          <div key={section.title} className="mb-6">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 pl-1">
              {section.title}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {section.items.map((item) => (
                <div
                  key={item.href}
                  onClick={() => !item.disabled && router.push(item.href)}
                  className={`bg-white border border-gray-200 rounded-lg px-4 py-3 transition-all
                    ${
                      item.disabled
                        ? "opacity-50 cursor-not-allowed"
                        : "cursor-pointer hover:border-sky-400 hover:shadow-sm"
                    }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-gray-800">
                      {item.label}
                    </span>
                    {item.badge && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded font-medium ${item.badgeColor}`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </ContractLayout>
  );
}
