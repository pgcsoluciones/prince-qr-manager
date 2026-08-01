import { useCallback, useEffect, useMemo, useState } from "react";

const MAIN_API = import.meta.env.VITE_API_URL || "https://api.code.intaprd.com";
const API = import.meta.env.VITE_SUPPORT_API_URL || MAIN_API;

async function apiFetch(path, options = {}) {
  const token =
    localStorage.getItem("qr_support_token") ||
    localStorage.getItem("qr_token") ||
    "";
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `Error ${response.status}`);
  }
  return data;
}

const STATUS_LABELS = {
  new: "Nuevo",
  open: "Abierto",
  in_progress: "En progreso",
  waiting_customer: "Esperando cliente",
  resolved: "Resuelto",
  closed: "Cerrado",
};

const STATUS_STYLES = {
  new: "bg-blue-100 text-blue-800",
  open: "bg-cyan-100 text-cyan-800",
  in_progress: "bg-amber-100 text-amber-800",
  waiting_customer: "bg-violet-100 text-violet-800",
  resolved: "bg-emerald-100 text-emerald-800",
  closed: "bg-slate-200 text-slate-700",
};

const SEVERITY_STYLES = {
  low: "bg-slate-100 text-slate-700",
  normal: "bg-blue-100 text-blue-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

const SERVICE_LABELS = {
  standard: "Estándar",
  priority: "Prioritaria",
  urgent: "Urgente",
};

function Badge({ children, className = "bg-slate-100 text-slate-700" }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${className}`}>
      {children}
    </span>
  );
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-DO", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function TicketList({ tickets, selectedId, onSelect, loading }) {
  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Cargando tickets…</div>;
  }
  if (!tickets.length) {
    return <div className="p-6 text-sm text-slate-500">No hay tickets con este filtro.</div>;
  }
  return (
    <div className="divide-y divide-slate-200">
      {tickets.map((ticket) => (
        <button
          key={ticket.id}
          onClick={() => onSelect(ticket.id)}
          className={`w-full text-left p-4 transition-colors ${selectedId === ticket.id ? "bg-blue-50" : "hover:bg-slate-50"}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-blue-700">{ticket.ticket_number}</p>
              <p className="mt-1 truncate text-sm font-semibold text-slate-900">{ticket.subject}</p>
              <p className="mt-1 truncate text-xs text-slate-500">
                {ticket.company_name || ticket.requester_email || ticket.tenant_id}
              </p>
            </div>
            <Badge className={SEVERITY_STYLES[ticket.severity]}>{ticket.severity}</Badge>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <Badge className={STATUS_STYLES[ticket.status]}>{STATUS_LABELS[ticket.status]}</Badge>
            <span className="text-[11px] text-slate-400">{formatDate(ticket.updated_at)}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reply, setReply] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [error, setError] = useState("");

  const loadTickets = useCallback(async () => {
    setLoadingList(true);
    setError("");
    try {
      const query = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
      const data = await apiFetch(`/api/support/tickets${query}`);
      setTickets(data.tickets || []);
      setSelectedId((current) => current || data.tickets?.[0]?.id || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingList(false);
    }
  }, [statusFilter]);

  const loadDetail = useCallback(async (ticketId) => {
    if (!ticketId) {
      setDetail(null);
      return;
    }
    setLoadingDetail(true);
    setError("");
    try {
      const data = await apiFetch(`/api/support/tickets/${encodeURIComponent(ticketId)}`);
      setDetail(data);
    } catch (err) {
      setError(err.message);
      setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => { loadTickets(); }, [loadTickets]);
  useEffect(() => { loadDetail(selectedId); }, [selectedId, loadDetail]);

  const counts = useMemo(() => ({
    total: tickets.length,
    new: tickets.filter((t) => t.status === "new").length,
    active: tickets.filter((t) => ["open", "in_progress", "waiting_customer"].includes(t.status)).length,
    critical: tickets.filter((t) => t.severity === "critical").length,
  }), [tickets]);

  const updateTicket = async (changes) => {
    if (!selectedId) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/api/support/tickets/${encodeURIComponent(selectedId)}`, {
        method: "PATCH",
        body: JSON.stringify(changes),
      });
      await Promise.all([loadTickets(), loadDetail(selectedId)]);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const sendMessage = async (event) => {
    event.preventDefault();
    const body = reply.trim();
    if (!body || !selectedId) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/api/support/tickets/${encodeURIComponent(selectedId)}/messages`, {
        method: "POST",
        body: JSON.stringify({
          body,
          visibility,
          idempotency_key: crypto.randomUUID(),
        }),
      });
      setReply("");
      await Promise.all([loadTickets(), loadDetail(selectedId)]);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const ticket = detail?.ticket;
  const messages = detail?.messages || [];

  return (
    <div className="min-h-full bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Soporte</h1>
          <p className="mt-1 text-sm text-slate-500">Gestión central de tickets creados por Codi, dashboard y API.</p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Tickets visibles", counts.total],
            ["Nuevos", counts.new],
            ["Activos", counts.active],
            ["Críticos", counts.critical],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium text-slate-500">{label}</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            >
              <option value="">Todos los estados</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <button
              onClick={loadTickets}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Actualizar
            </button>
          </div>

          <div className="grid min-h-[620px] lg:grid-cols-[360px_1fr]">
            <aside className="border-b border-slate-200 lg:border-b-0 lg:border-r">
              <TicketList
                tickets={tickets}
                selectedId={selectedId}
                onSelect={setSelectedId}
                loading={loadingList}
              />
            </aside>

            <section className="min-w-0">
              {loadingDetail ? (
                <div className="p-8 text-sm text-slate-500">Cargando detalle…</div>
              ) : !ticket ? (
                <div className="p-8 text-sm text-slate-500">Selecciona un ticket para ver sus detalles.</div>
              ) : (
                <div className="flex h-full flex-col">
                  <div className="border-b border-slate-200 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold text-blue-700">{ticket.ticket_number}</p>
                        <h2 className="mt-1 text-xl font-bold text-slate-900">{ticket.subject}</h2>
                        <p className="mt-1 text-sm text-slate-500">
                          {ticket.company_name || "Sin empresa"} · {ticket.requester_email || "Sin correo"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge className={STATUS_STYLES[ticket.status]}>{STATUS_LABELS[ticket.status]}</Badge>
                        <Badge className={SEVERITY_STYLES[ticket.severity]}>{ticket.severity}</Badge>
                        <Badge>{SERVICE_LABELS[ticket.service_priority] || ticket.service_priority}</Badge>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                      <label className="text-xs font-medium text-slate-600">
                        Estado
                        <select
                          value={ticket.status}
                          disabled={saving}
                          onChange={(e) => updateTicket({ status: e.target.value })}
                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        >
                          {Object.entries(STATUS_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs font-medium text-slate-600">
                        Severidad
                        <select
                          value={ticket.severity}
                          disabled={saving}
                          onChange={(e) => updateTicket({ severity: e.target.value })}
                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        >
                          {['low', 'normal', 'high', 'critical'].map((value) => (
                            <option key={value} value={value}>{value}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs font-medium text-slate-600">
                        Responsable (ID)
                        <input
                          defaultValue={ticket.assigned_to_user_id || ""}
                          disabled={saving}
                          onBlur={(e) => {
                            const value = e.target.value.trim() || null;
                            if (value !== (ticket.assigned_to_user_id || null)) {
                              updateTicket({ assigned_to_user_id: value });
                            }
                          }}
                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                          placeholder="Sin asignar"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="grid gap-4 border-b border-slate-200 bg-slate-50 p-5 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Situación</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{ticket.situation}</p>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Impacto</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{ticket.impact || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Resultado esperado</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{ticket.expected_resolution || "—"}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 space-y-4 overflow-y-auto p-5">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`max-w-3xl rounded-xl border p-4 ${message.visibility === "internal" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-semibold text-slate-700">{message.author_type}</p>
                            {message.visibility === "internal" && <Badge className="bg-amber-100 text-amber-800">Nota interna</Badge>}
                          </div>
                          <p className="text-[11px] text-slate-400">{formatDate(message.created_at)}</p>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{message.body}</p>
                      </div>
                    ))}
                  </div>

                  <form onSubmit={sendMessage} className="border-t border-slate-200 bg-white p-4">
                    <div className="mb-2 flex items-center gap-3">
                      <label className="text-xs font-medium text-slate-600">Visibilidad</label>
                      <select
                        value={visibility}
                        onChange={(e) => setVisibility(e.target.value)}
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                      >
                        <option value="public">Respuesta pública</option>
                        <option value="internal">Nota interna</option>
                      </select>
                    </div>
                    <div className="flex gap-3">
                      <textarea
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        rows={3}
                        className="min-h-[84px] flex-1 resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                        placeholder={visibility === "internal" ? "Escribe una nota interna…" : "Escribe una respuesta para el cliente…"}
                      />
                      <button
                        type="submit"
                        disabled={saving || !reply.trim()}
                        className="self-end rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Enviar
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
