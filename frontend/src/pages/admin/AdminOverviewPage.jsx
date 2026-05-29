import { useState, useEffect } from "react";
import { api } from "../../utils/api.js";

function KPICard({ label, value, sub, color = "blue" }) {
  const colors = {
    blue:   "bg-blue-50 text-blue-700 border-blue-100",
    green:  "bg-green-50 text-green-700 border-green-100",
    amber:  "bg-amber-50 text-amber-700 border-amber-100",
    red:    "bg-red-50 text-red-700 border-red-100",
    purple: "bg-purple-50 text-purple-700 border-purple-100",
  };
  return (
    <div className={`rounded-xl border p-5 ${colors[color]}`}>
      <p className="text-sm font-medium opacity-70">{label}</p>
      <p className="text-3xl font-bold mt-1">{value ?? "—"}</p>
      {sub && <p className="text-xs mt-1 opacity-60">{sub}</p>}
    </div>
  );
}

export default function AdminOverviewPage() {
  const [stats, setStats]       = useState(null);
  const [tenants, setTenants]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [s, t] = await Promise.all([
          api.get("/api/admin/stats"),
          api.get("/api/admin/tenants"),
        ]);
        setStats(s.stats);
        setTenants((t.tenants || []).slice(0, 10));
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="p-8 text-slate-400 text-sm">Cargando...</div>;
  if (error)   return <div className="p-8 text-red-600 text-sm">{error}</div>;

  const mrr = stats?.mrr_usd != null ? `$${Number(stats.mrr_usd).toFixed(0)}` : "$0";

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Overview</h1>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KPICard label="Total tenants"    value={stats?.total_tenants}          color="blue"   />
        <KPICard label="MRR"              value={mrr}                           color="green"  sub="ingresos mensuales" />
        <KPICard label="Trials activos"   value={stats?.trial_subscriptions}    color="amber"  />
        <KPICard label="Riesgo churn"     value={stats?.churn_risk}             color="red"    sub="vencen en 7 días" />
      </div>

      {/* Simple bar placeholder */}
      <div className="card p-5 mb-8">
        <h2 className="text-base font-semibold text-slate-800 mb-4">Nuevos tenants (últimos 30 días)</h2>
        <div className="flex items-end gap-1 h-24">
          {Array.from({ length: 30 }).map((_, i) => {
            const h = Math.max(4, Math.floor(Math.random() * 80));
            return (
              <div
                key={i}
                className="flex-1 bg-blue-200 hover:bg-blue-400 rounded-t transition-colors"
                style={{ height: `${h}%` }}
                title={`Día ${i + 1}`}
              />
            );
          })}
        </div>
        <div className="flex justify-between mt-1 text-[10px] text-slate-400">
          <span>hace 30 días</span><span>hoy</span>
        </div>
      </div>

      {/* Recent signups */}
      <div className="card p-5">
        <h2 className="text-base font-semibold text-slate-800 mb-4">Últimos registros</h2>
        {tenants.length === 0 ? (
          <p className="text-slate-400 text-sm">Sin tenants aún.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b">
                <th className="pb-2 font-medium">Email</th>
                <th className="pb-2 font-medium">Plan</th>
                <th className="pb-2 font-medium">QRs</th>
                <th className="pb-2 font-medium">Registro</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="py-2 font-medium text-slate-800">{t.email}</td>
                  <td className="py-2">
                    <span className="badge bg-blue-100 text-blue-700">{t.plan}</span>
                  </td>
                  <td className="py-2 text-slate-600">{t.qr_count ?? 0}</td>
                  <td className="py-2 text-slate-400 text-xs">{t.created_at?.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
