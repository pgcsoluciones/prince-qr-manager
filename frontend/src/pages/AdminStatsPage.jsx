import { useState, useEffect } from "react";
import { api } from "../utils/api.js";

const PLAN_COLORS = {
  free:       "bg-gray-100 text-gray-600",
  starter:    "bg-blue-100 text-blue-700",
  pro:        "bg-purple-100 text-purple-700",
  enterprise: "bg-amber-100 text-amber-700",
};

export default function AdminStatsPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/api/analytics/global")
      .then((d) => setStats(d.stats))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6"><p className="text-gray-400">Cargando...</p></div>;
  if (error) return <div className="p-6"><p className="text-red-600">{error}</p></div>;

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Estadísticas globales</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[
          { label: "Usuarios totales",   value: stats?.total_users  ?? 0, icon: "👥" },
          { label: "QRs creados",        value: stats?.total_links  ?? 0, icon: "🔗" },
          { label: "Escaneos totales",   value: stats?.total_scans  ?? 0, icon: "📊" },
        ].map((s) => (
          <div key={s.label} className="card p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-3xl font-bold text-gray-900">{s.value.toLocaleString()}</p>
                <p className="text-sm text-gray-500 mt-1">{s.label}</p>
              </div>
              <span className="text-2xl">{s.icon}</span>
            </div>
          </div>
        ))}
      </div>

      {stats?.plan_distribution?.length > 0 && (
        <div className="card p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Distribución por plan</h2>
          <div className="space-y-3">
            {stats.plan_distribution.map((p) => {
              const total = stats.total_users || 1;
              const pct = Math.round((p.c / total) * 100);
              return (
                <div key={p.plan}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`badge ${PLAN_COLORS[p.plan] || "bg-gray-100 text-gray-600"}`}>
                      {p.plan}
                    </span>
                    <span className="text-sm text-gray-600">{p.c} usuarios ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-500 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
