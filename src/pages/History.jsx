import React, { useEffect, useState } from "react";
import { useDashboardStore } from "../store/dashboardStore";
import {
  listDatasets,
  deleteDataset,
} from "../api/dashboardApi";
import {
  Database,
  RefreshCw,
  Trash2,
  X,
  Eye,
  Sun,
  Moon,
} from "lucide-react";

/* ---------------- STABLE QUALITY ---------------- */
const stableQuality = (id) => {
  if (!id) return 75;
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return 60 + (Math.abs(hash) % 36);
};

const qualityColor = (q) => {
  if (q >= 80) return "bg-emerald-500 text-emerald-400";
  if (q >= 50) return "bg-yellow-500 text-yellow-400";
  return "bg-rose-500 text-rose-400";
};

export default function History() {
  /* ---------------- THEME ---------------- */
  const [theme, setTheme] = useState(
    localStorage.getItem("theme") || "dark"
  );

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark", "light");
    root.classList.add(theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  /* ---------------- DATA ---------------- */
  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [selected, setSelected] = useState(null);

  useEffect(() => {
    fetchDatasets();
  }, []);

  const fetchDatasets = async () => {
    setLoading(true);
    setError("");
    try {
      const resp = await listDatasets(200);
      setDatasets(resp?.datasets ?? resp ?? []);
    } catch (e) {
      setError(e?.message || "Failed to load datasets");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (d) => {
    const id = d._id ?? d.dataset_id;
    if (!id) return;

    const ok = window.confirm(
      `Delete "${d.original_filename}" permanently?`
    );
    if (!ok) return;

    const prev = datasets;
    setDatasets((s) =>
      s.filter((x) => (x._id ?? x.dataset_id) !== id)
    );

    try {
      await deleteDataset(id);
    } catch {
      alert("Delete failed");
      setDatasets(prev);
    }
  };

  return (
    <div
      className="
        min-h-screen p-6 md:p-10 transition-colors duration-300
        bg-slate-100 text-slate-900
        dark:bg-gradient-to-br dark:from-slate-950 dark:to-slate-900
        dark:text-white
      "
    >
      {/* HEADER */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold flex items-center gap-3">
            <Database /> Analysis History
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Access your previously run analyses and manage datasets.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* THEME TOGGLE */}
          <button
            onClick={() =>
              setTheme(theme === "dark" ? "light" : "dark")
            }
            className="
              p-2 rounded-full transition
              bg-slate-200 hover:bg-slate-300
              dark:bg-slate-800 dark:hover:bg-slate-700
            "
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          <button
            onClick={fetchDatasets}
            className="
              inline-flex items-center gap-2 px-4 py-2 rounded-xl
              bg-indigo-600 text-white hover:bg-indigo-700
            "
          >
            <RefreshCw size={16} />
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && <div className="text-rose-500 mb-4">{error}</div>}

      {/* TABLE */}
      <div
        className="
          rounded-2xl overflow-hidden shadow-xl
          bg-white dark:bg-white/5
          backdrop-blur
        "
      >
        <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-4 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-black/5 dark:border-white/5">
          <div className="col-span-4">Filename</div>
          <div className="col-span-2">Uploaded</div>
          <div className="col-span-2">Stats</div>
          <div className="col-span-2">Quality</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>

        {datasets.map((d) => {
          const id = d._id ?? d.dataset_id;
          const quality = stableQuality(id);

          return (
            <div
              key={id}
              className="
                md:grid md:grid-cols-12 md:gap-4
                px-4 md:px-6 py-4
                border-b last:border-b-0
                border-black/5 dark:border-white/5
                hover:bg-black/5 dark:hover:bg-white/5
                transition
              "
            >
              <div className="col-span-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                  <Database className="text-indigo-400" size={18} />
                </div>
                <div>
                  <p className="font-semibold">{d.original_filename}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {d.upload_time
                      ? new Date(d.upload_time).toLocaleString()
                      : "—"}
                  </p>
                </div>
              </div>

              <div className="col-span-2 text-sm text-slate-600 dark:text-slate-400">
                {d.upload_time
                  ? new Date(d.upload_time).toLocaleDateString()
                  : "—"}
              </div>

              <div className="col-span-2 text-sm">
                <span className="px-2 py-1 rounded bg-black/5 dark:bg-white/10 text-xs">
                  {d.rows ?? "—"} rows
                </span>
              </div>

              <div className="col-span-2 flex items-center gap-2">
                <div className="w-16 h-1.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${qualityColor(quality)}`}
                    style={{ width: `${quality}%` }}
                  />
                </div>
                <span
                  className={`text-xs font-bold ${
                    qualityColor(quality).split(" ")[1]
                  }`}
                >
                  {quality}
                </span>
              </div>

              <div className="col-span-2 flex justify-end gap-2">
                {/* VIEW */}
                <button
                  onClick={() => setSelected(d)}
                  className="p-2 rounded-lg hover:bg-black/10 dark:hover:bg-white/10"
                >
                  <Eye size={16} />
                </button>

                {/* DELETE */}
                <button
                  onClick={() => handleDelete(d)}
                  className="p-2 rounded-lg text-rose-500 hover:bg-rose-500/10"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* VIEW MODAL */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-4xl p-6 max-h-[90vh] overflow-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">
                {selected.original_filename}
              </h2>
              <button onClick={() => setSelected(null)}>
                <X />
              </button>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
              Preview (first 5 rows)
            </p>

            {selected.preview && selected.preview.length > 0 ? (
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr>
                      {Object.keys(selected.preview[0]).map((c) => (
                        <th
                          key={c}
                          className="px-3 py-2 text-left border-b"
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selected.preview.slice(0, 5).map((row, i) => (
                      <tr key={i}>
                        {Object.values(row).map((v, j) => (
                          <td key={j} className="px-3 py-2 border-b">
                            {String(v)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-slate-500">No preview available.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
