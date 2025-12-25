// src/components/SchemaPanel.jsx
import React from "react";

export default function SchemaPanel({ schema = {}, preview = [], filename = "" }) {
  // pretty JSON string
  const json = JSON.stringify(schema || {}, null, 2);

  return (
    <div className="bg-white p-6 rounded-2xl shadow-lg hover:shadow-xl transition-all">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-2xl font-bold flex items-center gap-2 text-sky-500">
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h16M4 18h16" stroke="#0ea5a4" strokeWidth="1.5" strokeLinecap="round"/></svg>
          Dataset Schema
        </h2>
        <div className="text-sm text-gray-500">{filename}</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 bg-stone-50 rounded-lg border overflow-auto h-64">
          <pre className="text-xs whitespace-pre-wrap break-words">{json}</pre>
        </div>

        <div className="p-4 bg-stone-50 rounded-lg border h-64 overflow-auto">
          <strong className="block text-sm text-gray-600 mb-2">Preview (first rows)</strong>
          {preview && preview.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {Object.keys(preview[0]).slice(0, 6).map((k) => (
                    <th key={k} className="text-left text-xs p-1 text-gray-600">{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 6).map((r, i) => (
                  <tr key={i}>
                    {Object.values(r).slice(0,6).map((v, j) => (
                      <td key={j} className="p-1 text-xs text-gray-700">{String(v).slice(0,40)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-sm text-gray-500">No preview available.</div>
          )}
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => navigator.clipboard.writeText(JSON.stringify(schema || {}))}
              className="px-3 py-1 rounded-full bg-sky-50 text-sky-600 text-sm"
            >
              Copy Schema
            </button>
            <a
              href={`/upload/download?path=${encodeURIComponent(filename)}`}
              className="px-3 py-1 rounded-full bg-gray-100 text-gray-700 text-sm"
            >
              Open on server
            </a>
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-500 mt-3">Schema loads dynamically from uploaded data.</p>
    </div>
  );
}