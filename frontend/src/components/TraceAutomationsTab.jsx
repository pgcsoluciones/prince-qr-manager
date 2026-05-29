import { useState, useEffect } from "react";
import { api } from "../utils/api.js";
import { toast } from "./Toast.jsx";

const TRIGGER_TYPES = [
  { value: "overdue_minutes", label: "Un punto no recibe escaneo en X minutos" },
  { value: "low_nps", label: "Puntuación de satisfacción del cliente (NPS) cae por debajo del umbral" },
  { value: "missed_checklist", label: "Un ítem obligatorio del checklist no se completó" },
  { value: "no_response_since", label: "Sin ninguna respuesta desde hace X horas" },
];

const ACTION_TYPES = [
  { value: "notify_email", label: "Enviar correo electrónico al responsable" },
  { value: "notify_whatsapp", label: "Enviar mensaje de WhatsApp al supervisor" },
  { value: "notify_slack", label: "Enviar mensaje al canal de Slack" },
  { value: "create_task", label: "Crear tarea pendiente en el sistema" },
];

const PRESET_AUTOMATIONS = [
  {
    name: "Atraso en reporte",
    trigger_type: "overdue_minutes",
    trigger_value: { minutes: 60 },
    action_type: "notify_email",
    message_template: "No hemos recibido el reporte de {{punto}}. Presenta un atraso de {{tiempo}} minutos.",
    desc: "Avisa al supervisor cuando un punto lleva más de 60 minutos sin registrar un escaneo.",
  },
  {
    name: "Calificación baja del cliente",
    trigger_type: "low_nps",
    trigger_value: { threshold: 6 },
    action_type: "notify_email",
    message_template: "El punto {{punto}} recibió una puntuación de satisfacción (NPS) de {{nps}}, por debajo del umbral mínimo.",
    desc: "Avisa al gerente cuando la puntuación de satisfacción del cliente (NPS) baja del umbral configurado.",
  },
  {
    name: "Checklist incompleto",
    trigger_type: "missed_checklist",
    trigger_value: {},
    action_type: "create_task",
    message_template: "El punto {{punto}} tiene ítems obligatorios del checklist sin completar. Tasa de cumplimiento por debajo del mínimo.",
    desc: "Crea una tarea pendiente cuando un ítem obligatorio del checklist no se completa.",
  },
  {
    name: "Fin de turno sin registro",
    trigger_type: "no_response_since",
    trigger_value: { hours: 8 },
    action_type: "notify_whatsapp",
    message_template: "El punto {{punto}} no ha recibido ningún registro en las últimas {{horas}} horas. Verifica el estado del turno.",
    desc: "Avisa al responsable cuando un punto no registra actividad durante toda la jornada.",
  },
];

function uid() { return Math.random().toString(36).slice(2, 9); }

