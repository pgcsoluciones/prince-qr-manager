import {useEffect,useState} from "react";
import {useAuth} from "../context/AuthContext.jsx";
import TraceProjectShell from "../components/trace/TraceProjectShell.jsx";
import TraceProjectSummaryDashboard from "../components/trace/TraceProjectSummaryDashboard.jsx";
import TraceProjectTimeline from "../components/trace/TraceProjectTimeline.jsx";
import TraceTimelineEventDrawer from "../components/trace/TraceTimelineEventDrawer.jsx";
import TraceOperationsCanvas from "../components/trace/TraceOperationsCanvas.jsx";
import TraceSupervisionBoard from "../components/trace/TraceSupervisionBoard.jsx";
import TraceTeamDirectory from "../components/trace/TraceTeamDirectory.jsx";
import TraceReportsCanvas from "../components/trace/TraceReportsCanvas.jsx";
import TraceActivityModal from "../components/trace/TraceActivityModal.jsx";
import TraceIncidentDrawer from "../components/trace/TraceIncidentDrawer.jsx";

const BASE=import.meta.env.VITE_API_URL||"https://api.code.intaprd.com";
function headers(){const t=localStorage.getItem("qr_token")||"";return{"Content-Type":"application/json",...(t?{Authorization:`Bearer ${t}`}:{})}}
async function req(path,options={}){const r=await fetch(`${BASE}${path}`,{...options,headers:{...headers(),...(options.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok||d?.ok===false)throw new Error(d.message||d.error||`HTTP ${r.status}`);return d}

export default function TraceProjectCommandCenterPage(){
 const{user}=useAuth();
 const[view,setView]=useState("summary"),[projects,setProjects]=useState([]),[projectId,setProjectId]=useState(""),[dashboard,setDashboard]=useState(null),[summary,setSummary]=useState(null),[period,setPeriod]=useState("week"),[loading,setLoading]=useState(true),[error,setError]=useState(""),[message,setMessage]=useState("");
 const[activityOpen,setActivityOpen]=useState(false),[activityText,setActivityText]=useState(""),[activityType,setActivityType]=useState("progress.updated"),[selectedExecution,setSelectedExecution]=useState(""),[busy,setBusy]=useState(false),[selectedIncident,setSelectedIncident]=useState(null),[selectedTimelineEvent,setSelectedTimelineEvent]=useState(null),[timelineRefresh,setTimelineRefresh]=useState(0);
 async function loadWorkspace(){setLoading(true);setError("");try{const d=await req("/api/trace/v1/admin/workspace");const ps=d.data?.projects||[];setProjects(ps);setProjectId(id=>id||localStorage.getItem("trace_active_project")||ps[0]?.id||"")}catch(e){setError(e.message)}finally{setLoading(false)}}
 async function loadProject(id=projectId){if(!id){setDashboard(null);setSummary(null);return}setLoading(true);setError("");try{const[d,s]=await Promise.all([req(`/api/trace/v1/admin/projects/${encodeURIComponent(id)}/dashboard?period=${period}`),req(`/api/trace/v1/admin/projects/${encodeURIComponent(id)}/summary`)]);setDashboard(d.data||null);setSummary(s.data||null);const execs=d.data?.executions||[];setSelectedExecution(x=>execs.some(e=>e.id===x)?x:(execs[0]?.id||""))}catch(e){setError(e.message)}finally{setLoading(false)}}
 useEffect(()=>{loadWorkspace()},[]);
 useEffect(()=>{if(projectId){localStorage.setItem("trace_active_project",projectId);loadProject(projectId)}},[projectId,period]);
 async function saveActivity(){if(!selectedExecution||!activityText.trim()){setError("Selecciona una actividad del proyecto y describe lo ocurrido.");return}setBusy(true);setError("");try{await req("/api/trace/v1/admin/activities",{method:"POST",body:JSON.stringify({executionId:selectedExecution,type:activityType,description:activityText.trim()})});setActivityOpen(false);setActivityText("");setMessage("Actividad registrada en la bitácora.");setTimelineRefresh(x=>x+1);await loadProject()}catch(e){setError(e.message)}finally{setBusy(false)}}
 async function share(){const path=summary?.project?.publicPath||dashboard?.project?.publicPath;if(!path)return;const url=`${window.location.origin}${path}`;try{await navigator.clipboard.writeText(url);setMessage("Enlace de seguimiento copiado.")}catch{window.open(url,"_blank","noopener,noreferrer")}}
 const work=dashboard?.executions||[],incidents=dashboard?.incidents||[],approvals=dashboard?.approvals||[];
 function openRegister(type="progress.updated",event=null){if(event?.execution_id)setSelectedExecution(event.execution_id);else setSelectedExecution(selectedExecution||work[0]?.id||"");setActivityType(type);setActivityText(type==="comment.added"?"Comentario: ":type==="correction.responded"?"Respuesta a corrección: ":"");setActivityOpen(true)}
 function contextAction(action,event){if(action==="comment")openRegister("comment.added",event);else if(action==="evidence")openRegister("evidence.added",event);else if(action==="correction")openRegister("correction.responded",event)}
 function reviewApproval(a){setSelectedTimelineEvent({id:a.id,event_type:"approval.requested",event_source:"system",description:"Aprobación pendiente de revisión",occurred_at:a.requested_at,execution_id:a.execution_id,execution_stage_id:a.execution_stage_id,activity_title:a.activity_title,stage_name:a.stage_name,actor_email:a.responsible_email,activity_status:"pending_approval",evidenceUrls:a.preview_url?[a.preview_url]:[],evidenceNames:[],evidence_count:a.preview_url?1:0,payload:{}})}
 function body(){
  if(view==="summary")return <TraceProjectSummaryDashboard data={summary} period={period} setPeriod={setPeriod} onRegister={()=>openRegister()} onShare={share} onOpenIncident={setSelectedIncident} onNavigate={setView}/>;
  if(view==="activities")return <TraceProjectTimeline key={`${projectId}:${timelineRefresh}`} projectId={projectId} onRegister={()=>openRegister()} onGenerateReport={()=>{setMessage("Abriendo Reportes para exportar el historial del proyecto.");setView("reports")}} onOpenEvent={setSelectedTimelineEvent} onReviewApproval={reviewApproval}/>;
  if(view==="stages")return <TraceOperationsCanvas operations={work} onOpen={()=>setView("summary")} onNewControl={()=>openRegister()}/>;
  if(view==="incidents")return <div className="space-y-4"><div><h1 className="text-3xl font-black">Incidencias</h1><p className="mt-1 text-sm text-slate-500">Situaciones del proyecto que requieren atención o decisión.</p></div><TraceSupervisionBoard incidents={incidents} approvals={approvals} onOpenIncident={setSelectedIncident}/></div>;
  if(view==="evidence")return <div className="rounded-2xl border border-slate-200 bg-white p-6"><h1 className="text-3xl font-black">Evidencias</h1><p className="mt-2 text-sm text-slate-500">Las evidencias aparecerán aquí conforme se registren actividades con fotografías o documentos.</p></div>;
  if(view==="team")return <TraceTeamDirectory/>;
  if(view==="reports")return <TraceReportsCanvas operations={work}/>;
  if(view==="settings")return <div className="rounded-2xl border border-slate-200 bg-white p-6"><h1 className="text-3xl font-black">Configuración del proyecto</h1><p className="mt-2 text-sm text-slate-500">Etapas, responsabilidades, permisos y vista compartida.</p></div>;
  if(view==="help")return <div className="rounded-2xl border border-slate-200 bg-white p-6"><h1 className="text-3xl font-black">Ayuda</h1><p className="mt-2 text-sm text-slate-500">Ayuda contextual de KAWVO Trace.</p></div>;
  return null;
 }
 return <TraceProjectShell view={view} onView={setView} projects={projects} projectId={projectId} onProjectChange={setProjectId} incidentCount={Number(summary?.metrics?.openIncidents||dashboard?.metrics?.openIncidents||0)} userLabel={user?.email||"Usuario"}>
  {loading&&<div className="fixed left-[264px] right-0 top-0 z-50 h-1 bg-blue-100"><div className="h-full w-1/3 animate-pulse bg-blue-600"/></div>}
  {error&&<div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}
  {message&&<div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700"><span>{message}</span><button onClick={()=>setMessage("")}>×</button></div>}
  {!projectId&&!loading?<div className="grid min-h-[65vh] place-items-center"><div className="text-center"><h1 className="text-3xl font-black">Agrega tu primer proyecto</h1><p className="mt-2 text-sm text-slate-500">Cuando exista un proyecto activo, su resumen aparecerá aquí.</p></div></div>:body()}
  <TraceActivityModal open={activityOpen} work={work} executionId={selectedExecution} setExecutionId={setSelectedExecution} type={activityType} setType={setActivityType} description={activityText} setDescription={setActivityText} busy={busy} onClose={()=>setActivityOpen(false)} onSave={saveActivity}/>
  <TraceIncidentDrawer incident={selectedIncident} onClose={()=>setSelectedIncident(null)}/>
  <TraceTimelineEventDrawer event={selectedTimelineEvent} onClose={()=>setSelectedTimelineEvent(null)} onContextAction={contextAction}/>
 </TraceProjectShell>
}
