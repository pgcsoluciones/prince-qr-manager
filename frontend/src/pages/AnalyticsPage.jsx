import { useState, useEffect } from "react";
import { api } from "../utils/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import PageHeader from "../components/PageHeader.jsx";

const COUNTRY_NAMES = {
  DO: "República Dominicana", US: "Estados Unidos", MX: "México",
  CO: "Colombia", ES: "España", AR: "Argentina", PE: "Perú",
  CL: "Chile", VE: "Venezuela", EC: "Ecuador", GT: "Guatemala",
  CU: "Cuba", BO: "Bolivia", HN: "Honduras", PY: "Paraguay",
  SV: "El Salvador", NI: "Nicaragua", CR: "Costa Rica", PA: "Panamá",
  UY: "Uruguay", PR: "Puerto Rico", GB: "Reino Unido", DE: "Alemania",
  FR: "Francia", IT: "Italia", BR: "Brasil", CA: "Canadá",
};

function getCountryName(code) {
  if (!code) return "—";
  return COUNTRY_NAMES[code.toUpperCase()] || code;
}

function TrendIndicator({ current, previous }) {
  if (previous == null || previous === 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${up ? "text-emerald-600" : "text-red-500"}`}>
      {up ? (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18"/></svg>
      ) : (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3"/></svg>
      )}
      {Math.abs(pct)}%
    </span>
  );
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [links, setLinks] = useState([]);
  const [slug, setSlug] = useState("");
  const [summary, setSummary] = useState(null);
  const [advanced, setAdvanced] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/api/links").then((d) => setLinks(d.links || [])).catch(() => {});
  }, []);

  const fetchData = async () => {
    if (!slug) return;
    setLoading(true);
    setError("");
    setSummary(null);
    setAdvanced(null);
    try {
      const [sumData, advData] = await Promise.allSettled([
        api.get(`/api/analytics/summary?slug=${slug}`),
        api.get(`/api/analytics/advanced?qrId=${slug}&days=30`),
      ]);
      if (sumData.status === "fulfilled") setSummary(sumData.value.summary);
      else setError(sumData.reason?.message || "Error cargando estadísticas");
      if (advData.status === "fulfilled") setAdvanced(advData.value.analytics);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const planHasAnalytics = user?.plan !== "free" || user?.role === "superadmin";

  if (!planHasAnalytics) {
    return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto">
        <PageHeader title="Estadísticas" description="Visualiza el rendimiento de todos tus QRs" />
        <div className="card p-16 text-center animate-fade-in">
          <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center mx-auto mb-5 shadow-sm">
            <svg className="w-10 h-10 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-1.5">Estadísticas disponibles desde Starter</h3>
          <p className="text-sm text-slate-500 max-w-xs mx-auto mb-6">
            Actualiza tu plan para ver escaneos, ubicaciones y tendencias en tiempo real de todos tus QRs.
          </p>
          <a href="/dashboard/profile" className="btn-primary inline-flex mx-auto">
            Mejorar plan
          </a>
        </div>
      </div>
    );
  }

  const timeOfDayData = advanced?.timeOfDay;
  const maxTod = timeOfDayData ? Math.max(timeOfDayData.morning, timeOfDayData.afternoon, timeOfDayData.evening, timeOfDayData.night, 1) : 1;

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <PageHeader title="Estadísticas" description="Rendimiento y escaneos de tus códigos QR" />

      <div className="card p-5 mb-6">
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">Selecciona un QR</label>
            <select className="input" value={slug} onChange={(e) => setSlug(e.target.value)}>
              <option value="">— Elige un slug —</option>
              {links.map((l) => (
                <option key={l.slug} value={l.slug}>/{l.slug}</option>
              ))}
            </select>
          </div>
          <button onClick={fetchData} disabled={!slug || loading} className="btn-primary">
            {loading ? "Cargando..." : "Ver stats"}
          </button>
        </div>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </div>

      {summary && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card p-5 text-center">
              <p className="text-3xl font-bold text-brand-600">{summary.total_scans}</p>
              <p className="text-sm text-gray-500 mt-1">Escaneos totales</p>
              {advanced && (
                <div className="mt-2 flex items-center justify-center gap-2 text-xs text-slate-500">
                  <span>Esta semana: <strong>{advanced.thisWeek}</strong></span>
                  <TrendIndicator current={advanced.thisWeek} previous={advanced.lastWeek} />
                </div>
              )}
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

          {/* Week trend banner */}
          {advanced && advanced.weekTrend != null && (
            <div className={`card p-4 flex items-center gap-3 ${advanced.weekTrend >= 0 ? "bg-emerald-50 border-emerald-100" : "bg-red-50 border-red-100"}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${advanced.weekTrend >= 0 ? "bg-emerald-100" : "bg-red-100"}`}>
                {advanced.weekTrend >= 0 ? "📈" : "📉"}
              </div>
              <div>
                <p className="font-semibold text-sm text-slate-800">Tendencia semanal</p>
                <p className="text-xs text-slate-600">
                  Esta semana: <strong>{advanced.thisWeek}</strong> escaneos vs semana pasada: <strong>{advanced.lastWeek}</strong>
                  {" — "}
                  <TrendIndicator current={advanced.thisWeek} previous={advanced.lastWeek} />
                  {" vs semana anterior"}
                </p>
              </div>
            </div>
          )}

          {/* Time of day */}
          {timeOfDayData && (
            <div className="card p-5">
              <h3 className="font-semibold text-gray-800 mb-4">Escaneos por momento del día</h3>
              <div className="space-y-3">
                {[
                  { key: "morning", label: "Mañana", range: "6:00–12:00", icon: "🌅" },
                  { key: "afternoon", label: "Tarde", range: "12:00–18:00", icon: "☀️" },
                  { key: "evening", label: "Noche", range: "18:00–24:00", icon: "🌆" },
                  { key: "night", label: "Madrugada", range: "0:00–6:00", icon: "🌙" },
                ].map(t => {
                  const val = timeOfDayData[t.key] || 0;
                  const pct = Math.round((val / maxTod) * 100);
                  return (
                    <div key={t.key} className="flex items-center gap-3">
                      <span className="text-lg w-7 flex-shrink-0">{t.icon}</span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-slate-700">{t.label} <span className="text-slate-400 font-normal">{t.range}</span></span>
                          <span className="text-xs font-bold text-slate-700">{val}</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card p-5">
              <h3 className="font-semibold text-gray-800 mb-3">Top países</h3>
              {summary.top_countries?.length ? (
                <ul className="space-y-2">
                  {summary.top_countries.map((c) => (
                    <li key={c.country} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">{getCountryName(c.country)}</span>
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
