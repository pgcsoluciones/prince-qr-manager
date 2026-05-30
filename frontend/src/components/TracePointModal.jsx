import { useState, useEffect } from "react";
import { api } from "../utils/api.js";
import { toast } from "./Toast.jsx";
import ImageUpload from "./ImageUpload.jsx";
import TraceLandingPreview from "./TraceLandingPreview.jsx";

/* ── Template presets ── */
const TEMPLATES = {
  restaurante: {
    checklist: ["Mesas limpias", "Suelo barrido", "Baños verificados", "Zona de cocina despejada", "Menús limpios"],
    survey: [{ label: "¿Cómo calificarías tu experiencia?", type: "nps" }, { label: "¿Qué podemos mejorar?", type: "text" }]
  },
  hotel: {
    checklist: ["Cama tendida", "Baño limpio", "Amenities repuestos", "Papelera vaciada", "TV y AC funcionando"],
    survey: [{ label: "¿Cómo calificarías tu habitación?", type: "nps" }, { label: "¿Algún comentario?", type: "text" }]
  },
  retail: {
    checklist: ["Caja abierta", "Inventario verificado", "Vitrina limpia", "Probadores ordenados"],
    survey: [{ label: "¿Encontraste lo que buscabas?", type: "yesno" }, { label: "¿Cómo fue la atención?", type: "nps" }]
  },
  clinica: {
    checklist: ["Sala de espera limpia", "Equipos desinfectados", "Residuos gestionados", "Registro de pacientes actualizado"],
    survey: [{ label: "¿Cómo calificarías la atención recibida?", type: "nps" }, { label: "¿Algún comentario?", type: "text" }]
  },
  oficina: {
    checklist: ["Área de trabajo ordenada", "Equipos encendidos/apagados según protocolo", "Acceso controlado"],
    survey: [{ label: "¿Cómo fue tu día de trabajo?", type: "rating" }]
  },
  logistica: {
    checklist: ["Paquete recibido en buen estado", "Documentación correcta", "Temperatura verificada", "Firma de recepción"],
    survey: [{ label: "¿La entrega fue puntual?", type: "yesno" }, { label: "Comentarios", type: "text" }]
  },
  custom: {
    checklist: [],
    survey: []
  }
};

const TEMPLATE_LABELS = {
  restaurante: "🍽️ Restaurante",
  hotel: "🏨 Hotel",
  retail: "🛍️ Retail",
  clinica: "🏥 Clínica",
  oficina: "🏢 Oficina",
  logistica: "🚚 Logística",
  custom: "⚙️ Personalizado",
};

const QR_TYPES = [
  { value: "checklist", label: "Checklist", icon: "✅", desc: "Solo ítems de verificación" },
  { value: "survey", label: "Encuesta", icon: "📋", desc: "Solo preguntas y NPS" },
  { value: "mixed", label: "Mixto", icon: "🔀", desc: "Checklist + Encuesta" },
];

