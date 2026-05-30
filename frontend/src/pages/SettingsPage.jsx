import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../utils/api.js";
import { toast } from "../components/Toast.jsx";
import ImageUpload from "../components/ImageUpload.jsx";
import PageHeader from "../components/PageHeader.jsx";

const TABS = ["Empresa", "General", "Notificaciones", "Agente IA", "Integraciones", "Peligroso"];

const LLM_OPTIONS = [
  { id: "claude",  label: "Claude (Anthropic)",   desc: "El más capaz. Usa la clave de la plataforma por defecto." },
  { id: "openai",  label: "GPT-4o mini (OpenAI)", desc: "Rápido y económico. Requiere tu propia API key." },
  { id: "gemini",  label: "Gemini Flash (Google)", desc: "Excelente para análisis de texto. Requiere tu propia API key." },
  { id: "groq",    label: "Llama 3.1 (Groq)",     desc: "Ultra rápido y gratuito con cuota generosa." },
];

const DEFAULT_PROMPT = `Eres un asistente de operaciones y calidad llamado "Intap". Ayudas a interpretar métricas, checklists y feedback de clientes.
Siempre respondes en español, de forma clara, directa y accionable.
Cuando das recomendaciones, las basas en los datos reales del negocio.`;

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
  const [aiForm, setAiForm]         = useState({ llm_provider: "claude", llm_api_key: "", system_prompt: DEFAULT_PROMPT, weekly_report_enabled: true });
  const [empresaForm, setEmpresa]   = useState({ company_name: "", company_address: "", company_phone: "", company_email: "", company_logo: "", brand_color: "#2563eb", cover_image: "", cover_message: "¡Gracias por tu visita!" });

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
              llm_provider: aiCfg.config.llm_provider || "claude",
              system_prompt: aiCfg.config.system_prompt || DEFAULT_PROMPT,
              weekly_report_enabled: aiCfg.config.weekly_report_enabled !== 0,
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
        ["pro","enterprise"].includes(user?.plan) || user?.role === "superadmin" ? (
          <div className="space-y-6">
            <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-700">
              Tu agente IA analiza las métricas de TRACE y genera reportes semanales. Puedes personalizarlo para que se adapte a tu negocio.
            </div>

            {/* LLM selector */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-3">Modelo de IA</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {LLM_OPTIONS.map(opt => (
                  <button key={opt.id} onClick={() => setAiForm(f => ({ ...f, llm_provider: opt.id }))}
                    className={`text-left p-3 rounded-xl border-2 transition-all ${
                      aiForm.llm_provider === opt.id ? "border-primary bg-primary/5" : "border-slate-200 hover:border-slate-300"
                    }`}>
                    <p className="font-medium text-sm text-slate-800">{opt.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* API Key propia */}
            {aiForm.llm_provider !== "claude" && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Tu API Key de {aiForm.llm_provider} <span className="text-slate-400">(opcional — si no la pones, usamos la clave de la plataforma)</span>
                </label>
                <input type="password" className="input font-mono" placeholder="sk-..."
                  value={aiForm.llm_api_key}
                  onChange={e => setAiForm(f => ({ ...f, llm_api_key: e.target.value }))} />
              </div>
            )}

            {/* System prompt / personalidad */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Personalidad del agente
              </label>
              <p className="text-xs text-slate-500 mb-2">
                Define cómo se comporta tu agente al generar reportes y responder análisis. Puedes darle un nombre, un tono, y contexto de tu industria.
              </p>
              <textarea rows={6} className="input font-mono text-xs resize-y"
                value={aiForm.system_prompt}
                onChange={e => setAiForm(f => ({ ...f, system_prompt: e.target.value }))} />
              <button onClick={() => setAiForm(f => ({ ...f, system_prompt: DEFAULT_PROMPT }))}
                className="text-xs text-slate-400 hover:text-slate-600 underline mt-1">
                Restaurar por defecto
              </button>
            </div>

            {/* Example prompts */}
            <div>
              <p className="text-xs font-medium text-slate-500 mb-2">Ejemplos de personalización:</p>
              <div className="space-y-2">
                {[
                  { label: "Hotel", text: "Eres un experto en hospitalidad y atención al huésped. Analiza los datos con enfoque en experiencia del cliente y estándares hoteleros." },
                  { label: "Restaurante", text: "Eres un consultor de restaurantes. Prioriza la higiene, la satisfacción del comensal y la eficiencia operativa en cocina." },
                  { label: "Logística", text: "Eres un especialista en última milla y cadena de suministro. Enfócate en tiempos de entrega, incidencias y cumplimiento de SLA." },
                ].map(ex => (
                  <button key={ex.label} onClick={() => setAiForm(f => ({ ...f, system_prompt: ex.text }))}
                    className="w-full text-left p-2.5 rounded-lg border border-slate-200 hover:border-primary hover:bg-primary/5 transition-all">
                    <span className="text-xs font-medium text-slate-600">{ex.label}: </span>
                    <span className="text-xs text-slate-500">{ex.text.slice(0, 80)}...</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Weekly report toggle */}
            <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-slate-200 hover:bg-slate-50">
              <input type="checkbox" className="w-4 h-4" checked={aiForm.weekly_report_enabled}
                onChange={e => setAiForm(f => ({ ...f, weekly_report_enabled: e.target.checked }))} />
              <div>
                <p className="text-sm font-medium text-slate-700">Reporte semanal automático</p>
                <p className="text-xs text-slate-400">Cada lunes recibirás un análisis generado por IA con recomendaciones.</p>
              </div>
            </label>

            <button onClick={async () => {
              setSaving(true);
              try {
                const payload = { ...aiForm };
                if (!payload.llm_api_key) delete payload.llm_api_key;
                await fetch(`${import.meta.env.VITE_API_URL || "https://api.code.intaprd.com"}/api/settings/ai`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("qr_token")}` },
                  body: JSON.stringify(payload),
                });
                toast("Agente IA configurado correctamente");
              } catch (e) { toast(e.message, "error"); }
              finally { setSaving(false); }
            }} disabled={saving} className="btn-primary">
              {saving ? "Guardando..." : "Guardar configuración del agente"}
            </button>
          </div>
        ) : (
          <div className="p-8 text-center">
            <div className="text-4xl mb-3">🤖</div>
            <h3 className="font-semibold text-slate-800 mb-1">Agente IA disponible en plan Pro</h3>
            <p className="text-sm text-slate-500 mb-4">Personaliza tu agente de análisis, elige el modelo de IA y activa reportes semanales automáticos.</p>
            <button className="btn-primary">Actualizar a Pro</button>
          </div>
        )
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
