import { useEffect, useMemo, useState } from "react";
import { optimizeTracePhoto } from "../utils/traceImageOptimization.js";

const BASE = import.meta.env.VITE_API_URL || "https://api.code.intaprd.com";

async function call(path, token, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({ ok:false, error:"invalid_response" }));
  if (!res.ok || data.ok === false) throw new Error(data.message || data.error || `HTTP ${res.status}`);
  return data;
}

export default function TraceOperationalPage() {
  const [token,setToken]=useState(()=>localStorage.getItem("trace_operational_token")||"");
  const [tasks,setTasks]=useState([]); const [selected,setSelected]=useState(null);
  const [loading,setLoading]=useState(false); const [error,setError]=useState(""); const [uploading,setUploading]=useState(false);
  const activeToken=useMemo(()=>token.trim(),[token]);

  async function refresh(){ if(!activeToken)return; setLoading(true); setError(""); try{const r=await call("/api/trace/v1/operational/tasks",activeToken);setTasks(r.data||[]); if(selected){const next=(r.data||[]).find(t=>t.id===selected.id); if(next)setSelected(next)}}catch(e){setError(e.message)}finally{setLoading(false)}}
  async function openTask(id){setLoading(true);setError("");try{const r=await call(`/api/trace/v1/operational/tasks/${id}`,activeToken);setSelected(r.data)}catch(e){setError(e.message)}finally{setLoading(false)}}
  async function action(name){if(!selected)return;setLoading(true);setError("");try{const r=await call(`/api/trace/v1/operational/tasks/${selected.id}/${name}`,activeToken,{method:"POST"});setSelected(r.data);await refresh()}catch(e){setError(e.message)}finally{setLoading(false)}}
  async function upload(file){if(!file||!selected)return;setUploading(true);setError("");try{const optimized=await optimizeTracePhoto(file);const fd=new FormData();fd.append("file",optimized.display);fd.append("capturedAt",new Date().toISOString());fd.append("metadata",JSON.stringify({clientOptimization:optimized.optimized,originalBytes:optimized.originalBytes||file.size,display:optimized.displayMeta||null,thumbnail:optimized.thumbnailMeta||null}));await call(`/api/trace/v1/operational/tasks/${selected.id}/evidence`,activeToken,{method:"POST",body:fd});await openTask(selected.id)}catch(e){setError(e.message)}finally{setUploading(false)}}

  useEffect(()=>{if(activeToken)refresh()},[]);
  function saveToken(){localStorage.setItem("trace_operational_token",activeToken);refresh()}

  return <div className="min-h-screen bg-slate-100 text-slate-900">
    <div className="mx-auto max-w-md min-h-screen bg-white shadow-sm">
      <header className="sticky top-0 z-10 border-b bg-white px-4 py-4">
        <div className="text-xs font-semibold uppercase tracking-[.18em] text-blue-600">INTAP TRACE</div>
        <div className="text-xl font-bold">Portal operacional</div>
      </header>
      <main className="p-4 space-y-4">
        {!activeToken || tasks.length===0 && error ? <section className="rounded-2xl border p-4 space-y-3">
          <div className="font-semibold">Acceso de trabajo</div>
          <input className="w-full rounded-xl border px-3 py-3 text-sm" value={token} onChange={e=>setToken(e.target.value)} placeholder="Token operacional" />
          <button className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white" onClick={saveToken}>Entrar</button>
        </section>:null}
        {error?<div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>:null}
        {!selected && activeToken ? <section className="space-y-3">
          <div className="flex items-center justify-between"><h1 className="text-lg font-bold">Mis tareas</h1><button className="text-sm text-blue-600" onClick={refresh}>Actualizar</button></div>
          {loading?<div className="py-10 text-center text-slate-400">Cargando…</div>:tasks.map(t=><button key={t.id} onClick={()=>openTask(t.id)} className="w-full rounded-2xl border p-4 text-left shadow-sm">
            <div className="flex items-start justify-between gap-3"><div><div className="font-semibold">{t.stage?.name}</div><div className="mt-1 text-sm text-slate-500">{t.executionTitle}</div></div><span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{t.stage?.status}</span></div>
            <div className="mt-3 text-xs text-slate-500">{t.asset?.name||t.executionCode}</div>
          </button>)}
        </section>:null}
        {selected?<section className="space-y-4">
          <button className="text-sm text-blue-600" onClick={()=>setSelected(null)}>← Mis tareas</button>
          <div className="rounded-2xl border p-4"><div className="text-xs text-slate-500">{selected.executionCode}</div><h1 className="mt-1 text-xl font-bold">{selected.stage?.name}</h1><p className="mt-2 text-sm text-slate-600">{selected.stage?.instructions}</p><div className="mt-4 flex gap-2 text-xs"><span className="rounded-full bg-slate-100 px-2 py-1">{selected.stage?.status}</span>{selected.stage?.requiresEvidence?<span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">Requiere evidencia</span>:null}</div></div>
          {selected.permissions?.canStart?<button onClick={()=>action("start")} className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white">Iniciar tarea</button>:null}
          {selected.permissions?.canAddEvidence?<label className="block w-full cursor-pointer rounded-xl border-2 border-dashed p-5 text-center"><div className="font-semibold">{uploading?"Optimizando y subiendo…":"Tomar foto o adjuntar evidencia"}</div><div className="mt-1 text-xs text-slate-500">La foto se optimiza en el dispositivo antes de subir.</div><input disabled={uploading} type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={e=>upload(e.target.files?.[0])}/></label>:null}
          {selected.evidences?.length?<div className="rounded-2xl border p-4"><div className="font-semibold">Evidencias</div><div className="mt-2 text-sm text-slate-500">{selected.evidences.length} registrada(s)</div></div>:null}
          {selected.permissions?.canComplete?<button onClick={()=>action("complete")} className="w-full rounded-xl bg-emerald-600 py-3 font-semibold text-white">Completar etapa</button>:null}
        </section>:null}
      </main>
    </div>
  </div>;
}
