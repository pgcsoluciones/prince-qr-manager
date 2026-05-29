import { useState, useEffect, useCallback } from "react";
import { api } from "../utils/api.js";

const PLAN_LABELS = {
  free:       { color: "bg-gray-100 text-gray-700",   icon: "🆓" },
  starter:    { color: "bg-blue-100 text-blue-700",   icon: "🚀" },
  pro:        { color: "bg-purple-100 text-purple-700", icon: "⚡" },
  enterprise: { color: "bg-amber-100 text-amber-700",  icon: "🏢" },
};

function PlanCard({ plan, onSave }) {
  const [form, setForm] = useState({ ...plan });
  const [saving, setSaving] = useState(false);
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
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const meta = PLAN_LABELS[plan.plan] || { color: "bg-gray-100 text-gray-600", icon: "📋" };

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">{meta.icon}</span>
        <span className={`badge text-sm font-semibold ${meta.color}`}>{plan.plan}</span>
        {success && <span className="text-xs text-green-600 font-medium ml-auto">✓ Guardado</span>}
      </div>

      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Máx QRs (-1 = ∞)</label>
            <input
              type="number"
              className="input"
              value={form.max_qr}
              onChange={(e) => setForm({ ...form, max_qr: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Máx Tenants</label>
            <input
              type="number"
              className="input"
              min={0}
              value={form.max_tenants}
              onChange={(e) => setForm({ ...form, max_tenants: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Precio (USD/mes)</label>
            <input
              type="number"
              step="0.01"
              min={0}
              className="input"
              value={form.price_usd}
              onChange={(e) => setForm({ ...form, price_usd: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-2 pt-1">
          {[
            { key: "has_analytics",     label: "Analytics" },
            { key: "has_bulk",          label: "Carga masiva" },
            { key: "has_custom_domain", label: "Dominio personalizado" },
          ].map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 rounded text-brand-600"
                checked={!!form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
              />
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
  const [plans, setPlans]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api.get("/api/admin/plans");
      setPlans(data.plans || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-gray-900 mb-2">Configuración de planes</h1>
      <p className="text-sm text-gray-500 mb-6">Edita los límites y precios de cada plan. Los cambios aplican inmediatamente.</p>

      {error && <p className="text-red-600 mb-4">{error}</p>}

      {loading ? (
        <p className="text-gray-400 text-sm">Cargando...</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {plans.map((p) => (
            <PlanCard key={p.plan} plan={p} onSave={load} />
          ))}
        </div>
      )}
    </div>
  );
}
