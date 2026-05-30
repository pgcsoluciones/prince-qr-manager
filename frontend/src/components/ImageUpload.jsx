import { useState, useRef } from "react";
import { api } from "../utils/api.js";

/**
 * ImageUpload component
 * Props:
 *   value      — current URL string
 *   onChange   — fn(url: string)
 *   maxSizeMB  — max file size in MB (default 2)
 *   label      — field label
 *   hint       — optional hint text
 */
export default function ImageUpload({ value, onChange, maxSizeMB = 2, label = "Imagen", hint }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];
  const maxBytes = maxSizeMB * 1024 * 1024;

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");

    if (!allowedTypes.includes(file.type)) {
      setError("Formato no permitido. Usa JPG, PNG, WebP o SVG");
      return;
    }
    if (file.size > maxBytes) {
      setError(`Archivo muy grande (máx ${maxSizeMB}MB)`);
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const token = localStorage.getItem("qr_token") || "";
      const BASE = import.meta.env.VITE_API_URL || "https://api.code.intaprd.com";
      const res = await fetch(`${BASE}/api/upload/image`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      let data;
      try { data = await res.json(); } catch (_) { throw new Error("Error de conexión al subir imagen"); }
      if (!data.ok) throw new Error(data.error || "Error subiendo imagen");
      onChange(data.url);
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      {label && <label className="block text-sm font-medium text-slate-700">{label}</label>}
      {hint && <p className="text-xs text-slate-400">{hint}</p>}

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Subiendo...
            </span>
          ) : (
            "📁 Subir imagen"
          )}
        </button>

        {value && (
          <div className="flex items-center gap-2">
            <img
              src={value}
              alt="Vista previa"
              className="h-10 w-auto max-w-[120px] object-contain rounded border border-slate-100"
              onError={e => { e.target.style.display = "none"; }}
            />
            <button
              type="button"
              onClick={() => onChange("")}
              className="text-xs text-red-500 hover:text-red-700"
              title="Eliminar imagen"
            >✕</button>
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/svg+xml"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
