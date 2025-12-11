import { exportNodeToPng, exportNodeToPdf, exportRowsToCsv } from "../hooks/useChartExport";

export default function ExportMenu({ nodeRef, data, title = "chart" }) {
  return (
    <div className="flex gap-2">
      <button
        onClick={() => exportNodeToPng(nodeRef.current, `${title}.png`)}
        className="border px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
      >
        PNG
      </button>
      <button
        onClick={() => exportNodeToPdf(nodeRef.current, `${title}.pdf`)}
        className="border px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
      >
        PDF
      </button>
      {data?.length > 0 && (
        <button
          onClick={() => exportRowsToCsv(data, `${title}.csv`)}
          className="border px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
        >
          CSV
        </button>
      )}
    </div>
  );
}
