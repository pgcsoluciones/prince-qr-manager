import { useEffect, useState } from "react";

const BASE = import.meta.env.VITE_API_URL || "https://api.code.intaprd.com";
const API = "/api/trace/v1/admin";

function authHeaders(extra = {}) {
  const token = localStorage.getItem("qr_token") || "";
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra };
}

async function jsonRequest(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: authHeaders({ "Content-Type": "application/json", ...(options.headers || {}) }),
  });
  const data = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
  if (!res.ok || data?.ok === false) throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
  return data;
}

async function download(path, filename) {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const TABS = [
  ["templates", "Plantillas"],
  ["imports", "Importaciones"],
  ["reports", "Reportes"],
];

const IMPORT_TYPES = [
  ["assets", "Recursos / activos", "Activos, equipos, inmuebles o elementos trazables."],
  ["processes", "Procesos", "Procesos base que luego pueden configurarse y publicarse."],
  ["users", "Usuarios", "Usuarios vinculados al tenant."],
  ["participants", "Participantes", "Asignaciones de usuarios a ejecuciones y roles."],
];

export default function TraceAdminPage() {
  const [tab, setTab] = useState("templates");
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [importType, setImportType] = useState("assets");
  const [file, setFile] = useState(null);
  const [importResult, setImportResult] = useState(null);

  const loadTemplates = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await jsonRequest(`${API}/templates`);
      setTemplates(data.data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTemplates(); }, []);

  const instantiate = async (template) => {
    setBusy(template.id);
    setError("");
    setMessage("");
    try {
      const data = await jsonRequest(`${API}/templates/${encodeURIComponent(template.id)}/instantiate`, {
        method: "POST",
        body: JSON.stringify({ name: template.name }),
      });
      setMessage(`Proceso creado en borrador: ${data.data?.name || template.name}. Ya puede editarse antes de publicar.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const downloadTemplate = async () => {
    setBusy("download-template");
    setError("");
    try {
      await download(`${API}/imports/template/${importType}`, `trace-import-${importType}.xlsx`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const runImport = async (mode) => {
    if (!file) return setError("Selecciona primero un archivo Excel.");
    setBusy(`import-${mode}`);
    setError("");
    setMessage("");
    setImportResult(null);
    try {
      const form = new FormData();
      form.append("type", importType);
      form.append("mode", mode);
      form.append("file", file);
      if (mode === "execute") form.append("idempotencyKey", `${importType}-${file.name}-${file.size}-${file.lastModified}`);
      const res = await fetch(`${BASE}${API}/imports/file`, { method: "POST", headers: authHeaders(), body: form });
      const data = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
      if (!res.ok || data?.ok === false) throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
      setImportResult(data.data || {});
      setMessage(mode === "validate" ? "Archivo validado. Revisa el resultado antes de importar." : "Importación procesada correctamente.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const exportReport = async (format) => {
    setBusy(`report-${format}`);
    setError("");
    try {
      const filename = `trace-report.${format}`;
      await download(`${API}/reports/executions?format=${format}`, filename);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">INTAP TRACE · V1</p>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">Gestión TRACE</h1>
          <p className="text-sm text-slate-500 mt-1">Configura procesos, importa datos y genera reportes desde un solo lugar.</p>
        </div>
        <span className="inline-flex w-fit items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Administración</span>
      </div>

      <div className="flex gap-2 border-b border-slate-200 overflow-x-auto">
        {TABS.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={`px-4 py-3 text-sm font-semibold border-b-2 whitespace-nowrap ${tab === key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{label}</button>
        ))}
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}

      {tab === "templates" && (
        <section className="space-y-4">
          <div>
            <h2 className="font-semibold text-slate-900">Plantillas por rubro</h2>
            <p className="text-sm text-slate-500">Úsalas como punto de partida. La copia se crea en borrador y puede editarse antes de publicar.</p>
          </div>
          {loading ? <div className="card p-6 text-sm text-slate-500">Cargando plantillas…</div> : (
            <div className="grid gap-4 md:grid-cols-2">
              {templates.map((tpl) => (
                <article key={tpl.id} className="card p-5 flex flex-col gap-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">{tpl.industry === "construction" ? "Construcción" : tpl.industry === "logistics" ? "Logística" : tpl.industry}</span>
                      <h3 className="font-bold text-slate-900 mt-1">{tpl.name}</h3>
                      <p className="text-sm text-slate-500 mt-1">{tpl.description}</p>
                    </div>
                    <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">V{tpl.version}</span>
                  </div>
                  <div className="space-y-2">
                    {(tpl.stages || []).map((stage, i) => (
                      <div key={stage.key || i} className="flex items-center gap-3 text-sm">
                        <span className="grid h-6 w-6 place-items-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">{i + 1}</span>
                        <span className="text-slate-700">{stage.name}</span>
                      </div>
                    ))}
                  </div>
                  <button disabled={busy === tpl.id} onClick={() => instantiate(tpl)} className="btn-primary mt-auto">{busy === tpl.id ? "Creando…" : "Usar esta plantilla"}</button>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === "imports" && (
        <section className="space-y-5">
          <div>
            <h2 className="font-semibold text-slate-900">Importación masiva</h2>
            <p className="text-sm text-slate-500">Descarga la plantilla, complétala en Excel, valida y luego importa.</p>
          </div>
          <div className="card p-5 space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {IMPORT_TYPES.map(([key, label, desc]) => (
                <button key={key} onClick={() => { setImportType(key); setImportResult(null); setFile(null); }} className={`rounded-xl border p-4 text-left transition ${importType === key ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300"}`}>
                  <div className="text-sm font-bold text-slate-900">{label}</div>
                  <div className="text-xs text-slate-500 mt-1">{desc}</div>
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <button onClick={downloadTemplate} disabled={busy === "download-template"} className="btn-secondary">Descargar plantilla Excel</button>
              <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-semibold" />
            </div>
            {file && <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">Archivo seleccionado: <strong>{file.name}</strong></div>}
            <div className="flex flex-wrap gap-2">
              <button onClick={() => runImport("validate")} disabled={!file || busy} className="btn-secondary">{busy === "import-validate" ? "Validando…" : "Validar archivo"}</button>
              <button onClick={() => runImport("execute")} disabled={!file || busy} className="btn-primary">{busy === "import-execute" ? "Importando…" : "Importar datos"}</button>
            </div>
            {importResult && (
              <div className="grid gap-3 sm:grid-cols-4">
                {[['Total', importResult.totalRows], ['Válidas / éxito', importResult.validRows ?? importResult.successRows], ['Inválidas / fallos', importResult.invalidRows ?? importResult.failedRows], ['Estado', importResult.status || 'validado']].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-slate-200 p-3"><div className="text-xs text-slate-500">{label}</div><div className="text-lg font-bold text-slate-900 mt-1">{value ?? 0}</div></div>
                ))}
              </div>
            )}
            {importResult?.errors?.length > 0 && (
              <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead><tr className="text-left text-slate-500"><th className="py-2 pr-4">Fila</th><th className="py-2 pr-4">Columna</th><th className="py-2">Error</th></tr></thead><tbody>{importResult.errors.map((e, i) => <tr key={i} className="border-t"><td className="py-2 pr-4">{e.row}</td><td className="py-2 pr-4">{e.column}</td><td className="py-2 text-red-600">{e.message}</td></tr>)}</tbody></table></div>
            )}
          </div>
        </section>
      )}

      {tab === "reports" && (
        <section className="space-y-5">
          <div>
            <h2 className="font-semibold text-slate-900">Reportes de ejecuciones</h2>
            <p className="text-sm text-slate-500">Exporta la trazabilidad del tenant en el formato que necesites.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[["xlsx","Excel XLSX","Para análisis y trabajo operativo"],["csv","CSV","Para interoperabilidad"],["pdf","PDF","Para compartir o archivar"],["json","JSON","Para integraciones y respaldo"]].map(([format,label,desc]) => (
              <button key={format} onClick={() => exportReport(format)} disabled={busy === `report-${format}`} className="card p-5 text-left hover:border-blue-300 transition">
                <div className="text-xs font-bold uppercase text-blue-600">.{format}</div>
                <div className="font-bold text-slate-900 mt-2">{label}</div>
                <div className="text-xs text-slate-500 mt-1">{desc}</div>
                <div className="text-sm font-semibold text-blue-700 mt-4">{busy === `report-${format}` ? "Generando…" : "Descargar →"}</div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
