import { useRouter } from "next/router";
import { clearAuth, getUser } from "../utils/auth";
import { Zap, LogOut, Settings, LayoutDashboard } from "lucide-react";

interface Props {
  children: React.ReactNode;
  title?: string;
}

export default function Layout({ children, title }: Props) {
  const router = useRouter();
  const user = getUser();

  function logout() {
    clearAuth();
    router.push("/login");
  }

  const isAdmin = user?.role === "1";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-blue-700 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 rounded-lg p-1.5">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-white font-bold text-sm leading-tight">
                  Multi Meter Management Portal
                </h1>
                {title && (
                  <p className="text-blue-200 text-xs leading-tight">{title}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4">
              {isAdmin && (
                <nav className="hidden sm:flex items-center gap-1">
                  <button
                    onClick={() => router.push("/admin")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      router.pathname.startsWith("/admin")
                        ? "bg-white/20 text-white"
                        : "text-blue-200 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    <Settings className="h-3.5 w-3.5" />
                    Admin
                  </button>
                  <button
                    onClick={() => router.push("/dashboard")}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-blue-200 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <LayoutDashboard className="h-3.5 w-3.5" />
                    Portal
                  </button>
                </nav>
              )}

              <div className="flex items-center gap-3">
                <span className="text-blue-100 text-sm hidden sm:block">
                  Welcome, <span className="font-semibold text-white">{user?.username}</span>
                </span>
                <button
                  onClick={logout}
                  className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
