import { useState, useEffect, useCallback } from "react";
import { api } from "../utils/api.js";
import PageHeader from "../components/PageHeader.jsx";
import { SkeletonCard } from "../components/Skeleton.jsx";

export default function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api.get("/api/projects");
      setProjects(data.projects || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    try {
      await api.post("/api/projects", { name: name.trim() });
      setName("");
      await load();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!confirm("¿Eliminar proyecto?")) return;
    try {
      await api.delete(`/api/projects/${id}`);
      await load();
    } catch (e) { alert(e.message); }
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <PageHeader
        title="Proyectos"
        description="Organiza tus QRs en carpetas para mantener todo ordenado"
        actions={null}
      />

      <div className="card p-5 mb-6">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Nuevo proyecto</p>
        <form onSubmit={create} className="flex gap-3">
          <input
            className="input flex-1"
            placeholder="Nombre del proyecto (ej. Campaña verano, Sucursal Norte)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Creando..." : "+ Crear"}
          </button>
        </form>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : projects.length === 0 ? (
        <div className="card p-16 text-center animate-fade-in">
          <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center mx-auto mb-5 shadow-sm">
            <svg className="w-10 h-10 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-1.5">Aún no tienes proyectos</h3>
          <p className="text-sm text-slate-500 max-w-xs mx-auto mb-6">
            Los proyectos te permiten organizar tus QRs por campaña, sucursal o cliente. Crea el primero arriba.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <div key={p.id} className="card-hover p-5 flex items-center justify-between animate-fade-in">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 truncate">{p.name}</p>
                  <p className="text-xs text-slate-400">{new Date(p.created_at).toLocaleDateString()}</p>
                </div>
              </div>
              <button
                onClick={() => remove(p.id)}
                className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors flex-shrink-0"
                title="Eliminar proyecto"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
