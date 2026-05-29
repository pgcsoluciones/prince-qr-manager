import { useState, useEffect, useCallback } from "react";
import { api } from "../../utils/api.js";
import { toast } from "../../components/Toast.jsx";

const LLM_PROVIDERS = [
  { id: "claude",  label: "Claude (Anthropic)",  badge: "bg-orange-100 text-orange-700",  model: "claude-haiku-4-5" },
  { id: "openai",  label: "GPT-4o mini (OpenAI)", badge: "bg-green-100 text-green-700",   model: "gpt-4o-mini" },
  { id: "gemini",  label: "Gemini Flash (Google)", badge: "bg-blue-100 text-blue-700",    model: "gemini-1.5-flash" },
  { id: "groq",    label: "Llama 3.1 (Groq)",     badge: "bg-purple-100 text-purple-700", model: "llama-3.1-8b-instant" },
];

const PLAN_TOKEN_LIMITS = { free: 0, starter: 0, pro: 50000, enterprise: 200000 };

const DEFAULT_SYSTEM_PROMPT = `Eres un asistente de operaciones y calidad llamado "Intap". Ayudas a gerentes y dueños de negocios a interpretar sus métricas, checklists y feedback de clientes.
Siempre respondes en español, de forma clara, directa y accionable.
Cuando das recomendaciones, las basas en los datos reales del negocio.
Eres profesional pero cercano, como un consultor de confianza.`;

