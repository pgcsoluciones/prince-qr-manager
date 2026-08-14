import {useEffect,useMemo,useState} from "react";
import {TRACE_ATTACHMENT_ACCEPT,humanAttachmentSupport,prepareTraceAttachment,validateTraceAttachment} from "../../utils/traceMedia.js";

const BASE=import.meta.env.VITE_API_URL||"https://api.code.intaprd.com";
const auth=()=>{const t=localStorage.getItem("qr_token")||"";return t?{Authorization:`Bearer ${t}`}:{}};
async function api(path,options={}){const r=await fetch(`${BASE}${path}`,{...options,headers:{...auth(),...(options.headers||{})}}),d=await r.json().catch(()=>({}));if(!r.ok||d?.ok===false)throw new Error(d.message||d.error||`HTTP ${r.status}`);return d}
const statusLabel=s=>({pending:"Pendiente",approved:"Aprobada",observed:"Observada",rejected:"Rechazada"})[s]||s;
const typeLabel=t=>({photo:"Fotografía",video:"Video",audio:"Audio",file:"Documento",signature:"Firma",location:"Ubicación",text:"Texto"})[t]||t;
const tone=s=>s==="approved"?"bg-emerald-50 text-emerald-700":s==="observed"?"bg-amber-50 text-amber-700":s==="rejected"?"bg-red-50 text-red-700":"bg-violet-50 text-violet-700";
const date=v=>v?new Date(v).toLocaleString("es-DO",{day:"2-digit",month:"short",year:"numeric",hour:"numeric",minute:"2-digit"}):"—";

