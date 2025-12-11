// src/api/dashboardApi.js
import api from "./axiosInstance";

/**
 * Defensive helper: return resp.data for axios responses or parsed JSON for fetch responses.
 * Throws Error with readable message if response is not JSON or not ok.
 */
function ensureJsonResponse(resp) {
  if (!resp) throw new Error("No response from API");

  // Axios response object: { data, status, headers, ... }
  if (resp.data !== undefined) {
    return resp.data;
  }

  // Fetch Response object: resp is Response
  if (typeof resp.json === "function") {
    // Note: caller should await resp.json() before calling ensureJsonResponse for fetch responses
    throw new Error("ensureJsonResponse received a raw fetch Response; caller must parse JSON first");
  }

  // Fallback
  throw new Error("Unexpected response shape from API");
}

/* -------------------------------------------------------------------------- */
/* 1. Natural Language Query Endpoints                                        */
/* -------------------------------------------------------------------------- */

/**
 * Run a natural-language query (GET /chat/ask).
 * Returns parsed JSON or throws Error with helpful message.
 */
export async function runQuery(question = "", filters = {}, datasetPath = "") {
  try {
    const params = { message: question || "" };
    if (datasetPath) params.dataset = datasetPath;
    if (filters && Object.keys(filters).length > 0) {
      params.filters = JSON.stringify(filters);
    }

    const resp = await api.get("/chat/ask", { params });
    return ensureJsonResponse(resp);
  } catch (err) {
    // axios error objects include err.response
    if (err && err.response) {
      const status = err.response.status;
      const data = err.response.data;
      const preview = typeof data === "string" ? data : JSON.stringify(data).slice(0, 1500);
      const msg = `runQuery failed ${status}: ${preview}`;
      console.error("[runQuery]", msg);
      throw new Error(msg);
    }
    const msg = err?.message || String(err) || "runQuery failed";
    console.error("[runQuery]", msg);
    throw new Error(msg);
  }
}

/* -------------------------------------------------------------------------- */
/* Filters                                                                    */
/* -------------------------------------------------------------------------- */

export const applyFilters = async (filters = {}, question = "") => {
  try {
    const resp = await api.post("/filter", { filters, question });
    return ensureJsonResponse(resp);
  } catch (err) {
    if (err && err.response) {
      const status = err.response.status;
      const data = err.response.data;
      const preview = typeof data === "string" ? data : JSON.stringify(data).slice(0, 1500);
      const msg = `applyFilters failed ${status}: ${preview}`;
      console.error("[applyFilters]", msg);
      throw new Error(msg);
    }
    const msg = err?.message || String(err) || "applyFilters failed";
    console.error("[applyFilters]", msg);
    throw new Error(msg);
  }
};

export const getFilterOptions = async () => {
  try {
    const resp = await api.get("/filters/options");
    return ensureJsonResponse(resp);
  } catch (err) {
    if (err && err.response) {
      const status = err.response.status;
      const data = err.response.data;
      const preview = typeof data === "string" ? data : JSON.stringify(data).slice(0, 1500);
      const msg = `getFilterOptions failed ${status}: ${preview}`;
      console.error("[getFilterOptions]", msg);
      throw new Error(msg);
    }
    const msg = err?.message || String(err) || "getFilterOptions failed";
    console.error("[getFilterOptions]", msg);
    throw new Error(msg);
  }
};

/* -------------------------------------------------------------------------- */
/* 2. File Upload & Dataset Management                                        */
/* -------------------------------------------------------------------------- */

/**
 * Upload dataset file (CSV/JSON/Excel) using native fetch to ensure correct multipart boundaries.
 * Returns parsed JSON object on success; throws Error on failure.
 *
 * - If api.defaults.baseURL is set in axiosInstance, we use that as the base for fetch.
 * - This avoids the common axios multipart boundary/content-type pitfall.
 */
export const uploadFile = async (file, onUploadProgress = null) => {
  if (!file) throw new Error("uploadFile: file required");

  try {
    // Build absolute/relative URL based on axios instance baseURL
    const base = (api && api.defaults && api.defaults.baseURL) ? api.defaults.baseURL.replace(/\/+$/, "") : "";
    const url = (base || "") + "/upload/";

    // Create FormData and append the file field name MUST be "file"
    const formData = new FormData();
    formData.append("file", file);

    // If caller provided a progress callback, we cannot use fetch's native upload progress directly
    // here. For now, log start and end. If you need progress with XHR, switch to an xhr wrapper.
    console.log("[uploadFile] starting upload", file.name, "to", url);

    const resp = await fetch(url, {
      method: "POST",
      body: formData,
      // DO NOT set Content-Type; browser will set multipart boundary
      // If you require credentials/cookies: add credentials: 'include'
    });

    const text = await resp.text().catch(() => "");
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (parseErr) {
      // server returned non-JSON (helpful debug)
      const snippet = text ? text.slice(0, 1000) : "<empty body>";
      const msg = `Upload failed: server returned non-JSON response (status ${resp.status}). Preview: ${snippet}`;
      console.error("[uploadFile]", msg);
      throw new Error(msg);
    }

    if (!resp.ok) {
      const preview = typeof data === "string" ? data : JSON.stringify(data).slice(0, 1500);
      const msg = `Upload failed ${resp.status}: ${preview}`;
      console.error("[uploadFile]", msg);
      throw new Error(msg);
    }

    console.log("[uploadFile] success", data);
    return data;
  } catch (err) {
    const msg = err?.message || String(err) || "Upload failed (unknown error)";
    console.error("[uploadFile] error:", msg);
    throw new Error(msg);
  }
};

