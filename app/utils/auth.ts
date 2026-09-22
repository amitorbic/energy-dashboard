export interface User {
  user_id: number;
  username: string;
  role: string;
  email: string;
  company_name: string;
  // Enabled product modules for this tenant ('sales' | 'operations' | 'portfolio' | 'audit').
  // Absent/undefined means "all modules" (fail-open) — see api/utils/tenant_modules.py.
  modules?: string[];
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('ap_token');
}

export function getUser(): User | null {
  if (typeof window === 'undefined') return null;
  const u = localStorage.getItem('ap_user');
  return u ? JSON.parse(u) : null;
}

export function setAuth(token: string, user: User) {
  localStorage.setItem('ap_token', token);
  localStorage.setItem('ap_user', JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem('ap_token');
  localStorage.removeItem('ap_user');
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

export function getRole(): string {
  const user = getUser();
  return user?.role || '';
}

export function isAdmin(): boolean {
  return getRole() === '1';
}

// Fail-open: no `modules` on the user (legacy token, or entitlements not yet
// configured for this tenant) means unrestricted/full access.
export function hasModule(moduleKey: string): boolean {
  const user = getUser();
  if (!user || !user.modules) return true;
  return user.modules.includes(moduleKey);
}
