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
import AdminUsersPage from "./pages/AdminUsersPage.jsx";
import AdminPlansPage from "./pages/AdminPlansPage.jsx";
import AdminStatsPage from "./pages/AdminStatsPage.jsx";

function Spinner() {
  return (
    <div className="min-h-screen grid place-items-center">
      <svg className="animate-spin h-8 w-8 text-brand-600" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
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
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="links" replace />} />
            <Route path="links" element={<LinksPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="profile" element={<ProfilePage />} />
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
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
