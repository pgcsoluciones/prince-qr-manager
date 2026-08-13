import { useEffect, useState } from "react";

const NAV = [
  ["home", "⌂", "Centro de mando"],
  ["operations", "▦", "Operaciones"],
  ["supervision", "△", "Supervisión"],
  ["evaluations", "✓", "Evaluaciones"],
  ["solutions", "◇", "Soluciones"],
  ["team", "♙", "Equipos"],
  ["reports", "▥", "Reportes"],
  ["settings", "⚙", "Configuración"],
];

export default function TraceStandaloneShell({ view, onView, onNewControl, onRegister, children }) {
  const [collapsed, setCollapsed] = useState(()=>localStorage.getItem("trace_sidebar_collapsed")==="1");
  const [notificationsOpen,setNotificationsOpen]=useState(false);
  useEffect(()=>{localStorage.setItem("trace_sidebar_collapsed",collapsed?"1":"0")},[collapsed]);
  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-900">
      <aside className={`fixed inset-y-0 left-0 z-40 flex flex-col bg-[#071226] text-white shadow-2xl transition-all duration-200 ${collapsed ? "w-[76px]" : "w-[222px]"}`}>
        <div className="flex h-[70px] items-center gap-3 border-b border-white/10 px-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-600 font-black">T</div>
          {!collapsed && <div className="min-w-0"><div className="text-[17px] font-black tracking-tight">TRACE</div><div className="text-[10px] text-slate-400">Control operacional</div></div>}
          <button onClick={() => setCollapsed(!collapsed)} className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white">{collapsed ? "›" : "‹"}</button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {NAV.map(([key, icon, label]) => (
            <button key={key} onClick={() => onView(key)} title={label} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold transition ${view === key ? "bg-blue-600 text-white shadow-lg shadow-blue-950/30" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/10 text-[12px]">{icon}</span>
              {!collapsed && <span>{label}</span>}
            </button>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3">
          <div className={`flex items-center gap-3 rounded-xl bg-white/5 ${collapsed ? "justify-center p-2" : "p-3"}`}>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-100 text-xs font-black text-blue-800">JP</span>
            {!collapsed && <div className="min-w-0"><div className="truncate text-xs font-bold">Administrador</div><div className="truncate text-[10px] text-slate-400">Espacio TRACE</div></div>}
          </div>
        </div>
      </aside>

      <div className={`min-h-screen transition-all duration-200 ${collapsed ? "pl-[76px]" : "pl-[222px]"}`}>
        <header className="sticky top-0 z-30 flex h-[70px] items-center gap-3 border-b border-slate-200 bg-white/95 px-5 backdrop-blur xl:px-7">
          <div className="relative min-w-0 flex-1 max-w-2xl">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
            <input className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-4 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-50" placeholder="Buscar controles, operaciones, personas…" />
          </div>
          <div className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 md:flex"><span className="grid h-6 w-6 place-items-center rounded-lg bg-blue-50 text-[10px] font-black text-blue-700">T</span><div><div className="text-[9px] uppercase tracking-[.12em] text-slate-400">Espacio</div><div className="text-[11px] font-bold text-slate-700">Todos los controles</div></div><span className="ml-1 text-slate-400">⌄</span></div>
          <div className="relative"><button onClick={()=>setNotificationsOpen(v=>!v)} className="relative grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:border-blue-300">♢<span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">2</span></button>{notificationsOpen&&<div className="absolute right-0 top-12 w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl"><div className="flex items-center justify-between"><div className="text-xs font-black">Atención reciente</div><button onClick={()=>setNotificationsOpen(false)} className="text-slate-400">×</button></div><div className="mt-3 space-y-2">{['Hay elementos pendientes de revisión.','Una incidencia requiere seguimiento.'].map((x,i)=><div key={x} className="flex gap-3 rounded-xl bg-slate-50 p-3"><span className={`mt-1 h-2 w-2 rounded-full ${i===0?'bg-amber-400':'bg-red-500'}`}/><div className="text-[10px] font-semibold leading-4 text-slate-600">{x}</div></div>)}</div><button onClick={()=>{setNotificationsOpen(false);onView('supervision')}} className="mt-3 w-full rounded-xl bg-slate-950 px-3 py-2 text-[10px] font-black text-white">Abrir supervisión</button></div>}</div>
          <button onClick={onRegister} className="hidden rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-sm hover:border-blue-300 sm:block">Registrar actividad</button>
          <button onClick={onNewControl} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-blue-200 hover:bg-blue-700">+ Nuevo control</button>
        </header>
        <main className="p-4 md:p-6 xl:p-7">{children}</main>
      </div>
    </div>
  );
}
