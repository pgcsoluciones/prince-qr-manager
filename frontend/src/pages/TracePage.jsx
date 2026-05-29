import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../utils/api.js";
import { toast } from "../components/Toast.jsx";
import TracePointModal from "../components/TracePointModal.jsx";

/* ── Helpers ── */
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

function QRTypeBadge({ type }) {
  const map = {
    checklist: { label: "Checklist", cls: "bg-emerald-100 text-emerald-700" },
    survey:    { label: "Encuesta",  cls: "bg-purple-100 text-purple-700" },
    mixed:     { label: "Mixto",     cls: "bg-blue-100 text-blue-700"   },
  };
  const info = map[type] || map.mixed;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${info.cls}`}>
      {info.label}
    </span>
  );
}

function StatCard({ label, value, sub, color = "text-slate-900" }) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
      <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

/* ── Alert row ── */
function AlertRow({ alert, onResolve }) {
  const typeMap = {
    low_nps:          { icon: "📉", label: "NPS bajo",            cls: "text-red-600"    },
    missed_checklist: { icon: "⚠️", label: "Checklist incompleto", cls: "text-amber-600" },
    overdue:          { icon: "⏰", label: "Sin escaneo",           cls: "text-orange-600"},
  };
  const info = typeMap[alert.alert_type] || { icon: "🔔", label: alert.alert_type, cls: "text-slate-600" };
  return (
    <div className="flex items-start gap-2 py-2.5 border-b border-slate-50 last:border-0">
      <span className="text-base flex-shrink-0 mt-0.5">{info.icon}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-semibold ${info.cls}`}>{info.label}</p>
        <p className="text-[11px] text-slate-500 truncate">{alert.message}</p>
        <p className="text-[10px] text-slate-400">{timeAgo(alert.created_at)}</p>
      </div>
      <button
        onClick={() => onResolve(alert.id)}
        className="flex-shrink-0 text-[10px] text-slate-400 hover:text-green-600 border border-slate-200 hover:border-green-300 rounded-md px-2 py-0.5 transition-colors"
      >✓</button>
    </div>
  );
}

/* ── CRM contact row ── */
function ContactRow({ contact }) {
  const npsColor = contact.avg_nps == null ? "text-slate-400"
    : contact.avg_nps >= 8 ? "text-green-600"
    : contact.avg_nps >= 6 ? "text-amber-600"
    : "text-red-600";
  return (
    <div className="flex items-center gap-2 py-2.5 border-b border-slate-50 last:border-0">
      <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
        {(contact.email || "?")[0].toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-slate-700 truncate">{contact.email}</p>
        <p className="text-[10px] text-slate-400">{contact.total_responses} resp · {timeAgo(contact.last_seen)}</p>
      </div>
      {contact.avg_nps != null && (
        <span className={`text-xs font-bold ${npsColor}`}>{Number(contact.avg_nps).toFixed(1)}</span>
      )}
    </div>
  );
}

/* ── Sidebar point item ── */
function PointListItem({ point, alertCount, isSelected, onClick }) {
  return (
    <button
      onClick={() => onClick(point)}
      className={`w-full text-left px-3 py-3 rounded-xl border transition-all mb-1.5 ${
        isSelected
          ? "bg-blue-50 border-blue-200 shadow-sm"
          : "bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50"
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-semibold text-slate-900 truncate pr-2">{point.name}</p>
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${point.is_active ? "bg-green-400" : "bg-slate-300"}`} />
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <QRTypeBadge type={point.qr_type} />
        {alertCount > 0 && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
            {alertCount}
          </span>
        )}
      </div>
      {point.area && <p className="text-[10px] text-slate-400 mt-1 truncate">📍 {point.area}</p>}
    </button>
  );
}

/* ── NPS trend mini chart (SVG bars) ── */
function NpsTrendBars({ responses }) {
  const withNps = responses.filter(r => r.nps_score != null).slice(0, 12).reverse();
  if (!withNps.length) return <p className="text-xs text-slate-400 py-2">Sin datos de NPS</p>;
  return (
    <div className="flex items-end gap-1 h-16">
      {withNps.map((r, i) => {
        const h = Math.round((r.nps_score / 10) * 100);
        const color = r.nps_score >= 8 ? "bg-green-400" : r.nps_score >= 6 ? "bg-amber-400" : "bg-red-400";
        return (
          <div key={i} className="flex-1 flex flex-col justify-end" title={`NPS ${r.nps_score}`}>
            <div className={`${color} rounded-t-sm`} style={{ height: `${h}%` }} />
          </div>
        );
      })}
    </div>
  );
}

