import { useState, useEffect, useCallback } from "react";
import { api } from "../../utils/api.js";
import { toast } from "../../components/Toast.jsx";

const PROVIDERS = {
  anthropic:  { label: "Anthropic",   badge: "bg-orange-100 text-orange-700" },
  openai:     { label: "OpenAI",      badge: "bg-green-100 text-green-700"  },
  google:     { label: "Google AI",   badge: "bg-blue-100 text-blue-700"    },
  cloudflare: { label: "Cloudflare",  badge: "bg-yellow-100 text-yellow-700"},
};

const MODELS_BY_PROVIDER = {
  anthropic:  ["claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-4-6"],
  openai:     ["gpt-4o-mini", "gpt-4o"],
  google:     ["gemini-1.5-flash", "gemini-1.5-pro"],
  cloudflare: ["@cf/meta/llama-3.1-8b-instruct", "@cf/mistral/mistral-7b-instruct-v0.1"],
};

const PLAN_ORDER = ["free", "starter", "pro", "enterprise"];
const PLAN_LABELS = { free: "Free", starter: "Starter", pro: "Pro", enterprise: "Enterprise" };

export default function AdminAIModelsPage() {
  const [plans, setPlans] = useState([]);
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get("/api/plans");
      const ordered = PLAN_ORDER.map((p) => data.plans?.find((x) => x.plan === p)).filter(Boolean);
      setPlans(ordered);
      const initial = {};
      ordered.forEach((p) => {
        initial[p.plan] = { ai_provider: p.ai_provider || "anthropic", ai_model: p.ai_model || "claude-haiku-4-5-20251001" };
      });
      setEdits(initial);
    } catch {
      toast.error("Error cargando planes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleProviderChange = (plan, provider) => {
    const defaultModel = MODELS_BY_PROVIDER[provider]?.[0] || "";
    setEdits((prev) => ({ ...prev, [plan]: { ai_provider: provider, ai_model: defaultModel } }));
  };

  const handleModelChange = (plan, model) => {
    setEdits((prev) => ({ ...prev, [plan]: { ...prev[plan], ai_model: model } }));
  };

  const save = async (plan) => {
    setSaving((prev) => ({ ...prev, [plan]: true }));
    try {
      await api.put(`/api/admin/plans/${plan}`, edits[plan]);
      toast.success(`Plan ${PLAN_LABELS[plan]} actualizado`);
    } catch {
      toast.error("Error al guardar");
    } finally {
      setSaving((prev) => ({ ...prev, [plan]: false }));
    }
  };

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
          Define qué proveedor y modelo usa el agente Codi según el plan del usuario.
        </p>
      </div>

      <div className="space-y-4">
        {plans.map((plan) => {
          const edit = edits[plan.plan] || {};
          const availableModels = MODELS_BY_PROVIDER[edit.ai_provider] || [];
          const providerInfo = PROVIDERS[edit.ai_provider] || {};

          return (
            <div key={plan.plan} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-slate-900">{PLAN_LABELS[plan.plan]}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${providerInfo.badge || "bg-slate-100 text-slate-600"}`}>
                    {providerInfo.label || edit.ai_provider}
                  </span>
                </div>
                <button
                  onClick={() => save(plan.plan)}
                  disabled={saving[plan.plan]}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {saving[plan.plan] ? "Guardando…" : "Guardar"}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Proveedor</label>
                  <select
                    value={edit.ai_provider || ""}
                    onChange={(e) => handleProviderChange(plan.plan, e.target.value)}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-slate-50"
                  >
                    {Object.entries(PROVIDERS).map(([id, { label }]) => (
                      <option key={id} value={id}>{label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Modelo</label>
                  <select
                    value={edit.ai_model || ""}
                    onChange={(e) => handleModelChange(plan.plan, e.target.value)}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-slate-50"
                  >
                    {availableModels.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>

              <p className="text-xs text-slate-400 mt-3">
                Modelo activo en producción: <code className="bg-slate-100 px-1 rounded">{plan.ai_model || "—"}</code>
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <strong>Nota:</strong> Los cambios aplican al próximo mensaje que envíe cada usuario. No requiere redeploy.
      </div>
    </div>
  );
}
