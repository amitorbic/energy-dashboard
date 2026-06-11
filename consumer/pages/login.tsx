import { useState } from "react";
import { useRouter } from "next/router";
import { Zap } from "lucide-react";
import api from "../utils/api";
import { setAuth } from "../utils/auth";

export default function LoginPage() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.post("/auth/login", { login, password });
      const data = res.data;
      if (data.success && data.token) {
        setAuth(data.token, {
          user_id: data.user_id,
          username: data.username,
          role: String(data.role),
          email: data.email,
        });
        router.push(data.role === 1 ? "/admin" : "/dashboard");
      } else {
        setError(data.message || "Login failed");
      }
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data
              ?.detail
          : undefined;
      setError(msg || "Invalid login or password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl shadow-lg mb-4">
            <Zap className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            Multi Meter Management Portal
          </h1>
          <p className="text-gray-500 text-sm mt-1">Sign in to your account</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-5">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-1.5">
                Username or Email
              </label>
              <input
                type="text"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                required
                autoFocus
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-900
                           focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                placeholder="Enter your username"
              />
            </div>

            <div>
              <label className="block text-gray-700 text-sm font-medium mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-900
                           focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                placeholder="Enter your password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold
                         rounded-lg px-4 py-2.5 text-sm transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z"
                    />
                  </svg>
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
