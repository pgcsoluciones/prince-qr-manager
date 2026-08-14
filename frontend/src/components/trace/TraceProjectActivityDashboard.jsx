import {useMemo,useState} from "react";

const STATUS={approved:"Aprobado",completed:"Completado",pending_approval:"En revisión",correction_required:"Corrección",in_progress:"En curso",assigned:"Asignado",overdue:"Atrasado"};
const fmtTime=v=>{if(!v)return"";const d=new Date(v);const mins=Math.max(0,Math.round((Date.now()-d.getTime())/60000));if(mins<60)return`Hace ${mins} min`;const h=Math.round(mins/60);return h<24?`Hace ${h} h`:d.toLocaleDateString()};
const initials=v=>String(v||"U").split(/[@.\s_-]+/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()).join("")||"U";
const eventKind=t=>{const s=String(t||"");if(s.includes("incident"))return"incidents";if(s.includes("evidence"))return"evidence";return"progress"};

export default function TraceProjectActivityDashboard({data,period,setPeriod,onRegister,onShare,onOpenIncident,onNavigate}){
 const[filter,setFilter]=useState("all");
 const activities=data?.activities||[],project=data?.project||{},metrics=data?.metrics||{},alerts=data?.alerts||[],stages=data?.stages||[],due=data?.dueToday||[];
 const filtered=useMemo(()=>filter==="all"?activities:activities.filter(x=>eventKind(x.event_type)===filter),[activities,filter]);
 const incidentByExecution=useMemo(()=>Object.fromEntries((data?.incidents||[]).map(i=>[i.execution_id,i])),[data]);
 return <div className="mx-auto max-w-[1560px] space-y-5">
  <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
   <div><div className="text-sm text-slate-500">Trace&nbsp;&nbsp;/&nbsp;&nbsp;<span className="text-slate-700">{project.name||"Proyecto"}</span></div><h1 className="mt-3 text-4xl font-black tracking-[-.04em]">Actividad del proyecto</h1><p className="mt-1 text-base text-slate-500">Seguimiento operativo en tiempo real</p></div>
   <div className="flex flex-wrap gap-3"><select value={period} onChange={e=>setPeriod(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold"><option value="today">Hoy</option><option value="week">Esta semana</option><option value="month">Este mes</option></select><button onClick={onShare} disabled={!project.publicPath} className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-black disabled:opacity-40">↗&nbsp;&nbsp;Compartir seguimiento</button><button onClick={onRegister} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-100">＋&nbsp;&nbsp;Registrar actividad</button></div>
  </div>

  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
   <Metric title="Avance general" value={`${Number(metrics.progress||0)}%`} tone="blue"><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-blue-600" style={{width:`${Math.max(0,Math.min(100,Number(metrics.progress||0)))}%`}}/></div></Metric>
   <Metric title="Actividades en curso" value={metrics.inProgress||0} tone="blue" onClick={()=>onNavigate?.("stages")}/>
   <Metric title="Incidencias abiertas" value={metrics.openIncidents||0} tone="red" onClick={()=>onNavigate?.("incidents")}/>
   <Metric title="Pendientes de aprobación" value={metrics.pendingApprovals||0} tone="orange" onClick={()=>onNavigate?.("incidents")}/>
  </div>

  <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
   <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="border-b border-slate-200 px-5 pt-5"><h2 className="text-lg font-black">Actividad reciente</h2><div className="mt-4 flex gap-6 overflow-x-auto">{[["all","Todo"],["progress","Avances"],["incidents","Incidencias"],["evidence","Evidencias"]].map(([k,l])=><button key={k} onClick={()=>setFilter(k)} className={`border-b-2 pb-3 text-sm font-semibold ${filter===k?"border-blue-600 text-blue-600":"border-transparent text-slate-500"}`}>{l}</button>)}</div></div>
    <div className="divide-y divide-slate-100">{filtered.slice(0,12).map(a=>{const kind=eventKind(a.event_type),inc=kind==="incidents"?incidentByExecution[a.execution_id]:null;return <button key={a.id} onClick={()=>inc&&onOpenIncident?.(inc)} className="flex w-full items-start gap-4 px-5 py-4 text-left hover:bg-slate-50"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-black text-slate-700">{initials(a.actor_email||a.actor_role)}</span><span className={`mt-4 h-2.5 w-2.5 shrink-0 rounded-full ${kind==="incidents"?"bg-red-500":kind==="evidence"?"bg-green-500":"bg-blue-600"}`}/><span className="min-w-0 flex-1"><b className="block truncate text-sm">{a.actor_email||a.actor_role||"Trace"} <span className="font-medium">{a.description||a.event_type}</span></b><span className="mt-1 block text-xs text-slate-500">{a.stage_name||a.execution_title||project.name}</span></span><span className="whitespace-nowrap text-xs text-slate-400">{fmtTime(a.occurred_at)}</span></button>})}{!filtered.length&&<div className="p-10 text-center text-sm text-slate-400">Todavía no hay actividad registrada en este proyecto.</div>}</div>
   </section>

   <div className="space-y-5">
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="border-b border-slate-200 px-5 py-4"><h2 className="font-black">Pendientes de hoy</h2></div><div className="divide-y divide-slate-100">{due.slice(0,6).map(x=><div key={x.id} className="flex items-center gap-3 px-5 py-4"><span className="h-5 w-5 rounded border border-slate-400"/><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{x.title||x.execution_code}</div><div className="mt-1 text-xs text-slate-400">{x.execution_code}</div></div><span className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-[10px] font-black">{initials(x.assigned_email)}</span><span className="text-xs text-slate-500">{x.due_at?new Date(x.due_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):""}</span></div>)}{!due.length&&<div className="p-8 text-center text-sm text-slate-400">No hay pendientes vencidos o para hoy.</div>}</div></section>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="border-b border-slate-200 px-5 py-4"><h2 className="font-black">Alertas</h2></div><div className="divide-y divide-slate-100">{alerts.map(a=><button key={a.type} onClick={()=>onNavigate?.(a.type==="incidents"||a.type==="approvals"?"incidents":"stages")} className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-slate-50"><span className={`text-xl ${a.type==="incidents"?"text-red-500":"text-orange-500"}`}>△</span><span className="flex-1 text-sm font-semibold">{a.label}</span><span>›</span></button>)}{!alerts.length&&<div className="p-8 text-center text-sm text-slate-400">Sin alertas que requieran intervención.</div>}</div></section>
   </div>
  </div>

  <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-black">Progreso por etapa</h2><div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">{stages.map(s=><button key={s.id} onClick={()=>onNavigate?.("stages")} className="text-left"><div className="flex items-center justify-between gap-3"><span className="truncate text-sm font-semibold">{s.name}</span><b className="text-sm text-blue-600">{s.progress}%</b></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-blue-600" style={{width:`${s.progress}%`}}/></div></button>)}{!stages.length&&<div className="text-sm text-slate-400">No hay etapas configuradas.</div>}</div></section>
 </div>
}
function Metric({title,value,tone="blue",children,onClick}){const color=tone==="red"?"text-red-500":tone==="orange"?"text-orange-500":"text-blue-600";const Tag=onClick?"button":"div";return <Tag onClick={onClick} className={`rounded-2xl border border-slate-200 bg-white p-5 text-left ${onClick?"hover:border-blue-300":""}`}><div className="text-sm font-semibold text-slate-700">{title}</div><div className={`mt-2 text-4xl font-black ${color}`}>{value}</div>{children}</Tag>}
