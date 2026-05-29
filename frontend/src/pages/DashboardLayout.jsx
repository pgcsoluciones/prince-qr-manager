import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

const PLAN_COLORS = {
  free:       "bg-gray-100 text-gray-600",
  starter:    "bg-blue-100 text-blue-700",
  pro:        "bg-purple-100 text-purple-700",
  enterprise: "bg-amber-100 text-amber-700",
};

function NavItem({ to, icon, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? "bg-brand-600 text-white"
            : "text-gray-600 hover:bg-gray-100"
        }`
      }
    >
      <span className="text-lg">{icon}</span>
      {label}
    </NavLink>
  );
}

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const isSuperadmin = user?.role === "superadmin";
  const isEnterprise = user?.role === "enterprise" || isSuperadmin;

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-100 flex flex-col">
        {/* Logo */}
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-600 text-white flex items-center justify-center text-xl">▦</div>
            <div>
              <p className="font-bold text-gray-900 leading-none">Intap Code</p>
              <p className="text-xs text-gray-400">QR Manager</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <NavItem to="/dashboard/links"     icon="🔗" label="Mis QRs" />
          <NavItem to="/dashboard/projects"  icon="📁" label="Proyectos" />
          <NavItem to="/dashboard/analytics" icon="📊" label="Analíticas" />
          <NavItem to="/dashboard/profile"   icon="👤" label="Mi perfil" />
          {isEnterprise && (
            <NavItem to="/dashboard/tenants" icon="🏢" label="Tenants" />
          )}

          {isSuperadmin && (
            <>
              <div className="pt-4 pb-1 px-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Superadmin</p>
              </div>
              <NavItem to="/dashboard/admin/stats" icon="📈" label="Estadísticas" />
              <NavItem to="/dashboard/admin/users" icon="👥" label="Usuarios" />
              <NavItem to="/dashboard/admin/plans" icon="💳" label="Planes" />
            </>
          )}
        </nav>

        {/* User info */}
        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-sm">
              {user?.email?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user?.email}</p>
              <span className={`badge mt-0.5 ${PLAN_COLORS[user?.plan] || "bg-gray-100 text-gray-600"}`}>
                {user?.plan} · {user?.role}
              </span>
            </div>
          </div>
          <button onClick={handleLogout} className="btn-secondary w-full text-sm">
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
