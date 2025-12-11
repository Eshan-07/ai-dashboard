import { toPng } from "html-to-image";
import jsPDF from "jspdf";

// Export a single chart as PNG
export const exportNodeToPng = async (node, filename = "chart.png") => {
  if (!node) return;
  const dataUrl = await toPng(node, { cacheBust: true, pixelRatio: 2 });
  const link = document.createElement("a");
  link.download = filename;
  link.href = dataUrl;
  link.click();
};

// Export a single chart as PDF
export const exportNodeToPdf = async (node, filename = "chart.pdf") => {
  if (!node) return;
  const dataUrl = await toPng(node, { cacheBust: true, pixelRatio: 2 });
  const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: "a4" });
  pdf.addImage(dataUrl, "PNG", 20, 20, 800, 400); // adjust fit
  pdf.save(filename);
};

// Export chart data as CSV
export const exportRowsToCsv = (rows, filename = "data.csv") => {
  if (!rows?.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const csv = [headers.join(",")]
    .concat(rows.map((row) => headers.map((h) => escape(row[h])).join(",")))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
