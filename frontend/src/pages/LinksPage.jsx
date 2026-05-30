import { useState, useEffect, useCallback } from "react";
import { api } from "../utils/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import CreateQRModal from "../components/CreateQRModal.jsx";
import EditQRModal from "../components/EditQRModal.jsx";
import QRDownloadModal from "../components/QRDownloadModal.jsx";
import BulkImportModal from "../components/BulkImportModal.jsx";
import { toast } from "../components/Toast.jsx";
import PageHeader from "../components/PageHeader.jsx";
import GuidedTour from "../components/GuidedTour.jsx";

const LINKS_TOUR = [
  {
    target: null,
    title: "Bienvenido a Mis Códigos QR",
    description: "Aquí creas y gestionas todos tus códigos QR dinámicos. Cuando alguien escanea el QR, lo redirige al destino que configures. Puedes cambiarlo en cualquier momento sin reimprimir el código.",
    position: "center"
  },
  {
    target: "[data-tour='create-qr']",
    title: "Crear un nuevo código QR",
    description: "Haz clic aquí para crear un QR dinámico. Puedes elegir entre URL, WhatsApp, email, WiFi, archivo PDF y más tipos de contenido.",
    position: "bottom"
  },
  {
    target: "[data-tour='qr-search']",
    title: "Busca y filtra tus códigos",
    description: "Usa el buscador para encontrar rápidamente cualquier QR. Puedes filtrar por estado (activo/inactivo) o por tipo.",
    position: "bottom"
  },
  {
    target: "[data-tour='qr-list']",
    title: "Tu lista de códigos QR",
    description: "Cada código QR muestra cuántas veces fue escaneado. Puedes editarlo, descargarlo, ver sus estadísticas o desactivarlo con el interruptor.",
    position: "top"
  },
  {
    target: "[data-tour='plan-card']",
    title: "Tu plan y recursos disponibles",
    description: "Aquí ves cuántos códigos QR has creado versus los que permite tu plan. La barra muestra el porcentaje de uso. Si llegas al límite, puedes actualizar tu plan.",
    position: "right"
  },
];

const WORKER = "https://qr.intaprd.com";

/* ── Type meta ── */
const TYPE_META = {
  url:       { label: "URL",       color: "bg-blue-50 text-blue-700 border-blue-100"    },
  whatsapp:  { label: "WhatsApp",  color: "bg-green-50 text-green-700 border-green-100" },
  instagram: { label: "Instagram", color: "bg-pink-50 text-pink-700 border-pink-100"    },
  email:     { label: "Email",     color: "bg-purple-50 text-purple-700 border-purple-100"},
  sms:       { label: "SMS",       color: "bg-yellow-50 text-yellow-700 border-yellow-100"},
  wifi:      { label: "WiFi",      color: "bg-cyan-50 text-cyan-700 border-cyan-100"    },
  vcard:     { label: "vCard",     color: "bg-indigo-50 text-indigo-700 border-indigo-100"},
  pdf:       { label: "PDF",       color: "bg-red-50 text-red-700 border-red-100"       },
};

/* ── Helpers ── */
function getStyle(link) {
  if (!link.qr_style_json) return {};
  try { return typeof link.qr_style_json === "string" ? JSON.parse(link.qr_style_json) : link.qr_style_json; }
  catch { return {}; }
}

/* ── QR colour swatch (mini preview) ── */
function QRSwatch({ link, size = "md" }) {
  const s = getStyle(link);
  const bg = s.dotColor || "#0c4a6e";
  const sz = size === "lg" ? "w-12 h-12 text-lg rounded-xl" : "w-9 h-9 text-sm rounded-lg";
  return (
    <div
      className={`${sz} flex items-center justify-center text-white font-bold flex-shrink-0 shadow-sm`}
      style={{ backgroundColor: bg }}
    >
      ▦
    </div>
  );
}

