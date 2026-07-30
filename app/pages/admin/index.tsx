import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { getUser, isAdmin, isLoggedIn, User } from "../../utils/auth";

const ADMIN_PAGES = [
  {
    title: "Addon Charge Types",
    description:
      "Manage supplier addon charge definitions and effective-dated rate history (ANCSVC, LINELOSS, etc.)",
    icon: "⚙",
    path: "/admin/addon-charge-types",
  },
  {
    title: "Test Data Generator",
    description:
      "Generate synthetic 867/810 EDI files for a set of ESI IDs, for testing billing and enrollment flows.",
    icon: "🧪",
    path: "/admin/test-data-generator",
  },
];

export default function AdminIndex() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push("/login");
      return;
    }
    setUser(getUser());
    setAuthChecked(true);
  }, [router]);

  if (!authChecked) return null;

  if (!isAdmin()) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 font-semibold text-lg">Access denied</p>
          <p className="text-slate-500 text-sm mt-1">This section requires admin privileges.</p>
          <button
            onClick={() => router.push("/")}
            className="mt-4 text-xs text-sky-400 hover:text-sky-300 underline"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="fixed inset-0 bg-[linear-gradient(rgba(56,189,248,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(56,189,248,0.02)_1px,transparent_1px)] bg-[size:48px_48px] pointer-events-none" />

      {/* header */}
      <header className="relative z-10 border-b border-slate-800 bg-slate-900/90 backdrop-blur-sm">
        <div className="max-w-screen-xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="text-slate-500 hover:text-white text-xs transition-colors"
            >
              ← Dashboard
            </button>
            <span className="text-slate-700">|</span>
            <span className="text-xs text-slate-500 bg-red-500/10 border border-red-500/20 text-red-400 px-2 py-0.5 rounded font-medium">
              Admin
            </span>
            <span className="text-sm font-semibold text-white">Admin</span>
          </div>
          {user && <span className="text-slate-500 text-xs">{user.username}</span>}
        </div>
      </header>

      <main className="relative z-10 max-w-screen-xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-lg font-bold text-white">Admin Tools</h1>
          <p className="text-slate-500 text-xs mt-0.5">
            Configuration and utilities for supplier data and testing.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {ADMIN_PAGES.map((p) => (
            <button
              key={p.path}
              onClick={() => router.push(p.path)}
              className="group text-left border border-red-500/20 hover:border-red-500/50 bg-red-500/5 hover:bg-red-500/10 rounded-xl p-5 transition-all duration-200"
            >
              <div className="text-2xl mb-3 text-red-400">{p.icon}</div>
              <h3 className="text-white font-semibold text-sm mb-1">{p.title}</h3>
              <p className="text-slate-400 text-xs leading-relaxed">{p.description}</p>
              <div className="mt-4 text-xs font-medium text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                Open admin →
              </div>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