function AutomationCard({ automation, onToggle, onDelete }) {
  const triggerLabel = TRIGGER_TYPES.find(t => t.value === automation.trigger_type)?.label || automation.trigger_type;
  const actionLabel = ACTION_TYPES.find(a => a.value === automation.action_type)?.label || automation.action_type;

  return (
    <div className={`bg-white rounded-xl border p-4 shadow-sm ${automation.is_active ? "border-blue-200" : "border-slate-200 opacity-60"}`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-900 text-sm">{automation.name}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            <span className="font-medium text-slate-600">Cuando:</span> {triggerLabel}
          </p>
          <p className="text-xs text-slate-500">
            <span className="font-medium text-slate-600">Acción:</span> {actionLabel}
          </p>
          {automation.message_template && (
            <p className="text-xs text-slate-400 mt-1 italic truncate">"{automation.message_template}"</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => onToggle(automation)}
            data-tooltip={automation.is_active ? "Desactivar automatización" : "Activar automatización"}
            className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
              automation.is_active
                ? "bg-green-100 text-green-700 hover:bg-green-200"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            {automation.is_active ? "Activa" : "Inactiva"}
          </button>
          <button
            onClick={() => onDelete(automation.id)}
            data-tooltip="Eliminar automatización"
            className="text-xs px-2 py-1 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

function NewAutomationForm({ onSaved, onCancel }) {
  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState("overdue_minutes");
  const [triggerMinutes, setTriggerMinutes] = useState(60);
  const [triggerThreshold, setTriggerThreshold] = useState(6);
  const [actionType, setActionType] = useState("notify_email");
  const [actionEmail, setActionEmail] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) { toast("El nombre es obligatorio", "error"); return; }
    setSaving(true);
    let trigger_value = {};
    if (triggerType === "overdue_minutes") trigger_value = { minutes: triggerMinutes };
    else if (triggerType === "low_nps") trigger_value = { threshold: triggerThreshold };
    else if (triggerType === "no_response_since") trigger_value = { hours: triggerMinutes };

    let action_config = {};
    if (actionType === "notify_email") action_config = { email: actionEmail };

    try {
      await api.post("/api/trace/automations", {
        name: name.trim(),
        trigger_type: triggerType,
        trigger_value,
        action_type: actionType,
        action_config,
        message_template: message || null,
      });
      toast.success("Automatización creada");
      onSaved();
    } catch (e) {
      toast.error(e.message || "Error guardando");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
      <p className="text-sm font-semibold text-slate-800">Nuevo aviso automático</p>

      <div>
        <label className="text-xs font-medium text-slate-600 mb-1 block">Nombre del aviso</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Ej: Atraso de limpieza de baños"
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-slate-600 mb-1 block">Cuando ocurra</label>
        <select
          value={triggerType}
          onChange={e => setTriggerType(e.target.value)}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500 bg-white"
        >
          {TRIGGER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      {(triggerType === "overdue_minutes" || triggerType === "no_response_since") && (
        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">
            {triggerType === "overdue_minutes" ? "Minutos sin escaneo" : "Horas sin actividad"}
          </label>
          <input
            type="number"
            min={1}
            value={triggerMinutes}
            onChange={e => setTriggerMinutes(Number(e.target.value))}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
          />
        </div>
      )}

      {triggerType === "low_nps" && (
        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">
            Umbral de puntuación de satisfacción del cliente (NPS) — alertar si es menor a {triggerThreshold}
          </label>
          <input
            type="range" min={1} max={10}
            value={triggerThreshold}
            onChange={e => setTriggerThreshold(Number(e.target.value))}
            className="w-full accent-blue-600"
          />
          <div className="flex justify-between text-xs text-slate-400"><span>1 (solo críticos)</span><span>10 (todos)</span></div>
        </div>
      )}

      <div>
        <label className="text-xs font-medium text-slate-600 mb-1 block">Tipo de acción a realizar</label>
        <select
          value={actionType}
          onChange={e => setActionType(e.target.value)}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500 bg-white"
        >
          {ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
      </div>

      {actionType === "notify_email" && (
        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">Correo del responsable</label>
          <input
            type="email"
            value={actionEmail}
            onChange={e => setActionEmail(e.target.value)}
            placeholder="supervisor@empresa.com"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
          />
        </div>
      )}

      <div>
        <label className="text-xs font-medium text-slate-600 mb-1 block">Mensaje del aviso (usa {"{{punto}}"}, {"{{tiempo}}"}, {"{{nps}}"})</label>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="No hemos recibido el reporte de {{punto}}. Presenta un atraso de {{tiempo}} minutos."
          rows={2}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500 resize-none"
        />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={onCancel}
          className="flex-1 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors font-medium"
        >
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Crear aviso"}
        </button>
      </div>
    </div>
  );
}

export default function TraceAutomationsTab() {
  const [automations, setAutomations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    try {
      const d = await api.get("/api/trace/automations");
      setAutomations(d.automations || []);
    } catch (_) {}
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleToggle(automation) {
    try {
      await api.patch(`/api/trace/automations/${automation.id}/toggle`);
      setAutomations(prev => prev.map(a => a.id === automation.id ? { ...a, is_active: a.is_active ? 0 : 1 } : a));
    } catch (e) { toast.error(e.message); }
  }

  async function handleDelete(id) {
    if (!confirm("¿Eliminar este aviso automático?")) return;
    try {
      await api.delete(`/api/trace/automations/${id}`);
      setAutomations(prev => prev.filter(a => a.id !== id));
      toast.success("Aviso eliminado");
    } catch (e) { toast.error(e.message); }
  }

  async function applyPreset(preset) {
    try {
      await api.post("/api/trace/automations", {
        name: preset.name,
        trigger_type: preset.trigger_type,
        trigger_value: preset.trigger_value,
        action_type: preset.action_type,
        action_config: {},
        message_template: preset.message_template,
      });
      toast.success(`Aviso "${preset.name}" creado`);
      load();
    } catch (e) { toast.error(e.message); }
  }

  return (
    <div className="p-5 space-y-5 max-w-3xl">
      {/* Header */}
      <div>
        <h2 className="text-base font-bold text-slate-900">Automatizaciones</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Configura avisos y acciones automáticas cuando algo no se cumple en tiempo y forma
        </p>
      </div>

      {/* New automation button / form */}
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          data-tooltip="Crear un nuevo aviso automático"
          className="w-full flex items-center gap-2 px-4 py-3 border-2 border-dashed border-blue-200 rounded-xl text-sm text-blue-600 font-medium hover:border-blue-400 hover:bg-blue-50 transition-colors"
        >
          + Nuevo aviso automático
        </button>
      ) : (
        <NewAutomationForm onSaved={() => { setShowForm(false); load(); }} onCancel={() => setShowForm(false)} />
      )}

      {/* Active automations */}
      {loading ? (
        <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />)}</div>
      ) : automations.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Tus avisos configurados</p>
          <div className="space-y-2">
            {automations.map(a => (
              <AutomationCard key={a.id} automation={a} onToggle={handleToggle} onDelete={handleDelete} />
            ))}
          </div>
        </div>
      )}

      {/* Preset templates */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Ejemplos predefinidos — usa uno como punto de partida</p>
        <div className="space-y-2">
          {PRESET_AUTOMATIONS.map(preset => (
            <div key={preset.name} className="bg-white rounded-xl border border-slate-200 p-4 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800">{preset.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">{preset.desc}</p>
                <p className="text-xs text-slate-400 mt-1 italic truncate">"{preset.message_template}"</p>
              </div>
              <button
                onClick={() => applyPreset(preset)}
                data-tooltip="Usar esta plantilla de aviso"
                className="flex-shrink-0 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-semibold hover:bg-blue-100 transition-colors"
              >
                Usar esta
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
