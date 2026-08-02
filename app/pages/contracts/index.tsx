"use client";
import ContractLayout from "../../components/ContractLayout";
import { useRouter } from "next/router";

type SectionItem = {
  label: string;
  href: string;
  desc: string;
  badge?: string;
  disabled?: boolean;
};
const SECTIONS: { title: string; items: SectionItem[] }[] = [
  {
    title: "Upload & Pricing",
    items: [
      {
        label: "Upload usage",
        href: "/contracts/upload",
        desc: "Upload usage data that feeds into confirmation summaries.",
        badge: "Upload",
        disabled: false,
      },
      {
        label: "Custom pricing confirmation",
        href: "/contracts/custom-pricing",
        desc: "Select a custom pricing record and customer — auto-fills confirmation details.",
        badge: "Pricing",
        disabled: false,
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
          <p className="text-sm" style={{ color: "var(--ct-text-muted)" }}>
            Post-sales confirmation management — send, edit, and track contract
            confirmations for brokers.
          </p>
        </div>

        {/* Sections */}
        {SECTIONS.map((section) => (
          <div key={section.title} className="mb-6">
            <h2
              className="text-xs font-semibold uppercase tracking-widest mb-2 pl-1"
              style={{ color: "var(--ct-text-muted)" }}
            >
              {section.title}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {section.items.map((item) => (
                <div
                  key={item.href}
                  onClick={() => !item.disabled && router.push(item.href)}
                  className={`rounded-[var(--r-md)] px-4 py-3 border transition-all
                    ${
                      item.disabled
                        ? "opacity-50 cursor-not-allowed"
                        : "cursor-pointer hover:border-[var(--accent-light)] hover:shadow-sm"
                    }`}
                  style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium" style={{ color: "var(--ct-text-primary)" }}>
                      {item.label}
                    </span>
                    {item.badge && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-[var(--r-sm)] font-medium"
                        style={{ background: "var(--accent-light-tint)", color: "var(--accent-light)" }}
                      >
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--ct-text-muted)" }}>
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
