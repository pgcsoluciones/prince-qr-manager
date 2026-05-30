import { useState, useEffect } from "react";
import { api } from "../utils/api.js";

function timeAgo(dateStr) {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

function getDaysDiff(dateStr) {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function getTemperature(avgNps) {
  if (avgNps == null) return { label: "Sin calificar", icon: "⚫", cls: "bg-slate-100 text-slate-500" };
  const n = Number(avgNps);
  if (n >= 9) return { label: "Promotor", icon: "🔥", cls: "bg-green-100 text-green-700" };
  if (n >= 7) return { label: "Neutro", icon: "😐", cls: "bg-amber-100 text-amber-700" };
  return { label: "Detractor", icon: "❄️", cls: "bg-red-100 text-red-600" };
}

function getContactType(totalVisits, firstVisit) {
  if (totalVisits >= 3) return { label: "Frecuente", cls: "bg-blue-100 text-blue-700" };
  if (totalVisits >= 2) return { label: "Esporádico", cls: "bg-indigo-100 text-indigo-600" };
  const days = getDaysDiff(firstVisit);
  if (days < 7) return { label: "Nuevo", cls: "bg-emerald-100 text-emerald-700" };
  return { label: "Esporádico", cls: "bg-indigo-100 text-indigo-600" };
}

function NpsTag({ nps }) {
  if (nps == null) return <span className="text-xs text-slate-400">—</span>;
  const n = Number(nps);
  const cls = n >= 8 ? "bg-green-100 text-green-700" : n >= 6 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${cls}`}>{n.toFixed(1)}/10</span>;
}

function ContactDetail({ contact, onClose }) {
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!contact.email) { setLoading(false); return; }
    api.get(`/api/trace/contacts`)
      .then(() => setLoading(false))
      .catch(() => setLoading(false));
    // Fetch full history via crm endpoint if available
    api.get(`/api/trace/crm/contacts/${encodeURIComponent(contact.email)}`)
      .then(d => setResponses(d.responses || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [contact.email]);

  const temp = getTemperature(contact.avg_nps);
  const ctype = getContactType(contact.total_visits, contact.first_visit);

  return (
    <div className="fixed inset-y-0 right-0 w-80 bg-white border-l border-slate-200 shadow-xl z-40 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <h3 className="font-semibold text-slate-900 text-sm">Detalle del contacto</h3>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 text-sm">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold flex-shrink-0">
            {(contact.email || "?")[0].toUpperCase()}
          </div>
          <div>
            <p className="font-medium text-slate-900 text-sm">{contact.name || contact.email}</p>
            {contact.name && <p className="text-xs text-slate-400">{contact.email}</p>}
            {contact.phone && <p className="text-xs text-slate-500">📱 {contact.phone}</p>}
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${temp.cls}`}>{temp.icon} {temp.label}</span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${ctype.cls}`}>{ctype.label}</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-50 rounded-lg p-2.5">
            <p className="text-[10px] text-slate-500 mb-1">NPS Promedio</p>
            <NpsTag nps={contact.avg_nps} />
          </div>
          <div className="bg-slate-50 rounded-lg p-2.5">
            <p className="text-[10px] text-slate-500 mb-1">Total visitas</p>
            <p className="text-sm font-bold text-slate-800">{contact.total_visits}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-2.5">
            <p className="text-[10px] text-slate-500 mb-1">Primera visita</p>
            <p className="text-xs text-slate-700">{timeAgo(contact.first_visit)}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-2.5">
            <p className="text-[10px] text-slate-500 mb-1">Última visita</p>
            <p className="text-xs text-slate-700">{timeAgo(contact.last_visit)}</p>
          </div>
        </div>

        {contact.referral_source && (
          <div className="bg-slate-50 rounded-lg p-2.5">
            <p className="text-[10px] text-slate-500 mb-1">Cómo se enteró</p>
            <p className="text-xs text-slate-700">{contact.referral_source}</p>
          </div>
        )}

        {contact.phone && (
          <a
            href={`https://wa.me/${contact.phone.replace(/\D/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 bg-green-50 text-green-700 rounded-lg text-xs font-medium hover:bg-green-100 transition-colors"
          >
            💬 Enviar WhatsApp
          </a>
        )}

        {responses.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Historial de respuestas</p>
            <div className="space-y-2">
              {responses.map(r => (
                <div key={r.id} className="bg-slate-50 rounded-lg p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">{timeAgo(r.created_at)}</span>
                    {r.nps_score != null && <NpsTag nps={r.nps_score} />}
                  </div>
                  <p className="text-xs text-slate-600 capitalize mt-0.5">{r.respondent_type}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function GhostRow() {
  return (
    <div className="flex items-center gap-3 py-3 px-4 border-b border-slate-50 opacity-30 pointer-events-none">
      <div className="w-7 h-7 rounded-full bg-blue-200 flex items-center justify-center text-xs font-bold text-blue-700 flex-shrink-0">M</div>
      <div className="flex-1">
        <p className="text-xs font-medium text-slate-700">maria.garcia@ejemplo.com</p>
        <p className="text-[10px] text-slate-400">3 visitas · Frecuente</p>
      </div>
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">🔥 Promotor</span>
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">Frecuente</span>
      <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">9.0/10</span>
    </div>
  );
}

export default function TraceCRMTab() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterTemp, setFilterTemp] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [selected, setSelected] = useState(null);

  async function load() {
    setLoading(true);
    try {
      // Try enhanced endpoint first, fallback to CRM endpoint
      let d;
      try {
        d = await api.get("/api/trace/contacts");
        setContacts((d.contacts || []).map(c => ({
          ...c,
          total_responses: c.total_visits,
          id: c.email,
        })));
      } catch (_) {
        d = await api.get("/api/trace/crm/contacts");
        setContacts(d.contacts || []);
      }
    } catch (_) {}
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function handleSelect(contact) { setSelected(contact); }

  const filtered = contacts.filter(c => {
    // Search
    if (search && !c.email?.toLowerCase().includes(search.toLowerCase()) && !c.name?.toLowerCase().includes(search.toLowerCase())) return false;

    // Temperature filter
    if (filterTemp) {
      const temp = getTemperature(c.avg_nps);
      const label = temp.label.toLowerCase();
      if (filterTemp === "promotor" && label !== "promotor") return false;
      if (filterTemp === "neutro" && label !== "neutro") return false;
      if (filterTemp === "detractor" && label !== "detractor") return false;
      if (filterTemp === "sin_calificar" && label !== "sin calificar") return false;
    }

    // Contact type filter
    if (filterType) {
      const visits = c.total_visits || c.total_responses || 0;
      const ctype = getContactType(visits, c.first_visit);
      const label = ctype.label.toLowerCase();
      if (filterType === "nuevo" && label !== "nuevo") return false;
      if (filterType === "esporadico" && label !== "esporádico") return false;
      if (filterType === "frecuente" && label !== "frecuente") return false;
    }

    // Date filter
    if (filterDate) {
      const days = getDaysDiff(c.last_visit || c.last_seen);
      if (filterDate === "7" && days > 7) return false;
      if (filterDate === "30" && days > 30) return false;
      if (filterDate === "90" && days > 90) return false;
    }

    return true;
  });

  return (
    <div className="flex flex-col" style={{ minHeight: "calc(100vh - 120px)" }}>
      {/* Header */}
      <div className="p-5 border-b border-slate-100 flex-shrink-0">
        <h2 className="text-base font-bold text-slate-900 mb-1">Contactos del sistema CRM</h2>
        <p className="text-sm text-slate-500 mb-3">
          Gestiona los contactos de clientes que interactuaron con tus QRs de control
        </p>

        {/* Filters bar */}
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Buscar por nombre o correo..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && load()}
            className="flex-1 min-w-40 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
          />
          <select
            value={filterTemp}
            onChange={e => setFilterTemp(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
          >
            <option value="">Temperatura (todas)</option>
            <option value="promotor">🔥 Promotor (9-10)</option>
            <option value="neutro">😐 Neutro (7-8)</option>
            <option value="detractor">❄️ Detractor (0-6)</option>
            <option value="sin_calificar">⚫ Sin calificar</option>
          </select>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
          >
            <option value="">Tipo (todos)</option>
            <option value="nuevo">Nuevo (&lt;7 días)</option>
            <option value="esporadico">Esporádico (1-2 visitas)</option>
            <option value="frecuente">Frecuente (3+ visitas)</option>
          </select>
          <select
            value={filterDate}
            onChange={e => setFilterDate(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
          >
            <option value="">Período (todos)</option>
            <option value="7">Últimos 7 días</option>
            <option value="30">Últimos 30 días</option>
            <option value="90">Últimos 90 días</option>
          </select>
          <button
            onClick={load}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Buscar
          </button>
        </div>
      </div>

      {/* Table header */}
      <div className="hidden sm:grid grid-cols-5 gap-2 px-4 py-2 border-b border-slate-100 bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase tracking-wide flex-shrink-0">
        <span className="col-span-2">Contacto</span>
        <span>Temperatura</span>
        <span>Tipo</span>
        <span>NPS / Visitas</span>
      </div>

      {/* Table body */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-2 p-4">{[1,2,3,4].map(i => <div key={i} className="h-14 bg-slate-100 rounded-lg animate-pulse" />)}</div>
        ) : filtered.length > 0 ? (
          filtered.map(c => {
            const temp = getTemperature(c.avg_nps);
            const visits = c.total_visits || c.total_responses || 0;
            const ctype = getContactType(visits, c.first_visit);
            return (
              <button
                key={c.email || c.id}
                onClick={() => handleSelect(c)}
                className="w-full grid grid-cols-3 sm:grid-cols-5 gap-2 px-4 py-3 border-b border-slate-50 hover:bg-blue-50 transition-colors text-left"
              >
                {/* Contact info */}
                <div className="flex items-center gap-2 min-w-0 col-span-2">
                  <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {(c.email || "?")[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-800 truncate">{c.name || c.email}</p>
                    {c.name && <p className="text-[10px] text-slate-400 truncate">{c.email}</p>}
                    {c.phone && <p className="text-[10px] text-slate-400">📱 {c.phone}</p>}
                  </div>
                </div>
                {/* Temperature */}
                <div className="hidden sm:flex items-center self-center">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${temp.cls}`}>{temp.icon} {temp.label}</span>
                </div>
                {/* Type */}
                <div className="hidden sm:flex items-center self-center">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${ctype.cls}`}>{ctype.label}</span>
                </div>
                {/* NPS + visits */}
                <div className="flex items-center gap-2 self-center flex-wrap">
                  <NpsTag nps={c.avg_nps} />
                  <span className="text-xs text-slate-500">{visits} {visits === 1 ? "visita" : "visitas"}</span>
                  <span className="text-[10px] text-slate-400 hidden sm:inline">{timeAgo(c.last_visit || c.last_seen)}</span>
                </div>
              </button>
            );
          })
        ) : (
          <div>
            <GhostRow />
            <GhostRow />
            <div className="p-8 text-center">
              <p className="text-2xl mb-3">👥</p>
              <p className="font-semibold text-slate-700 text-sm mb-2">
                {search || filterTemp || filterType || filterDate ? "Sin coincidencias para los filtros aplicados" : "Aún no tienes contactos en el sistema CRM"}
              </p>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                Cuando un cliente deje su correo al responder un QR TRACE, aparecerá aquí automáticamente.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Contact detail side panel */}
      {selected && (
        <ContactDetail
          contact={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
