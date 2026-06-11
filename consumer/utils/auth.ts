export interface User {
  user_id: number;
  username: string;
  role: string;
  email: string;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("mp_token");
}

export function getUser(): User | null {
  if (typeof window === "undefined") return null;
  const u = localStorage.getItem("mp_user");
  return u ? JSON.parse(u) : null;
}

export function setAuth(token: string, user: User) {
  localStorage.setItem("mp_token", token);
  localStorage.setItem("mp_user", JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem("mp_token");
  localStorage.removeItem("mp_user");
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

export function isAdmin(): boolean {
  const user = getUser();
  return user?.role === "1";
}
