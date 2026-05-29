import { useState, useRef } from "react";
import Papa from "papaparse";
import { api } from "../utils/api.js";
import { toast } from "./Toast.jsx";

export default function BulkImportModal({ onClose, onImported }) {
  const [rows, setRows]         = useState([]);
  const [batchName, setBatchName] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError]       = useState("");
  const fileRef = useRef();

  const onFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError("");
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        // Acepta columnas: slug, url / destination_url / target
        const mapped = res.data.map((r) => ({
          slug: r.slug || r.Slug || "",
          destination_url: r.url || r.URL || r.destination_url || r.target || "",
        })).filter((r) => r.slug && r.destination_url);

        if (mapped.length === 0) {
          setError("El CSV debe tener columnas: slug, url");
          return;
        }
        setRows(mapped);
      },
      error: () => setError("Error al leer el archivo CSV"),
    });
  };

  const run = async () => {
    if (!batchName || rows.length === 0) return;
    setImporting(true);
    try {
      const data = await api.post("/api/bulk/upload", { batch_name: batchName, links: rows });
      toast(`${data.total_inserted} QRs importados exitosamente`);
      onImported();
      onClose();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Carga masiva CSV</h2>
          <p className="text-xs text-gray-500 mt-0.5">Importa múltiples QRs desde un archivo CSV</p>
        </div>

        <div className="p-5 space-y-4">
          {/* Formato esperado */}
          <div className="bg-gray-50 rounded-lg p-3 text-xs font-mono text-gray-600">
            <p className="font-semibold text-gray-700 mb-1 font-sans">Formato CSV esperado:</p>
            <p>slug,url</p>
            <p>mi-link,https://destino.com</p>
            <p>otro-qr,https://otro.com/pagina</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nombre del lote</label>
            <input className="input" placeholder="Ej: Campaña Navidad 2025"
              value={batchName} onChange={(e) => setBatchName(e.target.value)} />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Archivo CSV</label>
            <div
              className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-brand-400 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <p className="text-2xl mb-1">📄</p>
              <p className="text-sm text-gray-600">
                {rows.length > 0 ? `${rows.length} filas cargadas` : "Haz clic o arrastra tu CSV aquí"}
              </p>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={onFile} />
            </div>
            {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
          </div>

          {rows.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-100">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 text-gray-500">Slug</th>
                    <th className="text-left px-3 py-2 text-gray-500">URL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.slice(0, 20).map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5 font-mono text-brand-700">/{r.slug}</td>
                      <td className="px-3 py-1.5 text-gray-500 max-w-[200px] truncate">{r.destination_url}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 20 && <p className="text-center text-xs text-gray-400 py-2">+{rows.length - 20} más...</p>}
            </div>
          )}
        </div>

        <div className="p-5 border-t border-gray-100 flex justify-between">
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
          <button onClick={run} disabled={!batchName || rows.length === 0 || importing} className="btn-primary">
            {importing ? "Importando..." : `Importar ${rows.length} QRs`}
          </button>
        </div>
      </div>
    </div>
  );
}
