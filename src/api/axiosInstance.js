// src/api/axiosInstance.js
import axios from "axios";

/**
 * Base URL configuration
 * Prefer REACT_APP_API_URL, fallback to localhost FastAPI.
 * Accept either REACT_APP_API_URL or REACT_APP_API_BASE (common names).
 */
const RAW_BASE =
  (process.env.REACT_APP_API_URL && process.env.REACT_APP_API_URL.trim()) ||
  (process.env.REACT_APP_API_BASE && process.env.REACT_APP_API_BASE.trim()) ||
  "http://127.0.0.1:8000";

// Normalize: remove trailing slash to avoid double-slash when joining paths
const baseURL = RAW_BASE.replace(/\/+$/, "");

/**
 * Control whether to send cookies/auth with requests.
 * Set REACT_APP_SEND_CREDENTIALS=true in .env to enable.
 */
const WITH_CREDENTIALS = String(process.env.REACT_APP_SEND_CREDENTIALS || "").toLowerCase() === "true";

/**
 * Create a reusable Axios instance
 */
const axiosInstance = axios.create({
  baseURL,
  timeout: Number(process.env.REACT_APP_AXIOS_TIMEOUT_MS) || 30000, // default 30s, configurable
  headers: {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json",
  },
  withCredentials: WITH_CREDENTIALS,
});

/**
 * Request interceptor — useful to add auth headers centrally in future.
 * Keep minimal and safe for now.
 */
axiosInstance.interceptors.request.use(
  (config) => {
    // Example: attach bearer token if you store one in localStorage (uncomment if used)
    // const token = localStorage.getItem("access_token");
    // if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * Response interceptor for cleaner errors
 * Produces an Error with a helpful message while preserving axios behaviour.
 */
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    let message = "Unexpected API Error";

    if (error.response) {
      const respData = error.response.data;
      // Safely compute message from common shapes
      if (respData && typeof respData === "object") {
        message =
          respData.detail ||
          respData.message ||
          respData.error ||
          JSON.stringify(respData).slice(0, 1000);
      } else if (typeof respData === "string") {
        message = respData.slice(0, 1000);
      } else {
        message = `HTTP ${error.response.status} - ${error.response.statusText}`;
      }
    } else if (error.request) {
      // Request was made but no response received
      message = "No response from server. Is the backend running and accessible?";
    } else if (error.message) {
      message = error.message;
    }

    // Log full error for debugging (but we throw a concise message)
    // eslint-disable-next-line no-console
    console.error("[Axios Error]", {
      message,
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
      raw: error,
    });

    return Promise.reject(new Error(message));
  }
);

export default axiosInstance;
