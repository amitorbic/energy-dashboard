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
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--ct-canvas)" }}>
        <div className="text-center">
          <p className="font-semibold text-lg" style={{ color: "var(--danger-light)" }}>Access denied</p>
          <p className="text-sm mt-1" style={{ color: "var(--ct-text-muted)" }}>This section requires admin privileges.</p>
          <button
            onClick={() => router.push("/")}
            className="mt-4 text-xs underline hover:opacity-80"
            style={{ color: "var(--accent-light)" }}
          >
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--ct-canvas)" }}>
      <div className="fixed inset-0 bg-[linear-gradient(rgba(16,23,40,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(16,23,40,0.025)_1px,transparent_1px)] bg-[size:48px_48px] pointer-events-none" />

      {/* header */}
      <header className="relative z-10 border-b backdrop-blur-sm" style={{ borderColor: "var(--ct-border-default)", background: "rgba(255,255,255,0.9)" }}>
        <div className="max-w-screen-xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="text-xs transition-colors hover:opacity-80"
              style={{ color: "var(--ct-text-muted)" }}
            >
              ← Dashboard
            </button>
            <span style={{ color: "var(--ct-border-strong)" }}>|</span>
            <span
              className="text-xs px-2 py-0.5 rounded-[var(--r-sm)] font-medium border"
              style={{ background: "var(--danger-light-tint)", borderColor: "var(--danger-light-tint)", color: "var(--danger-light)" }}
            >
              Admin
            </span>
            <span className="text-sm font-semibold" style={{ color: "var(--ct-text-primary)" }}>Admin</span>
          </div>
          {user && <span className="text-xs" style={{ color: "var(--ct-text-muted)" }}>{user.username}</span>}
        </div>
      </header>

      <main className="relative z-10 max-w-screen-xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-lg font-bold" style={{ color: "var(--ct-text-primary)" }}>Admin Tools</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--ct-text-muted)" }}>
            Configuration and utilities for supplier data and testing.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {ADMIN_PAGES.map((p) => (
            <button
              key={p.path}
              onClick={() => router.push(p.path)}
              className="group text-left rounded-[var(--r-lg)] p-5 border transition-all duration-200 hover:bg-[var(--ct-surface-hover)]"
              style={{ borderColor: "var(--ct-border-default)", background: "var(--ct-surface)" }}
            >
              <div className="text-2xl mb-3" style={{ color: "var(--accent-light)" }}>{p.icon}</div>
              <h3 className="font-semibold text-sm mb-1" style={{ color: "var(--ct-text-primary)" }}>{p.title}</h3>
              <p className="text-xs leading-relaxed" style={{ color: "var(--ct-text-secondary)" }}>{p.description}</p>
              <div className="mt-4 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--accent-light)" }}>
                Open admin →
              </div>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
