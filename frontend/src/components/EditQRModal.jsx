import { useState } from "react";
import { api } from "../utils/api.js";
import QRStyler from "./QRStyler.jsx";
import { toast } from "./Toast.jsx";

export default function EditQRModal({ link, projects, onClose, onSaved }) {
  const existingStyle = link.qr_style_json
    ? (typeof link.qr_style_json === "string" ? JSON.parse(link.qr_style_json) : link.qr_style_json)
    : {};

  const [destination, setDestination] = useState(link.destination_url);
  const [projectId, setProjectId]     = useState(link.project_id || "");
  const [style, setStyle]             = useState({
    dotColor:    "#0c4a6e",
    accentColor: "#0ea5e9",
    bgColor:     "#ffffff",
    dotStyle:    "rounded",
    cornerStyle: "extra-rounded",
    ...existingStyle,
  });
  const [saving, setSaving] = useState(false);
  const [tab, setTab]       = useState("url");

  const save = async () => {
    if (!destination) return;
    setSaving(true);
    try {
      await api.put(`/api/links/${link.slug}`, {
        destination_url: destination,
        project_id: projectId || null,
        qr_style_json: JSON.stringify(style),
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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto" onClick={onClose}>
      <div className="card w-full max-w-lg my-4" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Editar QR — <span className="font-mono text-brand-600">/{link.slug}</span></h2>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          {["url", "diseño"].map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 py-3 text-sm font-medium capitalize transition-colors border-b-2 ${
                tab === t ? "border-brand-600 text-brand-700" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}>{t === "url" ? "URL & Proyecto" : "Diseño QR"}</button>
          ))}
        </div>

        <div className="p-5">
          {tab === "url" && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">URL de destino</label>
                <input type="url" className="input" placeholder="https://..."
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Proyecto</label>
                <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  <option value="">Sin proyecto</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
          )}
          {tab === "diseño" && (
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
