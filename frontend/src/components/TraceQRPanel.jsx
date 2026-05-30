import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import TraceLandingPreview from "./TraceLandingPreview.jsx";
import { api } from "../utils/api.js";
import { toast } from "./Toast.jsx";

const DOT_STYLES = [
  { value: "square", label: "Cuadrado" },
  { value: "rounded", label: "Redondeado" },
  { value: "dots", label: "Círculos" },
];

const COLOR_PRESETS = [
  { fg: "#000000", bg: "#ffffff", label: "Clásico" },
  { fg: "#2563eb", bg: "#eff6ff", label: "Azul" },
  { fg: "#16a34a", bg: "#f0fdf4", label: "Verde" },
  { fg: "#dc2626", bg: "#fef2f2", label: "Rojo" },
  { fg: "#7c3aed", bg: "#f5f3ff", label: "Morado" },
  { fg: "#0f172a", bg: "#f8fafc", label: "Oscuro" },
];

export default function TraceQRPanel({ point, onClose }) {
  const canvasRef = useRef(null);
  const [tab, setTab] = useState("qr");
  const [saving, setSaving] = useState(false);
  const [dotColor, setDotColor] = useState(point?.brand_color || "#2563eb");
  const [bgColor, setBgColor] = useState("#ffffff");
  const [errorLevel, setErrorLevel] = useState("M");

  const publicUrl = point?.point_slug
    ? `https://qr.intaprd.com/t/${point.point_slug}`
    : `https://qr.intaprd.com/t/${point?.id}`;

  // Render QR to canvas
  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, publicUrl, {
      width: 280,
      margin: 2,
      errorCorrectionLevel: errorLevel,
      color: { dark: dotColor, light: bgColor },
    }).catch(err => console.error("QR render error:", err));
  }, [publicUrl, dotColor, bgColor, errorLevel]);

  function handleDownload(format) {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    if (format === "png" || format === "jpeg" || format === "webp") {
      const mime = format === "jpeg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png";
      const link = document.createElement("a");
      link.download = `qr-${point.id}.${format}`;
      link.href = canvas.toDataURL(mime, 0.95);
      link.click();
    } else if (format === "svg") {
      QRCode.toString(publicUrl, {
        type: "svg",
        width: 280,
        margin: 2,
        errorCorrectionLevel: errorLevel,
        color: { dark: dotColor, light: bgColor },
      }).then(svg => {
        const blob = new Blob([svg], { type: "image/svg+xml" });
        const link = document.createElement("a");
        link.download = `qr-${point.id}.svg`;
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
      });
    } else if (format === "pdf") {
      const dataUrl = canvas.toDataURL("image/png");
      const win = window.open("", "_blank");
      if (!win) { toast.error("Permite ventanas emergentes para descargar PDF"); return; }
      win.document.write(`<!DOCTYPE html><html><head><title>QR - ${point.name}</title>
        <style>body{margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif}
        img{width:280px;height:280px}p{margin-top:12px;font-size:13px;color:#64748b}
        @media print{body{margin:0}}</style></head>
        <body><img src="${dataUrl}"><p>${point.name}</p>
        <script>window.onload=function(){window.print();}<\/script></body></html>`);
      win.document.close();
    }
  }

  function copyUrl() {
    navigator.clipboard.writeText(publicUrl).then(() => toast.success("URL copiada"));
  }

  async function handleSaveDesign() {
    setSaving(true);
    try {
      const qrStyleJson = JSON.stringify({ dotColor, bgColor, errorLevel });
      await api.put(`/api/trace/points/${point.id}`, {
        name: point.name,
        area: point.area || null,
        description: point.description || null,
        template: point.template || "custom",
        qr_type: point.qr_type || "mixed",
        checklist_items: point.checklist_items || [],
        survey_questions: point.survey_questions || [],
        alert_config: point.alert_config || {},
        is_active: point.is_active !== undefined ? point.is_active : true,
        brand_color: dotColor,
        brand_logo: point.brand_logo || null,
        trace_project_id: point.trace_project_id || null,
        qr_style_json: qrStyleJson,
      });
      toast.success("Diseño del QR guardado");
    } catch (e) {
      toast.error(e.message || "Error guardando diseño");
    } finally {
      setSaving(false);
    }
  }

  if (!point) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div>
            <h2 className="font-bold text-slate-900">QR de punto TRACE</h2>
            <p className="text-xs text-slate-500 mt-0.5 truncate max-w-xs">{point.name}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 px-6 border-b border-slate-100 flex-shrink-0 overflow-x-auto">
          {[
            { id: "qr", label: "Código QR" },
            { id: "design", label: "Diseño" },
            { id: "preview", label: "Vista previa" },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* Canvas always mounted — hidden when not on QR tab */}
          <div className={`flex flex-col items-center gap-5 ${tab !== "qr" ? "hidden" : ""}`}>
            <div className="p-4 bg-white rounded-2xl shadow-sm border border-slate-100">
              <canvas ref={canvasRef} style={{ borderRadius: 8, display: "block" }} />
            </div>

            <div className="w-full max-w-sm">
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                <span className="text-xs font-mono text-slate-600 flex-1 truncate">{publicUrl}</span>
                <button onClick={copyUrl} className="text-xs text-blue-600 font-semibold hover:text-blue-800 flex-shrink-0">
                  Copiar
                </button>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap justify-center">
              {["png", "jpeg", "webp", "svg", "pdf"].map(fmt => (
                <button
                  key={fmt}
                  onClick={() => handleDownload(fmt)}
                  className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                    fmt === "png" ? "bg-blue-600 text-white hover:bg-blue-700"
                    : fmt === "pdf" ? "bg-red-50 text-red-700 hover:bg-red-100"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  ↓ {fmt.toUpperCase()}
                </button>
              ))}
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 bg-emerald-100 text-emerald-700 rounded-xl text-sm font-semibold hover:bg-emerald-200 transition-colors"
              >
                Ver landing →
              </a>
            </div>

            <p className="text-xs text-slate-400 text-center max-w-xs">
              PNG/JPEG/WebP para imprimir · SVG para Illustrator/Figma · PDF abre el diálogo de impresión
            </p>
          </div>

          {/* Design tab */}
          {tab === "design" && (
            <div className="space-y-6">
              {/* Color presets */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-3">Paleta de colores</label>
                <div className="grid grid-cols-3 gap-2">
                  {COLOR_PRESETS.map(p => (
                    <button
                      key={p.label}
                      onClick={() => { setDotColor(p.fg); setBgColor(p.bg); }}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-xs font-medium transition-colors ${
                        dotColor === p.fg && bgColor === p.bg
                          ? "border-blue-600 bg-blue-50 text-blue-700"
                          : "border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      <span className="w-5 h-5 rounded flex-shrink-0 border border-slate-200" style={{ background: p.fg }} />
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Color del código</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={dotColor} onChange={e => setDotColor(e.target.value)}
                      className="h-10 w-14 rounded-lg border border-slate-200 cursor-pointer" />
                    <span className="text-sm font-mono text-slate-500">{dotColor}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Color de fondo</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)}
                      className="h-10 w-14 rounded-lg border border-slate-200 cursor-pointer" />
                    <span className="text-sm font-mono text-slate-500">{bgColor}</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Corrección de error</label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { v: "L", label: "Baja (7%)" },
                    { v: "M", label: "Media (15%)" },
                    { v: "Q", label: "Alta (25%)" },
                    { v: "H", label: "Máxima (30%)" },
                  ].map(o => (
                    <button key={o.v} onClick={() => setErrorLevel(o.v)}
                      className={`py-2 px-2 rounded-xl border-2 text-xs font-medium transition-colors ${
                        errorLevel === o.v
                          ? "border-blue-600 bg-blue-50 text-blue-700"
                          : "border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-1">Mayor corrección → QR más denso pero resistente a daños</p>
              </div>

              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-center">
                <p className="text-xs text-slate-500 mb-3">Los cambios se aplican en tiempo real en la pestaña "Código QR"</p>
                <div className="flex gap-3 justify-center">
                  <button onClick={handleSaveDesign} disabled={saving}
                    className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50">
                    {saving ? "Guardando..." : "Guardar diseño"}
                  </button>
                  <button onClick={() => handleDownload("png")}
                    className="px-5 py-2.5 bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-300 transition-colors">
                    ↓ PNG
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Preview tab */}
          {tab === "preview" && (
            <div className="flex flex-col items-center gap-4">
              <p className="text-sm text-slate-500 text-center max-w-sm">
                Así verán la página pública los usuarios cuando escaneen el QR
              </p>
              <TraceLandingPreview point={point} />
              <a href={publicUrl} target="_blank" rel="noopener noreferrer"
                className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors">
                Abrir landing real →
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
