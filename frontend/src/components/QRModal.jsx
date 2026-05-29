import { useEffect, useRef } from "react";
import QRCode from "qrcode";

const WORKER = "https://qr.intaprd.com";

export default function QRModal({ slug, onClose }) {
  const canvasRef = useRef(null);
  const url = `${WORKER}/${slug}`;

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, url, {
        width: 256,
        margin: 2,
        color: { dark: "#0c4a6e", light: "#ffffff" },
      });
    }
  }, [url]);

  const download = () => {
    const link = document.createElement("a");
    link.download = `qr-${slug}.png`;
    link.href = canvasRef.current.toDataURL();
    link.click();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="card p-6 w-full max-w-sm text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold text-gray-900 mb-1">Código QR</h3>
        <p className="text-xs text-gray-500 mb-4 break-all">{url}</p>
        <canvas ref={canvasRef} className="mx-auto rounded-lg" />
        <div className="flex gap-2 mt-4">
          <button onClick={download} className="btn-primary flex-1">Descargar PNG</button>
          <button onClick={onClose} className="btn-secondary flex-1">Cerrar</button>
        </div>
      </div>
    </div>
  );
}
