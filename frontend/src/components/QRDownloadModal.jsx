import { useMemo, useState } from "react";
import QRCodeStyling from "qr-code-styling";
import QRCode from "qrcode";

const WORKER = "https://qr.intaprd.com";
const QUIET = 4;

function safeStyle(styleJson) {
  try { return styleJson ? (typeof styleJson === "string" ? JSON.parse(styleJson) : styleJson) : {}; }
  catch { return {}; }
}
function matrixFor(data) {
  const text = String(data || "");
  if (!text || text.length > 2800) throw new Error("El enlace QR es demasiado largo para exportarse correctamente.");
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
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
function downloadBlob(blob, filename) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
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
  return new Blob([pdf], { type: "application/pdf" });
}

export default function QRDownloadModal({ slug, styleJson, onClose }) {
  const [size, setSize] = useState(1024);
  const [error, setError] = useState("");
  const style = safeStyle(styleJson);
  const safeSlug = typeof slug === "string" ? slug.trim() : String(slug || "");
  const url = `${WORKER}/${safeSlug}`;
  const dotColor = style.dotColor || "#0c4a6e";
  const bgColor = style.bgColor || "#ffffff";

  const preview = useMemo(() => {
    try { return vectorSvg(url, dotColor, bgColor); }
    catch (e) { return null; }
  }, [url, dotColor, bgColor]);

  const raster = async (ext) => {
    setError("");
    try {
      if (!safeSlug || url.length > 2800) throw new Error("El enlace QR es demasiado largo para exportarse correctamente.");
      const qr = new QRCodeStyling({
        width: size, height: size, data: url,
        dotsOptions: { color: dotColor, type: style.dotStyle || "rounded" },
        cornersSquareOptions: { type: style.cornerStyle || "extra-rounded", color: dotColor },
        cornersDotOptions: { type: style.cornerStyle || "dot", color: style.accentColor || "#0ea5e9" },
        backgroundOptions: { color: bgColor }, image: style.logo || undefined,
        imageOptions: { crossOrigin: "anonymous", margin: Math.max(4, Math.round(size / 75)) },
      });
      await qr.download({ name: `qr-${safeSlug}-${size}`, extension: ext });
    } catch (e) { setError(e?.message || "No se pudo generar la descarga."); }
  };
  const svg = () => {
    setError("");
    try { downloadBlob(new Blob([vectorSvg(url, dotColor, bgColor)], { type: "image/svg+xml;charset=utf-8" }), `qr-${safeSlug}-vector.svg`); }
    catch (e) { setError(e?.message || "No se pudo generar el SVG."); }
  };
  const pdf = () => {
    setError("");
    try { downloadBlob(vectorPdf(url, dotColor, bgColor), `qr-${safeSlug}-vector.pdf`); }
    catch (e) { setError(e?.message || "No se pudo generar el PDF."); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="card p-6 w-full max-w-md text-center" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-gray-900 mb-1">Código QR — /{safeSlug}</h3>
        <p className="text-xs text-gray-500 mb-4 break-all">{url}</p>

        {preview ? (
          <div className="flex justify-center mb-5" dangerouslySetInnerHTML={{ __html: preview }} />
        ) : (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-5 text-xs text-red-700">No se pudo generar la vista previa de este QR.</div>
        )}
        {error && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-left text-xs text-red-700">{error}</div>}

        <div className="rounded-xl border border-slate-200 p-3 mb-3 text-left">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div><p className="text-xs font-bold text-slate-800">Uso digital</p><p className="text-[11px] text-slate-400">Mantiene estilo y logo del QR.</p></div>
            <select value={size} onChange={e => setSize(Number(e.target.value))} className="input text-xs py-1.5 w-32">
              {[512,1024,2048,4096].map(v => <option key={v} value={v}>{v} × {v}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => raster("png")} className="btn-secondary text-xs">PNG</button>
            <button onClick={() => raster("webp")} className="btn-secondary text-xs">WEBP</button>
          </div>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3 mb-3 text-left">
          <p className="text-xs font-bold text-slate-800">Impresión / Diseño</p>
          <p className="text-[11px] text-slate-500 mt-0.5 mb-2">QR vectorial limpio, sin clip-path ni máscaras. Editable en Illustrator/CorelDRAW.</p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={svg} className="btn-secondary text-xs">SVG Vectorial</button>
            <button onClick={pdf} className="btn-secondary text-xs">PDF Vectorial</button>
          </div>
          {style.logo && <p className="mt-2 text-[10px] text-amber-700">Para máxima compatibilidad, las salidas vectoriales exportan el QR limpio sin el logo incrustado. PNG/WEBP mantienen el logo.</p>}
        </div>

        <button onClick={onClose} className="btn-secondary w-full">Cerrar</button>
      </div>
    </div>
  );
}
