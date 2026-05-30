import { useState, useEffect, useRef } from "react";
import { api } from "../utils/api.js";
import { toast } from "./Toast.jsx";
import QRCode from "qrcode";

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

const STATUS_MAP = {
  pending:    { label: "Pendiente",   cls: "bg-slate-100 text-slate-600" },
  in_transit: { label: "En tránsito", cls: "bg-blue-100 text-blue-700" },
  delivered:  { label: "Entregado",   cls: "bg-green-100 text-green-700" },
  returned:   { label: "Devuelto",    cls: "bg-yellow-100 text-yellow-700" },
  closed:     { label: "Cerrado",     cls: "bg-slate-200 text-slate-500" },
  cancelled:  { label: "Cancelado",   cls: "bg-red-100 text-red-600" },
};

const TYPE_MAP = {
  delivery: { label: "Entrega",    cls: "bg-indigo-100 text-indigo-700", icon: "🚚" },
  rental:   { label: "Alquiler",   cls: "bg-purple-100 text-purple-700", icon: "🔑" },
  retail:   { label: "Retail",     cls: "bg-amber-100 text-amber-700",   icon: "🏪" },
  custom:   { label: "Personalizado", cls: "bg-teal-100 text-teal-700",  icon: "📦" },
};

const EVENT_TYPES = [
  { value: "salida_almacen", label: "Salida de almacén" },
  { value: "en_camino",      label: "En camino" },
  { value: "entregado",      label: "Entregado" },
  { value: "recibido",       label: "Recibido" },
  { value: "devuelto",       label: "Devuelto" },
  { value: "otro",           label: "Otro" },
];

function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || STATUS_MAP.pending;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${s.cls}`}>{s.label}</span>;
}

function TypeBadge({ type }) {
  const t = TYPE_MAP[type] || TYPE_MAP.custom;
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${t.cls}`}>{t.icon} {t.label}</span>;
}

function QRThumb({ url }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    QRCode.toCanvas(ref.current, url, { width: 120, margin: 1, color: { dark: "#1e293b", light: "#ffffff" } }).catch(() => {});
  }, [url]);
  return <canvas ref={ref} width={120} height={120} className="rounded border border-slate-200" />;
}

function QRModal({ trackingId, title, onClose }) {
  const url = `https://qr.intaprd.com/track/${trackingId}`;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-xs w-full text-center">
        <h3 className="font-bold text-slate-900 mb-1">QR de seguimiento</h3>
        <p className="text-xs text-slate-500 mb-4 truncate">{title}</p>
        <div className="flex justify-center mb-4">
          <QRThumb url={url} />
        </div>
        <p className="text-[10px] font-mono text-slate-400 break-all mb-4">{url}</p>
        <button onClick={onClose} className="w-full py-2 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-200 transition-colors">Cerrar</button>
      </div>
    </div>
  );
}

