import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import { ToastProvider } from "./components/Toast.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import DashboardLayout from "./pages/DashboardLayout.jsx";
import LinksPage from "./pages/LinksPage.jsx";
import AnalyticsPage from "./pages/AnalyticsPage.jsx";
import ProjectsPage from "./pages/ProjectsPage.jsx";
import TenantsPage from "./pages/TenantsPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import ShortenerPage from "./pages/ShortenerPage.jsx";
import AdminUsersPage from "./pages/AdminUsersPage.jsx";
import AdminPlansPage from "./pages/AdminPlansPage.jsx";
import AdminStatsPage from "./pages/AdminStatsPage.jsx";
import OnboardingPage from "./pages/OnboardingPage.jsx";
import TracePage from "./pages/TracePage.jsx";
import CollaboratorsPage from "./pages/CollaboratorsPage.jsx";
import TraceResponsesPage from "./pages/TraceResponsesPage.jsx";
import TeamPage from "./pages/TeamPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";
import AdminLayout from "./pages/AdminLayout.jsx";
import AdminOverviewPage from "./pages/admin/AdminOverviewPage.jsx";
import AdminTenantsPage from "./pages/admin/AdminTenantsPage.jsx";
import AdminTenantDetailPage from "./pages/admin/AdminTenantDetailPage.jsx";
import AdminNotificationsPage from "./pages/admin/AdminNotificationsPage.jsx";
import AdminPlansPageNew from "./pages/admin/AdminPlansPage.jsx";
import AdminAIModelsPage from "./pages/admin/AdminAIModelsPage.jsx";
import AdminCodiConfigPage from "./pages/admin/AdminCodiConfigPage.jsx";
import AdminBillingPage from "./pages/admin/AdminBillingPage.jsx";

function Spinner() {
  return (
    <div className="min-h-screen grid place-items-center bg-slate-100">
      <div className="flex flex-col items-center gap-3">
        <svg className="animate-spin h-8 w-8 text-primary" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <p className="text-sm text-slate-400 font-medium">Cargando…</p>
      </div>
    </div>
  );
}

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard/links" replace />;
  return children;
}

/* Redirect to onboarding if the user hasn't completed it yet */
function OnboardingGate({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  // Accept any of: old global key, new per-user key, or API settings flag
  const done =
    localStorage.getItem("onboarding_done") ||
    localStorage.getItem("onboarding_done_" + user.id) ||
    user?.settings?.onboarding_done;
  if (!done) return <Navigate to="/onboarding" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/dashboard"
            element={
              <OnboardingGate>
                <DashboardLayout />
              </OnboardingGate>
            }
          >
            <Route index element={<Navigate to="links" replace />} />
            <Route path="links" element={<LinksPage />} />
            <Route path="shortener" element={<ShortenerPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="trace" element={<TracePage />} />
            <Route path="trace/:pointId/responses" element={<TraceResponsesPage />} />
            <Route path="collaborators" element={<CollaboratorsPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="team" element={
              <ProtectedRoute roles={["enterprise", "superadmin"]}>
                <TeamPage />
              </ProtectedRoute>
            } />
            <Route path="tenants" element={
              <ProtectedRoute roles={["enterprise", "superadmin"]}>
                <TenantsPage />
              </ProtectedRoute>
            } />
            <Route path="admin/users" element={
              <ProtectedRoute roles={["superadmin"]}>
                <AdminUsersPage />
              </ProtectedRoute>
            } />
            <Route path="admin/plans" element={
              <ProtectedRoute roles={["superadmin"]}>
                <AdminPlansPage />
              </ProtectedRoute>
            } />
            <Route path="admin/stats" element={
              <ProtectedRoute roles={["superadmin"]}>
                <AdminStatsPage />
              </ProtectedRoute>
            } />
          </Route>

          {/* Super Admin SPA */}
          <Route path="/admin" element={
            <ProtectedRoute roles={["superadmin"]}>
              <AdminLayout />
            </ProtectedRoute>
          }>
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<AdminOverviewPage />} />
            <Route path="tenants" element={<AdminTenantsPage />} />
            <Route path="tenants/:id" element={<AdminTenantDetailPage />} />
            <Route path="notifications" element={<AdminNotificationsPage />} />
            <Route path="plans" element={<AdminPlansPageNew />} />
            <Route path="ai-models" element={<AdminAIModelsPage />} />
            <Route path="codi-config" element={<AdminCodiConfigPage />} />
            <Route path="billing" element={<AdminBillingPage />} />
          </Route>

          <Route path="/onboarding" element={
            <ProtectedRoute>
              <OnboardingPage />
            </ProtectedRoute>
          } />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
