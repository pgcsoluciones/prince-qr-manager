import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../utils/api.js";
import { toast } from "../components/Toast.jsx";

/* ── Helpers ── */
function fmt(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleString("es", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function NpsChip({ score }) {
  if (score == null) return null;
  const color = score >= 8 ? "bg-green-100 text-green-700" : score >= 6 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";
  return <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-sm font-bold ${color}`}>NPS {score}</span>;
}

function TypeBadge({ type }) {
  const map = {
    staff:     "bg-blue-100 text-blue-700",
    customer:  "bg-purple-100 text-purple-700",
    anonymous: "bg-slate-100 text-slate-500",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${map[type] || map.anonymous}`}>
      {type}
    </span>
  );
}

function ChecklistSummary({ checklistData, checklistItems }) {
  let data = {};
  try { data = JSON.parse(checklistData || "{}"); } catch { return null; }
  const keys = Object.keys(data);
  if (!keys.length) return null;
  const checked = keys.filter(k => data[k]).length;
  const missed = checklistItems.filter(i => !data[i.id]).map(i => i.label);
  const color = checked === keys.length ? "text-green-600" : checked >= keys.length * 0.75 ? "text-amber-600" : "text-red-600";
  return (
    <div>
      <span className={`text-sm font-semibold ${color}`}>{checked}/{keys.length} ítems ✓</span>
      {missed.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {missed.slice(0, 4).map((m, i) => (
            <span key={i} className="text-[11px] bg-red-50 text-red-600 px-2 py-0.5 rounded-full">{m}</span>
          ))}
          {missed.length > 4 && <span className="text-[11px] text-slate-400">+{missed.length - 4} más</span>}
        </div>
      )}
    </div>
  );
}

