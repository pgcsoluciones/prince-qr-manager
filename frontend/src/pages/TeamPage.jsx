import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../utils/api.js";
import { toast } from "../components/Toast.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { SkeletonCard } from "../components/Skeleton.jsx";

const ROLE_COLORS = {
  owner:    "bg-purple-100 text-purple-700",
  admin:    "bg-blue-100 text-blue-700",
  manager:  "bg-indigo-100 text-indigo-700",
  operator: "bg-green-100 text-green-700",
  viewer:   "bg-slate-100 text-slate-600",
};

const STATUS_COLORS = {
  active:  "bg-green-100 text-green-700",
  pending: "bg-amber-100 text-amber-700",
  revoked: "bg-red-100 text-red-700",
};

const ROLES = ["admin","manager","operator","viewer"];

function InviteModal({ onClose, onDone }) {
  const [email, setEmail]   = useState("");
  const [role, setRole]     = useState("viewer");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!email) return;
    setSaving(true);
    try {
      await api.post("/api/team/invite", { email, role });
      toast("Invitación enviada");
      onDone();
      onClose();
    } catch (e) { toast(e.message, "error"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-900">Invitar miembro</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
            <input type="email" className="input" placeholder="correo@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Rol</label>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <button type="submit" disabled={saving} className="btn-primary w-full">
            {saving ? "Enviando..." : "Enviar invitación"}
          </button>
        </form>
      </div>
    </div>
  );
}

function MemberCard({ member, canRevoke, onRoleChange, onRevoke }) {
  const initials = member.email.slice(0, 2).toUpperCase();
  return (
    <div className="card p-4 flex items-start gap-4">
      <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-slate-800 truncate">{member.email}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className={`badge text-xs ${ROLE_COLORS[member.role] || "bg-slate-100 text-slate-600"}`}>{member.role}</span>
          <span className={`badge text-xs ${STATUS_COLORS[member.status] || "bg-slate-100 text-slate-600"}`}>{member.status}</span>
          {member.joined_at && <span className="text-xs text-slate-400">{member.joined_at.slice(0, 10)}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <select
          className="input py-1 text-xs"
          value={member.role}
          onChange={(e) => onRoleChange(member.id, e.target.value)}
        >
          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        {canRevoke && (
          <button onClick={() => onRevoke(member.id)} className="text-xs px-2 py-1 rounded bg-red-100 text-red-600 hover:bg-red-200">
            Revocar
          </button>
        )}
      </div>
    </div>
  );
}

export default function TeamPage() {
  const { user } = useAuth();
  const [members, setMembers]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showInvite, setShowInvite] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get("/api/team/members");
      setMembers(data.members || []);
    } catch (e) { toast(e.message, "error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRoleChange = async (id, role) => {
    try { await api.patch(`/api/team/members/${id}`, { role }); toast("Rol actualizado"); load(); }
    catch (e) { toast(e.message, "error"); }
  };

  const handleRevoke = async (id) => {
    if (!confirm("¿Revocar acceso a este miembro?")) return;
    try { await api.delete(`/api/team/members/${id}`); toast("Acceso revocado"); load(); }
    catch (e) { toast(e.message, "error"); }
  };

  const isOwner = ["owner","enterprise","superadmin"].includes(user?.role);
  const isAdmin = ["admin","owner","enterprise","superadmin"].includes(user?.role);

  const pending = members.filter(m => m.status === "pending").length;
  const roleBreakdown = members.reduce((acc, m) => { acc[m.role] = (acc[m.role] || 0) + 1; return acc; }, {});

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      {showInvite && <InviteModal onClose={() => setShowInvite(false)} onDone={load} />}

      <PageHeader
        title="Mi Equipo"
        description="Gestiona los accesos y roles de los miembros de tu cuenta"
        actions={isAdmin && (
          <button onClick={() => setShowInvite(true)} className="btn-primary">
            Invitar miembro
          </button>
        )}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="card p-3 text-center">
          <p className="text-2xl font-bold text-slate-900">{members.length}</p>
          <p className="text-xs text-slate-500 mt-0.5">Total miembros</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-2xl font-bold text-amber-600">{pending}</p>
          <p className="text-xs text-slate-500 mt-0.5">Pendientes</p>
        </div>
        {Object.entries(roleBreakdown).slice(0, 2).map(([role, count]) => (
          <div key={role} className="card p-3 text-center">
            <p className="text-2xl font-bold text-slate-900">{count}</p>
            <p className="text-xs text-slate-500 mt-0.5 capitalize">{role}s</p>
          </div>
        ))}
      </div>

      {/* Member list */}
      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}</div>
      ) : members.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-slate-400 text-sm">Sin miembros en el equipo.</p>
          {isAdmin && (
            <button onClick={() => setShowInvite(true)} className="btn-primary mt-4">
              Invitar primer miembro
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {members.map((m) => (
              <MemberCard key={m.id} member={m} canRevoke={isOwner} onRoleChange={handleRoleChange} onRevoke={handleRevoke} />
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block card overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b">
                  <th className="px-4 py-3 font-medium">Miembro</th>
                  <th className="px-4 py-3 font-medium">Rol</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Invitado</th>
                  <th className="px-4 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
                          {m.email.slice(0, 2).toUpperCase()}
                        </div>
                        <span className="font-medium text-slate-800">{m.email}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge ${ROLE_COLORS[m.role] || "bg-slate-100 text-slate-600"}`}>{m.role}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge ${STATUS_COLORS[m.status] || "bg-slate-100 text-slate-600"}`}>{m.status}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{m.invited_at?.slice(0, 10)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <select
                          className="input py-1 text-xs"
                          value={m.role}
                          onChange={(e) => handleRoleChange(m.id, e.target.value)}
                          disabled={!isAdmin}
                        >
                          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        {isOwner && (
                          <button onClick={() => handleRevoke(m.id)} className="text-xs px-2 py-1 rounded bg-red-100 text-red-600 hover:bg-red-200">
                            Revocar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
