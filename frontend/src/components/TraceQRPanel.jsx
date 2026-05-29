import { useEffect, useRef, useState } from "react";
import QRCodeStyling from "qr-code-styling";
import TraceLandingPreview from "./TraceLandingPreview.jsx";
import { api } from "../utils/api.js";
import { toast } from "./Toast.jsx";

const DOT_STYLES = [
  { value: "square", label: "Cuadrado" },
  { value: "dots", label: "Círculos" },
  { value: "rounded", label: "Redondeado" },
  { value: "classy", label: "Clásico" },
  { value: "classy-rounded", label: "Clásico R." },
  { value: "extra-rounded", label: "Extra R." },
];

const CORNER_STYLES = [
  { value: "square", label: "Cuadrado" },
  { value: "dot", label: "Punto" },
  { value: "extra-rounded", label: "Redondeado" },
];

/**
 * TraceQRPanel
 * Props:
 *   point    — trace_point object (must have at least id, name, brand_color)
 *   onClose  — fn() to close the panel/modal
 */
export default function TraceQRPanel({ point, onClose }) {
  const qrContainerRef = useRef(null);
  const qrInstance = useRef(null);
  const [tab, setTab] = useState("qr"); // "qr" | "design" | "preview"
  const [saving, setSaving] = useState(false);

  // Design state (initialized from point.brand_color or defaults)
  const [dotColor, setDotColor] = useState(point?.brand_color || "#2563eb");
  const [bgColor, setBgColor] = useState("#ffffff");
  const [dotStyle, setDotStyle] = useState("square");
  const [cornerStyle, setCornerStyle] = useState("square");

  const publicUrl = `https://qr.intaprd.com/t/${point?.id}`;

  // Build QR options
  function buildOptions(size = 280) {
    return {
      width: size,
      height: size,
      data: publicUrl,
      dotsOptions: { color: dotColor, type: dotStyle },
      cornersSquareOptions: { type: cornerStyle },
      backgroundOptions: { color: bgColor },
      imageOptions: { crossOrigin: "anonymous", margin: 4 },
    };
  }

  // Initialize QR on mount
  useEffect(() => {
    if (!qrContainerRef.current) return;
    qrInstance.current = new QRCodeStyling(buildOptions(280));
    qrInstance.current.append(qrContainerRef.current);
    return () => {
      if (qrContainerRef.current) qrContainerRef.current.innerHTML = "";
    };
  }, []);

  // Update QR when design changes
  useEffect(() => {
    if (!qrInstance.current) return;
    qrInstance.current.update(buildOptions(280));
  }, [dotColor, bgColor, dotStyle, cornerStyle]);

  function handleDownload(format) {
    if (!qrInstance.current) return;
    qrInstance.current.download({ name: `qr-${point.id}`, extension: format });
  }

  function copyUrl() {
    navigator.clipboard.writeText(publicUrl).then(() => toast.success("URL copiada"));
  }

  async function handleSaveDesign() {
    setSaving(true);
    try {
      const qrStyleJson = JSON.stringify({ dotColor, bgColor, dotStyle, cornerStyle });
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
        brand_color: point.brand_color || "#2563eb",
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

          {/* QR tab */}
          {tab === "qr" && (
            <div className="flex flex-col items-center gap-6">
              <div className="p-4 bg-white rounded-2xl shadow-sm border border-slate-100">
                <div ref={qrContainerRef} />
              </div>

              {/* URL display */}
              <div className="w-full max-w-sm">
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                  <span className="text-xs font-mono text-slate-600 flex-1 truncate">{publicUrl}</span>
                  <button
                    onClick={copyUrl}
                    className="text-xs text-blue-600 font-semibold hover:text-blue-800 flex-shrink-0"
                  >
                    Copiar
                  </button>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-3 flex-wrap justify-center">
                <button
                  onClick={() => handleDownload("png")}
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
                >
                  ↓ Descargar PNG
                </button>
                <button
                  onClick={() => handleDownload("svg")}
                  className="px-5 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-200 transition-colors"
                >
                  ↓ Descargar SVG
                </button>
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-5 py-2.5 bg-emerald-100 text-emerald-700 rounded-xl text-sm font-semibold hover:bg-emerald-200 transition-colors"
                >
                  Ver landing →
                </a>
              </div>

              <p className="text-xs text-slate-400 text-center max-w-xs">
                Este QR lleva a la página pública del punto de control donde los usuarios pueden registrar respuestas.
              </p>
            </div>
          )}

          {/* Design tab */}
          {tab === "design" && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Color de puntos</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={dotColor}
                      onChange={e => setDotColor(e.target.value)}
                      className="h-10 w-14 rounded-lg border border-slate-200 cursor-pointer"
                    />
                    <span className="text-sm font-mono text-slate-500">{dotColor}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Color de fondo</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={bgColor}
                      onChange={e => setBgColor(e.target.value)}
                      className="h-10 w-14 rounded-lg border border-slate-200 cursor-pointer"
                    />
                    <span className="text-sm font-mono text-slate-500">{bgColor}</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Estilo de puntos</label>
                <div className="grid grid-cols-3 gap-2">
                  {DOT_STYLES.map(s => (
                    <button
                      key={s.value}
                      onClick={() => setDotStyle(s.value)}
                      className={`py-2 px-3 rounded-xl border-2 text-xs font-medium transition-colors ${
                        dotStyle === s.value
                          ? "border-blue-600 bg-blue-50 text-blue-700"
                          : "border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Estilo de esquinas</label>
                <div className="grid grid-cols-3 gap-2">
                  {CORNER_STYLES.map(s => (
                    <button
                      key={s.value}
                      onClick={() => setCornerStyle(s.value)}
                      className={`py-2 px-3 rounded-xl border-2 text-xs font-medium transition-colors ${
                        cornerStyle === s.value
                          ? "border-blue-600 bg-blue-50 text-blue-700"
                          : "border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Hidden QR container for design tab - we show a note instead */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-center">
                <p className="text-sm text-slate-500 mb-2">Cambia a la pestaña "Código QR" para ver la vista previa actualizada</p>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={handleSaveDesign}
                    disabled={saving}
                    className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {saving ? "Guardando..." : "Guardar diseño"}
                  </button>
                  <button
                    onClick={() => handleDownload("png")}
                    className="px-5 py-2.5 bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-300 transition-colors"
                  >
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
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
              >
                Abrir landing real →
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
