import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

/* ── Plan display helpers ── */
const PLAN_LABELS = {
  free:       { label: "Free",       color: "bg-slate-100 text-slate-600",   limit: 5,   scans: 500  },
  starter:    { label: "Starter",    color: "bg-blue-100 text-blue-700",     limit: 25,  scans: 5000 },
  pro:        { label: "Pro",        color: "bg-purple-100 text-purple-700", limit: 100, scans: 50000},
  enterprise: { label: "Enterprise", color: "bg-amber-100 text-amber-700",   limit: 999, scans: null },
};

/* ── Inline SVG icon set ── */
function Icon({ name, className = "w-4 h-4" }) {
  const icons = {
    qr: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <path d="M14 14h2v2h-2zM18 14h3v2h-3zM14 18h3v2h-3zM19 18h2v3h-2z" />
      </svg>
    ),
    link: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    ),
    folder: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
      </svg>
    ),
    chart: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    user: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
    building: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
    trending: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
    users: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
    credit: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path strokeLinecap="round" d="M2 10h20" />
      </svg>
    ),
    logout: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
      </svg>
    ),
    menu: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    ),
    x: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
    upgrade: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
      </svg>
    ),
    zap: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    trace: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  };
  return icons[name] ?? null;
}

/* ── Logo mark ── */
function LogoMark({ size = "md" }) {
  const cls = size === "sm"
    ? "w-7 h-7 text-[11px]"
    : "w-8 h-8 text-[13px]";
  return (
    <div className={`${cls} rounded-lg bg-primary flex items-center justify-center text-white font-extrabold flex-shrink-0 shadow-sm`}>
      IC
    </div>
  );
}

/* ── Single nav item ── */
function NavItem({ to, iconName, label, onClick, badge }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `nav-item ${isActive ? "nav-item-active" : ""}`
      }
    >
      <Icon name={iconName} className="w-[18px] h-[18px] flex-shrink-0" />
      <span className="flex-1">{label}</span>
      {badge && (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700">
          {badge}
        </span>
      )}
    </NavLink>
  );
}

