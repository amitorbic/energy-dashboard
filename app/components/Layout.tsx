"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { getUser, clearAuth, User } from "../utils/auth";
import Sidebar from "./Sidebar";

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
    <div className="flex min-h-screen" style={{ background: "var(--ct-canvas)" }}>
      <Sidebar user={user} onLogout={handleLogout} />

      <div className="flex-1 min-w-0 flex flex-col">
        {title && (
          <div
            className="px-6 py-3.5 shrink-0"
            style={{ background: "var(--ct-surface)", borderBottom: "1px solid var(--ct-border-subtle)" }}
          >
            <h1 className="text-[15px] font-semibold" style={{ color: "var(--ct-text-primary)" }}>
              {title}
            </h1>
          </div>
        )}
        <main className="flex-1 px-6 py-6" style={{ color: "var(--ct-text-primary)" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
