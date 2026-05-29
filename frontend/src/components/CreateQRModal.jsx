import { useState, useEffect } from "react";
import { api } from "../utils/api.js";
import QRStyler from "./QRStyler.jsx";
import { toast } from "./Toast.jsx";

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
    case "url":       return fields.url || "";
    case "whatsapp":  return `https://wa.me/${(fields.phone||"").replace(/\D/g,"")}${fields.message ? `?text=${encodeURIComponent(fields.message)}` : ""}`;
    case "instagram": return `https://instagram.com/${(fields.username||"").replace("@","")}`;
    case "email":     return `mailto:${fields.email||""}${fields.subject ? `?subject=${encodeURIComponent(fields.subject)}` : ""}`;
    case "sms":       return `sms:${fields.phone||""}${fields.message ? `?body=${encodeURIComponent(fields.message)}` : ""}`;
    case "wifi":      return `WIFI:T:${fields.security||"WPA"};S:${fields.ssid||""};P:${fields.password||""};;`;
    case "vcard":     return `BEGIN:VCARD\nVERSION:3.0\nFN:${fields.name||""}\nTEL:${fields.phone||""}\nEMAIL:${fields.email||""}\nORG:${fields.org||""}\nURL:${fields.url||""}\nEND:VCARD`;
    case "pdf":       return fields.url || "";
    default:          return fields.url || "";
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
    case "whatsapp": return (<>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono (con código de país)</label>
        <input className="input" placeholder="+18091234567" value={fields.phone||""} onChange={e=>f("phone",e.target.value)} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Mensaje pre-llenado (opcional)</label>
        <textarea className="input resize-none" rows={2} placeholder="Hola! Quiero info sobre..." value={fields.message||""} onChange={e=>f("message",e.target.value)} />
      </div>
    </>);
    case "instagram": return (
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Usuario de Instagram</label>
        <input className="input" placeholder="@usuario" value={fields.username||""} onChange={e=>f("username",e.target.value)} />
      </div>
    );
    case "email": return (<>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
        <input type="email" className="input" placeholder="correo@ejemplo.com" value={fields.email||""} onChange={e=>f("email",e.target.value)} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Asunto (opcional)</label>
        <input className="input" placeholder="Consulta..." value={fields.subject||""} onChange={e=>f("subject",e.target.value)} />
      </div>
    </>);
    case "sms": return (<>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono</label>
        <input className="input" placeholder="+18091234567" value={fields.phone||""} onChange={e=>f("phone",e.target.value)} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Mensaje</label>
        <textarea className="input resize-none" rows={2} value={fields.message||""} onChange={e=>f("message",e.target.value)} />
      </div>
    </>);
    case "wifi": return (<>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Nombre de red (SSID)</label>
        <input className="input" placeholder="MiRedWiFi" value={fields.ssid||""} onChange={e=>f("ssid",e.target.value)} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Contraseña</label>
        <input className="input" placeholder="contraseña" value={fields.password||""} onChange={e=>f("password",e.target.value)} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Seguridad</label>
        <select className="input" value={fields.security||"WPA"} onChange={e=>f("security",e.target.value)}>
          <option value="WPA">WPA/WPA2</option>
          <option value="WEP">WEP</option>
          <option value="nopass">Sin contraseña</option>
        </select>
      </div>
    </>);
    case "vcard": return (<>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Nombre</label>
          <input className="input" placeholder="Juan Pérez" value={fields.name||""} onChange={e=>f("name",e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono</label>
          <input className="input" placeholder="+1809..." value={fields.phone||""} onChange={e=>f("phone",e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
          <input className="input" placeholder="correo@..." value={fields.email||""} onChange={e=>f("email",e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Empresa</label>
          <input className="input" placeholder="Empresa S.A." value={fields.org||""} onChange={e=>f("org",e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Sitio web</label>
          <input className="input" placeholder="https://..." value={fields.url||""} onChange={e=>f("url",e.target.value)} />
        </div>
      </div>
    </>);
    default: return null;
  }
}

const STEPS = ["Tipo", "Contenido", "Diseño", "Finalizar"];

export default function CreateQRModal({ projects, onClose, onCreated }) {
  const [step, setStep]       = useState(0);
  const [qrType, setQrType]   = useState("url");
  const [fields, setFields]   = useState({});
  const [style, setStyle]     = useState({ dotColor: "#0c4a6e", accentColor: "#0ea5e9", bgColor: "#ffffff", dotStyle: "rounded", cornerStyle: "extra-rounded" });
  const [slug, setSlug]       = useState("");
  const [projectId, setProjectId] = useState("");
  const [saving, setSaving]   = useState(false);

  const destinationUrl = buildUrl(qrType, fields);

  const save = async () => {
    if (!slug) return;
    setSaving(true);
    try {
      await api.post("/api/links", {
        slug,
        destination_url: destinationUrl,
        project_id: projectId || null,
        qr_style_json: JSON.stringify({ ...style, type: qrType }),
      });
      toast("QR creado exitosamente");
      onCreated();
      onClose();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const canNext = () => {
    if (step === 1) return !!destinationUrl;
    if (step === 3) return !!slug;
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
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i <= step ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-400"}`}>
                  {i < step ? "✓" : i + 1}
                </div>
                <span className={`text-xs hidden sm:inline ${i === step ? "text-brand-600 font-medium" : "text-gray-400"}`}>{s}</span>
                {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 ${i < step ? "bg-brand-500" : "bg-gray-100"}`} />}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-5">
          {/* Step 0: Tipo */}
          {step === 0 && (
            <div className="grid grid-cols-2 gap-2">
              {QR_TYPES.map((t) => (
                <button key={t.id} type="button"
                  className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
                    qrType === t.id ? "border-brand-500 bg-brand-50" : "border-gray-200 hover:border-gray-300"
                  }`}
                  onClick={() => { setQrType(t.id); setFields({}); }}>
                  <span className="text-2xl">{t.icon}</span>
                  <span className="text-sm font-medium text-gray-700">{t.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* Step 1: Contenido */}
          {step === 1 && (
            <div className="space-y-3">
              <TypeFields type={qrType} fields={fields} onChange={setFields} />
              {destinationUrl && (
                <p className="text-xs text-gray-400 break-all">URL generada: <span className="text-brand-600">{destinationUrl.slice(0, 80)}{destinationUrl.length > 80 ? "…" : ""}</span></p>
              )}
            </div>
          )}

          {/* Step 2: Diseño */}
          {step === 2 && (
            <QRStyler url={destinationUrl} style={style} onChange={setStyle} />
          )}

          {/* Step 3: Finalizar */}
          {step === 3 && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Slug (sufijo de URL)</label>
                <input className="input font-mono" placeholder="mi-qr"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g,""))} />
                <p className="text-xs text-gray-400 mt-1">worker-url/<span className="text-brand-600">{slug || "mi-qr"}</span></p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Proyecto (opcional)</label>
                <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  <option value="">Sin proyecto</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
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
      </div>
    </div>
  );
}