export default function AdminAIModelsPage() {
  const [tenants, setTenants]     = useState([]);
  const [configs, setConfigs]     = useState({});
  const [loading, setLoading]     = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm]   = useState({});
  const [saving, setSaving]       = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get("/api/admin/tenants");
      const ts = (data.tenants || []).filter(t => ["pro","enterprise"].includes(t.plan));
      setTenants(ts);
      const configMap = {};
      await Promise.all(ts.slice(0, 30).map(async (t) => {
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
    setShowPrompt(false);
    setEditForm({
      llm_provider:          c.llm_provider || "claude",
      llm_api_key:           "",
      system_prompt:         c.system_prompt || DEFAULT_SYSTEM_PROMPT,
      max_tokens_month:      c.max_tokens_month || PLAN_TOKEN_LIMITS[t.plan] || 50000,
      weekly_report_enabled: c.weekly_report_enabled !== 0,
    });
  };

  const saveEdit = async (tenantId) => {
    setSaving(true);
    try {
      const payload = { ...editForm };
      if (!payload.llm_api_key) delete payload.llm_api_key;
      await api.put(`/api/admin/tenants/${tenantId}/ai-config`, payload);
      toast("Configuración de IA actualizada");
      setEditingId(null);
      const r = await api.get(`/api/admin/tenants/${tenantId}/ai-config`);
      setConfigs(prev => ({ ...prev, [tenantId]: r.config }));
    } catch (e) { toast(e.message, "error"); }
    finally { setSaving(false); }
  };

  const totalTokens = Object.values(configs).reduce((s, c) => s + (c?.tokens_used_month || 0), 0);
  const providerOf = (id) => LLM_PROVIDERS.find(p => p.id === id) || LLM_PROVIDERS[0];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Modelos IA</h1>
        <p className="text-sm text-slate-500 mt-1">Configura el LLM, la API key y la personalidad del agente por tenant.</p>
      </div>

      {/* Global stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Tenants con IA", value: tenants.length },
          { label: "Tokens usados (mes)", value: totalTokens.toLocaleString() },
          { label: "Usando Claude", value: Object.values(configs).filter(c => !c?.llm_provider || c.llm_provider === "claude").length },
          { label: "Clave propia", value: Object.values(configs).filter(c => c?.llm_api_key).length },
        ].map(s => (
          <div key={s.label} className="card p-4">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* LLM info cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {LLM_PROVIDERS.map(p => (
          <div key={p.id} className="card p-3">
            <span className={`badge ${p.badge} mb-2`}>{p.id}</span>
            <p className="text-xs font-medium text-slate-700">{p.label}</p>
            <p className="text-xs text-slate-400 mt-0.5">{p.model}</p>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              {Object.values(configs).filter(c => c?.llm_provider === p.id).length} tenants
            </p>
          </div>
        ))}
      </div>

      {/* Tenant table */}
      {loading ? (
        <p className="text-slate-400 text-sm">Cargando...</p>
      ) : (
        <div className="card overflow-auto">
          <div className="px-4 py-3 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">Configuración por tenant (Pro/Enterprise)</h2>
          </div>
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b bg-slate-50">
                <th className="px-4 py-3 font-medium">Tenant</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">LLM</th>
                <th className="px-4 py-3 font-medium">API Key</th>
                <th className="px-4 py-3 font-medium">Tokens usados / límite</th>
                <th className="px-4 py-3 font-medium">Reporte</th>
                <th className="px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => {
                const c = configs[t.id];
                const prov = providerOf(c?.llm_provider || "claude");
                const used = c?.tokens_used_month || 0;
                const limit = c?.max_tokens_month || 50000;
                const pct = Math.min(100, Math.round((used / limit) * 100));
                const isEditing = editingId === t.id;

                if (isEditing) return (
                  <tr key={t.id} className="border-b bg-blue-50">
                    <td colSpan={7} className="px-4 py-4">
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          {/* LLM provider */}
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Modelo LLM</label>
                            <select className="input" value={editForm.llm_provider}
                              onChange={e => setEditForm(f => ({ ...f, llm_provider: e.target.value }))}>
                              {LLM_PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.label} ({p.model})</option>)}
                            </select>
                          </div>
                          {/* API Key */}
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              API Key del tenant <span className="text-slate-400">(vacío = usar clave de plataforma)</span>
                            </label>
                            <input type="password" className="input" placeholder="sk-..." value={editForm.llm_api_key}
                              onChange={e => setEditForm(f => ({ ...f, llm_api_key: e.target.value }))} />
                          </div>
                          {/* Token limit */}
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Límite de tokens/mes</label>
                            <input type="number" className="input" value={editForm.max_tokens_month}
                              onChange={e => setEditForm(f => ({ ...f, max_tokens_month: parseInt(e.target.value) || 50000 }))} />
                          </div>
                        </div>

                        {/* System prompt / personalidad del agente */}
                        <div>
                          <button onClick={() => setShowPrompt(v => !v)}
                            className="text-xs font-medium text-primary hover:underline flex items-center gap-1">
                            {showPrompt ? "▼" : "▶"} Personalidad del agente IA (System Prompt)
                          </button>
                          {showPrompt && (
                            <div className="mt-2">
                              <textarea rows={6} className="input font-mono text-xs resize-y"
                                placeholder="Instrucciones de comportamiento del agente..."
                                value={editForm.system_prompt}
                                onChange={e => setEditForm(f => ({ ...f, system_prompt: e.target.value }))} />
                              <p className="text-xs text-slate-400 mt-1">
                                Define cómo se comporta el agente en reportes y respuestas. El tenant puede personalizarlo desde su panel de configuración.
                              </p>
                              <button onClick={() => setEditForm(f => ({ ...f, system_prompt: DEFAULT_SYSTEM_PROMPT }))}
                                className="text-xs text-slate-500 hover:text-slate-700 underline mt-1">
                                Restaurar prompt por defecto
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Weekly report toggle */}
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={editForm.weekly_report_enabled}
                            onChange={e => setEditForm(f => ({ ...f, weekly_report_enabled: e.target.checked }))} />
                          <span className="text-sm text-slate-700">Activar reporte semanal automático con IA</span>
                        </label>

                        <div className="flex gap-2">
                          <button onClick={() => saveEdit(t.id)} disabled={saving} className="btn-primary text-sm">
                            {saving ? "Guardando..." : "Guardar configuración"}
                          </button>
                          <button onClick={() => setEditingId(null)} className="btn-secondary text-sm">Cancelar</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                );

                return (
                  <tr key={t.id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800 text-xs">{t.email}</td>
                    <td className="px-4 py-3">
                      <span className="badge bg-slate-100 text-slate-600 text-xs">{t.plan}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge text-xs ${prov.badge}`}>{prov.id}</span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {c?.llm_api_key ? <span className="text-green-600 font-medium">✓ Propia</span> : <span className="text-slate-400">Plataforma</span>}
                    </td>
                    <td className="px-4 py-3 min-w-[140px]">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-slate-200 rounded-full h-1.5">
                          <div className={`h-1.5 rounded-full ${pct > 80 ? "bg-red-500" : "bg-primary"}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-slate-500 whitespace-nowrap">{used.toLocaleString()} / {limit.toLocaleString()}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {c?.weekly_report_enabled !== 0 ? <span className="text-green-600">✓ Activo</span> : <span className="text-slate-400">Inactivo</span>}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => startEdit(t)} className="btn-secondary text-xs py-1 px-2">Configurar</button>
                    </td>
                  </tr>
                );
              })}
              {tenants.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-sm">
                  No hay tenants Pro/Enterprise configurados.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
