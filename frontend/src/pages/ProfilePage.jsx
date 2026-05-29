import { useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../utils/api.js";
import { toast } from "../components/Toast.jsx";

const PLAN_COLORS = {
  free:       "bg-gray-100 text-gray-600",
  starter:    "bg-blue-100 text-blue-700",
  pro:        "bg-purple-100 text-purple-700",
  enterprise: "bg-amber-100 text-amber-700",
};

export default function ProfilePage() {
  const { user } = useAuth();
  const [form, setForm]     = useState({ current: "", password: "", confirm: "" });
  const [saving, setSaving] = useState(false);

  const changePassword = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) { toast("Las contraseñas no coinciden", "error"); return; }
    if (form.password.length < 6) { toast("Contraseña mínima 6 caracteres", "error"); return; }
    setSaving(true);
    try {
      await api.post("/api/auth/change-password", { current_password: form.current, new_password: form.password });
      toast("Contraseña actualizada");
      setForm({ current: "", password: "", confirm: "" });
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Mi perfil</h1>

      {/* Info */}
      <div className="card p-5 mb-5">
        <h2 className="font-semibold text-gray-800 mb-4">Información de la cuenta</h2>
        <div className="space-y-3">
          <div className="flex justify-between items-center py-2 border-b border-gray-50">
            <span className="text-sm text-gray-500">Email</span>
            <span className="text-sm font-medium text-gray-900">{user?.email}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-gray-50">
            <span className="text-sm text-gray-500">Rol</span>
            <span className="text-sm font-medium text-gray-900 capitalize">{user?.role}</span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-sm text-gray-500">Plan</span>
            <span className={`badge ${PLAN_COLORS[user?.plan] || "bg-gray-100 text-gray-600"}`}>{user?.plan}</span>
          </div>
        </div>
      </div>

      {/* Cambiar contraseña */}
      <div className="card p-5">
        <h2 className="font-semibold text-gray-800 mb-4">Cambiar contraseña</h2>
        <form onSubmit={changePassword} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Contraseña actual</label>
            <input type="password" className="input" required
              value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nueva contraseña</label>
            <input type="password" className="input" required minLength={6}
              value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Confirmar contraseña</label>
            <input type="password" className="input" required
              value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
          </div>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Guardando..." : "Cambiar contraseña"}
          </button>
        </form>
      </div>
    </div>
  );
}
