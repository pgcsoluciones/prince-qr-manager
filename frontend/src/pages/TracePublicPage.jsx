import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

const BASE = import.meta.env.VITE_API_URL || "https://api.code.intaprd.com";

function human(v){return ({pending:"Pendiente",assigned:"Asignado",in_progress:"En curso",paused:"Pausado",blocked:"Bloqueado",pending_approval:"Por confirmar",correction_required:"En corrección",completed:"Completado",cancelled:"Cancelado",overdue:"Atrasado"}[v]||String(v||"Pendiente").replaceAll("_"," "));}

export default function TracePublicPage(){
  const {slug}=useParams();
  const [data,setData]=useState(null);
  const [error,setError]=useState("");
  useEffect(()=>{(async()=>{try{const r=await fetch(`${BASE}/api/trace/v1/public/${encodeURIComponent(slug)}`);const d=await r.json();if(!r.ok||d?.ok===false)throw new Error("Este seguimiento no está disponible.");setData(d.data);}catch(e){setError(e.message);}})();},[slug]);
  if(error)return <div className="min-h-screen bg-slate-50 grid place-items-center p-6"><div className="max-w-md text-center"><h1 className="text-xl font-bold text-slate-900">Seguimiento no disponible</h1><p className="mt-2 text-sm text-slate-500">{error}</p></div></div>;
  if(!data)return <div className="min-h-screen bg-slate-50 grid place-items-center text-sm text-slate-500">Cargando seguimiento…</div>;
  return <div className="min-h-screen bg-slate-50"><main className="mx-auto max-w-3xl p-5 sm:p-8"><div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-blue-600">INTAP TRACE</p><h1 className="mt-2 text-2xl font-bold text-slate-900">{data.title}</h1><p className="mt-1 text-sm text-slate-500">{data.control}</p></div><span className="w-fit rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{human(data.status)}</span></div>
    <div className="mt-7"><div className="flex items-end justify-between"><div><div className="text-sm font-semibold text-slate-700">Avance</div><div className="mt-1 text-3xl font-bold text-slate-900">{Number(data.progress||0)}%</div></div><div className="text-right text-xs text-slate-500">Referencia<br/><strong className="text-slate-700">{data.reference}</strong></div></div><div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{width:`${Math.max(0,Math.min(100,Number(data.progress||0)))}%`}}/></div></div>
    <div className="mt-7 grid gap-3 sm:grid-cols-2">{data.item&&<div className="rounded-2xl bg-slate-50 p-4"><div className="text-xs text-slate-500">Elemento / propiedad / recurso</div><div className="mt-1 font-semibold text-slate-900">{data.item}</div>{data.itemCode&&<div className="mt-1 text-xs text-slate-500">{data.itemCode}</div>}</div>}<div className="rounded-2xl bg-slate-50 p-4"><div className="text-xs text-slate-500">Estado actual</div><div className="mt-1 font-semibold text-slate-900">{human(data.status)}</div></div></div>
    <div className="mt-7 border-t border-slate-100 pt-5"><p className="text-xs leading-5 text-slate-500">Esta vista muestra únicamente información autorizada para seguimiento. Las notas internas, datos privados del equipo y configuraciones administrativas no se comparten.</p></div></div></main></div>;
}
