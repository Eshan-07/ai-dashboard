// src/pages/Upload.jsx
import React, { useState, useCallback, useRef } from "react";
import { uploadFile, listDatasets } from "../api/dashboardApi";
import { UploadCloud, FileText, RefreshCw, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useDashboardStore } from "../store/dashboardStore";

export default function Upload() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [error, setError] = useState("");
  const [schema, setSchema] = useState(null);
  const [preview, setPreview] = useState([]);
  const [metadata, setMetadata] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  const inputRef = useRef(null);

  // dashboard store setters + router
  const setDatasetPath = useDashboardStore((s) => s.setDatasetPath);
  const setDatasetRowsStore = useDashboardStore((s) => s.setDatasetRows);
  const setStoreSchema = useDashboardStore((s) => s.setSchema);
  const navigate = useNavigate();

  const resetSelection = () => {
    setSelectedFile(null);
    setFileName(null);
    setSchema(null);
    setPreview([]);
    setMetadata(null);
    setError("");
    setProgressPct(0);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setFileName(file.name);
      setError("");
      setSchema(null);
      setPreview([]);
      setMetadata(null);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
      setFileName(file.name);
      setError("");
      setSchema(null);
      setPreview([]);
      setMetadata(null);
    }
  };
  const handleDragOver = (e) => e.preventDefault();

  const validateFile = (file) => {
    if (!file) return "No file selected.";
    const maxBytes = 10 * 1024 * 1024; // 10 MB
    if (file.size > maxBytes) return "File too large. Max allowed is 10MB.";
    const allowed = [
      "text/csv",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/json",
      "application/octet-stream",
      "application/vnd.ms-excel",
    ];
    // accept some unknown csv types, so also check extension
    const ext = (file.name || "").split(".").pop()?.toLowerCase();
    if (allowed.includes(file.type) || ["csv", "xlsx", "xls", "json"].includes(ext)) return null;
    return "Unsupported file type. Use CSV, Excel or JSON.";
  };

  // helper: basename extractor
  const basename = (path = "") => {
    try {
      return String(path).split(/[\\/]/).pop();
    } catch {
      return path;
    }
  };

  const onUpload = useCallback(
    async () => {
      setError("");
      const validation = validateFile(selectedFile);
      if (validation) {
        setError(validation);
        return;
      }

      setUploading(true);
      setProgressPct(0);

      try {
        // uploadFile returns the parsed response body (not axios response)
        const data = await uploadFile(selectedFile, (evt) => {
          if (evt.lengthComputable) {
            const pct = Math.round((evt.loaded / evt.total) * 100);
            setProgressPct(pct);
          }
        });

        // === normalize response (support multiple backend key names) ===
        const res = data || {};

        const backendSchema = res.schema || res.inferred_schema || (res.metadata && res.metadata.schema) || null;
        const backendSavedPath = res.saved_path || res.path || (res.metadata && (res.metadata.saved_path || res.metadata.path)) || null;
        const backendPreviewRows = res.preview_rows || res.preview || res.rows || (res.metadata && res.metadata.preview) || null;
        const returnedMetadata = res.metadata || null;

        // update local component state (keeps current behaviour)
        setMetadata(returnedMetadata);
        setSchema(backendSchema);
        setPreview(Array.isArray(backendPreviewRows) ? backendPreviewRows : backendPreviewRows ? [backendPreviewRows] : []);

        // decide datasetId (basename of saved path if available, else filename from selected file)
        const datasetIdCandidate = backendSavedPath ? basename(backendSavedPath) : (selectedFile?.name ? basename(selectedFile.name) : null);

        // === write into global dashboard store so other pages can use it ===
        try {
          if (backendSchema && typeof setStoreSchema === "function") setStoreSchema(backendSchema);
        } catch (e) {
          // ignore if store setter missing
        }
        try {
          if (datasetIdCandidate && typeof setDatasetPath === "function") {
            // store expects dataset id (filename-like) inside uploads — store the basename
            setDatasetPath(datasetIdCandidate);
          }
        } catch (e) {
          // ignore missing setter
        }
        try {
          if (typeof setDatasetRowsStore === "function") {
            setDatasetRowsStore(Array.isArray(backendPreviewRows) ? backendPreviewRows : backendPreviewRows ? [backendPreviewRows] : []);
          }
        } catch (e) {}

        // navigate to dashboard automatically so user can see schema and chat.
        // include dataset param so Dashboard can deterministically pick it up
        if (datasetIdCandidate) {
          navigate(`/dashboard?dataset=${encodeURIComponent(datasetIdCandidate)}`);
        } else {
          // fallback: plain dashboard route (keeps previous behaviour)
          navigate("/dashboard");
        }

        // keep file selected so user can re-upload or inspect; do not auto-clear
      } catch (err) {
        setError(err?.message || "Upload failed. Check backend logs.");
      } finally {
        setUploading(false);
        setProgressPct(0);
      }
    },
    [selectedFile, navigate, setDatasetPath, setDatasetRowsStore, setStoreSchema]
  );

  const fetchRecent = async () => {
    setLoadingRecent(true);
    setError("");
    try {
      const resp = await listDatasets(10);
      setRecent(resp?.datasets ?? resp ?? []);
    } catch (err) {
      setError(err?.message || "Failed to load recent uploads.");
    } finally {
      setLoadingRecent(false);
    }
  };

  const removeRecent = (id) => {
    setRecent((r) => r.filter((it) => (it._id ?? it.dataset_id ?? it.id) !== id));
  };

  const renderSchema = () => {
    if (!schema) return null;
    return (
      <div className="mt-6 bg-white shadow rounded-2xl p-4">
        <h3 className="text-lg font-semibold mb-3">Detected Schema</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr>
                <th className="py-2 px-3 border-b">Column</th>
                <th className="py-2 px-3 border-b">Type</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(schema).map(([col, typ]) => (
                <tr key={col}>
                  <td className="py-2 px-3 border-t align-top">{col}</td>
                  <td className="py-2 px-3 border-t align-top">{typ}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderPreview = () => {
    if (!preview || preview.length === 0) return null;
    const cols = Object.keys(preview[0] || {});
    return (
      <div className="mt-6 bg-white shadow rounded-2xl p-4">
        <h3 className="text-lg font-semibold mb-3">Preview (first {preview.length} rows)</h3>
        <div className="overflow-auto">
          <table className="min-w-full text-left">
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c} className="py-2 px-3 border-b">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, idx) => (
                <tr key={idx}>
                  {cols.map((c) => (
                    <td key={c} className="py-2 px-3 border-t align-top">{row[c] === null || row[c] === undefined ? "" : String(row[c])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="p-10 bg-stone-50 min-h-screen font-inter text-gray-800 space-y-8">
      <header>
        <h1 className="text-3xl font-extrabold text-sky-700 flex items-center gap-3">
          <UploadCloud size={26} /> Upload Your Data
        </h1>
        <p className="text-sm text-gray-600 mt-1">Add files (CSV / Excel / JSON) and preview schema & data before analysis.</p>
      </header>

      <section>
        <div
          className="border-2 border-dashed border-stone-200 rounded-2xl p-8 flex flex-col items-center justify-center bg-white hover:shadow-lg transition-all duration-300"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          aria-label="Drag and drop files here or click to browse"
          onClick={(e) => {
            // only trigger file browser when clicking the container itself (avoid double opens
            // when clicking the inner "Browse Files" label/button which also controls the input)
            if (e.target === e.currentTarget) {
              inputRef.current?.click();
            }
          }}
        >
          <div className="text-center">
            <p className="text-gray-600 mb-4">Drag & drop your files here, or</p>
            <label className="inline-flex items-center gap-3 cursor-pointer">
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                accept=".csv, .xlsx, .xls, application/json"
                onChange={handleFileChange}
                aria-label="Choose a file to upload"
              />

              <span className="inline-flex items-center gap-2 bg-sky-500 text-white px-4 py-2 rounded-full shadow hover:bg-sky-600 transition-all duration-300">
                <FileText size={16} /> Browse Files
              </span>
            </label>

            {fileName && (<p className="mt-4 text-green-600 font-medium">Selected: {fileName}</p>)}

            <p className="mt-3 text-sm text-gray-500">Supported formats: CSV, Excel, JSON · Max 10MB</p>

            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={onUpload}
                disabled={uploading}
                className={`px-4 py-2 rounded-full text-white inline-flex items-center gap-2 ${uploading ? "bg-gray-400 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700"}`}
                aria-disabled={uploading}
              >
                {uploading ? "Uploading..." : "Upload"}
                {uploading && <span aria-hidden> · {progressPct}%</span>}
              </button>

              <button
                onClick={fetchRecent}
                disabled={loadingRecent}
                className="px-3 py-2 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 inline-flex items-center gap-2"
              >
                <RefreshCw size={14} />
                <span>{loadingRecent ? "Loading..." : "Recent uploads"}</span>
              </button>

              <button
                onClick={resetSelection}
                className="px-3 py-2 rounded-full bg-gray-100 hover:bg-gray-200 inline-flex items-center gap-2 text-gray-700"
              >
                <Trash2 size={14} /> Clear
              </button>
            </div>

            {uploading && (
              <div className="w-full mt-6">
                <div className="h-2 bg-gray-200 rounded">
                  <div className="h-2 bg-sky-500 rounded" style={{ width: `${progressPct}%` }} />
                </div>
                <div className="text-sm text-gray-600 mt-2">{progressPct}%</div>
              </div>
            )}

            {error && (
              <div className="mt-4 text-sm text-rose-600">
                <strong>Error:</strong> {error}
              </div>
            )}
          </div>
        </div>

        {/* Metadata summary */}
        {metadata && (
          <div className="mt-6 bg-white shadow rounded-2xl p-4 flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-500">Saved as</div>
              <div className="font-medium break-all">{basename(metadata.saved_path || metadata.path || "") || "Not saved"}</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-500">Uploaded</div>
              <div className="font-medium">{metadata.upload_time || "—"}</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-500">Rows / Columns</div>
              <div className="font-medium">{metadata.rows ?? "—"} / {metadata.columns ?? "—"}</div>
            </div>
          </div>
        )}

        {renderSchema()}
        {renderPreview()}

        {/* Recent uploads list */}
        {recent && recent.length > 0 && (
          <div className="mt-6 bg-white shadow rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Recent Uploads</h3>
              <div className="text-sm text-gray-600">{recent.length} files</div>
            </div>

            <ul>
              {recent.map((r) => (
                <li key={r._id} className="py-3 border-t last:border-b-0 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{r.original_filename}</div>
                    <div className="text-sm text-gray-500">{r.upload_time}</div>
                  </div>

                  <div className="flex items-center gap-3">
                    <a
                      href={r.saved_path}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-sky-600 underline"
                    >
                      Open
                    </a>

                    <button
                      onClick={() => removeRecent(r._id)}
                      className="px-2 py-1 rounded-full bg-gray-100 hover:bg-gray-200 inline-flex items-center gap-2 text-sm text-gray-700"
                      aria-label={`Remove ${r.original_filename} from list`}
                    >
                      <Trash2 size={14} />
                    </button>

                    <div className="text-sm text-gray-600">{r.rows ?? "—"} rows</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
