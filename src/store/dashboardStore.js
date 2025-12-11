import { create } from "zustand";
import { runQuery, applyFilters } from "../api/dashboardApi";
import { createChartFromSpec } from "../api/createChartFromSpec";

export const useDashboardStore = create((set, get) => ({

  // ---------------------------
  // NEW: dataset details (added)
  // ---------------------------
  datasetPath: null,
  datasetRows: null,
  schema: null,

  setDatasetPath: (p) => set({ datasetPath: p }),
  setDatasetRows: (rows) => set({ datasetRows: rows }),
  setSchema: (s) => set({ schema: s }),
  // ---------------------------

  question: "",
  filters: {}, // { year, region, product }
  charts: [],
  loading: false,
  error: null,
  history: [],

  // Update state
  setQuestion: (q) => set({ question: q }),
  updateFilter: (key, value) =>
    set((s) => ({ filters: { ...s.filters, [key]: value } })),

  // Add query result to history
  addToHistory: () => {
    const { question, filters, charts, history } = get();
    if (!charts || charts.length === 0) return;
    const newEntry = {
      id: Date.now(),
      question,
      filters,
      charts,
      timestamp: new Date().toISOString(),
    };
    set({ history: [newEntry, ...history] });
  },

  // Submit a natural language query
  submitQuestion: async () => {
    const { question, filters, datasetPath } = get();
    if (!question) return;
    set({ loading: true, error: null });
    try {
      // pass datasetPath to runQuery
      const res = await runQuery(question, filters, datasetPath || "");
      set({ charts: res.charts || [] });

      // Build a chart if chart_spec exists
      try {
        if (res && res.chart_spec) {
          const datasetRows = get().datasetRows || null;
          const chart = createChartFromSpec(res.chart_spec, datasetRows);
          set({ charts: [...(get().charts || []), chart] });
        }
      } catch (err) {
        console.warn("createChartFromSpec failed:", err);
      }

      get().addToHistory();
    } catch (e) {
      set({ error: e.message });
    } finally {
      set({ loading: false });
    }
  },

  // Apply filters explicitly
  fetchWithFilters: async () => {
    const { filters, question } = get();
    set({ loading: true, error: null });
    try {
      const res = await applyFilters(filters, question);
      set({ charts: res.charts || [] });
      get().addToHistory();
    } catch (e) {
      set({ error: e.message });
    } finally {
      set({ loading: false });
    }
  },

  // Drill down (click on chart element)
  drillDown: async ({ key, value }) => {
    const { filters } = get();
    set({ filters: { ...filters, [key]: value } });
    await get().fetchWithFilters();
  },
}));
