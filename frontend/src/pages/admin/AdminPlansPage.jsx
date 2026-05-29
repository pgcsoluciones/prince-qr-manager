import { useState, useEffect, useCallback } from "react";
import { api } from "../../utils/api.js";
import { toast } from "../../components/Toast.jsx";

const PLAN_META = {
  free:       { color: "bg-slate-100 text-slate-700",   label: "Free"       },
  starter:    { color: "bg-blue-100 text-blue-700",     label: "Starter"    },
  pro:        { color: "bg-purple-100 text-purple-700", label: "Pro"        },
  enterprise: { color: "bg-amber-100 text-amber-700",   label: "Enterprise" },
};

function PlanCard({ plan, onSave }) {
  const [form, setForm]       = useState({ ...plan, trial_days: plan.trial_days || 14, billing_cycle: plan.billing_cycle || "monthly" });
  const [saving, setSaving]   = useState(false);
  const [success, setSuccess] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/api/admin/plans/${plan.plan}`, {
        max_qr:            parseInt(form.max_qr),
        max_tenants:       parseInt(form.max_tenants),
        has_analytics:     form.has_analytics ? 1 : 0,
        has_bulk:          form.has_bulk ? 1 : 0,
        has_custom_domain: form.has_custom_domain ? 1 : 0,
        price_usd:         parseFloat(form.price_usd),
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
      onSave?.();
      toast("Plan guardado");
    } catch (e) { toast(e.message, "error"); }
    finally { setSaving(false); }
  };

  const meta = PLAN_META[plan.plan] || { color: "bg-slate-100 text-slate-600", label: plan.plan };

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-1">
        <span className={`badge text-sm font-semibold ${meta.color}`}>{meta.label}</span>
        {success && <span className="text-xs text-green-600 font-medium ml-auto">Guardado</span>}
      </div>
      <p className="text-2xl font-bold text-slate-900 mb-4">${plan.price_usd}<span className="text-sm font-normal text-slate-400">/mes</span></p>

      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Máx QRs (-1 = ∞)</label>
            <input type="number" className="input" value={form.max_qr} onChange={(e) => setForm({ ...form, max_qr: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Máx Tenants</label>
            <input type="number" className="input" min={0} value={form.max_tenants} onChange={(e) => setForm({ ...form, max_tenants: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Precio (USD/mes)</label>
            <input type="number" step="0.01" min={0} className="input" value={form.price_usd} onChange={(e) => setForm({ ...form, price_usd: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Días trial</label>
            <input type="number" min={0} className="input" value={form.trial_days} onChange={(e) => setForm({ ...form, trial_days: e.target.value })} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Ciclo facturación</label>
          <select className="input" value={form.billing_cycle} onChange={(e) => setForm({ ...form, billing_cycle: e.target.value })}>
            <option value="monthly">Mensual</option>
            <option value="annual">Anual</option>
          </select>
        </div>

        <div className="space-y-2 pt-1">
          {[
            { key: "has_analytics",     label: "Analytics" },
            { key: "has_bulk",          label: "Carga masiva" },
            { key: "has_custom_domain", label: "Dominio personalizado" },
          ].map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 rounded text-primary" checked={!!form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.checked })} />
              <span className="text-sm text-gray-700">{label}</span>
            </label>
          ))}
        </div>

        <button type="submit" disabled={saving} className="btn-primary w-full mt-1">
          {saving ? "Guardando..." : "Guardar plan"}
        </button>
      </form>
    </div>
  );
}

export default function AdminPlansPage() {
  const [plans, setPlans]     = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api.get("/api/admin/plans");
      setPlans(data.plans || []);
    } catch (e) { toast(e.message, "error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Planes</h1>
      <p className="text-sm text-gray-500 mb-6">Configura límites, precios y features de cada plan.</p>

      {loading ? (
        <p className="text-gray-400 text-sm">Cargando...</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {plans.map((p) => <PlanCard key={p.plan} plan={p} onSave={load} />)}
        </div>
      )}
    </div>
  );
}
