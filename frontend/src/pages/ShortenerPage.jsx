import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../utils/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { toast } from "../components/Toast.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { Skeleton } from "../components/Skeleton.jsx";
import QRCodeStyling from "qr-code-styling";

const WORKER = "https://qr.intaprd.com";

function ShortLinkQRModal({ slug, onClose }) {
  const qrRef = useRef(null);
  const qrInstance = useRef(null);
  const url = `${WORKER}/corto/${slug}`;

  useEffect(() => {
    if (!qrRef.current) return;
    qrInstance.current = new QRCodeStyling({
      width: 240, height: 240,
      data: url,
      dotsOptions: { color: "#1e293b", type: "square" },
      backgroundOptions: { color: "#ffffff" },
    });
    qrInstance.current.append(qrRef.current);
  }, [url]);

  const download = () => {
    qrInstance.current?.download({ name: `qr-${slug}`, extension: "png" });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-xs w-full" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-900 text-sm">QR para /{slug}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
        </div>
        <div ref={qrRef} className="flex justify-center mb-3" />
        <p className="text-xs text-center text-slate-500 font-mono mb-4 break-all">{url}</p>
        <div className="flex gap-2">
          <button onClick={download} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors">
            Descargar PNG
          </button>
          <button onClick={onClose} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const [qrModalSlug, setQrModalSlug] = useState(null);

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
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <PageHeader title="Acortador de URLs" description="Crea URLs cortas y memorables al instante" />

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
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-16 text-center animate-fade-in">
          <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center mx-auto mb-5 shadow-sm">
            <svg className="w-10 h-10 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-1.5">Aún no tienes enlaces acortados</h3>
          <p className="text-sm text-slate-500 max-w-xs mx-auto">
            Usa el formulario de arriba para crear tu primer enlace corto y rastreable.
          </p>
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
                      <button onClick={() => setQrModalSlug(link.slug)}
                        className="text-gray-400 hover:text-indigo-600 shrink-0 text-xs border border-gray-200 hover:border-indigo-300 rounded px-1.5 py-0.5 font-medium" title="Ver QR">
                        QR
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

    {qrModalSlug && <ShortLinkQRModal slug={qrModalSlug} onClose={() => setQrModalSlug(null)} />}
    </div>
  );
}
