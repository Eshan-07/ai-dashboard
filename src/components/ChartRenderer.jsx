// src/components/ChartRenderer.jsx
import React, { useMemo, useCallback } from "react";
import Plot from "react-plotly.js";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  Legend as ReLegend,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useDashboardStore } from "../store/dashboardStore";

/* (The full ChartRenderer code is the same as the advanced version you already had,
   with one small change near the top: we read `spec._showInsights` and if false
   we skip computing insights and force default blue color + no analysis text.)
   For clarity, here is the final full file — copy/paste to replace your current ChartRenderer.jsx.
*/

const COLORS = [
  "#2563eb", // blue
  "#06b6d4", // teal
  "#f97316", // orange
  "#ef4444", // red
  "#f59e0b", // amber
  "#10b981", // green
  "#7c3aed", // purple
  "#ec4899", // pink
  "#64748b", // slate
];

const HIGH_COLOR = "#ef4444"; // red
const LOW_COLOR = "#22c55e"; // green
const DEFAULT_BAR_COLOR = COLORS[0];

function safeNumber(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  const s = String(v).replace(/,/g, "").trim();
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}

function normalizeAggregated(aggregated, spec) {
  if (!aggregated && spec) {
    aggregated = spec.aggregated || spec.data || spec;
  }
  if (!aggregated) return { kind: "empty" };

  if (Array.isArray(aggregated)) {
    const rows = aggregated
      .map((r) => {
        if (!r || typeof r !== "object") return null;
        const label = r.label ?? r.name ?? r.x ?? null;
        const value = r.value ?? r.y ?? null;
        return { ...r, label, value };
      })
      .filter(Boolean);
    return { kind: "rows", rows };
  }

  if (aggregated.labels && (aggregated.values || aggregated.series)) {
    const labels = Array.isArray(aggregated.labels) ? aggregated.labels : [];

    if (Array.isArray(aggregated.values)) {
      const rows = labels.map((lbl, i) => ({
        label: lbl,
        value: safeNumber(aggregated.values[i]),
      }));
      return { kind: "rows", rows };
    }

    if (Array.isArray(aggregated.series)) {
      const series = aggregated.series.map((s, i) => ({
        name: s.name ?? `series${i + 1}`,
        values: Array.isArray(s.values) ? s.values : [],
      }));
      const rows = labels.map((lbl, i) => {
        const row = { label: lbl };
        series.forEach((s) => {
          row[s.name] = safeNumber(s.values[i]);
        });
        return row;
      });
      return { kind: "table", rows, seriesNames: series.map((s) => s.name) };
    }
  }

  if (Array.isArray(aggregated.raw_table)) {
    return { kind: "raw_table", table: aggregated.raw_table };
  }

  if (Array.isArray(aggregated.x) && Array.isArray(aggregated.y)) {
    const rows = aggregated.x.map((xv, i) => ({
      label: xv,
      value: safeNumber(aggregated.y[i]),
    }));
    return { kind: "rows", rows };
  }

  if (aggregated.chart_spec && aggregated.aggregated) {
    return normalizeAggregated(aggregated.aggregated, aggregated.chart_spec);
  }

  if (spec && Array.isArray(spec.data)) {
    const xKey = spec.xKey ?? spec.x ?? spec.labelKey ?? null;
    const yKey = spec.yKey ?? spec.y ?? spec.valueKey ?? null;
    if (xKey && yKey) {
      const rows = spec.data.map((r) => ({
        label: r[xKey],
        value: safeNumber(r[yKey]),
        ...r,
      }));
      return { kind: "rows", rows };
    }
    if (spec.data.length > 0) {
      const keys = Object.keys(spec.data[0] || {});
      if (keys.length >= 2) {
        const rows = spec.data.map((r) => ({
          label: r[keys[0]],
          value: safeNumber(r[keys[1]]),
          ...r,
        }));
        return { kind: "rows", rows };
      }
    }
  }

  return { kind: "unknown", raw: aggregated };
}