/* ── Status toggle badge ── */
function StatusToggle({ link, onToggle }) {
  return (
    <button
      onClick={() => onToggle(link)}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
        link.is_active
          ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
          : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${link.is_active ? "bg-emerald-500" : "bg-slate-400"}`} />
      {link.is_active ? "Activo" : "Inactivo"}
    </button>
  );
}

/* ── Action icon button ── */
function ActionBtn({ onClick, title, children, danger = false }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-lg text-slate-400 transition-all ${
        danger ? "hover:bg-red-50 hover:text-red-600" : "hover:bg-slate-100 hover:text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

/* ── Inline SVG icons ── */
function Ico({ name, className = "w-4 h-4" }) {
  const map = {
    edit: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    ),
    download: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
    ),
    trash: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    ),
    eye: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    ),
    grid: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
    list: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
      </svg>
    ),
    search: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
    plus: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
      </svg>
    ),
    upload: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
      </svg>
    ),
    qr: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <path d="M14 14h2v2h-2zM18 14h3v2h-3zM14 18h3v2h-3zM19 18h2v3h-2z" />
      </svg>
    ),
    chevronDown: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    ),
    externalLink: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
    ),
  };
  return map[name] ?? null;
}

/* ── Empty state ── */
function EmptyState({ hasFilters, onCreate }) {
  if (hasFilters) {
    return (
      <div className="card p-16 text-center animate-fade-in">
        <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Ico name="search" className="w-7 h-7 text-slate-400" />
        </div>
        <h3 className="font-semibold text-slate-700 mb-1">Sin resultados</h3>
        <p className="text-sm text-slate-400">Prueba cambiando los filtros de búsqueda</p>
      </div>
    );
  }
  return (
    <div className="card p-16 text-center animate-fade-in">
      <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center mx-auto mb-5 shadow-sm">
        <Ico name="qr" className="w-10 h-10 text-primary" />
      </div>
      <h3 className="text-lg font-bold text-slate-800 mb-1.5">Aún no tienes códigos QR</h3>
      <p className="text-sm text-slate-500 max-w-xs mx-auto mb-6">
        Crea tu primer código QR dinámico y comienza a trackear cada escaneo en tiempo real. Puedes cambiar el destino cuando quieras sin reimprimir.
      </p>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <button onClick={onCreate} className="btn-primary">
          <Ico name="plus" className="w-4 h-4" />
          Crear mi primer QR
        </button>
      </div>
    </div>
  );
}

/* ── Skeleton loader row ── */
function SkeletonRow() {
  return (
    <tr className="animate-pulse border-b border-slate-50">
      {[...Array(6)].map((_, i) => (
        <td key={i} className="px-4 py-3.5">
          <div className="h-4 bg-slate-100 rounded-md w-3/4" />
        </td>
      ))}
    </tr>
  );
}

/* ── Grid card ── */
function QRGridCard({ link, projectName, onEdit, onDownload, onToggle, onDelete, isSelected, onSelect }) {
  const s = getStyle(link);
  const type = TYPE_META[s.type] || TYPE_META.url;
  const bg = s.dotColor || "#0c4a6e";

  return (
    <div
      className={`card-hover p-4 flex flex-col gap-3 cursor-pointer animate-fade-in transition-all ${
        isSelected ? "ring-2 ring-primary ring-offset-1" : ""
      }`}
    >
      {/* Top: checkbox + type badge */}
      <div className="flex items-start justify-between">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onSelect(link.slug)}
          className="mt-0.5 rounded border-slate-300 text-primary focus:ring-primary/30"
          onClick={(e) => e.stopPropagation()}
        />
        <span className={`badge border ${type.color} font-medium`}>{type.label}</span>
      </div>

      {/* QR preview */}
      <div
        className="w-full aspect-square rounded-xl flex items-center justify-center text-white text-4xl font-black shadow-inner"
        style={{ backgroundColor: bg }}
        onClick={() => onDownload(link)}
      >
        ▦
      </div>

      {/* Info */}
      <div className="min-w-0">
        <a
          href={`${WORKER}/${link.slug}`}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-slate-800 hover:text-primary transition-colors text-sm truncate block"
          onClick={(e) => e.stopPropagation()}
        >
          /{link.slug}
        </a>
        {projectName !== "—" && (
          <p className="text-xs text-slate-400 truncate mt-0.5">{projectName}</p>
        )}
      </div>

      {/* Footer: status + actions */}
      <div className="flex items-center justify-between pt-1 border-t border-slate-100">
        <StatusToggle link={link} onToggle={onToggle} />
        <div className="flex items-center gap-0.5">
          <ActionBtn onClick={() => onDownload(link)} title="Ver QR">
            <Ico name="eye" className="w-3.5 h-3.5" />
          </ActionBtn>
          <ActionBtn onClick={() => onEdit(link)} title="Editar">
            <Ico name="edit" className="w-3.5 h-3.5" />
          </ActionBtn>
          <ActionBtn onClick={() => onDelete(link.slug)} title="Eliminar" danger>
            <Ico name="trash" className="w-3.5 h-3.5" />
          </ActionBtn>
        </div>
      </div>
    </div>
  );
}

/* ── Main page ── */
export default function LinksPage() {
  const { user } = useAuth();
  const [links, setLinks]             = useState([]);
  const [projects, setProjects]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState("");
  const [filterProject, setFilterProject] = useState("");
  const [filterStatus, setFilterStatus]   = useState("all");
  const [filterType, setFilterType]       = useState("all");
  const [view, setView]               = useState("list"); // "list" | "grid"
  const [showCreate, setShowCreate]   = useState(false);
  const [showBulk, setShowBulk]       = useState(false);
  const [editLink, setEditLink]       = useState(null);
  const [qrLink, setQrLink]           = useState(null);
  const [selected, setSelected]       = useState(new Set());
  const [sort, setSort]               = useState("recent");
  const [filterTag, setFilterTag]     = useState("");
  const [tourDone, setTourDone]       = useState(() => localStorage.getItem("tour_links_done") === "done");
  const [page, setPage]               = useState(1);
  const PAGE_SIZE = 15;

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

  const toggleNotify = async (link) => {
    try {
      await api.patch(`/api/links/${link.slug}/toggle`, { notify_on_scan: link.notify_on_scan ? 0 : 1 });
      await load();
      toast(link.notify_on_scan ? "Notificación desactivada" : "Notificación activada");
    } catch (e) { toast(e.message, "error"); }
  };

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
    if (!selected.size || !confirm(`¿Eliminar ${selected.size} QR${selected.size !== 1 ? "s" : ""} seleccionados?`)) return;
    try {
      await Promise.all([...selected].map((slug) => api.delete(`/api/links/${slug}`)));
      setSelected(new Set());
      await load();
      toast(`${selected.size} QRs eliminados`);
    } catch (e) { toast(e.message, "error"); }
  };

  const toggleSelect = (slug) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(slug) ? next.delete(slug) : next.add(slug);
      return next;
    });

  const projectName = (id) => projects.find((p) => p.id === id)?.name || "—";
  const canBulk = user?.plan !== "free" || user?.role === "superadmin";

  /* Collect all tags */
  const allTags = [...new Set(links.flatMap(l => {
    try { return JSON.parse(l.tags || "[]"); } catch { return []; }
  }))].filter(Boolean);

  /* Filtering */
  const filtered = links
    .filter((l) => {
      const s = getStyle(l);
      const matchSearch =
        !search ||
        l.slug.toLowerCase().includes(search.toLowerCase()) ||
        l.destination_url?.toLowerCase().includes(search.toLowerCase());
      const matchProject = !filterProject || String(l.project_id) === String(filterProject);
      const matchStatus  = filterStatus === "all" || (filterStatus === "active" ? l.is_active : !l.is_active);
      const matchType    = filterType === "all" || s.type === filterType;
      const matchTag = !filterTag || (() => { try { return JSON.parse(l.tags||"[]").includes(filterTag); } catch { return false; } })();
      return matchSearch && matchProject && matchStatus && matchType && matchTag;
    })
    .sort((a, b) =>
      sort === "recent"
        ? new Date(b.created_at || 0) - new Date(a.created_at || 0)
        : new Date(a.created_at || 0) - new Date(b.created_at || 0)
    );

  useEffect(() => { setPage(1); }, [search, filterProject, filterStatus, filterType]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const allSelected = filtered.length > 0 && selected.size === filtered.length;
  const hasFilters = !!(search || filterProject || filterStatus !== "all" || filterType !== "all");

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto">

      {/* ── Page header ── */}
      <PageHeader
        title="Mis QRs"
        description={loading ? "Cargando…" : `${links.length} código${links.length !== 1 ? "s" : ""} QR`}
        actions={
          <>
            <button
              onClick={() => { localStorage.removeItem("tour_links_done"); setTourDone(false); }}
              className="btn-secondary btn-sm gap-1.5 hidden sm:inline-flex"
            >
              ? Ver visita guiada
            </button>
            {canBulk && (
              <button onClick={() => setShowBulk(true)} className="btn-secondary btn-sm gap-1.5">
                <Ico name="upload" className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Importar CSV</span>
                <span className="sm:hidden">CSV</span>
              </button>
            )}
            <button data-tour="create-qr" onClick={() => setShowCreate(true)} className="btn-primary">
              <Ico name="plus" className="w-4 h-4" />
              Crear QR
            </button>
          </>
        }
      />

      {/* ── Filter / toolbar row ── */}
      <div className="card mb-4 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[160px] max-w-xs" data-tour="qr-search">
            <Ico name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              className="input pl-8 text-sm"
              placeholder="Buscar QRs…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Project filter */}
          <div className="relative">
            <select
              className="input w-auto text-sm pr-7 appearance-none cursor-pointer"
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
            >
              <option value="">Todos los proyectos</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <Ico name="chevronDown" className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>

          {/* Type filter */}
          <div className="relative">
            <select
              className="input w-auto text-sm pr-7 appearance-none cursor-pointer"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="all">Todos los tipos</option>
              {Object.entries(TYPE_META).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <Ico name="chevronDown" className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>

          {/* Status filter */}
          <div className="relative">
            <select
              className="input w-auto text-sm pr-7 appearance-none cursor-pointer"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">Todos</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </select>
            <Ico name="chevronDown" className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>

          {/* Sort */}
          <div className="relative hidden sm:block">
            <select
              className="input w-auto text-sm pr-7 appearance-none cursor-pointer"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="recent">Más recientes</option>
              <option value="oldest">Más antiguos</option>
            </select>
            <Ico name="chevronDown" className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>

          {/* Tag filter pills */}
          {allTags.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <button onClick={() => setFilterTag("")}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${!filterTag ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                Todas
              </button>
              {allTags.map(tag => (
                <button key={tag} onClick={() => setFilterTag(filterTag === tag ? "" : tag)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${filterTag === tag ? "bg-primary text-white" : "bg-blue-50 text-blue-700 hover:bg-blue-100"}`}>
                  #{tag}
                </button>
              ))}
            </div>
          )}

          {/* Spacer + view toggle */}
          <div className="ml-auto flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => setView("list")}
              className={`p-1.5 rounded-md transition-all ${view === "list" ? "bg-white shadow-sm text-primary" : "text-slate-400 hover:text-slate-600"}`}
              title="Vista lista"
            >
              <Ico name="list" className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView("grid")}
              className={`p-1.5 rounded-md transition-all ${view === "grid" ? "bg-white shadow-sm text-primary" : "text-slate-400 hover:text-slate-600"}`}
              title="Vista cuadrícula"
            >
              <Ico name="grid" className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Bulk actions bar ── */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-4 px-4 py-2.5 bg-blue-50 rounded-xl border border-blue-200 animate-fade-in">
          <span className="text-sm text-blue-700 font-semibold">
            {selected.size} seleccionado{selected.size !== 1 ? "s" : ""}
          </span>
          <button onClick={bulkDelete} className="btn-danger btn-sm">
            <Ico name="trash" className="w-3.5 h-3.5" />
            Eliminar
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-xs text-blue-500 hover:text-blue-700 transition-colors ml-auto"
          >
            Cancelar
          </button>
        </div>
      )}

      {/* ── Content ── */}
      {loading ? (
        /* Skeleton */
        <div className="card overflow-hidden">
          <table className="w-full">
            <tbody>
              {[...Array(5)].map((_, i) => <SkeletonRow key={i} />)}
            </tbody>
          </table>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState hasFilters={hasFilters} onCreate={() => setShowCreate(true)} />
      ) : view === "grid" ? (
        /* ── Grid view ── */
        <>
          <div data-tour="qr-list" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {paginated.map((link) => (
              <QRGridCard
                key={link.slug}
                link={link}
                projectName={projectName(link.project_id)}
                onEdit={setEditLink}
                onDownload={setQrLink}
                onToggle={toggle}
                onDelete={remove}
                isSelected={selected.has(link.slug)}
                onSelect={toggleSelect}
              />
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 card mt-3">
              <p className="text-xs text-slate-500">{filtered.length} resultados — Página {page} de {totalPages}</p>
              <div className="flex gap-1">
                <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
                  className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50">← Anterior</button>
                {Array.from({length: Math.min(5, totalPages)}, (_, i) => {
                  const p = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
                  return <button key={p} onClick={() => setPage(p)}
                    className={`px-3 py-1.5 text-xs border rounded-lg ${p === page ? "bg-primary text-white border-primary" : "border-slate-200 hover:bg-slate-50"}`}>{p}</button>;
                })}
                <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}
                  className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50">Siguiente →</button>
              </div>
            </div>
          )}
        </>
      ) : (
        /* ── List / table view ── */
        <div data-tour="qr-list" className="card overflow-hidden animate-fade-in">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80">
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 text-primary focus:ring-primary/30"
                      checked={allSelected}
                      onChange={() =>
                        allSelected
                          ? setSelected(new Set())
                          : setSelected(new Set(filtered.map((l) => l.slug)))
                      }
                    />
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider whitespace-nowrap">
                    QR Code
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">
                    Nombre / Slug
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider hidden md:table-cell">
                    Destino
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider hidden lg:table-cell">
                    Tipo
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider hidden lg:table-cell">
                    Proyecto
                  </th>
                  {user?.role !== "tenant" && (
                    <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider hidden xl:table-cell">
                      Propietario
                    </th>
                  )}
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-500 text-xs uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {paginated.map((link) => {
                  const s = getStyle(link);
                  const type = TYPE_META[s.type] || TYPE_META.url;
                  const isRowSelected = selected.has(link.slug);

                  return (
                    <tr
                      key={link.slug}
                      className={`hover:bg-slate-50/70 transition-colors ${
                        isRowSelected ? "bg-blue-50/40" : ""
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="px-4 py-3.5">
                        <input
                          type="checkbox"
                          className="rounded border-slate-300 text-primary focus:ring-primary/30"
                          checked={isRowSelected}
                          onChange={() => toggleSelect(link.slug)}
                        />
                      </td>

                      {/* QR swatch */}
                      <td className="px-4 py-3.5">
                        <button
                          onClick={() => setQrLink(link)}
                          className="hover:scale-110 transition-transform"
                          title="Ver QR"
                        >
                          <QRSwatch link={link} />
                        </button>
                      </td>

                      {/* Slug */}
                      <td className="px-4 py-3.5">
                        <a
                          href={`${WORKER}/${link.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 font-mono font-semibold text-primary hover:text-primary-dark transition-colors group"
                        >
                          /{link.slug}
                          <Ico name="externalLink" className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </a>
                      </td>

                      {/* Destination */}
                      <td className="px-4 py-3.5 hidden md:table-cell max-w-[180px]">
                        <a
                          href={link.destination_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-slate-500 hover:text-slate-700 truncate block text-xs transition-colors"
                          title={link.destination_url}
                        >
                          {link.destination_url?.replace(/^https?:\/\//, "").slice(0, 35)}
                          {(link.destination_url?.length ?? 0) > 35 ? "…" : ""}
                        </a>
                      </td>

                      {/* Type */}
                      <td className="px-4 py-3.5 hidden lg:table-cell">
                        <span className={`badge border ${type.color} font-medium`}>{type.label}</span>
                      </td>

                      {/* Project */}
                      <td className="px-4 py-3.5 text-slate-400 text-xs hidden lg:table-cell">
                        {link.project_id ? projectName(link.project_id) : s.project || "—"}
                      </td>

                      {/* Owner */}
                      {user?.role !== "tenant" && (
                        <td className="px-4 py-3.5 text-slate-400 text-xs hidden xl:table-cell truncate max-w-[140px]">
                          {link.owner_email || "—"}
                        </td>
                      )}

                      {/* Status */}
                      <td className="px-4 py-3.5">
                        <StatusToggle link={link} onToggle={toggle} />
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-0.5 justify-end">
                          <ActionBtn onClick={() => setQrLink(link)} title="Ver QR">
                            <Ico name="download" className="w-3.5 h-3.5" />
                          </ActionBtn>
                          <ActionBtn onClick={() => setEditLink(link)} title="Editar">
                            <Ico name="edit" className="w-3.5 h-3.5" />
                          </ActionBtn>
                          <ActionBtn onClick={() => toggleNotify(link)} title={link.notify_on_scan ? "Desactivar notificación" : "Activar notificación al escanear"}>
                            <svg className={`w-3.5 h-3.5 ${link.notify_on_scan ? "text-amber-500" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                            </svg>
                          </ActionBtn>
                          <ActionBtn onClick={() => remove(link.slug)} title="Eliminar" danger>
                            <Ico name="trash" className="w-3.5 h-3.5" />
                          </ActionBtn>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Table footer */}
          <div className="px-4 py-2.5 border-t border-slate-100 flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Mostrando <span className="font-semibold text-slate-600">{filtered.length}</span> de{" "}
              <span className="font-semibold text-slate-600">{links.length}</span> QRs
            </p>
            {hasFilters && (
              <button
                onClick={() => { setSearch(""); setFilterProject(""); setFilterStatus("all"); setFilterType("all"); }}
                className="text-xs text-primary hover:text-primary-dark transition-colors font-medium"
              >
                Limpiar filtros
              </button>
            )}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
              <p className="text-xs text-slate-500">{filtered.length} resultados — Página {page} de {totalPages}</p>
              <div className="flex gap-1">
                <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
                  className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50">← Anterior</button>
                {Array.from({length: Math.min(5, totalPages)}, (_, i) => {
                  const p = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
                  return <button key={p} onClick={() => setPage(p)}
                    className={`px-3 py-1.5 text-xs border rounded-lg ${p === page ? "bg-primary text-white border-primary" : "border-slate-200 hover:bg-slate-50"}`}>{p}</button>;
                })}
                <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}
                  className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50">Siguiente →</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Modals ── */}
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

      {/* Guided tour */}
      {!tourDone && (
        <GuidedTour steps={LINKS_TOUR} storageKey="tour_links_done" onFinish={() => setTourDone(true)} />
      )}
    </div>
  );
}