function AddEventModal({ trackingId, onClose, onSaved }) {
  const [eventType, setEventType] = useState("en_camino");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await api.post(`/api/trace/tracking/${trackingId}/events`, {
        event_type: eventType,
        description: description.trim() || null,
        location: location.trim() || null,
        receiver_name: receiverName.trim() || null,
      });
      toast.success("Evento registrado");
      onSaved();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full space-y-4">
        <h3 className="font-bold text-slate-900">Agregar evento</h3>
        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">Tipo de evento</label>
          <select value={eventType} onChange={e => setEventType(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
            {EVENT_TYPES.map(et => <option key={et.value} value={et.value}>{et.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">Ubicación (opcional)</label>
          <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="Ej: Almacén Norte, Calle 5 #123" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">Nombre del receptor (opcional)</label>
          <input type="text" value={receiverName} onChange={e => setReceiverName(e.target.value)} placeholder="Quien recibe" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">Notas (opcional)</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Observaciones adicionales" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50">{saving ? "Guardando..." : "Guardar"}</button>
        </div>
      </div>
    </div>
  );
}

function NewTrackingModal({ collaborators, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: "", tracking_type: "delivery", item_description: "", item_code: "",
    origin_location: "", destination_location: "", assigned_to: "", notes: "",
  });
  const [saving, setSaving] = useState(false);

  function update(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave() {
    if (!form.title.trim()) { toast.error("El título es obligatorio"); return; }
    setSaving(true);
    try {
      await api.post("/api/trace/tracking", { ...form });
      toast.success("Seguimiento creado");
      onSaved();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-lg w-full space-y-4 my-4">
        <h3 className="font-bold text-slate-900 text-base">Nuevo seguimiento</h3>

        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">Tipo *</label>
          <select value={form.tracking_type} onChange={e => update("tracking_type", e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
            <option value="delivery">🚚 Entrega a domicilio</option>
            <option value="rental">🔑 Alquiler</option>
            <option value="retail">🏪 Salida de almacén (Retail)</option>
            <option value="custom">📦 Personalizado</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">Título / descripción del item *</label>
          <input type="text" value={form.title} onChange={e => update("title", e.target.value)} placeholder="Ej: Pedido #1023 — Laptop HP" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">Código del item (código de barras, serial, etc.)</label>
          <input type="text" value={form.item_code} onChange={e => update("item_code", e.target.value)} placeholder="Opcional" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Origen</label>
            <input type="text" value={form.origin_location} onChange={e => update("origin_location", e.target.value)} placeholder="Almacén, tienda..." className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Destino</label>
            <input type="text" value={form.destination_location} onChange={e => update("destination_location", e.target.value)} placeholder="Dirección cliente..." className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
          </div>
        </div>

        {collaborators.length > 0 && (
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Asignar a colaborador</label>
            <select value={form.assigned_to} onChange={e => update("assigned_to", e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
              <option value="">Sin asignar</option>
              {collaborators.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">Notas</label>
          <textarea value={form.notes} onChange={e => update("notes", e.target.value)} rows={2} placeholder="Instrucciones adicionales..." className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50">{saving ? "Guardando..." : "Crear seguimiento"}</button>
        </div>
      </div>
    </div>
  );
}

function TrackingCard({ record, onRefresh }) {
  const [expanded, setExpanded] = useState(false);
  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState(false);

  async function loadEvents() {
    setLoadingEvents(true);
    try {
      const d = await api.get(`/api/trace/tracking/${record.id}/events`);
      setEvents(d.events || []);
    } catch (_) {}
    finally { setLoadingEvents(false); }
  }

  function toggleExpand() {
    if (!expanded) loadEvents();
    setExpanded(e => !e);
  }

  async function quickAction(eventType) {
    try {
      await api.post(`/api/trace/tracking/${record.id}/events`, { event_type: eventType });
      toast.success("Evento registrado");
      onRefresh();
      if (expanded) loadEvents();
    } catch (e) { toast.error(e.message); }
  }

  async function handleCancel() {
    if (!confirm("¿Cancelar este seguimiento?")) return;
    try {
      await api.delete(`/api/trace/tracking/${record.id}`);
      toast.success("Seguimiento cancelado");
      onRefresh();
    } catch (e) { toast.error(e.message); }
  }

  const typeInfo = TYPE_MAP[record.tracking_type] || TYPE_MAP.custom;

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <TypeBadge type={record.tracking_type} />
              <StatusBadge status={record.status} />
            </div>
            <h3 className="font-semibold text-slate-900 text-sm">{record.title}</h3>
            {record.item_code && <p className="text-[11px] text-slate-400 font-mono">Código: {record.item_code}</p>}
          </div>
          <p className="text-[10px] text-slate-400 flex-shrink-0">{timeAgo(record.updated_at || record.created_at)}</p>
        </div>

        {(record.origin_location || record.destination_location) && (
          <div className="flex items-center gap-1 text-[11px] text-slate-500 mb-2">
            {record.origin_location && <span className="bg-slate-50 px-2 py-0.5 rounded">{record.origin_location}</span>}
            {record.origin_location && record.destination_location && <span>→</span>}
            {record.destination_location && <span className="bg-slate-50 px-2 py-0.5 rounded">{record.destination_location}</span>}
          </div>
        )}

        {record.assigned_to && (
          <p className="text-[11px] text-slate-400 mb-2">👤 {record.assigned_to}</p>
        )}

        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => setShowQR(true)} className="text-xs px-2.5 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg font-medium transition-colors">Ver QR</button>
          <button onClick={toggleExpand} className="text-xs px-2.5 py-1.5 bg-slate-50 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors">{expanded ? "Ocultar" : "Ver timeline"}</button>
          <button onClick={() => setShowAddEvent(true)} className="text-xs px-2.5 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg font-medium transition-colors">+ Evento</button>
          {record.tracking_type === "rental" && record.status !== "delivered" && (
            <button onClick={() => quickAction("entregado")} className="text-xs px-2.5 py-1.5 bg-green-50 text-green-700 hover:bg-green-100 rounded-lg font-medium transition-colors">Entregar</button>
          )}
          {record.tracking_type === "rental" && record.status === "delivered" && (
            <button onClick={() => quickAction("devuelto")} className="text-xs px-2.5 py-1.5 bg-yellow-50 text-yellow-700 hover:bg-yellow-100 rounded-lg font-medium transition-colors">Devolver</button>
          )}
          <button onClick={handleCancel} className="text-xs px-2.5 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg font-medium transition-colors ml-auto">✕</button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-2">Timeline de eventos</p>
          {loadingEvents ? (
            <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-8 bg-slate-200 rounded animate-pulse" />)}</div>
          ) : events.length === 0 ? (
            <p className="text-xs text-slate-400">Sin eventos registrados aún.</p>
          ) : (
            <div className="space-y-2">
              {events.map((ev, i) => (
                <div key={ev.id} className="flex items-start gap-2">
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className="w-2 h-2 rounded-full bg-blue-400 mt-1" />
                    {i < events.length - 1 && <div className="w-0.5 flex-1 bg-slate-200 mt-1" style={{ minHeight: 16 }} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-700 capitalize">{ev.event_type.replace("_", " ")}</span>
                      <span className="text-[10px] text-slate-400">{timeAgo(ev.timestamp)}</span>
                    </div>
                    {ev.location && <p className="text-[11px] text-slate-500">📍 {ev.location}</p>}
                    {ev.receiver_name && <p className="text-[11px] text-slate-500">👤 {ev.receiver_name}</p>}
                    {ev.description && <p className="text-[11px] text-slate-400 italic">{ev.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showQR && <QRModal trackingId={record.id} title={record.title} onClose={() => setShowQR(false)} />}
      {showAddEvent && (
        <AddEventModal
          trackingId={record.id}
          onClose={() => setShowAddEvent(false)}
          onSaved={() => { setShowAddEvent(false); onRefresh(); if (expanded) loadEvents(); }}
        />
      )}
    </div>
  );
}

export default function TraceTrackingTab() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("all");
  const [showNew, setShowNew] = useState(false);
  const [collaborators, setCollaborators] = useState([]);

  async function load() {
    setLoading(true);
    try {
      const params = filterType !== "all" ? `?type=${filterType}` : "";
      const d = await api.get(`/api/trace/tracking${params}`);
      setRecords(d.records || []);
    } catch (_) {}
    finally { setLoading(false); }
  }

  useEffect(() => {
    api.get("/api/collaborators").then(d => setCollaborators(d.collaborators || [])).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [filterType]);

  const stats = {
    active:     records.filter(r => ["pending", "in_transit"].includes(r.status)).length,
    in_transit: records.filter(r => r.status === "in_transit").length,
    delivered:  records.filter(r => r.status === "delivered").length,
    rental:     records.filter(r => r.tracking_type === "rental" && r.status !== "cancelled").length,
  };

  const TYPE_TABS = [
    { id: "all",      label: "Todos" },
    { id: "delivery", label: "🚚 Entrega" },
    { id: "rental",   label: "🔑 Alquiler" },
    { id: "retail",   label: "🏪 Retail" },
    { id: "custom",   label: "📦 Personalizado" },
  ];

  return (
    <div className="p-5 space-y-5">
      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Activos", value: stats.active, color: "text-blue-700" },
          { label: "En tránsito", value: stats.in_transit, color: "text-blue-600" },
          { label: "Entregados", value: stats.delivered, color: "text-green-600" },
          { label: "En alquiler", value: stats.rental, color: "text-purple-600" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm">
            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Header + new button */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Trazabilidad de Entrega</h2>
          <p className="text-xs text-slate-500">Seguimiento de entregas, alquileres y movimientos de inventario</p>
        </div>
        <button onClick={() => setShowNew(true)} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors flex-shrink-0">
          + Nuevo seguimiento
        </button>
      </div>

      {/* Type filter tabs */}
      <div className="flex gap-0 border-b border-slate-200 overflow-x-auto">
        {TYPE_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setFilterType(t.id)}
            className={`flex-shrink-0 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              filterType === t.id
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Records */}
      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-28 bg-white rounded-xl border border-slate-100 animate-pulse" />)}</div>
      ) : records.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center border border-slate-100 shadow-sm">
          <p className="text-4xl mb-3">📦</p>
          <p className="font-semibold text-slate-700 mb-1">Sin registros de seguimiento</p>
          <p className="text-sm text-slate-400 mb-4">Crea tu primer seguimiento para empezar a rastrear entregas y movimientos</p>
          <button onClick={() => setShowNew(true)} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors">
            + Nuevo seguimiento
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map(r => (
            <TrackingCard key={r.id} record={r} onRefresh={load} />
          ))}
        </div>
      )}

      {showNew && (
        <NewTrackingModal
          collaborators={collaborators}
          onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); load(); }}
        />
      )}
    </div>
  );
}
