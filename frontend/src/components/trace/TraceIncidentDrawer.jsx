export default function TraceIncidentDrawer({ incident, onClose }) {
  if (!incident) return null;
  const timeline = [
    ["Reportada", "La incidencia quedó registrada con su contexto."],
    ["Asignada", "Se vinculó al responsable o área correspondiente."],
    ["En seguimiento", "La corrección permanece trazada hasta su validación."],
  ];
  return <div className="fixed inset-0 z-[110] bg-slate-950/30 backdrop-blur-[1px]" onClick={onClose}>
    <aside className="absolute inset-y-0 right-0 flex w-full max-w-[520px] flex-col bg-white shadow-2xl" onClick={e=>e.stopPropagation()}>
      <header className="border-b border-slate-200 px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2"><span className="rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-black uppercase text-red-600">{incident.severity||"Media"}</span><span className="text-[10px] font-bold text-slate-400">{incident.incident_code||"Incidencia TRACE"}</span></div>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950">{incident.title}</h2>
            <p className="mt-2 text-xs leading-5 text-slate-500">{incident.description||"Incidencia vinculada al seguimiento, la evidencia y la bitácora de esta operación."}</p>
          </div>
          <button onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50">×</button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <section className="grid grid-cols-2 gap-3">
          {[["Estado",incident.status||"Abierta"],["Prioridad",incident.severity||"Media"],["Operación",incident.execution_title||incident.execution_code||"TRACE"],["Próxima acción","Corregir y validar"]].map(([label,value])=><div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-[9px] font-black uppercase tracking-[.12em] text-slate-400">{label}</div><div className="mt-2 text-[12px] font-black text-slate-800">{value}</div></div>)}
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white">
          <div className="flex gap-5 border-b border-slate-100 px-4 text-xs font-bold"><button className="border-b-2 border-blue-600 py-3 text-blue-700">Detalles</button><button className="py-3 text-slate-400">Comentarios</button><button className="py-3 text-slate-400">Evidencias</button></div>
          <div className="space-y-5 p-4">
            {timeline.map(([title,desc],i)=><div key={title} className="relative flex gap-3 before:absolute before:left-[13px] before:top-7 before:h-[28px] before:w-px before:bg-slate-200 last:before:hidden"><span className={`relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full text-[9px] font-black ${i===2?"bg-blue-600 text-white":"bg-emerald-50 text-emerald-700"}`}>{i<2?"✓":3}</span><div><div className="text-[11px] font-black text-slate-800">{title}</div><div className="mt-1 text-[10px] leading-4 text-slate-400">{desc}</div></div></div>)}
          </div>
        </section>

        <section className="mt-6 grid grid-cols-2 gap-3">
          <button className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-black text-slate-700 hover:border-blue-300">Ver evidencia</button>
          <button className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-black text-slate-700 hover:border-blue-300">Abrir conversación</button>
        </section>
      </div>

      <footer className="border-t border-slate-200 bg-white p-4"><div className="flex gap-2"><button className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-xs font-black text-slate-700">Más acciones</button><button className="flex-[1.4] rounded-xl bg-blue-600 px-4 py-3 text-xs font-black text-white shadow-lg shadow-blue-100">Abrir corrección</button></div></footer>
    </aside>
  </div>;
}
