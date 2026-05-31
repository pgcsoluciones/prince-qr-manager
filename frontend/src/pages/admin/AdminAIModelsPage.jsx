import { useState, useEffect, useCallback } from "react";
import { api } from "../../utils/api.js";
import { toast } from "../../components/Toast.jsx";

const PROVIDERS = [
  { id: "anthropic",  label: "Anthropic",  badge: "bg-orange-100 text-orange-700",  placeholder: "claude-sonnet-4-6" },
  { id: "openai",     label: "OpenAI",     badge: "bg-green-100 text-green-700",    placeholder: "gpt-4o" },
  { id: "google",     label: "Google AI",  badge: "bg-blue-100 text-blue-700",      placeholder: "gemini-1.5-pro" },
  { id: "cloudflare", label: "Cloudflare", badge: "bg-yellow-100 text-yellow-700",  placeholder: "@cf/meta/llama-3.1-8b-instruct" },
];

const PLAN_ORDER  = ["free", "starter", "pro", "enterprise"];
const PLAN_LABELS = { free: "Free", starter: "Starter", pro: "Pro", enterprise: "Enterprise" };

const API_KEY_PROVIDERS = [
  { id: "anthropic", label: "Anthropic",  placeholder: "sk-ant-api03-…", hint: "Consola: console.anthropic.com" },
  { id: "openai",    label: "OpenAI",     placeholder: "sk-proj-…",      hint: "Consola: platform.openai.com" },
  { id: "google",    label: "Google AI",  placeholder: "AIza…",          hint: "Consola: aistudio.google.com" },
];

