import { useState, useEffect, useCallback } from "react";
import { api } from "../utils/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import QRModal from "../components/QRModal.jsx";

const WORKER = "https://prince-qr-manager-backend.fliaprince.workers.dev";

function statusBadge(active) {
  return active
    ? <span className="badge bg-green-100 text-green-700">Activo</span>
    : <span className="badge bg-red-100 text-red-700">Inactivo</span>;
}

export default function LinksPage() {
  const { user } = useAuth();
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ slug: "", destination_url: "" });
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [qrSlug, setQrSlug] = useState(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get("/api/links");
      setLinks(data.links || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createLink = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      await api.post("/api/links", form);
      setForm({ slug: "", destination_url: "" });
      setShowForm(false);
      await load();
    } catch (e) { setError(e.message); }
    finally { setCreating(false); }
  };

  const toggle = async (slug, current) => {
    try {
      await api.patch(`/api/links/${slug}/toggle`, { is_active: current ? 0 : 1 });
      await load();
    } catch (e) { alert(e.message); }
  };

  const remove = async (slug) => {
    if (!confirm(`¿Eliminar /${slug}?`)) return;
    try {
      await api.delete(`/api/links/${slug}`);
      await load();
    } catch (e) { alert(e.message); }
  };

  const filtered = links.filter(
    (l) =>
      l.slug.includes(search.toLowerCase()) ||
      l.destination_url?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Mis QRs</h1>
          <p className="text-sm text-gray-500 mt-0.5">{links.length} enlace{links.length !== 1 ? "s" : ""}</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? "Cancelar" : "+ Nuevo QR"}
        </button>
      </div>

      {/* Formulario nuevo */}
      {showForm && (
        <div className="card p-5 mb-6">
          <h2 className="font-semibold text-gray-800 mb-4">Crear enlace QR</h2>
          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
          <form onSubmit={createLink} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Slug (sufijo de URL)</label>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden focus-within:ring-2 focus-within:ring-brand-500">
                <span className="px-3 py-2 bg-gray-50 text-gray-400 text-sm border-r border-gray-200 whitespace-nowrap">
                  {WORKER}/
                </span>
                <input
                  required
                  className="flex-1 px-3 py-2 text-sm outline-none"
                  placeholder="mi-link"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/\s/g, "-") })}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">URL destino</label>
              <input
                required
                type="url"
                className="input"
                placeholder="https://destino.com/pagina"
                value={form.destination_url}
                onChange={(e) => setForm({ ...form, destination_url: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <button type="submit" disabled={creating} className="btn-primary">
                {creating ? "Creando..." : "Crear QR"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Búsqueda */}
      <div className="mb-4">
        <input
          className="input max-w-xs"
          placeholder="Buscar slug o URL..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Tabla */}
      {loading ? (
        <p className="text-gray-400 text-sm">Cargando...</p>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-4xl mb-3">▦</p>
          <p className="text-gray-500">
            {links.length === 0 ? "Aún no tienes QRs. ¡Crea el primero!" : "Sin resultados"}
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Slug</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Destino</th>
                {user?.role !== "tenant" && (
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Propietario</th>
                )}
                <th className="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((link) => (
                <tr key={link.slug} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-brand-700 font-medium">
                    <a
                      href={`${WORKER}/${link.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline"
                    >
                      /{link.slug}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden md:table-cell max-w-xs truncate">
                    <a href={link.destination_url} target="_blank" rel="noreferrer" className="hover:underline">
                      {link.destination_url}
                    </a>
                  </td>
                  {user?.role !== "tenant" && (
                    <td className="px-4 py-3 text-gray-500 hidden lg:table-cell text-xs">
                      {link.owner_email || "—"}
                    </td>
                  )}
                  <td className="px-4 py-3">{statusBadge(link.is_active)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => setQrSlug(link.slug)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700"
                        title="Ver QR"
                      >▦</button>
                      <button
                        onClick={() => toggle(link.slug, link.is_active)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 text-xs"
                        title={link.is_active ? "Desactivar" : "Activar"}
                      >
                        {link.is_active ? "⏸" : "▶"}
                      </button>
                      <button
                        onClick={() => remove(link.slug)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600"
                        title="Eliminar"
                      >✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {qrSlug && <QRModal slug={qrSlug} onClose={() => setQrSlug(null)} />}
    </div>
  );
}
