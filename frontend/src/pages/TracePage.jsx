import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../utils/api.js";
import { toast } from "../components/Toast.jsx";
import TracePointModal from "../components/TracePointModal.jsx";

/* ── Helpers ── */
function timeAgo(dateStr) {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "hace un momento";
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return `hace ${Math.floor(hrs / 24)}d`;
}

function QRTypeBadge({ type }) {
  const map = {
    checklist: { label: "Checklist", cls: "bg-emerald-100 text-emerald-700" },
    survey: { label: "Encuesta", cls: "bg-purple-100 text-purple-700" },
    mixed: { label: "Mixto", cls: "bg-blue-100 text-blue-700" },
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
    <div className="bg-white rounded-xl p-4 shadow-card border border-slate-100">
      <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

/* ── Alert row ── */
function AlertRow({ alert, onResolve }) {
  const typeMap = {
    low_nps: { icon: "📉", label: "NPS bajo", cls: "text-red-600" },
    missed_checklist: { icon: "⚠️", label: "Checklist incompleto", cls: "text-amber-600" },
    overdue: { icon: "⏰", label: "Sin escaneo", cls: "text-orange-600" },
  };
  const info = typeMap[alert.alert_type] || { icon: "🔔", label: alert.alert_type, cls: "text-slate-600" };
  return (
    <div className="flex items-start gap-3 py-3 border-b border-slate-50 last:border-0">
      <span className="text-lg flex-shrink-0">{info.icon}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${info.cls}`}>{info.label}</p>
        <p className="text-xs text-slate-500 mt-0.5 truncate">{alert.message}</p>
        <p className="text-[10px] text-slate-400 mt-0.5">{timeAgo(alert.created_at)}</p>
      </div>
      <button
        onClick={() => onResolve(alert.id)}
        className="flex-shrink-0 text-xs text-slate-400 hover:text-green-600 border border-slate-200 hover:border-green-300 rounded-lg px-2.5 py-1 transition-colors"
      >
        Resolver
      </button>
    </div>
  );
}

/* ── Point card ── */
function PointCard({ point, alertCount, onEdit, onDelete, onViewResponses }) {
  const qrUrl = `https://qr.intaprd.com/${point.id}`;

  function handleDownloadQR() {
    const canvas = document.createElement("canvas");
    const size = 300;
    canvas.width = size;
    canvas.height = size;
    // Basic QR placeholder — just open the URL in a new tab for reference
    window.open(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrUrl)}`, "_blank");
  }

  return (
    <div className="bg-white rounded-xl p-4 shadow-card border border-slate-100 hover:shadow-card-hover transition-shadow">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-semibold text-slate-900 text-sm truncate">{point.name}</h3>
            {alertCount > 0 && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
                {alertCount} alerta{alertCount > 1 ? "s" : ""}
              </span>
            )}
          </div>
          {point.area && (
            <p className="text-[11px] text-slate-400 mb-1.5">📍 {point.area}</p>
          )}
          <div className="flex gap-1.5 flex-wrap">
            <QRTypeBadge type={point.qr_type} />
            {point.template && point.template !== "custom" && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-500 capitalize">
                {point.template}
              </span>
            )}
          </div>
        </div>
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1 ${point.is_active ? "bg-green-400" : "bg-slate-300"}`} />
      </div>

      <div className="flex items-center justify-between text-[11px] text-slate-400 mb-3 pt-2 border-t border-slate-50">
        <span>Creado {timeAgo(point.created_at)}</span>
        <span className="font-mono truncate max-w-[130px] text-blue-500">{point.id.slice(0, 8)}…</span>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => onViewResponses(point)}
          className="text-xs px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium transition-colors"
        >
          Ver respuestas
        </button>
        <button
          onClick={() => onEdit(point)}
          className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-100 font-medium transition-colors"
        >
          Editar
        </button>
        <button
          onClick={handleDownloadQR}
          className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-100 font-medium transition-colors"
        >
          QR ↗
        </button>
        <button
          onClick={() => onDelete(point)}
          className="text-xs px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 font-medium transition-colors ml-auto"
        >
          Eliminar
        </button>
      </div>
    </div>
  );
}

