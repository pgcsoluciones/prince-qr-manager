import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../utils/api.js";
import { toast } from "../components/Toast.jsx";
import TracePointModal from "../components/TracePointModal.jsx";
import TraceQRPanel from "../components/TraceQRPanel.jsx";
import TraceAutomationsTab from "../components/TraceAutomationsTab.jsx";
import TraceCRMTab from "../components/TraceCRMTab.jsx";
import TraceConfigTab from "../components/TraceConfigTab.jsx";
import QRCode from "qrcode";

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
    checklist: { label: "Checklist",  cls: "bg-emerald-100 text-emerald-700" },
    survey:    { label: "Encuesta",   cls: "bg-purple-100 text-purple-700"  },
    mixed:     { label: "Mixto",      cls: "bg-blue-100 text-blue-700"      },
  };
  const info = map[type] || map.mixed;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${info.cls}`}>
      {info.label}
    </span>
  );
}

/* ── Upgrade prompt ── */
function UpgradePrompt() {
  return (
    <div className="max-w-md mx-auto mt-12 text-center px-4">
      <div className="bg-gradient-to-b from-purple-50 to-white border border-purple-100 rounded-2xl p-8 shadow-sm">
        <div className="text-5xl mb-4">🎯</div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Intap TRACE</h2>
        <p className="text-sm text-slate-600 mb-1 font-medium">Control, medición y evaluación de operaciones físicas</p>
        <p className="text-sm text-slate-500 mb-6">
          Crea puntos de control con checklists y encuestas, vincula QRs físicos y recibe alertas en tiempo real.
          Disponible en planes <strong>Pro</strong> y <strong>Enterprise</strong>.
        </p>
        <a href="/dashboard/profile" className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 transition-colors text-sm">
          Mejorar a Pro
        </a>
      </div>
    </div>
  );
}

/* ── Feature tour ── */
const TOUR_STEPS = [
  { title: "Panel de TRACE", body: "Este es tu panel de TRACE. Aquí ves todos tus puntos de control QR físicos.", target: "tour-panel" },
  { title: "Crear puntos de control", body: "Haz clic en '+ Nuevo punto de control' para crear un QR de control para cualquier área o proceso.", target: "tour-new" },
  { title: "Checklist o encuesta", body: "Cada punto puede tener un checklist de verificación, una encuesta de satisfacción del cliente (NPS), o ambos.", target: "tour-types" },
  { title: "Alertas automáticas", body: "Las alertas te avisan cuando algo no se completó a tiempo, cuando la puntuación de satisfacción (NPS) baja, o cuando un checklist queda incompleto.", target: "tour-alerts" },
  { title: "Sistema CRM", body: "El sistema CRM guarda los contactos de clientes que dejan su correo al responder un QR TRACE. Los puedes filtrar por puntuación de satisfacción.", target: "tour-crm" },
];

function FeatureTour({ onClose }) {
  const [step, setStep] = useState(0);
  const current = TOUR_STEPS[step];
  const isLast = step === TOUR_STEPS.length - 1;

  return (
    <div className="fixed bottom-20 right-4 z-50 w-72 bg-white rounded-2xl shadow-2xl border border-blue-200 p-4 animate-fade-in">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-widest">
            Paso {step + 1} de {TOUR_STEPS.length}
          </p>
          <p className="font-semibold text-slate-900 text-sm">{current.title}</p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-sm flex-shrink-0">✕</button>
      </div>
      <p className="text-sm text-slate-600 mb-4">{current.body}</p>
      <div className="flex items-center gap-2">
        {step > 0 && (
          <button
            onClick={() => setStep(s => s - 1)}
            className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors font-medium"
          >
            Anterior
          </button>
        )}
        <div className="flex-1 flex justify-center gap-1">
          {TOUR_STEPS.map((_, i) => (
            <div key={i} className={`w-1.5 h-1.5 rounded-full ${i === step ? "bg-blue-600" : "bg-slate-200"}`} />
          ))}
        </div>
        {!isLast ? (
          <button
            onClick={() => setStep(s => s + 1)}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition-colors font-semibold"
          >
            Siguiente
          </button>
        ) : (
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 transition-colors font-semibold"
          >
            Entendido
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Onboarding wizard ── */
const OBJECTIVES = [
  { id: "limpieza", label: "Limpieza y sanitización", icon: "🧹" },
  { id: "atencion", label: "Atención al cliente", icon: "🤝" },
  { id: "personal", label: "Control de personal", icon: "👤" },
  { id: "entregas", label: "Entregas y logística", icon: "📦" },
  { id: "seguridad", label: "Seguridad y accesos", icon: "🔐" },
  { id: "calidad", label: "Calidad de servicio", icon: "⭐" },
];

const AUDIENCE_OPTIONS = [
  { id: "employees", label: "Personal interno", icon: "👥" },
  { id: "customers", label: "Clientes externos", icon: "🙋" },
  { id: "both", label: "Ambos", icon: "🔄" },
];

function OnboardingWizard({ onDismiss, onCreated }) {
  const [step, setStep] = useState(1);
  const [objective, setObjective] = useState(null);
  const [pointName, setPointName] = useState("");
  const [pointArea, setPointArea] = useState("");
  const [audience, setAudience] = useState(null);
  const [saving, setSaving] = useState(false);

  async function handleFinish() {
    if (!pointName.trim()) { toast.error("El nombre del punto es obligatorio"); return; }
    setSaving(true);

    // Recommend template based on objective
    const templateMap = {
      limpieza: "restaurante",
      atencion: "retail",
      personal: "oficina",
      entregas: "logistica",
      seguridad: "oficina",
      calidad: "hotel",
    };
    const template = templateMap[objective] || "custom";
    const qrType = audience === "customers" ? "survey" : audience === "employees" ? "checklist" : "mixed";

    try {
      const data = await api.post("/api/trace/points", {
        name: pointName.trim(),
        area: pointArea.trim() || null,
        template,
        qr_type: qrType,
        checklist_items: [],
        survey_questions: [],
        alert_config: {},
      });
      toast.success("Punto de control creado");
      onCreated(data.point);
    } catch (e) {
      toast.error(e.message || "Error creando punto");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3, 4].map(s => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                s < step ? "bg-green-500 text-white" : s === step ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-400"
              }`}>{s < step ? "✓" : s}</div>
              {s < 4 && <div className={`flex-1 h-1 rounded ${s < step ? "bg-green-400" : "bg-slate-100"}`} />}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div>
            <h2 className="text-lg font-bold text-slate-900 mb-1">Bienvenido a Intap TRACE</h2>
            <p className="text-sm text-slate-500 mb-5">Te guiamos en 4 pasos para crear tu primer punto de control QR</p>
            <p className="text-sm font-semibold text-slate-700 mb-3">Paso 1 de 4: ¿Qué quieres medir o controlar?</p>
            <div className="grid grid-cols-2 gap-2">
              {OBJECTIVES.map(o => (
                <button
                  key={o.id}
                  onClick={() => setObjective(o.id)}
                  className={`flex items-center gap-2 p-3 rounded-xl border-2 text-left text-sm transition-colors ${
                    objective === o.id
                      ? "border-blue-600 bg-blue-50 text-blue-700 font-semibold"
                      : "border-slate-100 hover:border-slate-200 text-slate-600"
                  }`}
                >
                  <span>{o.icon}</span>
                  <span>{o.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-4">Paso 2 de 4: ¿Dónde estará colocado este QR?</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Nombre del punto de control *</label>
                <input
                  type="text"
                  value={pointName}
                  onChange={e => setPointName(e.target.value)}
                  placeholder="Ej: Baño planta baja, Recepción, Entrada principal"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Área o ubicación (opcional)</label>
                <input
                  type="text"
                  value={pointArea}
                  onChange={e => setPointArea(e.target.value)}
                  placeholder="Ej: Piso 2, Zona Norte, Sucursal Centro"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-4">Paso 3 de 4: ¿Quién interactuará con este QR?</p>
            <div className="space-y-2">
              {AUDIENCE_OPTIONS.map(a => (
                <button
                  key={a.id}
                  onClick={() => setAudience(a.id)}
                  className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-colors ${
                    audience === a.id
                      ? "border-blue-600 bg-blue-50 text-blue-700 font-semibold"
                      : "border-slate-100 hover:border-slate-200 text-slate-600"
                  }`}
                >
                  <span className="text-2xl">{a.icon}</span>
                  <span className="text-sm">{a.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">Paso 4 de 4: Resumen y creación</p>
            <p className="text-xs text-slate-500 mb-4">
              Basándonos en tus respuestas, configuraremos la plantilla más adecuada para tu punto de control.
            </p>
            <div className="bg-blue-50 rounded-xl p-4 mb-4 space-y-2">
              <p className="text-sm"><span className="font-medium text-slate-600">Objetivo:</span> {OBJECTIVES.find(o => o.id === objective)?.label || "—"}</p>
              <p className="text-sm"><span className="font-medium text-slate-600">Punto:</span> {pointName || "—"}</p>
              {pointArea && <p className="text-sm"><span className="font-medium text-slate-600">Área:</span> {pointArea}</p>}
              <p className="text-sm"><span className="font-medium text-slate-600">Usuarios:</span> {AUDIENCE_OPTIONS.find(a => a.id === audience)?.label || "—"}</p>
            </div>
            <p className="text-xs text-slate-400">
              Después de crear el punto podrás personalizar el checklist, las preguntas de la encuesta y configurar alertas automáticas.
            </p>
          </div>
        )}

        {/* Nav buttons */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-100">
          <button
            onClick={onDismiss}
            className="text-xs text-slate-400 hover:text-slate-600 underline"
          >
            Omitir guía e ir al panel
          </button>
          <div className="flex gap-2">
            {step > 1 && (
              <button
                onClick={() => setStep(s => s - 1)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors font-medium"
              >
                Anterior
              </button>
            )}
            {step < 4 ? (
              <button
                onClick={() => {
                  if (step === 1 && !objective) { toast.error("Selecciona un objetivo"); return; }
                  if (step === 2 && !pointName.trim()) { toast.error("Ingresa el nombre del punto"); return; }
                  if (step === 3 && !audience) { toast.error("Selecciona el tipo de usuario"); return; }
                  setStep(s => s + 1);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
              >
                Siguiente
              </button>
            ) : (
              <button
                onClick={handleFinish}
                disabled={saving}
                className="px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {saving ? "Creando..." : "Crear punto de control"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Alert row ── */
function AlertRow({ alert, onResolve }) {
  const typeMap = {
    low_nps:          { icon: "📉", label: "Puntuación de satisfacción (NPS) baja",  cls: "text-red-600"    },
    missed_checklist: { icon: "⚠️", label: "Checklist incompleto",                    cls: "text-amber-600" },
    overdue:          { icon: "⏰", label: "Sin escaneo registrado",                  cls: "text-orange-600"},
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
        data-tooltip="Marcar alerta como resuelta"
        className="flex-shrink-0 text-[10px] text-slate-400 hover:text-green-600 border border-slate-200 hover:border-green-300 rounded-md px-2 py-0.5 transition-colors"
      >✓</button>
    </div>
  );
}

const POINT_TYPE_DESC = {
  checklist: "Control de verificación — el personal confirma las tareas completadas",
  survey:    "Encuesta de satisfacción — los clientes califican su experiencia (1-10)",
  mixed:     "Punto mixto — checklist interno + encuesta al cliente",
};

function QRThumbnail({ url }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, url, { width: 48, margin: 1, color: { dark: "#1e293b", light: "#ffffff" } }).catch(() => {});
  }, [url]);
  return <canvas ref={canvasRef} width={48} height={48} className="rounded flex-shrink-0" />;
}

/* ── Point card (for grid view) ── */
function PointCard({ point, alertCount, onEdit, onDelete, onShowQR }) {
  const navigate = useNavigate();
  const qrUrl = point.point_slug ? `https://qr.intaprd.com/t/${point.point_slug}` : `https://qr.intaprd.com/t/${point.id}`;
  const scanCount = point.scan_count || 0;
  return (
    <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${point.is_active ? "bg-green-400" : "bg-slate-300"}`} />
            <h3 className="font-semibold text-slate-900 text-sm truncate">{point.name}</h3>
            {alertCount > 0 && (
              <span className="flex-shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">{alertCount}</span>
            )}
          </div>
          {point.area && <p className="text-[11px] text-slate-400 mb-1.5">📍 {point.area}</p>}
          <QRTypeBadge type={point.qr_type} />
          <p className="text-[11px] text-slate-400 mt-1 leading-snug">{POINT_TYPE_DESC[point.qr_type] || "Punto de trazabilidad"}</p>
        </div>
        <div className="relative flex-shrink-0">
          <QRThumbnail url={qrUrl} />
          {scanCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow">
              {scanCount > 99 ? "99+" : scanCount}
            </span>
          )}
        </div>
      </div>
      <p className="text-[10px] text-slate-400 font-mono truncate mb-3">{qrUrl}</p>
      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={() => navigate(`/dashboard/trace/${point.id}/responses`)}
          data-tooltip="Ver todas las respuestas de este punto"
          className="text-xs px-2.5 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg font-medium transition-colors"
        >
          Respuestas
        </button>
        <button
          onClick={() => onEdit(point)}
          data-tooltip="Editar configuración del punto"
          className="text-xs px-2.5 py-1.5 bg-slate-50 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
        >
          Editar
        </button>
        <button
          onClick={() => onShowQR(point)}
          data-tooltip="Ver y descargar código QR"
          className="text-xs px-2.5 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg font-medium transition-colors"
        >
          Ver QR
        </button>
        <button
          onClick={() => onDelete(point)}
          data-tooltip="Eliminar este punto de control"
          className="text-xs px-2.5 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg font-medium transition-colors ml-auto"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

/* ── Responses tab ── */
function ResponsesTab({ points }) {
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/api/trace/responses?limit=50")
      .then(d => setResponses(d.responses || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const pointMap = Object.fromEntries(points.map(p => [p.id, p.name]));

  if (loading) {
    return <div className="p-5 space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}</div>;
  }

  return (
    <div className="p-5">
      <div className="mb-4">
        <h2 className="text-base font-bold text-slate-900">Respuestas recibidas</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Revisa cada escaneo y respuesta recibida de tus equipos y clientes en tiempo real
        </p>
      </div>
      {responses.length === 0 ? (
        <div className="bg-white rounded-xl p-10 text-center border border-slate-100 shadow-sm">
          <p className="text-3xl mb-3">📋</p>
          <p className="font-semibold text-slate-700 text-sm">Sin respuestas aún</p>
          <p className="text-xs text-slate-400 mt-1">Las respuestas aparecerán aquí cuando alguien escanee y complete un QR TRACE</p>
        </div>
      ) : (
        <div className="space-y-2">
          {responses.map(r => {
            const npsColor = r.nps_score >= 8 ? "bg-green-100 text-green-700" : r.nps_score >= 6 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";
            return (
              <div key={r.id} className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm flex items-center gap-3 flex-wrap">
                <span className="text-xs text-slate-400 font-mono">{timeAgo(r.created_at)}</span>
                <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">{pointMap[r.point_id] || r.point_id}</span>
                <span className="text-[11px] text-slate-500 capitalize px-2 py-0.5 bg-white rounded-full border border-slate-200">{r.respondent_type}</span>
                {r.nps_score != null && (
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${npsColor}`}>
                    Índice de satisfacción (NPS): {r.nps_score}/10
                  </span>
                )}
                {r.contact_email && <span className="text-[11px] text-blue-600 truncate">{r.contact_email}</span>}
                <span className="ml-auto text-[10px] text-slate-400">{r.country}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Projects tab ── */
function ProjectsTab() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#2563eb");
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const d = await api.get("/api/trace/projects");
      setProjects(d.projects || []);
    } catch (_) {}
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate() {
    if (!name.trim()) { toast.error("El nombre es obligatorio"); return; }
    setSaving(true);
    try {
      await api.post("/api/trace/projects", { name: name.trim(), description: description.trim() || null, color });
      toast.success("Proyecto TRACE creado");
      setShowForm(false); setName(""); setDescription(""); setColor("#2563eb");
      load();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(id) {
    if (!confirm("¿Eliminar este proyecto TRACE?")) return;
    try {
      await api.delete(`/api/trace/projects/${id}`);
      setProjects(prev => prev.filter(p => p.id !== id));
      toast.success("Proyecto eliminado");
    } catch (e) { toast.error(e.message); }
  }

  return (
    <div className="p-5 space-y-5 max-w-2xl">
      <div>
        <h2 className="text-base font-bold text-slate-900">Proyectos TRACE</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Organiza tus puntos de control por sucursal, área de negocio o campaña de medición
        </p>
      </div>

      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          data-tooltip="Crear un nuevo proyecto para organizar puntos de control"
          className="w-full flex items-center gap-2 px-4 py-3 border-2 border-dashed border-blue-200 rounded-xl text-sm text-blue-600 font-medium hover:border-blue-400 hover:bg-blue-50 transition-colors"
        >
          + Nuevo proyecto TRACE
        </button>
      ) : (
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-800">Nuevo proyecto TRACE</p>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Nombre del proyecto (Ej: Sucursal Norte, Q3 2025)"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
          />
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Descripción opcional"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
          />
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-600">Color del proyecto:</label>
            <input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-8 w-12 rounded border border-slate-200 cursor-pointer" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="flex-1 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
            <button onClick={handleCreate} disabled={saving} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50">
              {saving ? "Guardando..." : "Crear proyecto"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}</div>
      ) : projects.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center border border-slate-100 shadow-sm">
          <p className="text-slate-400 text-sm">Sin proyectos aún. Crea tu primer proyecto para organizar los puntos de control.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {projects.map(p => (
            <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between gap-3 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-4 h-10 rounded-sm flex-shrink-0" style={{ background: p.color }} />
                <div>
                  <p className="font-semibold text-slate-900 text-sm">{p.name}</p>
                  {p.description && <p className="text-xs text-slate-400">{p.description}</p>}
                </div>
              </div>
              <button
                onClick={() => handleDelete(p.id)}
                data-tooltip="Eliminar proyecto"
                className="text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors"
              >
                Eliminar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Top nav tabs config ── */
const NAV_TABS = [
  { id: "puntos",         label: "Puntos de Control",   desc: "Crea QRs físicos para medir, controlar y evaluar operaciones en tiempo real" },
  { id: "proyectos",      label: "Proyectos TRACE",      desc: "Organiza tus puntos de control por sucursal, área o campaña de medición" },
  { id: "respuestas",     label: "Respuestas",           desc: "Revisa cada escaneo y respuesta recibida de tus equipos y clientes" },
  { id: "crm",            label: "Contactos del CRM",    desc: "Gestiona los contactos de clientes que interactuaron con tus QRs de control" },
  { id: "automatizaciones", label: "Automatizaciones",  desc: "Configura avisos y acciones automáticas cuando algo no se cumple a tiempo" },
  { id: "configuracion",  label: "Configuración",        desc: "Personaliza la apariencia, notificaciones y plantillas de tu cuenta TRACE" },
];

/* ── Main page ── */
export default function TracePage() {
  const { user } = useAuth();
  const [points, setPoints] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPoint, setEditingPoint] = useState(null);
  const [activeTab, setActiveTab] = useState("puntos");
  const [showTour, setShowTour] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [qrPanelPoint, setQrPanelPoint] = useState(null);
  const didCheckOnboarding = useRef(false);

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

      // Show onboarding wizard if no points and not already shown
      if (!didCheckOnboarding.current) {
        didCheckOnboarding.current = true;
        const dismissed = localStorage.getItem("trace_onboarding_dismissed");
        if (pts.length === 0 && !dismissed) {
          setShowOnboarding(true);
        }
        // Show tour if not shown before
        const tourSeen = localStorage.getItem("trace_tour_seen");
        if (!tourSeen && pts.length > 0) {
          setShowTour(true);
          localStorage.setItem("trace_tour_seen", "1");
        }
      }
    } catch (e) {
      toast.error(e.message || "Error cargando datos TRACE");
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
    } catch (e) { toast.error(e.message); }
  }

  async function handleDelete(point) {
    if (!confirm(`¿Eliminar "${point.name}"? Esta acción no se puede deshacer.`)) return;
    try {
      await api.delete(`/api/trace/points/${point.id}`);
      setPoints(prev => prev.filter(p => p.id !== point.id));
      toast.success("Punto eliminado");
    } catch (e) { toast.error(e.message); }
  }

  function handleEdit(point) { setEditingPoint(point); setShowModal(true); }
  function handleNew() { setEditingPoint(null); setShowModal(true); }
  function handleSaved() {
    setShowModal(false);
    loadData();
    toast.success(editingPoint ? "Punto actualizado" : "Punto de control creado");
  }
  function handleShowQR(point) { setQrPanelPoint(point); }

  function handleOnboardingCreated(point) {
    localStorage.setItem("trace_onboarding_dismissed", "1");
    setShowOnboarding(false);
    loadData();
    // Show QR panel immediately after creation
    setQrPanelPoint(point);
  }

  function handleOnboardingDismiss() {
    localStorage.setItem("trace_onboarding_dismissed", "1");
    setShowOnboarding(false);
  }

  const alertsByPoint = {};
  alerts.forEach(a => { alertsByPoint[a.point_id] = (alertsByPoint[a.point_id] || 0) + 1; });

  if (!canUseTRACE && !loading) {
    return <div className="p-4 sm:p-6"><UpgradePrompt /></div>;
  }

  const currentTab = NAV_TABS.find(t => t.id === activeTab);

  return (
    <div className="flex flex-col min-h-full">
      {/* ── Module header ── */}
      <div className="bg-white border-b border-slate-200 flex-shrink-0">
        <div className="px-5 pt-4 pb-0">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                🎯 Intap TRACE
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">Control, medición y evaluación de operaciones físicas</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {alerts.length > 0 && (
                <span className="text-xs font-bold bg-red-100 text-red-600 px-2.5 py-1 rounded-full">
                  {alerts.length} alerta{alerts.length !== 1 ? "s" : ""}
                </span>
              )}
              <button
                id="tour-new"
                onClick={handleNew}
                data-tooltip="Crear un nuevo punto de control QR"
                className="px-3 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
              >
                + Nuevo punto de control
              </button>
            </div>
          </div>

          {/* Top navigation tabs */}
          <div className="flex gap-0 overflow-x-auto" id="tour-panel">
            {NAV_TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? "border-blue-600 text-blue-700"
                    : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab description */}
      {currentTab && (
        <div className="bg-blue-50 border-b border-blue-100 px-5 py-2 flex-shrink-0">
          <p className="text-xs text-blue-700">{currentTab.desc}</p>
        </div>
      )}

      {/* ── Tab content ── */}
      <div className="flex-1 overflow-auto">

        {/* PUNTOS tab */}
        {activeTab === "puntos" && (
          <>
            {/* Show onboarding if no points */}
            {!loading && points.length === 0 && showOnboarding ? (
              <OnboardingWizard onDismiss={handleOnboardingDismiss} onCreated={handleOnboardingCreated} />
            ) : (
              <div className="p-5">
                {/* Alerts summary (if any) */}
                {alerts.length > 0 && (
                  <div className="bg-white rounded-xl border border-red-100 shadow-sm p-4 mb-5" id="tour-alerts">
                    <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                      🔔 Alertas activas
                      <span className="text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">{alerts.length}</span>
                    </h3>
                    <div className="max-h-36 overflow-y-auto">
                      {alerts.slice(0, 5).map(a => <AlertRow key={a.id} alert={a} onResolve={handleResolveAlert} />)}
                    </div>
                  </div>
                )}

                {/* Stats row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5" id="tour-types">
                  {[
                    { label: "Puntos activos", value: points.filter(p => p.is_active).length },
                    { label: "Puntos totales", value: points.length },
                    { label: "Alertas abiertas", value: alerts.length, color: alerts.length > 0 ? "text-red-600" : "text-slate-900" },
                    { label: "Solo checklist", value: points.filter(p => p.qr_type === "checklist").length },
                  ].map(s => (
                    <div key={s.label} className="bg-white rounded-xl p-3 shadow-sm border border-slate-100">
                      <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest mb-1">{s.label}</p>
                      <p className={`text-2xl font-bold ${s.color || "text-slate-900"}`}>{s.value}</p>
                    </div>
                  ))}
                </div>

                {/* Points grid */}
                {loading ? (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {[1,2,3].map(i => <div key={i} className="h-36 bg-white rounded-xl animate-pulse border border-slate-100" />)}
                  </div>
                ) : points.length === 0 ? (
                  <div className="bg-white rounded-2xl p-10 text-center border border-slate-100 shadow-sm">
                    <p className="text-4xl mb-3">🎯</p>
                    <p className="font-semibold text-slate-700 mb-1">Sin puntos de control aún</p>
                    <p className="text-sm text-slate-400 mb-4">Crea tu primer punto TRACE para empezar a medir</p>
                    <button onClick={handleNew} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors">
                      + Crear primer punto de control
                    </button>
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {points.map(p => (
                      <PointCard
                        key={p.id}
                        point={p}
                        alertCount={alertsByPoint[p.id] || 0}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        onShowQR={handleShowQR}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {activeTab === "proyectos" && <ProjectsTab />}

        {activeTab === "respuestas" && <ResponsesTab points={points} />}

        {activeTab === "crm" && (
          <div id="tour-crm">
            <TraceCRMTab />
          </div>
        )}

        {activeTab === "automatizaciones" && <TraceAutomationsTab />}

        {activeTab === "configuracion" && <TraceConfigTab />}
      </div>

      {/* Mobile FAB */}
      {canUseTRACE && activeTab === "puntos" && (
        <button
          onClick={handleNew}
          data-tooltip="Nuevo punto de control TRACE"
          className="sm:hidden fixed bottom-20 right-4 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center text-2xl font-bold hover:bg-blue-700 transition-colors z-30"
          aria-label="Nuevo punto TRACE"
        >+</button>
      )}

      {/* Feature tour button */}
      <button
        onClick={() => setShowTour(t => !t)}
        data-tooltip="Guía de funciones de TRACE"
        className="fixed bottom-4 right-4 w-10 h-10 bg-slate-700 text-white rounded-full shadow-lg flex items-center justify-center text-sm font-bold hover:bg-slate-900 transition-colors z-30"
        aria-label="Abrir guía de funciones"
      >?</button>

      {showTour && (
        <FeatureTour onClose={() => { setShowTour(false); localStorage.setItem("trace_tour_seen", "1"); }} />
      )}

      {/* Point modal */}
      {showModal && (
        <TracePointModal
          point={editingPoint}
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
        />
      )}

      {/* QR Panel modal */}
      {qrPanelPoint && (
        <TraceQRPanel
          point={qrPanelPoint}
          onClose={() => setQrPanelPoint(null)}
        />
      )}
    </div>
  );
}
