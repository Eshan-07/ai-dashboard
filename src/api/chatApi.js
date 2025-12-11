// src/api/chatApi.js
// Robust chat API helper that uses a BASE (proxy-friendly), supports timeouts,
// and falls back to GET /chat/ask if POST /chat/respond is missing.

const RAW_BASE = process.env.REACT_APP_API_URL || process.env.REACT_APP_API_BASE || "";
// normalize base to no trailing slash (so we can safely join paths)
const BASE = RAW_BASE ? RAW_BASE.replace(/\/+$/, "") : "";

// If you need to send cookies/session auth, set env REACT_APP_SEND_CREDENTIALS=true
const SEND_CREDENTIALS = String(process.env.REACT_APP_SEND_CREDENTIALS || "").toLowerCase() === "true";

// Default timeout for fetch requests (ms)
const DEFAULT_TIMEOUT_MS = Number(process.env.REACT_APP_FETCH_TIMEOUT_MS) || 30000;

async function _fetchJson(url, opts = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const finalOpts = {
      credentials: SEND_CREDENTIALS ? "include" : "same-origin",
      headers: {
        Accept: "application/json, text/plain, */*",
        ...(opts.headers || {}),
      },
      signal: controller.signal,
      ...opts,
    };

    const res = await fetch(url, finalOpts);

    // get content-type safely
    const contentType = (res.headers && (res.headers.get ? res.headers.get("content-type") : res.headers["content-type"])) || "";
    const ctLower = (contentType || "").toLowerCase();

    // If HTML returned (common when dev server serves index.html for unknown API path)
    if (ctLower.includes("text/html")) {
      const txt = await res.text().catch(() => "<could not read html body>");
      const snippet = txt.length > 800 ? txt.slice(0, 800) + "..." : txt;
      throw new Error(
        `Expected JSON but received HTML. This often means the API path is wrong or the backend returned an HTML error page. Snippet: ${snippet}`
      );
    }

    // Try to parse JSON; if parsing fails, return helpful raw preview
    let json;
    try {
      json = await res.json();
    } catch (parseErr) {
      const raw = await res.text().catch(() => "<could not read body>");
      throw new Error(`Failed to parse JSON response. Raw response: ${raw}`);
    }

    // Non-2xx -> surface backend-provided message if available
    if (!res.ok) {
      const msg =
        (json && (json.detail || json.error || json.message)) ||
        (typeof json === "string" ? json : JSON.stringify(json)) ||
        res.statusText ||
        `HTTP ${res.status}`;
      const preview = typeof json === "string" ? json.slice(0, 1000) : JSON.stringify(json).slice(0, 1000);
      throw new Error(`Request failed ${res.status}: ${msg}. Preview: ${preview}`);
    }

    return json;
  } catch (err) {
    // Normalize abort error
    if (err && (err.name === "AbortError" || (typeof err === "object" && err !== null && "name" in err && err.name === "AbortError"))) {
      throw new Error(`Request aborted due to timeout (${timeoutMs} ms).`);
    }
    // rethrow as Error if it's a string
    if (typeof err === "string") throw new Error(err);
    throw err;
  } finally {
    clearTimeout(id);
  }
}

/**
 * sendQuestion
 * @param {string} question - user question text (required)
 * @param {string|null} datasetPath - optional dataset path or dataset id (sent as `dataset`)
 * @param {string|null} userId - optional user id (sent as `user_id`)
 * @param {number} topK - optional top-k / n for results
 * @param {object} opts - optional { timeoutMs } in milliseconds
 * @returns parsed JSON response from backend
 */
export async function sendQuestion(question, datasetPath = null, userId = null, topK = 5, opts = {}) {
  if (!question || typeof question !== "string") {
    throw new Error("sendQuestion: 'question' must be a non-empty string");
  }

  const payload = { message: question, top_k: Number(topK) || 5 };
  if (datasetPath) payload.dataset = datasetPath;
  if (userId) payload.user_id = userId;

  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;

  // Build POST URL for /chat/respond (absolute if BASE set, else relative)
  const postUrl = `${BASE || ""}/chat/respond`.replace(/([^:]\/)\/+/g, "$1"); // collapse duplicate slashes

  // 1) Try POST /chat/respond first
  try {
    return await _fetchJson(
      postUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
      timeoutMs
    );
  } catch (postErr) {
    // Decide whether to fall back to GET /chat/ask:
    // fallback on 404, "not found", "cannot post", or HTML-index responses (our _fetchJson message contains these words).
    const postMsg = String(postErr && postErr.message ? postErr.message : postErr || "").toLowerCase();
    const shouldFallback =
      postMsg.includes("404") ||
      postMsg.includes("not found") ||
      postMsg.includes("cannot post") ||
      postMsg.includes("expected json but received html") ||
      postMsg.includes("html");

    // If not a friendly fallback case, rethrow the original error
    if (!shouldFallback) {
      // normalize to Error before throwing
      if (postErr instanceof Error) throw postErr;
      throw new Error(String(postErr));
    }

    // FALLBACK: call GET /chat/ask?message=...
    try {
      const params = new URLSearchParams();
      params.set("message", question);
      if (datasetPath) params.set("dataset", datasetPath);
      if (userId) params.set("user_id", userId);
      params.set("top_k", String(Number(topK) || 5));

      const getUrl = `${BASE || ""}/chat/ask?${params.toString()}`.replace(/([^:]\/)\/+/g, "$1");
      return await _fetchJson(
        getUrl,
        {
          method: "GET",
        },
        timeoutMs
      );
    } catch (getErr) {
      // If fallback failed, surface a combined error for easier debugging
      const postMsgSafe = String(postErr && postErr.message ? postErr.message : postErr || "");
      const getMsgSafe = String(getErr && getErr.message ? getErr.message : getErr || "");
      throw new Error(`POST /chat/respond failed: ${postMsgSafe}. Fallback GET /chat/ask also failed: ${getMsgSafe}`);
    }
  }
}

/**
 * runQuery - convenience wrapper that maps older call signature (question, filters, datasetPath)
 * to sendQuestion. Filters are ignored here for chat.
 */
export async function runQuery(question = "", filters = {}, datasetPath = "") {
  return sendQuestion(question, datasetPath || null, null, 5);
}