export default function TraceEvidencePage({projectId,executions=[],onNavigate}){
 const[stage,setStage]=useState(""),[type,setType]=useState(""),[sort,setSort]=useState("recent"),[status,setStatus]=useState(""),[data,setData]=useState({summary:{},items:[],stages:[]}),[selected,setSelected]=useState(""),[detail,setDetail]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState(""),[showHistory,setShowHistory]=useState(false),[uploadOpen,setUploadOpen]=useState(false),[validateOpen,setValidateOpen]=useState(false),[busy,setBusy]=useState(false),[stageOverview,setStageOverview]=useState(null),[upload,setUpload]=useState({executionId:"",executionStageId:"",executionActivityId:"",requirementId:"",file:null}),[decision,setDecision]=useState({decision:"approved",notes:""});
 async function load(){if(!projectId)return;setLoading(true);setError("");try{const p=new URLSearchParams();if(stage)p.set("stage",stage);if(type)p.set("type",type);if(status)p.set("status",status);p.set("limit","50");const d=await api(`/api/trace/v1/admin/projects/${encodeURIComponent(projectId)}/evidence?${p}`);const next=d.data||{};setData(next);setSelected(id=>id&&next.items?.some(x=>x.id===id)?id:(next.items?.[0]?.id||""))}catch(e){setError(e.message)}finally{setLoading(false)}}
 async function loadDetail(id){if(!id){setDetail(null);return}try{const d=await api(`/api/trace/v1/admin/projects/${encodeURIComponent(projectId)}/evidence/${encodeURIComponent(id)}`);setDetail(d.data||null)}catch(e){setError(e.message)}}
 async function loadStages(executionId){if(!executionId){setStageOverview(null);return}try{const d=await api(`/api/trace/v1/executions/${encodeURIComponent(executionId)}/stages/overview`);setStageOverview(d.data||null)}catch{setStageOverview(null)}}
 useEffect(()=>{load()},[projectId,stage,type,status,sort]);useEffect(()=>{setShowHistory(false);loadDetail(selected)},[selected]);useEffect(()=>{loadStages(upload.executionId)},[upload.executionId]);
 const evidence=detail?.evidence||data.items?.find(x=>x.id===selected)||null,chosenStage=(stageOverview?.stages||[]).find(s=>s.id===upload.executionStageId),activities=chosenStage?.activities||[],chosenActivity=activities.find(a=>a.id===upload.executionActivityId),requirements=chosenActivity?.evidence_requirements||[];
 const stageSelected=Boolean(upload.executionStageId),activitiesAvailable=activities.length>0,activityWithoutResponsible=Boolean(chosenActivity&&!chosenActivity.assigned_to&&!chosenActivity.assigned_email);
 const uploadReady=Boolean(upload.executionId&&upload.executionStageId&&upload.file);
 async function saveUpload(){if(!upload.executionId||!upload.executionStageId||!upload.file)return setError("Selecciona el trabajo, la etapa y el archivo de evidencia.");setBusy(true);setError("");try{const prepared=await prepareTraceAttachment(upload.file),fd=new FormData();fd.set("executionId",upload.executionId);fd.set("executionStageId",upload.executionStageId);if(upload.executionActivityId)fd.set("executionActivityId",upload.executionActivityId);if(upload.requirementId)fd.set("requirementId",upload.requirementId);fd.set("file",prepared.file);if(prepared.thumbnail)fd.set("thumbnail",prepared.thumbnail);fd.set("metadata",JSON.stringify(prepared.metadata||{}));const d=await api(`/api/trace/v1/admin/projects/${encodeURIComponent(projectId)}/evidence`,{method:"POST",body:fd});setUploadOpen(false);setUpload({executionId:"",executionStageId:"",executionActivityId:"",requirementId:"",file:null});await load();setSelected(d.data?.id||"")}catch(e){setError(e.message)}finally{setBusy(false)}}
 async function saveDecision(){if(!evidence)return;setBusy(true);setError("");try{await api(`/api/trace/v1/admin/projects/${encodeURIComponent(projectId)}/evidence/${encodeURIComponent(evidence.id)}/validate`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(decision)});setValidateOpen(false);setDecision({decision:"approved",notes:""});await load();await loadDetail(evidence.id)}catch(e){setError(e.message)}finally{setBusy(false)}}
 return <div className="mx-auto max-w-[1560px] space-y-5">
  <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><h1 className="text-3xl font-black tracking-[-.035em] sm:text-4xl">Evidencias</h1><p className="mt-1 text-sm text-slate-500">Consulta y valida las pruebas clave del proyecto.</p></div><button onClick={()=>setUploadOpen(true)} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white">＋&nbsp;&nbsp;Subir evidencia</button></header>
  {error&&<div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}
  <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric active={status==="pending"} onClick={()=>setStatus(status==="pending"?"":"pending")} label="Pendientes" value={data.summary?.pending||0} tone="violet"/><Metric active={status==="approved"} onClick={()=>setStatus(status==="approved"?"":"approved")} label="Aprobadas" value={data.summary?.approved||0} tone="green"/><Metric active={status==="observed"} onClick={()=>setStatus(status==="observed"?"":"observed")} label="Observadas" value={data.summary?.observed||0} tone="amber"/><Metric active={status==="rejected"} onClick={()=>setStatus(status==="rejected"?"":"rejected")} label="Rechazadas" value={data.summary?.rejected||0} tone="red"/></section>
  <div className={`grid gap-5 ${evidence?"xl:grid-cols-[minmax(0,1fr)_390px]":""}`}><section className="min-w-0 space-y-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex flex-col gap-3 sm:flex-row"><select value={stage} onChange={e=>setStage(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"><option value="">Todas las etapas</option>{(data.stages||[]).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><select value={type} onChange={e=>setType(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"><option value="">Todos los tipos</option><option value="photo">Fotografía</option><option value="audio">Audio</option><option value="file">Documento</option><option value="signature">Firma</option></select></div><select value={sort} onChange={e=>setSort(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"><option value="recent">Más recientes</option></select></div>
   <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">{loading?<div className="p-14 text-center text-sm text-slate-400">Cargando evidencias…</div>:<div className="divide-y divide-slate-100">{(data.items||[]).map(item=><button key={item.id} onClick={()=>setSelected(item.id)} className={`flex w-full items-center gap-3 p-4 text-left transition hover:bg-slate-50 ${selected===item.id?"bg-blue-50/50 ring-1 ring-inset ring-blue-500":""}`}><EvidenceThumb projectId={projectId} item={item}/><div className="min-w-0 flex-1"><div className="truncate text-sm font-black text-slate-900">{item.title}</div><div className="mt-1 truncate text-[11px] text-slate-400">{item.stageName||"Proyecto"} · {typeLabel(item.type)}</div><div className="mt-1 truncate text-[11px] text-slate-500">Subida por {item.uploaderEmail||"Sin autor"} · {date(item.createdAt)}</div></div><span className={`shrink-0 rounded-lg px-2.5 py-1 text-[9px] font-black ${tone(item.status)}`}>{statusLabel(item.status)}</span></button>)}{!data.items?.length&&<div className="p-14 text-center text-sm text-slate-400">No hay evidencias en este filtro.</div>}</div>}</div><div className="text-xs text-slate-400">Mostrando {data.items?.length||0} evidencia{data.items?.length===1?"":"s"}</div></section>
   {evidence&&<aside className="hidden xl:block"><Detail projectId={projectId} data={detail} evidence={evidence} showHistory={showHistory} setShowHistory={setShowHistory} onClose={()=>setSelected("")} onValidate={()=>setValidateOpen(true)} onActivity={()=>onNavigate?.("stages")}/></aside>}
  </div>
  {evidence&&<div className="fixed inset-0 z-[85] bg-slate-950/30 xl:hidden" onMouseDown={e=>e.target===e.currentTarget&&setSelected("")}><div className="absolute inset-y-0 right-0 w-full max-w-[520px] overflow-y-auto bg-[#f6f8fb] p-3 shadow-2xl sm:p-5"><Detail projectId={projectId} data={detail} evidence={evidence} showHistory={showHistory} setShowHistory={setShowHistory} onClose={()=>setSelected("")} onValidate={()=>setValidateOpen(true)} onActivity={()=>onNavigate?.("stages")}/></div></div>}
  {uploadOpen&&<Modal title="Subir evidencia" subtitle="Registra una prueba del proyecto. La actividad es opcional." wide onClose={()=>setUploadOpen(false)}>
   <div className="grid gap-5 md:grid-cols-2">
    <Field label="Trabajo" help="Define la ejecución donde ocurrió el trabajo.">
     <select className="control" value={upload.executionId} onChange={e=>setUpload(x=>({...x,executionId:e.target.value,executionStageId:"",executionActivityId:"",requirementId:""}))}>
      <option value="">Selecciona un trabajo…</option>
      {executions.map(e=><option key={e.id} value={e.id}>{e.title||e.execution_code}</option>)}
     </select>
    </Field>
    <Field label="Etapa" help={upload.executionId?"Selecciona dónde ocurrió la evidencia.":"Primero selecciona el trabajo."}>
     <select disabled={!upload.executionId} className="control disabled:bg-slate-50 disabled:text-slate-400" value={upload.executionStageId} onChange={e=>setUpload(x=>({...x,executionStageId:e.target.value,executionActivityId:"",requirementId:""}))}>
      <option value="">Selecciona una etapa…</option>
      {(stageOverview?.stages||[]).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
     </select>
    </Field>
   </div>

   <Field label="Actividad" help="Opcional. Selecciónala solo si esta evidencia demuestra una actividad concreta.">
    {!stageSelected?
     <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-xs text-slate-500">Selecciona primero una etapa para consultar sus actividades.</div>
     :activitiesAvailable?
     <select className="control" value={upload.executionActivityId} onChange={e=>setUpload(x=>({...x,executionActivityId:e.target.value,requirementId:""}))}>
      <option value="">Sin actividad específica · Evidencia de etapa</option>
      {activities.map(a=><option key={a.id} value={a.id}>{a.title}</option>)}
     </select>
     :
     <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
      <div className="text-sm font-black text-blue-900">Evidencia de etapa</div>
      <p className="mt-1 text-xs leading-5 text-blue-700">No hay actividades materializadas en esta etapa. Puedes subir la evidencia igualmente; quedará vinculada a la etapa y no afectará el cumplimiento de ninguna actividad.</p>
     </div>}
   </Field>

   {activityWithoutResponsible&&<div className="overflow-hidden rounded-2xl border border-red-300 bg-red-50">
    <div className="bg-red-600 px-4 py-2 text-xs font-black tracking-wide text-white">RESPONSABLE NO ASIGNADO</div>
    <div className="px-4 py-3">
     <p className="text-xs font-bold text-red-800">Esta actividad no tiene una persona o equipo responsable claramente asignado.</p>
     <p className="mt-1 text-[11px] leading-4 text-red-600">La evidencia puede identificar quién la subió, pero eso no sustituye al responsable operativo de la actividad.</p>
    </div>
   </div>}

   {requirements.length>0&&<Field label="Requisito de evidencia" help="Indica qué requisito específico estás demostrando.">
    <select className="control" value={upload.requirementId} onChange={e=>setUpload(x=>({...x,requirementId:e.target.value}))}>
     <option value="">Selecciona un requisito…</option>
     {requirements.map(r=><option key={r.id} value={r.id}>{r.label} · {r.approved}/{r.required_count}</option>)}
    </select>
   </Field>}

   <Field label="Adjuntar evidencia" help="Selecciona una imagen, documento o audio. TRACE validará el archivo antes de subirlo.">
    <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-5 transition hover:border-blue-400 hover:bg-blue-50/40">
     <div className="flex items-center justify-between gap-4">
      <div>
       <div className="text-sm font-black text-slate-800">{upload.file?"Reemplazar archivo":"Examinar archivo"}</div>
       <div className="mt-1 text-[11px] text-slate-500">{upload.file?upload.file.name:"Selecciona desde tu dispositivo"}</div>
      </div>
      <span className="rounded-xl bg-white px-4 py-2 text-xs font-black text-blue-600 shadow-sm">Seleccionar</span>
     </div>
     <input type="file" accept={TRACE_ATTACHMENT_ACCEPT} className="sr-only" onChange={e=>{const file=e.target.files?.[0]||null;if(file){const check=validateTraceAttachment(file);if(!check.ok){setError(check.message);e.target.value="";setUpload(x=>({...x,file:null}));return}setError("")}setUpload(x=>({...x,file}))}}/>
    </label>
    <p className="mt-3 text-[11px] font-normal leading-5 text-slate-500">{humanAttachmentSupport()}</p>
    <p className="mt-1 text-[10px] font-normal leading-4 text-slate-400">Las imágenes se optimizan y generan miniatura antes de subir. HEIC/HEIF se convierte cuando el navegador lo permite.</p>
   </Field>

   {upload.file&&<UploadFilePreview file={upload.file} onRemove={()=>setUpload(x=>({...x,file:null}))}/>}

   <div className="rounded-2xl bg-slate-50 px-4 py-3 text-[11px] leading-5 text-slate-500">
    <b className="text-slate-700">Antes de subir:</b> confirma que la evidencia corresponde a la actividad seleccionada. El archivo quedará registrado con autor, fecha, tipo y contexto operativo.
   </div>

   <Actions busy={busy} disabled={!uploadReady} onCancel={()=>setUploadOpen(false)} onSave={saveUpload} save="Subir evidencia"/>
  </Modal>}

  {validateOpen&&evidence&&<Modal title="Validar evidencia" onClose={()=>setValidateOpen(false)}><Field label="Decisión"><select className="control" value={decision.decision} onChange={e=>setDecision(x=>({...x,decision:e.target.value}))}><option value="approved">Aprobar</option><option value="observed">Observar</option><option value="rejected">Rechazar</option></select></Field><Field label="Motivo"><textarea rows={4} className="control" value={decision.notes} onChange={e=>setDecision(x=>({...x,notes:e.target.value}))} placeholder={decision.decision==="approved"?"Observación opcional":"Motivo obligatorio"}/></Field><Actions busy={busy} onCancel={()=>setValidateOpen(false)} onSave={saveDecision} save="Registrar validación"/></Modal>}
 </div>
}
function Detail({projectId,data,evidence,showHistory,setShowHistory,onClose,onValidate,onActivity}){const canValidate=data?.viewer?.canValidate&&evidence.status==="pending";return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-5"><div className="flex items-start justify-between gap-3"><div><div className="text-xs font-bold text-slate-500">{evidence.code}</div><h2 className="mt-2 text-xl font-black leading-tight">{evidence.title}</h2><span className={`mt-3 inline-flex rounded-lg px-2.5 py-1 text-[9px] font-black ${tone(evidence.status)}`}>{statusLabel(evidence.status)}</span></div><button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200">×</button></div><div className="mt-5"><EvidenceViewer projectId={projectId} evidence={evidence}/></div><div className="mt-5 grid gap-3 border-y border-slate-100 py-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2"><Info label="Etapa" value={evidence.stageName||"Proyecto"}/><Info label="Actividad" value={evidence.activityTitle||"Sin actividad"}/><Info label="Subida por" value={evidence.uploaderEmail||"—"}/><Info label="Fecha" value={date(evidence.createdAt)}/></div>{evidence.observation&&<Block title="Observación"><p className="text-xs leading-5 text-slate-600">{evidence.observation}</p></Block>}{evidence.requirementLabel&&<Block title="Requisito"><p className="text-xs font-semibold text-slate-700">{evidence.requirementLabel}</p><p className="mt-1 text-[10px] text-slate-400">Requeridas: {evidence.requiredCount}</p></Block>}{evidence.relatedIncident&&<Block title="Relación"><span className="text-xs font-black text-blue-600">Relacionada con {evidence.relatedIncident.code}</span></Block>}<Block title="Validación"><div className={`rounded-xl p-4 ${tone(evidence.status)}`}><div className="text-xs font-black">{statusLabel(evidence.status)}</div><p className="mt-1 text-[11px] opacity-75">{evidence.status==="pending"?"La evidencia está en espera de revisión.":evidence.observation||`Validada ${evidence.validatedAt?date(evidence.validatedAt):""}`}</p></div></Block>{showHistory&&<Block title="Historial">{(data?.history||[]).map(h=><div key={h.id} className="border-t border-slate-100 py-3 first:border-0"><div className="text-[10px] font-black">{statusLabel(h.decision)}</div><div className="mt-1 text-[10px] text-slate-500">{h.notes||"Sin observación"}</div><div className="mt-1 text-[9px] text-slate-400">{date(h.decided_at)}{h.decided_by_email?` · ${h.decided_by_email}`:""}</div></div>)}</Block>}<div className="mt-5 grid grid-cols-2 gap-2"><button onClick={()=>setShowHistory(v=>!v)} className="rounded-xl border border-blue-200 px-4 py-3 text-xs font-black text-blue-600">{showHistory?"Ocultar historial":"Ver historial"}</button><button onClick={canValidate?onValidate:onActivity} className="rounded-xl bg-blue-600 px-4 py-3 text-xs font-black text-white">{canValidate?"Validar evidencia":"Ver actividad"}</button></div></section>}
function UploadFilePreview({file,onRemove}){
 const[src,setSrc]=useState("");
 useEffect(()=>{let url="";if(file?.type?.startsWith("image/")){url=URL.createObjectURL(file);setSrc(url)}else setSrc("");return()=>{if(url)URL.revokeObjectURL(url)}},[file]);
 const size=file?.size<1024*1024?`${Math.max(1,Math.round(file.size/1024))} KB`:`${(file.size/1024/1024).toFixed(1)} MB`;
 const ext=String(file?.name||"archivo").split(".").pop()?.toUpperCase()||"ARCHIVO";
 return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
  <div className="flex items-center gap-4 p-4">
   <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-xl bg-slate-100 text-xs font-black text-slate-400">
    {src?<img src={src} alt="Vista previa" className="h-full w-full object-cover"/>:<span>{file?.type?.startsWith("audio/")?"AUDIO":ext}</span>}
   </div>
   <div className="min-w-0 flex-1">
    <div className="text-[10px] font-black uppercase tracking-[.12em] text-slate-400">Archivo seleccionado</div>
    <div className="mt-1 truncate text-sm font-black text-slate-900">{file?.name}</div>
    <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-500"><span className="rounded-full bg-slate-100 px-2 py-1">{ext}</span><span className="rounded-full bg-slate-100 px-2 py-1">{size}</span>{file?.type?.startsWith("image/")&&<span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">Se optimizará</span>}</div>
    <button type="button" onClick={onRemove} className="mt-3 text-xs font-black text-red-600">Quitar archivo</button>
   </div>
  </div>
 </div>
}

function EvidenceThumb({projectId,item}){const[src,setSrc]=useState("");useEffect(()=>{let url="",cancel=false;if(item.type!=="photo")return;const path=item.thumbnailUrl||item.fileUrl;fetch(`${BASE}${path}`,{headers:auth()}).then(r=>r.ok?r.blob():null).then(b=>{if(b&&!cancel){url=URL.createObjectURL(b);setSrc(url)}}).catch(()=>{});return()=>{cancel=true;if(url)URL.revokeObjectURL(url)}},[projectId,item.id,item.thumbnailUrl,item.fileUrl,item.type]);return <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-[10px] font-black text-slate-400">{src?<img src={src} alt="" className="h-full w-full object-cover"/>:typeLabel(item.type)}</div>}
function EvidenceViewer({evidence}){const[src,setSrc]=useState("");useEffect(()=>{let url="",cancel=false;fetch(`${BASE}${evidence.fileUrl}`,{headers:auth()}).then(r=>r.ok?r.blob():null).then(b=>{if(b&&!cancel){url=URL.createObjectURL(b);setSrc(url)}}).catch(()=>{});return()=>{cancel=true;if(url)URL.revokeObjectURL(url)}},[evidence.id,evidence.fileUrl]);if(evidence.type==="photo")return <a href={src||undefined} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl bg-slate-100">{src?<img src={src} alt={evidence.title} className="max-h-[420px] w-full object-contain"/>:<div className="grid h-56 place-items-center text-xs text-slate-400">Cargando imagen…</div>}</a>;if(evidence.type==="video")return src?<video controls src={src} className="w-full rounded-2xl"/>:<Placeholder/>;if(evidence.type==="audio")return src?<audio controls src={src} className="w-full"/>:<Placeholder/>;return <a href={src||undefined} download={evidence.originalFilename||"evidencia"} className="grid min-h-40 place-items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-center text-xs font-black text-blue-600">{evidence.originalFilename||typeLabel(evidence.type)}<span className="block text-[10px] font-normal text-slate-400">Abrir archivo</span></a>}
function Placeholder(){return <div className="grid h-40 place-items-center rounded-2xl bg-slate-50 text-xs text-slate-400">Cargando archivo…</div>}
function Metric({label,value,tone:t="violet",active,onClick}){const cls=t==="green"?"bg-emerald-50 text-emerald-600":t==="amber"?"bg-amber-50 text-amber-600":t==="red"?"bg-red-50 text-red-600":"bg-violet-50 text-violet-600";return <button onClick={onClick} className={`rounded-2xl border bg-white p-4 text-left ${active?"border-blue-500 ring-1 ring-blue-500":"border-slate-200"}`}><div className="flex items-center gap-3"><span className={`grid h-11 w-11 place-items-center rounded-xl ${cls}`}>○</span><div><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-2xl font-black">{value}</div></div></div></button>}
function Modal({title,subtitle,onClose,children,wide=false}){return <div className="fixed inset-0 z-[120] grid place-items-end bg-slate-950/40 sm:place-items-center sm:p-6" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className={`max-h-[94vh] w-full overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl sm:p-8 ${wide?"max-w-3xl":"max-w-xl"}`}><div className="mb-7 flex items-start justify-between gap-4"><div><h2 className="text-2xl font-black tracking-[-.02em]">{title}</h2>{subtitle&&<p className="mt-1 text-sm leading-5 text-slate-500">{subtitle}</p>}</div><button onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200">×</button></div><div className="space-y-6">{children}</div></div></div>}
function Field({label,help,children}){return <div className="block"><div className="text-xs font-black text-slate-700">{label}</div>{help&&<p className="mt-1 text-[11px] font-normal leading-4 text-slate-400">{help}</p>}<div className="mt-3">{children}</div></div>}
function Actions({busy,disabled=false,onCancel,onSave,save}){return <div className="flex justify-end gap-3 border-t border-slate-100 pt-5"><button disabled={busy} onClick={onCancel} className="rounded-xl border border-slate-200 px-5 py-3 text-xs font-black">Cancelar</button><button disabled={busy||disabled} onClick={onSave} className="rounded-xl bg-blue-600 px-6 py-3 text-xs font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300">{busy?"Guardando…":save}</button></div>}
function Info({label,value}){return <div><div className="text-[9px] font-black uppercase tracking-[.12em] text-slate-400">{label}</div><div className="mt-1 text-xs font-semibold text-slate-700">{value||"—"}</div></div>}
function Block({title,children}){return <div className="border-b border-slate-100 py-5"><h3 className="mb-3 text-xs font-black">{title}</h3>{children}</div>}