function SurveyAnswers({ surveyData, surveyQuestions }) {
  let data = {};
  try { data = JSON.parse(surveyData || "{}"); } catch { return null; }
  const answered = surveyQuestions.filter(q => data[q.id] !== undefined && data[q.id] !== "");
  if (!answered.length) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-1">
      {answered.map(q => (
        <div key={q.id} className="text-[11px] bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
          <span className="text-slate-500">{q.label}: </span>
          <span className="font-medium text-slate-700">{String(data[q.id])}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Export CSV ── */
function exportCSV(responses, point) {
  const headers = ["id", "created_at", "respondent_type", "nps_score", "contact_email", "country", "device", "notes"];
  const rows = responses.map(r => [
    r.id, r.created_at, r.respondent_type, r.nps_score ?? "", r.contact_email ?? "",
    r.country ?? "", r.device ?? "", (r.notes || "").replace(/,/g, ";"),
  ]);
  const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `trace-${point?.name || "responses"}-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Main page ── */
export default function TraceResponsesPage() {
  const { pointId } = useParams();
  const navigate = useNavigate();
  const [point, setPoint] = useState(null);
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ type: "", minNps: "", maxNps: "", from: "", to: "" });
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pd, rd] = await Promise.all([
        api.get(`/api/trace/points/${pointId}`),
        api.get(`/api/trace/points/${pointId}/responses?limit=200`),
      ]);
      setPoint(pd.point);
      setResponses(rd.responses || []);
    } catch (e) {
      toast.error(e.message || "Error cargando respuestas");
    } finally {
      setLoading(false);
    }
  }, [pointId]);

  useEffect(() => { load(); }, [load]);

  const filtered = responses.filter(r => {
    if (filters.type && r.respondent_type !== filters.type) return false;
    if (filters.minNps && (r.nps_score == null || r.nps_score < Number(filters.minNps))) return false;
    if (filters.maxNps && (r.nps_score == null || r.nps_score > Number(filters.maxNps))) return false;
    if (filters.from && new Date(r.created_at) < new Date(filters.from)) return false;
    if (filters.to && new Date(r.created_at) > new Date(filters.to + "T23:59:59")) return false;
    return true;
  });

  useEffect(() => { setPage(1); }, [filters]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const checklistItems = point?.checklist_items || [];
  const surveyQuestions = point?.survey_questions || [];

  const avgNps = (() => {
    const scores = filtered.filter(r => r.nps_score != null).map(r => r.nps_score);
    if (!scores.length) return null;
    return (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
  })();

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate("/dashboard/trace")}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          aria-label="Volver"
        >
          ←
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-slate-900 truncate">
            {loading ? "Cargando..." : point?.name || "Respuestas"}
          </h1>
          {point?.area && <p className="text-sm text-slate-400">📍 {point.area}</p>}
        </div>
        {!loading && (
          <button
            onClick={() => exportCSV(filtered, point)}
            className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
          >
            ↓ CSV
          </button>
        )}
      </div>

      {/* Stats bar */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm text-center">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Total</p>
            <p className="text-2xl font-bold text-slate-900">{filtered.length}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm text-center">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">NPS prom.</p>
            <p className={`text-2xl font-bold ${avgNps >= 8 ? "text-green-600" : avgNps >= 6 ? "text-amber-600" : avgNps ? "text-red-600" : "text-slate-400"}`}>
              {avgNps ?? "—"}
            </p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm text-center">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Con email</p>
            <p className="text-2xl font-bold text-slate-900">{filtered.filter(r => r.contact_email).length}</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm text-center">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Staff</p>
            <p className="text-2xl font-bold text-slate-900">{filtered.filter(r => r.respondent_type === "staff").length}</p>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 mb-5">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-widest mb-1">Tipo</label>
            <select
              value={filters.type}
              onChange={e => setFilters(f => ({ ...f, type: e.target.value }))}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 outline-none focus:border-blue-400"
            >
              <option value="">Todos</option>
              <option value="staff">Staff</option>
              <option value="customer">Cliente</option>
              <option value="anonymous">Anónimo</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-widest mb-1">NPS mín.</label>
            <input
              type="number" min="0" max="10"
              value={filters.minNps}
              onChange={e => setFilters(f => ({ ...f, minNps: e.target.value }))}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm w-20 outline-none focus:border-blue-400"
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-widest mb-1">NPS máx.</label>
            <input
              type="number" min="0" max="10"
              value={filters.maxNps}
              onChange={e => setFilters(f => ({ ...f, maxNps: e.target.value }))}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm w-20 outline-none focus:border-blue-400"
              placeholder="10"
            />
          </div>
          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-widest mb-1">Desde</label>
            <input
              type="date"
              value={filters.from}
              onChange={e => setFilters(f => ({ ...f, from: e.target.value }))}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-400"
            />
          </div>
          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-widest mb-1">Hasta</label>
            <input
              type="date"
              value={filters.to}
              onChange={e => setFilters(f => ({ ...f, to: e.target.value }))}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-400"
            />
          </div>
          {(filters.type || filters.minNps || filters.maxNps || filters.from || filters.to) && (
            <button
              onClick={() => setFilters({ type: "", minNps: "", maxNps: "", from: "", to: "" })}
              className="text-xs text-slate-400 hover:text-red-500 transition-colors px-2 py-1.5"
            >Limpiar filtros</button>
          )}
        </div>
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3,4].map(i => <div key={i} className="h-28 bg-white rounded-xl animate-pulse border border-slate-100" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl p-10 text-center border border-slate-100 shadow-sm">
          <p className="text-3xl mb-2">📋</p>
          <p className="font-semibold text-slate-700">Sin respuestas</p>
          <p className="text-sm text-slate-400 mt-1">Ajusta los filtros o espera nuevas respuestas</p>
        </div>
      ) : (
        <>
        <div className="space-y-3">
          {paginated.map(r => (
            <div key={r.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
              {/* Top row */}
              <div className="flex items-center gap-2 flex-wrap mb-3">
                <span className="text-xs text-slate-400 font-mono">{fmt(r.created_at)}</span>
                <TypeBadge type={r.respondent_type} />
                <NpsChip score={r.nps_score} />
                {r.contact_email && (
                  <button
                    onClick={() => navigate("/dashboard/trace/contacts")}
                    className="text-xs text-blue-600 hover:underline font-medium"
                  >{r.contact_email}</button>
                )}
                <span className="ml-auto text-[10px] text-slate-400">
                  {r.country} · {r.device}
                </span>
              </div>

              {/* Checklist summary */}
              {checklistItems.length > 0 && (
                <div className="mb-2">
                  <ChecklistSummary checklistData={r.checklist_data} checklistItems={checklistItems} />
                </div>
              )}

              {/* Survey answers */}
              {surveyQuestions.length > 0 && (
                <SurveyAnswers surveyData={r.survey_data} surveyQuestions={surveyQuestions} />
              )}

              {/* Notes */}
              {r.notes && (
                <p className="text-xs text-slate-500 mt-2 italic">"{r.notes}"</p>
              )}
            </div>
          ))}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 bg-white rounded-xl border border-slate-100 shadow-sm mt-3">
            <p className="text-xs text-slate-500">{filtered.length} respuestas — Página {page} de {totalPages}</p>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
                className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50">← Anterior</button>
              {Array.from({length: Math.min(5, totalPages)}, (_, i) => {
                const p = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
                return <button key={p} onClick={() => setPage(p)}
                  className={`px-3 py-1.5 text-xs border rounded-lg ${p === page ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 hover:bg-slate-50"}`}>{p}</button>;
              })}
              <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}
                className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50">Siguiente →</button>
            </div>
          </div>
        )}
        </>
      )}
    </div>
  );
}
