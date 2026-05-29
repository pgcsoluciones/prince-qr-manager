import { useState, useEffect } from "react";
import { api } from "../utils/api.js";
import { toast } from "./Toast.jsx";

const CHANNEL_DEFS = [
  { type: "email",    icon: "📧", label: "Correo electrónico", placeholder: "tu@empresa.com",          configKey: "email" },
  { type: "whatsapp", icon: "💬", label: "WhatsApp",           placeholder: "+52 55 0000 0000",         configKey: "phone" },
  { type: "slack",    icon: "🔗", label: "Slack",              placeholder: "Webhook URL de Slack",     configKey: "webhook_url" },
  { type: "webhook",  icon: "🔌", label: "Webhook personalizado", placeholder: "https://tu-servidor.com/hook", configKey: "webhook_url" },
];

function ChannelRow({ def, channel, onSave, onTest, onDelete }) {
  const [value, setValue] = useState(channel?.config?.[def.configKey] || "");
  const [isActive, setIsActive] = useState(channel?.is_active ?? false);
  const [testing, setTesting] = useState(false);

  async function handleTest() {
    if (!channel) { toast.error("Guarda primero el canal antes de probarlo"); return; }
    setTesting(true);
    try {
      await api.post(`/api/trace/channels/${channel.id}/test`);
      toast.success("Notificación de prueba enviada");
    } catch (e) { toast.error(e.message); }
    finally { setTesting(false); }
  }

  return (
    <div className="flex items-center gap-3 py-3 border-b border-slate-100 last:border-0 flex-wrap">
      <span className="text-xl flex-shrink-0" title={def.label}>{def.icon}</span>
      <span className="text-sm font-medium text-slate-700 w-36 flex-shrink-0">{def.label}</span>
      <input
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder={def.placeholder}
        className="flex-1 min-w-40 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
      />
      <button
        onClick={() => onSave(def, value, isActive)}
        data-tooltip={`Guardar canal de ${def.label}`}
        className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors"
      >
        Guardar
      </button>
      {channel && (
        <>
          <button
            onClick={handleTest}
            disabled={testing}
            data-tooltip={`Probar notificación de ${def.label}`}
            className="px-3 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-200 transition-colors disabled:opacity-50"
          >
            {testing ? "Enviando..." : "Probar"}
          </button>
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${channel.is_active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
            {channel.is_active ? "Activo" : "Inactivo"}
          </span>
        </>
      )}
    </div>
  );
}

export default function TraceConfigTab() {
  const [channels, setChannels] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [brandColor, setBrandColor] = useState("#2563eb");
  const [brandLogo, setBrandLogo] = useState("");
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  async function loadChannels() {
    try {
      const d = await api.get("/api/trace/channels");
      setChannels(d.channels || []);
    } catch (_) {}
    finally { setLoadingChannels(false); }
  }

  async function loadTemplates() {
    try {
      const d = await api.get("/api/trace/templates");
      setTemplates((d.templates || []).filter(t => !t.is_public));
    } catch (_) {}
    finally { setLoadingTemplates(false); }
  }

  useEffect(() => { loadChannels(); loadTemplates(); }, []);

  async function handleSaveChannel(def, value, isActive) {
    if (!value.trim()) { toast.error("Ingresa el valor del canal"); return; }
    const existing = channels.find(c => c.channel_type === def.type);
    try {
      if (existing) {
        await api.delete(`/api/trace/channels/${existing.id}`);
      }
      await api.post("/api/trace/channels", {
        channel_type: def.type,
        config: { [def.configKey]: value.trim() },
        label: def.label,
      });
      toast.success(`Canal de ${def.label} guardado`);
      loadChannels();
    } catch (e) { toast.error(e.message); }
  }

  async function handleDeleteTemplate(id) {
    if (!confirm("¿Eliminar esta plantilla?")) return;
    try {
      await api.delete(`/api/trace/templates/${id}`);
      setTemplates(prev => prev.filter(t => t.id !== id));
      toast.success("Plantilla eliminada");
    } catch (e) { toast.error(e.message); }
  }

  return (
    <div className="p-5 space-y-8 max-w-2xl">

      {/* Section: Notification channels */}
      <section>
        <h2 className="text-base font-bold text-slate-900 mb-1">Canales de notificación activos</h2>
        <p className="text-sm text-slate-500 mb-4">
          Configura dónde recibirás los avisos automáticos cuando algo no se cumpla en tus puntos de control
        </p>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4">
          {loadingChannels ? (
            <div className="space-y-3 py-4">{[1,2,3,4].map(i => <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />)}</div>
          ) : (
            CHANNEL_DEFS.map(def => {
              const channel = channels.find(c => c.channel_type === def.type);
              return (
                <ChannelRow
                  key={def.type}
                  def={def}
                  channel={channel}
                  onSave={handleSaveChannel}
                  onTest={() => {}}
                  onDelete={() => {}}
                />
              );
            })
          )}
        </div>
      </section>

      {/* Section: Corporate branding */}
      <section>
        <h2 className="text-base font-bold text-slate-900 mb-1">Marca corporativa</h2>
        <p className="text-sm text-slate-500 mb-4">
          Personaliza el color y logotipo que aparecerán en las páginas públicas de tus QRs de control
        </p>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4">
          <div className="flex items-center gap-4">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Color de marca</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={brandColor}
                  onChange={e => setBrandColor(e.target.value)}
                  className="h-9 w-14 rounded border border-slate-200 cursor-pointer"
                />
                <span className="text-sm font-mono text-slate-600">{brandColor}</span>
              </div>
            </div>
            <div
              className="w-16 h-16 rounded-xl flex-shrink-0 flex items-center justify-center text-white font-bold text-sm shadow-sm"
              style={{ background: brandColor }}
            >
              Vista previa
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">URL del logotipo</label>
            <input
              type="url"
              value={brandLogo}
              onChange={e => setBrandLogo(e.target.value)}
              placeholder="https://tu-empresa.com/logo.png"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
            />
            {brandLogo && (
              <img src={brandLogo} alt="Vista previa del logo" className="h-10 mt-2 object-contain" onError={e => e.target.style.display = "none"} />
            )}
          </div>

          <p className="text-xs text-slate-400">
            Nota: El color y logo configurados aquí se aplican globalmente. Para personalizar punto por punto, usa la sección "Marca" dentro de cada punto de control.
          </p>
        </div>
      </section>

      {/* Section: Saved templates */}
      <section>
        <h2 className="text-base font-bold text-slate-900 mb-1">Plantillas guardadas</h2>
        <p className="text-sm text-slate-500 mb-4">
          Tus plantillas personalizadas de checklists y encuestas para reutilizar en nuevos puntos
        </p>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          {loadingTemplates ? (
            <div className="p-4 space-y-2">{[1,2].map(i => <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />)}</div>
          ) : templates.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-sm text-slate-400">Sin plantillas personalizadas aún.</p>
              <p className="text-xs text-slate-400 mt-1">Crea un punto de control y guárdalo como plantilla para reutilizarlo.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {templates.map(t => (
                <div key={t.id} className="flex items-center justify-between px-4 py-3 gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{t.name}</p>
                    {t.industry && <p className="text-xs text-slate-400">{t.industry}</p>}
                  </div>
                  <button
                    onClick={() => handleDeleteTemplate(t.id)}
                    data-tooltip="Eliminar plantilla"
                    className="text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors"
                  >
                    Eliminar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
