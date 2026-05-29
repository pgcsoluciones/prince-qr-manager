import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../../utils/api.js";
import { toast } from "../../components/Toast.jsx";

const TABS = ["Info", "Suscripción", "Equipo", "IA Config", "Actividad"];

const LLM_PROVIDERS = ["claude", "openai", "gemini", "groq", "llama"];

export default function AdminTenantDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tenant, setTenant] = useState(null);
  const [members, setMembers] = useState([]);
  const [aiConfig, setAiConfig] = useState(null);
  const [sub, setSub] = useState(null);
  const [activeTab, setActiveTab] = useState("Info");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [subForm, setSubForm] = useState({ plan: "free", status: "trial", amount_usd: 0, billing_cycle: "monthly" });
  const [aiForm, setAiForm] = useState({ llm_provider: "claude", system_prompt: "", max_tokens_month: 50000, weekly_report_enabled: true });

  useEffect(() => {
    (async () => {
      try {
        const [t, s, ai] = await Promise.all([
          api.get(`/api/admin/tenants/${id}`),
          api.get(`/api/admin/tenants/${id}/subscription`),
          api.get(`/api/admin/tenants/${id}/ai-config`),
        ]);
        setTenant(t.tenant);
        setSub(s.subscription);
        setAiConfig(ai.config);
        if (s.subscription) setSubForm({ plan: s.subscription.plan, status: s.subscription.status, amount_usd: s.subscription.amount_usd || 0, billing_cycle: s.subscription.billing_cycle || "monthly" });
        if (ai.config) setAiForm({ llm_provider: ai.config.llm_provider || "claude", system_prompt: ai.config.system_prompt || "", max_tokens_month: ai.config.max_tokens_month || 50000, weekly_report_enabled: !!ai.config.weekly_report_enabled });
      } catch (e) { toast(e.message, "error"); }
      finally { setLoading(false); }
    })();
  }, [id]);

  const saveSub = async () => {
    setSaving(true);
    try { await api.put(`/api/admin/tenants/${id}/subscription`, subForm); toast("Suscripción actualizada"); }
    catch (e) { toast(e.message, "error"); }
    finally { setSaving(false); }
  };

  const saveAI = async () => {
    setSaving(true);
    try { await api.put(`/api/admin/tenants/${id}/ai-config`, aiForm); toast("Config IA actualizada"); }
    catch (e) { toast(e.message, "error"); }
    finally { setSaving(false); }
  };

  const extendTrial = async () => {
    const days = prompt("Días a extender:", "7");
    if (!days) return;
    try { await api.post(`/api/admin/tenants/${id}/extend-trial`, { days: parseInt(days) }); toast("Trial extendido"); }
    catch (e) { toast(e.message, "error"); }
  };

  const impersonate = async () => {
    if (!confirm(`¿Impersonar a ${tenant?.email}?`)) return;
    try {
      const data = await api.post(`/api/admin/tenants/${id}/impersonate`, {});
      localStorage.setItem("qr_token_admin_backup", localStorage.getItem("qr_token") || "");
      localStorage.setItem("qr_token", data.token);
      localStorage.setItem("onboarding_done", "1");
      window.location.href = "/dashboard/links";
    } catch (e) { toast(e.message, "error"); }
  };

  if (loading) return <div className="p-8 text-slate-400 text-sm">Cargando...</div>;
  if (!tenant) return <div className="p-8 text-red-600">Tenant no encontrado.</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <button onClick={() => navigate("/admin/tenants")} className="text-sm text-slate-500 hover:text-blue-600 mb-1 flex items-center gap-1">
            ← Tenants
          </button>
          <h1 className="text-xl font-bold text-slate-900">{tenant.email}</h1>
          <div className="flex gap-2 mt-1 flex-wrap">
            <span className="badge bg-blue-100 text-blue-700">{tenant.plan}</span>
            {tenant.is_active ? (
              <span className="badge bg-green-100 text-green-700">Activo</span>
            ) : (
              <span className="badge bg-red-100 text-red-700">Suspendido</span>
            )}
          </div>
        </div>
        <button onClick={impersonate} className="btn-secondary text-sm">Impersonar</button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b mb-6 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === t ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab: Info */}
      {activeTab === "Info" && (
        <div className="grid sm:grid-cols-2 gap-4">
          {[
            ["ID", tenant.id],
            ["Email", tenant.email],
            ["Plan", tenant.plan],
            ["Rol", tenant.role],
            ["QRs", tenant.qr_count ?? 0],
            ["TRACE points", tenant.trace_points ?? 0],
            ["Registro", tenant.created_at?.slice(0, 10)],
          ].map(([k, v]) => (
            <div key={k} className="card p-4">
              <p className="text-xs text-slate-500 mb-1">{k}</p>
              <p className="font-medium text-slate-800">{v ?? "—"}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Suscripción */}
      {activeTab === "Suscripción" && (
        <div className="card p-5 max-w-md">
          <h2 className="font-semibold text-slate-800 mb-4">Gestionar suscripción</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Plan</label>
              <select className="input" value={subForm.plan} onChange={(e) => setSubForm({ ...subForm, plan: e.target.value })}>
                {["free","starter","pro","enterprise"].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Estado</label>
              <select className="input" value={subForm.status} onChange={(e) => setSubForm({ ...subForm, status: e.target.value })}>
                {["trial","active","past_due","cancelled","suspended"].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Monto USD/mes</label>
              <input type="number" className="input" value={subForm.amount_usd} onChange={(e) => setSubForm({ ...subForm, amount_usd: parseFloat(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Ciclo</label>
              <select className="input" value={subForm.billing_cycle} onChange={(e) => setSubForm({ ...subForm, billing_cycle: e.target.value })}>
                <option value="monthly">Mensual</option>
                <option value="annual">Anual</option>
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={saveSub} disabled={saving} className="btn-primary flex-1">{saving ? "Guardando..." : "Guardar"}</button>
              <button onClick={extendTrial} className="btn-secondary">+Trial</button>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Equipo */}
      {activeTab === "Equipo" && (
        <div className="card p-5">
          <h2 className="font-semibold text-slate-800 mb-4">Miembros del equipo</h2>
          {members.length === 0 ? (
            <p className="text-slate-400 text-sm">Sin miembros registrados.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500 border-b">
                <th className="pb-2">Email</th><th className="pb-2">Rol</th><th className="pb-2">Estado</th>
              </tr></thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="py-2">{m.email}</td>
                    <td className="py-2"><span className="badge bg-blue-100 text-blue-700">{m.role}</span></td>
                    <td className="py-2">{m.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab: IA Config */}
      {activeTab === "IA Config" && (
        <div className="card p-5 max-w-lg">
          <h2 className="font-semibold text-slate-800 mb-4">Configuración IA</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Proveedor LLM</label>
              <select className="input" value={aiForm.llm_provider} onChange={(e) => setAiForm({ ...aiForm, llm_provider: e.target.value })}>
                {LLM_PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">System prompt personalizado</label>
              <textarea className="input h-32 resize-none" placeholder="Instrucciones personalizadas para el agente..." value={aiForm.system_prompt} onChange={(e) => setAiForm({ ...aiForm, system_prompt: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Límite tokens/mes</label>
              <input type="number" className="input" value={aiForm.max_tokens_month} onChange={(e) => setAiForm({ ...aiForm, max_tokens_month: parseInt(e.target.value) || 50000 })} />
            </div>
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={aiForm.weekly_report_enabled} onChange={(e) => setAiForm({ ...aiForm, weekly_report_enabled: e.target.checked })} className="w-4 h-4 rounded" />
                <span className="text-sm text-slate-700">Reporte semanal habilitado</span>
              </label>
            </div>
            {aiConfig && (
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-500 mb-1">Tokens usados este mes</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-200 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full"
                      style={{ width: `${Math.min(100, (aiConfig.tokens_used_month / aiConfig.max_tokens_month) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-600">{aiConfig.tokens_used_month?.toLocaleString()} / {aiConfig.max_tokens_month?.toLocaleString()}</span>
                </div>
              </div>
            )}
            <button onClick={saveAI} disabled={saving} className="btn-primary w-full">{saving ? "Guardando..." : "Guardar config IA"}</button>
          </div>
        </div>
      )}

      {/* Tab: Actividad */}
      {activeTab === "Actividad" && (
        <div className="card p-5">
          <h2 className="font-semibold text-slate-800 mb-4">Actividad reciente</h2>
          <p className="text-slate-400 text-sm">El historial de eventos se registrará en futuras versiones.</p>
        </div>
      )}
    </div>
  );
}
