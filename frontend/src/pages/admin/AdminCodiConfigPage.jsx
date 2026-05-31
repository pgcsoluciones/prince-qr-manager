import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../../utils/api.js";
import { toast } from "../../components/Toast.jsx";

const RUBROS = [
  { id: "general",    label: "General" },
  { id: "restaurante",label: "Restaurante / Food Service" },
  { id: "retail",     label: "Retail / Comercio" },
  { id: "eventos",    label: "Eventos" },
  { id: "logistica",  label: "Logística / Distribución" },
  { id: "salud",      label: "Salud" },
  { id: "educacion",  label: "Educación" },
  { id: "otro",       label: "Otro" },
];

export default function AdminCodiConfigPage() {
  const [basePrompt, setBasePrompt]   = useState("");
  const [rubros, setRubros]           = useState({});
  const [activeRubro, setActiveRubro] = useState("general");
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [tenants, setTenants]         = useState([]);
  const [savingRubro, setSavingRubro] = useState({});
  const [avatar, setAvatar]           = useState(null);
  const fileInputRef                  = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [codiRes, tenantsRes] = await Promise.all([
        api.get("/api/admin/codi/config"),
        api.get("/api/admin/users"),
      ]);
      if (codiRes.ok) {
        setBasePrompt(codiRes.config?.codi_base_prompt || "");
        setRubros(codiRes.config?.codi_rubros_prompts || {});
        setAvatar(codiRes.config?.codi_avatar || null);
      }
      if (tenantsRes.ok) setTenants(tenantsRes.users || []);
    } catch {
      toast.error("Error cargando configuración");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const savePrompts = async () => {
    setSaving(true);
    try {
      await api.put("/api/admin/codi/config", {
        codi_base_prompt: basePrompt,
        codi_rubros_prompts: rubros,
        codi_avatar: avatar,
      });
      toast.success("Configuración de Codi guardada");
    } catch {
      toast.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Solo se permiten imágenes"); return; }
    if (file.size > 500 * 1024) { toast.error("La imagen debe pesar menos de 500 KB"); return; }
    const reader = new FileReader();
    reader.onload = (ev) => setAvatar(ev.target.result);
    reader.readAsDataURL(file);
  };

  const saveTenantRubro = async (userId, rubro) => {
    setSavingRubro((prev) => ({ ...prev, [userId]: true }));
    try {
      await api.put(`/api/admin/users/${userId}`, { rubro });
      setTenants((prev) => prev.map((t) => t.id === userId ? { ...t, rubro } : t));
      toast.success("Rubro actualizado");
    } catch {
      toast.error("Error al actualizar rubro");
    } finally {
      setSavingRubro((prev) => ({ ...prev, [userId]: false }));
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-500 text-sm">Cargando configuración de Codi...</div>;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Configuración de Codi</h1>
        <p className="text-slate-500 text-sm mt-1">
          Define el comportamiento del agente IA para todos los tenants. Los tenants no pueden modificar esto.
        </p>
      </div>

      {/* Avatar de Codi */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-slate-900">Avatar de Codi</h2>
            <p className="text-xs text-slate-500 mt-0.5">Imagen que aparece en el chat. Máx 500 KB.</p>
          </div>
          <button
            onClick={savePrompts}
            disabled={saving}
            className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Guardando…" : "Guardar todo"}
          </button>
        </div>
        <div className="flex items-center gap-6">
          <div className="relative flex-shrink-0">
            {avatar ? (
              <img src={avatar} alt="Avatar Codi" className="w-20 h-20 rounded-full object-cover border-2 border-slate-200 shadow-sm" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-3xl border-2 border-slate-200 shadow-sm">
                🤖
              </div>
            )}
            {avatar && (
              <button
                onClick={() => setAvatar(null)}
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs hover:bg-red-600 transition-colors"
                title="Eliminar avatar"
              >✕</button>
            )}
          </div>
          <div className="flex-1">
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarFile} />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 transition-colors font-medium"
            >
              {avatar ? "Cambiar imagen" : "Subir imagen"}
            </button>
            <p className="text-xs text-slate-400 mt-2">PNG, JPG o WebP · Cuadrada recomendada</p>
          </div>
        </div>
      </div>

      {/* Prompt base */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="mb-4">
          <h2 className="font-semibold text-slate-900">Prompt base de Codi</h2>
          <p className="text-xs text-slate-500 mt-0.5">Se aplica a todos los tenants sin importar su rubro.</p>
        </div>
        <textarea
          rows={10}
          value={basePrompt}
          onChange={(e) => setBasePrompt(e.target.value)}
          className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-200 bg-slate-50 resize-y"
          placeholder="Escribe el prompt base de Codi..."
        />
        <p className="text-xs text-slate-400 mt-2">{basePrompt.length} caracteres · ~{Math.round(basePrompt.length / 4)} tokens estimados</p>
      </div>

      {/* Prompts por rubro */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-semibold text-slate-900 mb-1">Instrucciones por rubro</h2>
        <p className="text-xs text-slate-500 mb-4">Se añaden al prompt base cuando el tenant tiene ese rubro asignado.</p>

        <div className="flex gap-2 flex-wrap mb-4">
          {RUBROS.map((r) => (
            <button
              key={r.id}
              onClick={() => setActiveRubro(r.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeRubro === r.id
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <textarea
          rows={6}
          value={rubros[activeRubro] || ""}
          onChange={(e) => setRubros((prev) => ({ ...prev, [activeRubro]: e.target.value }))}
          className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-200 bg-slate-50 resize-y"
          placeholder={`Instrucciones específicas para el rubro "${RUBROS.find(r => r.id === activeRubro)?.label}"...`}
        />
        <p className="text-xs text-slate-400 mt-2">{(rubros[activeRubro] || "").length} caracteres</p>
      </div>

      {/* Tenants — asignar rubro */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="font-semibold text-slate-900 mb-1">Rubro por tenant</h2>
        <p className="text-xs text-slate-500 mb-4">Asigna el rubro de cada tenant para que Codi adapte su comportamiento.</p>

        <div className="space-y-2">
          {tenants.filter(t => t.role !== "superadmin").map((tenant) => (
            <div key={tenant.id} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{tenant.company_name || tenant.email}</p>
                <p className="text-xs text-slate-400">{tenant.email} · Plan {tenant.plan}</p>
              </div>
              <select
                value={tenant.rubro || "general"}
                onChange={(e) => saveTenantRubro(tenant.id, e.target.value)}
                disabled={savingRubro[tenant.id]}
                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-slate-50 disabled:opacity-50"
              >
                {RUBROS.map((r) => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
            </div>
          ))}
          {tenants.filter(t => t.role !== "superadmin").length === 0 && (
            <p className="text-sm text-slate-400 py-4 text-center">No hay tenants registrados aún.</p>
          )}
        </div>
      </div>

    </div>
  );
}
