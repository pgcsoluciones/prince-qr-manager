import { useState, useEffect, useCallback } from "react";
import { api } from "../../utils/api.js";
import { toast } from "../../components/Toast.jsx";

// ─── Plan visual metadata ─────────────────────────────────────────────────────
const PLAN_META = {
  free:       { color: "bg-slate-100 text-slate-700",   border: "border-slate-200", label: "Free"       },
  starter:    { color: "bg-blue-100 text-blue-700",     border: "border-blue-200",  label: "Starter"    },
  pro:        { color: "bg-purple-100 text-purple-700", border: "border-purple-200",label: "Pro"        },
  enterprise: { color: "bg-amber-100 text-amber-700",   border: "border-amber-200", label: "Enterprise" },
};

// ─── Feature labels in Spanish ────────────────────────────────────────────────
const FEATURE_LABELS = {
  qr_dinamico:                  "Códigos QR dinámicos (editables)",
  qr_tipos:                     "Tipos de QR: URL, WhatsApp, Email, WiFi, vCard, PDF",
  qr_personalizacion_visual:    "Personalización visual del QR (colores, formas, logo)",
  qr_descarga_png:              "Descarga en formato PNG",
  qr_descarga_svg:              "Descarga en formato SVG",
  qr_descarga_pdf:              "Descarga en formato PDF",
  analytics_basico:             "Estadísticas básicas (total de escaneos)",
  analytics_avanzado:           "Estadísticas avanzadas (ubicación, dispositivo, hora)",
  analytics_exportar:           "Exportar estadísticas a CSV",
  bulk_import_csv:              "Importación masiva desde archivo CSV",
  proyectos:                    "Organizar QRs en proyectos o carpetas",
  acortador_url:                "Acortador de URLs",
  trace_module:                 "Módulo TRACE (control de operaciones físicas)",
  trace_checklist:              "TRACE: listas de verificación por punto de control",
  trace_encuesta_nps:           "TRACE: encuestas de satisfacción del cliente",
  trace_crm:                    "TRACE: gestión de contactos de clientes (CRM)",
  trace_automatizaciones:       "TRACE: avisos automáticos cuando no se cumple una tarea",
  trace_plantillas_personalizadas: "TRACE: crear y guardar plantillas propias",
  trace_marca_corporativa:      "TRACE: personalizar con logo y colores de tu empresa",
  trace_proyectos:              "TRACE: organizar puntos de control en proyectos",
  notificaciones_email:         "Notificaciones por correo electrónico",
  notificaciones_whatsapp:      "Notificaciones por WhatsApp",
  notificaciones_slack:         "Notificaciones por Slack",
  reportes_semanales_ia:        "Reporte semanal automático generado por Inteligencia Artificial",
  agente_ia_personalizable:     "Agente IA con personalidad y tono personalizable",
  multi_llm:                    "Elegir entre múltiples modelos de IA (Claude, GPT, Gemini, Groq)",
  equipo_usuarios:              "Agregar miembros al equipo",
  roles_equipo:                 "Roles y permisos diferenciados por usuario",
  api_acceso:                   "Acceso a la API para integraciones propias",
  webhook:                      "Notificaciones automáticas a sistemas externos (Webhook)",
  dominio_personalizado:        "Dominio personalizado para tus QRs",
  white_label:                  "Marca blanca (sin logo de Intap Code)",
  soporte_prioritario:          "Soporte técnico prioritario",
  onboarding_dedicado:          "Sesión de configuración inicial con el equipo de Intap",
};

