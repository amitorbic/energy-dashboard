import axios from "axios";

const api = axios.create({
  baseURL: "/api/broker",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("broker_token") : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("broker_token");
      localStorage.removeItem("broker_user");
      window.location.href = "/";
    }
    return Promise.reject(err);
  }
);

export default api;
