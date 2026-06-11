import axios from "axios";

const api = axios.create({
  baseURL: "/api/consumer",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("mp_token") : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("mp_token");
      localStorage.removeItem("mp_user");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default api;
