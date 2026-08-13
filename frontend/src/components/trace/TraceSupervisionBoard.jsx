import { useMemo, useState } from "react";

const urgent = (v) =>
  ["critical","critica","crítica","high","alta"].includes(
    String(v || "").toLowerCase()
  );

const closed = (v) =>
  ["resolved","closed","resuelta","cerrada"].includes(
    String(v || "").toLowerCase()
  );

function label(v) {
  const key = String(v || "").toLowerCase();

  return ({
    critical: "Crítica",
    high: "Alta",
    alta: "Alta",
    medium: "Media",
    media: "Media",
    low: "Baja",
    open: "Abierta",
    in_progress: "En curso",
    resolved: "Resuelta",
    closed: "Cerrada",
  })[key] || String(v || "Pendiente").replaceAll("_", " ");
}

export default function TraceSupervisionBoard({
  incidents = [],
  approvals = [],
  onOpenIncident,
}) {
  const [tab, setTab] = useState("attention");
  const [priority, setPriority] = useState("all");

  const activeIncidents = useMemo(
    () => incidents.filter((i) => !closed(i.status)),
    [incidents]
  );

  const ordered = useMemo(
    () =>
      [...activeIncidents].sort(
        (a, b) =>
          Number(urgent(b.severity)) -
          Number(urgent(a.severity))
      ),
    [activeIncidents]
  );

  const filtered =
    priority === "urgent"
      ? ordered.filter((i) => urgent(i.severity))
      : ordered;

  const urgentItems = ordered.filter((i) => urgent(i.severity));

  if (!activeIncidents.length && !approvals.length) {
    return (
      <div className="grid min-h-[58vh] place-items-center">
        <div className="max-w-md text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald-50 text-2xl font-black text-emerald-600">
            ✓
          </div>

          <h2 className="mt-5 text-3xl font-black">
            Todo al día
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            No hay incidencias abiertas ni revisiones pendientes.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
        <Tab
          active={tab === "attention"}
          onClick={() => setTab("attention")}
        >
          Atención · {urgentItems.length + approvals.length}
        </Tab>

        <Tab
          active={tab === "incidents"}
          onClick={() => setTab("incidents")}
        >
          Incidencias · {activeIncidents.length}
        </Tab>

        <Tab
          active={tab === "reviews"}
          onClick={() => setTab("reviews")}
        >
          Revisiones · {approvals.length}
        </Tab>
      </div>

      {tab === "attention" && (
        <div className="space-y-3">
          {urgentItems.map((item) => (
            <Incident
              key={item.id}
              item={item}
              onOpen={onOpenIncident}
              highlighted
            />
          ))}

          {approvals.map((item) => (
            <Review key={item.id} item={item} />
          ))}

          {!urgentItems.length && !approvals.length && (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
              No hay asuntos urgentes.
            </div>
          )}
        </div>
      )}

      {tab === "incidents" && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="font-black">
                Incidencias abiertas
              </h2>

              <p className="text-xs text-slate-500">
                Lo prioritario aparece primero.
              </p>
            </div>

            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-bold"
            >
              <option value="all">
                Todas
              </option>
              <option value="urgent">
                Alta prioridad
              </option>
            </select>
          </div>

          <div className="divide-y divide-slate-100">
            {filtered.map((item) => (
              <Incident
                key={item.id}
                item={item}
                onOpen={onOpenIncident}
              />
            ))}

            {!filtered.length && (
              <div className="p-10 text-center text-xs text-slate-400">
                No hay incidencias en este filtro.
              </div>
            )}
          </div>
        </section>
      )}

      {tab === "reviews" && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-black">
              Revisiones pendientes
            </h2>

            <p className="text-xs text-slate-500">
              Confirmaciones que esperan una decisión.
            </p>
          </div>

          <div className="divide-y divide-slate-100">
            {approvals.map((item) => (
              <Review key={item.id} item={item} />
            ))}

            {!approvals.length && (
              <div className="p-10 text-center text-xs text-slate-400">
                No hay revisiones pendientes.
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function Tab({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-xs font-black ${
        active
          ? "bg-slate-950 text-white"
          : "text-slate-500"
      }`}
    >
      {children}
    </button>
  );
}

function Incident({
  item,
  onOpen,
  highlighted = false,
}) {
  return (
    <button
      onClick={() => onOpen?.(item)}
      className={`flex w-full items-center gap-4 p-4 text-left transition hover:bg-slate-50 ${
        highlighted
          ? "rounded-2xl border border-red-100 bg-red-50/50"
          : ""
      }`}
    >
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
          urgent(item.severity)
            ? "bg-red-500"
            : "bg-amber-400"
        }`}
      />

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-black">
          {item.title || "Incidencia"}
        </div>

        <div className="mt-1 text-[10px] text-slate-400">
          {item.execution_title ||
            item.execution_code ||
            "Control TRACE"}
        </div>
      </div>

      <span
        className={`rounded-full px-2.5 py-1 text-[9px] font-black ${
          urgent(item.severity)
            ? "bg-red-100 text-red-700"
            : "bg-amber-100 text-amber-700"
        }`}
      >
        {label(item.severity)}
      </span>

      <span className="hidden text-[10px] font-bold text-slate-500 sm:block">
        {label(item.status)}
      </span>

      <span className="text-slate-300">
        ›
      </span>
    </button>
  );
}

function Review({ item }) {
  return (
    <div className="flex items-center gap-4 p-4">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-xs font-black text-blue-600">
        ✓
      </span>

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-black">
          {item.execution_title ||
            item.execution_code ||
            "Revisión pendiente"}
        </div>

        <div className="mt-1 text-[10px] text-slate-400">
          {item.stage_name ||
            "Confirmación pendiente"}
        </div>
      </div>

      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[9px] font-black text-blue-700">
        Por revisar
      </span>
    </div>
  );
}
