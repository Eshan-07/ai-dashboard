export function createChartFromSpec(chartSpec, df) {
  if (!chartSpec || !df) return null;

  return {
    id: crypto.randomUUID(),
    type: chartSpec.type || "bar",
    title: chartSpec.title || "Generated Chart",
    x: chartSpec.x,
    y: chartSpec.y,
    y_agg: chartSpec.y_agg || "sum",
    rawSpec: chartSpec,
    data: df, // entire dataset rows
  };
}
