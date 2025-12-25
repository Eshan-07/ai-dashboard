import React, { useState, useCallback, useRef, useEffect } from "react";
import { uploadFile } from "../api/dashboardApi";
import {
  UploadCloud,
  Trash2,
  Sun,
  Moon,
  CheckCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useDashboardStore } from "../store/dashboardStore";

export default function Upload() {
  /* ---------------- THEME (DO NOT TOUCH) ---------------- */
  const [darkMode, setDarkMode] = useState(
    localStorage.getItem("theme") !== "light"
  );

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      root.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [darkMode]);

  /* ---------------- STATE ---------------- */
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [schema, setSchema] = useState(null);
  const [previewRows, setPreviewRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [quality, setQuality] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [bounce, setBounce] = useState(false);

  const inputRef = useRef(null);
  const navigate = useNavigate();

  const setDatasetPath = useDashboardStore((s) => s.setDatasetPath);
  const setDatasetRows = useDashboardStore((s) => s.setDatasetRows);
  const setStoreSchema = useDashboardStore((s) => s.setSchema);

  /* ---------------- QUALITY SCORE ---------------- */
  const calculateQualityScore = (rows, schemaObj) => {
    if (!rows?.length || !schemaObj) return 0;
    let total = 0;
    let filled = 0;

    rows.forEach((r) => {
      Object.keys(schemaObj).forEach((c) => {
        total++;
        if (r[c] !== null && r[c] !== undefined && r[c] !== "") filled++;
      });
    });

    return Math.round((filled / total) * 100);
  };

  /* ---------------- FILE PICK ---------------- */
  const handleFileSelect = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;

    setFile(f);
    setShowSuccess(false);

    setBounce(true);
    setTimeout(() => setBounce(false), 1200);
  };

  /* ---------------- RESET (FIXED CRASH) ---------------- */
  const resetAll = () => {
    setFile(null);
    setSchema(null);
    setPreviewRows([]);
    setMeta(null);
    setQuality(null);
    setProgress(0);
    setShowSuccess(false);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  /* ---------------- UPLOAD ---------------- */
  const onUpload = useCallback(async () => {
    if (!file) return;

    setUploading(true);
    setProgress(0);

    try {
      const res = await uploadFile(file, (evt) => {
        if (evt.lengthComputable) {
          setProgress(Math.round((evt.loaded / evt.total) * 100));
        }
      });

      const schemaData = res.schema || res.metadata?.schema || null;
      const rows = res.preview_rows || res.rows || [];
      const metadata = res.metadata || {};

      setSchema(schemaData);
      setPreviewRows(rows);
      setMeta(metadata);

      const q = calculateQualityScore(rows, schemaData);
      setQuality(q);

      setDatasetPath(file.name);
      setDatasetRows(rows);
      setStoreSchema(schemaData);

      setShowSuccess(true);
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  }, [file]);

  return (
    <div className="min-h-screen px-6 py-6 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-[#0b0f1a] dark:to-[#020617] transition-colors duration-500">

      {/* HEADER */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Upload your dataset
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            CSV, Excel & JSON supported · Secure processing
          </p>
        </div>

        {/* THEME TOGGLE (WORKING) */}
        <button
          onClick={() => setDarkMode((v) => !v)}
          className="p-2 rounded-full bg-white/70 dark:bg-white/10 hover:scale-110 transition"
        >
          {darkMode ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>

      {/* DROP ZONE */}
      <div
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-slate-300 dark:border-white/20 rounded-2xl p-14 text-center cursor-pointer hover:border-indigo-500 transition-all bg-white/40 dark:bg-white/5 backdrop-blur"
      >
        <UploadCloud
          size={40}
          className={`mx-auto mb-3 text-indigo-500 ${
            bounce ? "animate-bounce" : ""
          }`}
        />
        <p className="font-semibold text-slate-800 dark:text-white">
          Drag & drop your dataset here
        </p>
        <p className="text-sm text-slate-500 mt-1">or click to browse</p>

        {file && (
          <p className="mt-3 text-emerald-500 font-medium">
            Selected: {file.name}
          </p>
        )}

        <input
          ref={inputRef}
          type="file"
          hidden
          accept=".csv,.xlsx,.xls,.json"
          onChange={handleFileSelect}
        />
      </div>

      {/* ACTIONS */}
      <div className="flex gap-3 mt-6">
        <button
          onClick={onUpload}
          disabled={!file || uploading}
          className="px-6 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-50"
        >
          {uploading ? "Uploading..." : "Upload"}
        </button>

        <button
          onClick={resetAll}
          className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-white/10"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {/* PROGRESS */}
      {uploading && (
        <div className="mt-4">
          <div className="h-2 bg-slate-300 dark:bg-slate-700 rounded">
            <div
              className="h-2 bg-indigo-500 rounded transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* SUCCESS */}
      {showSuccess && (
        <div className="mt-6 flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 animate-fade-in">
          <CheckCircle className="text-emerald-500" />
          <div>
            <p className="font-semibold text-emerald-600">
              Upload Complete
            </p>
            <p className="text-sm text-emerald-400">
              Dataset processed successfully
            </p>
          </div>
        </div>
      )}

      {/* STATS */}
      {meta && file && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8 animate-slide-up">
          <Stat label="File Size" value={`${(file.size / 1024 / 1024).toFixed(2)} MB`} />
          <Stat label="Rows" value={meta.rows ?? "--"} />
          <Stat label="Columns" value={meta.columns ?? "--"} />
          <Stat label="Quality Score" value={`${quality}%`} green />
        </div>
      )}

      {/* SCHEMA */}
      {schema && (
        <div className="mt-10 bg-black/80 rounded-2xl p-6 text-sm text-slate-200 animate-fade-in">
          <h3 className="font-semibold mb-4 text-white">
            Schema Preview
          </h3>
          <div className="grid grid-cols-2 gap-y-2">
            {Object.entries(schema).map(([k, v]) => (
              <React.Fragment key={k}>
                <span className="text-indigo-400">{k}</span>
                <span className="text-slate-300">{v}</span>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* PROCEED */}
      {showSuccess && (
        <div className="flex justify-end mt-8">
          <button
            onClick={() => navigate("/dashboard")}
            className="px-6 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition"
          >
            Proceed to Analysis →
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------- STAT CARD ---------------- */
function Stat({ label, value, green }) {
  return (
    <div className="rounded-xl bg-white/70 dark:bg-white/5 p-4 backdrop-blur">
      <p className="text-xs text-slate-500">{label}</p>
      <p
        className={`text-lg font-bold ${
          green ? "text-emerald-500" : "text-slate-900 dark:text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
