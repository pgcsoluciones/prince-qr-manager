import { useState, useEffect, useCallback } from "react";
import { api } from "../../utils/api.js";
import { toast } from "../../components/Toast.jsx";

const SEGMENTS = ["all","free","starter","pro","enterprise"];
const CHANNELS = ["in_app","email","whatsapp"];

export default function AdminNotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [showForm, setShowForm]           = useState(false);
  const [saving, setSaving]               = useState(false);
  const [form, setForm] = useState({ title: "", body: "", segment: "all", channel: "in_app" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get("/api/admin/notifications");
      setNotifications(data.notifications || []);
    } catch (e) { toast(e.message, "error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title || !form.body) { toast("Título y mensaje requeridos", "error"); return; }
    setSaving(true);
    try {
      await api.post("/api/admin/notifications", form);
      toast("Notificación creada");
      setForm({ title: "", body: "", segment: "all", channel: "in_app" });
      setShowForm(false);
      load();
    } catch (e) { toast(e.message, "error"); }
    finally { setSaving(false); }
  };

  const send = async (id) => {
    if (!confirm("¿Enviar esta notificación?")) return;
    try { await api.post(`/api/admin/notifications/${id}/send`, {}); toast("Notificación enviada"); load(); }
    catch (e) { toast(e.message, "error"); }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Notificaciones</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? "Cancelar" : "Nueva notificación"}
        </button>
      </div>

      {showForm && (
        <div className="card p-5 mb-6">
          <h2 className="font-semibold text-slate-800 mb-4">Crear notificación</h2>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Título</label>
              <input className="input" placeholder="Título..." value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Mensaje</label>
              <textarea className="input h-28 resize-none" placeholder="Cuerpo del mensaje..." value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Segmento</label>
                <select className="input" value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })}>
                  {SEGMENTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Canal</label>
                <select className="input" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
                  {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <button type="submit" disabled={saving} className="btn-primary w-full">
              {saving ? "Guardando..." : "Crear notificación"}
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <p className="text-slate-400 text-sm">Cargando...</p>
      ) : (
        <div className="space-y-3">
          {notifications.length === 0 && <p className="text-slate-400 text-sm">Sin notificaciones.</p>}
          {notifications.map((n) => (
            <div key={n.id} className="card p-4 flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-semibold text-slate-800 text-sm">{n.title}</span>
                  <span className={`badge text-[10px] ${n.status === "sent" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                    {n.status}
                  </span>
                  <span className="badge bg-slate-100 text-slate-600 text-[10px]">{n.segment}</span>
                  <span className="badge bg-blue-100 text-blue-700 text-[10px]">{n.channel}</span>
                </div>
                <p className="text-sm text-slate-600 line-clamp-2">{n.body}</p>
                <p className="text-xs text-slate-400 mt-1">{n.created_at?.slice(0, 10)}</p>
              </div>
              {n.status === "draft" && (
                <button onClick={() => send(n.id)} className="btn-primary text-xs py-1.5 px-3 whitespace-nowrap">
                  Enviar
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