/* ── Plan card ── */
function PlanCard({ user }) {
  const plan   = PLAN_LABELS[user?.plan] ?? PLAN_LABELS.free;
  const used   = user?.qr_count ?? 0;
  const total  = plan.limit;
  const pct    = Math.min(100, Math.round((used / total) * 100));
  const isEnterprise = user?.plan === "enterprise" || user?.role === "superadmin";
  const pctColor = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-400" : "bg-primary";

  return (
    <div className="mx-3 mb-3 p-3.5 rounded-xl bg-gradient-to-b from-slate-50 to-white border border-slate-200 shadow-sm">
      {/* Plan badge + count */}
      <div className="flex items-center justify-between mb-3">
        <span className={`badge ${plan.color} font-semibold`}>{plan.label}</span>
        {!isEnterprise && (
          <span className="text-[11px] text-slate-500 font-medium">
            {used} / {total} QRs
          </span>
        )}
      </div>

      {/* Progress bar */}
      {!isEnterprise && (
        <div className="w-full bg-slate-100 rounded-full h-1.5 mb-3">
          <div
            className={`${pctColor} h-1.5 rounded-full transition-all duration-500`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {/* Scans row */}
      {!isEnterprise && plan.scans && (
        <p className="text-[11px] text-slate-400 mb-3 font-medium">
          <span className="text-slate-600">{plan.scans.toLocaleString()}</span> scans/mes incluidos
        </p>
      )}

      {/* Upgrade CTA */}
      {!isEnterprise ? (
        <a
          href="/dashboard/profile"
          className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg text-xs font-semibold
                     bg-primary text-white hover:bg-primary-dark transition-colors shadow-sm"
        >
          <Icon name="zap" className="w-3 h-3" />
          Mejorar plan
        </a>
      ) : (
        <div className="flex items-center gap-1.5 text-[11px] text-amber-600 font-medium">
          <Icon name="zap" className="w-3 h-3" />
          Plan Enterprise activo
        </div>
      )}
    </div>
  );
}

/* ── Sidebar inner content (desktop + mobile drawer share this) ── */
function SidebarContent({ user, isSuperadmin, isEnterprise, onNav, onLogout }) {
  const initial = user?.email?.[0]?.toUpperCase() ?? "?";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 flex-shrink-0">
        <LogoMark />
        <div className="leading-none">
          <p className="font-bold text-slate-900 text-sm">Intap Code</p>
          <p className="text-[11px] text-slate-400 mt-0.5">QR Manager</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto min-h-0">
        <p className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
          Principal
        </p>
        <NavItem to="/dashboard/links"     iconName="qr"     label="Mis QRs"    onClick={onNav} />
        <NavItem to="/dashboard/shortener" iconName="link"   label="Acortador"  onClick={onNav} />
        <NavItem to="/dashboard/projects"  iconName="folder" label="Proyectos"  onClick={onNav} />
        <NavItem
          to="/dashboard/trace"
          iconName="trace"
          label="TRACE"
          onClick={onNav}
          badge={!["pro","enterprise"].includes(user?.plan) && user?.role !== "superadmin" ? "Pro" : undefined}
        />
        <NavItem to="/dashboard/analytics" iconName="chart"  label="Analíticas" onClick={onNav} />
        <NavItem to="/dashboard/profile"   iconName="user"   label="Mi perfil"  onClick={onNav} />

        {isEnterprise && (
          <NavItem to="/dashboard/tenants" iconName="building" label="Tenants" onClick={onNav} />
        )}

        {isSuperadmin && (
          <>
            <div className="pt-3 pb-1">
              <p className="px-3 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                Superadmin
              </p>
            </div>
            <NavItem to="/dashboard/admin/stats" iconName="trending" label="Estadísticas" onClick={onNav} />
            <NavItem to="/dashboard/admin/users" iconName="users"    label="Usuarios"     onClick={onNav} />
            <NavItem to="/dashboard/admin/plans" iconName="credit"   label="Planes"       onClick={onNav} />
          </>
        )}
      </nav>

      {/* Plan card */}
      <div className="flex-shrink-0">
        <PlanCard user={user} />
      </div>

      {/* User row */}
      <div className="flex-shrink-0 px-3 pb-4 pt-2 border-t border-slate-100">
        <div className="flex items-center gap-2.5 mb-2.5">
          <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs flex-shrink-0 ring-2 ring-blue-50">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-700 font-medium truncate">{user?.email}</p>
            <p className="text-[10px] text-slate-400 capitalize">{user?.plan ?? "free"} plan</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-xs text-slate-500
                     hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <Icon name="logout" className="w-3.5 h-3.5" />
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

/* ── Mobile bottom tab bar ── */
function BottomNav() {
  const tabs = [
    { to: "/dashboard/links",     icon: "qr",     label: "QRs"      },
    { to: "/dashboard/shortener", icon: "link",   label: "Links"    },
    { to: "/dashboard/projects",  icon: "folder", label: "Proyectos"},
    { to: "/dashboard/analytics", icon: "chart",  label: "Stats"    },
    { to: "/dashboard/profile",   icon: "user",   label: "Perfil"   },
  ];

  return (
    <nav className="sm:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 z-40 flex safe-area-inset-bottom">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
              isActive ? "text-primary" : "text-slate-400 hover:text-slate-600"
            }`
          }
        >
          <Icon name={tab.icon} className="w-5 h-5" />
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

/* ── Main layout ── */
export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isSuperadmin = user?.role === "superadmin";
  const isEnterprise = user?.role === "enterprise" || isSuperadmin;

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="min-h-screen flex bg-slate-100">

      {/* ── Desktop sidebar (fixed, white) ── */}
      <aside className="hidden sm:flex w-60 bg-white border-r border-slate-200 flex-col fixed inset-y-0 left-0 z-30 shadow-sm">
        <SidebarContent
          user={user}
          isSuperadmin={isSuperadmin}
          isEnterprise={isEnterprise}
          onNav={undefined}
          onLogout={handleLogout}
        />
      </aside>

      {/* ── Mobile sidebar overlay ── */}
      {sidebarOpen && (
        <div
          className="sm:hidden fixed inset-0 z-50 flex"
          onClick={closeSidebar}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />

          {/* Drawer */}
          <div
            className="relative w-64 bg-white flex flex-col h-full shadow-2xl animate-slide-left"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close row */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <LogoMark size="sm" />
                <span className="font-bold text-slate-900 text-sm">Intap Code</span>
              </div>
              <button
                onClick={closeSidebar}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
              >
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>

            {/* Nav content fills the drawer (minus the close row) */}
            <div className="flex-1 overflow-hidden">
              {/* We render a bare nav without the logo since we already have it above */}
              <SidebarContent
                user={user}
                isSuperadmin={isSuperadmin}
                isEnterprise={isEnterprise}
                onNav={closeSidebar}
                onLogout={handleLogout}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      <div className="flex-1 sm:ml-60 flex flex-col min-h-screen">

        {/* Mobile top bar */}
        <header className="sm:hidden sticky top-0 z-20 bg-white border-b border-slate-200 flex items-center gap-3 px-4 h-14">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 -ml-1 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
            aria-label="Abrir menú"
          >
            <Icon name="menu" className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <LogoMark size="sm" />
            <span className="font-bold text-slate-900 text-sm">Intap Code</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto pb-20 sm:pb-0">
          <Outlet />
        </main>
      </div>

      {/* ── Mobile bottom nav ── */}
      <BottomNav />
    </div>
  );
}
