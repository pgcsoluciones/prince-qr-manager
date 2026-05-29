import { useEffect, useRef } from "react";
import QRCodeStyling from "qr-code-styling";

const WORKER = "https://prince-qr-manager-backend.fliaprince.workers.dev";

export default function QRDownloadModal({ slug, styleJson, onClose }) {
  const containerRef = useRef(null);
  const qrRef = useRef(null);
  const style = styleJson ? (typeof styleJson === "string" ? JSON.parse(styleJson) : styleJson) : {};
  const url = `${WORKER}/${slug}`;

  const options = {
    width: 300,
    height: 300,
    data: url,
    dotsOptions:       { color: style.dotColor    || "#0c4a6e", type: style.dotStyle    || "rounded" },
    cornersSquareOptions: { type: style.cornerStyle || "extra-rounded", color: style.dotColor || "#0c4a6e" },
    cornersDotOptions: { type: style.cornerStyle   || "dot",    color: style.accentColor || "#0ea5e9" },
    backgroundOptions: { color: style.bgColor      || "#ffffff" },
    image: style.logo || undefined,
    imageOptions: { crossOrigin: "anonymous", margin: 4 },
  };

  useEffect(() => {
    if (!containerRef.current) return;
    qrRef.current = new QRCodeStyling(options);
    qrRef.current.append(containerRef.current);
  }, []);

  const download = (ext) => qrRef.current?.download({ name: `qr-${slug}`, extension: ext });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="card p-6 w-full max-w-sm text-center" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-gray-900 mb-1">Código QR — /{slug}</h3>
        <p className="text-xs text-gray-500 mb-4 break-all">{url}</p>
        <div className="flex justify-center mb-4" ref={containerRef} />
        <div className="grid grid-cols-3 gap-2 mb-3">
          <button onClick={() => download("png")} className="btn-secondary text-xs">PNG</button>
          <button onClick={() => download("svg")} className="btn-secondary text-xs">SVG</button>
          <button onClick={() => download("webp")} className="btn-secondary text-xs">WEBP</button>
        </div>
        <button onClick={onClose} className="btn-secondary w-full">Cerrar</button>
      </div>
    </div>
  );
}
