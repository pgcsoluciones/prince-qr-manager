import { useState } from "react";
import { api } from "../utils/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import QRStyler from "./QRStyler.jsx";
import CampaignConfig from "./CampaignConfig.jsx";
import { toast } from "./Toast.jsx";

export default function EditQRModal({ link, projects, onClose, onSaved }) {
  const { user } = useAuth();

  const existingStyle = link.qr_style_json
    ? (typeof link.qr_style_json === "string" ? JSON.parse(link.qr_style_json) : link.qr_style_json)
    : {};

  const [destination, setDestination] = useState(link.destination_url);
  const [projectId, setProjectId]     = useState(link.project_id || "");
  const [style, setStyle]             = useState({
    dotColor: "#0c4a6e", accentColor: "#0ea5e9", bgColor: "#ffffff",
    dotStyle: "rounded", cornerStyle: "extra-rounded", ...existingStyle,
  });
  const [campaign, setCampaign] = useState({
    redirect_mode:  link.redirect_mode  || "direct",
    redirect_rules: link.redirect_rules
      ? (typeof link.redirect_rules === "string" ? JSON.parse(link.redirect_rules) : link.redirect_rules)
      : [],
    expires_at:   link.expires_at   ? link.expires_at.slice(0,16) : "",
    max_scans:    link.max_scans    || "",
    fallback_url: link.fallback_url || "",
    geo_default:  link.destination_url || "",
  });

  const [saving, setSaving] = useState(false);
  const [tab, setTab]       = useState("url");

  const save = async () => {
    if (!destination) return;
    setSaving(true);
    try {
      await api.put(`/api/links/${link.slug}`, {
        destination_url: campaign.redirect_mode === "geo" ? (campaign.geo_default || destination) : destination,
        project_id:      projectId || null,
        qr_style_json:   JSON.stringify(style),
        redirect_mode:   campaign.redirect_mode,
        redirect_rules:  campaign.redirect_rules,
        expires_at:      campaign.expires_at || null,
        max_scans:       campaign.max_scans ? parseInt(campaign.max_scans) : null,
        fallback_url:    campaign.fallback_url || null,
      });
      toast("QR actualizado");
      onSaved();
      onClose();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const TABS = [
    { id: "url",      label: "URL & Proyecto" },
    { id: "campaign", label: "Campaña" },
    { id: "design",   label: "Diseño QR" },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto" onClick={onClose}>
      <div className="card w-full max-w-lg my-4" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">
            Editar QR — <span className="font-mono text-brand-600">/{link.slug}</span>
          </h2>
          {link.redirect_mode && link.redirect_mode !== "direct" && (
            <span className="badge bg-purple-100 text-purple-700 mt-1">
              Modo: {link.redirect_mode}
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 flex-1 ${
                tab === t.id ? "border-brand-600 text-brand-700" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}>{t.label}</button>
          ))}
        </div>

        <div className="p-5 max-h-[60vh] overflow-y-auto">
          {tab === "url" && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">URL de destino</label>
                <input type="url" className="input" placeholder="https://..."
                  value={destination} onChange={(e) => setDestination(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Proyecto</label>
                <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  <option value="">Sin proyecto</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              {/* Info de campaña activa */}
              {campaign.redirect_mode !== "direct" && (
                <div className="p-3 bg-purple-50 rounded-lg text-xs text-purple-700">
                  ⚡ Campaña activa: <strong>{campaign.redirect_mode}</strong>. Edita en la pestaña "Campaña".
                </div>
              )}
              {campaign.expires_at && (
                <div className="p-3 bg-amber-50 rounded-lg text-xs text-amber-700">
                  ⏰ Expira: {new Date(campaign.expires_at).toLocaleString()}
                </div>
              )}
            </div>
          )}

          {tab === "campaign" && (
            <CampaignConfig value={campaign} onChange={setCampaign} userPlan={user?.plan} />
          )}

          {tab === "design" && (
            <QRStyler url={destination} style={style} onChange={setStyle} />
          )}
        </div>

        <div className="p-5 border-t border-gray-100 flex justify-between">
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
          <button onClick={save} disabled={!destination || saving} className="btn-primary">
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}
