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
    color: "#2563eb",
    bg: "#eff6ff",
  },
  {
    label: "View Data",
    href: "/commission/view",
    icon: "⊞",
    desc: "Review, audit, edit and download commission records",
    color: "#0891b2",
    bg: "#ecfeff",
  },
  {
    label: "Delete Data",
    href: "/commission/delete",
    icon: "✕",
    desc: "Clear prior month data before recalculation",
    color: "#dc2626",
    bg: "#fef2f2",
  },
  {
    label: "Insert Payments",
    href: "/commission/payments",
    icon: "$",
    desc: "Upload monthly payment summary sheet",
    color: "#16a34a",
    bg: "#f0fdf4",
  },
  {
    label: "Adjustments",
    href: "/commission/adjustments",
    icon: "±",
    desc: "Add manual credit or debit adjustments",
    color: "#d97706",
    bg: "#fffbeb",
  },
  {
    label: "Review Summary",
    href: "/commission/summary",
    icon: "≡",
    desc: "Broker-level payments, owed and balance overview",
    color: "#7c3aed",
    bg: "#f5f3ff",
  },
  {
    label: "Calculate Commission",
    href: "/commission/calculate",
    icon: "∑",
    desc: "Run final commission calculation for the month",
    color: "#059669",
    bg: "#ecfdf5",
  },
  {
    label: "Upload Files for Brokers",
    href: "/commission/broker-files",
    icon: "⊙",
    desc: "Push commission files to individual brokers",
    color: "#0284c7",
    bg: "#f0f9ff",
    comingSoon: true,
  },
  {
    label: "Upfront History",
    href: "/commission/upfront",
    icon: "⚡",
    desc: "Track brokers paid on upfront mills terms",
    color: "#b45309",
    bg: "#fefce8",
    comingSoon: true,
  },
  {
    label: "Modify Email List",
    href: "/commission/email-list",
    icon: "@",
    desc: "Update broker commission email addresses",
    color: "#4f46e5",
    bg: "#eef2ff",
    comingSoon: true,
  },
  {
    label: "Email Log",
    href: "/commission/email-log",
    icon: "✉",
    desc: "History of commission emails sent to brokers",
    color: "#0369a1",
    bg: "#f0f9ff",
    comingSoon: true,
  },
  {
    label: "User Log",
    href: "/commission/user-log",
    icon: "⌚",
    desc: "Full audit trail of all actions in this module",
    color: "#475569",
    bg: "#f8fafc",
  },
  {
    label: "Download Commission Files",
    href: "/commission/download",
    icon: "↓",
    desc: "Manually download commission files per broker",
    color: "#15803d",
    bg: "#f0fdf4",
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
        <div className="min-h-screen bg-gray-50 p-6">
          <div className="max-w-7xl mx-auto">
            <header className="bg-white border-b border-gray-200 rounded-t-lg px-6 py-4 flex items-center justify-between shadow-sm">
              <div>
                <h1 className="text-xl font-semibold text-gray-800">
                  Commission Dashboard
                </h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  ORBIC Portfolio Management
                </p>
              </div>
              <span className="text-sm text-gray-400 font-mono">
                {new Date().toLocaleString("en-US", {
                  month: "long",
                  year: "numeric",
                })}
              </span>
            </header>

            <div className="bg-white border-x border-b border-gray-200 rounded-b-lg p-6 mb-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
                  {status?.month || "Current Month"} — Pipeline
                </h2>
                <button
                  onClick={loadStatus}
                  className="text-xs font-bold text-blue-600 hover:text-blue-800 uppercase"
                >
                  Refresh Data
                </button>
              </div>

              {loading ? (
                <div className="animate-pulse flex space-x-4">
                  <div className="h-4 bg-gray-200 rounded w-full"></div>
                </div>
              ) : (
                <div className="flex items-center">
                  {steps.map((step, i) => (
                    <div key={step.label} className="flex items-center">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shadow-inner ${
                            step.done
                              ? "bg-green-500 text-white"
                              : "bg-gray-100 text-gray-400"
                          }`}
                        >
                          {step.done ? "✓" : i + 1}
                        </div>
                        <span
                          className={`text-sm font-bold uppercase ${step.done ? "text-green-700" : "text-gray-400"}`}
                        >
                          {step.label}
                        </span>
                      </div>
                      {i < steps.length - 1 && (
                        <div
                          className={`h-1 w-16 mx-4 rounded-full ${step.done ? "bg-green-200" : "bg-gray-100"}`}
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
                    color: "text-gray-800",
                    bg: "bg-white",
                  },
                  {
                    label: "Total Owed",
                    value: fmt(status.total_owed),
                    sub: "Earnings accrued",
                    color: "text-blue-700",
                    bg: "bg-blue-50/30",
                  },
                  {
                    label: "Total Payments",
                    value: fmt(status.total_payment),
                    sub: "Supplier receipts",
                    color: "text-green-700",
                    bg: "bg-green-50/30",
                  },
                  {
                    label: "Net Balance",
                    value: fmt(status.total_balance),
                    sub: status.total_balance < 0 ? "Credit due" : "Debit due",
                    color:
                      status.total_balance < 0
                        ? "text-red-600"
                        : "text-gray-800",
                    bg: status.total_balance < 0 ? "bg-red-50/30" : "bg-white",
                  },
                ].map((card) => (
                  <div
                    key={card.label}
                    className={`border border-gray-200 rounded-xl p-5 shadow-sm transition-transform hover:scale-[1.02] ${card.bg}`}
                  >
                    <p className="text-[10px] font-black text-gray-400 uppercase mb-1 tracking-widest">
                      {card.label}
                    </p>
                    <p className={`text-2xl font-bold ${card.color}`}>
                      {card.value}
                    </p>
                    <p className="text-xs text-gray-400 font-medium mt-1">
                      {card.sub}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <h2 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-4">
              Operations & Tools
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {NAV_MODULES.map((mod) => {
                if (mod.comingSoon) {
                  // href preserved in NAV_MODULES above — swap <div> for <a href={mod.href}> when page is built
                  return (
                    <div
                      key={mod.href}
                      className="bg-gray-50 border border-gray-100 rounded-xl p-4 flex items-center gap-4 cursor-not-allowed"
                    >
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center text-xl flex-shrink-0 font-bold opacity-30"
                        style={{ background: mod.bg, color: mod.color }}
                      >
                        {mod.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-gray-400 uppercase truncate">
                          {mod.label}
                        </p>
                        <p className="text-[11px] text-gray-300 mt-0.5 leading-tight line-clamp-2">
                          {mod.desc}
                        </p>
                      </div>
                      <span className="text-[9px] font-semibold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded flex-shrink-0">SOON</span>
                    </div>
                  );
                }
                return (
                  <a
                    key={mod.href}
                    href={mod.href}
                    className="group bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-400 hover:shadow-md transition-all flex items-center gap-4"
                  >
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-xl flex-shrink-0 font-bold transition-transform group-hover:rotate-6"
                      style={{ background: mod.bg, color: mod.color }}
                    >
                      {mod.icon}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-800 group-hover:text-blue-600 transition-colors uppercase truncate">
                        {mod.label}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5 leading-tight line-clamp-2">
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
