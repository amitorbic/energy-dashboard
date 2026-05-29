import axios from "axios";

// 1. Create the instance
const api = axios.create({
  baseURL: "/api", // Your interceptor already handles the /api prefix
  headers: { "Content-Type": "application/json" },
});

// Attach JWT to every request automatically
api.interceptors.request.use((config) => {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("ap_token") : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Redirect to login on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("ap_token");
      localStorage.removeItem("ap_user");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  },
);

// 2. Named Exports (Using the 'api' instance instead of 'axios')
export const uploadGasStrip = async (file: File) => {
  const formData = new FormData();
  formData.append("file", file);
  // We use api.post so the interceptor adds your token!
  return await api.post("/pricing/gas-strip/upload", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
};

export const fetchDates = async () => {
  return await api.get("/pricing/gas-strip/dates");
};

export const downloadSample = async () => {
  return await api.get("/pricing/gas-strip/download-sample", {
    responseType: "blob",
  });
};
export const fetchLastUpdated = async () => {
  return await api.get("/pricing/gas-strip/last-updated");
};

// --- Heat Rate API Calls ---

/**
 * Uploads the Heat Rate Excel Matrix
 */
export const uploadHeatRate = async (file: File) => {
  const formData = new FormData();
  formData.append("file", file);
  return await api.post("/pricing/heat-rate/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

/**
 * Fetches the most recent upload timestamp for the UI badge
 */
export const fetchHeatRateLastUpdated = async () => {
  return await api.get("/pricing/heat-rate/last-updated");
};

/**
 * Downloads the Excel sample file as a Blob
 */
export const downloadHeatRateSample = async () => {
  return await api.get("/pricing/heat-rate/download-sample", {
    responseType: "blob", // Crucial for downloading binary files
  });
};

// Consumption
export const uploadConsumption = (file: File) => {
  const formData = new FormData();
  formData.append("file", file);
  return api.post("/pricing/consumption/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

export const downloadConsumptionCurrent = () =>
  api.get("/pricing/consumption/download-current", { responseType: "blob" });

export const fetchConsumptionLastUpdated = () =>
  api.get("/pricing/consumption/last-updated");

// Margin Endpoints
export const uploadMargin = (formData: FormData) =>
  api.post("/pricing/margin/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });

export const getMarginLastUpdated = () =>
  api.get("/pricing/margin/last-updated");

export const getMarginView = () => api.get("/pricing/margin/view");

export const getTDSPValues = () => api.get("/pricing/tdsp/values");
export const updateTDSPValues = (data: Record<string, number>) =>
  api.post("/pricing/tdsp/update", data);
export const getSupplierValues = () => api.get("/pricing/supplier/values");
export const updateSupplierValues = (data: Record<string, number>) =>
  api.post("/pricing/supplier/update", data);
// Fetches the 4x12 matrix for a specific start month
export const getDailyMatrix = (startMonth: string, terms: number[]) => {
  const termString = terms.join(",");
  // Ensure this matches your Backend Router prefix exactly
  return api.get(
    `/pricing/daily-matrix?start_month=${startMonth}&terms=${termString}`,
  );
};

// Fetches the last update timestamp for charges
export const getChargeStatus = (type: "tdsp" | "supplier") => {
  const endpoint = type === "tdsp" ? "tdsp" : "supplier";
  return api.get(`/pricing/charges/${endpoint}/last-updated`);
};

// Generic helper for status if you prefer dynamic paths
export const getStatus = (
  path: string,
): Promise<{ data: { latest: string | null } }> => api.get(path);
// Add this to your existing api.ts file
export const exportMatrixExcel = (
  startDate: string,
  terms: number[],
  numMonths: number,
  priceType: string,
) => {
  const termString = terms.join(",");
  return api.get(
    `/pricing/export-excel?start_date=${startDate}&terms=${termString}&num_months=${numMonths}&price_type=${priceType}`,
    { responseType: "blob" },
  );
};
// Keep this if other files still import 'api' as a default
export default api;
/**
 * Uploads usage Excel file for a specific customer
 */
export const uploadCustomerUsage = async (cid: string | number, file: File) => {
  const formData = new FormData();
  // Key must be "file" to match your FastAPI: file: UploadFile = File(...)
  formData.append("file", file);

  return await api.post(`/customers/${cid}/upload-usage`, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
};
