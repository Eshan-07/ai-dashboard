// src/components/ChatPanel.jsx
import React, { useState, useCallback } from "react";
import PropTypes from "prop-types";
import { sendQuestion } from "../api/chatApi";

/**
 * ChatPanel
 *
 * Props:
 *  - initialDataset: string (path or id) — dataset to send with the question
 *  - userId: string — optional user id to forward to backend
 *  - topK: number — optional top_k param for retrieval
 *  - onResponse: function(resp) — called with backend response object when received
 *
 * Notes:
 *  - This version intentionally hides the dataset id and the Answer box (per request).
 *  - Raw response is still accessible via the "Show raw response" details (for debugging).
 */

export default function ChatPanel({
  initialDataset = "",
  userId = "demo-user",
  topK = 5,
  onResponse = null,
}) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [botReply, setBotReply] = useState(null); // still stored for internal use but not shown
  const [rawResp, setRawResp] = useState(null);
  const [error, setError] = useState(null);

  // keep filename parsing but do NOT display it
  const datasetFilename = initialDataset ? initialDataset.split(/[\\/]/).pop() : "";

  const clear = useCallback(() => {
    setQ("");
    setBotReply(null);
    setRawResp(null);
    setError(null);
  }, []);

  const normalizeReplyFromPayload = (payload) => {
    const maybe = payload?.data ?? payload ?? null;
    if (maybe == null) return null;
    if (typeof maybe === "string") return maybe;

    const candidates = [
      "bot_reply",
      "reply",
      "answer",
      "text",
      "message",
      "response",
    ];

    for (const k of candidates) {
      if (Object.prototype.hasOwnProperty.call(maybe, k) && maybe[k] != null) {
        if (typeof maybe[k] === "object") return JSON.stringify(maybe[k], null, 2);
        return String(maybe[k]);
      }
    }

    if (Array.isArray(maybe.results) && maybe.results.length > 0) {
      const first = maybe.results[0];
      if (typeof first === "string") return first;
      if (first?.text) return first.text;
    }

    try {
      return JSON.stringify(maybe, null, 2).slice(0, 5000);
    } catch {
      return String(maybe);
    }
  };

  const handleSubmit = async (e) => {
    if (e && typeof e.preventDefault === "function") e.preventDefault();

    setError(null);
    setBotReply(null);
    setRawResp(null);

    const message = (q || "").trim();
    if (!message) {
      setError("Type a question first.");
      return;
    }
    if (!initialDataset) {
      setError("Dataset not loaded. Upload or select a dataset first.");
      return;
    }

    if (loading) return;
    setLoading(true);

    try {
      // sendQuestion signature expected: (question, datasetPath, userId, topK)
      const resp = await sendQuestion(message, initialDataset, userId, topK);

      // store raw response for debug view
      setRawResp(resp);

      // normalize payload for internal usage and callbacks
      const normalized = resp?.data ?? resp ?? resp;
      const replyText = normalizeReplyFromPayload(normalized) ?? null;

      // save reply internally (not shown in UI per request)
      setBotReply(replyText);

      if (typeof onResponse === "function") {
        try {
          onResponse(normalized);
        } catch (cbErr) {
          // keep UI stable even if callback throws
          // eslint-disable-next-line no-console
          console.warn("onResponse callback threw:", cbErr);
        }
      }
    } catch (err) {
      let msg = "Request failed.";
      if (err?.response?.data) {
        try {
          const respData = err.response.data;
          if (typeof respData === "string") msg = respData;
          else if (respData.detail) msg = respData.detail;
          else msg = JSON.stringify(respData);
        } catch {
          msg = err.message || String(err);
        }
      } else if (err?.message) {
        msg = err.message;
      }
      setError(msg);
      // eslint-disable-next-line no-console
      console.error("ChatPanel send error:", err);
    } finally {
      setLoading(false);
    }
  };

  // keyboard shortcuts: Cmd/Ctrl+Enter submit, Esc clear
  const handleKeyDown = (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key === "Enter") {
      handleSubmit(ev);
    }
    if (ev.key === "Escape") {
      clear();
    }
  };

  // inline styles (self-contained, won't break your CSS)
  const styles = {
    card: {
      maxWidth: 820,
      background: "white",
      borderRadius: 12,
      padding: 18,
      boxShadow: "0 6px 18px rgba(15,23,42,0.06)",
      border: "1px solid #eef2f6",
    },
    textarea: {
      width: "100%",
      padding: 14,
      borderRadius: 10,
      border: "1px solid #e6eef6",
      resize: "vertical",
      boxSizing: "border-box",
      fontSize: 14,
      minHeight: 90,
      lineHeight: "1.45",
    },
    primaryBtn: (active = false) => ({
      background: active ? "linear-gradient(90deg,#0ea5e9,#2563eb)" : "linear-gradient(90deg,#06b6d4,#2563eb)",
      color: "white",
      padding: "10px 18px",
      borderRadius: 28,
      border: "none",
      cursor: active ? "default" : "pointer",
      boxShadow: "0 6px 14px rgba(37,99,235,0.12)",
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      fontWeight: 600,
    }),
    ghostBtn: {
      padding: "10px 16px",
      borderRadius: 28,
      border: "1px solid #e6eef6",
      background: "white",
      cursor: "pointer",
    },
    helperText: {
      color: "#6b7280",
      fontSize: 13,
      marginTop: 8,
    },
    errorBox: {
      color: "#b00020",
      background: "#fff1f2",
      padding: 10,
      borderRadius: 8,
      marginTop: 12,
      border: "1px solid #ffdede",
    },
    debugPre: {
      maxHeight: 260,
      overflow: "auto",
      background: "#0b1220",
      color: "#d1d5db",
      padding: 12,
      borderRadius: 8,
      marginTop: 8,
      fontSize: 12,
    },
  };

  return (
    <div style={styles.card}>
      <h3 style={{ margin: 0, marginBottom: 12, color: "#0f1724" }}>Ask a Question</h3>

      <form onSubmit={handleSubmit}>
        <textarea
          placeholder="e.g., Show me monthly expenses by category and highlight high-spend months..."
          rows={4}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={handleKeyDown}
          style={styles.textarea}
          aria-label="Ask a question"
        />

        <div style={{ display: "flex", gap: 12, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="submit"
            disabled={loading}
            style={styles.primaryBtn(loading)}
            aria-disabled={loading}
          >
            {loading ? (
              <>
                <svg width="16" height="16" viewBox="0 0 100 100" style={{ animation: "spin 1s linear infinite" }}>
                  <circle cx="50" cy="50" r="35" stroke="rgba(255,255,255,0.6)" strokeWidth="10" fill="none" />
                </svg>
                Generating…
              </>
            ) : (
              <>
                ⚡ Generate Insight
              </>
            )}
          </button>

          <button
            type="button"
            onClick={clear}
            style={styles.ghostBtn}
          >
            Clear
          </button>

          <div style={{ marginLeft: "auto", fontSize: 13, color: "#6b7280" }}>
            Tip: Press <kbd style={{ padding: "2px 6px", borderRadius: 4, background: "#f3f4f6", border: "1px solid #e6eef6" }}>Ctrl</kbd>+<kbd style={{ padding: "2px 6px", borderRadius: 4, background: "#f3f4f6", border: "1px solid #e6eef6" }}>Enter</kbd> to send
          </div>
        </div>
      </form>

      {/* helper line */}
      <div style={styles.helperText}>
        The assistant will run queries over your dataset and (optionally) suggest visualizations. Dataset is attached server-side (not shown here).
      </div>

      {/* errors */}
      {error && (
        <div style={styles.errorBox} role="alert">
          {error}
        </div>
      )}

      {/* NOTE: per request the Answer box (botReply display) has been removed from the UI.
                rawResp is still available for debugging below. */}

      {rawResp && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer", color: "#2563eb", fontWeight: 600 }}>
            Show raw response (debug)
          </summary>
          <pre style={styles.debugPre}>
            {(() => {
              try {
                return JSON.stringify(rawResp, null, 2);
              } catch {
                return String(rawResp);
              }
            })()}
          </pre>
        </details>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

ChatPanel.propTypes = {
  initialDataset: PropTypes.string,
  userId: PropTypes.string,
  topK: PropTypes.number,
  onResponse: PropTypes.func,
};