/* List saved datasets */
export const listDatasets = async (limit = 20) => {
  try {
    const resp = await api.get("/upload/list", { params: { limit } });
    return ensureJsonResponse(resp);
  } catch (err) {
    if (err && err.response) {
      const msg = `listDatasets failed ${err.response.status}: ${JSON.stringify(err.response.data || {}).slice(0, 1000)}`;
      console.error("[listDatasets]", msg);
      throw new Error(msg);
    }
    const msg = err?.message || String(err) || "listDatasets failed";
    console.error("[listDatasets]", msg);
    throw new Error(msg);
  }
};

export const deleteDataset = async (datasetId) => {
  if (!datasetId) throw new Error("deleteDataset: datasetId required");
  try {
    const resp = await api.delete(`/upload/${encodeURIComponent(datasetId)}`);
    return ensureJsonResponse(resp);
  } catch (err) {
    if (err && err.response) {
      const msg = `deleteDataset failed ${err.response.status}: ${JSON.stringify(err.response.data || {}).slice(0, 1000)}`;
      console.error("[deleteDataset]", msg);
      throw new Error(msg);
    }
    const msg = err?.message || String(err) || "deleteDataset failed";
    console.error("[deleteDataset]", msg);
    throw new Error(msg);
  }
};

/* -------------------------------------------------------------------------- */
/* 3. Chart Suggestions / Insight Endpoints                                   */
/* -------------------------------------------------------------------------- */

export const suggestCharts = async (datasetId, top_n = 5) => {
  if (!datasetId) throw new Error("suggestCharts: datasetId required");
  try {
    const resp = await api.post("/charts/suggest", { dataset_id: datasetId, top_n });
    return ensureJsonResponse(resp);
  } catch (err) {
    if (err && err.response) {
      const msg = `suggestCharts failed ${err.response.status}: ${JSON.stringify(err.response.data || {}).slice(0, 1000)}`;
      console.error("[suggestCharts]", msg);
      throw new Error(msg);
    }
    const msg = err?.message || String(err) || "suggestCharts failed";
    console.error("[suggestCharts]", msg);
    throw new Error(msg);
  }
};

export const postRenderData = async (datasetId, chartSpec, maxSampleRows = 2000) => {
  if (!datasetId) throw new Error("postRenderData: datasetId required");
  try {
    const payload = { dataset_id: datasetId, chart_spec: chartSpec, max_sample_rows: maxSampleRows };
    const resp = await api.post("/charts/render-data", payload);
    return ensureJsonResponse(resp);
  } catch (err) {
    if (err && err.response) {
      const msg = `postRenderData failed ${err.response.status}: ${JSON.stringify(err.response.data || {}).slice(0, 1000)}`;
      console.error("[postRenderData]", msg);
      throw new Error(msg);
    }
    const msg = err?.message || String(err) || "postRenderData failed";
    console.error("[postRenderData]", msg);
    throw new Error(msg);
  }
};

/* -------------------------------------------------------------------------- */
/* 4. Dataset Listing + Chart Integration Helper                              */
/* -------------------------------------------------------------------------- */

export const getDatasetCharts = async (datasetId, top_n = 5, maxSampleRows = 2000) => {
  if (!datasetId) throw new Error("getDatasetCharts: datasetId required");
  try {
    const suggestions = await suggestCharts(datasetId, top_n);
    const suggs = (suggestions && (suggestions.suggestions || suggestions)) || [];
    const rendered = [];

    for (const s of suggs) {
      try {
        const chartData = await postRenderData(datasetId, s, maxSampleRows);
        rendered.push({
          spec: (chartData && chartData.chart_spec) || s,
          aggregated:
            (chartData && (chartData.aggregated || chartData.aggregations)) || null,
        });
      } catch (errInner) {
        const msgInner = errInner?.message || String(errInner) || "Chart render failed";
        console.error("[getDatasetCharts] single render error:", msgInner);
        // continue with other charts
      }
    }

    return rendered;
  } catch (err) {
    const msg = err?.message || String(err) || "getDatasetCharts failed";
    console.error("[getDatasetCharts]", msg);
    throw new Error(msg);
  }
};

/* -------------------------------------------------------------------------- */
/* 5. Utility: Centralized Error Wrapper                                      */
/* -------------------------------------------------------------------------- */

export const safeApiCall = async (fn, ...args) => {
  try {
    return await fn(...args);
  } catch (err) {
    if (err && err.response) {
      const status = err.response.status;
      const bodyPreview =
        typeof err.response.data === "string"
          ? err.response.data
          : JSON.stringify(err.response.data || {}).slice(0, 1000);
      const msg = `API error ${status}: ${bodyPreview}`;
      console.error("[safeApiCall]", msg);
      throw new Error(msg);
    }
    const msg = err?.message || String(err) || "API error";
    console.error("[safeApiCall]", msg);
    throw new Error(msg);
  }
};