/* ── Checklist compliance bar ── */
function ChecklistBar({ responses }) {
  const withChecklist = responses.filter(r => {
    try { return Object.keys(JSON.parse(r.checklist_data || "{}")).length > 0; } catch { return false; }
  });
  if (!withChecklist.length) return <p className="text-xs text-slate-400 py-2">Sin datos de checklist</p>;
  const rates = withChecklist.map(r => {
    try {
      const data = JSON.parse(r.checklist_data || "{}");
      const vals = Object.values(data);
      if (!vals.length) return 0;
      return vals.filter(Boolean).length / vals.length;
    } catch { return 0; }
  });
  const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
  const pct = Math.round(avg * 100);
  const color = pct >= 80 ? "bg-green-500" : pct >= 60 ? "bg-amber-400" : "bg-red-400";
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-500 mb-1">
        <span>Cumplimiento promedio</span>
        <span className="font-bold">{pct}%</span>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-2.5">
        <div className={`${color} h-2.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ── Center panel — point detail ── */
function PointDetail({ point, onEdit, onDelete }) {
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    api.get(`/api/trace/points/${point.id}/responses?limit=20`)
      .then(d => setResponses(d.responses || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [point.id]);

  const qrUrl = `https://qr.intaprd.com/${point.id}`;

  return (
    <div className="space-y-4">
      {/* Point header */}
      <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="font-bold text-slate-900 text-lg">{point.name}</h2>
              <div className={`w-2.5 h-2.5 rounded-full ${point.is_active ? "bg-green-400" : "bg-slate-300"}`} />
            </div>
            {point.area && <p className="text-sm text-slate-400">📍 {point.area}</p>}
            <div className="flex gap-2 mt-2 flex-wrap">
              <QRTypeBadge type={point.qr_type} />
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={() => onEdit(point)} className="text-xs px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg font-medium transition-colors">Editar</button>
            <button onClick={() => window.open(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrUrl)}`, "_blank")} className="text-xs px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-medium transition-colors">QR ↗</button>
            <button onClick={() => onDelete(point)} className="text-xs px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg font-medium transition-colors">Eliminar</button>
          </div>
        </div>
        <div className="text-xs text-slate-400 font-mono">{qrUrl}</div>
      </div>

      {/* NPS trend */}
      <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Tendencia NPS</h3>
        {loading ? <div className="h-16 bg-slate-50 rounded animate-pulse" /> : <NpsTrendBars responses={responses} />}
      </div>

      {/* Checklist compliance */}
      <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Cumplimiento de Checklist</h3>
        {loading ? <div className="h-6 bg-slate-50 rounded animate-pulse" /> : <ChecklistBar responses={responses} />}
      </div>

      {/* Recent responses */}
      <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700">Respuestas recientes</h3>
          <button
            onClick={() => navigate(`/dashboard/trace/${point.id}/responses`)}
            className="text-xs text-blue-600 hover:underline font-medium"
          >Ver todas →</button>
        </div>
        {loading ? (
          <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 bg-slate-50 rounded animate-pulse" />)}</div>
        ) : responses.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">Sin respuestas aún</p>
        ) : (
          <div className="space-y-2">
            {responses.slice(0, 5).map(r => {
              const npsColor = r.nps_score >= 8 ? "bg-green-100 text-green-700" : r.nps_score >= 6 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";
              return (
                <div key={r.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg flex-wrap">
                  <span className="text-[10px] text-slate-400 font-mono">{timeAgo(r.created_at)}</span>
                  <span className="text-[11px] text-slate-500 capitalize px-2 py-0.5 bg-white rounded-full border border-slate-200">{r.respondent_type}</span>
                  {r.nps_score != null && (
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${npsColor}`}>NPS {r.nps_score}</span>
                  )}
                  {r.contact_email && <span className="text-[11px] text-blue-600 truncate">{r.contact_email}</span>}
                  <span className="ml-auto text-[10px] text-slate-400">{r.country}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Mobile point card ── */
function MobilePointCard({ point, alertCount, onEdit, onDelete }) {
  const navigate = useNavigate();
  const qrUrl = `https://qr.intaprd.com/${point.id}`;
  return (
    <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-slate-900 truncate">{point.name}</h3>
            {alertCount > 0 && (
              <span className="flex-shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">{alertCount}</span>
            )}
          </div>
          {point.area && <p className="text-[11px] text-slate-400 mb-1.5">📍 {point.area}</p>}
          <QRTypeBadge type={point.qr_type} />
        </div>
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1 ${point.is_active ? "bg-green-400" : "bg-slate-300"}`} />
      </div>
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => navigate(`/dashboard/trace/${point.id}/responses`)} className="text-xs px-2.5 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg font-medium transition-colors">Respuestas</button>
        <button onClick={() => onEdit(point)} className="text-xs px-2.5 py-1.5 bg-slate-50 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors">Editar</button>
        <button onClick={() => window.open(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrUrl)}`, "_blank")} className="text-xs px-2.5 py-1.5 bg-slate-50 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors">QR ↗</button>
        <button onClick={() => onDelete(point)} className="text-xs px-2.5 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg font-medium transition-colors ml-auto">✕</button>
      </div>
    </div>
  );
}

