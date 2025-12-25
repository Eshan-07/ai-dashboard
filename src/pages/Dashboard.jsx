// src/pages/Dashboard.jsx
import React, { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { useDashboardStore } from "../store/dashboardStore";
import { BookOpen, Sparkles, BarChart3 } from "lucide-react";

// NEW: import ChatPanel component
import ChatPanel from "../components/ChatPanel";
// NEW: import ChartRenderer component
import ChartRenderer from "../components/ChartRenderer";

// ---- API base helper (same logic as chatApi) ----
const RAW_BASE =
  process.env.REACT_APP_API_URL || process.env.REACT_APP_API_BASE || "";
const API_BASE = RAW_BASE ? RAW_BASE.replace(/\/+$/, "") : "";

export default function Dashboard() {
  // store hooks (keeps names you already used)
  const {
    submitQuestion,
    charts: storeCharts = [],
    loading,
    error,
    setQuestion,
    datasetPath,
  } = useDashboardStore();

  // schema from store (kept as before)
  const schema = useDashboardStore((s) => s.schema);

  // local input for the previous form (kept for compatibility)
  const [local, setLocal] = useState("");

  // UI state for visualizations area
  const [chartType, setChartType] = useState("auto"); // auto | bar | line | pie | area | scatter
  const [localCharts, setLocalCharts] = useState([]);
  // selected chart for the large canvas
  const [selectedChart, setSelectedChart] = useState(null);

  // NEW: toggle to show/hide advanced insights (default: false for backwards compatibility)
  const [showInsights, setShowInsights] = useState(false);

  // sync store charts into localCharts for rendering (non-destructive)
  useEffect(() => {
    setLocalCharts(Array.isArray(storeCharts) ? storeCharts.slice() : []);
  }, [storeCharts]);

  // handler used by any local "submit" (kept for compatibility with older UI)
  const handleSubmit = async (e) => {
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    setQuestion(local);
    // submitQuestion might update storeCharts via the store - we await to let store update
    try {
      await submitQuestion();
    } catch (err) {
      // swallow: store-level error will surface via `error`
      // eslint-disable-next-line no-console
      console.warn("submitQuestion failed:", err);
    }
  };

  // IMPORTANT: we NO LONGER filter by type here.
  // We always show all charts; the dropdown is a display override, not a filter.
  const visibleCharts = localCharts;

  // Helper: build the spec we actually send to ChartRenderer,
  // applying the dropdown override (bar / line / pie / area / scatter).
  const buildDisplaySpec = (chart) => {
    if (!chart) return {};
    const baseSpec = chart.rawSpec || chart;
    const originalType = (baseSpec.type || chart.type || "bar").toLowerCase();

    const effectiveType =
      chartType === "auto" ? originalType : chartType.toLowerCase();

    return {
      ...baseSpec,
      type: effectiveType,
      // pass whether to show insights as part of spec so ChartRenderer can read it
      _showInsights: showInsights,
    };
  };

  /**
   * Handler for chatbot responses:
   *  - if transformer suggests a chart (intent show_chart/compare)
   *    call /charts/render-data to get aggregated data
   *    and push a new chart object into localCharts.
   */
  const handleChatResponse = useCallback(
    async (resp) => {
      try {
        if (!resp) return;

        const intentIsChart =
          resp.intent === "show_chart" || resp.intent === "compare";

        // nothing chart-related => just ignore for visualizations
        if (!intentIsChart) {
          return;
        }

        // Try to locate a chart_spec from the chatbot response
        let chartSpec =
          resp.chart_spec ||
          (resp.generation_raw && resp.generation_raw.chart_spec) ||
          (resp.generation_raw && resp.generation_raw.suggestion) ||
          null;

        if (!chartSpec || !chartSpec.type) {
          // fallback default if model gave us something incomplete
          chartSpec = {
            type: "bar",
            x: "Year",
            y: "Total Revenue",
            title: resp.bot_reply || "Suggested chart",
          };
        }

        const datasetId = resp.dataset || datasetPath || "";
        let aggregated = null;

        // Call backend /charts/render-data to get aggregated data
        if (datasetId) {
          try {
            const renderUrl = `${API_BASE || ""}/charts/render-data`.replace(
              /([^:]\/)\/+/g,
              "$1"
            );

            const renderResp = await fetch(renderUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify({
                dataset_id: datasetId,
                chart_spec: chartSpec,
                max_sample_rows: 2000,
              }),
            });

            if (renderResp.ok) {
              const json = await renderResp.json();
              aggregated = json.aggregated || null;
              // if backend normalized the spec, prefer it
              if (json.chart_spec) {
                chartSpec = json.chart_spec;
              }
            } else {
              const txt = await renderResp.text().catch(() => "");
              console.warn(
                "render-data failed:",
                renderResp.status,
                renderResp.statusText,
                txt
              );
            }
          } catch (err) {
            console.warn("render-data request error:", err);
          }
        }

        const suggestion =
          (resp.generation_raw && resp.generation_raw.suggestion) || {};
        const title =
          suggestion.title ||
          chartSpec.title ||
          resp.bot_reply ||
          `Suggested: ${resp.intent}`;
        const type = (suggestion.type || chartSpec.type || "bar").toLowerCase();

        const newChart = {
          id: `suggested-${Date.now()}`,
          title,
          type,
          meta: {
            rows: Array.isArray(aggregated?.raw_table)
              ? aggregated.raw_table.length
              : undefined,
            source: datasetId,
          },
          rawSpec: chartSpec,
          aggregated: aggregated,
          // keep full response for debugging / future features
          _raw: resp,
        };

        setLocalCharts((prev) => [
          newChart,
          ...(Array.isArray(prev) ? prev : []),
        ]);
        setSelectedChart(newChart);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("handleChatResponse error:", err);
      }
    },
    [datasetPath]
  );

  return (
    <div className="p-10 bg-stone-50 min-h-screen space-y-10 font-inter text-gray-800">
      {/* Header */}
      <header className="space-y-1">
        <h1 className="text-4xl font-extrabold text-sky-700">Dashboard</h1>
        <p className="text-gray-600">
          Manage your data and generate insights with ease.
        </p>
      </header>

      {/* Top Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Dataset Schema */}
        <motion.div className="lg:col-span-2 bg-white p-8 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2 text-sky-500">
            <BookOpen size={24} /> Dataset Schema
          </h2>

          <pre className="bg-stone-50 p-5 rounded-xl text-sm h-64 overflow-auto">
            {schema
              ? JSON.stringify(schema, null, 2)
              : "Upload a dataset to load schema"}
          </pre>

          <p className="text-xs text-gray-500 mt-2">
            Schema loads dynamically from uploaded data.
          </p>
        </motion.div>

        {/* NLP Input - Ask a Question */}
        <motion.div className="bg-white p-8 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2 text-sky-500">
            <Sparkles size={24} /> Ask a Question
          </h2>

          <ChatPanel
            key={datasetPath || "no-dataset"}
            initialDataset={datasetPath || ""}
            userId={"eshan-demo"}
            topK={5}
            onResponse={handleChatResponse}
          />

          {/* show store-level error (if any) below the ChatPanel */}
          {error && (
            <div className="mt-6 bg-rose-100 p-4 rounded-xl border border-rose-200 text-rose-800">
              {error}
            </div>
          )}
        </motion.div>
      </div>

      {/* Bottom Grid - Your Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <motion.div className="bg-white p-8 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold flex items-center gap-2 text-sky-500">
              <BarChart3 size={24} /> Your Visualizations
            </h2>

            {/* Chart type dropdown */}
            <label className="flex items-center gap-2">
              <span className="text-sm text-gray-600 hidden md:inline">
                Type
              </span>
              <select
                value={chartType}
                onChange={(e) => setChartType(e.target.value)}
                className="py-2 px-3 pr-8 rounded-xl border border-stone-200 text-sm focus:ring focus:ring-sky-200"
                aria-label="Select chart type"
              >
                <option value="auto">Auto (all)</option>
                <option value="bar">Bar</option>
                <option value="line">Line</option>
                <option value="pie">Pie</option>
                <option value="area">Area</option>
                <option value="scatter">Scatter</option>
              </select>
            </label>
          </div>

          <p className="text-sm text-gray-500 mb-4">
            Choose a chart type to change how the charts are displayed, or keep
            set to <strong>Auto</strong>.
          </p>

          {/* NEW: toggle -> original/basic / advanced insights */}
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => setChartType("auto")}
              className="px-3 py-2 rounded-full bg-sky-50 text-sky-600 text-sm hover:bg-sky-100"
            >
              Show all
            </button>
            <button
              onClick={() => {
                setLocalCharts(Array.isArray(storeCharts) ? storeCharts.slice() : []);
              }}
              className="px-3 py-2 rounded-full bg-gray-100 text-gray-700 text-sm hover:bg-gray-200"
            >
              Refresh
            </button>

            {/* NEW: Show insights toggle button */}
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setShowInsights((s) => !s)}
                className={`px-4 py-2 rounded-xl text-sm border ${
                  showInsights ? "bg-sky-600 text-white border-sky-600" : "bg-white text-sky-600 border-sky-200"
                }`}
              >
                {showInsights ? "Hide insights" : "Show insights"}
              </button>
            </div>
          </div>

          {/* Placeholder / list of small previews */}
          <div className="grid gap-4">
            {visibleCharts?.length > 0 ? (
              visibleCharts.map((c, idx) => {
                const displaySpec = buildDisplaySpec(c);
                return (
                  <div
                    key={c.id ?? c.title ?? idx}
                    onClick={() => setSelectedChart(c)}
                    className="p-4 border rounded-xl bg-stone-50 hover:shadow-md transition-all duration-300 cursor-pointer hover:bg-sky-50"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">
                          {c.title || "Untitled chart"}
                        </p>
                        {displaySpec.type && (
                          <p className="text-xs text-gray-500 mt-1">
                            {displaySpec.type}
                          </p>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        {c.meta?.rows ? `${c.meta.rows} rows` : ""}
                      </div>
                    </div>

                    {/* Small chart preview using ChartRenderer */}
                    <div className="mt-3 h-36 bg-white border rounded-lg overflow-hidden">
                      <ChartRenderer
                        spec={displaySpec}
                        aggregated={c.aggregated || c.data || null}
                        height={140}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-6 border rounded-xl bg-stone-50 text-center text-gray-500">
                No charts yet — generate insights or add charts to see them
                here.
              </div>
            )}
          </div>
        </motion.div>

        {/* Large visualizations canvas */}
        <div className="lg:col-span-2 w-full h-96 bg-white rounded-xl border shadow p-4">
          {selectedChart ? (
            <div className="w-full h-full">
              <ChartRenderer
                spec={buildDisplaySpec(selectedChart)}
                aggregated={
                  selectedChart.aggregated || selectedChart.data || null
                }
              />
            </div>
          ) : (
            <p className="text-gray-500 text-center pt-20">
              Select a chart to preview here.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}