// ─── Feature groups ───────────────────────────────────────────────────────────
const FEATURE_GROUPS = [
  {
    label: "Códigos QR",
    icon: "🔷",
    keys: ["qr_dinamico","qr_tipos","qr_personalizacion_visual","qr_descarga_png","qr_descarga_svg","qr_descarga_pdf"],
  },
  {
    label: "Estadísticas y reportes",
    icon: "📊",
    keys: ["analytics_basico","analytics_avanzado","analytics_exportar"],
  },
  {
    label: "Herramientas adicionales",
    icon: "🔗",
    keys: ["bulk_import_csv","proyectos","acortador_url"],
  },
  {
    label: "Módulo TRACE",
    icon: "🎯",
    keys: ["trace_module","trace_checklist","trace_encuesta_nps","trace_crm","trace_automatizaciones","trace_plantillas_personalizadas","trace_marca_corporativa","trace_proyectos"],
  },
  {
    label: "Notificaciones",
    icon: "🔔",
    keys: ["notificaciones_email","notificaciones_whatsapp","notificaciones_slack"],
  },
  {
    label: "Inteligencia Artificial",
    icon: "🤖",
    keys: ["reportes_semanales_ia","agente_ia_personalizable","multi_llm"],
  },
  {
    label: "Equipo y colaboración",
    icon: "👥",
    keys: ["equipo_usuarios","roles_equipo"],
  },
  {
    label: "Integraciones y avanzado",
    icon: "🔧",
    keys: ["api_acceso","webhook","dominio_personalizado","white_label"],
  },
  {
    label: "Soporte y servicio",
    icon: "🏆",
    keys: ["soporte_prioritario","onboarding_dedicado"],
  },
];

// ─── Default empty features object ───────────────────────────────────────────
const DEFAULT_FEATURES = {
  qr_dinamico: false,
  qr_tipos: false,
  qr_personalizacion_visual: false,
  qr_descarga_png: false,
  qr_descarga_svg: false,
  qr_descarga_pdf: false,
  analytics_basico: false,
  analytics_avanzado: false,
  analytics_exportar: false,
  bulk_import_csv: false,
  proyectos: false,
  acortador_url: false,
  trace_module: false,
  trace_checklist: false,
  trace_encuesta_nps: false,
  trace_crm: false,
  trace_automatizaciones: false,
  trace_plantillas_personalizadas: false,
  trace_marca_corporativa: false,
  trace_proyectos: false,
  notificaciones_email: false,
  notificaciones_whatsapp: false,
  notificaciones_slack: false,
  reportes_semanales_ia: false,
  agente_ia_personalizable: false,
  multi_llm: false,
  equipo_usuarios: false,
  roles_equipo: false,
  api_acceso: false,
  webhook: false,
  dominio_personalizado: false,
  white_label: false,
  soporte_prioritario: false,
  onboarding_dedicado: false,
};

const ALL_CYCLES = [
  { key: "monthly",    label: "Mensual" },
  { key: "quarterly",  label: "Trimestral" },
  { key: "semiannual", label: "Semestral" },
  { key: "annual",     label: "Anual" },
];

function calcPrice(monthly, months, discountPct) {
  const base = parseFloat(monthly) || 0;
  const disc = parseFloat(discountPct) || 0;
  return (base * months * (1 - disc / 100)).toFixed(2);
}

function parseFeatures(raw) {
  if (!raw) return { ...DEFAULT_FEATURES };
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return { ...DEFAULT_FEATURES, ...parsed };
  } catch { return { ...DEFAULT_FEATURES }; }
}

function parseCycles(raw) {
  if (!raw) return ["monthly", "quarterly", "semiannual", "annual"];
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch { return ["monthly", "quarterly", "semiannual", "annual"]; }
}

