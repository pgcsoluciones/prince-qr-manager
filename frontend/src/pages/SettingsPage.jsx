import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../utils/api.js";
import { toast } from "../components/Toast.jsx";
import ImageUpload from "../components/ImageUpload.jsx";
import PageHeader from "../components/PageHeader.jsx";

const TABS = ["Empresa", "General", "Notificaciones", "Agente IA", "Integraciones", "Peligroso"];

const LLM_PROVIDERS = [
  { id: "anthropic",  label: "Anthropic",  placeholder: "claude-sonnet-4-6" },
  { id: "openai",     label: "OpenAI",     placeholder: "gpt-4o" },
  { id: "google",     label: "Google AI",  placeholder: "gemini-1.5-pro" },
  { id: "cloudflare", label: "Cloudflare", placeholder: "@cf/meta/llama-3.1-8b-instruct" },
];

const DEFAULT_PROMPT = `Eres Codi, el asistente inteligente de Intap Code, una plataforma SaaS de códigos QR dinámicos. Vives dentro del dashboard como un chat flotante y tu misión es ayudar a los usuarios a sacar el máximo provecho de la plataforma.

Tu tono es amigable, directo y profesional. Respondes siempre en el idioma del usuario. Nunca inventes funciones que no existen ni prometas soporte técnico avanzado.

Puedes ayudar con: crear y gestionar QRs dinámicos, módulo Trace (formularios de rastreo), analíticas, proyectos, bulk upload (Pro+) y elección de plan. Cuando el usuario necesite una función de un plan superior, sugiérelo de forma natural.

Formato de respuestas:
- Preguntas simples: máximo 3-4 pasos cortos
- Guías: numeradas, una acción por paso
- Análisis Trace: resumen + patrón + recomendación concreta
- Termina siempre con "¿Hay algo más en lo que pueda ayudarte?" o "¿Pudiste completarlo?"`;


const TIMEZONES = [
  "America/Mexico_City", "America/Bogota", "America/Lima", "America/Buenos_Aires",
  "America/Santiago", "America/Caracas", "Europe/Madrid", "UTC",
];

const LANGUAGES = [{ value: "es", label: "Español" }, { value: "en", label: "English" }];

