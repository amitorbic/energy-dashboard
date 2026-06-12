import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { isLoggedIn, getUser, isAdmin } from "../utils/auth";
import api from "../utils/api";

interface UpcomingRenewal {
  company:   string;
  end_date:  string;
  days_left: number;
}

interface PipelineItem {
  broker_name: string;
  company:     string;
  start_date:  string;
  status:      string;
}

interface Portfolio {
  total_companies:   number;
  total_esiids:      number;
  expiring_30:       number;
  expiring_90:       number;
  pipeline_active:   number;
  pipeline_expired:  number;
  upcoming_renewals: UpcomingRenewal[];
  recent_pipeline:   PipelineItem[];
  broker_count:      number | null;
}

// ── Stat card ──────────────────────────────────────────────────────────────
function StatCard({
  label, value, sub, color, icon,
}: {
  label: string;
  value: number | string;
  sub?: string;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-start gap-4">
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>
        <p className="text-sm font-medium text-gray-700 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Urgency badge ──────────────────────────────────────────────────────────
function UrgencyBadge({ days }: { days: number }) {
  if (days <= 14)
    return (
      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
        {days}d
      </span>
    );
  if (days <= 30)
    return (
      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">
        {days}d
      </span>
    );
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">
      {days}d
    </span>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function HomePage() {
  const router = useRouter();
  const [user, setUser]       = useState<ReturnType<typeof getUser>>(null);
  const [admin, setAdmin]     = useState(false);
  const [data, setData]       = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  useEffect(() => {
    if (!isLoggedIn()) { router.replace("/"); return; }
    setUser(getUser());
    setAdmin(isAdmin());
    api.get("/home/portfolio")
      .then((res) => setData(res.data))
      .catch(() => setError("Failed to load portfolio data."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3 text-gray-400">
            <svg className="animate-spin w-8 h-8" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span className="text-sm">Loading portfolio…</span>
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !data) {
    return (
      <Layout>
        <p className="text-center text-red-500 py-12">{error || "No data."}</p>
      </Layout>
    );
  }

  const greetingHour = new Date().getHours();
  const greeting =
    greetingHour < 12 ? "Good morning" :
    greetingHour < 17 ? "Good afternoon" : "Good evening";

  return (
    <Layout>

      {/* ── Greeting ── */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {greeting}, {user?.username}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Here's your broker portfolio at a glance.</p>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">

        <StatCard
          label="Active Companies"
          value={data.total_companies}
          sub={`${data.total_esiids} total ESIIDs`}
          color="bg-blue-100"
          icon={
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          }
        />

        <StatCard
          label="Expiring ≤ 30 Days"
          value={data.expiring_30}
          sub={`${data.expiring_90} expiring within 90 days`}
          color={data.expiring_30 > 0 ? "bg-red-100" : "bg-green-100"}
          icon={
            <svg className={`w-5 h-5 ${data.expiring_30 > 0 ? "text-red-600" : "text-green-600"}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />

        <StatCard
          label="Pipeline Accounts"
          value={data.pipeline_active}
          sub="Priced, not yet active"
          color="bg-purple-100"
          icon={
            <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          }
        />

        {admin && data.broker_count !== null ? (
          <StatCard
            label="Broker Users"
            value={data.broker_count}
            sub="Total registered brokers"
            color="bg-indigo-100"
            icon={
              <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            }
          />
        ) : (
          <StatCard
            label="Expired Pipeline"
            value={data.pipeline_expired}
            sub="Awaiting re-pricing"
            color="bg-orange-100"
            icon={
              <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            }
          />
        )}
      </div>

      {/* ── Two-column lower section ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Upcoming Renewals */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800 text-sm">Upcoming Renewals</h2>
            <button onClick={() => router.push("/renewals/active")}
              className="text-xs text-blue-600 hover:underline">
              View all →
            </button>
          </div>

          {data.upcoming_renewals.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">
              No upcoming renewals
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {data.upcoming_renewals.map((r, i) => (
                <div key={i} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 truncate">{r.company}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{r.end_date}</p>
                  </div>
                  <UrgencyBadge days={r.days_left} />
                </div>
              ))}
            </div>
          )}

          {data.upcoming_renewals.length > 0 && (
            <div className="px-5 py-3 border-t border-gray-50">
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> ≤14 days
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" /> ≤30 days
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> ≤90 days
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Pipeline / Renewal Offers */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800 text-sm">Deals in Pipeline</h2>
            <button onClick={() => router.push("/renewals/price-renewals")}
              className="text-xs text-blue-600 hover:underline">
              View all →
            </button>
          </div>

          {data.recent_pipeline.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">
              No pipeline data yet
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {data.recent_pipeline.map((p, i) => (
                <div key={i} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 truncate">{p.company}</p>
                    {admin && p.broker_name && (
                      <p className="text-xs text-gray-400 mt-0.5">{p.broker_name}</p>
                    )}
                    {p.start_date && (
                      <p className="text-xs text-gray-400 mt-0.5">Quote date: {p.start_date}</p>
                    )}
                  </div>
                  <span className={`ml-3 shrink-0 inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                    p.status === "has expired"
                      ? "bg-red-100 text-red-700"
                      : "bg-purple-100 text-purple-700"
                  }`}>
                    {p.status === "has expired" ? "Expired" : "Active"}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Pipeline summary bar */}
          {data.pipeline_active + data.pipeline_expired > 0 && (
            <div className="px-5 py-3 border-t border-gray-50">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                <span>Active pipeline</span>
                <span>{data.pipeline_active} / {data.pipeline_active + data.pipeline_expired}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div
                  className="bg-purple-500 h-1.5 rounded-full transition-all"
                  style={{
                    width: `${
                      data.pipeline_active + data.pipeline_expired > 0
                        ? Math.round((data.pipeline_active / (data.pipeline_active + data.pipeline_expired)) * 100)
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>

      </div>

      {/* ── Quick links ── */}
      <div className="mt-5 bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Quick Actions</h2>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Daily Pricing",        href: "/pricing" },
            { label: "Active Renewals",      href: "/renewals/active" },
            { label: "Commercial Contract",  href: "/forms/contract-commercial" },
            { label: "Generate LOA",         href: "/forms/loa" },
            { label: "ESIID Lookup",         href: "/esiid-lookup" },
            { label: "Bill Sample",          href: "/bill-sample" },
          ].map(({ label, href }) => (
            <button key={href} onClick={() => router.push(href)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-all">
              {label}
            </button>
          ))}
        </div>
      </div>

    </Layout>
  );
}
