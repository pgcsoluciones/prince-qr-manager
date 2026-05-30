import { useEffect, useRef } from "react";
import QRCodeStyling from "qr-code-styling";
import ImageUpload from "./ImageUpload.jsx";

const DOT_STYLES = ["square", "dots", "rounded", "classy", "classy-rounded", "extra-rounded"];
const CORNER_STYLES = ["square", "dot", "extra-rounded"];

export default function QRStyler({ url, style = {}, onChange }) {
  const containerRef = useRef(null);
  const qrRef = useRef(null);

  const options = {
    width: 200,
    height: 200,
    data: url || "https://ejemplo.com",
    dotsOptions: { color: style.dotColor || "#0c4a6e", type: style.dotStyle || "rounded" },
    cornersSquareOptions: { type: style.cornerStyle || "extra-rounded", color: style.dotColor || "#0c4a6e" },
    cornersDotOptions: { type: style.cornerStyle || "dot", color: style.accentColor || "#0ea5e9" },
    backgroundOptions: { color: style.bgColor || "#ffffff" },
    imageOptions: { crossOrigin: "anonymous", margin: 4 },
    image: style.logo || undefined,
  };

  useEffect(() => {
    if (!containerRef.current) return;
    if (!qrRef.current) {
      qrRef.current = new QRCodeStyling(options);
      qrRef.current.append(containerRef.current);
    } else {
      qrRef.current.update(options);
    }
  }, [url, style]);

  const update = (key, val) => onChange?.({ ...style, [key]: val });

  return (
    <div className="space-y-4">
      {/* Preview */}
      <div className="flex justify-center">
        <div className="rounded-xl border border-gray-200 p-3 bg-white shadow-sm" ref={containerRef} />
      </div>

      {/* Controls */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Color principal</label>
          <input type="color" className="w-full h-9 rounded-lg border border-gray-200 cursor-pointer p-0.5"
            value={style.dotColor || "#0c4a6e"}
            onChange={(e) => update("dotColor", e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Color acento</label>
          <input type="color" className="w-full h-9 rounded-lg border border-gray-200 cursor-pointer p-0.5"
            value={style.accentColor || "#0ea5e9"}
            onChange={(e) => update("accentColor", e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Fondo</label>
          <input type="color" className="w-full h-9 rounded-lg border border-gray-200 cursor-pointer p-0.5"
            value={style.bgColor || "#ffffff"}
            onChange={(e) => update("bgColor", e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Estilo puntos</label>
          <select className="input text-xs" value={style.dotStyle || "rounded"}
            onChange={(e) => update("dotStyle", e.target.value)}>
            {DOT_STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Esquinas</label>
          <div className="flex gap-2">
            {CORNER_STYLES.map((s) => (
              <button key={s} type="button"
                className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                  (style.cornerStyle || "extra-rounded") === s
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
                onClick={() => update("cornerStyle", s)}>{s}</button>
            ))}
          </div>
        </div>
        <div className="col-span-2">
          <ImageUpload
            label="Logo (opcional)"
            hint="Se mostrará en el centro del QR. Recomendado: PNG con fondo transparente."
            value={style.logo || ""}
            onChange={(url) => update("logo", url)}
            maxSizeMB={1}
          />
        </div>
      </div>
    </div>
  );
}
