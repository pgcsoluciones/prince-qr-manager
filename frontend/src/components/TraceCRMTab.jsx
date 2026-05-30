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
  return `${Math.floor(hrs / 24)}d`;
}

function NpsTag({ nps }) {
  if (nps == null) return <span className="text-xs text-slate-400">—</span>;
  const n = Number(nps);
  const cls = n >= 8 ? "bg-green-100 text-green-700" : n >= 6 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${cls}`}>{n.toFixed(1)}/10</span>;
}

function ContactDetail({ contact, responses, onClose }) {
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
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-slate-500 mb-1">Puntuación de satisfacción promedio (NPS)</p>
            <NpsTag nps={contact.avg_nps} />
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-slate-500 mb-1">Total de visitas</p>
            <p className="text-sm font-bold text-slate-800">{contact.total_responses}</p>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Historial de respuestas</p>
          {responses && responses.length > 0 ? (
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
          ) : (
            <p className="text-xs text-slate-400">Sin historial disponible</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* Ghost/skeleton example row for empty state */
function GhostRow() {
  return (
    <div className="flex items-center gap-3 py-3 px-4 border-b border-slate-50 opacity-40 pointer-events-none">
      <div className="w-7 h-7 rounded-full bg-blue-200 flex items-center justify-center text-xs font-bold text-blue-700 flex-shrink-0">M</div>
      <div className="flex-1">
        <p className="text-xs font-medium text-slate-700">maria.garcia@ejemplo.com</p>
        <p className="text-[10px] text-slate-400">3 respuestas · Hace 2 días</p>
      </div>
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">9.0/10</span>
    </div>
  );
}

export default function TraceCRMTab() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [minNps, setMinNps] = useState("");
  const [selected, setSelected] = useState(null);
  const [selectedResponses, setSelectedResponses] = useState([]);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (minNps) params.set("min_nps", minNps);
      const d = await api.get(`/api/trace/crm/contacts?${params}`);
      setContacts(d.contacts || []);
    } catch (_) {}
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleSelect(contact) {
    setSelected(contact);
    try {
      const d = await api.get(`/api/trace/crm/contacts/${contact.id}`);
      setSelectedResponses(d.responses || []);
    } catch (_) { setSelectedResponses([]); }
  }

  const filtered = contacts.filter(c => {
    if (search && !c.email?.toLowerCase().includes(search.toLowerCase()) && !c.name?.toLowerCase().includes(search.toLowerCase())) return false;
    if (minNps && c.avg_nps != null && Number(c.avg_nps) < Number(minNps)) return false;
    return true;
  });

  return (
    <div className="flex flex-col" style={{ minHeight: "calc(100vh - 120px)" }}>
      {/* Header */}
      <div className="p-5 border-b border-slate-100 flex-shrink-0">
        <h2 className="text-base font-bold text-slate-900 mb-1">Contactos del sistema CRM</h2>
        <p className="text-sm text-slate-500">
          Gestiona los contactos de clientes que interactuaron con tus QRs de control y dejaron su correo
        </p>

        {/* Search + filter */}
        <div className="flex gap-2 mt-3 flex-wrap">
          <input
            type="text"
            placeholder="Buscar por nombre o correo..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && load()}
            className="flex-1 min-w-40 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
          />
          <select
            value={minNps}
            onChange={e => { setMinNps(e.target.value); }}
            title="Net Promoter Score: pregunta al cliente qué tan probable es que recomiende el negocio, del 0 al 10."
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500 bg-white"
          >
            <option value="">Todas las puntuaciones NPS</option>
            <option value="9">Puntuación 9-10 (promotores)</option>
            <option value="7">Puntuación 7+ (satisfechos)</option>
            <option value="0">Ver todos</option>
          </select>
          <button
            onClick={load}
            data-tooltip="Aplicar filtros de búsqueda"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Buscar
          </button>
        </div>
      </div>

      {/* Table header */}
      <div className="grid grid-cols-4 gap-3 px-4 py-2 border-b border-slate-100 bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase tracking-wide flex-shrink-0">
        <span>Correo / Nombre</span>
        <span>Primer contacto</span>
        <span title="Net Promoter Score: pregunta al cliente qué tan probable es que recomiende el negocio, del 0 al 10.">Puntuación NPS (?)</span>
        <span>Visitas</span>
      </div>

      {/* Table body */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-2 p-4">{[1,2,3,4].map(i => <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />)}</div>
        ) : filtered.length > 0 ? (
          filtered.map(c => (
            <button
              key={c.id}
              onClick={() => handleSelect(c)}
              className="w-full grid grid-cols-4 gap-3 px-4 py-3 border-b border-slate-50 hover:bg-blue-50 transition-colors text-left"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {(c.email || "?")[0].toUpperCase()}
                </div>
                <span className="text-xs text-slate-700 truncate">{c.name || c.email}</span>
              </div>
              <span className="text-xs text-slate-500 self-center">{timeAgo(c.created_at || c.last_seen)}</span>
              <span className="self-center"><NpsTag nps={c.avg_nps} /></span>
              <span className="text-xs text-slate-700 font-medium self-center">{c.total_responses}</span>
            </button>
          ))
        ) : (
          <div>
            {/* Ghost example */}
            <GhostRow />
            <GhostRow />
            <div className="p-8 text-center">
              <p className="text-2xl mb-3">👥</p>
              <p className="font-semibold text-slate-700 text-sm mb-2">
                {search ? "Sin coincidencias para tu búsqueda" : "Aún no tienes contactos en el sistema CRM"}
              </p>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                Cuando un cliente deje su correo electrónico al responder un QR de control TRACE, aparecerá aquí automáticamente.
                Los campos de ejemplo de arriba muestran cómo se verá tu lista.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Contact detail side panel */}
      {selected && (
        <ContactDetail
          contact={selected}
          responses={selectedResponses}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
