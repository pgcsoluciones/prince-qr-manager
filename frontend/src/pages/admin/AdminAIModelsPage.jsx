import { useState, useEffect, useCallback } from "react";
import { api } from "../../utils/api.js";
import { toast } from "../../components/Toast.jsx";

const LLM_PROVIDERS = ["claude", "openai", "gemini", "groq", "llama"];

export default function AdminAIModelsPage() {
  const [tenants, setTenants]       = useState([]);
  const [configs, setConfigs]       = useState({});
  const [loading, setLoading]       = useState(true);
  const [editingId, setEditingId]   = useState(null);
  const [editForm, setEditForm]     = useState({});
  const [saving, setSaving]         = useState(false);
  const [globalLLM, setGlobalLLM]   = useState("claude");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get("/api/admin/tenants");
      const ts = data.tenants || [];
      setTenants(ts);
      // Load AI configs for first 20 tenants
      const configMap = {};
      await Promise.all(ts.slice(0, 20).map(async (t) => {
        try {
          const r = await api.get(`/api/admin/tenants/${t.id}/ai-config`);
          configMap[t.id] = r.config;
        } catch (_) {}
      }));
      setConfigs(configMap);
    } catch (e) { toast(e.message, "error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const startEdit = (t) => {
    const c = configs[t.id] || {};
    setEditingId(t.id);
    setEditForm({ llm_provider: c.llm_provider || "claude", max_tokens_month: c.max_tokens_month || 50000 });
  };

  const saveEdit = async (tenantId) => {
    setSaving(true);
    try {
      await api.put(`/api/admin/tenants/${tenantId}/ai-config`, editForm);
      toast("Config actualizada");
      setEditingId(null);
      const r = await api.get(`/api/admin/tenants/${tenantId}/ai-config`);
      setConfigs(prev => ({ ...prev, [tenantId]: r.config }));
    } catch (e) { toast(e.message, "error"); }
    finally { setSaving(false); }
  };

  // Compute totals
  const totalTokens = Object.values(configs).reduce((s, c) => s + (c?.tokens_used_month || 0), 0);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Modelos IA</h1>

      {/* Global defaults */}
      <div className="card p-5 mb-6">
        <h2 className="font-semibold text-slate-800 mb-3">Configuración global por defecto</h2>
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">LLM por defecto (cuando tenant no tiene clave)</label>
            <select className="input w-48" value={globalLLM} onChange={(e) => setGlobalLLM(e.target.value)}>
              {LLM_PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="p-3 bg-blue-50 rounded-lg">
            <p className="text-xs text-blue-600 font-medium">Tokens totales usados este mes</p>
            <p className="text-2xl font-bold text-blue-700">{totalTokens.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Tenant table */}
      {loading ? (
        <p className="text-slate-400 text-sm">Cargando...</p>
      ) : (
        <div className="card overflow-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b">
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">LLM</th>
                <th className="px-4 py-3 font-medium">Límite tokens</th>
                <th className="px-4 py-3 font-medium">Usados</th>
                <th className="px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => {
                const c = configs[t.id];
                const isEditing = editingId === t.id;
                return (
                  <tr key={t.id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{t.email}</td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <select className="input py-1 text-xs" value={editForm.llm_provider} onChange={(e) => setEditForm({ ...editForm, llm_provider: e.target.value })}>
                          {LLM_PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      ) : (
                        <span className="badge bg-slate-100 text-slate-700">{c?.llm_provider || "claude"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input type="number" className="input py-1 text-xs w-28" value={editForm.max_tokens_month} onChange={(e) => setEditForm({ ...editForm, max_tokens_month: parseInt(e.target.value) || 50000 })} />
                      ) : (
                        <span>{(c?.max_tokens_month || 50000).toLocaleString()}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{(c?.tokens_used_month || 0).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <div className="flex gap-1">
                          <button onClick={() => saveEdit(t.id)} disabled={saving} className="btn-primary text-xs py-1 px-2">Guardar</button>
                          <button onClick={() => setEditingId(null)} className="btn-secondary text-xs py-1 px-2">Cancelar</button>
                        </div>
                      ) : (
                        <button onClick={() => startEdit(t)} className="btn-secondary text-xs py-1 px-2">Editar</button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {tenants.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-sm">Sin tenants.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
