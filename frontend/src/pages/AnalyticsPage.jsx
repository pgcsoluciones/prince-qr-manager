import { useState, useEffect } from "react";
import { api } from "../utils/api.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [links, setLinks] = useState([]);
  const [slug, setSlug] = useState("");
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/api/links").then((d) => setLinks(d.links || [])).catch(() => {});
  }, []);

  const fetch = async () => {
    if (!slug) return;
    setLoading(true);
    setError("");
    setSummary(null);
    try {
      const data = await api.get(`/api/analytics/summary?slug=${slug}`);
      setSummary(data.summary);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const planHasAnalytics = user?.plan !== "free" || user?.role === "superadmin";

  if (!planHasAnalytics) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold mb-4">Analíticas</h1>
        <div className="card p-12 text-center">
          <p className="text-4xl mb-3">📊</p>
          <p className="text-gray-700 font-medium">Las analíticas están disponibles desde el plan Starter</p>
          <p className="text-gray-500 text-sm mt-1">Actualiza tu plan para ver estadísticas de escaneos.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Analíticas</h1>

      <div className="card p-5 mb-6">
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">Selecciona un QR</label>
            <select
              className="input"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            >
              <option value="">— Elige un slug —</option>
              {links.map((l) => (
                <option key={l.slug} value={l.slug}>/{l.slug}</option>
              ))}
            </select>
          </div>
          <button onClick={fetch} disabled={!slug || loading} className="btn-primary">
            {loading ? "Cargando..." : "Ver stats"}
          </button>
        </div>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </div>

      {summary && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card p-5 text-center">
              <p className="text-3xl font-bold text-brand-600">{summary.total_scans}</p>
              <p className="text-sm text-gray-500 mt-1">Escaneos totales</p>
            </div>
            <div className="card p-5 text-center">
              <p className="text-3xl font-bold text-brand-600">{summary.top_countries?.length ?? 0}</p>
              <p className="text-sm text-gray-500 mt-1">Países alcanzados</p>
            </div>
            <div className="card p-5 text-center">
              <p className="text-3xl font-bold text-brand-600">{summary.devices?.length ?? 0}</p>
              <p className="text-sm text-gray-500 mt-1">Tipos de dispositivo</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card p-5">
              <h3 className="font-semibold text-gray-800 mb-3">Top países</h3>
              {summary.top_countries?.length ? (
                <ul className="space-y-2">
                  {summary.top_countries.map((c) => (
                    <li key={c.country} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">{c.country}</span>
                      <span className="font-medium text-brand-700">{c.count}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-gray-400 text-sm">Sin datos</p>}
            </div>

            <div className="card p-5">
              <h3 className="font-semibold text-gray-800 mb-3">Dispositivos</h3>
              {summary.devices?.length ? (
                <ul className="space-y-2">
                  {summary.devices.map((d) => (
                    <li key={d.device} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700 capitalize">{d.device}</span>
                      <span className="font-medium text-brand-700">{d.count}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-gray-400 text-sm">Sin datos</p>}
            </div>
          </div>

          {summary.daily?.length > 0 && (
            <div className="card p-5">
              <h3 className="font-semibold text-gray-800 mb-3">Últimos 30 días</h3>
              <div className="flex items-end gap-1 h-24">
                {[...summary.daily].reverse().map((d) => {
                  const max = Math.max(...summary.daily.map((x) => x.count));
                  const pct = max > 0 ? (d.count / max) * 100 : 0;
                  return (
                    <div
                      key={d.day}
                      className="flex-1 bg-brand-500 rounded-t hover:bg-brand-600 transition-colors"
                      style={{ height: `${pct}%`, minHeight: pct > 0 ? "4px" : "0" }}
                      title={`${d.day}: ${d.count}`}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
