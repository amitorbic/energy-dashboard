import { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import { useRouter } from "next/router";
import api from "../../utils/api";

interface Stats {
  expiringSoon: number | null;
  expired: number | null;
}

const CustomersIndex = () => {
  const router = useRouter();
  const [stats, setStats] = useState<Stats>({ expiringSoon: null, expired: null });

  useEffect(() => {
    api.get("/contract-renewal/counts").then((res) => {
      setStats({
        expiringSoon: res.data.expiring_soon,
        expired: res.data.expired,
      });
    });
  }, []);

  const staticCards = [
    {
      title: "Upload renewal data",
      description:
        "Import contract renewal CSV to refresh customer end dates, rates, usage and broker info.",
      action: "Upload file →",
      route: "/customers/renewal-upload",
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
      ),
      route_key: "upload",
    },
    {
      title: "View renewal data",
      description:
        "Browse all active customers — end dates, contract rates, usage volumes and expiry status.",
      action: "View records →",
      route: "/customers/renewal-view",
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
      route_key: "view",
    },
  ];

  return (
    <Layout title="Customer Database">
      <div className="max-w-4xl mx-auto p-6 space-y-8">
        {/* Header */}
        <div className="border-b pb-6" style={{ borderColor: "var(--ct-border-default)" }}>
          <h1 className="text-3xl font-black uppercase tracking-tighter" style={{ color: "var(--ct-text-primary)" }}>
            Customer Database
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--ct-text-muted)" }}>
            Manage renewal contracts and customer data
          </p>
        </div>

        {/* Static cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {staticCards.map((card) => (
            <button
              key={card.route}
              onClick={() => router.push(card.route)}
              className="group border-2 rounded-[var(--r-lg)] p-6 text-left transition-all duration-200 hover:bg-[var(--ct-surface-hover)]"
              style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}
            >
              <div className="w-11 h-11 rounded-[var(--r-md)] flex items-center justify-center mb-4"
                style={{ background: "var(--accent-light-tint)", color: "var(--accent-light)" }}>
                {card.icon}
              </div>
              <p className="font-bold text-base mb-1" style={{ color: "var(--ct-text-primary)" }}>{card.title}</p>
              <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--ct-text-muted)" }}>
                {card.description}
              </p>
              <span className="text-sm font-semibold transition-colors" style={{ color: "var(--accent-light)" }}>
                {card.action}
              </span>
            </button>
          ))}
        </div>

        {/* Expiry stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <button
            onClick={() => router.push("/customers/renewal-view?filter=expiring")}
            className="group border-2 rounded-[var(--r-lg)] p-6 text-left transition-all duration-200 hover:bg-[var(--ct-surface-hover)]"
            style={{ background: "var(--ct-surface)", borderColor: "var(--amber-light-border)" }}
          >
            <div className="w-11 h-11 rounded-[var(--r-md)] flex items-center justify-center mb-4"
              style={{ background: "var(--amber-light-tint)", color: "var(--amber-light)" }}>
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex items-baseline gap-2 mb-1">
              <p className="font-bold text-base" style={{ color: "var(--ct-text-primary)" }}>Expiring Soon</p>
              <span className="text-2xl font-black font-mono" style={{ color: "var(--amber-light)" }}>
                {stats.expiringSoon === null ? "—" : stats.expiringSoon}
              </span>
            </div>
            <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--ct-text-muted)" }}>
              Contracts expiring within the next 60 days that need renewal action.
            </p>
            <span className="text-sm font-semibold transition-colors" style={{ color: "var(--amber-light)" }}>
              View expiring →
            </span>
          </button>

          <button
            onClick={() => router.push("/customers/renewal-view?filter=expired")}
            className="group border-2 rounded-[var(--r-lg)] p-6 text-left transition-all duration-200 hover:bg-[var(--ct-surface-hover)]"
            style={{ background: "var(--ct-surface)", borderColor: "var(--danger-light-tint)" }}
          >
            <div className="w-11 h-11 rounded-[var(--r-md)] flex items-center justify-center mb-4"
              style={{ background: "var(--danger-light-tint)", color: "var(--danger-light)" }}>
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="flex items-baseline gap-2 mb-1">
              <p className="font-bold text-base" style={{ color: "var(--ct-text-primary)" }}>Expired</p>
              <span className="text-2xl font-black font-mono" style={{ color: "var(--danger-light)" }}>
                {stats.expired === null ? "—" : stats.expired}
              </span>
            </div>
            <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--ct-text-muted)" }}>
              Contracts past their end date with no active agreement in place.
            </p>
            <span className="text-sm font-semibold transition-colors" style={{ color: "var(--danger-light)" }}>
              View expired →
            </span>
          </button>
        </div>
      </div>
    </Layout>
  );
};

export default CustomersIndex;
