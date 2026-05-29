import { useState, useEffect, useCallback } from "react";
import { api } from "../utils/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import CreateQRModal from "../components/CreateQRModal.jsx";
import EditQRModal from "../components/EditQRModal.jsx";
import QRDownloadModal from "../components/QRDownloadModal.jsx";
import BulkImportModal from "../components/BulkImportModal.jsx";
import { toast } from "../components/Toast.jsx";

const WORKER = "https://prince-qr-manager-backend.fliaprince.workers.dev";

const TYPE_ICONS = { url:"🔗", whatsapp:"💬", instagram:"📷", email:"📧", sms:"💬", wifi:"📶", vcard:"👤", pdf:"📄" };

function StatusBadge({ active }) {
  return active
    ? <span className="badge bg-green-100 text-green-700">Activo</span>
    : <span className="badge bg-red-100 text-red-700">Inactivo</span>;
}

function QRMiniPreview({ styleJson }) {
  const s = styleJson ? (typeof styleJson === "string" ? JSON.parse(styleJson) : styleJson) : {};
  return (
    <div
      className="w-8 h-8 rounded-md flex items-center justify-center text-white text-xs font-bold"
      style={{ backgroundColor: s.dotColor || "#0c4a6e" }}
    >▦</div>
  );
}

export default function LinksPage() {
  const { user } = useAuth();
  const [links, setLinks]           = useState([]);
  const [projects, setProjects]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [filterProject, setFilterProject] = useState("");
  const [filterStatus, setFilterStatus]   = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [showBulk, setShowBulk]     = useState(false);
  const [editLink, setEditLink]     = useState(null);
  const [qrLink, setQrLink]         = useState(null);
  const [selected, setSelected]     = useState(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [linksData, projData] = await Promise.all([
        api.get("/api/links"),
        api.get("/api/projects"),
      ]);
      setLinks(linksData.links || []);
      setProjects(projData.projects || []);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (link) => {
    try {
      await api.patch(`/api/links/${link.slug}/toggle`, { is_active: link.is_active ? 0 : 1 });
      await load();
      toast(link.is_active ? "QR desactivado" : "QR activado");
    } catch (e) { toast(e.message, "error"); }
  };

  const remove = async (slug) => {
    if (!confirm(`¿Eliminar /${slug}? Esta acción no se puede deshacer.`)) return;
    try {
      await api.delete(`/api/links/${slug}`);
      await load();
      toast("QR eliminado");
    } catch (e) { toast(e.message, "error"); }
  };

  const bulkDelete = async () => {
    if (!selected.size || !confirm(`¿Eliminar ${selected.size} QRs seleccionados?`)) return;
    try {
      await Promise.all([...selected].map((slug) => api.delete(`/api/links/${slug}`)));
      setSelected(new Set());
      await load();
      toast(`${selected.size} QRs eliminados`);
    } catch (e) { toast(e.message, "error"); }
  };

  const toggleSelect = (slug) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(slug) ? next.delete(slug) : next.add(slug);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(filtered.map((l) => l.slug)));
  };

  const projectName = (id) => projects.find((p) => p.id === id)?.name || "—";

  const filtered = links.filter((l) => {
    const matchSearch = !search || l.slug.includes(search.toLowerCase()) || l.destination_url?.toLowerCase().includes(search.toLowerCase());
    const matchProject = !filterProject || l.project_id === filterProject;
    const matchStatus = filterStatus === "all" || (filterStatus === "active" ? l.is_active : !l.is_active);
    return matchSearch && matchProject && matchStatus;
  });

  const canBulk = user?.plan !== "free" || user?.role === "superadmin";

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Mis QRs</h1>
          <p className="text-sm text-gray-500 mt-0.5">{links.length} enlace{links.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canBulk && (
            <button onClick={() => setShowBulk(true)} className="btn-secondary text-sm">
              📤 Importar CSV
            </button>
          )}
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            + Nuevo QR
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          className="input max-w-xs text-sm"
          placeholder="🔍 Buscar slug o URL..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input w-auto text-sm" value={filterProject} onChange={(e) => setFilterProject(e.target.value)}>
          <option value="">Todos los proyectos</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="input w-auto text-sm" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="all">Todos</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
        </select>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-4 p-3 bg-brand-50 rounded-xl border border-brand-100">
          <span className="text-sm text-brand-700 font-medium">{selected.size} seleccionado{selected.size !== 1 ? "s" : ""}</span>
          <button onClick={bulkDelete} className="btn-danger text-xs py-1.5">Eliminar selección</button>
          <button onClick={() => setSelected(new Set())} className="text-xs text-gray-500 hover:text-gray-700">Deseleccionar</button>
        </div>
      )}

      {/* Tabla */}
      {loading ? (
        <div className="card p-12 text-center"><p className="text-gray-400">Cargando...</p></div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-4xl mb-3">▦</p>
          <p className="text-gray-500">{links.length === 0 ? "Aún no tienes QRs. ¡Crea el primero!" : "Sin resultados para ese filtro"}</p>
          {links.length === 0 && (
            <button onClick={() => setShowCreate(true)} className="btn-primary mt-4">+ Crear mi primer QR</button>
          )}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 w-8">
                  <input type="checkbox" className="rounded"
                    checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={() => selected.size === filtered.length ? setSelected(new Set()) : selectAll()}
                  />
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">QR</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Slug</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Destino</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Proyecto</th>
                {user?.role !== "tenant" && (
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden xl:table-cell">Propietario</th>
                )}
                <th className="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((link) => {
                const styleObj = link.qr_style_json
                  ? (typeof link.qr_style_json === "string" ? JSON.parse(link.qr_style_json) : link.qr_style_json)
                  : {};
                const typeIcon = TYPE_ICONS[styleObj.type] || "🔗";

                return (
                  <tr key={link.slug} className={`hover:bg-gray-50 transition-colors ${selected.has(link.slug) ? "bg-brand-50" : ""}`}>
                    <td className="px-4 py-3">
                      <input type="checkbox" className="rounded"
                        checked={selected.has(link.slug)}
                        onChange={() => toggleSelect(link.slug)} />
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => setQrLink(link)} className="flex items-center gap-1.5 hover:scale-105 transition-transform" title="Ver QR">
                        <QRMiniPreview styleJson={link.qr_style_json} />
                        <span className="text-xs hidden sm:inline">{typeIcon}</span>
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <a href={`${WORKER}/${link.slug}`} target="_blank" rel="noreferrer"
                        className="font-mono text-brand-700 hover:underline font-medium">
                        /{link.slug}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell max-w-[200px]">
                      <a href={link.destination_url} target="_blank" rel="noreferrer"
                        className="hover:underline truncate block" title={link.destination_url}>
                        {link.destination_url?.slice(0, 40)}{link.destination_url?.length > 40 ? "…" : ""}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs hidden lg:table-cell">
                      {link.project_id ? projectName(link.project_id) : styleObj.project || "—"}
                    </td>
                    {user?.role !== "tenant" && (
                      <td className="px-4 py-3 text-gray-400 text-xs hidden xl:table-cell">
                        {link.owner_email || "—"}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <button onClick={() => toggle(link)} title="Cambiar estado">
                        <StatusBadge active={link.is_active} />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => setQrLink(link)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-brand-600" title="Ver QR">
                          ▦
                        </button>
                        <button onClick={() => setEditLink(link)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-blue-600" title="Editar">
                          ✏️
                        </button>
                        <button onClick={() => toggle(link)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-amber-600 text-xs" title={link.is_active ? "Desactivar" : "Activar"}>
                          {link.is_active ? "⏸" : "▶"}
                        </button>
                        <button onClick={() => remove(link.slug)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600" title="Eliminar">
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
            Mostrando {filtered.length} de {links.length} QRs
          </div>
        </div>
      )}

      {/* Modales */}
      {showCreate && (
        <CreateQRModal projects={projects} onClose={() => setShowCreate(false)} onCreated={load} />
      )}
      {showBulk && (
        <BulkImportModal onClose={() => setShowBulk(false)} onImported={load} />
      )}
      {editLink && (
        <EditQRModal link={editLink} projects={projects} onClose={() => setEditLink(null)} onSaved={load} />
      )}
      {qrLink && (
        <QRDownloadModal slug={qrLink.slug} styleJson={qrLink.qr_style_json} onClose={() => setQrLink(null)} />
      )}
    </div>
  );
}
