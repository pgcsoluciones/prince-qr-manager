import { useState, useRef, useEffect } from "react";
import { api } from "../utils/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import QRStyler from "./QRStyler.jsx";
import CampaignConfig from "./CampaignConfig.jsx";
import { toast } from "./Toast.jsx";
import QRCodeStyling from "qr-code-styling";

const WORKER = "https://qr.intaprd.com";

const QR_TYPES = [
  { id: "url",       icon: "🔗", label: "URL / Sitio web" },
  { id: "whatsapp",  icon: "💬", label: "WhatsApp" },
  { id: "instagram", icon: "📷", label: "Instagram" },
  { id: "email",     icon: "📧", label: "Email" },
  { id: "sms",       icon: "💬", label: "SMS" },
  { id: "wifi",      icon: "📶", label: "WiFi" },
  { id: "vcard",     icon: "👤", label: "Contacto vCard" },
  { id: "pdf",       icon: "📄", label: "PDF / Archivo" },
];

function buildUrl(type, fields) {
  switch (type) {
    case "url": case "pdf": return fields.url || "";
    case "whatsapp":  return `https://wa.me/${(fields.phone||"").replace(/\D/g,"")}${fields.message?`?text=${encodeURIComponent(fields.message)}`:""}`;
    case "instagram": return `https://instagram.com/${(fields.username||"").replace("@","")}`;
    case "email":     return `mailto:${fields.email||""}${fields.subject?`?subject=${encodeURIComponent(fields.subject)}`:""}`;
    case "sms":       return `sms:${fields.phone||""}${fields.message?`?body=${encodeURIComponent(fields.message)}`:""}`;
    case "wifi":      return `WIFI:T:${fields.security||"WPA"};S:${fields.ssid||""};P:${fields.password||""};;`;
    case "vcard":     return `BEGIN:VCARD\nVERSION:3.0\nFN:${fields.name||""}\nTEL:${fields.phone||""}\nEMAIL:${fields.email||""}\nORG:${fields.org||""}\nURL:${fields.url||""}\nEND:VCARD`;
    default: return fields.url || "";
  }
}

function TypeFields({ type, fields, onChange }) {
  const f = (key, val) => onChange({ ...fields, [key]: val });
  switch (type) {
    case "url": case "pdf": return (
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">URL destino</label>
        <input type="url" className="input" placeholder="https://..." value={fields.url||""} onChange={e=>f("url",e.target.value)} />
      </div>
    );
    case "whatsapp": return (<div className="space-y-3">
      <div><label className="block text-xs font-medium text-gray-600 mb-1">Teléfono (con código de país)</label>
        <input className="input" placeholder="+18091234567" value={fields.phone||""} onChange={e=>f("phone",e.target.value)} /></div>
      <div><label className="block text-xs font-medium text-gray-600 mb-1">Mensaje pre-llenado (opcional)</label>
        <textarea className="input resize-none" rows={2} value={fields.message||""} onChange={e=>f("message",e.target.value)} /></div>
    </div>);
    case "instagram": return (
      <div><label className="block text-xs font-medium text-gray-600 mb-1">Usuario de Instagram</label>
        <input className="input" placeholder="@usuario" value={fields.username||""} onChange={e=>f("username",e.target.value)} /></div>
    );
    case "email": return (<div className="space-y-3">
      <div><label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
        <input type="email" className="input" placeholder="correo@ejemplo.com" value={fields.email||""} onChange={e=>f("email",e.target.value)} /></div>
      <div><label className="block text-xs font-medium text-gray-600 mb-1">Asunto (opcional)</label>
        <input className="input" placeholder="Consulta..." value={fields.subject||""} onChange={e=>f("subject",e.target.value)} /></div>
    </div>);
    case "sms": return (<div className="space-y-3">
      <div><label className="block text-xs font-medium text-gray-600 mb-1">Teléfono</label>
        <input className="input" placeholder="+18091234567" value={fields.phone||""} onChange={e=>f("phone",e.target.value)} /></div>
      <div><label className="block text-xs font-medium text-gray-600 mb-1">Mensaje</label>
        <textarea className="input resize-none" rows={2} value={fields.message||""} onChange={e=>f("message",e.target.value)} /></div>
    </div>);
    case "wifi": return (<div className="space-y-3">
      <div><label className="block text-xs font-medium text-gray-600 mb-1">Nombre de red (SSID)</label>
        <input className="input" placeholder="MiRedWiFi" value={fields.ssid||""} onChange={e=>f("ssid",e.target.value)} /></div>
      <div><label className="block text-xs font-medium text-gray-600 mb-1">Contraseña</label>
        <input className="input" value={fields.password||""} onChange={e=>f("password",e.target.value)} /></div>
      <div><label className="block text-xs font-medium text-gray-600 mb-1">Seguridad</label>
        <select className="input" value={fields.security||"WPA"} onChange={e=>f("security",e.target.value)}>
          <option value="WPA">WPA/WPA2</option><option value="WEP">WEP</option><option value="nopass">Sin contraseña</option>
        </select></div>
    </div>);
    case "vcard": return (<div className="grid grid-cols-2 gap-3">
      <div><label className="block text-xs font-medium text-gray-600 mb-1">Nombre</label><input className="input" placeholder="Juan Pérez" value={fields.name||""} onChange={e=>f("name",e.target.value)} /></div>
      <div><label className="block text-xs font-medium text-gray-600 mb-1">Teléfono</label><input className="input" placeholder="+1809..." value={fields.phone||""} onChange={e=>f("phone",e.target.value)} /></div>
      <div><label className="block text-xs font-medium text-gray-600 mb-1">Email</label><input className="input" placeholder="correo@..." value={fields.email||""} onChange={e=>f("email",e.target.value)} /></div>
      <div><label className="block text-xs font-medium text-gray-600 mb-1">Empresa</label><input className="input" placeholder="Empresa S.A." value={fields.org||""} onChange={e=>f("org",e.target.value)} /></div>
      <div className="col-span-2"><label className="block text-xs font-medium text-gray-600 mb-1">Sitio web</label><input className="input" placeholder="https://..." value={fields.url||""} onChange={e=>f("url",e.target.value)} /></div>
    </div>);
    default: return null;
  }
}

