import { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { api } from "../utils/api.js";
import { toast } from "./Toast.jsx";

const ACCEPTED = ".csv,.xlsx,.xls";

function normalizeRows(data = []) {
  const seen = new Set();
  return data.map((r) => {
    const slug = String(r.slug ?? r.Slug ?? r.SLUG ?? "").trim().toLowerCase().replace(/[^a-z0-9-_]/g, "");
    const destination_url = String(r.url ?? r.URL ?? r.destination_url ?? r.Destination ?? r.target ?? "").trim();
    const project_name = String(r.proyecto ?? r.Proyecto ?? r.PROYECTO ?? r.project ?? r.Project ?? "").trim();
    return { slug, destination_url, project_name };
  }).filter((r) => {
    if (!r.slug || !r.destination_url || seen.has(r.slug)) return false;
    seen.add(r.slug);
    return true;
  });
}

function projectKey(value) {
  return String(value || "").trim().toLocaleLowerCase("es");
}

function downloadBlob(blob, name) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export default function BulkImportModal({ onClose, onImported }) {
  const [rows, setRows] = useState([]);
  const [projects, setProjects] = useState([]);
  const [batchName, setBatchName] = useState("");
  const [importing, setImporting] = useState(false);
  const [creatingProjects, setCreatingProjects] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const fileRef = useRef();

  const loadProjects = async () => {
    try {
      const data = await api.get("/api/projects");
      setProjects(data.projects || []);
      return data.projects || [];
    } catch (_) {
      setProjects([]);
      return [];
    }
  };

  useEffect(() => {
    let active = true;
    api.get("/api/projects")
      .then((data) => { if (active) setProjects(data.projects || []); })
      .catch(() => { if (active) setProjects([]); });
    return () => { active = false; };
  }, []);

  const projectsByName = useMemo(() => {
    const map = new Map();
    projects.forEach((p) => map.set(projectKey(p.name), p));
    return map;
  }, [projects]);

  const unknownProjects = useMemo(() => {
    return [...new Set(rows
      .map((r) => r.project_name)
      .filter(Boolean)
      .filter((name) => !projectsByName.has(projectKey(name))))];
  }, [rows, projectsByName]);

  const applyRows = (data, file) => {
    const mapped = normalizeRows(data);
    if (mapped.length === 0) {
      setRows([]);
      setError("El archivo debe contener las columnas slug y url con valores válidos.");
      return;
    }
    setRows(mapped);
    setFileName(file?.name || "Archivo cargado");
    setError("");
  };

  const readFile = async (file) => {
    if (!file) return;
    setError("");
    const ext = file.name.split(".").pop()?.toLowerCase();

    try {
      if (ext === "csv") {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: (res) => applyRows(res.data, file),
          error: () => setError("No se pudo leer el archivo CSV."),
        });
        return;
      }

      if (ext === "xlsx" || ext === "xls") {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const firstSheet = workbook.SheetNames[0];
        if (!firstSheet) throw new Error("El libro de Excel no contiene hojas.");
        const data = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: "" });
        applyRows(data, file);
        return;
      }

      setError("Formato no compatible. Usa CSV, XLSX o XLS.");
    } catch (e) {
      setRows([]);
      setError(e?.message || "No se pudo leer el archivo.");
    }
  };

  const onFile = (e) => readFile(e.target.files?.[0]);

  const onDrop = (e) => {
    e.preventDefault();
    readFile(e.dataTransfer.files?.[0]);
  };

  const downloadCsvTemplate = () => {
    const csv = "slug,url,proyecto\nmi-link,https://destino.com,Tarjetas NFC Agosto\notro-qr,https://otro.com/pagina,Tarjetas NFC Agosto\n";
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), "plantilla-carga-masiva-qr.csv");
  };

  const downloadExcelTemplate = () => {
    const data = [
      { slug: "mi-link", url: "https://destino.com", proyecto: "Tarjetas NFC Agosto" },
      { slug: "otro-qr", url: "https://otro.com/pagina", proyecto: "Tarjetas NFC Agosto" },
    ];
    const ws = XLSX.utils.json_to_sheet(data, { header: ["slug", "url", "proyecto"] });
    ws["!cols"] = [{ wch: 24 }, { wch: 44 }, { wch: 32 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "QRs");
    XLSX.writeFile(wb, "plantilla-carga-masiva-qr.xlsx");
  };

  const createMissingProjects = async () => {
    if (unknownProjects.length === 0 || creatingProjects) return;
    setCreatingProjects(true);
    setError("");

    try {
      for (const name of unknownProjects) {
        await api.post("/api/projects", { name });
      }
      await loadProjects();
      toast(unknownProjects.length === 1
        ? `Proyecto ${unknownProjects[0]} creado correctamente`
        : `${unknownProjects.length} proyectos creados correctamente`);
    } catch (e) {
      toast(e.message || "No se pudieron crear los proyectos", "error");
    } finally {
      setCreatingProjects(false);
    }
  };

  const run = async () => {
    if (!batchName || rows.length === 0 || unknownProjects.length > 0) return;
    const links = rows.map((row) => {
      const project = row.project_name ? projectsByName.get(projectKey(row.project_name)) : null;
      return {
        slug: row.slug,
        destination_url: row.destination_url,
        project_name: row.project_name || "",
        project_id: project?.id || null,
      };
    });

    setImporting(true);
    try {
      const data = await api.post("/api/bulk/upload", { batch_name: batchName, links });
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
      <div className="card w-full max-w-xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Generar códigos por lote</h2>
          <p className="text-xs text-gray-500 mt-0.5">Importa múltiples QRs desde CSV o Excel y asígnalos a sus proyectos.</p>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-gray-700">Columnas de la plantilla</p>
                <p className="text-xs font-mono text-gray-600 mt-1">slug &nbsp;|&nbsp; url &nbsp;|&nbsp; proyecto</p>
                <p className="text-[11px] text-gray-500 mt-1">Proyecto es opcional; si no existe, podrás crearlo aquí antes de importar.</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={downloadCsvTemplate} className="btn-secondary text-xs">Plantilla CSV</button>
                <button type="button" onClick={downloadExcelTemplate} className="btn-secondary text-xs">Plantilla Excel</button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nombre del lote</label>
            <input className="input" placeholder="Ej: Tarjetas NFC agosto 2026"
              value={batchName} onChange={(e) => setBatchName(e.target.value)} />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Archivo de datos</label>
            <div
              className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-brand-400 transition-colors"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
            >
              <p className="text-2xl mb-1">📄</p>
              <p className="text-sm text-gray-600">
                {rows.length > 0 ? `${rows.length} QRs listos para importar` : "Haz clic o arrastra tu CSV o Excel aquí"}
              </p>
              {fileName && <p className="text-xs text-gray-400 mt-1">{fileName}</p>}
              <p className="text-[11px] text-gray-400 mt-2">CSV · XLSX · XLS</p>
              <input ref={fileRef} type="file" accept={ACCEPTED} className="hidden" onChange={onFile} />
            </div>
            {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
            {unknownProjects.length > 0 && (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-800">
                <p className="font-semibold">{unknownProjects.length === 1 ? "Este proyecto todavía no existe" : "Hay proyectos que todavía no existen"}</p>
                <p className="mt-1">
                  {unknownProjects.length === 1
                    ? `El archivo usa el proyecto “${unknownProjects[0]}”. ¿Quieres crearlo ahora?`
                    : `El archivo usa ${unknownProjects.length} proyectos nuevos: ${unknownProjects.join(", ")}.`}
                </p>
                <button
                  type="button"
                  onClick={createMissingProjects}
                  disabled={creatingProjects}
                  className="btn-primary text-xs mt-3"
                >
                  {creatingProjects
                    ? "Creando..."
                    : unknownProjects.length === 1
                      ? `Crear proyecto “${unknownProjects[0]}”`
                      : `Crear ${unknownProjects.length} proyectos`}
                </button>
              </div>
            )}
          </div>

          {rows.length > 0 && (
            <div className="max-h-44 overflow-y-auto rounded-lg border border-gray-100">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 text-gray-500">Slug</th>
                    <th className="text-left px-3 py-2 text-gray-500">URL</th>
                    <th className="text-left px-3 py-2 text-gray-500">Proyecto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.slice(0, 20).map((r, i) => (
                    <tr key={`${r.slug}-${i}`}>
                      <td className="px-3 py-1.5 font-mono text-brand-700">/{r.slug}</td>
                      <td className="px-3 py-1.5 text-gray-500 max-w-[220px] truncate">{r.destination_url}</td>
                      <td className={`px-3 py-1.5 max-w-[180px] truncate ${r.project_name && !projectsByName.has(projectKey(r.project_name)) ? "text-amber-700 font-medium" : "text-gray-500"}`}>
                        {r.project_name || "—"}
                      </td>
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
          <button onClick={run} disabled={!batchName || rows.length === 0 || importing || creatingProjects || unknownProjects.length > 0} className="btn-primary">
            {importing ? "Importando..." : `Importar ${rows.length} QRs`}
          </button>
        </div>
      </div>
    </div>
  );
}