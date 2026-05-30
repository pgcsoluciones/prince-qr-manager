import { useState, useEffect, useRef } from "react";
import Papa from "papaparse";
import { api } from "../utils/api.js";
import { toast } from "../components/Toast.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const PLAN_LIMITS = { free: 5, starter: 20, pro: 100, enterprise: -1 };

function PageHeader({ title, description, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {description && <p className="text-sm text-slate-500 mt-0.5">{description}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

function Badge({ children, color = "slate" }) {
  const colors = {
    slate: "bg-slate-100 text-slate-600",
    green: "bg-green-100 text-green-700",
    red: "bg-red-100 text-red-600",
    blue: "bg-blue-100 text-blue-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[color]}`}>
      {children}
    </span>
  );
}

const EMPTY_FORM = { name: "", position: "", department: "", email: "", phone: "" };

function CollaboratorForm({ initial = EMPTY_FORM, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initial);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
      <div className="sm:col-span-2">
        <label className="block text-xs font-medium text-slate-600 mb-1">Nombre *</label>
        <input
          type="text"
          value={form.name}
          onChange={set("name")}
          placeholder="Nombre completo"
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Cargo / Posición</label>
        <input
          type="text"
          value={form.position}
          onChange={set("position")}
          placeholder="Ej: Supervisor, Técnico..."
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Área / Departamento</label>
        <input
          type="text"
          value={form.department}
          onChange={set("department")}
          placeholder="Ej: Operaciones, Limpieza..."
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
        <input
          type="email"
          value={form.email}
          onChange={set("email")}
          placeholder="correo@ejemplo.com"
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Teléfono</label>
        <input
          type="tel"
          value={form.phone}
          onChange={set("phone")}
          placeholder="+52 55 0000 0000"
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </div>
      <div className="sm:col-span-2 flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors font-medium"
        >
          Cancelar
        </button>
        <button
          onClick={() => onSave(form)}
          disabled={saving || !form.name.trim()}
          className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </div>
  );
}

function BulkImportModal({ onClose, onImported, planLimit, currentCount }) {
  const [rows, setRows] = useState([]);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef();

  function downloadTemplate() {
    const csv = "nombre,cargo,area,email,telefono\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla_colaboradores.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const mapped = result.data.map((r) => ({
          name: r.nombre || r.name || "",
          position: r.cargo || r.position || "",
          department: r.area || r.department || "",
          email: r.email || "",
          phone: r.telefono || r.phone || "",
        })).filter((r) => r.name.trim());
        setRows(mapped);
      },
    });
  }

  async function handleImport() {
    if (rows.length === 0) return;
    setImporting(true);
    try {
      await api.post("/api/collaborators/bulk", { collaborators: rows });
      toast(`${rows.length} colaboradores importados`, "success");
      onImported();
      onClose();
    } catch (e) {
      toast(e.message || "Error importando", "error");
    } finally {
      setImporting(false);
    }
  }

  const remaining = planLimit === -1 ? Infinity : planLimit - currentCount;
  const importable = Math.min(rows.length, remaining, 50);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-900">Importar colaboradores (CSV)</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <div className="flex-1 text-sm text-blue-800">
              Descarga la plantilla CSV, rellénala con tu personal y súbela aquí.
            </div>
            <button
              onClick={downloadTemplate}
              className="flex-shrink-0 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
              Descargar plantilla
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Subir archivo CSV</label>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              onChange={handleFile}
              className="block w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary-dark cursor-pointer"
            />
          </div>

          {rows.length > 0 && (
            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">
                Vista previa — {rows.length} filas encontradas
                {planLimit !== -1 && ` (se importarán ${importable} dentro del límite)`}
              </p>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      {["Nombre", "Cargo", "Área", "Email", "Teléfono"].map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-semibold text-slate-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.slice(0, 10).map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-3 py-2 text-slate-800 font-medium">{r.name}</td>
                        <td className="px-3 py-2 text-slate-600">{r.position}</td>
                        <td className="px-3 py-2 text-slate-600">{r.department}</td>
                        <td className="px-3 py-2 text-slate-600">{r.email}</td>
                        <td className="px-3 py-2 text-slate-600">{r.phone}</td>
                      </tr>
                    ))}
                    {rows.length > 10 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-2 text-slate-400 text-center">
                          ... y {rows.length - 10} filas más
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors font-medium">
            Cancelar
          </button>
          <button
            onClick={handleImport}
            disabled={importing || rows.length === 0}
            className="px-5 py-2 bg-primary text-white rounded-lg font-semibold text-sm hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            {importing ? "Importando..." : `Importar ${importable} colaboradores`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CollaboratorsPage() {
  const { user } = useAuth();
  const [collaborators, setCollaborators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [showBulk, setShowBulk] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  const planLimit = PLAN_LIMITS[user?.plan] ?? 5;
  const activeCount = collaborators.filter((c) => c.is_active).length;
  const limitReached = planLimit !== -1 && activeCount >= planLimit;

  async function load() {
    try {
      const data = await api.get("/api/collaborators");
      setCollaborators(data.collaborators || []);
    } catch (e) {
      toast("Error cargando colaboradores", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(form) {
    setSaving(true);
    try {
      await api.post("/api/collaborators", form);
      toast("Colaborador agregado", "success");
      setShowAdd(false);
      load();
    } catch (e) {
      toast(e.message || "Error agregando", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(form) {
    setSaving(true);
    try {
      await api.put(`/api/collaborators/${editId}`, form);
      toast("Colaborador actualizado", "success");
      setEditId(null);
      load();
    } catch (e) {
      toast(e.message || "Error actualizando", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(c) {
    try {
      await api.put(`/api/collaborators/${c.id}`, { ...c, is_active: c.is_active ? 0 : 1 });
      load();
    } catch (e) {
      toast("Error actualizando estado", "error");
    }
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/api/collaborators/${id}`);
      toast("Colaborador desactivado", "success");
      setDeleteConfirm(null);
      load();
    } catch (e) {
      toast("Error eliminando", "error");
    }
  }

  const filtered = collaborators.filter((c) => {
    const q = search.toLowerCase();
    const matchSearch = !search || (
      c.name?.toLowerCase().includes(q) ||
      c.position?.toLowerCase().includes(q) ||
      c.department?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q)
    );
    const matchStatus = filterStatus === "all" || (filterStatus === "active" ? c.is_active : !c.is_active);
    return matchSearch && matchStatus;
  });

  useEffect(() => { setPage(1); }, [search, filterStatus]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const departments = [...new Set(collaborators.filter((c) => c.department).map((c) => c.department))];
  const topDepts = departments
    .map((d) => ({ d, count: collaborators.filter((c) => c.department === d && c.is_active).length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const pct = planLimit === -1 ? 0 : Math.min(100, Math.round((activeCount / planLimit) * 100));
  const pctColor = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-400" : "bg-primary";

  if (loading) {
    return (
      <div className="p-6 text-center text-slate-400 text-sm">Cargando colaboradores...</div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Colaboradores"
        description="Gestiona el personal operativo asignado a los puntos de control TRACE."
      >
        <button
          onClick={() => setShowBulk(true)}
          className="px-3 py-2 border border-slate-200 bg-white text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
        >
          Importar CSV
        </button>
        <button
          onClick={() => { if (!limitReached) setShowAdd(true); }}
          disabled={limitReached}
          title={limitReached ? "Límite de plan alcanzado" : ""}
          className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          + Agregar
        </button>
      </PageHeader>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-2xl font-bold text-slate-900">{activeCount}</p>
          <p className="text-xs text-slate-500 mt-0.5">Activos</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-2xl font-bold text-slate-900">{collaborators.length}</p>
          <p className="text-xs text-slate-500 mt-0.5">Total</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-2xl font-bold text-slate-900">{departments.length}</p>
          <p className="text-xs text-slate-500 mt-0.5">Departamentos</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-sm font-bold text-slate-900">
            {topDepts.length > 0 ? topDepts[0].d : "—"}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">Área principal</p>
        </div>
      </div>

      {/* Plan limit */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-slate-700">Uso del plan</span>
          <span className="text-sm text-slate-500">
            {activeCount} / {planLimit === -1 ? "∞" : planLimit} colaboradores
          </span>
        </div>
        {planLimit !== -1 && (
          <div className="w-full bg-slate-100 rounded-full h-2">
            <div className={`${pctColor} h-2 rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
          </div>
        )}
        {limitReached && (
          <p className="text-xs text-amber-600 font-medium mt-2">
            Límite alcanzado. <a href="/dashboard/profile" className="underline">Mejora tu plan</a> para agregar más colaboradores.
          </p>
        )}
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="mb-4">
          <CollaboratorForm
            onSave={handleAdd}
            onCancel={() => setShowAdd(false)}
            saving={saving}
          />
        </div>
      )}

      {/* Search and filters */}
      <div className="mb-4 flex flex-wrap gap-2 items-center">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, cargo, área..."
          className="w-full sm:w-72 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        >
          <option value="all">Todos</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-slate-400 text-sm">
              {search ? "Sin resultados para tu búsqueda." : "Aún no hay colaboradores. Agrega el primero."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Nombre</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Cargo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Área</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Teléfono</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginated.map((c) => (
                  editId === c.id ? (
                    <tr key={c.id}>
                      <td colSpan={7} className="px-4 py-3">
                        <CollaboratorForm
                          initial={{ name: c.name, position: c.position || "", department: c.department || "", email: c.email || "", phone: c.phone || "" }}
                          onSave={handleEdit}
                          onCancel={() => setEditId(null)}
                          saving={saving}
                        />
                      </td>
                    </tr>
                  ) : (
                    <tr key={c.id} className={`hover:bg-slate-50 transition-colors ${!c.is_active ? "opacity-50" : ""}`}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{c.name}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600 hidden sm:table-cell">{c.position || "—"}</td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {c.department ? <Badge color="blue">{c.department}</Badge> : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-600 hidden lg:table-cell">{c.email || "—"}</td>
                      <td className="px-4 py-3 text-slate-600 hidden lg:table-cell">{c.phone || "—"}</td>
                      <td className="px-4 py-3">
                        <Badge color={c.is_active ? "green" : "red"}>{c.is_active ? "Activo" : "Inactivo"}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setEditId(c.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-blue-50 transition-colors"
                            title="Editar"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleToggle(c)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-amber-50 transition-colors"
                            title={c.is_active ? "Desactivar" : "Activar"}
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                              <path strokeLinecap="round" strokeLinejoin="round" d={c.is_active ? "M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" : "M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z"} />
                            </svg>
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(c.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                            title="Eliminar"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 bg-white rounded-xl border border-slate-200 mt-2">
          <p className="text-xs text-slate-500">{filtered.length} resultados — Página {page} de {totalPages}</p>
          <div className="flex gap-1">
            <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
              className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50">← Anterior</button>
            {Array.from({length: Math.min(5, totalPages)}, (_, i) => {
              const p = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
              return <button key={p} onClick={() => setPage(p)}
                className={`px-3 py-1.5 text-xs border rounded-lg ${p === page ? "bg-primary text-white border-primary" : "border-slate-200 hover:bg-slate-50"}`}>{p}</button>;
            })}
            <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}
              className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50">Siguiente →</button>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="font-bold text-slate-900 mb-2">¿Desactivar colaborador?</h3>
            <p className="text-sm text-slate-500 mb-5">El colaborador quedará inactivo y podrá reactivarse en cualquier momento.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium">
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-semibold hover:bg-red-600 transition-colors"
              >
                Desactivar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk import modal */}
      {showBulk && (
        <BulkImportModal
          onClose={() => setShowBulk(false)}
          onImported={load}
          planLimit={planLimit}
          currentCount={activeCount}
        />
      )}
    </div>
  );
}