function computeInsightsFromNorm(norm, spec) {
  if (!norm || norm.kind !== "rows" || !Array.isArray(norm.rows) || norm.rows.length === 0) {
    return null;
  }

  const labels = norm.rows.map((r) => r.label ?? "");
  const rawValues = norm.rows.map((r) => safeNumber(r.value));
  const validValues = rawValues.filter((v) => v !== null);

  if (!validValues.length) {
    return null;
  }

  const n = validValues.length;
  const sum = validValues.reduce((a, b) => a + b, 0);
  const mean = sum / n;

  const variance =
    n > 1
      ? validValues.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (n - 1)
      : 0;
  const std = Math.sqrt(variance);

  const vmax = Math.max(...validValues);
  const vmin = Math.min(...validValues);

  const idxMax = rawValues.indexOf(vmax);
  const idxMin = rawValues.indexOf(vmin);

  const highIndices = [];
  const lowIndices = [];
  rawValues.forEach((v, i) => {
    if (v === null || std === 0) return;
    if (v > mean + 0.7 * std) highIndices.push(i);
    else if (v < mean - 0.7 * std) lowIndices.push(i);
  });

  let slope = 0;
  if (n > 1) {
    const xs = Array.from({ length: n }, (_, i) => i);
    const sumX = xs.reduce((a, b) => a + b, 0);
    const sumY = validValues.reduce((a, b) => a + b, 0);
    const sumXY = xs.reduce((acc, x, i) => acc + x * validValues[i], 0);
    const sumX2 = xs.reduce((acc, x) => acc + x * x, 0);
    const denom = n * sumX2 - sumX * sumX || 1;
    slope = (n * sumXY - sumX * sumY) / denom;
  }

  let trend = "relatively stable";
  if (slope > 0.01 * mean) trend = "increasing";
  else if (slope < -0.01 * mean) trend = "decreasing";

  const metricName = (spec && (spec.y || spec.yKey || "value")) || "value";

  const highLabel =
    idxMax >= 0 && idxMax < labels.length ? labels[idxMax] : "the highest period";
  const lowLabel =
    idxMin >= 0 && idxMin < labels.length ? labels[idxMin] : "the lowest period";

  const analysisLines = [
    `The highest ${metricName} is in ${highLabel} (${vmax.toLocaleString()}).`,
    `The lowest ${metricName} is in ${lowLabel} (${vmin.toLocaleString()}).`,
    `On average it is around ${mean.toLocaleString(undefined, {
      maximumFractionDigits: 0,
    })} with variation ~${std.toLocaleString(undefined, {
      maximumFractionDigits: 0,
    })}.`,
    `Overall, the trend looks ${trend}.`,
  ];

  const recommendations = [];
  if (trend === "increasing") {
    recommendations.push(
      `Since ${metricName} is increasing, focus on the red points/bars – these periods are significantly above average.`
    );
  } else if (trend === "decreasing") {
    recommendations.push(
      `Since ${metricName} is decreasing, try to repeat what you did in periods close to ${lowLabel}.`
    );
  } else {
    recommendations.push(
      `Since ${metricName} is stable, you can treat the average as a reasonable target.`
    );
  }

  if (highIndices.length) {
    recommendations.push(
      `Red bars/points mark unusually high values – good candidates to reduce or investigate.`
    );
  }
  if (lowIndices.length) {
    recommendations.push(
      `Green bars/points mark unusually low values – these are efficient periods you might want to copy.`
    );
  }

  const accuracy =
    n >= 10
      ? "high"
      : n >= 5
      ? "medium"
      : "low";

  return {
    labels,
    rawValues,
    highIndices,
    lowIndices,
    mean,
    std,
    vmax,
    vmin,
    highLabel,
    lowLabel,
    trend,
    analysis: analysisLines.join(" "),
    recommendations,
    accuracy: {
      level: accuracy,
      rowsUsed: n,
      metric: metricName,
    },
  };
}

