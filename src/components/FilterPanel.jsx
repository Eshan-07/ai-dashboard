import { useEffect, useState } from "react";
import { useDashboardStore } from "../store/dashboardStore";
import { getFilterOptions } from "../api/dashboardApi";

export default function FilterPanel() {
  const { filters, updateFilter, fetchWithFilters, loading } = useDashboardStore();
  const [opts, setOpts] = useState({ years: [], regions: [], products: [] });

  useEffect(() => {
    // load filter options from backend
    getFilterOptions().then(setOpts).catch(() => {});
  }, []);

  // refetch whenever filters change
  useEffect(() => {
    if (Object.values(filters).some(Boolean)) {
      fetchWithFilters();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {/* Year filter */}
      <select
        className="border p-2 rounded"
        value={filters.year || ""}
        onChange={(e) => updateFilter("year", e.target.value || null)}
        disabled={loading}
      >
        <option value="">Year</option>
        {opts.years.map((y) => (
          <option key={y}>{y}</option>
        ))}
      </select>

      {/* Region filter */}
      <select
        className="border p-2 rounded"
        value={filters.region || ""}
        onChange={(e) => updateFilter("region", e.target.value || null)}
        disabled={loading}
      >
        <option value="">Region</option>
        {opts.regions.map((r) => (
          <option key={r}>{r}</option>
        ))}
      </select>

      {/* Product filter */}
      <select
        className="border p-2 rounded"
        value={filters.product || ""}
        onChange={(e) => updateFilter("product", e.target.value || null)}
        disabled={loading}
      >
        <option value="">Product</option>
        {opts.products.map((p) => (
          <option key={p}>{p}</option>
        ))}
      </select>
    </div>
  );
}