export default function SettingsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("General");
  const [settings, setSettings]   = useState({});
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  // Forms per tab
  const [generalForm, setGeneral]   = useState({ company_name: "", timezone: "UTC", language: "es", logo_url: "" });
  const [notifForm, setNotif]       = useState({ alert_email: "", whatsapp: "", weekly_report: false });
  const [integForm, setInteg]       = useState({ webhook_url: "", api_key: "" });
  const [aiForm, setAiForm]         = useState({ llm_provider: "anthropic", llm_model: "", llm_api_key: "", system_prompt: DEFAULT_PROMPT, weekly_report_enabled: true, max_tokens: 1000, knowledge_base: "" });
  const [modelCache, setModelCache] = useState({});
  const [fetchingModels, setFetchingModels] = useState(false);
  const [empresaForm, setEmpresa]   = useState({ company_name: "", company_address: "", company_phone: "", company_email: "", company_logo: "", brand_color: "#2563eb", cover_image: "", cover_message: "¡Gracias por tu visita!" });

  // Auto-load models when Agente IA tab is active
  useEffect(() => {
    if (activeTab === "Agente IA" && aiForm.llm_provider) {
      fetchModels(aiForm.llm_provider);
    }
  }, [activeTab, aiForm.llm_provider]); // eslint-disable-line

  useEffect(() => {
    (async () => {
      try {
        const [settingsRes, aiRes] = await Promise.all([
          api.get("/api/settings"),
          api.get("/api/trace/crm/contacts").catch(() => null), // reuse auth check
        ]);
        // Load AI config for the tenant
        api.get("/api/admin/tenants/me/ai-config").catch(() =>
          fetch(`${import.meta.env.VITE_API_URL || "https://api.code.intaprd.com"}/api/trace/crm/contacts`, {
            headers: { Authorization: `Bearer ${localStorage.getItem("qr_token")}` }
          }).catch(() => null)
        );
        // Try to load own AI config via a generic approach
        try {
          const aiCfg = await fetch(`${import.meta.env.VITE_API_URL || "https://api.code.intaprd.com"}/api/settings/ai`, {
            headers: { Authorization: `Bearer ${localStorage.getItem("qr_token")}` }
          }).then(r => r.ok ? r.json() : null).catch(() => null);
          if (aiCfg?.config) {
            setAiForm(f => ({
              ...f,
              llm_provider: aiCfg.config.llm_provider || "anthropic",
              llm_model: aiCfg.config.llm_model || "",
              system_prompt: aiCfg.config.system_prompt || DEFAULT_PROMPT,
              weekly_report_enabled: aiCfg.config.weekly_report_enabled !== 0,
              max_tokens: aiCfg.config.max_tokens || 1000,
              knowledge_base: aiCfg.config.knowledge_base || "",
            }));
          }
        } catch (_) {}
        const data = settingsRes;
        const s = data.settings || {};
        // Load empresa/profile
        try {
          const profileRes = await fetch(`${import.meta.env.VITE_API_URL || "https://api.code.intaprd.com"}/api/settings/profile`, {
            headers: { Authorization: `Bearer ${localStorage.getItem("qr_token")}` }
          }).then(r => r.ok ? r.json() : null).catch(() => null);
          if (profileRes?.profile) {
            const p = profileRes.profile;
            setEmpresa(f => ({ ...f, ...p }));
          }
        } catch (_) {}
        setSettings(s);
        setGeneral({
          company_name: s.company_name || "",
          timezone:     s.timezone     || "UTC",
          language:     s.language     || "es",
          logo_url:     s.logo_url     || "",
        });
        setNotif({
          alert_email:   s.alert_email   || user?.email || "",
          whatsapp:      s.whatsapp      || "",
          weekly_report: !!s.weekly_report,
        });
        setInteg({
          webhook_url: s.webhook_url || "",
          api_key:     s.api_key     || crypto.randomUUID?.() || "sk-" + Math.random().toString(36).slice(2),
        });
      } catch (e) { toast(e.message, "error"); }
      finally { setLoading(false); }
    })();
  }, [user]);

  const save = async (patch) => {
    setSaving(true);
    try {
      await api.put("/api/settings", patch);
      toast("Guardado correctamente");
    } catch (e) { toast(e.message, "error"); }
    finally { setSaving(false); }
  };

  const testWebhook = async () => {
    if (!integForm.webhook_url) { toast("Ingresa una URL de webhook", "error"); return; }
    try {
      await fetch(integForm.webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "test", source: "intap-qr", timestamp: new Date().toISOString() }),
      });
      toast("Webhook enviado");
    } catch (e) { toast("Error enviando webhook: " + e.message, "error"); }
  };

  const regenerateKey = () => {
    const newKey = "sk-" + crypto.randomUUID?.().replace(/-/g, "") || Math.random().toString(36).slice(2);
    setInteg(f => ({ ...f, api_key: newKey }));
    save({ api_key: newKey });
  };

  const deleteAccount = () => {
    if (deleteConfirm !== generalForm.company_name) {
      toast("El nombre de empresa no coincide", "error");
      return;
    }
    toast("Esta función requiere confirmación adicional por seguridad.", "warning");
  };

  const fetchModels = async (provider) => {
    if (modelCache[provider] !== undefined || fetchingModels) return;
    setFetchingModels(true);
    try {
      const data = await api.get(`/api/ai/models?provider=${provider}`);
      setModelCache(prev => ({ ...prev, [provider]: data.ok ? (data.models || []) : [] }));
    } catch {
      setModelCache(prev => ({ ...prev, [provider]: [] }));
    } finally {
      setFetchingModels(false);
    }
  };

  if (loading) return <div className="p-8 text-slate-400 text-sm">Cargando...</div>;

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <PageHeader title="Configuración" description="Personaliza tu cuenta, notificaciones e integraciones" />

      {/* Tabs */}
      <div className="flex gap-1 border-b mb-6 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === t ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Empresa */}
      {activeTab === "Empresa" && (
        <div className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Nombre de empresa</label>
            <input className="input" value={empresaForm.company_name} onChange={e => setEmpresa(f => ({ ...f, company_name: e.target.value }))} placeholder="Mi empresa" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Dirección</label>
            <input className="input" value={empresaForm.company_address} onChange={e => setEmpresa(f => ({ ...f, company_address: e.target.value }))} placeholder="Calle, ciudad, país" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Teléfono</label>
              <input className="input" type="tel" value={empresaForm.company_phone} onChange={e => setEmpresa(f => ({ ...f, company_phone: e.target.value }))} placeholder="+52 55 0000 0000" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Correo de contacto</label>
              <input className="input" type="email" value={empresaForm.company_email} onChange={e => setEmpresa(f => ({ ...f, company_email: e.target.value }))} placeholder="contacto@empresa.com" />
            </div>
          </div>
          <ImageUpload
            label="Logo de empresa"
            hint="JPG, PNG, WebP o SVG. Máx 2MB. Aparece en formularios TRACE públicos."
            value={empresaForm.company_logo}
            onChange={url => setEmpresa(f => ({ ...f, company_logo: url }))}
            maxSizeMB={2}
          />
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Color de marca</label>
            <div className="flex items-center gap-3">
              <input type="color" value={empresaForm.brand_color} onChange={e => setEmpresa(f => ({ ...f, brand_color: e.target.value }))} className="h-10 w-16 rounded border border-slate-200 cursor-pointer" />
              <input className="input flex-1 font-mono text-xs" value={empresaForm.brand_color} onChange={e => setEmpresa(f => ({ ...f, brand_color: e.target.value }))} placeholder="#2563eb" />
            </div>
          </div>
          <ImageUpload
            label="Imagen de portada para landings"
            hint="Se muestra como fondo al cerrar un formulario TRACE. Recomendado: 1280x720px."
            value={empresaForm.cover_image}
            onChange={url => setEmpresa(f => ({ ...f, cover_image: url }))}
            maxSizeMB={5}
          />
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Mensaje de portada</label>
            <textarea className="input" rows={2} value={empresaForm.cover_message} onChange={e => setEmpresa(f => ({ ...f, cover_message: e.target.value }))} placeholder="¡Gracias por tu visita!" />
          </div>
          <button onClick={async () => {
            setSaving(true);
            try {
              await fetch(`${import.meta.env.VITE_API_URL || "https://api.code.intaprd.com"}/api/settings/profile`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("qr_token")}` },
                body: JSON.stringify(empresaForm),
              });
              toast("Perfil de empresa guardado");
            } catch (e) { toast(e.message, "error"); }
            finally { setSaving(false); }
          }} disabled={saving} className="btn-primary">
            {saving ? "Guardando..." : "Guardar perfil de empresa"}
          </button>
        </div>
      )}

      {/* General */}
      {activeTab === "General" && (
        <div className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Nombre de empresa</label>
            <input className="input" value={generalForm.company_name} onChange={(e) => setGeneral({ ...generalForm, company_name: e.target.value })} placeholder="Mi empresa" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Zona horaria</label>
            <select className="input" value={generalForm.timezone} onChange={(e) => setGeneral({ ...generalForm, timezone: e.target.value })}>
              {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Idioma</label>
            <select className="input" value={generalForm.language} onChange={(e) => setGeneral({ ...generalForm, language: e.target.value })}>
              {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
          <div>
            <ImageUpload
              label="Logotipo de la empresa"
              hint="JPG, PNG, WebP o SVG. Máx 2MB."
              value={generalForm.logo_url}
              onChange={(url) => setGeneral({ ...generalForm, logo_url: url })}
              maxSizeMB={2}
            />
          </div>
          <button onClick={() => save(generalForm)} disabled={saving} className="btn-primary">
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      )}

      {/* Notificaciones */}
      {activeTab === "Notificaciones" && (
        <div className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Email para alertas</label>
            <input type="email" className="input" value={notifForm.alert_email} onChange={(e) => setNotif({ ...notifForm, alert_email: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Número WhatsApp</label>
            <input type="tel" className="input" placeholder="+52 55 0000 0000" value={notifForm.whatsapp} onChange={(e) => setNotif({ ...notifForm, whatsapp: e.target.value })} />
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 rounded" checked={notifForm.weekly_report} onChange={(e) => setNotif({ ...notifForm, weekly_report: e.target.checked })} />
            <span className="text-sm text-slate-700">Recibir reporte semanal por email</span>
          </label>
          <button onClick={() => save(notifForm)} disabled={saving} className="btn-primary">
            {saving ? "Guardando..." : "Guardar preferencias"}
          </button>
        </div>
      )}

      {/* Agente IA */}
      {activeTab === "Agente IA" && (
        <div className="space-y-6">
          {/* Info banner */}
          <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl flex gap-3">
            <span className="text-2xl">🤖</span>
            <div>
              <p className="font-semibold text-blue-800 text-sm">Codi — Tu asistente de Intap Code</p>
              <p className="text-blue-700 text-xs mt-0.5">El agente IA está configurado y administrado por Intap Code según tu plan. Está activo en el chat flotante del dashboard.</p>
            </div>
          </div>

          {/* Plan info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500 mb-1">Plan IA activo</p>
              <p className="font-semibold text-slate-800 capitalize">{user?.plan || "free"}</p>
            </div>
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500 mb-1">Rubro asignado</p>
              <p className="font-semibold text-slate-800 capitalize">{user?.rubro || "General"}</p>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            El modelo, prompt y comportamiento de Codi son administrados por el equipo de Intap Code para garantizar calidad y control de costos. Si necesitas ajustes específicos para tu negocio, contáctanos.
          </div>

          {/* Weekly report toggle — único control que el tenant puede tocar */}
          <label className="flex items-center gap-3 cursor-pointer p-4 rounded-xl border border-slate-200 hover:bg-slate-50">
            <input type="checkbox" className="w-4 h-4" checked={aiForm.weekly_report_enabled}
              onChange={e => setAiForm(f => ({ ...f, weekly_report_enabled: e.target.checked }))} />
            <div>
              <p className="text-sm font-medium text-slate-700">Reporte semanal automático</p>
              <p className="text-xs text-slate-400">Cada lunes recibirás un análisis generado por Codi con recomendaciones para tu negocio.</p>
            </div>
          </label>

          <button onClick={async () => {
            setSaving(true);
            try {
              await fetch(`${import.meta.env.VITE_API_URL || "https://api.code.intaprd.com"}/api/settings/ai`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("qr_token")}` },
                body: JSON.stringify({ weekly_report_enabled: aiForm.weekly_report_enabled }),
              });
              toast("Preferencia guardada");
            } catch (e) { toast(e.message, "error"); }
            finally { setSaving(false); }
          }} disabled={saving} className="btn-primary w-fit">
            {saving ? "Guardando..." : "Guardar preferencia"}
          </button>
        </div>
      )}


      {/* Integraciones */}
      {activeTab === "Integraciones" && (
        <div className="space-y-5">
          {["pro","enterprise"].includes(user?.plan) || user?.role === "superadmin" ? (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">URL de notificación externa</label>
              <div className="flex gap-2">
                <input className="input flex-1" placeholder="https://tu-servidor.com/webhook" value={integForm.webhook_url} onChange={(e) => setInteg({ ...integForm, webhook_url: e.target.value })} />
                <button onClick={testWebhook} className="btn-secondary whitespace-nowrap">Probar</button>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-sm text-amber-800 font-medium">Notificaciones externas disponibles en plan Pro+</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">API Key</label>
            <div className="flex gap-2">
              <input className="input flex-1 font-mono text-xs" value={integForm.api_key} readOnly />
              <button onClick={regenerateKey} className="btn-secondary whitespace-nowrap">Regenerar</button>
            </div>
            <p className="text-xs text-slate-400 mt-1">Guarda tu API key en un lugar seguro. No la compartas.</p>
          </div>

          <button onClick={() => save({ webhook_url: integForm.webhook_url })} disabled={saving} className="btn-primary">
            {saving ? "Guardando..." : "Guardar integraciones"}
          </button>
        </div>
      )}

      {/* Peligroso */}
      {activeTab === "Peligroso" && (
        <div className="space-y-5">
          <div className="p-5 border-2 border-red-200 rounded-xl bg-red-50">
            <h3 className="font-semibold text-red-800 mb-2">Eliminar cuenta</h3>
            <p className="text-sm text-red-700 mb-4">Esta acción es permanente e irreversible. Se eliminarán todos tus QRs, enlaces y datos.</p>
            <div className="mb-3">
              <label className="block text-xs font-medium text-red-700 mb-1">
                Escribe el nombre de tu empresa para confirmar: <strong>{generalForm.company_name || "(sin nombre)"}</strong>
              </label>
              <input
                className="input border-red-300 focus:border-red-500"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="Nombre de empresa..."
              />
            </div>
            <button
              onClick={deleteAccount}
              className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors"
            >
              Eliminar cuenta permanentemente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
