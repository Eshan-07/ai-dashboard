import React, { useEffect, useState } from "react";
import { useDashboardStore } from "../store/dashboardStore";
import { listDatasets, suggestCharts, postRenderData, deleteDataset } from "../api/dashboardApi";
import ChartThumbnail from "../components/ChartThumbnail";
import ChartRenderer from "../components/ChartRenderer";
import { Database, RefreshCw, FileText, Trash2, X, SlidersHorizontal } from "lucide-react";

export default function History() {
  const { history } = useDashboardStore();

  const [datasets, setDatasets] = useState([]);
  const [loadingDatasets, setLoadingDatasets] = useState(false);
  const [datasetsError, setDatasetsError] = useState("");
  const [selected, setSelected] = useState(null);

  const [chartSuggestions, setChartSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestionError, setSuggestionError] = useState("");

  useEffect(() => {
    fetchDatasets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchDatasets = async () => {
    setLoadingDatasets(true);
    setDatasetsError("");
    try {
      const resp = await listDatasets(200);
      const items = resp?.datasets ?? resp ?? [];
      setDatasets(items);
    } catch (err) {
      setDatasetsError(err?.message || "Failed to load datasets.");
    } finally {
      setLoadingDatasets(false);
    }
  };

  const openDetails = (ds) => {
    setChartSuggestions([]);
    setSuggestionError("");
    setLoadingSuggestions(false);
    setSelected(ds);
    // scroll modal to top when opening
    setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 50);
  };

  const closeDetails = () => {
    setSelected(null);
    setChartSuggestions([]);
    setSuggestionError("");
    setLoadingSuggestions(false);
  };

  const fetchChartSuggestions = async (datasetId, top_n = 6) => {
    setLoadingSuggestions(true);
    setSuggestionError("");
    setChartSuggestions([]);
    try {
      const resp = await suggestCharts(datasetId, top_n);
      const suggs = resp?.suggestions ?? resp ?? [];

      if (!suggs.length) {
        setSuggestionError("No suggestions returned for this dataset.");
        setLoadingSuggestions(false);
        return;
      }

      const renderPromises = suggs.map(async (spec) => {
        try {
          const renderRes = await postRenderData(datasetId, spec, 2000);
          return { spec: renderRes.chart_spec ?? spec, aggregated: renderRes.aggregated, ok: true };
        } catch (err) {
          console.error("render-data error for spec:", spec, err);
          return { spec, aggregated: null, ok: false, error: err?.message || String(err) };
        }
      });

      const rendered = await Promise.all(renderPromises);
      setChartSuggestions(rendered);
    } catch (err) {
      console.error("Suggestion error:", err);
      setSuggestionError(err?.message || "Failed to fetch chart suggestions.");
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleDeleteDataset = async (d) => {
    const id = d._id ?? d.dataset_id ?? d.id;
    if (!id) {
      alert("Cannot determine dataset id to delete.");
      return;
    }

    const ok = window.confirm(`Delete dataset "${d.original_filename ?? id}"? This will remove the uploaded file permanently.`);
    if (!ok) return;

    const prev = datasets;
    setDatasets((s) => s.filter((it) => (it._id ?? it.dataset_id ?? it.id) !== id));

    try {
      await deleteDataset(id);
    } catch (err) {
      setDatasets(prev);
      console.error("Failed to delete dataset:", err);
      alert("Failed to delete dataset: " + (err?.message || String(err)));
    }
  };

  return (
    <div className="p-10 space-y-8 font-inter text-gray-800 bg-stone-50 min-h-screen">
      {/* Analysis History */}
      <section>
        <h1 className="text-3xl font-extrabold text-sky-700 flex items-center gap-3">
          <Database size={24} /> Analysis History
        </h1>
        <p className="text-sm text-gray-600 mb-4">Previously run queries and generated charts.</p>

        {(!history || history.length === 0) ? (
          <p className="text-gray-500">No history yet.</p>
        ) : (
          <div className="grid gap-4">
            {history.map((h) => (
              <div key={h.id} className="p-4 border rounded-2xl bg-white shadow-sm">
                <p className="text-sm text-gray-500">
                  {h.timestamp ? new Date(h.timestamp).toLocaleString() : ""}
                </p>
                <p className="font-semibold">Q: {h.question}</p>
                {h.filters && Object.keys(h.filters).length > 0 && (
                  <p className="text-xs text-gray-600">Filters: {JSON.stringify(h.filters)}</p>
                )}
                <p className="text-xs text-gray-500">Charts saved: {h.charts?.length ?? 0}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Uploaded Datasets */}
      <section>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Uploaded Datasets</h2>
            <p className="text-sm text-gray-600">Files you uploaded and their metadata.</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchDatasets}
              disabled={loadingDatasets}
              className="inline-flex items-center gap-2 px-3 py-2 bg-sky-500 text-white rounded-full hover:bg-sky-600 transition-all duration-300"
            >
              <RefreshCw size={16} />
              <span>{loadingDatasets ? "Refreshing..." : "Refresh"}</span>
            </button>
          </div>
        </div>

        {datasetsError && (
          <div className="mt-3 text-red-600">
            <strong>Error:</strong> {datasetsError}
          </div>
        )}

        <div className="mt-4 bg-white shadow rounded-2xl overflow-hidden">
          <table className="min-w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-4 py-3">Filename</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">Uploaded</th>
                <th className="text-left px-4 py-3">Rows</th>
                <th className="text-left px-4 py-3">Columns</th>
                <th className="text-left px-4 py-3">Actions</th>
              </tr>
            </thead>

            <tbody>
              {datasets.length === 0 && !loadingDatasets && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                    No uploads yet.
                  </td>
                </tr>
              )}

              {datasets.map((d) => (
                <tr key={d._id ?? d.dataset_id ?? d.saved_path} className="border-b last:border-b-0">
                  <td className="px-4 py-3">{d.original_filename ?? d.dataset_id ?? d._id}</td>
                  <td className="px-4 py-3 hidden md:table-cell">{d.upload_time ? new Date(d.upload_time).toLocaleString() : "—"}</td>
                  <td className="px-4 py-3">{d.rows ?? "—"}</td>
                  <td className="px-4 py-3">{d.columns ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => openDetails(d)}
                        className="px-2 py-1 bg-emerald-600 text-white rounded-full hover:bg-emerald-700 text-sm inline-flex items-center gap-2"
                        aria-label={`View details for ${d.original_filename ?? d.dataset_id ?? d._id}`}
                      >
                        <FileText size={14} />
                        <span>View</span>
                      </button>

                      {d.saved_path ? (
                        <a
                          href={d.saved_path}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2 py-1 bg-gray-100 text-gray-800 rounded-full text-sm inline-flex items-center gap-2"
                          aria-label={`Open file ${d.original_filename ?? d.dataset_id ?? d._id}`}
                        >
                          Open file
                        </a>
                      ) : null}

                      <button
                        onClick={() => handleDeleteDataset(d)}
                        className="px-2 py-1 bg-rose-500 text-white rounded-full hover:bg-rose-600 text-sm inline-flex items-center gap-2"
                        title="Delete dataset"
                        aria-label={`Delete ${d.original_filename ?? d.dataset_id ?? d._id}`}
                      >
                        <Trash2 size={14} />
                        <span>Delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Modal: Selected dataset details */}
        {selected && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/40" onClick={closeDetails} aria-hidden />

            <div
              className="relative bg-white rounded-2xl w-full md:w-3/4 max-h-[90vh] overflow-auto shadow-lg p-6 z-10"
              role="dialog"
              aria-modal="true"
              aria-labelledby="dataset-details-title"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 id="dataset-details-title" className="text-xl font-semibold flex items-center gap-2">
                    <FileText size={18} />
                    {selected.original_filename}
                  </h2>
                  <div className="text-sm text-gray-500">{selected.upload_time}</div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => fetchChartSuggestions(selected._id)}
                    disabled={loadingSuggestions}
                    className={`px-3 py-1 rounded-full text-white inline-flex items-center gap-2 ${
                      loadingSuggestions ? "bg-gray-400" : "bg-emerald-600 hover:bg-emerald-700"
                    }`}
                    aria-label="Suggest charts for this dataset"
                  >
                    <SlidersHorizontal size={14} />
                    <span>{loadingSuggestions ? "Analyzing..." : "Suggest Charts"}</span>
                  </button>

                  <button onClick={closeDetails} className="px-3 py-1 rounded-full bg-gray-100 hover:bg-gray-200 inline-flex items-center gap-2">
                    <X size={14} /> Close
                  </button>
                </div>
              </div>

              <div className="mt-4 space-y-4">
                <div>
                  <h3 className="font-medium">Metadata</h3>
                  <div className="text-sm text-gray-700">Rows: {selected.rows ?? "—"} · Columns: {selected.columns ?? "—"}</div>
                  <div className="text-sm text-gray-500 mt-1">Saved path: {selected.saved_path ?? "—"}</div>
                </div>

                {selected.schema && (
                  <div>
                    <h3 className="font-medium mt-2">Schema</h3>
                    <div className="mt-2 overflow-x-auto bg-stone-50 p-3 rounded-lg">
                      <table className="min-w-full">
                        <thead>
                          <tr>
                            <th className="px-3 py-2 text-left">Column</th>
                            <th className="px-3 py-2 text-left">Type</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(selected.schema).map(([k, v]) => (
                            <tr key={k}>
                              <td className="px-3 py-2 border-t">{k}</td>
                              <td className="px-3 py-2 border-t">{v}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {selected.preview && selected.preview.length > 0 && (
                  <div>
                    <h3 className="font-medium mt-2">Preview (first {selected.preview.length} rows)</h3>
                    <div className="mt-2 overflow-auto">
                      <table className="min-w-full">
                        <thead>
                          <tr>
                            {Object.keys(selected.preview[0]).map((c) => (
                              <th key={c} className="px-2 py-2 text-left">{c}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {selected.preview.map((row, idx) => (
                            <tr key={idx}>
                              {Object.keys(selected.preview[0]).map((c) => (
                                <td key={c} className="px-2 py-2 border-t">{String(row[c])}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Suggested Charts Section */}
                {loadingSuggestions && (
                  <div className="mt-4 text-gray-600">Analyzing dataset... this usually takes a few seconds.</div>
                )}

                {suggestionError && (
                  <div className="mt-4 text-red-600 text-sm">⚠️ {suggestionError}</div>
                )}

                {chartSuggestions.length > 0 && (
                  <div className="mt-6 bg-gray-50 p-4 rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-lg font-semibold">📊 Suggested Charts</h3>
                      <div className="text-sm text-gray-600">{chartSuggestions.length} suggestions</div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      {chartSuggestions.map((item, i) => (
                        <div key={i} className="bg-white border rounded-lg p-3 shadow-sm">
                          {!item.ok && (
                            <div className="p-3 text-sm text-rose-600">
                              <strong>Failed to render chart:</strong>
                              <div className="text-xs text-gray-600 mt-1">{item.error || "Unknown error"}</div>
                            </div>
                          )}

                          <ChartThumbnail
                            spec={item.spec}
                            aggregated={item.aggregated}
                            onClick={() => {
                              console.log("pin/open chart", item.spec);
                            }}
                          />

                          <div className="mt-2 text-xs text-gray-500">
                            <div className="font-medium text-sm">{(item.spec?.title || `${item.spec?.type || "chart"}`).toString()}</div>
                            {item.spec?.x && item.spec?.y && (
                              <div className="mt-1">({item.spec.x} vs {item.spec.y})</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 flex justify-end">
                <button onClick={closeDetails} className="px-3 py-2 bg-sky-500 text-white rounded-full hover:bg-sky-600">Close</button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
