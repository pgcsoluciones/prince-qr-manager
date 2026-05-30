import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import HelpSystem from "../components/HelpSystem.jsx";
import KeyboardShortcuts from "../components/KeyboardShortcuts.jsx";
import Breadcrumbs from "../components/Breadcrumbs.jsx";
import AIBanner from "../components/AIBanner.jsx";

/* ── Plan display helpers ── */
const PLAN_LABELS = {
  free:       { label: "Free",       color: "bg-slate-100 text-slate-600",   limit: 5,   scans: 500  },
  starter:    { label: "Starter",    color: "bg-blue-100 text-blue-700",     limit: 25,  scans: 5000 },
  pro:        { label: "Pro",        color: "bg-purple-100 text-purple-700", limit: 100, scans: 50000},
  enterprise: { label: "Enterprise", color: "bg-amber-100 text-amber-700",   limit: 999, scans: null },
};

/* ── Inline SVG icon set (Heroicons Outline style) ── */
function Icon({ name, className = "w-4 h-4" }) {
  const icons = {
    qr: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
    link: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
      </svg>
    ),
    folder: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
      </svg>
    ),
    chart: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
    user: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
    building: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
      </svg>
    ),
    trending: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
      </svg>
    ),
    users: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
    credit: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
      </svg>
    ),
    logout: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
      </svg>
    ),
    menu: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
      </svg>
    ),
    x: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
    upgrade: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
      </svg>
    ),
    zap: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
    trace: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
      </svg>
    ),
    collaborators: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
      </svg>
    ),
    contacts: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0z" />
      </svg>
    ),
    report: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
    team: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
      </svg>
    ),
    settings: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    shield: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
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
    <div data-tour="plan-card" className="mx-3 mb-3 p-3.5 rounded-xl bg-gradient-to-b from-slate-50 to-white border border-slate-200 shadow-sm">
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

/* ── TRACE sub-nav removed — navigation is handled inside TracePage's top bar ── */

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

        {/* Equipo — enterprise only */}
        {isEnterprise ? (
          <NavItem to="/dashboard/team" iconName="team" label="Equipo" onClick={onNav} />
        ) : (
          <div className="nav-item opacity-50 cursor-default">
            <Icon name="team" className="w-[18px] h-[18px] flex-shrink-0" />
            <span className="flex-1">Equipo</span>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">Enterprise</span>
          </div>
        )}

        <NavItem to="/dashboard/settings" iconName="settings" label="Configuración" onClick={onNav} />

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
        {isSuperadmin && (
          <a
            href="/admin"
            className="flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-xs text-blue-600 hover:bg-blue-50 transition-colors mb-1 font-medium"
          >
            <Icon name="shield" className="w-3.5 h-3.5" />
            Panel Admin →
          </a>
        )}
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
    { to: "/dashboard/links",     icon: "qr",     label: "QRs"   },
    { to: "/dashboard/trace",     icon: "trace",  label: "TRACE" },
    { to: "/dashboard/analytics", icon: "chart",  label: "Stats" },
    { to: "/dashboard/profile",   icon: "user",   label: "Perfil"},
  ];

  return (
    <nav className="sm:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 z-40 flex safe-area-inset-bottom">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-all active:scale-95 ${
              isActive ? "text-primary" : "text-slate-400 hover:text-slate-600"
            }`
          }
        >
          {({ isActive }) => (
            <>
              <div className="relative">
                <Icon name={tab.icon} className="w-5 h-5" />
                {isActive && (
                  <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-primary" />
                )}
              </div>
              <span>{tab.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

/* ── Notification bell ── */
function NotificationBell() {
  const [open, setOpen] = useState(false);

  // Placeholder: in a real app fetch unresolved trace_alerts here
  const alerts = [];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
        aria-label="Notificaciones"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {alerts.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
            {alerts.length > 9 ? "9+" : alerts.length}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 z-50 animate-scale-in"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="font-semibold text-slate-900 text-sm">Notificaciones</p>
          </div>
          {alerts.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-slate-400 text-sm">Sin notificaciones nuevas</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {alerts.slice(0, 5).map((a, i) => (
                <div key={i} className="px-4 py-3 hover:bg-slate-50 transition-colors">
                  <p className="text-sm text-slate-700">{a.message}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{a.time}</p>
                </div>
              ))}
            </div>
          )}
          <div className="px-4 py-3 border-t border-slate-100">
            <a href="/dashboard/trace" className="text-xs text-primary font-medium hover:text-primary-dark transition-colors">
              Ver todas las alertas →
            </a>
          </div>
        </div>
      )}
    </div>
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
          <div className="flex items-center gap-2 flex-1">
            <LogoMark size="sm" />
            <span className="font-bold text-slate-900 text-sm">Intap Code</span>
          </div>
          <NotificationBell />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto pb-20 sm:pb-0">
          <AIBanner />
          <div className="p-4 sm:p-6 pb-0 sm:pb-0">
            <Breadcrumbs />
          </div>
          <Outlet />
        </main>
      </div>

      {/* ── Mobile bottom nav ── */}
      <BottomNav />

      {/* ── Global help system ── */}
      <HelpSystem />

      {/* ── Keyboard shortcuts modal ── */}
      <KeyboardShortcuts />
    </div>
  );
}
