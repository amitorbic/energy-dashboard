export interface User {
  user_id: number;
  username: string;
  role: string;
  email: string;
  company_name: string;
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
