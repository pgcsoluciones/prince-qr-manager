import { useState, useEffect, useCallback } from "react";
import { api } from "../utils/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { toast } from "../components/Toast.jsx";

const WORKER = "https://qr.intaprd.com";

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => toast("URL copiada al portapapeles"));
}

export default function ShortenerPage() {
  const { user } = useAuth();
  const [links, setLinks]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [slug, setSlug]         = useState("");
  const [destUrl, setDestUrl]   = useState("");
  const [creating, setCreating] = useState(false);
  const [search, setSearch]     = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api.get("/api/links");
      setLinks((data.links || []).filter(l => !l.qr_style_json || JSON.parse(l.qr_style_json || "{}").shortener));
    } catch (e) { toast(e.message, "error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    if (!slug || !destUrl) return;
    setCreating(true);
    try {
      await api.post("/api/links", {
        slug: slug.toLowerCase().replace(/[^a-z0-9-_]/g,""),
        destination_url: destUrl,
        qr_style_json: JSON.stringify({ shortener: true }),
      });
      toast("URL acortada creada");
      setSlug(""); setDestUrl("");
      await load();
    } catch (e) { toast(e.message, "error"); }
    finally { setCreating(false); }
  };

  const remove = async (s) => {
    if (!confirm(`¿Eliminar /${s}?`)) return;
    try { await api.delete(`/api/links/${s}`); await load(); toast("Eliminado"); }
    catch (e) { toast(e.message, "error"); }
  };

  const filtered = links.filter(l =>
    !search || l.slug.includes(search) || l.destination_url?.toLowerCase().includes(search)
  );

  const shortUrl = (s) => `${WORKER}/${s}`;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Acortador de URLs</h1>
        <p className="text-sm text-gray-500 mt-0.5">Crea URLs cortas y memorables al instante</p>
      </div>

      {/* Creador rápido */}
      <div className="card p-5 mb-6">
        <form onSubmit={create} className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">URL larga</label>
            <input type="url" required className="input" placeholder="https://mi-url-larga.com/con/muchos/parametros"
              value={destUrl} onChange={e => setDestUrl(e.target.value)} />
          </div>
          <div className="w-full sm:w-48">
            <label className="block text-xs font-medium text-gray-600 mb-1">Slug personalizado</label>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden focus-within:ring-2 focus-within:ring-brand-500">
              <span className="px-2 py-2 bg-gray-50 text-gray-400 text-xs border-r border-gray-200 whitespace-nowrap">/</span>
              <input required className="flex-1 px-2 py-2 text-sm outline-none font-mono" placeholder="mi-link"
                value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g,""))} />
            </div>
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={creating} className="btn-primary whitespace-nowrap">
              {creating ? "..." : "Acortar →"}
            </button>
          </div>
        </form>

        {slug && destUrl && (
          <div className="mt-3 flex items-center gap-2 p-3 bg-brand-50 rounded-lg">
            <span className="text-xs text-gray-500">Tu URL corta:</span>
            <a href={shortUrl(slug)} target="_blank" rel="noreferrer"
              className="text-sm font-mono text-brand-700 font-medium hover:underline">
              {shortUrl(slug)}
            </a>
            <button onClick={() => copyToClipboard(shortUrl(slug))}
              className="ml-auto text-xs text-gray-500 hover:text-brand-600">
              📋 Copiar
            </button>
          </div>
        )}
      </div>

      {/* Búsqueda */}
      <div className="mb-4">
        <input className="input max-w-xs text-sm" placeholder="Buscar URL..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Lista */}
      {loading ? (
        <p className="text-gray-400 text-sm">Cargando...</p>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-4xl mb-3">🔗</p>
          <p className="text-gray-500">Aún no tienes URLs acortadas</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">URL corta</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Destino</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Escaneos</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((link) => (
                <tr key={link.slug} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <a href={shortUrl(link.slug)} target="_blank" rel="noreferrer"
                        className="font-mono text-brand-700 hover:underline font-medium text-xs sm:text-sm">
                        {shortUrl(link.slug).replace("https://","").slice(0,30)}
                      </a>
                      <button onClick={() => copyToClipboard(shortUrl(link.slug))}
                        className="text-gray-400 hover:text-brand-600 shrink-0" title="Copiar">
                        📋
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden md:table-cell max-w-xs">
                    <a href={link.destination_url} target="_blank" rel="noreferrer"
                      className="hover:underline truncate block text-xs">
                      {link.destination_url?.slice(0,50)}{link.destination_url?.length > 50 ? "…" : ""}
                    </a>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-700">{link.scan_count || 0}</td>
                  <td className="px-4 py-3">
                    {link.is_active
                      ? <span className="badge bg-green-100 text-green-700">Activo</span>
                      : <span className="badge bg-red-100 text-red-700">Inactivo</span>}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => remove(link.slug)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
            {filtered.length} URL{filtered.length !== 1 ? "s" : ""} acortada{filtered.length !== 1 ? "s" : ""}
          </div>
        </div>
      )}
    </div>
  );
}