export default function AdminAIModelsPage() {
  const [plans, setPlans]           = useState([]);
  const [edits, setEdits]           = useState({});
  const [saving, setSaving]         = useState({});
  const [loading, setLoading]       = useState(true);
  const [modelCache, setModelCache] = useState({});
  const [fetchingModels, setFetchingModels] = useState({});
  const [apiKeys, setApiKeys]       = useState({ anthropic: "", openai: "", google: "" });
  const [maskedKeys, setMaskedKeys] = useState({});
  const [savingKeys, setSavingKeys] = useState(false);
  const [showKeys, setShowKeys]     = useState({});

  // ── load plans ─────────────────────────────────────────────────────────────
  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get("/api/admin/plans");
      const ordered = PLAN_ORDER.map((p) => data.plans?.find((x) => x.plan === p)).filter(Boolean);
      setPlans(ordered);
      const initial = {};
      ordered.forEach((p) => {
        initial[p.plan] = {
          ai_provider: p.ai_provider || "anthropic",
          ai_model:    p.ai_model    || "",
        };
      });
      setEdits(initial);
    } catch {
      toast.error("Error cargando planes");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadApiKeys = useCallback(async () => {
    try {
      const data = await api.get("/api/admin/ai/keys");
      if (data.ok) setMaskedKeys(data.keys || {});
    } catch {}
  }, []);

  useEffect(() => { loadPlans(); loadApiKeys(); }, [loadPlans, loadApiKeys]);

  const saveApiKeys = async () => {
    const payload = {};
    if (apiKeys.anthropic) payload.anthropic = apiKeys.anthropic;
    if (apiKeys.openai)    payload.openai    = apiKeys.openai;
    if (apiKeys.google)    payload.google    = apiKeys.google;
    if (!Object.keys(payload).length) { toast.error("Ingresa al menos una API key"); return; }
    setSavingKeys(true);
    try {
      await api.put("/api/admin/ai/keys", payload);
      toast.success("API keys guardadas");
      setApiKeys({ anthropic: "", openai: "", google: "" });
      setModelCache({});
      loadApiKeys();
    } catch {
      toast.error("Error al guardar keys");
    } finally {
      setSavingKeys(false);
    }
  };

  // ── fetch models for a provider ────────────────────────────────────────────
  const fetchModels = useCallback(async (provider) => {
    if (modelCache[provider] || fetchingModels[provider]) return;
    setFetchingModels((prev) => ({ ...prev, [provider]: true }));
    try {
      const data = await api.get(`/api/admin/ai/models?provider=${provider}`);
      if (data.ok && data.models?.length) {
        setModelCache((prev) => ({ ...prev, [provider]: data.models }));
      } else {
        toast.error(data.error || `No se pudieron cargar modelos de ${provider}`);
        setModelCache((prev) => ({ ...prev, [provider]: [] }));
      }
    } catch {
      toast.error(`Error consultando modelos de ${provider}`);
      setModelCache((prev) => ({ ...prev, [provider]: [] }));
    } finally {
      setFetchingModels((prev) => ({ ...prev, [provider]: false }));
    }
  }, [modelCache, fetchingModels]);

  // Pre-fetch models for providers already configured in plans
  useEffect(() => {
    if (plans.length === 0) return;
    const usedProviders = [...new Set(plans.map((p) => p.ai_provider).filter(Boolean))];
    usedProviders.forEach((p) => fetchModels(p));
  }, [plans]); // eslint-disable-line

  // ── handlers ───────────────────────────────────────────────────────────────
  const handleProviderChange = (plan, provider) => {
    setEdits((prev) => ({ ...prev, [plan]: { ai_provider: provider, ai_model: "" } }));
    fetchModels(provider);
  };

  const handleModelChange = (plan, model) => {
    setEdits((prev) => ({ ...prev, [plan]: { ...prev[plan], ai_model: model } }));
  };

  const save = async (plan) => {
    const edit = edits[plan];
    if (!edit?.ai_model) { toast.error("Selecciona un modelo antes de guardar"); return; }
    setSaving((prev) => ({ ...prev, [plan]: true }));
    try {
      await api.put(`/api/admin/plans/${plan}`, edit);
      toast.success(`Plan ${PLAN_LABELS[plan]} actualizado`);
      // Update local plan data
      setPlans((prev) => prev.map((p) => p.plan === plan ? { ...p, ...edit } : p));
    } catch {
      toast.error("Error al guardar");
    } finally {
      setSaving((prev) => ({ ...prev, [plan]: false }));
    }
  };

  // ── render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
        Cargando configuración de modelos IA...
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Modelos IA por Plan</h1>
        <p className="text-slate-500 text-sm mt-1">
          Los modelos se cargan en tiempo real desde cada proveedor usando las API keys configuradas en Cloudflare Secrets.
        </p>
      </div>

      <div className="space-y-4">
        {plans.map((plan) => {
          const edit    = edits[plan.plan] || {};
          const models  = modelCache[edit.ai_provider] || [];
          const loading = fetchingModels[edit.ai_provider];
          const providerInfo = PROVIDERS.find((p) => p.id === edit.ai_provider);

          return (
            <div key={plan.plan} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-slate-900">{PLAN_LABELS[plan.plan]}</span>
                  {providerInfo && (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${providerInfo.badge}`}>
                      {providerInfo.label}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => save(plan.plan)}
                  disabled={saving[plan.plan]}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {saving[plan.plan] ? "Guardando…" : "Guardar"}
                </button>
              </div>

              {/* Provider + Model */}
              <div className="grid grid-cols-2 gap-4">
                {/* Provider */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Proveedor</label>
                  <select
                    value={edit.ai_provider || ""}
                    onChange={(e) => handleProviderChange(plan.plan, e.target.value)}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-slate-50"
                  >
                    {PROVIDERS.map(({ id, label }) => (
                      <option key={id} value={id}>{label}</option>
                    ))}
                  </select>
                </div>

                {/* Model */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-medium text-slate-600">Modelo</label>
                    {loading && (
                      <span className="text-[10px] text-blue-500 animate-pulse">Cargando modelos…</span>
                    )}
                    {!loading && models.length > 0 && (
                      <button
                        onClick={() => fetchModels(edit.ai_provider)}
                        className="text-[10px] text-slate-400 hover:text-blue-500 transition-colors"
                        title="Recargar lista"
                      >
                        ↻ Actualizar
                      </button>
                    )}
                  </div>

                  {loading ? (
                    <div className="w-full h-9 bg-slate-100 rounded-lg animate-pulse" />
                  ) : models.length > 0 ? (
                    <select
                      value={edit.ai_model || ""}
                      onChange={(e) => handleModelChange(plan.plan, e.target.value)}
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-slate-50"
                    >
                      <option value="">— Selecciona un modelo —</option>
                      {models.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={edit.ai_model || ""}
                        onChange={(e) => handleModelChange(plan.plan, e.target.value)}
                        placeholder={providerInfo?.placeholder || "nombre-del-modelo"}
                        className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-slate-50 placeholder-slate-400"
                      />
                      <button
                        onClick={() => {
                          setModelCache((prev) => { const n = {...prev}; delete n[edit.ai_provider]; return n; });
                          fetchModels(edit.ai_provider);
                        }}
                        className="px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors whitespace-nowrap"
                      >
                        Reintentar
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Current production model */}
              <p className="text-xs text-slate-400 mt-3">
                Activo en producción: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{plan.ai_model || "—"}</code>
              </p>
            </div>
          );
        })}
      </div>

      {/* API Keys */}
      <div className="mt-8 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-semibold text-slate-900">API Keys de proveedores</h2>
            <p className="text-xs text-slate-500 mt-0.5">Se almacenan cifradas en la base de datos. Cloudflare Workers AI no requiere key.</p>
          </div>
          <button
            onClick={saveApiKeys}
            disabled={savingKeys}
            className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {savingKeys ? "Guardando…" : "Guardar keys"}
          </button>
        </div>

        <div className="space-y-4">
          {API_KEY_PROVIDERS.map(({ id, label, placeholder, hint }) => {
            const masked = maskedKeys[`api_key_${id}`];
            const visible = showKeys[id];
            return (
              <div key={id}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-slate-700">{label}</label>
                  {masked && (
                    <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                      Configurada
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type={visible ? "text" : "password"}
                    value={apiKeys[id]}
                    onChange={(e) => setApiKeys((prev) => ({ ...prev, [id]: e.target.value }))}
                    placeholder={masked ? masked : placeholder}
                    className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-slate-50 placeholder-slate-400 font-mono"
                  />
                  <button
                    onClick={() => setShowKeys((prev) => ({ ...prev, [id]: !prev[id] }))}
                    className="px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
                    title={visible ? "Ocultar" : "Mostrar"}
                  >
                    {visible ? "🙈" : "👁"}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">{hint}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-400">
          Cloudflare Workers AI no requiere API key — usa el binding <code className="bg-slate-100 px-1 rounded">AI</code> del Worker.
        </div>
      </div>
    </div>
  );
}
