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

  // Set once the login response comes back with must_change_password: true.
  // No route change happens until the password is actually changed, so
  // there's nothing to navigate away to.
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword]       = useState('');
  const [newPassword, setNewPassword]               = useState('');
  const [confirmPassword, setConfirmPassword]       = useState('');
  const [pwError, setPwError]                       = useState('');
  const [pwLoading, setPwLoading]                   = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { login, password });
      const data = res.data;
      if (data.success && data.token) {
        setAuth(data.token, {
          user_id:              data.user_id,
          username:             data.username,
          role:                 String(data.role),
          email:                data.email,
          company_name:         data.company_name ?? "",
          modules:              data.modules ?? undefined,
          must_change_password: !!data.must_change_password,
        });
        if (data.must_change_password) {
          setMustChangePassword(true);
        } else {
          router.push('/');
        }
      } else {
        setError(data.message || 'Login failed');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Server error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    if (newPassword !== confirmPassword) {
      setPwError('New passwords do not match');
      return;
    }
    setPwLoading(true);
    try {
      const res = await api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password:      newPassword,
      });
      const data = res.data;
      if (data.success && data.token) {
        setAuth(data.token, {
          user_id:              data.user_id,
          username:             data.username,
          role:                 String(data.role),
          email:                data.email,
          company_name:         data.company_name ?? "",
          modules:              data.modules ?? undefined,
          must_change_password: false,
        });
        router.push('/');
      } else {
        setPwError(data.message || 'Password change failed');
      }
    } catch (err: any) {
      setPwError(err.response?.data?.message || 'Server error. Please try again.');
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "var(--sb-canvas)" }}
    >
      {/* Background grid */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(38,198,217,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(38,198,217,0.03)_1px,transparent_1px)] bg-[size:48px_48px]" />

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center gap-2 text-2xl font-bold"
            style={{ color: "var(--sb-text-primary)" }}
          >
            <span className="text-3xl" style={{ color: "var(--accent-dark)" }}>⚡</span>
            ORBIC
          </div>
          <p className="text-sm mt-2" style={{ color: "var(--sb-text-secondary)" }}>
            Energy Intelligence Platform
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-[var(--r-lg)] p-8 shadow-2xl border"
          style={{ background: "var(--sb-surface)", borderColor: "var(--sb-border-default)" }}
        >
          {mustChangePassword ? (
            <>
              <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--sb-text-primary)" }}>
                Change your password
              </h2>
              <p className="text-sm mb-6" style={{ color: "var(--sb-text-secondary)" }}>
                You must set a new password before continuing.
              </p>

              {pwError && (
                <div
                  className="text-sm rounded-[var(--r-md)] px-4 py-3 mb-5 border"
                  style={{
                    background: "var(--danger-dark-tint)",
                    borderColor: "var(--danger-dark)",
                    color: "var(--danger-dark)",
                  }}
                >
                  {pwError}
                </div>
              )}

              <form onSubmit={handleChangePassword} className="space-y-4">
                <div>
                  <label
                    className="block text-xs font-medium mb-1.5 uppercase tracking-wide"
                    style={{ color: "var(--sb-text-secondary)" }}
                  >
                    Current (Temporary) Password
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    autoFocus
                    className="w-full rounded-[var(--r-md)] px-4 py-2.5 text-sm border focus:outline-none focus:ring-1 transition-colors"
                    style={{
                      background: "var(--sb-canvas)",
                      borderColor: "var(--sb-border-strong)",
                      color: "var(--sb-text-primary)",
                    }}
                    placeholder="Enter current password"
                  />
                </div>

                <div>
                  <label
                    className="block text-xs font-medium mb-1.5 uppercase tracking-wide"
                    style={{ color: "var(--sb-text-secondary)" }}
                  >
                    New Password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    className="w-full rounded-[var(--r-md)] px-4 py-2.5 text-sm border focus:outline-none focus:ring-1 transition-colors"
                    style={{
                      background: "var(--sb-canvas)",
                      borderColor: "var(--sb-border-strong)",
                      color: "var(--sb-text-primary)",
                    }}
                    placeholder="Enter new password"
                  />
                </div>

                <div>
                  <label
                    className="block text-xs font-medium mb-1.5 uppercase tracking-wide"
                    style={{ color: "var(--sb-text-secondary)" }}
                  >
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="w-full rounded-[var(--r-md)] px-4 py-2.5 text-sm border focus:outline-none focus:ring-1 transition-colors"
                    style={{
                      background: "var(--sb-canvas)",
                      borderColor: "var(--sb-border-strong)",
                      color: "var(--sb-text-primary)",
                    }}
                    placeholder="Re-enter new password"
                  />
                </div>

                <button
                  type="submit"
                  disabled={pwLoading}
                  className="w-full font-semibold rounded-[var(--r-md)] px-4 py-2.5 text-sm transition-colors mt-2 flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ background: "var(--accent-dark)", color: "var(--accent-dark-on-solid)" }}
                >
                  {pwLoading ? (
                    <>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                      </svg>
                      Updating...
                    </>
                  ) : 'Set New Password'}
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold mb-6" style={{ color: "var(--sb-text-primary)" }}>
                Sign in to your account
              </h2>

              {error && (
                <div
                  className="text-sm rounded-[var(--r-md)] px-4 py-3 mb-5 border"
                  style={{
                    background: "var(--danger-dark-tint)",
                    borderColor: "var(--danger-dark)",
                    color: "var(--danger-dark)",
                  }}
                >
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    className="block text-xs font-medium mb-1.5 uppercase tracking-wide"
                    style={{ color: "var(--sb-text-secondary)" }}
                  >
                    Username or Email
                  </label>
                  <input
                    type="text"
                    value={login}
                    onChange={(e) => setLogin(e.target.value)}
                    required
                    autoFocus
                    className="w-full rounded-[var(--r-md)] px-4 py-2.5 text-sm border focus:outline-none focus:ring-1 transition-colors"
                    style={{
                      background: "var(--sb-canvas)",
                      borderColor: "var(--sb-border-strong)",
                      color: "var(--sb-text-primary)",
                    }}
                    placeholder="Enter username or email"
                  />
                </div>

                <div>
                  <label
                    className="block text-xs font-medium mb-1.5 uppercase tracking-wide"
                    style={{ color: "var(--sb-text-secondary)" }}
                  >
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full rounded-[var(--r-md)] px-4 py-2.5 text-sm border focus:outline-none focus:ring-1 transition-colors"
                    style={{
                      background: "var(--sb-canvas)",
                      borderColor: "var(--sb-border-strong)",
                      color: "var(--sb-text-primary)",
                    }}
                    placeholder="Enter password"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full font-semibold rounded-[var(--r-md)] px-4 py-2.5 text-sm transition-colors mt-2 flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ background: "var(--accent-dark)", color: "var(--accent-dark-on-solid)" }}
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
            </>
          )}
        </div>

        <p className="text-center text-xs mt-6" style={{ color: "var(--sb-text-muted)" }}>
          ORBIC Internal Applications
        </p>
      </div>
    </div>
  );
}
