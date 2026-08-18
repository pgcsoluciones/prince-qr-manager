import { useMemo, useState } from "react";
import JSZip from "jszip";
import QRCode from "qrcode";
import * as XLSX from "xlsx";
import { toast } from "./Toast.jsx";

const WORKER = "https://qr.intaprd.com";
const QUIET = 4;

function safeStyle(styleJson) {
  try { return styleJson ? (typeof styleJson === "string" ? JSON.parse(styleJson) : styleJson) : {}; }
  catch { return {}; }
}

function matrixFor(data) {
  const qr = QRCode.create(String(data || ""), { errorCorrectionLevel: "M" });
  return { size: qr.modules.size, data: qr.modules.data };
}

function isDark(matrix, x, y) { return Boolean(matrix.data[y * matrix.size + x]); }

function runs(matrix) {
  const out = [];
  for (let y = 0; y < matrix.size; y++) {
    let x = 0;
    while (x < matrix.size) {
      if (!isDark(matrix, x, y)) { x++; continue; }
      const start = x;
      while (x < matrix.size && isDark(matrix, x, y)) x++;
      out.push([start, y, x - start]);
    }
  }
  return out;
}

function hexRgb(hex, fallback = "#000000") {
  const raw = /^#[0-9a-f]{6}$/i.test(hex || "") ? hex : fallback;
  return [1, 3, 5].map(i => parseInt(raw.slice(i, i + 2), 16) / 255);
}

function vectorSvg(data, dotColor, bgColor) {
  const matrix = matrixFor(data);
  const total = matrix.size + QUIET * 2;
  const path = runs(matrix).map(([x, y, len]) => `M${x + QUIET} ${y + QUIET}h${len}v1h-${len}z`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${total}" height="${total}" shape-rendering="crispEdges">\n<rect width="${total}" height="${total}" fill="${bgColor}"/>\n<path d="${path}" fill="${dotColor}"/>\n</svg>\n`;
}

function vectorPdf(data, dotColor, bgColor) {
  const matrix = matrixFor(data);
  const total = matrix.size + QUIET * 2;
  const page = 360;
  const unit = page / total;
  const [br, bg, bb] = hexRgb(bgColor, "#ffffff");
  const [dr, dg, db] = hexRgb(dotColor, "#000000");
  const n = v => Number(v.toFixed(4));
  const ops = [`${n(br)} ${n(bg)} ${n(bb)} rg`, `0 0 ${page} ${page} re f`, `${n(dr)} ${n(dg)} ${n(db)} rg`];
  for (const [x, y, len] of runs(matrix)) {
    const px = n((x + QUIET) * unit);
    const py = n(page - (y + QUIET + 1) * unit);
    ops.push(`${px} ${py} ${n(len * unit)} ${n(unit)} re f`);
  }
  const stream = ops.join("\n") + "\n";
  const objects = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page} ${page}] /Resources << >> /Contents 4 0 R >>`,
    `<< /Length ${stream.length} >>\nstream\n${stream}endstream`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return pdf;
}

async function rasterBlob(data, size, dotColor, bgColor, ext) {
  const matrix = matrixFor(data);
  const total = matrix.size + QUIET * 2;
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo preparar el lienzo de exportación.");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = bgColor; ctx.fillRect(0, 0, size, size);
  const unit = size / total;
  ctx.fillStyle = dotColor;
  for (const [x, y, len] of runs(matrix)) {
    const x0 = Math.round((x + QUIET) * unit);
    const y0 = Math.round((y + QUIET) * unit);
    const x1 = Math.round((x + QUIET + len) * unit);
    const y1 = Math.round((y + QUIET + 1) * unit);
    ctx.fillRect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
  }
  const mime = ext === "webp" ? "image/webp" : "image/png";
  return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("No se pudo crear el archivo.")), mime, 1));
}

function safeName(value) {
  return String(value || "lote-qr").trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "lote-qr";
}

function stamp(date = new Date()) {
  const pad = n => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}`;
}

function excelManifest(rows) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 34 },
    { wch: 28 },
    { wch: 48 },
    { wch: 52 },
    { wch: 30 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Manifiesto");
  return XLSX.write(wb, { bookType: "xlsx", type: "array" });
}

