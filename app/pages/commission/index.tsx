import { useState, useEffect, useCallback } from "react";
import Layout from "../../components/Layout";
import api from "../../utils/api";

// 1. Defined Interfaces to replace 'any'
interface SummaryRow {
  vendor: string;
  payment: string | number;
  owed: string | number;
  balance: string | number;
}

interface CommissionDataRow {
  sid: number;
  // add other fields if needed for specific logic
}

const NAV_MODULES = [
  {
    label: "Update Data",
    href: "/commission/upload",
    icon: "↑",
    desc: "Upload monthly commission Excel file",
  },
  {
    label: "View Data",
    href: "/commission/view",
    icon: "⊞",
    desc: "Review, audit, edit and download commission records",
  },
  {
    label: "Delete Data",
    href: "/commission/delete",
    icon: "✕",
    desc: "Clear prior month data before recalculation",
    danger: true,
  },
  {
    label: "Insert Payments",
    href: "/commission/payments",
    icon: "$",
    desc: "Upload monthly payment summary sheet",
  },
  {
    label: "Adjustments",
    href: "/commission/adjustments",
    icon: "±",
    desc: "Add manual credit or debit adjustments",
  },
  {
    label: "Review Summary",
    href: "/commission/summary",
    icon: "≡",
    desc: "Broker-level payments, owed and balance overview",
  },
  {
    label: "Calculate Commission",
    href: "/commission/calculate",
    icon: "∑",
    desc: "Run final commission calculation for the month",
  },
  {
    label: "Upload Files for Brokers",
    href: "/commission/broker-files",
    icon: "⊙",
    desc: "Push commission files to individual brokers",
    comingSoon: true,
  },
  {
    label: "Upfront History",
    href: "/commission/upfront",
    icon: "⚡",
    desc: "Track brokers paid on upfront mills terms",
    comingSoon: true,
  },
  {
    label: "Modify Email List",
    href: "/commission/email-list",
    icon: "@",
    desc: "Update broker commission email addresses",
    comingSoon: true,
  },
  {
    label: "Email Log",
    href: "/commission/email-log",
    icon: "✉",
    desc: "History of commission emails sent to brokers",
    comingSoon: true,
  },
  {
    label: "User Log",
    href: "/commission/user-log",
    icon: "⌚",
    desc: "Full audit trail of all actions in this module",
  },
  {
    label: "Download Commission Files",
    href: "/commission/download",
    icon: "↓",
    desc: "Manually download commission files per broker",
  },
];

type MonthStatus = {
  month: string;
  uploaded: boolean;
  payments_in: boolean;
  calculated: boolean;
  total_owed: number;
  total_payment: number;
  total_balance: number;
  vendor_count: number;
};