const QUESTION_TYPES = [
  { value: "nps", label: "NPS (1-10)" },
  { value: "rating", label: "Calificación ★" },
  { value: "text", label: "Texto libre" },
  { value: "yesno", label: "Sí / No" },
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export default function TracePointModal({ point, onClose, onSaved }) {
  const isEdit = !!point;

  const [tab, setTab] = useState("config");
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState(point?.name || "");
  const [area, setArea] = useState(point?.area || "");
  const [template, setTemplate] = useState(point?.template || "custom");
  const [qrType, setQrType] = useState(point?.qr_type || "mixed");
  const [checklistItems, setChecklistItems] = useState(
    point?.checklist_items?.length ? point.checklist_items : []
  );
  const [surveyQuestions, setSurveyQuestions] = useState(
    point?.survey_questions?.length ? point.survey_questions : [
      { id: uid(), label: "¿Cómo calificarías tu experiencia?", type: "nps" }
    ]
  );
  const [alertEmail, setAlertEmail] = useState(point?.alert_config?.email || "");
  const [npsThreshold, setNpsThreshold] = useState(point?.alert_config?.nps_threshold ?? 7);
  const [overdueMinutes, setOverdueMinutes] = useState(point?.alert_config?.threshold_minutes ?? 0);
  const [brandColor, setBrandColor] = useState(point?.brand_color || "#2563eb");
  const [brandLogo, setBrandLogo] = useState(point?.brand_logo || "");
  const [responsibleId, setResponsibleId] = useState(point?.responsible_id || "");
  const [notifyIds, setNotifyIds] = useState(() => {
    try { return JSON.parse(point?.notify_collaborator_ids || "[]"); } catch { return []; }
  });
  const [collaborators, setCollaborators] = useState([]);

  useEffect(() => {
    api.get("/api/collaborators").then(d => setCollaborators((d.collaborators || []).filter(c => c.is_active))).catch(() => {});
  }, []);

  function applyTemplate(tmpl) {
    setTemplate(tmpl);
    if (tmpl === "custom") return;
    const preset = TEMPLATES[tmpl];
    if (!preset) return;
    setChecklistItems(preset.checklist.map(label => ({ id: uid(), label, required: false })));
    setSurveyQuestions(preset.survey.map(q => ({ id: uid(), ...q })));
  }

  /* Checklist helpers */
  function addChecklistItem() {
    setChecklistItems(prev => [...prev, { id: uid(), label: "", required: false }]);
  }
  function updateChecklistItem(id, field, value) {
    setChecklistItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  }
  function removeChecklistItem(id) {
    setChecklistItems(prev => prev.filter(item => item.id !== id));
  }

  /* Survey helpers */
  function addSurveyQuestion() {
    setSurveyQuestions(prev => [...prev, { id: uid(), label: "", type: "nps" }]);
  }
  function updateSurveyQuestion(id, field, value) {
    setSurveyQuestions(prev => prev.map(q => q.id === id ? { ...q, [field]: value } : q));
  }
  function removeSurveyQuestion(id) {
    setSurveyQuestions(prev => prev.filter(q => q.id !== id));
  }

  async function handleSave() {
    if (!name.trim()) { toast("El nombre es obligatorio", "error"); return; }
    setSaving(true);
    const payload = {
      name: name.trim(),
      area: area.trim() || null,
      template,
      qr_type: qrType,
      checklist_items: checklistItems,
      survey_questions: surveyQuestions,
      alert_config: {
        email: alertEmail || null,
        nps_threshold: npsThreshold,
        threshold_minutes: overdueMinutes,
      },
      brand_color: brandColor || "#2563eb",
      brand_logo: brandLogo.trim() || null,
      responsible_id: responsibleId || null,
      notify_collaborator_ids: notifyIds,
    };
    try {
      if (isEdit) {
        await api.put(`/api/trace/points/${point.id}`, { ...payload, is_active: point.is_active });
        onSaved(payload);
      } else {
        const data = await api.post("/api/trace/points", payload);
        onSaved({ id: data.point.id, ...payload });
      }
    } catch (e) {
      toast(e.message || "Error guardando", "error");
    } finally {
      setSaving(false);
    }
  }

  const showChecklist = qrType === "checklist" || qrType === "mixed";
  const showSurvey = qrType === "survey" || qrType === "mixed";

  const tabs = [
    { id: "config", label: "Configuración" },
    ...(showChecklist ? [{ id: "checklist", label: "Checklist" }] : []),
    ...(showSurvey ? [{ id: "survey", label: "Encuesta" }] : []),
    { id: "alerts", label: "Alertas" },
    { id: "marca", label: "Marca" },
  ];

  // Reset tab if it becomes unavailable
  useEffect(() => {
    if (tab === "checklist" && !showChecklist) setTab("config");
    if (tab === "survey" && !showSurvey) setTab("config");
  }, [qrType]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <h2 className="font-bold text-slate-900">{isEdit ? "Editar punto TRACE" : "Nuevo punto TRACE"}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4 border-b border-slate-100 flex-shrink-0 overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`pb-3 px-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                tab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* === CONFIG TAB === */}
          {tab === "config" && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre del punto *</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ej: Baño planta baja, Recepción hotel..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Área / Ubicación</label>
                <input
                  type="text"
                  value={area}
                  onChange={e => setArea(e.target.value)}
                  placeholder="Ej: Piso 2, Zona Norte..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Plantilla</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {Object.entries(TEMPLATE_LABELS).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => applyTemplate(key)}
                      className={`text-left p-3 rounded-xl border-2 text-sm transition-colors ${
                        template === key
                          ? "border-primary bg-blue-50 text-primary font-medium"
                          : "border-slate-100 hover:border-slate-200 text-slate-600"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Tipo de QR</label>
                <div className="grid grid-cols-3 gap-3">
                  {QR_TYPES.map(qt => (
                    <button
                      key={qt.value}
                      type="button"
                      onClick={() => setQrType(qt.value)}
                      className={`p-3 rounded-xl border-2 text-center transition-colors ${
                        qrType === qt.value
                          ? "border-primary bg-blue-50"
                          : "border-slate-100 hover:border-slate-200"
                      }`}
                    >
                      <div className="text-2xl mb-1">{qt.icon}</div>
                      <div className={`text-xs font-semibold ${qrType === qt.value ? "text-primary" : "text-slate-700"}`}>{qt.label}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{qt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* === CHECKLIST TAB === */}
          {tab === "checklist" && (
            <div className="space-y-3">
              {checklistItems.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">Sin ítems aún. Agrega el primero.</p>
              )}
              {checklistItems.map((item, idx) => (
                <div key={item.id} className="flex items-center gap-2 p-3 border border-slate-100 rounded-xl">
                  <span className="text-xs text-slate-300 font-bold w-5 text-center flex-shrink-0">{idx + 1}</span>
                  <input
                    type="text"
                    value={item.label}
                    onChange={e => updateChecklistItem(item.id, "label", e.target.value)}
                    placeholder="Descripción del ítem..."
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                  <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={item.required}
                      onChange={e => updateChecklistItem(item.id, "required", e.target.checked)}
                      className="accent-primary"
                    />
                    Obligatorio
                  </label>
                  <button
                    onClick={() => removeChecklistItem(item.id)}
                    className="text-slate-300 hover:text-red-500 transition-colors flex-shrink-0 text-lg leading-none"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                onClick={addChecklistItem}
                className="w-full py-2.5 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-400 hover:border-primary hover:text-primary transition-colors font-medium"
              >
                + Agregar ítem
              </button>
            </div>
          )}

          {/* === SURVEY TAB === */}
          {tab === "survey" && (
            <div className="space-y-3">
              {surveyQuestions.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">Sin preguntas aún.</p>
              )}
              {surveyQuestions.map((q, idx) => (
                <div key={q.id} className="flex items-start gap-2 p-3 border border-slate-100 rounded-xl">
                  <span className="text-xs text-slate-300 font-bold w-5 text-center flex-shrink-0 pt-2">{idx + 1}</span>
                  <div className="flex-1 space-y-2">
                    <input
                      type="text"
                      value={q.label}
                      onChange={e => updateSurveyQuestion(q.id, "label", e.target.value)}
                      placeholder="Texto de la pregunta..."
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                    <select
                      value={q.type}
                      onChange={e => updateSurveyQuestion(q.id, "type", e.target.value)}
                      className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white"
                    >
                      {QUESTION_TYPES.map(qt => (
                        <option key={qt.value} value={qt.value}>{qt.label}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={() => removeSurveyQuestion(q.id)}
                    className="text-slate-300 hover:text-red-500 transition-colors flex-shrink-0 text-lg leading-none pt-1.5"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                onClick={addSurveyQuestion}
                className="w-full py-2.5 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-400 hover:border-primary hover:text-primary transition-colors font-medium"
              >
                + Agregar pregunta
              </button>
            </div>
          )}

          {/* === ALERTS TAB === */}
          {tab === "alerts" && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Responsable</label>
                <select
                  value={responsibleId}
                  onChange={e => setResponsibleId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white"
                >
                  <option value="">Sin responsable asignado</option>
                  {collaborators.map(c => (
                    <option key={c.id} value={c.id}>{c.name}{c.position ? ` — ${c.position}` : ""}</option>
                  ))}
                </select>
              </div>

              {collaborators.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Notificar a</label>
                  <div className="space-y-2 max-h-40 overflow-y-auto border border-slate-200 rounded-xl p-3">
                    {collaborators.map(c => (
                      <label key={c.id} className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={notifyIds.includes(c.id)}
                          onChange={e => {
                            setNotifyIds(prev =>
                              e.target.checked ? [...prev, c.id] : prev.filter(id => id !== c.id)
                            );
                          }}
                          className="accent-primary w-4 h-4"
                        />
                        <span className="text-sm text-slate-700">{c.name}</span>
                        {c.email && <span className="text-xs text-slate-400">{c.email}</span>}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Correo de notificaciones</label>
                <input
                  type="email"
                  value={alertEmail}
                  onChange={e => setAlertEmail(e.target.value)}
                  placeholder="tu@email.com"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Umbral de puntuación de satisfacción (NPS): alertar si es menor a <span className="text-primary font-bold">{npsThreshold}</span>
                </label>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={npsThreshold}
                  onChange={e => setNpsThreshold(Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-[11px] text-slate-400 mt-1">
                  <span>1 (solo críticos)</span>
                  <span>10 (todos)</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Alertar si no hay escaneo en <span className="text-primary font-bold">{overdueMinutes}</span> minutos
                  {overdueMinutes === 0 && <span className="text-slate-400 font-normal"> (desactivado)</span>}
                </label>
                <input
                  type="number"
                  min={0}
                  value={overdueMinutes}
                  onChange={e => setOverdueMinutes(Number(e.target.value))}
                  placeholder="0 = desactivado"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
            </div>
          )}

          {/* === MARCA TAB === */}
          {tab === "marca" && (
            <div className="space-y-5">
              <p className="text-sm text-slate-500">
                Personaliza cómo se ve la página pública de este punto de control cuando alguien escanea el QR.
              </p>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Color de marca</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={brandColor}
                    onChange={e => setBrandColor(e.target.value)}
                    className="h-10 w-16 rounded-lg border border-slate-200 cursor-pointer"
                  />
                  <span className="text-sm font-mono text-slate-600">{brandColor}</span>
                  <div
                    className="w-24 h-10 rounded-lg flex items-center justify-center text-white text-xs font-semibold"
                    style={{ background: brandColor }}
                  >
                    Vista previa
                  </div>
                </div>
              </div>

              <ImageUpload
                label="Logotipo (opcional)"
                hint="JPG, PNG, WebP o SVG. Máx 2MB."
                value={brandLogo}
                onChange={setBrandLogo}
                maxSizeMB={2}
              />

              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <p className="text-xs font-semibold text-slate-500 mb-3">Vista previa de la landing pública</p>
                <TraceLandingPreview point={{
                  name,
                  area,
                  qr_type: qrType,
                  brand_color: brandColor,
                  brand_logo: brandLogo,
                  checklist_items: checklistItems,
                  survey_questions: surveyQuestions,
                }} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors font-medium"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-primary text-white rounded-xl font-semibold text-sm hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear punto"}
          </button>
        </div>
      </div>
    </div>
  );
}
