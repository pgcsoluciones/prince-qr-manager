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

const MAIN_TABS = [
  ["summary", "Resumen"],
  ["processes", "Procesos"],
  ["executions", "Ejecuciones"],
  ["quality", "Calidad / Supervisión"],
  ["management", "Gestión"],
];

const MANAGEMENT_TABS = [
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

function Status({ value }) {
  const map = {
    completed: "bg-emerald-50 text-emerald-700",
    active: "bg-emerald-50 text-emerald-700",
    approved: "bg-emerald-50 text-emerald-700",
    in_progress: "bg-blue-50 text-blue-700",
    assigned: "bg-blue-50 text-blue-700",
    pending: "bg-slate-100 text-slate-700",
    draft: "bg-slate-100 text-slate-700",
    pending_approval: "bg-amber-50 text-amber-700",
    correction_required: "bg-orange-50 text-orange-700",
    blocked: "bg-red-50 text-red-700",
    overdue: "bg-red-50 text-red-700",
    rejected: "bg-red-50 text-red-700",
    open: "bg-red-50 text-red-700",
    in_review: "bg-amber-50 text-amber-700",
    in_progress_incident: "bg-blue-50 text-blue-700",
  };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${map[value] || "bg-slate-100 text-slate-700"}`}>{String(value || "—").replaceAll("_", " ")}</span>;
}

function Metric({ label, value, hint, danger = false }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${danger && Number(value) > 0 ? "text-red-600" : "text-slate-900"}`}>{value ?? 0}</div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

function Empty({ children }) {
  return <div className="card p-8 text-center text-sm text-slate-500">{children}</div>;
}

export default function TraceAdminPage() {
  const [tab, setTab] = useState("summary");
  const [managementTab, setManagementTab] = useState("templates");
  const [overview, setOverview] = useState({ metrics:{}, processes:[], executions:[], incidents:[], approvals:[] });
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [importType, setImportType] = useState("assets");
  const [file, setFile] = useState(null);
  const [importResult, setImportResult] = useState(null);

  const loadAll = async () => {
    setLoading(true);
    setError("");
    try {
      const [overviewData, templateData] = await Promise.all([
        jsonRequest(`${API}/overview`),
        jsonRequest(`${API}/templates`),
      ]);
      setOverview(overviewData.data || { metrics:{}, processes:[], executions:[], incidents:[], approvals:[] });
      setTemplates(templateData.data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const instantiate = async (template) => {
    setBusy(template.id); setError(""); setMessage("");
    try {
      const data = await jsonRequest(`${API}/templates/${encodeURIComponent(template.id)}/instantiate`, {
        method: "POST", body: JSON.stringify({ name: template.name }),
      });
      setMessage(`Proceso creado en borrador: ${data.data?.name || template.name}. Ya puede editarse antes de publicar.`);
      await loadAll();
      setTab("processes");
    } catch (e) { setError(e.message); }
    finally { setBusy(""); }
  };

  const downloadTemplate = async () => {
    setBusy("download-template"); setError("");
    try { await download(`${API}/imports/template/${importType}`, `trace-import-${importType}.xlsx`); }
    catch (e) { setError(e.message); }
    finally { setBusy(""); }
  };

  const runImport = async (mode) => {
    if (!file) return setError("Selecciona primero un archivo Excel.");
    setBusy(`import-${mode}`); setError(""); setMessage(""); setImportResult(null);
    try {
      const form = new FormData();
      form.append("type", importType); form.append("mode", mode); form.append("file", file);
      if (mode === "execute") form.append("idempotencyKey", `${importType}-${file.name}-${file.size}-${file.lastModified}`);
      const res = await fetch(`${BASE}${API}/imports/file`, { method: "POST", headers: authHeaders(), body: form });
      const data = await res.json().catch(() => ({ ok:false, error:`HTTP ${res.status}` }));
      if (!res.ok || data?.ok === false) throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
      setImportResult(data.data || {});
      setMessage(mode === "validate" ? "Archivo validado. Revisa el resultado antes de importar." : "Importación procesada correctamente.");
      if (mode === "execute") await loadAll();
    } catch (e) { setError(e.message); }
    finally { setBusy(""); }
  };

  const exportReport = async (format) => {
    setBusy(`report-${format}`); setError("");
    try { await download(`${API}/reports/executions?format=${format}`, `trace-report.${format}`); }
    catch (e) { setError(e.message); }
    finally { setBusy(""); }
  };

  const m = overview.metrics || {};
  const executions = overview.executions || [];
  const processes = overview.processes || [];
  const incidents = overview.incidents || [];
  const approvals = overview.approvals || [];

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">INTAP TRACE · V1</p>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">Panel TRACE</h1>
          <p className="text-sm text-slate-500 mt-1">Procesos, ejecuciones, calidad, supervisión y administración en una sola operación.</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/trace-operational" target="_blank" rel="noreferrer" className="btn-secondary">Portal operacional ↗</a>
          <button onClick={loadAll} disabled={loading} className="btn-secondary">{loading ? "Actualizando…" : "Actualizar"}</button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {MAIN_TABS.map(([key,label]) => (
          <button key={key} onClick={() => setTab(key)} className={`px-3 sm:px-4 py-3 text-sm font-semibold border-b-2 whitespace-nowrap ${tab === key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{label}</button>
        ))}
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}

      {tab === "summary" && (
        <section className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Procesos" value={m.processes} hint={`${m.activeProcesses || 0} activos · ${m.draftProcesses || 0} borradores`} />
            <Metric label="Ejecuciones" value={m.executions} hint={`${m.inProgress || 0} en operación · ${m.completed || 0} completadas`} />
            <Metric label="Incidencias abiertas" value={m.openIncidents} hint={`${m.criticalIncidents || 0} críticas`} danger />
            <Metric label="Aprobaciones pendientes" value={m.pendingApprovals} hint={`${m.correctionStages || 0} etapas en corrección`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="card p-5 lg:col-span-2">
              <div className="flex items-center justify-between"><h2 className="font-bold text-slate-900">Actividad operacional</h2><button onClick={() => setTab("executions")} className="text-xs font-semibold text-blue-700">Ver todas →</button></div>
              <div className="mt-4 space-y-3">
                {executions.slice(0,6).map((e) => <div key={e.id} className="flex flex-col gap-2 border-b border-slate-100 pb-3 last:border-0 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-xs font-semibold text-blue-600">{e.execution_code}</div><div className="text-sm font-semibold text-slate-900">{e.title || e.process_name}</div><div className="text-xs text-slate-500">{e.process_name}{e.asset_name ? ` · ${e.asset_name}` : ""}</div></div><div className="flex items-center gap-3"><span className="text-xs text-slate-500">{Number(e.completion_percentage || 0)}%</span><Status value={e.status} /></div></div>)}
                {!executions.length && <p className="text-sm text-slate-500">Aún no hay ejecuciones.</p>}
              </div>
            </div>
            <div className="card p-5">
              <h2 className="font-bold text-slate-900">Atención requerida</h2>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-slate-600">Bloqueadas / corrección</span><strong className={m.blocked ? "text-red-600" : "text-slate-900"}>{m.blocked || 0}</strong></div>
                <div className="flex justify-between"><span className="text-slate-600">Etapas por aprobar</span><strong>{m.pendingApprovalStages || 0}</strong></div>
                <div className="flex justify-between"><span className="text-slate-600">Incidencias críticas</span><strong className={m.criticalIncidents ? "text-red-600" : "text-slate-900"}>{m.criticalIncidents || 0}</strong></div>
                <div className="flex justify-between"><span className="text-slate-600">Recursos activos</span><strong>{m.activeAssets || 0}</strong></div>
              </div>
              <button onClick={() => setTab("quality")} className="btn-secondary w-full mt-5">Abrir supervisión</button>
            </div>
          </div>
        </section>
      )}

      {tab === "processes" && (
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-3"><div><h2 className="font-bold text-slate-900">Procesos y versiones</h2><p className="text-sm text-slate-500">Cada proceso conserva versiones independientes y publicables.</p></div><button onClick={() => { setTab("management"); setManagementTab("templates"); }} className="btn-primary">Crear desde plantilla</button></div>
          {!processes.length ? <Empty>No hay procesos todavía.</Empty> : <div className="grid gap-4 md:grid-cols-2">{processes.map((p) => <article key={p.id} className="card p-5"><div className="flex justify-between gap-3"><div><div className="text-xs font-semibold uppercase text-blue-600">{p.category || "general"}</div><h3 className="mt-1 font-bold text-slate-900">{p.name}</h3><p className="mt-1 text-sm text-slate-500">{p.description || "Sin descripción"}</p></div><Status value={p.status} /></div><div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 text-center"><div><div className="text-lg font-bold">{p.version_count || 0}</div><div className="text-[11px] text-slate-500">Versiones</div></div><div><div className="text-lg font-bold">{p.published_versions || 0}</div><div className="text-[11px] text-slate-500">Publicadas</div></div><div><div className="text-lg font-bold">{p.execution_count || 0}</div><div className="text-[11px] text-slate-500">Ejecuciones</div></div></div></article>)}</div>}
        </section>
      )}

      {tab === "executions" && (
        <section className="space-y-4">
          <div><h2 className="font-bold text-slate-900">Ejecuciones</h2><p className="text-sm text-slate-500">Instancias reales del motor Process → Version → Stages.</p></div>
          {!executions.length ? <Empty>No hay ejecuciones para este tenant.</Empty> : <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Código / ejecución</th><th className="px-4 py-3">Proceso / recurso</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Avance</th><th className="px-4 py-3">Calidad</th></tr></thead><tbody>{executions.map((e) => <tr key={e.id} className="border-t border-slate-100"><td className="px-4 py-3"><div className="font-semibold text-blue-700">{e.execution_code}</div><div className="text-slate-700">{e.title || "Sin título"}</div></td><td className="px-4 py-3"><div className="font-medium text-slate-800">{e.process_name}</div><div className="text-xs text-slate-500">{e.asset_code ? `${e.asset_code} · ${e.asset_name || ""}` : "Sin recurso"}</div></td><td className="px-4 py-3"><Status value={e.status} /></td><td className="px-4 py-3"><div className="min-w-28"><div className="flex justify-between text-xs"><span>{e.completed_stages || 0}/{e.stage_count || 0} etapas</span><strong>{e.completion_percentage || 0}%</strong></div><div className="mt-1 h-1.5 rounded bg-slate-100"><div className="h-1.5 rounded bg-blue-600" style={{width:`${Math.max(0,Math.min(100,Number(e.completion_percentage||0)))}%`}} /></div></div></td><td className="px-4 py-3"><div className="text-xs text-slate-600">{e.open_incidents || 0} incidencias</div><div className="text-xs text-slate-600">{e.pending_approvals || 0} aprobaciones</div></td></tr>)}</tbody></table></div></div>}
        </section>
      )}

      {tab === "quality" && (
        <section className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Incidencias abiertas" value={m.openIncidents} danger /><Metric label="Incidencias críticas" value={m.criticalIncidents} danger /><Metric label="Aprobaciones pendientes" value={m.pendingApprovals} /><Metric label="Correcciones activas" value={m.correctionStages} /></div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card p-5"><h2 className="font-bold text-slate-900">Incidencias recientes</h2><div className="mt-4 space-y-3">{incidents.map((i) => <div key={i.id} className="border-b border-slate-100 pb-3 last:border-0"><div className="flex items-start justify-between gap-3"><div><div className="text-xs font-semibold text-red-600">{i.incident_code} · {i.severity}</div><div className="text-sm font-semibold text-slate-900">{i.title}</div><div className="text-xs text-slate-500">{i.execution_code} · {i.execution_title}</div></div><Status value={i.status} /></div></div>)}{!incidents.length && <p className="text-sm text-slate-500">Sin incidencias.</p>}</div></div>
            <div className="card p-5"><h2 className="font-bold text-slate-900">Aprobaciones</h2><div className="mt-4 space-y-3">{approvals.map((a) => <div key={a.id} className="border-b border-slate-100 pb-3 last:border-0"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-semibold text-slate-900">{a.stage_name || "Etapa"}</div><div className="text-xs text-slate-500">{a.execution_code} · {a.execution_title}</div>{a.decision_notes && <div className="mt-1 text-xs text-slate-600">{a.decision_notes}</div>}</div><Status value={a.status} /></div></div>)}{!approvals.length && <p className="text-sm text-slate-500">Sin aprobaciones registradas.</p>}</div></div>
          </div>
        </section>
      )}

      {tab === "management" && (
        <section className="space-y-5">
          <div className="flex gap-2 border-b border-slate-200 overflow-x-auto">{MANAGEMENT_TABS.map(([key,label]) => <button key={key} onClick={() => setManagementTab(key)} className={`px-4 py-3 text-sm font-semibold border-b-2 whitespace-nowrap ${managementTab === key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500"}`}>{label}</button>)}</div>

          {managementTab === "templates" && <div className="space-y-4"><div><h2 className="font-semibold text-slate-900">Plantillas por rubro</h2><p className="text-sm text-slate-500">La copia se crea en borrador y puede editarse antes de publicar.</p></div>{loading ? <Empty>Cargando plantillas…</Empty> : <div className="grid gap-4 md:grid-cols-2">{templates.map((tpl) => <article key={tpl.id} className="card p-5 flex flex-col gap-4"><div className="flex items-start justify-between gap-3"><div><span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">{tpl.industry === "construction" ? "Construcción" : tpl.industry === "logistics" ? "Logística" : tpl.industry}</span><h3 className="font-bold text-slate-900 mt-1">{tpl.name}</h3><p className="text-sm text-slate-500 mt-1">{tpl.description}</p></div><span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">V{tpl.version}</span></div><div className="space-y-2">{(tpl.stages || []).map((stage,i) => <div key={stage.key || i} className="flex items-center gap-3 text-sm"><span className="grid h-6 w-6 place-items-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">{i+1}</span><span className="text-slate-700">{stage.name}</span></div>)}</div><button disabled={busy === tpl.id} onClick={() => instantiate(tpl)} className="btn-primary mt-auto">{busy === tpl.id ? "Creando…" : "Usar esta plantilla"}</button></article>)}</div>}</div>}

          {managementTab === "imports" && <div className="space-y-5"><div><h2 className="font-semibold text-slate-900">Importación masiva</h2><p className="text-sm text-slate-500">Descarga la plantilla, complétala en Excel, valida y luego importa.</p></div><div className="card p-5 space-y-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{IMPORT_TYPES.map(([key,label,desc]) => <button key={key} onClick={() => { setImportType(key); setImportResult(null); setFile(null); }} className={`rounded-xl border p-4 text-left transition ${importType === key ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300"}`}><div className="text-sm font-bold text-slate-900">{label}</div><div className="text-xs text-slate-500 mt-1">{desc}</div></button>)}</div><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><button onClick={downloadTemplate} disabled={busy === "download-template"} className="btn-secondary">Descargar plantilla Excel</button><input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-semibold" /></div>{file && <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">Archivo seleccionado: <strong>{file.name}</strong></div>}<div className="flex flex-wrap gap-2"><button onClick={() => runImport("validate")} disabled={!file || busy} className="btn-secondary">{busy === "import-validate" ? "Validando…" : "Validar archivo"}</button><button onClick={() => runImport("execute")} disabled={!file || busy} className="btn-primary">{busy === "import-execute" ? "Importando…" : "Importar datos"}</button></div>{importResult && <div className="grid gap-3 sm:grid-cols-4">{[["Total",importResult.totalRows],["Válidas / éxito",importResult.validRows ?? importResult.successRows],["Inválidas / fallos",importResult.invalidRows ?? importResult.failedRows],["Estado",importResult.status || "validado"]].map(([label,value]) => <div key={label} className="rounded-xl border border-slate-200 p-3"><div className="text-xs text-slate-500">{label}</div><div className="text-lg font-bold text-slate-900 mt-1">{value ?? 0}</div></div>)}</div>}{importResult?.errors?.length > 0 && <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead><tr className="text-left text-slate-500"><th className="py-2 pr-4">Fila</th><th className="py-2 pr-4">Columna</th><th className="py-2">Error</th></tr></thead><tbody>{importResult.errors.map((e,i) => <tr key={i} className="border-t"><td className="py-2 pr-4">{e.row}</td><td className="py-2 pr-4">{e.column}</td><td className="py-2 text-red-600">{e.message}</td></tr>)}</tbody></table></div>}</div></div>}

          {managementTab === "reports" && <div className="space-y-5"><div><h2 className="font-semibold text-slate-900">Reportes de ejecuciones</h2><p className="text-sm text-slate-500">Exporta la trazabilidad del tenant en el formato que necesites.</p></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[["xlsx","Excel XLSX","Para análisis y trabajo operativo"],["csv","CSV","Para interoperabilidad"],["pdf","PDF","Para compartir o archivar"],["json","JSON","Para integraciones y respaldo"]].map(([format,label,desc]) => <button key={format} onClick={() => exportReport(format)} disabled={busy === `report-${format}`} className="card p-5 text-left hover:border-blue-300 transition"><div className="text-xs font-bold uppercase text-blue-600">.{format}</div><div className="font-bold text-slate-900 mt-2">{label}</div><div className="text-xs text-slate-500 mt-1">{desc}</div><div className="text-sm font-semibold text-blue-700 mt-4">{busy === `report-${format}` ? "Generando…" : "Descargar →"}</div></button>)}</div></div>}
        </section>
      )}
    </div>
  );
}