export default function BulkDownloadModal({ links, filteredLinks, selectedSlugs, projects, defaultProjectId = "", onClose }) {
  const hasSelected = selectedSlugs?.size > 0;
  const [scope, setScope] = useState(hasSelected ? "selected" : (defaultProjectId ? "project" : "filtered"));
  const [projectId, setProjectId] = useState(defaultProjectId || "");
  const [format, setFormat] = useState("svg");
  const [size, setSize] = useState(1024);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState(0);

  const targetLinks = useMemo(() => {
    if (scope === "selected") return links.filter(l => selectedSlugs?.has(l.slug));
    if (scope === "project") return links.filter(l => String(l.project_id) === String(projectId));
    return filteredLinks;
  }, [scope, links, filteredLinks, selectedSlugs, projectId]);

  const project = projects.find(p => String(p.id) === String(projectId));
  const baseFolderName = safeName(scope === "project" ? project?.name : scope === "selected" ? "qrs-seleccionados" : "qrs-filtrados");

  const download = async () => {
    if (!targetLinks.length) return;
    setWorking(true); setProgress(0);
    try {
      const exportDate = new Date();
      const exportStamp = stamp(exportDate);
      const folderName = `${baseFolderName}_${exportStamp}`;
      const zip = new JSZip();
      zip.file(`${folderName}/`, null, { dir: true, date: exportDate });
      const folder = zip.folder(folderName);
      const manifest = [["archivo", "slug", "url_dinamica", "destino", "proyecto"]];

      for (let i = 0; i < targetLinks.length; i++) {
        const link = targetLinks[i];
        const style = safeStyle(link.qr_style_json);
        const dotColor = style.dotColor || "#0c4a6e";
        const bgColor = style.bgColor || "#ffffff";
        const url = `${WORKER}/${link.slug}`;
        const fileName = `qr-${safeName(link.slug)}.${format}`;
        const opts = { date: exportDate };

        if (format === "svg") folder.file(fileName, vectorSvg(url, dotColor, bgColor), opts);
        else if (format === "pdf") folder.file(fileName, vectorPdf(url, dotColor, bgColor), opts);
        else folder.file(fileName, await rasterBlob(url, size, dotColor, bgColor, format), opts);

        const pName = projects.find(p => String(p.id) === String(link.project_id))?.name || "";
        manifest.push([fileName, link.slug, url, link.destination_url || "", pName]);
        setProgress(Math.round(((i + 1) / targetLinks.length) * 90));
      }

      folder.file("manifiesto.xlsx", excelManifest(manifest), { date: exportDate });
      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } }, meta => {
        setProgress(Math.max(90, Math.round(90 + meta.percent * 0.1)));
      });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `${folderName}-${format}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      setProgress(100);
      toast(`${targetLinks.length} QRs preparados en ZIP`);
      onClose();
    } catch (e) {
      toast(e?.message || "No se pudo preparar el lote.", "error");
    } finally { setWorking(false); }
  };

  const previewFolder = `${baseFolderName}_AAAA-MM-DD_HH-mm`;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={working ? undefined : onClose}>
      <div className="card w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Descargar QRs por lote</h2>
          <p className="text-xs text-gray-500 mt-0.5">Genera un ZIP fechado y organizado con los QR y su manifiesto Excel.</p>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2">Qué quieres descargar</label>
            <div className="grid gap-2">
              <label className={`rounded-xl border p-3 flex gap-3 ${hasSelected ? "cursor-pointer" : "opacity-50"}`}>
                <input type="radio" name="scope" value="selected" checked={scope === "selected"} disabled={!hasSelected} onChange={() => setScope("selected")} />
                <span><span className="block text-sm font-medium">Seleccionados</span><span className="block text-xs text-gray-400">{selectedSlugs?.size || 0} QR seleccionados en la tabla</span></span>
              </label>
              <label className="rounded-xl border p-3 flex gap-3 cursor-pointer">
                <input type="radio" name="scope" value="project" checked={scope === "project"} onChange={() => setScope("project")} />
                <span className="flex-1"><span className="block text-sm font-medium">Proyecto</span><span className="block text-xs text-gray-400">Todos los QR asociados a un proyecto</span></span>
              </label>
              {scope === "project" && (
                <select className="input text-sm" value={projectId} onChange={e => setProjectId(e.target.value)}>
                  <option value="">Selecciona un proyecto</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
              <label className="rounded-xl border p-3 flex gap-3 cursor-pointer">
                <input type="radio" name="scope" value="filtered" checked={scope === "filtered"} onChange={() => setScope("filtered")} />
                <span><span className="block text-sm font-medium">Resultados filtrados</span><span className="block text-xs text-gray-400">{filteredLinks.length} QR según los filtros actuales</span></span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Formato</label>
              <select className="input text-sm" value={format} onChange={e => setFormat(e.target.value)}>
                <option value="png">PNG</option><option value="webp">WEBP</option><option value="svg">SVG Vectorial</option><option value="pdf">PDF Vectorial</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Resolución</label>
              <select className="input text-sm" value={size} onChange={e => setSize(Number(e.target.value))} disabled={format === "svg" || format === "pdf"}>
                {[512, 1024, 2048, 4096].map(v => <option key={v} value={v}>{v} × {v}</option>)}
              </select>
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
            <strong>{targetLinks.length}</strong> QR se incluirán en una carpeta fechada como <strong>{previewFolder}</strong>, junto con <strong>manifiesto.xlsx</strong>.
          </div>

          {working && (
            <div><div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div><p className="text-xs text-gray-400 mt-1 text-center">Preparando lote… {progress}%</p></div>
          )}
        </div>

        <div className="p-5 border-t border-gray-100 flex justify-between">
          <button onClick={onClose} disabled={working} className="btn-secondary">Cancelar</button>
          <button onClick={download} disabled={working || !targetLinks.length || (scope === "project" && !projectId)} className="btn-primary">
            {working ? "Preparando…" : `Descargar ${targetLinks.length} QRs`}
          </button>
        </div>
      </div>
    </div>
  );
}