/* ── Responses modal ── */
function ResponsesModal({ point, onClose }) {
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/api/trace/points/${point.id}/responses?limit=50`)
      .then(d => setResponses(d.responses || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [point.id]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-bold text-slate-900">{point.name}</h2>
            <p className="text-xs text-slate-400">Respuestas recibidas</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <p className="text-sm text-slate-400 text-center py-8">Cargando...</p>
          ) : responses.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">Sin respuestas aún</p>
          ) : (
            <div className="space-y-3">
              {responses.map(r => (
                <div key={r.id} className="border border-slate-100 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-slate-500 capitalize">{r.respondent_type}</span>
                    <span className="text-[10px] text-slate-400">{timeAgo(r.created_at)}</span>
                  </div>
                  {r.nps_score !== null && r.nps_score !== undefined && (
                    <p className="text-sm">NPS: <span className="font-bold text-blue-600">{r.nps_score}/10</span></p>
                  )}
                  {r.country && <p className="text-xs text-slate-400">📍 {r.country} · {r.device}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Upgrade prompt ── */
function UpgradePrompt() {
  return (
    <div className="max-w-md mx-auto mt-12 text-center">
      <div className="bg-gradient-to-b from-purple-50 to-white border border-purple-100 rounded-2xl p-8 shadow-card">
        <div className="text-5xl mb-4">🎯</div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Intap TRACE</h2>
        <p className="text-sm text-slate-600 mb-6">
          Crea puntos de control con checklists y encuestas, vincula QRs físicos y recibe alertas en tiempo real.
          Disponible en planes <strong>Pro</strong> y <strong>Enterprise</strong>.
        </p>
        <a
          href="/dashboard/profile"
          className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 transition-colors text-sm"
        >
          ⚡ Mejorar a Pro
        </a>
      </div>
    </div>
  );
}

/* ── Main page ── */
export default function TracePage() {
  const { user } = useAuth();
  const [points, setPoints] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPoint, setEditingPoint] = useState(null);
  const [viewingPoint, setViewingPoint] = useState(null);

  const canUseTRACE = ["pro", "enterprise"].includes(user?.plan) || user?.role === "superadmin";

  const loadData = useCallback(async () => {
    if (!canUseTRACE) { setLoading(false); return; }
    try {
      const [pd, ad] = await Promise.all([
        api.get("/api/trace/points"),
        api.get("/api/trace/alerts"),
      ]);
      setPoints(pd.points || []);
      setAlerts(ad.alerts || []);
    } catch (e) {
      toast.error(e.message || "Error cargando datos");
    } finally {
      setLoading(false);
    }
  }, [canUseTRACE]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleResolveAlert(alertId) {
    try {
      await api.patch(`/api/trace/alerts/${alertId}/resolve`);
      setAlerts(prev => prev.filter(a => a.id !== alertId));
      toast.success("Alerta resuelta");
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function handleDelete(point) {
    if (!confirm(`¿Eliminar el punto "${point.name}"? Esta acción no se puede deshacer.`)) return;
    try {
      await api.delete(`/api/trace/points/${point.id}`);
      setPoints(prev => prev.filter(p => p.id !== point.id));
      toast.success("Punto eliminado");
    } catch (e) {
      toast.error(e.message);
    }
  }

  function handleEdit(point) {
    setEditingPoint(point);
    setShowModal(true);
  }

  function handleNew() {
    setEditingPoint(null);
    setShowModal(true);
  }

  function handleSaved(newPoint) {
    setShowModal(false);
    if (editingPoint) {
      setPoints(prev => prev.map(p => p.id === editingPoint.id ? { ...p, ...newPoint } : p));
    } else {
      loadData();
    }
    toast.success(editingPoint ? "Punto actualizado" : "Punto creado");
  }

  // Stats
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const totalPoints = points.length;
  const openAlerts = alerts.length;
  const alertsByPoint = {};
  alerts.forEach(a => { alertsByPoint[a.point_id] = (alertsByPoint[a.point_id] || 0) + 1; });

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-slate-900">Intap TRACE</h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-700">
              Pro
            </span>
          </div>
          <p className="text-sm text-slate-500">Puntos de control, checklists y encuestas vinculadas a QR</p>
        </div>
        {canUseTRACE && (
          <button
            onClick={handleNew}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl font-semibold text-sm hover:bg-primary-dark transition-colors shadow-sm"
          >
            <span className="text-lg leading-none">+</span>
            Nuevo Punto
          </button>
        )}
      </div>

      {/* Plan gate */}
      {!canUseTRACE && !loading && <UpgradePrompt />}

      {/* Content */}
      {canUseTRACE && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <StatCard label="Puntos activos" value={totalPoints} />
            <StatCard label="Alertas abiertas" value={openAlerts} color={openAlerts > 0 ? "text-red-600" : "text-slate-900"} />
            <StatCard label="Módulo" value="TRACE" sub="Pro / Enterprise" />
            <StatCard label="Estado" value={totalPoints > 0 ? "Activo" : "Sin puntos"} color="text-emerald-600" />
          </div>

          {/* Points list */}
          {loading ? (
            <p className="text-center text-slate-400 py-12 text-sm">Cargando...</p>
          ) : points.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 text-center shadow-card border border-slate-100">
              <p className="text-4xl mb-3">🎯</p>
              <p className="font-semibold text-slate-700 mb-1">Sin puntos de control</p>
              <p className="text-sm text-slate-400 mb-4">Crea tu primer punto TRACE para empezar a recolectar respuestas</p>
              <button
                onClick={handleNew}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl font-semibold text-sm hover:bg-primary-dark transition-colors"
              >
                + Crear primer punto
              </button>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4 mb-6">
              {points.map(p => (
                <PointCard
                  key={p.id}
                  point={p}
                  alertCount={alertsByPoint[p.id] || 0}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onViewResponses={setViewingPoint}
                />
              ))}
            </div>
          )}

          {/* Alerts panel */}
          {alerts.length > 0 && (
            <div className="bg-white rounded-2xl shadow-card border border-slate-100 p-5">
              <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <span className="text-red-500">🔔</span>
                Alertas sin resolver ({alerts.length})
              </h2>
              {alerts.map(a => (
                <AlertRow key={a.id} alert={a} onResolve={handleResolveAlert} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Modal */}
      {showModal && (
        <TracePointModal
          point={editingPoint}
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
        />
      )}

      {/* Responses modal */}
      {viewingPoint && (
        <ResponsesModal point={viewingPoint} onClose={() => setViewingPoint(null)} />
      )}
    </div>
  );
}
