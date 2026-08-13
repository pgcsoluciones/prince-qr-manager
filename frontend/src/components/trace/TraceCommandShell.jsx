const ITEMS = [
  ["home","⌂","Centro de mando"],
  ["operations","▣","Operaciones"],
  ["supervision","△","Supervisión"],
  ["evaluations","✓","Evaluaciones"],
  ["solutions","◇","Soluciones"],
  ["reports","▥","Reportes"],
];

export default function TraceCommandShell({ view, onView, children, onNewControl, onRegister }) {
  return (
    <div className="min-h-[calc(100vh-5rem)] overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm lg:flex">
      <aside className="flex w-full shrink-0 flex-col bg-slate-950 text-white lg:w-60">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 text-sm font-black">IT</div>
          <div><div className="font-bold">INTAP Trace</div><div className="text-xs text-slate-400">Control operacional</div></div>
        </div>
        <nav className="flex gap-1 overflow-x-auto p-3 lg:flex-1 lg:flex-col lg:overflow-visible">
          {ITEMS.map(([key,icon,label]) => (
            <button key={key} onClick={() => onView(key)} className={`flex items-center gap-3 whitespace-nowrap rounded-xl px-3 py-3 text-left text-sm font-semibold transition ${view===key?"bg-blue-600 text-white":"text-slate-300 hover:bg-white/10 hover:text-white"}`}>
              <span className="grid h-7 w-7 place-items-center rounded-lg border border-white/10 text-xs">{icon}</span>{label}
            </button>
          ))}
          <a href="/dashboard/trace-management" className="flex items-center gap-3 whitespace-nowrap rounded-xl px-3 py-3 text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white"><span className="grid h-7 w-7 place-items-center rounded-lg border border-white/10 text-xs">⚙</span>Configuración</a>
        </nav>
        <div className="hidden border-t border-white/10 p-4 lg:block"><div className="rounded-2xl bg-white/5 p-3"><div className="text-xs font-semibold text-white">Vista según tu rol</div><div className="mt-1 text-[11px] leading-4 text-slate-400">Cada persona ve solo lo necesario para su trabajo.</div></div></div>
      </aside>

      <main className="min-w-0 flex-1 bg-slate-50">
        <header className="flex flex-col gap-3 border-b border-slate-200 bg-white px-5 py-4 md:flex-row md:items-center md:justify-between lg:px-7">
          <div><div className="text-xs font-bold uppercase tracking-[.17em] text-blue-600">INTAP TRACE · V1</div><div className="mt-1 text-sm text-slate-500">Visualiza, asigna y actúa sin salir del contexto.</div></div>
          <div className="flex flex-wrap gap-2"><button onClick={onRegister} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:border-blue-300">Registrar actividad</button><button onClick={onNewControl} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">+ Nuevo control</button></div>
        </header>
        <div className="p-4 md:p-6 lg:p-7">{children}</div>
      </main>
    </div>
  );
}
