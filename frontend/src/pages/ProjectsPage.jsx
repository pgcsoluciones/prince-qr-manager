import { useState, useEffect, useCallback } from "react";
import { api } from "../utils/api.js";

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
    <div className="p-6">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Proyectos</h1>

      <div className="card p-5 mb-6">
        <form onSubmit={create} className="flex gap-3">
          <input
            className="input flex-1"
            placeholder="Nombre del nuevo proyecto"
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
        <p className="text-gray-400 text-sm">Cargando...</p>
      ) : projects.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-4xl mb-3">📁</p>
          <p className="text-gray-500">Sin proyectos aún</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <div key={p.id} className="card p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📁</span>
                <div>
                  <p className="font-medium text-gray-900">{p.name}</p>
                  <p className="text-xs text-gray-400">{new Date(p.created_at).toLocaleDateString()}</p>
                </div>
              </div>
              <button
                onClick={() => remove(p.id)}
                className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
              >✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