// ─── PlanCard ─────────────────────────────────────────────────────────────────
function PlanCard({ plan, onSave }) {
  const meta = PLAN_META[plan.plan] || { color: "bg-slate-100 text-slate-600", border: "border-slate-200", label: plan.plan };

  const [form, setForm] = useState({
    price_usd:              plan.price_usd ?? 0,
    max_qr:                 plan.max_qr ?? -1,
    max_tenants:            plan.max_tenants ?? 0,
    max_trace_points:       plan.max_trace_points ?? -1,
    trial_days:             plan.trial_days ?? 14,
    quarterly_discount_pct: plan.quarterly_discount_pct ?? 10,
    semiannual_discount_pct:plan.semiannual_discount_pct ?? 15,
    annual_discount_pct:    plan.annual_discount_pct ?? 20,
    billing_cycles:         parseCycles(plan.billing_cycles),
    features:               parseFeatures(plan.features_json),
  });

  const [saving, setSaving]     = useState(false);
  const [success, setSuccess]   = useState(false);
  const [expanded, setExpanded] = useState(false);

  const setField = (key, val) => setForm(f => ({ ...f, [key]: val }));
  const setFeature = (key, val) => setForm(f => ({ ...f, features: { ...f.features, [key]: val } }));
  const toggleCycle = (key) => {
    setForm(f => {
      const cycles = f.billing_cycles.includes(key)
        ? f.billing_cycles.filter(c => c !== key)
        : [...f.billing_cycles, key];
      return { ...f, billing_cycles: cycles };
    });
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/api/admin/plans/${plan.plan}`, {
        max_qr:                  parseInt(form.max_qr),
        max_tenants:             parseInt(form.max_tenants),
        has_analytics:           form.features.analytics_basico ? 1 : 0,
        has_bulk:                form.features.bulk_import_csv ? 1 : 0,
        has_custom_domain:       form.features.dominio_personalizado ? 1 : 0,
        price_usd:               parseFloat(form.price_usd),
        billing_cycles:          form.billing_cycles,
        annual_discount_pct:     parseInt(form.annual_discount_pct),
        quarterly_discount_pct:  parseInt(form.quarterly_discount_pct),
        semiannual_discount_pct: parseInt(form.semiannual_discount_pct),
        features_json:           form.features,
        trial_days:              parseInt(form.trial_days),
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
      onSave?.();
      toast(`Plan ${meta.label} guardado correctamente`);
    } catch (e) { toast(e.message, "error"); }
    finally { setSaving(false); }
  };

  const monthly = parseFloat(form.price_usd) || 0;

  return (
    <div className={`card border-2 ${meta.border} p-0 overflow-hidden`}>
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`badge text-sm font-bold px-3 py-1 ${meta.color}`}>{meta.label}</span>
          {success && <span className="text-xs text-green-600 font-semibold">Cambios guardados</span>}
        </div>
        <div className="text-right">
          <span className="text-2xl font-bold text-slate-900">${monthly.toFixed(2)}</span>
          <span className="text-xs text-slate-400 ml-1">USD/mes</span>
        </div>
      </div>

      <form onSubmit={save}>
        <div className="px-6 pb-6 space-y-6">

          {/* ── Precio y descuentos ── */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">Precio y descuentos</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">Precio mensual (USD)</label>
                <input
                  type="number" step="0.01" min={0} className="input"
                  value={form.price_usd}
                  onChange={e => setField("price_usd", e.target.value)}
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">Días de periodo de prueba</label>
                <input
                  type="number" min={0} className="input"
                  value={form.trial_days}
                  onChange={e => setField("trial_days", e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">% Descuento trimestral</label>
                <input
                  type="number" min={0} max={100} className="input"
                  value={form.quarterly_discount_pct}
                  onChange={e => setField("quarterly_discount_pct", e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">% Descuento semestral</label>
                <input
                  type="number" min={0} max={100} className="input"
                  value={form.semiannual_discount_pct}
                  onChange={e => setField("semiannual_discount_pct", e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">% Descuento anual</label>
                <input
                  type="number" min={0} max={100} className="input"
                  value={form.annual_discount_pct}
                  onChange={e => setField("annual_discount_pct", e.target.value)}
                />
              </div>
            </div>

            {/* Precios calculados */}
            {monthly > 0 && (
              <div className="mt-3 rounded-lg bg-slate-50 border border-slate-100 p-3 grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center justify-between col-span-2 sm:col-span-1">
                  <span className="text-slate-500">Trimestral (3 meses)</span>
                  <span className="font-semibold text-slate-700">${calcPrice(monthly, 3, form.quarterly_discount_pct)} USD</span>
                </div>
                <div className="flex items-center justify-between col-span-2 sm:col-span-1">
                  <span className="text-slate-500">Semestral (6 meses)</span>
                  <span className="font-semibold text-slate-700">${calcPrice(monthly, 6, form.semiannual_discount_pct)} USD</span>
                </div>
                <div className="flex items-center justify-between col-span-2">
                  <span className="text-slate-500">Anual (12 meses)</span>
                  <span className="font-semibold text-slate-700">${calcPrice(monthly, 12, form.annual_discount_pct)} USD</span>
                </div>
              </div>
            )}
          </section>

          {/* ── Ciclos de facturación ── */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Ciclos de facturación disponibles</h3>
            <div className="flex flex-wrap gap-2">
              {ALL_CYCLES.map(({ key, label }) => {
                const active = form.billing_cycles.includes(key);
                return (
                  <label
                    key={key}
                    title={`Permitir que los clientes elijan el ciclo ${label.toLowerCase()}`}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border cursor-pointer text-xs font-medium transition-colors
                      ${active ? "bg-primary text-white border-primary" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"}`}
                  >
                    <input
                      type="checkbox" className="sr-only"
                      checked={active}
                      onChange={() => toggleCycle(key)}
                    />
                    {label}
                  </label>
                );
              })}
            </div>
          </section>

          {/* ── Límites ── */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">Límites del plan</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1" title="Usa -1 para sin límite">Máximo de códigos QR (-1 = sin límite)</label>
                <input
                  type="number" className="input"
                  value={form.max_qr}
                  onChange={e => setField("max_qr", e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Máximo usuarios en equipo</label>
                <input
                  type="number" min={0} className="input"
                  value={form.max_tenants}
                  onChange={e => setField("max_tenants", e.target.value)}
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-medium text-gray-600 mb-1" title="Usa -1 para sin límite">Máximo puntos TRACE (-1 = sin límite)</label>
                <input
                  type="number" className="input"
                  value={form.max_trace_points}
                  onChange={e => setField("max_trace_points", e.target.value)}
                />
              </div>
            </div>
          </section>

          {/* ── Funcionalidades ── */}
          <section>
            <button
              type="button"
              className="w-full flex items-center justify-between text-xs font-bold uppercase tracking-wide text-slate-500 mb-2"
              onClick={() => setExpanded(x => !x)}
            >
              <span>Funcionalidades incluidas</span>
              <span className="text-base">{expanded ? "▲" : "▼"}</span>
            </button>

            {expanded && (
              <div className="space-y-4">
                {FEATURE_GROUPS.map(group => (
                  <div key={group.label}>
                    <p className="text-xs font-semibold text-slate-600 mb-2">{group.icon} {group.label}</p>
                    <div className="space-y-1.5 pl-2">
                      {group.keys.map(key => (
                        <label
                          key={key}
                          title={FEATURE_LABELS[key]}
                          className="flex items-start gap-2 cursor-pointer group"
                        >
                          <input
                            type="checkbox"
                            className="w-4 h-4 mt-0.5 rounded text-primary flex-shrink-0"
                            checked={!!form.features[key]}
                            onChange={e => setFeature(key, e.target.checked)}
                          />
                          <span className="text-xs text-gray-700 group-hover:text-gray-900 leading-relaxed">
                            {FEATURE_LABELS[key] || key}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!expanded && (
              <p className="text-xs text-slate-400 italic">
                {Object.values(form.features).filter(Boolean).length} funcionalidades habilitadas — haz clic para ver y editar
              </p>
            )}
          </section>

        </div>

        {/* ── Guardar ── */}
        <div className="px-6 pb-6">
          <button type="submit" disabled={saving} className="btn-primary w-full">
            {saving ? "Guardando..." : `Guardar plan ${meta.label}`}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── BillingCyclesInfo ────────────────────────────────────────────────────────
function BillingCyclesInfo() {
  return (
    <div className="card p-5 mb-6 border border-blue-100 bg-blue-50/60">
      <div className="flex items-start gap-3">
        <span className="text-2xl">💡</span>
        <div>
          <h2 className="text-sm font-bold text-blue-900 mb-1">Ciclos de facturación</h2>
          <p className="text-xs text-blue-700 leading-relaxed">
            Los tenants pueden elegir entre los ciclos de facturación activos al suscribirse a un plan.
            Configura los descuentos por ciclo en cada plan individual. El ciclo anual incentiva la retención
            y reduce la fricción de cobro mensual — se recomienda ofrecer al menos un 15-20% de descuento.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── AdminPlansPage ───────────────────────────────────────────────────────────
export default function AdminPlansPage() {
  const [plans, setPlans]     = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api.get("/api/admin/plans");
      setPlans(data.plans || []);
    } catch (e) { toast(e.message, "error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Configuración de planes</h1>
        <p className="text-sm text-gray-500">
          Define los precios, ciclos de facturación, descuentos, límites y funcionalidades incluidas en cada plan.
        </p>
      </div>

      <BillingCyclesInfo />

      {loading ? (
        <p className="text-gray-400 text-sm text-center py-12">Cargando planes...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          {plans.map(p => <PlanCard key={p.plan} plan={p} onSave={load} />)}
        </div>
      )}
    </div>
  );
}
