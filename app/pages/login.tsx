import { useState } from 'react';
import { useRouter } from 'next/router';
import api from '../utils/api';
import { setAuth } from '../utils/auth';

export default function LoginPage() {
  const router = useRouter();
  const [login, setLogin]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { login, password });
      const data = res.data;
      if (data.success && data.token) {
        setAuth(data.token, {
          user_id:  data.user_id,
          username: data.username,
          role:     String(data.role),
          email:    data.email
        });
        router.push('/');
      } else {
        setError(data.message || 'Login failed');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Server error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      {/* Background grid */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(56,189,248,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(56,189,248,0.03)_1px,transparent_1px)] bg-[size:48px_48px]" />

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 text-2xl font-bold text-white">
            <span className="text-sky-400 text-3xl">⚡</span>
            Ameri<span className="text-sky-400">Power</span>
          </div>
          <p className="text-slate-400 text-sm mt-2">Energy Intelligence Platform</p>
        </div>

        {/* Card */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 shadow-2xl">
          <h2 className="text-white text-lg font-semibold mb-6">Sign in to your account</h2>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-3 mb-5">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-slate-400 text-xs font-medium mb-1.5 uppercase tracking-wide">
                Username or Email
              </label>
              <input
                type="text"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                required
                autoFocus
                className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-4 py-2.5 text-sm
                           placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-colors"
                placeholder="Enter username or email"
              />
            </div>

            <div>
              <label className="block text-slate-400 text-xs font-medium mb-1.5 uppercase tracking-wide">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-4 py-2.5 text-sm
                           placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-colors"
                placeholder="Enter password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-sky-500 hover:bg-sky-400 disabled:bg-sky-500/50 text-white font-semibold
                         rounded-lg px-4 py-2.5 text-sm transition-colors mt-2 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                  Signing in...
                </>
              ) : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">
          ORBIC Internal Applications
        </p>
      </div>
    </div>
  );
}
