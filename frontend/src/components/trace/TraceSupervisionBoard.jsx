import { useMemo, useState } from "react";

function tone(severity){
  const v=String(severity||"").toLowerCase();
  if(["critical","critica","crítica","high","alta"].includes(v))return"bg-red-50 text-red-700 border-red-200";
  if(["medium","media"].includes(v))return"bg-amber-50 text-amber-700 border-amber-200";
  return"bg-slate-50 text-slate-600 border-slate-200";
}

export default function TraceSupervisionBoard({incidents=[],approvals=[],onOpenIncident}){
  const [severity,setSeverity]=useState("all");
  const [status,setStatus]=useState("all");
  const filtered=useMemo(()=>incidents.filter(i=>(severity==="all"||String(i.severity||"").toLowerCase()===severity)&&(status==="all"||String(i.status||"").toLowerCase()===status)),[incidents,severity,status]);
  const critical=incidents.filter(i=>["critical","critica","crítica","high","alta"].includes(String(i.severity||"").toLowerCase())).length;
  const open=incidents.filter(i=>!["resolved","closed","resuelta","cerrada"].includes(String(i.status||"").toLowerCase())).length;
  return <div className="space-y-5">
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[["Incidencias abiertas",open,"△"],["Alta prioridad",critical,"!"],["Por confirmar",approvals.length,"✓"],["En seguimiento",Math.max(0,open-critical),"↻"]].map(([l,v,ic],idx)=><div key={l} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-500">{l}</span><span className={`grid h-8 w-8 place-items-center rounded-xl ${idx===1&&v>0?'bg-red-50 text-red-600':'bg-blue-50 text-blue-600'}`}>{ic}</span></div><div className="mt-3 text-3xl font-black">{v}</div></div>)}
    </section>

    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-center md:justify-between"><div><h2 className="font-black">Incidencias y correcciones</h2><p className="text-[11px] text-slate-500">Revisa prioridad, estado, responsable y próxima acción.</p></div><div className="flex gap-2"><select value={severity} onChange={e=>setSeverity(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold"><option value="all">Todas las prioridades</option><option value="alta">Alta</option><option value="high">High</option><option value="media">Media</option><option value="medium">Medium</option></select><select value={status} onChange={e=>setStatus(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold"><option value="all">Todos los estados</option><option value="open">Abierta</option><option value="in_progress">En curso</option><option value="resolved">Resuelta</option></select></div></div>
        <div className="divide-y divide-slate-100">{filtered.map((i,idx)=><button key={i.id} onClick={()=>onOpenIncident(i)} className="grid w-full gap-3 p-4 text-left transition hover:bg-blue-50/30 md:grid-cols-[1fr_.38fr_.38fr_.46fr_auto] md:items-center"><div><div className="text-xs font-black text-slate-800">{i.title}</div><div className="mt-1 text-[10px] text-slate-400">{i.execution_title||i.execution_code||'Operación TRACE'}</div></div><span className={`w-fit rounded-full border px-2 py-1 text-[9px] font-bold ${tone(i.severity)}`}>{i.severity||'Media'}</span><span className="text-[10px] font-bold text-blue-600">{String(i.status||'abierta').replaceAll('_',' ')}</span><div className="text-[10px] text-slate-500">{idx===0?'Revisar hoy':'Dar seguimiento'}</div><span className="text-lg text-slate-300">›</span></button>)}{!filtered.length&&<div className="p-10 text-center text-xs text-slate-400">No hay incidencias con esos filtros.</div>}</div>
      </div>
      <aside className="space-y-4"><div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-black">Pendientes de confirmar</h2><span className="rounded-full bg-blue-50 px-2 py-1 text-[9px] font-black text-blue-700">{approvals.length}</span></div><div className="mt-4 space-y-2">{approvals.map(a=><div key={a.id} className="rounded-xl border border-slate-200 p-3"><div className="text-[11px] font-black">{a.execution_title||a.execution_code}</div><div className="mt-1 text-[10px] text-slate-400">{a.stage_name||'Revisión pendiente'}</div><div className="mt-3 h-1.5 rounded-full bg-slate-100"><div className="h-full w-2/3 rounded-full bg-blue-600"/></div><button className="mt-3 w-full rounded-lg bg-blue-600 px-3 py-2 text-[10px] font-black text-white">Abrir revisión</button></div>)}{!approvals.length&&<div className="rounded-xl bg-emerald-50 p-4 text-xs font-semibold text-emerald-700">No hay aprobaciones pendientes.</div>}</div></div><div className="rounded-2xl bg-slate-950 p-5 text-white shadow-sm"><div className="text-[10px] font-black uppercase tracking-[.16em] text-blue-300">Resumen visual</div><div className="mt-4 flex items-center gap-4"><div className="grid h-24 w-24 place-items-center rounded-full" style={{background:`conic-gradient(#ef4444 0 ${Math.min(100,critical*25)}%,#f59e0b 0 ${Math.min(100,open*20+20)}%,#1e293b 0)`}}><div className="grid h-16 w-16 place-items-center rounded-full bg-slate-950 text-center"><div><div className="text-xl font-black">{open}</div><div className="text-[8px] text-slate-400">abiertas</div></div></div></div><div className="text-[11px] leading-5 text-slate-300">Prioriza lo urgente, valida correcciones y evita que una etapa quede retenida sin seguimiento.</div></div></div></aside>
    </section>
  </div>;
}
