import { useState } from "react";
import { useRouter } from "next/router";
import { setAuth, isLoggedIn } from "../utils/auth";
import api from "../utils/api";

export default function LoginPage() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (typeof window !== "undefined" && isLoggedIn()) {
    router.replace("/home");
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.post("/auth/login", { login, password: pass });
      const data = res.data;
      if (!data.success) {
        setError(data.message || "Wrong login/password. Please try again.");
      } else {
        setAuth(data.token, {
          user_id:        data.user_id,
          username:       data.username,
          role:           String(data.role),
          email:          data.email,
          broker_id:      data.broker_id,
          has_commission: data.has_commission ?? false,
        });
        router.push("/home");
      }
    } catch {
      setError("Wrong login/password. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">

      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12"
        style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e3a8a 60%, #1d4ed8 100%)" }}>
        <div>
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-white text-xl font-bold tracking-wide">Orbic</span>
          </div>

          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            Broker Portal
          </h1>
          <p className="text-blue-200 text-lg leading-relaxed">
            Manage pricing, renewals, forms, and client contracts — all in one place.
          </p>
        </div>

        <div className="space-y-4">
          {[
            ["Daily Pricing", "Real-time quotes for all TDSPs"],
            ["Renewals", "Track and manage active renewal accounts"],
            ["Forms & Contracts", "Generate PDFs instantly"],
          ].map(([title, sub]) => (
            <div key={title} className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-blue-400/30 flex items-center justify-center mt-0.5 shrink-0">
                <div className="w-2 h-2 rounded-full bg-blue-300" />
              </div>
              <div>
                <p className="text-white text-sm font-medium">{title}</p>
                <p className="text-blue-300 text-xs">{sub}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="text-blue-400 text-xs">
          &copy; 2025 Orbic Broker Portal. All Rights Reserved.
        </p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 bg-slate-50">
        <div className="w-full max-w-md">

          {/* Mobile header */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
              style={{ background: "linear-gradient(135deg, #1e3a8a, #1d4ed8)" }}>
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Orbic Broker Portal</h1>
          </div>

          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
            <div className="mb-7">
              <h2 className="text-2xl font-bold text-gray-900">Welcome back</h2>
              <p className="text-sm text-gray-500 mt-1">Sign in to your broker account</p>
            </div>

            {error && (
              <div className="mb-5 flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Username or Email
                </label>
                <input
                  type="text"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  placeholder="Enter your username"
                  className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-gray-700">Password</label>
                  <a onClick={() => router.push("/forgot-password")}
                    className="text-xs text-blue-600 hover:text-blue-700 cursor-pointer hover:underline">
                    Forgot password?
                  </a>
                </div>
                <input
                  type="password"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-60"
                style={{ background: loading ? "#3b82f6" : "linear-gradient(135deg, #1e3a8a, #1d4ed8)" }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Signing in…
                  </span>
                ) : "Sign In"}
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-gray-400 mt-6">
            &copy; 2025 Orbic Broker Portal &mdash; All Rights Reserved
          </p>
        </div>
      </div>

    </div>
  );
}
