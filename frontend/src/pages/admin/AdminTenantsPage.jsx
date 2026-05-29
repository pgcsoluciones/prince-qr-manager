import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../utils/api.js";
import { toast } from "../../components/Toast.jsx";

const STATUS_COLORS = {
  trial:     "bg-amber-100 text-amber-700",
  active:    "bg-green-100 text-green-700",
  past_due:  "bg-red-100 text-red-700",
  cancelled: "bg-slate-100 text-slate-600",
  suspended: "bg-red-200 text-red-800",
};

export default function AdminTenantsPage() {
  const [tenants, setTenants]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [planFilter, setPlan]   = useState("");
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (planFilter) params.set("plan", planFilter);
      const data = await api.get(`/api/admin/tenants?${params}`);
      setTenants(data.tenants || []);
    } catch (e) { toast(e.message, "error"); }
    finally { setLoading(false); }
  }, [search, planFilter]);

  useEffect(() => { load(); }, [load]);

  const suspend = async (id) => {
    if (!confirm("¿Suspender este tenant?")) return;
    try { await api.post(`/api/admin/tenants/${id}/suspend`, {}); toast("Tenant suspendido"); load(); }
    catch (e) { toast(e.message, "error"); }
  };

  const unsuspend = async (id) => {
    try { await api.post(`/api/admin/tenants/${id}/unsuspend`, {}); toast("Tenant reactivado"); load(); }
    catch (e) { toast(e.message, "error"); }
  };

  const extendTrial = async (id) => {
    const days = prompt("¿Cuántos días extender el trial?", "7");
    if (!days) return;
    try { await api.post(`/api/admin/tenants/${id}/extend-trial`, { days: parseInt(days) }); toast("Trial extendido"); load(); }
    catch (e) { toast(e.message, "error"); }
  };

  const impersonate = async (id, email) => {
    if (!confirm(`¿Impersonar a ${email}?`)) return;
    try {
      const data = await api.post(`/api/admin/tenants/${id}/impersonate`, {});
      localStorage.setItem("qr_token_admin_backup", localStorage.getItem("qr_token") || "");
      localStorage.setItem("qr_token", data.token);
      localStorage.setItem("onboarding_done", "1");
      window.location.href = "/dashboard/links";
    } catch (e) { toast(e.message, "error"); }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Tenants</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          placeholder="Buscar por email..."
          className="input w-64"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input w-40" value={planFilter} onChange={(e) => setPlan(e.target.value)}>
          <option value="">Todos los planes</option>
          {["free","starter","pro","enterprise"].map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <button onClick={load} className="btn-secondary">Buscar</button>
      </div>

      {loading ? (
        <p className="text-slate-400 text-sm">Cargando...</p>
      ) : (
        <div className="card overflow-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b">
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Estado sub</th>
                <th className="px-4 py-3 font-medium">QRs</th>
                <th className="px-4 py-3 font-medium">TRACE</th>
                <th className="px-4 py-3 font-medium">Vence</th>
                <th className="px-4 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    <button
                      onClick={() => navigate(`/admin/tenants/${t.id}`)}
                      className="hover:text-blue-600 hover:underline text-left"
                    >
                      {t.email}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <span className="badge bg-blue-100 text-blue-700">{t.plan}</span>
                  </td>
                  <td className="px-4 py-3">
                    {t.sub_status && (
                      <span className={`badge ${STATUS_COLORS[t.sub_status] || "bg-slate-100 text-slate-600"}`}>
                        {t.sub_status}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{t.qr_count ?? 0}</td>
                  <td className="px-4 py-3 text-slate-600">{t.trace_points ?? 0}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {t.current_period_end?.slice(0, 10) || t.trial_ends_at?.slice(0, 10) || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      <button onClick={() => navigate(`/admin/tenants/${t.id}`)} className="btn-secondary text-xs py-1 px-2">Ver</button>
                      <button onClick={() => extendTrial(t.id)} className="btn-secondary text-xs py-1 px-2">+Trial</button>
                      {t.is_active ? (
                        <button onClick={() => suspend(t.id)} className="text-xs py-1 px-2 rounded bg-red-100 text-red-700 hover:bg-red-200">Suspender</button>
                      ) : (
                        <button onClick={() => unsuspend(t.id)} className="text-xs py-1 px-2 rounded bg-green-100 text-green-700 hover:bg-green-200">Activar</button>
                      )}
                      <button onClick={() => impersonate(t.id, t.email)} className="text-xs py-1 px-2 rounded bg-amber-100 text-amber-800 hover:bg-amber-200">Impersonar</button>
                    </div>
                  </td>
                </tr>
              ))}
              {tenants.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-sm">Sin tenants.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