/* ── Upgrade prompt ── */
function UpgradePrompt() {
  return (
    <div className="max-w-md mx-auto mt-12 text-center">
      <div className="bg-gradient-to-b from-purple-50 to-white border border-purple-100 rounded-2xl p-8 shadow-sm">
        <div className="text-5xl mb-4">🎯</div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Intap TRACE</h2>
        <p className="text-sm text-slate-600 mb-6">
          Crea puntos de control con checklists y encuestas, vincula QRs físicos y recibe alertas en tiempo real.
          Disponible en planes <strong>Pro</strong> y <strong>Enterprise</strong>.
        </p>
        <a href="/dashboard/profile" className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 transition-colors text-sm">
          ⚡ Mejorar a Pro
        </a>
      </div>
    </div>
  );
}

/* ── Main page ── */
export default function TracePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [points, setPoints] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPoint, setEditingPoint] = useState(null);
  const [selectedPoint, setSelectedPoint] = useState(null);

  const canUseTRACE = ["pro", "enterprise"].includes(user?.plan) || user?.role === "superadmin";

  const loadData = useCallback(async () => {
    if (!canUseTRACE) { setLoading(false); return; }
    try {
      const [pd, ad] = await Promise.all([
        api.get("/api/trace/points"),
        api.get("/api/trace/alerts"),
      ]);
      const pts = pd.points || [];
      setPoints(pts);
      setAlerts(ad.alerts || []);
      setSelectedPoint(prev => prev ? pts.find(p => p.id === prev.id) || pts[0] || null : pts[0] || null);
      api.get("/api/trace/crm/contacts").then(d => setContacts(d.contacts || [])).catch(() => {});
    } catch (e) {
      toast.error(e.message || "Error cargando datos");
    } finally {
      setLoading(false);
    }
  }, [canUseTRACE]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData(); }, [loadData]);

  async function handleResolveAlert(alertId) {
    try {
      await api.patch(`/api/trace/alerts/${alertId}/resolve`);
      setAlerts(prev => prev.filter(a => a.id !== alertId));
      toast.success("Alerta resuelta");
    } catch (e) { toast.error(e.message); }
  }

  async function handleDelete(point) {
    if (!confirm(`¿Eliminar "${point.name}"? Esta acción no se puede deshacer.`)) return;
    try {
      await api.delete(`/api/trace/points/${point.id}`);
      setPoints(prev => {
        const next = prev.filter(p => p.id !== point.id);
        setSelectedPoint(next[0] || null);
        return next;
      });
      toast.success("Punto eliminado");
    } catch (e) { toast.error(e.message); }
  }

  function handleEdit(point) { setEditingPoint(point); setShowModal(true); }
  function handleNew() { setEditingPoint(null); setShowModal(true); }
  function handleSaved() { setShowModal(false); loadData(); toast.success(editingPoint ? "Punto actualizado" : "Punto creado"); }

  const alertsByPoint = {};
  alerts.forEach(a => { alertsByPoint[a.point_id] = (alertsByPoint[a.point_id] || 0) + 1; });

  if (!canUseTRACE && !loading) {
    return <div className="p-4 sm:p-6"><UpgradePrompt /></div>;
  }

  return (
    <>
      {/* ── DESKTOP 3-column layout (md+) ── */}
      <div className="hidden md:flex" style={{ minHeight: "calc(100vh - 0px)" }}>

        {/* Left sidebar — point list (240px) */}
        <aside className="w-60 flex-shrink-0 bg-slate-50 border-r border-slate-200 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white flex-shrink-0">
            <div>
              <h1 className="font-bold text-slate-900 text-sm">Intap TRACE</h1>
              <p className="text-[10px] text-slate-400">{points.length} punto{points.length !== 1 ? "s" : ""}</p>
            </div>
            <button
              onClick={handleNew}
              className="w-7 h-7 flex items-center justify-center bg-primary text-white rounded-lg text-lg font-bold hover:bg-primary-dark transition-colors"
              title="Nuevo punto"
            >+</button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {loading ? (
              <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 bg-white rounded-xl animate-pulse" />)}</div>
            ) : points.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-3xl mb-2">🎯</p>
                <p className="text-xs text-slate-400">Sin puntos aún</p>
                <button onClick={handleNew} className="mt-3 text-xs text-blue-600 hover:underline">+ Crear primero</button>
              </div>
            ) : (
              points.map(p => (
                <PointListItem
                  key={p.id}
                  point={p}
                  alertCount={alertsByPoint[p.id] || 0}
                  isSelected={selectedPoint?.id === p.id}
                  onClick={setSelectedPoint}
                />
              ))
            )}
          </div>
        </aside>

        {/* Center — selected point detail (flex-1) */}
        <main className="flex-1 overflow-y-auto p-5">
          {selectedPoint ? (
            <PointDetail
              key={selectedPoint.id}
              point={selectedPoint}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center py-20">
              <p className="text-5xl mb-4">🎯</p>
              <p className="text-lg font-semibold text-slate-700 mb-1">Selecciona un punto de control</p>
              <p className="text-sm text-slate-400">O crea uno nuevo con el botón +</p>
            </div>
          )}
        </main>

        {/* Right panel — alerts + CRM (320px) */}
        <aside className="w-80 flex-shrink-0 bg-white border-l border-slate-200 flex flex-col overflow-hidden">
          {/* Alerts */}
          <div className="flex-shrink-0 border-b border-slate-100">
            <div className="px-4 py-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <span>🔔</span> Alertas
              </h2>
              {alerts.length > 0 && (
                <span className="text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">{alerts.length}</span>
              )}
            </div>
            <div className="px-4 pb-3 max-h-52 overflow-y-auto">
              {alerts.length === 0 ? (
                <p className="text-xs text-slate-400 py-2">Sin alertas pendientes ✓</p>
              ) : (
                alerts.map(a => <AlertRow key={a.id} alert={a} onResolve={handleResolveAlert} />)
              )}
            </div>
          </div>

          {/* CRM Contacts */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <span>👥</span> Contactos CRM
              </h2>
              <button onClick={() => navigate("/dashboard/trace/contacts")} className="text-[10px] text-blue-600 hover:underline">
                Ver todos →
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-2">
              {contacts.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">Sin contactos aún</p>
              ) : (
                contacts.slice(0, 15).map(c => <ContactRow key={c.id} contact={c} />)
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* ── MOBILE single-column layout (< md) ── */}
      <div className="md:hidden p-4 pb-28">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Intap TRACE</h1>
            <p className="text-xs text-slate-400">Puntos de control y encuestas</p>
          </div>
        </div>

        {/* Stats 2x2 */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <StatCard label="Puntos activos" value={points.filter(p => p.is_active).length} />
          <StatCard label="Alertas abiertas" value={alerts.length} color={alerts.length > 0 ? "text-red-600" : "text-slate-900"} />
          <StatCard label="Contactos CRM" value={contacts.length} />
          <StatCard label="Puntos totales" value={points.length} />
        </div>

        {/* Point cards */}
        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 bg-white rounded-xl animate-pulse border border-slate-100" />)}</div>
        ) : points.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-slate-100 shadow-sm">
            <p className="text-4xl mb-3">🎯</p>
            <p className="font-semibold text-slate-700 mb-1">Sin puntos de control</p>
            <p className="text-sm text-slate-400 mb-4">Crea tu primer punto TRACE para empezar</p>
          </div>
        ) : (
          <div className="space-y-3">
            {points.map(p => (
              <MobilePointCard
                key={p.id}
                point={p}
                alertCount={alertsByPoint[p.id] || 0}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        {/* Mobile alerts */}
        {alerts.length > 0 && (
          <div className="mt-4 bg-white rounded-xl border border-slate-100 shadow-sm p-4">
            <h2 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
              <span>🔔</span> Alertas abiertas ({alerts.length})
            </h2>
            {alerts.slice(0, 5).map(a => <AlertRow key={a.id} alert={a} onResolve={handleResolveAlert} />)}
          </div>
        )}
      </div>

      {/* Mobile FAB */}
      {canUseTRACE && (
        <button
          onClick={handleNew}
          className="md:hidden fixed bottom-20 right-4 w-14 h-14 bg-primary text-white rounded-full shadow-lg flex items-center justify-center text-2xl font-bold hover:bg-primary-dark transition-colors z-30"
          aria-label="Nuevo punto TRACE"
        >+</button>
      )}

      {/* Modal */}
      {showModal && (
        <TracePointModal
          point={editingPoint}
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}
