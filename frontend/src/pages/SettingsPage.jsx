import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../utils/api.js";
import { toast } from "../components/Toast.jsx";

const TABS = ["General", "Notificaciones", "Integraciones", "Peligroso"];

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

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get("/api/settings");
        const s = data.settings || {};
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
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Configuración</h1>

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
            <label className="block text-xs font-medium text-slate-600 mb-1">URL del logotipo</label>
            <input className="input" value={generalForm.logo_url} onChange={(e) => setGeneral({ ...generalForm, logo_url: e.target.value })} placeholder="https://..." />
            {generalForm.logo_url && (
              <div className="mt-2 p-2 border border-slate-200 rounded-lg inline-block">
                <img src={generalForm.logo_url} alt="Logo preview" className="h-12 object-contain" onError={(e) => { e.target.style.display = "none"; }} />
              </div>
            )}
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

      {/* Integraciones */}
      {activeTab === "Integraciones" && (
        <div className="space-y-5">
          {["pro","enterprise"].includes(user?.plan) || user?.role === "superadmin" ? (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">URL del Webhook</label>
              <div className="flex gap-2">
                <input className="input flex-1" placeholder="https://tu-servidor.com/webhook" value={integForm.webhook_url} onChange={(e) => setInteg({ ...integForm, webhook_url: e.target.value })} />
                <button onClick={testWebhook} className="btn-secondary whitespace-nowrap">Probar</button>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-sm text-amber-800 font-medium">Webhooks disponibles en plan Pro+</p>
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
