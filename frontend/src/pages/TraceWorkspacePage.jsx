import { useEffect, useMemo, useState } from "react";

const BASE = import.meta.env.VITE_API_URL || "https://api.code.intaprd.com";
const API = "/api/trace/v1/admin";

const SECTORS = {
  construction: { label: "Construcción", group: "Construcción y propiedades" },
  property: { label: "Propiedades", group: "Construcción y propiedades" },
  rental: { label: "Alquileres", group: "Construcción y propiedades" },
  logistics: { label: "Logística", group: "Logística y almacenes" },
  warehouse: { label: "Almacenes", group: "Logística y almacenes" },
  hospitality: { label: "Hotelería", group: "Hotelería y servicios" },
  service: { label: "Evaluaciones", group: "Hotelería y servicios" },
  general: { label: "Otros controles", group: "Otros sectores" },
};

const GROUP_ORDER = ["Construcción y propiedades", "Logística y almacenes", "Hotelería y servicios", "Otros sectores"];

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

function Metric({ label, value, note, action }) {
  return (
    <button type="button" onClick={action} className="card p-4 text-left hover:border-blue-200 transition">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value ?? 0}</div>
      {note && <div className="mt-1 text-xs text-slate-400">{note}</div>}
    </button>
  );
}

function SoftBadge({ children }) {
  return <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">{children}</span>;
}

