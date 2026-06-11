import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Users, Upload, ClipboardList } from "lucide-react";
import Layout from "../../components/Layout";
import api from "../../utils/api";
import { isLoggedIn, isAdmin } from "../../utils/auth";

export default function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState({ users: 0, meters: 0, recent: 0 });

  useEffect(() => {
    if (!isLoggedIn() || !isAdmin()) { router.replace("/login"); return; }
    Promise.all([
      api.get("/admin/users"),
      api.get("/admin/logs"),
    ]).then(([usersRes, logsRes]) => {
      const users = usersRes.data as { meter_count: number }[];
      const totalMeters = users.reduce((sum, u) => sum + (u.meter_count || 0), 0);
      const logs = logsRes.data as unknown[];
      setStats({
        users: users.length,
        meters: totalMeters,
        recent: logs.length,
      });
    }).catch(() => {});
  }, [router]);

  const cards = [
    {
      title: "Users",
      description: "Create and manage customer accounts",
      icon: Users,
      color: "bg-blue-500",
      bg: "bg-blue-50 hover:bg-blue-100 border-blue-200",
      path: "/admin/users",
      stat: stats.users,
      statLabel: "accounts",
    },
    {
      title: "Upload Data",
      description: "Upload Excel files with ESI ID data",
      icon: Upload,
      color: "bg-emerald-500",
      bg: "bg-emerald-50 hover:bg-emerald-100 border-emerald-200",
      path: "/admin/upload",
      stat: stats.meters,
      statLabel: "total meters",
    },
    {
      title: "Activity Logs",
      description: "View all add and cancel requests",
      icon: ClipboardList,
      color: "bg-violet-500",
      bg: "bg-violet-50 hover:bg-violet-100 border-violet-200",
      path: "/admin/logs",
      stat: stats.recent,
      statLabel: "requests logged",
    },
  ];

  return (
    <Layout title="Admin Dashboard">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900">Admin Dashboard</h2>
          <p className="text-gray-500 text-sm mt-1">
            Manage users, upload meter data, and monitor activity
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {cards.map((card) => (
            <button
              key={card.path}
              onClick={() => router.push(card.path)}
              className={`border rounded-2xl p-6 text-left transition-all hover:shadow-md ${card.bg}`}
            >
              <div className={`w-11 h-11 ${card.color} rounded-xl flex items-center justify-center mb-4`}>
                <card.icon className="h-5 w-5 text-white" />
              </div>
              <h3 className="font-bold text-gray-900 text-lg">{card.title}</h3>
              <p className="text-gray-500 text-sm mt-1 mb-4">{card.description}</p>
              <div className="text-2xl font-bold text-gray-900">
                {card.stat}{" "}
                <span className="text-sm font-normal text-gray-500">{card.statLabel}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </Layout>
  );
}