export default function ChartRenderer({ spec = {}, aggregated = null, height = 360 }) {
  const storeDrillDown = useDashboardStore((s) => s.drillDown);
  const drillDownFn = typeof storeDrillDown === "function" ? storeDrillDown : () => {};

  const handleDrillDown = useCallback(
    (key, value) => {
      try {
        if (!key) return;
        drillDownFn({ key, value });
      } catch {
        // ignore drilldown errors
      }
    },
    [drillDownFn]
  );

  // If the Dashboard passed _showInsights=false, we skip computing insights
  const showInsights = !!spec._showInsights;

  const norm = useMemo(() => normalizeAggregated(aggregated, spec), [aggregated, spec]);

  // Compute client-side insights only if showInsights === true
  const insights = useMemo(() => {
    if (!showInsights) return null;
    return computeInsightsFromNorm(norm, spec);
  }, [norm, spec, showInsights]);

  const onPlotlyClick = (ev) => {
    try {
      const points = ev?.points || (ev?.event && ev.event.points) || [];
      const p = points && points[0];
      if (!p) return;
      let val = null;
      if (p.label !== undefined) val = p.label;
      else if (p.x !== undefined && p.y !== undefined) val = { x: p.x, y: p.y };
      else if (p.x !== undefined) val = p.x;
      if (val !== null && spec.drilldownKey) handleDrillDown(spec.drilldownKey, val);
    } catch {
      // ignore
    }
  };

  const renderPlotly = useCallback(() => {
    if (!norm || norm.kind === "empty" || norm.kind === "unknown") return null;

    const traces = [];
    const layout = {
      title: spec.title ?? spec.chart_title ?? "",
      autosize: true,
      height,
      margin: { t: 40, l: 60, r: 20, b: 60 },
      legend: { orientation: "h", y: -0.15 },
    };

    const config = {
      responsive: true,
      displaylogo: false,
      modeBarButtonsToRemove: ["sendDataToCloud", "lasso2d", "select2d"],
    };

    const chartType = (spec.type || "bar").toLowerCase();

    if (norm.kind === "rows") {
      const labels = norm.rows.map((r) => r.label ?? "");
      const values = norm.rows.map((r) => (r.value === null ? 0 : r.value));

      // If showInsights is false, colorArray is uniform default blue
      const colorArray = showInsights && insights
        ? labels.map((_, idx) => {
            if (insights.highIndices?.includes(idx)) return HIGH_COLOR;
            if (insights.lowIndices?.includes(idx)) return LOW_COLOR;
            return DEFAULT_BAR_COLOR;
          })
        : DEFAULT_BAR_COLOR;

      if (chartType === "bar") {
        traces.push({
          x: labels,
          y: values,
          type: "bar",
          marker: { color: colorArray },
          hovertemplate: "%{x}: %{y}<extra></extra>",
        });
      } else if (chartType === "line" || chartType === "area") {
        traces.push({
          x: labels,
          y: values,
          type: "scatter",
          mode: chartType === "line" ? "lines+markers" : "lines",
          fill: chartType === "area" ? "tozeroy" : undefined,
          line: { color: DEFAULT_BAR_COLOR, width: 2 },
          marker: {
            size: 6,
            color: colorArray,
          },
        });
      } else if (chartType === "pie") {
        const pieColors =
          showInsights && insights && insights.highIndices?.length
            ? labels.map((_, idx) =>
                insights.highIndices.includes(idx)
                  ? HIGH_COLOR
                  : insights.lowIndices?.includes(idx)
                  ? LOW_COLOR
                  : COLORS[idx % COLORS.length]
              )
            : COLORS;
        traces.push({
          labels,
          values,
          type: "pie",
          marker: { colors: pieColors },
          textinfo: "label+percent",
        });
      } else if (chartType === "histogram") {
        traces.push({
          x: labels,
          y: values,
          type: "bar",
          marker: { color: colorArray },
        });
      } else if (chartType === "scatter") {
        traces.push({
          x: labels,
          y: values,
          mode: "markers",
          type: "scatter",
          marker: { size: 8, color: colorArray },
        });
      } else {
        traces.push({
          x: labels,
          y: values,
          type: "bar",
          marker: { color: colorArray },
        });
      }
    } else if (norm.kind === "table") {
      const rows = norm.rows || [];
      const seriesNames =
        norm.seriesNames ||
        Object.keys(rows[0] || {}).filter((k) => k !== "label");

      const labels = rows.map((r) => r.label ?? "");
      seriesNames.forEach((name, idx) => {
        const ys = rows.map((r) => safeNumber(r[name]) ?? 0);
        const baseType = chartType === "line" || chartType === "area" ? "scatter" : "bar";
        const mode =
          chartType === "line" || chartType === "area" ? "lines+markers" : undefined;

        traces.push({
          x: labels,
          y: ys,
          name,
          type: baseType,
          mode,
          marker: { color: COLORS[idx % COLORS.length] },
          line: { color: COLORS[idx % COLORS.length], width: 2 },
          fill: chartType === "area" ? "tozeroy" : undefined,
        });
      });
    } else if (norm.kind === "raw_table") {
      const table = norm.table || [];
      if (!table.length) {
        return { traces: [], layout, config };
      }
      const keys = Object.keys(table[0]);
      const xKey = spec.x ?? spec.xKey ?? keys[0];
      const yKey = spec.y ?? spec.yKey ?? keys[1];
      const xs = table.map((r) => r[xKey]);
      const ys = table.map((r) => safeNumber(r[yKey]) ?? 0);
      const mode = chartType === "line" || chartType === "area" ? "lines+markers" : "markers";

      traces.push({
        x: xs,
        y: ys,
        mode,
        type: "scatter",
        marker: { color: DEFAULT_BAR_COLOR, size: 6 },
        fill: chartType === "area" ? "tozeroy" : undefined,
      });
      layout.xaxis = { title: xKey };
      layout.yaxis = { title: yKey };
    }

    return { traces, layout, config };
  }, [norm, spec, height, showInsights, insights]);

  const renderRechartsFallback = () => {
    if (!spec || !Array.isArray(spec.data) || spec.data.length === 0) {
      return <div className="text-gray-400 p-4">No chart data available</div>;
    }

    const xKey = spec.xKey ?? spec.x ?? "label";
    const yKey = spec.yKey ?? spec.y ?? "value";
    const chartType = (spec.type || "bar").toLowerCase();

    const barFill = (entry, index) => {
      if (!showInsights || !insights) return DEFAULT_BAR_COLOR;
      if (insights.highIndices?.includes(index)) return HIGH_COLOR;
      if (insights.lowIndices?.includes(index)) return LOW_COLOR;
      return DEFAULT_BAR_COLOR;
    };

    if (chartType === "bar") {
      return (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart
            data={spec.data}
            margin={{ top: 8, right: 16, left: 16, bottom: 24 }}
          >
            <XAxis dataKey={xKey} />
            <YAxis />
            <ReTooltip />
            <ReLegend />
            <Bar
              dataKey={yKey}
              onClick={(d) =>
                spec.drilldownKey &&
                handleDrillDown(spec.drilldownKey, d?.payload?.[spec.drilldownKey])
              }
            >
              {spec.data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={barFill(entry, index)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (chartType === "line" || chartType === "area") {
      return (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart
            data={spec.data}
            margin={{ top: 8, right: 16, left: 16, bottom: 24 }}
          >
            <XAxis dataKey={xKey} />
            <YAxis />
            <ReTooltip />
            <ReLegend />
            <Line
              type="monotone"
              dataKey={yKey}
              stroke={DEFAULT_BAR_COLOR}
              dot={{ r: 2 }}
              fill={chartType === "area" ? DEFAULT_BAR_COLOR : undefined}
            />
          </LineChart>
        </ResponsiveContainer>
      );
    }

    if (chartType === "pie") {
      const radius = Math.min(120, height / 2 - 10);
      return (
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <ReTooltip />
            <ReLegend />
            <Pie
              data={spec.data}
              dataKey={yKey}
              nameKey={xKey}
              outerRadius={radius}
              label
            >
              {spec.data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      );
    }

    if (chartType === "scatter") {
      return (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart
            data={spec.data}
            margin={{ top: 8, right: 16, left: 16, bottom: 24 }}
          >
            <XAxis dataKey={xKey} />
            <YAxis />
            <ReTooltip />
            <ReLegend />
            <Line
              type="monotone"
              dataKey={yKey}
              stroke={DEFAULT_BAR_COLOR}
              dot={{ r: 3 }}
              strokeWidth={0}
            />
          </LineChart>
        </ResponsiveContainer>
      );
    }

    return (
      <div className="text-gray-400 p-4">
        Unsupported chart type for fallback
      </div>
    );
  };

  if (norm.kind !== "empty" && norm.kind !== "unknown") {
    const prepared = renderPlotly();
    if (!prepared || !prepared.traces || prepared.traces.length === 0) {
      return (
        <div>
          {renderRechartsFallback()}
          {showInsights && insights && insights.analysis && (
            <div className="mt-2 text-xs text-gray-600 space-y-1">
              <p>{insights.analysis}</p>
              {insights.recommendations?.length > 0 && (
                <ul className="list-disc list-inside">
                  {insights.recommendations.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
              {insights.accuracy && (
                <p className="text-[11px] text-gray-500">
                  Accuracy: {insights.accuracy.level.toUpperCase()} (rows used:{" "}
                  {insights.accuracy.rowsUsed})
                </p>
              )}
            </div>
          )}
        </div>
      );
    }
    const { traces, layout, config } = prepared;
    return (
      <div style={{ width: "100%", height }}>
        <Plot
          data={traces}
          layout={layout}
          config={config}
          style={{ width: "100%", height: "100%" }}
          onClick={onPlotlyClick}
        />
        {showInsights && insights && insights.analysis && (
          <div className="mt-2 text-xs text-gray-600 space-y-1">
            <p>{insights.analysis}</p>
            {insights.recommendations?.length > 0 && (
              <ul className="list-disc list-inside">
                {insights.recommendations.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            )}
            {insights.accuracy && (
              <p className="text-[11px] text-gray-500">
                Accuracy: {insights.accuracy.level.toUpperCase()} (rows used:{" "}
                {insights.accuracy.rowsUsed})
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return renderRechartsFallback();
}