function Modal({ children, onClose }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/35 p-0 sm:items-center sm:p-6" onMouseDown={onClose}>
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl" onMouseDown={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export default function TraceWorkspacePage() {
  const [view, setView] = useState("home");
  const [overview, setOverview] = useState({ metrics: {}, processes: [], executions: [], incidents: [], approvals: [] });
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState(null);
  const [controlName, setControlName] = useState("");
  const [busy, setBusy] = useState(false);
  const [publicView, setPublicView] = useState(true);
  const [sectorFilter, setSectorFilter] = useState("all");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const [o, t] = await Promise.all([jsonRequest(`${API}/overview`), jsonRequest(`${API}/templates`)]);
      setOverview(o.data || {});
      setTemplates(t.data || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const groups = useMemo(() => {
    const bucket = {};
    templates.forEach((tpl) => {
      const meta = SECTORS[tpl.industry] || SECTORS.general;
      if (sectorFilter !== "all" && tpl.industry !== sectorFilter) return;
      if (!bucket[meta.group]) bucket[meta.group] = [];
      bucket[meta.group].push(tpl);
    });
    return bucket;
  }, [templates, sectorFilter]);

  const openTemplate = (tpl) => {
    setSelected(tpl);
    setControlName(tpl.name);
    setPublicView(Boolean(tpl?.process?.settings?.publicView || tpl?.metadata?.publicAudience?.length));
    setMessage(""); setError("");
  };

  const createControl = async () => {
    if (!selected) return;
    if (!controlName.trim()) return setError("Escribe un nombre para este control.");
    setBusy(true); setError("");
    try {
      const data = await jsonRequest(`${API}/templates/${encodeURIComponent(selected.id)}/instantiate`, {
        method: "POST",
        body: JSON.stringify({ name: controlName.trim(), publicView }),
      });
      setSelected(null);
      setMessage(`Control creado: ${data.data?.name || controlName}. La estructura ya está precargada; ahora puedes asignar responsables y ajustar lo necesario.`);
      await load();
      setView("controls");
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const m = overview.metrics || {};
  const controls = overview.processes || [];
  const activity = overview.executions || [];
  const incidents = overview.incidents || [];
  const approvals = overview.approvals || [];

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-10">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">INTAP TRACE · V1</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Control de tu operación</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">Controles listos para usar, seguimiento del trabajo y una vista clara para tu equipo y tus clientes.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setView("catalog")} className="btn-primary">+ Nuevo control</button>
          <a href="/trace-operational" target="_blank" rel="noreferrer" className="btn-secondary">Registrar actividad ↗</a>
        </div>
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {[["home","Inicio"],["controls","Controles"],["supervision","Supervisión"],["evaluations","Evaluaciones"],["results","Resultados"],["catalog","Soluciones"]].map(([key,label]) => (
          <button key={key} onClick={() => setView(key)} className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold ${view === key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{label}</button>
        ))}
        <a href="/dashboard/trace-management" className="whitespace-nowrap border-b-2 border-transparent px-4 py-3 text-sm font-semibold text-slate-500 hover:text-slate-800">Configuración</a>
      </nav>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}

      {view === "home" && (
        <section className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Controles activos" value={m.activeProcesses || 0} note={`${m.draftProcesses || 0} por terminar de configurar`} action={() => setView("controls")} />
            <Metric label="Trabajos en curso" value={m.inProgress || 0} note={`${m.completed || 0} completados`} />
            <Metric label="Requieren atención" value={(m.openIncidents || 0) + (m.correctionStages || 0)} note="Incidencias y correcciones" action={() => setView("supervision")} />
            <Metric label="Pendientes de confirmar" value={m.pendingApprovals || 0} note="Revisiones y aprobaciones" action={() => setView("supervision")} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="card p-5 lg:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <div><h2 className="font-bold text-slate-900">Qué está pasando ahora</h2><p className="text-xs text-slate-500">Actividad reciente de los controles en uso.</p></div>
                <button onClick={() => setView("controls")} className="text-xs font-semibold text-blue-700">Ver controles →</button>
              </div>
              <div className="mt-4 space-y-3">
                {activity.slice(0, 6).map((item) => (
                  <div key={item.id} className="flex flex-col gap-2 border-b border-slate-100 pb-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
                    <div><div className="text-sm font-semibold text-slate-900">{item.title || item.process_name}</div><div className="text-xs text-slate-500">{item.asset_name || item.process_name}</div></div>
                    <div className="flex items-center gap-3"><span className="text-xs font-semibold text-slate-500">{Number(item.completion_percentage || 0)}% completado</span><SoftBadge>{String(item.status || "pendiente").replaceAll("_", " ")}</SoftBadge></div>
                  </div>
                ))}
                {!activity.length && <div className="py-8 text-center text-sm text-slate-500">Cuando actives un control, aquí verás su actividad.</div>}
              </div>
            </div>

            <div className="space-y-4">
              <div className="card p-5">
                <h2 className="font-bold text-slate-900">Acciones rápidas</h2>
                <div className="mt-4 space-y-2">
                  <button onClick={() => setView("catalog")} className="w-full rounded-xl border border-blue-200 bg-blue-50 p-3 text-left"><div className="text-sm font-bold text-blue-800">Crear un nuevo control</div><div className="text-xs text-blue-600">Parte de una solución ya configurada.</div></button>
                  <a href="/trace-operational" target="_blank" rel="noreferrer" className="block w-full rounded-xl border border-slate-200 p-3"><div className="text-sm font-bold text-slate-800">Registrar actividad</div><div className="text-xs text-slate-500">Avance, evidencia, incidencia o revisión.</div></a>
                </div>
              </div>
              <div className="card p-5">
                <div className="flex items-start gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-lg">↗</div><div><h3 className="font-bold text-slate-900">Vista para clientes y usuarios</h3><p className="mt-1 text-xs leading-5 text-slate-500">Cada control puede compartir solo la información autorizada mediante enlace o QR, sin mostrar datos internos.</p><button onClick={() => setView("controls")} className="mt-3 text-xs font-semibold text-emerald-700">Ver controles compartibles →</button></div></div>
              </div>
            </div>
          </div>
        </section>
      )}

      {view === "catalog" && (
        <section className="space-y-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div><h2 className="text-xl font-bold text-slate-900">¿Qué quieres controlar?</h2><p className="mt-1 text-sm text-slate-500">Elige una solución. TRACE ya trae los pasos, controles y revisiones necesarios; tú solo ajustas lo que haga falta.</p></div>
            <select value={sectorFilter} onChange={(e) => setSectorFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="all">Todos los sectores</option>
              {Object.entries(SECTORS).filter(([k]) => k !== "general").map(([key,s]) => <option key={key} value={key}>{s.label}</option>)}
            </select>
          </div>

          {loading ? <div className="card p-8 text-sm text-slate-500">Cargando soluciones…</div> : GROUP_ORDER.map((group) => {
            const list = groups[group] || [];
            if (!list.length) return null;
            return <div key={group} className="space-y-3"><div><h3 className="font-bold text-slate-900">{group}</h3>{group === "Construcción y propiedades" && <p className="text-xs text-blue-600">Biblioteca prioritaria de INTAP TRACE</p>}</div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{list.map((tpl) => {
              const sector = SECTORS[tpl.industry] || SECTORS.general;
              return <button key={tpl.id} onClick={() => openTemplate(tpl)} className="card p-5 text-left hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-sm transition"><div className="flex items-start justify-between gap-3"><div><SoftBadge>{sector.label}</SoftBadge><h4 className="mt-3 font-bold text-slate-900">{tpl.name}</h4></div><span className="text-blue-600">→</span></div><p className="mt-2 text-sm leading-5 text-slate-500">{tpl.description}</p><div className="mt-4 text-xs font-semibold text-slate-500">{tpl.stages?.length || 0} pasos precargados</div></button>;
            })}</div></div>;
          })}
        </section>
      )}

      {view === "controls" && (
        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-xl font-bold text-slate-900">Mis controles</h2><p className="text-sm text-slate-500">Controles creados para tu empresa. Puedes reutilizarlos y ajustar su estructura.</p></div><button onClick={() => setView("catalog")} className="btn-primary">+ Nuevo control</button></div>
          {!controls.length ? <div className="card p-8 text-center"><h3 className="font-bold text-slate-900">Todavía no tienes controles</h3><p className="mt-1 text-sm text-slate-500">Elige una solución lista y actívala en pocos pasos.</p><button onClick={() => setView("catalog")} className="btn-primary mt-4">Ver soluciones</button></div> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{controls.map((c) => <article key={c.id} className="card p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-slate-900">{c.name}</h3><p className="mt-1 text-xs text-slate-500">{c.description || "Control operativo editable"}</p></div><SoftBadge>{c.status === "active" ? "Activo" : "Por configurar"}</SoftBadge></div><div className="mt-5 grid grid-cols-2 gap-2"><div className="rounded-xl bg-slate-50 p-3"><div className="text-lg font-bold">{c.execution_count || 0}</div><div className="text-[11px] text-slate-500">trabajos registrados</div></div><div className="rounded-xl bg-slate-50 p-3"><div className="text-lg font-bold">{c.published_versions || 0}</div><div className="text-[11px] text-slate-500">configuraciones activas</div></div></div><div className="mt-4 flex gap-2"><button className="btn-secondary flex-1">Abrir</button><button className="btn-secondary" title="Vista pública">Compartir</button></div></article>)}</div>}
        </section>
      )}

      {view === "supervision" && (
        <section className="space-y-4"><div><h2 className="text-xl font-bold text-slate-900">Supervisión</h2><p className="text-sm text-slate-500">Lo que requiere revisión, corrección o confirmación.</p></div><div className="grid gap-4 lg:grid-cols-2"><div className="card p-5"><h3 className="font-bold text-slate-900">Incidencias y correcciones</h3><div className="mt-4 space-y-3">{incidents.slice(0,8).map((i) => <div key={i.id} className="border-b border-slate-100 pb-3 last:border-0"><div className="text-sm font-semibold text-slate-900">{i.title}</div><div className="mt-1 text-xs text-slate-500">{i.execution_title || i.execution_code} · {i.severity || "normal"}</div></div>)}{!incidents.length && <p className="text-sm text-slate-500">No hay incidencias abiertas.</p>}</div></div><div className="card p-5"><h3 className="font-bold text-slate-900">Pendientes de confirmar</h3><div className="mt-4 space-y-3">{approvals.slice(0,8).map((a) => <div key={a.id} className="border-b border-slate-100 pb-3 last:border-0"><div className="text-sm font-semibold text-slate-900">{a.stage_name || "Revisión pendiente"}</div><div className="mt-1 text-xs text-slate-500">{a.execution_title || a.execution_code}</div></div>)}{!approvals.length && <p className="text-sm text-slate-500">No hay confirmaciones pendientes.</p>}</div></div></div></section>
      )}

      {view === "evaluations" && (
        <section className="space-y-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-xl font-bold text-slate-900">Evaluaciones y formularios</h2><p className="text-sm text-slate-500">Listas de revisión, encuestas, calificaciones y formularios asociados a tus controles.</p></div><button onClick={() => { setSectorFilter("service"); setView("catalog"); }} className="btn-primary">Crear evaluación</button></div><div className="grid gap-4 md:grid-cols-3"><div className="card p-5"><div className="text-sm font-bold text-slate-900">Listas de revisión</div><p className="mt-2 text-xs leading-5 text-slate-500">Comprueba puntos necesarios y registra hallazgos o evidencias.</p></div><div className="card p-5"><div className="text-sm font-bold text-slate-900">Calificaciones</div><p className="mt-2 text-xs leading-5 text-slate-500">Mide la calidad de un servicio, área, trabajo o experiencia.</p></div><div className="card p-5"><div className="text-sm font-bold text-slate-900">Encuestas</div><p className="mt-2 text-xs leading-5 text-slate-500">Recoge opiniones, comentarios y nivel de recomendación en lenguaje sencillo.</p></div></div></section>
      )}

      {view === "results" && (
        <section className="space-y-4"><div><h2 className="text-xl font-bold text-slate-900">Resultados</h2><p className="text-sm text-slate-500">Avance, cumplimiento, incidencias, calificaciones y resultados de evaluaciones.</p></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Trabajos completados" value={m.completed || 0} /><Metric label="Incidencias abiertas" value={m.openIncidents || 0} /><Metric label="Pendientes de confirmar" value={m.pendingApprovals || 0} /><Metric label="Recursos activos" value={m.activeAssets || 0} /></div><div className="card p-6"><h3 className="font-bold text-slate-900">Reportes y calificaciones</h3><p className="mt-2 text-sm text-slate-500">Aquí se concentrarán los resultados por control, ubicación, responsable, período y formulario. Los reportes descargables actuales permanecen disponibles en Configuración.</p><a href="/dashboard/trace-management" className="btn-secondary inline-flex mt-4">Abrir reportes</a></div></section>
      )}

      {selected && (
        <Modal onClose={() => !busy && setSelected(null)}>
          <div className="border-b border-slate-100 p-6 sm:p-7"><div className="flex items-start justify-between gap-4"><div><SoftBadge>{SECTORS[selected.industry]?.label || "Control"}</SoftBadge><h2 className="mt-3 text-xl font-bold text-slate-900">{selected.name}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{selected.description}</p></div><button onClick={() => setSelected(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">✕</button></div></div>
          <div className="space-y-6 p-6 sm:p-7">
            <div><h3 className="text-sm font-bold text-slate-900">Ya viene configurado con:</h3><div className="mt-3 grid gap-2 sm:grid-cols-2">{(selected.stages || []).map((s, index) => <div key={s.key || index} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5"><span className="grid h-6 w-6 place-items-center rounded-full bg-white text-xs font-bold text-blue-700 shadow-sm">{index + 1}</span><span className="text-sm text-slate-700">{s.name}</span></div>)}</div></div>

            <div><label className="text-sm font-bold text-slate-900">Nombre de este control</label><p className="mt-1 text-xs text-slate-500">Por ejemplo: Torre Central · Avance de obra, Apartamento 304 · Entrega.</p><input value={controlName} onChange={(e) => setControlName(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none" /></div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4"><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" checked={publicView} onChange={(e) => setPublicView(e.target.checked)} className="mt-1" /><span><span className="block text-sm font-bold text-emerald-900">Preparar vista para cliente, propietario, inversionista o usuario</span><span className="mt-1 block text-xs leading-5 text-emerald-700">TRACE podrá generar un enlace o QR con solo la información autorizada. Los datos internos, responsables y notas privadas no se comparten automáticamente.</span></span></label></div>

            <div className="rounded-2xl bg-blue-50 p-4"><div className="text-sm font-bold text-blue-900">No tienes que armarlo desde cero</div><p className="mt-1 text-xs leading-5 text-blue-700">Después de crear el control, solo asignas responsables, equipos o departamentos y haces los ajustes particulares de tu empresa.</p></div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button disabled={busy} onClick={() => setSelected(null)} className="btn-secondary">Cancelar</button><button disabled={busy} onClick={createControl} className="btn-primary">{busy ? "Creando…" : "Crear control"}</button></div>
          </div>
        </Modal>
      )}
    </div>
  );
}
