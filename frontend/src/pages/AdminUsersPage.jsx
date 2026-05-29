import { useState, useEffect, useCallback } from "react";
import { api } from "../utils/api.js";

const ROLE_COLORS = {
  superadmin: "bg-red-100 text-red-700",
  enterprise: "bg-amber-100 text-amber-700",
  tenant:     "bg-blue-100 text-blue-700",
};

const PLAN_COLORS = {
  free:       "bg-gray-100 text-gray-600",
  starter:    "bg-blue-100 text-blue-700",
  pro:        "bg-purple-100 text-purple-700",
  enterprise: "bg-amber-100 text-amber-700",
};

export default function AdminUsersPage() {
  const [users, setUsers]   = useState([]);
  const [total, setTotal]   = useState(0);
  const [page, setPage]     = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]     = useState({ email: "", password: "", role: "tenant", plan: "free" });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get(`/api/admin/users?page=${page}`);
      setUsers(data.users || []);
      setTotal(data.total || 0);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.post("/api/admin/users", form);
      setForm({ email: "", password: "", role: "tenant", plan: "free" });
      setShowForm(false);
      await load();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const toggleActive = async (u) => {
    try {
      await api.patch(`/api/admin/users/${u.id}`, { is_active: u.is_active ? 0 : 1 });
      await load();
    } catch (e) { alert(e.message); }
  };

  const remove = async (id) => {
    if (!confirm("¿Eliminar este usuario y todos sus QRs?")) return;
    try {
      await api.delete(`/api/admin/users/${id}`);
      await load();
    } catch (e) { alert(e.message); }
  };

  const filtered = users.filter(
    (u) => u.email.includes(search.toLowerCase()) || u.role.includes(search)
  );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Usuarios</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} usuarios registrados</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? "Cancelar" : "+ Nuevo usuario"}
        </button>
      </div>

      {showForm && (
        <div className="card p-5 mb-6">
          <h2 className="font-semibold mb-4">Crear usuario</h2>
          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
          <form onSubmit={create} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input type="email" required className="input" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Contraseña</label>
              <input type="password" required minLength={6} className="input" value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Rol</label>
              <select className="input" value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="tenant">tenant</option>
                <option value="enterprise">enterprise</option>
                <option value="superadmin">superadmin</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Plan</label>
              <select className="input" value={form.plan}
                onChange={(e) => setForm({ ...form, plan: e.target.value })}>
                <option value="free">free</option>
                <option value="starter">starter</option>
                <option value="pro">pro</option>
                <option value="enterprise">enterprise</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? "Creando..." : "Crear usuario"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="mb-4">
        <input className="input max-w-xs" placeholder="Filtrar por email o rol..."
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Cargando...</p>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Rol</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Plan</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Creado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${ROLE_COLORS[u.role] || "bg-gray-100 text-gray-600"}`}>{u.role}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${PLAN_COLORS[u.plan] || "bg-gray-100 text-gray-600"}`}>{u.plan}</span>
                  </td>
                  <td className="px-4 py-3">
                    {u.is_active
                      ? <span className="badge bg-green-100 text-green-700">Activo</span>
                      : <span className="badge bg-red-100 text-red-700">Inactivo</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs hidden md:table-cell">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => toggleActive(u)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 text-xs"
                        title={u.is_active ? "Desactivar" : "Activar"}
                      >
                        {u.is_active ? "⏸" : "▶"}
                      </button>
                      <button
                        onClick={() => remove(u.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600"
                        title="Eliminar"
                      >✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {total > 50 && (
            <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary text-xs">
                ← Anterior
              </button>
              <span className="text-sm text-gray-500">Página {page}</span>
              <button onClick={() => setPage((p) => p + 1)} disabled={page * 50 >= total} className="btn-secondary text-xs">
                Siguiente →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