export default function CommissionIndex() {
  const [status, setStatus] = useState<MonthStatus | null>(null);
  const [loading, setLoading] = useState(true);

  // 2. Wrapped in useCallback to prevent re-renders
  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryRes, dataRes] = await Promise.all([
        api.get('/commission/summary'),
        api.get('/commission/data'),
      ]);
      const summary = summaryRes.data;
      const data = dataRes.data;

      const rows: SummaryRow[] = Array.isArray(summary) ? summary : [];
      const commRows: CommissionDataRow[] = Array.isArray(data) ? data : [];

      // 3. Replaced 'any' with 'SummaryRow'
      const totalOwed = rows.reduce(
        (s: number, r: SummaryRow) => s + parseFloat(String(r.owed || 0)),
        0,
      );
      const totalPayment = rows.reduce(
        (s: number, r: SummaryRow) => s + parseFloat(String(r.payment || 0)),
        0,
      );
      const totalBalance = rows.reduce(
        (s: number, r: SummaryRow) => s + parseFloat(String(r.balance || 0)),
        0,
      );
      const vendorCount = new Set(rows.map((r: SummaryRow) => r.vendor)).size;

      const now = new Date();
      const monthName = now.toLocaleString("en-US", { month: "long" });

      setStatus({
        month: monthName,
        uploaded: commRows.length > 0,
        payments_in: rows.some(
          (r: SummaryRow) => r.payment && parseFloat(String(r.payment)) !== 0,
        ),
        calculated: rows.some(
          (r: SummaryRow) => r.owed && parseFloat(String(r.owed)) !== 0,
        ),
        total_owed: totalOwed,
        total_payment: Math.abs(totalPayment),
        total_balance: totalBalance,
        vendor_count: vendorCount,
      });
    } catch (err) {
      console.error("Dashboard status load failed:", err);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const fmt = (n: number) =>
    "$" +
    Math.abs(n).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const steps = [
    { label: "Commission uploaded", done: status?.uploaded },
    { label: "Payments inserted", done: status?.payments_in },
    { label: "Commission calculated", done: status?.calculated },
  ];

  return (
    <Layout>
      {
        <div className="min-h-screen p-6" style={{ background: "var(--ct-canvas)" }}>
          <div className="max-w-7xl mx-auto">
            <header
              className="rounded-t-[var(--r-lg)] px-6 py-4 flex items-center justify-between border-b"
              style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)", boxShadow: "var(--shadow-content)" }}
            >
              <div>
                <h1 className="text-xl font-semibold" style={{ color: "var(--ct-text-primary)" }}>
                  Commission Dashboard
                </h1>
                <p className="text-sm mt-0.5" style={{ color: "var(--ct-text-secondary)" }}>
                  ORBIC Portfolio Management
                </p>
              </div>
              <span className="text-sm font-mono" style={{ color: "var(--ct-text-muted)" }}>
                {new Date().toLocaleString("en-US", {
                  month: "long",
                  year: "numeric",
                })}
              </span>
            </header>

            <div
              className="rounded-b-[var(--r-lg)] p-6 mb-6 border-x border-b"
              style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)", boxShadow: "var(--shadow-content)" }}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: "var(--ct-text-secondary)" }}>
                  {status?.month || "Current Month"} — Pipeline
                </h2>
                <button
                  onClick={loadStatus}
                  className="text-xs font-bold uppercase transition-colors hover:text-[var(--accent-light)]"
                  style={{ color: "var(--accent-light)" }}
                >
                  Refresh Data
                </button>
              </div>

              {loading ? (
                <div className="animate-pulse flex space-x-4">
                  <div className="h-4 rounded-[var(--r-sm)] w-full" style={{ background: "var(--ct-surface-hover)" }}></div>
                </div>
              ) : (
                <div className="flex items-center">
                  {steps.map((step, i) => (
                    <div key={step.label} className="flex items-center">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shadow-inner"
                          style={step.done
                            ? { background: "var(--success-light)", color: "#ffffff" }
                            : { background: "var(--ct-surface-hover)", color: "var(--ct-text-muted)" }}
                        >
                          {step.done ? "✓" : i + 1}
                        </div>
                        <span
                          className="text-sm font-bold uppercase"
                          style={{ color: step.done ? "var(--success-light)" : "var(--ct-text-muted)" }}
                        >
                          {step.label}
                        </span>
                      </div>
                      {i < steps.length - 1 && (
                        <div
                          className="h-1 w-16 mx-4 rounded-full"
                          style={{ background: step.done ? "var(--success-light-tint)" : "var(--ct-surface-hover)" }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {!loading && status && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {[
                  {
                    label: "Active Vendors",
                    value: status.vendor_count.toString(),
                    sub: "In current cycle",
                    color: "var(--ct-text-primary)",
                    bg: "var(--ct-surface)",
                  },
                  {
                    label: "Total Owed",
                    value: fmt(status.total_owed),
                    sub: "Earnings accrued",
                    color: "var(--ct-text-primary)",
                    bg: "var(--ct-surface)",
                  },
                  {
                    label: "Total Payments",
                    value: fmt(status.total_payment),
                    sub: "Supplier receipts",
                    color: "var(--success-light)",
                    bg: "var(--success-light-tint)",
                  },
                  {
                    label: "Net Balance",
                    value: fmt(status.total_balance),
                    sub: status.total_balance < 0 ? "Credit due" : "Debit due",
                    color:
                      status.total_balance < 0
                        ? "var(--danger-light)"
                        : "var(--ct-text-primary)",
                    bg: status.total_balance < 0 ? "var(--danger-light-tint)" : "var(--ct-surface)",
                  },
                ].map((card) => (
                  <div
                    key={card.label}
                    className="rounded-[var(--r-lg)] p-5 border transition-transform hover:scale-[1.02]"
                    style={{ borderColor: "var(--ct-border-default)", background: card.bg, boxShadow: "var(--shadow-content)" }}
                  >
                    <p className="text-[10px] font-black uppercase mb-1 tracking-widest" style={{ color: "var(--ct-text-muted)" }}>
                      {card.label}
                    </p>
                    <p className="text-2xl font-bold" style={{ color: card.color }}>
                      {card.value}
                    </p>
                    <p className="text-xs font-medium mt-1" style={{ color: "var(--ct-text-muted)" }}>
                      {card.sub}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <h2 className="text-xs font-black uppercase tracking-[0.2em] mb-4" style={{ color: "var(--ct-text-muted)" }}>
              Operations & Tools
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {NAV_MODULES.map((mod) => {
                if (mod.comingSoon) {
                  // href preserved in NAV_MODULES above — swap <div> for <a href={mod.href}> when page is built
                  return (
                    <div
                      key={mod.href}
                      className="rounded-[var(--r-lg)] border p-4 flex items-center gap-4 cursor-not-allowed"
                      style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-subtle)" }}
                    >
                      <div
                        className="w-12 h-12 rounded-[var(--r-lg)] flex items-center justify-center text-xl flex-shrink-0 font-bold opacity-30"
                        style={{ background: "var(--accent-light-tint)", color: "var(--accent-light)" }}
                      >
                        {mod.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold uppercase truncate" style={{ color: "var(--ct-text-muted)" }}>
                          {mod.label}
                        </p>
                        <p className="text-[11px] mt-0.5 leading-tight line-clamp-2" style={{ color: "var(--ct-text-muted)" }}>
                          {mod.desc}
                        </p>
                      </div>
                      <span
                        className="text-[9px] font-semibold px-1.5 py-0.5 rounded-[var(--r-sm)] flex-shrink-0"
                        style={{ color: "var(--ct-text-muted)", background: "var(--ct-surface)" }}
                      >
                        SOON
                      </span>
                    </div>
                  );
                }
                const iconStyle = mod.danger
                  ? { background: "var(--danger-light-tint)", color: "var(--danger-light)" }
                  : { background: "var(--accent-light-tint)", color: "var(--accent-light)" };
                return (
                  <a
                    key={mod.href}
                    href={mod.href}
                    className="group rounded-[var(--r-lg)] border p-4 hover:shadow-md transition-all flex items-center gap-4 hover:border-[var(--accent-light)]"
                    style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}
                  >
                    <div
                      className="w-12 h-12 rounded-[var(--r-lg)] flex items-center justify-center text-xl flex-shrink-0 font-bold transition-transform group-hover:rotate-6"
                      style={iconStyle}
                    >
                      {mod.icon}
                    </div>
                    <div className="min-w-0">
                      <p
                        className="text-sm font-bold uppercase truncate transition-colors group-hover:text-[var(--accent-light)]"
                        style={{ color: "var(--ct-text-primary)" }}
                      >
                        {mod.label}
                      </p>
                      <p className="text-[11px] mt-0.5 leading-tight line-clamp-2" style={{ color: "var(--ct-text-muted)" }}>
                        {mod.desc}
                      </p>
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      }
    </Layout>
  );
}
