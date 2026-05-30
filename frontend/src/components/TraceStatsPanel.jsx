import { useState, useEffect } from "react";
import { api } from "../utils/api.js";

function NpsGauge({ value }) {
  if (value == null) return <span className="text-3xl font-bold text-slate-300">—</span>;
  const color = value >= 9 ? "text-green-600" : value >= 7 ? "text-amber-500" : "text-red-600";
  return <span className={`text-3xl font-bold ${color}`}>{value}</span>;
}

function CssBarChart({ data, maxValue }) {
  if (!data || data.length === 0) return <p className="text-xs text-slate-400 py-4">Sin datos</p>;
  const max = maxValue || Math.max(...data.map(d => d.count), 1);
  return (
    <div className="flex items-end gap-0.5 h-20 overflow-x-auto pb-1">
      {data.map((d, i) => {
        const pct = Math.round((d.count / max) * 100);
        return (
          <div key={i} className="flex flex-col items-center flex-shrink-0" style={{ width: `${Math.max(100 / data.length, 6)}%`, minWidth: 4 }}>
            <div
              className="w-full bg-blue-400 rounded-t transition-all"
              style={{ height: `${Math.max(pct, 2)}%` }}
              title={`${d.day}: ${d.count}`}
            />
          </div>
        );
      })}
    </div>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
      <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color || "text-slate-900"}`}>{value ?? "—"}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function TraceStatsPanel({ onBack }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/api/trace/stats")
      .then(d => setStats(d.stats))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const nps = stats?.npsDistribution;
  const total = (nps?.promoters || 0) + (nps?.neutrals || 0) + (nps?.detractors || 0);
  const pct = (n) => total ? Math.round((n / total) * 100) : 0;

  return (
    <div className="p-5 space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors">
          ← Volver
        </button>
        <div>
          <h2 className="text-base font-bold text-slate-900">Estadísticas TRACE</h2>
          <p className="text-xs text-slate-500">Análisis completo de tus puntos de control y respuestas</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />)}</div>
      ) : !stats ? (
        <p className="text-sm text-slate-400 text-center py-10">No se pudieron cargar las estadísticas.</p>
      ) : (
        <>
          {/* Overview cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total respuestas" value={stats.totalResponses} />
            <StatCard label="Puntos activos" value={stats.activePoints} color="text-blue-700" />
            <StatCard label="Contactos únicos" value={stats.totalContacts} color="text-indigo-700" />
            <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm text-center">
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest mb-2">NPS Promedio</p>
              <NpsGauge value={stats.avgNps} />
              <p className="text-[11px] text-slate-400 mt-1">/10</p>
            </div>
          </div>

          {/* Last 30 days chart */}
          <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
            <p className="text-sm font-semibold text-slate-700 mb-3">Respuestas últimos 30 días</p>
            <CssBarChart data={stats.last30Days} />
            <p className="text-[10px] text-slate-400 mt-1">Cada barra representa un día</p>
          </div>

          {/* NPS Distribution */}
          <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
            <p className="text-sm font-semibold text-slate-700 mb-3">Distribución NPS</p>
            <div className="space-y-3">
              {[
                { label: "Promotores (9-10)", value: nps?.promoters || 0, color: "bg-green-400", textColor: "text-green-700" },
                { label: "Neutros (7-8)",     value: nps?.neutrals  || 0, color: "bg-amber-400", textColor: "text-amber-700" },
                { label: "Detractores (0-6)", value: nps?.detractors || 0, color: "bg-red-400",   textColor: "text-red-700"   },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-3">
                  <span className="text-xs text-slate-600 w-36 flex-shrink-0">{item.label}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden">
                    <div className={`h-full ${item.color} rounded-full transition-all`} style={{ width: `${pct(item.value)}%` }} />
                  </div>
                  <span className={`text-xs font-bold ${item.textColor} w-16 text-right flex-shrink-0`}>{item.value} ({pct(item.value)}%)</span>
                </div>
              ))}
            </div>
            {total === 0 && <p className="text-xs text-slate-400 mt-3">Sin datos de NPS aún</p>}
          </div>

          {/* Top points */}
          {stats.topPoints && stats.topPoints.length > 0 && (
            <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
              <p className="text-sm font-semibold text-slate-700 mb-3">Top puntos de control</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-100">
                      <th className="text-left pb-2 font-semibold">Punto</th>
                      <th className="text-left pb-2 font-semibold">Tipo</th>
                      <th className="text-right pb-2 font-semibold">Respuestas</th>
                      <th className="text-right pb-2 font-semibold">NPS Prom.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.topPoints.map((p, i) => (
                      <tr key={i} className="border-b border-slate-50 last:border-0">
                        <td className="py-2 font-medium text-slate-800">{p.name}</td>
                        <td className="py-2 text-slate-500 capitalize">{p.point_type || "—"}</td>
                        <td className="py-2 text-right font-bold text-blue-700">{p.responses || 0}</td>
                        <td className="py-2 text-right">
                          {p.avg_nps != null ? (
                            <span className={`font-bold ${Number(p.avg_nps) >= 9 ? "text-green-600" : Number(p.avg_nps) >= 7 ? "text-amber-500" : "text-red-600"}`}>
                              {Number(p.avg_nps).toFixed(1)}
                            </span>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
