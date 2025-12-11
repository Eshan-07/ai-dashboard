// src/components/ChartSuggestionsPanel.jsx
import React, { useEffect, useState } from "react";
import "./chart-suggestions.css"; // create this (small styles below)
import Plot from "react-plotly.js";

/**
 * ChartSuggestionsPanel
 * Props:
 *   - datasetId (optional) : preselected dataset id string
 */
export default function ChartSuggestionsPanel({ datasetId: initialDatasetId = "" }) {
  const [datasets, setDatasets] = useState([]);
  const [selectedId, setSelectedId] = useState(initialDatasetId);
  const [previewRows, setPreviewRows] = useState([]);
  const [topN, setTopN] = useState(7);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // load list of uploaded datasets
  async function loadDatasets() {
    try {
      const res = await fetch("/upload/list");
      if (!res.ok) throw new Error(`Failed to load datasets: ${res.status}`);
      const json = await res.json();
      setDatasets(json.datasets || []);
      // if nothing selected, auto choose first
      if (!selectedId && json.datasets && json.datasets.length) {
        setSelectedId(json.datasets[0].dataset_id);
        setPreviewRows(json.datasets[0].preview || []);
      }
    } catch (e) {
      console.error(e);
      setError(e.message);
    }
  }

  useEffect(() => {
    loadDatasets();
    // eslint-disable-next-line
  }, []);

  // when user selects dataset from list, update preview
  function onSelectDataset(id) {
    setSelectedId(id);
    const doc = datasets.find((d) => d.dataset_id === id);
    setPreviewRows(doc ? doc.preview || [] : []);
    setSuggestions([]);
    setSelectedSuggestionIndex(null);
  }

  // call charts/suggest
  async function getSuggestions() {
    if (!selectedId) {
      setError("Select a dataset first.");
      return;
    }

    setError(null);
    setLoading(true);
    setSuggestions([]);
    setSelectedSuggestionIndex(null);

    try {
      const body = { dataset_id: selectedId, top_n: Number(topN || 5) };
      const res = await fetch("/charts/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        // show helpful server message
        const msg = json.detail || `${res.status} ${res.statusText}`;
        throw new Error(msg);
      }
      setSuggestions(json.suggestions || []);
      if ((json.suggestions || []).length) setSelectedSuggestionIndex(0);
    } catch (e) {
      console.error("suggest error:", e);
      setError(e.message || "Failed to fetch suggestions");
    } finally {
      setLoading(false);
    }
  }

  // render a suggestion preview using small heuristics
  function renderPlotForSuggestion(s) {
    if (!s) return null;
    try {
      if (s.type === "line" || s.type === "scatter") {
        const x = previewRows.map((r) => r[s.x]).slice(0, 50);
        const y = previewRows.map((r) => r[s.y]).slice(0, 50);
        return (
          <Plot
            data={[
              {
                x,
                y,
                mode: s.type === "line" ? "lines+markers" : "markers",
                type: "scatter",
              },
            ]}
            layout={{ margin: { l: 40, r: 10, t: 10, b: 40 }, height: 300 }}
            config={{ responsive: true }}
          />
        );
      }
      if (s.type === "histogram") {
        const vals = previewRows.map((r) => r[s.x]).slice(0, 200);
        return (
          <Plot
            data={[{ x: vals, type: "histogram" }]}
            layout={{ margin: { l: 40, r: 10, t: 10, b: 40 }, height: 300 }}
            config={{ responsive: true }}
          />
        );
      }
      if (s.type === "bar") {
        // categorical count fallback
        const counts = {};
        previewRows.forEach((r) => {
          const key = r[s.x] ?? "␣";
          counts[key] = (counts[key] || 0) + 1;
        });
        const keys = Object.keys(counts).slice(0, 20);
        const vals = keys.map((k) => counts[k]);
        return (
          <Plot
            data={[{ x: keys, y: vals, type: "bar" }]}
            layout={{ margin: { l: 40, r: 10, t: 10, b: 80 }, height: 300 }}
            config={{ responsive: true }}
          />
        );
      }

      return <div className="unsupported">Unsupported chart type</div>;
    } catch (e) {
      console.error("renderPlot error", e);
      return <div className="unsupported">Preview failed</div>;
    }
  }

  const selectedSuggestion = suggestions[selectedSuggestionIndex] ?? null;

  return (
    <div className="chart-suggestions-panel card">
      <div className="panel-grid">
        <div className="left-col">
          <div className="panel-row">
            <label>Available datasets (click to preview)</label>
            <div className="dataset-list">
              {datasets.length === 0 && <div className="muted">No datasets uploaded yet.</div>}
              {datasets.map((d) => (
                <button
                  key={d.dataset_id}
                  className={`dataset-item ${d.dataset_id === selectedId ? "active" : ""}`}
                  onClick={() => onSelectDataset(d.dataset_id)}
                  title={`${d.dataset_id}\nrows:${d.rows} cols:${d.columns}`}
                >
                  <div className="dataset-title">{d.dataset_id}</div>
                  <div className="dataset-meta">rows: {d.rows} cols: {d.columns}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="panel-row">
            <label>Suggestions</label>
            <div className="suggestions-list">
              <div className="suggest-controls">
                <input
                  type="number"
                  min="1"
                  value={topN}
                  onChange={(e) => setTopN(Number(e.target.value))}
                />
                <button onClick={getSuggestions} disabled={loading}>
                  {loading ? "Loading…" : "Get Suggestions"}
                </button>
              </div>
              {error && <div className="error">{error}</div>}
              {suggestions.length === 0 && !loading && <div className="muted">No suggestions yet</div>}
              <div>
                {suggestions.map((s, i) => (
                  <div
                    key={i}
                    className={`suggestion ${i === selectedSuggestionIndex ? "selected" : ""}`}
                    onClick={() => setSelectedSuggestionIndex(i)}
                    title={s.description || s.reason}
                  >
                    <div className="suggest-title">{s.type} — {s.description}</div>
                    <div className="suggest-reason">{s.reason}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="right-col">
          <div className="panel-row">
            <label>Preview sample (first rows)</label>
            <div className="preview-table">
              <table>
                <thead>
                  {previewRows.length ? (
                    <tr>
                      {Object.keys(previewRows[0] || {}).map((k) => (
                        <th key={k}>{k}</th>
                      ))}
                    </tr>
                  ) : (
                    <tr><th>No preview available</th></tr>
                  )}
                </thead>
                <tbody>
                  {previewRows.slice(0, 10).map((r, idx) => (
                    <tr key={idx}>
                      {Object.values(r).map((v, j) => <td key={j}>{String(v)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel-row">
            <label>Rendered chart (based on selected suggestion)</label>
            <div className="chart-area">
              {selectedSuggestion ? renderPlotForSuggestion(selectedSuggestion) : <div className="muted">Select a suggestion to preview</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