const STEPS = ["Tipo", "Contenido", "Campaña", "Diseño", "Finalizar"];

function FinalScreen({ slug, destinationUrl, style, qrType, user, onClose, onCreated }) {
  const qrRef = useRef(null);
  const qrInstance = useRef(null);
  const url = `${WORKER}/${slug}`;

  useEffect(() => {
    if (!qrRef.current) return;
    qrInstance.current = new QRCodeStyling({
      width: 200, height: 200,
      data: url,
      dotsOptions: { color: style.dotColor || "#0c4a6e", type: style.dotStyle || "rounded" },
      cornersSquareOptions: { type: style.cornerStyle || "extra-rounded", color: style.dotColor || "#0c4a6e" },
      cornersDotOptions: { type: style.cornerStyle || "dot", color: style.accentColor || "#0ea5e9" },
      backgroundOptions: { color: style.bgColor || "#ffffff" },
      image: style.logo || undefined,
      imageOptions: { crossOrigin: "anonymous", margin: 4 },
    });
    qrInstance.current.append(qrRef.current);
  }, [url]);

  const copyUrl = () => {
    navigator.clipboard.writeText(url).then(() => toast("URL copiada"));
  };

  const canSvg = ["starter", "pro", "enterprise"].includes(user?.plan);
  const canPdf = ["pro", "enterprise"].includes(user?.plan);

  return (
    <div className="text-center space-y-4 py-2">
      <div className="text-3xl mb-1">🎉</div>
      <h3 className="font-bold text-gray-900 text-lg">¡Tu código QR está listo!</h3>
      <p className="text-sm text-gray-500">/{slug}</p>

      <div ref={qrRef} className="flex justify-center" />

      {destinationUrl && (
        <p className="text-xs text-gray-400 break-all px-4">{destinationUrl.slice(0, 60)}{destinationUrl.length > 60 ? "…" : ""}</p>
      )}

      <div className="flex flex-wrap gap-2 justify-center">
        <button
          onClick={() => qrInstance.current?.download({ name: `qr-${slug}`, extension: "png" })}
          className="btn-primary text-sm"
        >
          ↓ Descargar PNG
        </button>
        {canSvg && (
          <button
            onClick={() => qrInstance.current?.download({ name: `qr-${slug}`, extension: "svg" })}
            className="btn-secondary text-sm"
          >
            ↓ SVG
          </button>
        )}
        {canPdf && (
          <button
            onClick={() => qrInstance.current?.download({ name: `qr-${slug}`, extension: "pdf" })}
            className="btn-secondary text-sm"
          >
            ↓ PDF
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 justify-center">
        <button onClick={copyUrl} className="btn-secondary text-sm">
          📋 Copiar URL
        </button>
        <a
          href={`https://wa.me/?text=Escanea%20este%20QR%3A%20${encodeURIComponent(url)}`}
          target="_blank"
          rel="noreferrer"
          className="btn-secondary text-sm"
        >
          💬 WhatsApp
        </a>
      </div>

      <button onClick={() => { onCreated(); onClose(); }} className="btn-secondary w-full text-sm mt-2">
        Cerrar
      </button>
    </div>
  );
}

export default function CreateQRModal({ projects, onClose, onCreated }) {
  const { user } = useAuth();
  const [step, setStep]       = useState(0);
  const [qrType, setQrType]   = useState("url");
  const [fields, setFields]   = useState({});
  const [campaign, setCampaign] = useState({ redirect_mode: "direct", redirect_rules: [], expires_at: "", max_scans: "", fallback_url: "" });
  const [style, setStyle]     = useState({ dotColor: "#0c4a6e", accentColor: "#0ea5e9", bgColor: "#ffffff", dotStyle: "rounded", cornerStyle: "extra-rounded" });
  const [slug, setSlug]       = useState("");
  const [projectId, setProjectId] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [saving, setSaving]   = useState(false);
  const [done, setDone]       = useState(false);

  const destinationUrl = buildUrl(qrType, fields);

  const save = async () => {
    if (!slug) return;
    setSaving(true);
    try {
      let finalProjectId = projectId;

      // Create new project if name was typed
      if (!projectId && newProjectName.trim()) {
        try {
          const pd = await api.post("/api/projects", { name: newProjectName.trim() });
          finalProjectId = pd.project?.id || pd.id || null;
        } catch (_) {}
      }

      const rulesPayload = campaign.redirect_rules;

      await api.post("/api/links", {
        slug,
        destination_url: campaign.redirect_mode === "geo" ? (campaign.geo_default || destinationUrl) : destinationUrl,
        project_id:      finalProjectId || null,
        qr_style_json:   JSON.stringify({ ...style, type: qrType }),
        redirect_mode:   campaign.redirect_mode,
        redirect_rules:  rulesPayload,
        expires_at:      campaign.expires_at || null,
        max_scans:       campaign.max_scans ? parseInt(campaign.max_scans) : null,
        fallback_url:    campaign.fallback_url || null,
      });
      toast("QR creado exitosamente");
      setDone(true);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const canNext = () => {
    if (step === 1) return !!destinationUrl;
    if (step === 4) return !!slug;
    return true;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto" onClick={onClose}>
      <div className="card w-full max-w-lg my-4" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Nuevo código QR</h2>
          <div className="flex items-center gap-1 mt-3">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-1 flex-1">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${i <= step ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-400"}`}>
                  {i < step ? "✓" : i + 1}
                </div>
                <span className={`text-xs hidden sm:inline ${i === step ? "text-brand-600 font-medium" : "text-gray-400"}`}>{s}</span>
                {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 ${i < step ? "bg-brand-500" : "bg-gray-100"}`} />}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-5 max-h-[65vh] overflow-y-auto">
          {step === 0 && (
            <div className="grid grid-cols-2 gap-2">
              {QR_TYPES.map((t) => (
                <button key={t.id} type="button"
                  className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${qrType===t.id?"border-brand-500 bg-brand-50":"border-gray-200 hover:border-gray-300"}`}
                  onClick={() => { setQrType(t.id); setFields({}); }}>
                  <span className="text-2xl">{t.icon}</span>
                  <span className="text-sm font-medium text-gray-700">{t.label}</span>
                </button>
              ))}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <TypeFields type={qrType} fields={fields} onChange={setFields} />
              {destinationUrl && (
                <p className="text-xs text-gray-400 break-all">URL: <span className="text-brand-600">{destinationUrl.slice(0,80)}{destinationUrl.length>80?"…":""}</span></p>
              )}
            </div>
          )}

          {step === 2 && (
            <CampaignConfig value={campaign} onChange={setCampaign} userPlan={user?.plan} />
          )}

          {step === 3 && (
            <QRStyler url={destinationUrl} style={style} onChange={setStyle} />
          )}

          {step === 4 && !done && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">¿Cómo se verá tu dirección web?</label>
                <input className="input font-mono" placeholder="ej: mi-restaurante-menu"
                  value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g,""))} />
                <p className="text-xs text-gray-400 mt-1">Tu dirección quedará así: qr.intaprd.com/{slug || "mi-restaurante-menu"}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Proyecto (opcional)</label>
                <select className="input" value={projectId} onChange={(e) => { setProjectId(e.target.value); if (e.target.value) setNewProjectName(""); }}>
                  <option value="">Sin proyecto / Crear nuevo</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {!projectId && (
                  <input
                    className="input mt-1.5 text-sm"
                    placeholder="+ Nombre del nuevo proyecto (opcional)"
                    value={newProjectName}
                    onChange={e => setNewProjectName(e.target.value)}
                  />
                )}
              </div>
              {/* Resumen */}
              <div className="bg-gray-50 rounded-xl p-3 text-xs space-y-1 text-gray-600">
                <p><span className="font-medium">Tipo:</span> {qrType}</p>
                <p><span className="font-medium">Modo:</span> {campaign.redirect_mode}</p>
                {campaign.expires_at && <p><span className="font-medium">Expira:</span> {new Date(campaign.expires_at).toLocaleString()}</p>}
                {campaign.max_scans  && <p><span className="font-medium">Máx escaneos:</span> {campaign.max_scans}</p>}
              </div>
            </div>
          )}

          {step === 4 && done && (
            <FinalScreen
              slug={slug}
              destinationUrl={destinationUrl}
              style={style}
              qrType={qrType}
              user={user}
              onClose={onClose}
              onCreated={onCreated}
            />
          )}
        </div>

        {/* Footer */}
        {!done && (
          <div className="p-5 border-t border-gray-100 flex justify-between">
            <button onClick={step === 0 ? onClose : () => setStep(s => s - 1)} className="btn-secondary">
              {step === 0 ? "Cancelar" : "← Atrás"}
            </button>
            {step < STEPS.length - 1 ? (
              <button onClick={() => setStep(s => s + 1)} disabled={!canNext()} className="btn-primary">
                Siguiente →
              </button>
            ) : (
              <button onClick={save} disabled={!canNext() || saving} className="btn-primary">
                {saving ? "Creando..." : "✓ Crear QR"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
