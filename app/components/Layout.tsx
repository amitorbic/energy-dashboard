"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { getUser, clearAuth, User } from "../utils/auth";

const NAV_MODULES = [
  { label: "Pricing", href: "/pricing" },
  { label: "Broker Database", href: "/broker" },
  { label: "Customer Database", href: "/customers" },
  { label: "Daily Pricing", href: "/daily-pricing" },
  { label: "Contract Confirmation", href: "/contracts" },
  { label: "Billing", href: "/billing" },
  { label: "Payments", href: "/payments" },
  { label: "Past Due Portal", href: "/past-due" },
  { label: "Commission Data", href: "/commission" },
  { label: "Portfolio", href: "/portfolio" },
  { label: "Enrollment", href: "/enrollment" },
];

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
}

export default function Layout({ children, title }: LayoutProps) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const initAuth = () => {
      const u = getUser();
      if (!u) {
        router.push("/login");
        return;
      }
      setUser(u);
    };
    initAuth();
  }, [router]);

  const handleLogout = () => {
    clearAuth();
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-slate-900 text-white shadow-lg flex-shrink-0">
        <div className="max-w-screen-xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <Link
              href="/"
              className="flex items-center gap-2 font-bold text-lg tracking-tight"
            >
              <span className="text-sky-400">⚡</span>
              <span>ORBIC</span>
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-1">
              {NAV_MODULES.map((m) => (
                <Link
                  key={m.href}
                  href={m.href}
                  className={`px-3 py-2 rounded text-sm font-medium transition-colors
                    ${
                      router.pathname.startsWith(m.href)
                        ? "bg-sky-500 text-white"
                        : "text-slate-300 hover:text-white hover:bg-slate-700"
                    }`}
                >
                  {m.label}
                </Link>
              ))}
            </nav>

            {/* User menu */}
            <div className="flex items-center gap-3">
              {user && (
                <span className="text-sm text-slate-400 hidden md:block">
                  {user.username}
                </span>
              )}
              <button
                onClick={handleLogout}
                className="text-sm text-slate-400 hover:text-white transition-colors px-3 py-1.5 rounded border border-slate-700 hover:border-slate-500"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Page title bar */}
      {title && (
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex-shrink-0">
          <div className="max-w-screen-xl mx-auto">
            <h1 className="text-lg font-semibold text-gray-800">{title}</h1>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="max-w-screen-xl mx-auto px-4 py-6 w-full flex-grow">
        {children}
      </main>
    </div>
  );
}
