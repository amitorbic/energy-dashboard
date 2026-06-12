import { useState } from "react";
import { useRouter } from "next/router";
import api from "../utils/api";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail]   = useState("");
  const [name, setName]     = useState("");
  const [msg, setMsg]       = useState("");
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setError("");
    setLoading(true);
    try {
      const res = await api.post("/auth/forgot-password", { email, name });
      if (res.data.success) {
        setMsg(res.data.message);
      } else {
        setError(res.data.message);
      }
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">

      {/* Header — mirrors forget_password.php header.top */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center">
          <img
            src="/images/orbic.png"
            alt="Orbic"
            className="h-8"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        </div>
      </header>

      {/* Forget-pass box — mirrors forget_password.php login-box / forget_pass section */}
      <div className="flex-1 flex items-center justify-center py-12 px-4">
        <div className="bg-white rounded shadow-md p-8 w-full max-w-sm">

          <h2 className="text-center text-lg font-bold text-gray-800 mb-5">
            Forgot Password
          </h2>

          {/* Status messages — mirrors PHP echo $msg */}
          {msg && (
            <p className="text-center text-green-700 text-sm mb-4 border border-green-200 bg-green-50 rounded px-3 py-2">
              {msg}
            </p>
          )}
          {error && (
            <p className="text-center text-red-600 text-sm mb-4 border border-red-200 bg-red-50 rounded px-3 py-2">
              {error}
            </p>
          )}

          {/* Form — mirrors forget_password.php form[name=forget] */}
          <form name="forget" onSubmit={handleSubmit} className="space-y-3">
            <div className="flex items-center gap-2">
              <label className="w-32 text-sm text-gray-700 shrink-0">Enter Email ID :</label>
              <input
                type="email"
                name="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email id"
                className="flex-1 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
                required
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="w-32 text-sm text-gray-700 shrink-0">Enter UserName :</label>
              <input
                type="text"
                name="name"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="UserName"
                className="flex-1 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
                required
              />
            </div>

            {/* Buttons — mirrors PHP Back + Submit buttons */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                name="back"
                onClick={() => router.push("/")}
                className="flex-1 border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium py-2 rounded text-sm transition-colors"
              >
                Back
              </button>
              <input
                type="submit"
                name="submit"
                value={loading ? "Submitting..." : "Submit"}
                disabled={loading}
                className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 text-white font-medium py-2 rounded text-sm cursor-pointer transition-colors"
              />
            </div>
          </form>

        </div>
      </div>

    </div>
  );
}
