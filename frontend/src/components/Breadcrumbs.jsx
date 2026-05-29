import { Link, useLocation } from "react-router-dom";

const PATH_LABELS = {
  dashboard: "Inicio",
  links: "Mis QRs",
  trace: "TRACE",
  analytics: "Estadísticas",
  projects: "Proyectos",
  shortener: "Acortador",
  team: "Equipo",
  settings: "Configuración",
  profile: "Mi perfil",
  tenants: "Tenants",
  admin: "Admin",
  stats: "Estadísticas",
  users: "Usuarios",
  plans: "Planes",
  responses: "Respuestas",
};

export default function Breadcrumbs() {
  const { pathname } = useLocation();
  const segments = pathname.split("/").filter(Boolean);

  // Build crumb list with cumulative paths
  const crumbs = segments.map((seg, i) => ({
    label: PATH_LABELS[seg] ?? seg,
    path: "/" + segments.slice(0, i + 1).join("/"),
    isLast: i === segments.length - 1,
  }));

  // Don't show if only 1 level deep
  if (crumbs.length <= 1) return null;

  return (
    <nav className="flex items-center gap-1 text-xs text-slate-400 mb-4 flex-wrap" aria-label="Ruta de navegación">
      {crumbs.map((crumb, i) => (
        <span key={crumb.path} className="flex items-center gap-1">
          {i > 0 && (
            <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          )}
          {crumb.isLast ? (
            <span className="text-slate-600 font-medium">{crumb.label}</span>
          ) : (
            <Link to={crumb.path} className="hover:text-primary transition-colors">
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
