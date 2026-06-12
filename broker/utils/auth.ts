export interface User {
  user_id: number;
  username: string;
  role: string;
  email: string;
  broker_id: string;
  has_commission?: boolean;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("broker_token");
}

export function getUser(): User | null {
  if (typeof window === "undefined") return null;
  const u = localStorage.getItem("broker_user");
  return u ? JSON.parse(u) : null;
}

export function setAuth(token: string, user: User) {
  localStorage.setItem("broker_token", token);
  localStorage.setItem("broker_user", JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem("broker_token");
  localStorage.removeItem("broker_user");
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

export function isAdmin(): boolean {
  const user = getUser();
  return user?.role === "1";
}
