import jwt from "@tsndr/cloudflare-worker-jwt";
import {getTraceDatabase} from "./trace/shared/database.js";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization"};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});
const parse=(v,f={})=>{try{return v?JSON.parse(v):f}catch{return f}};
const CLOSED_INCIDENTS=new Set(["resolved","validated","closed"]);
const FINISHED_ACTIVITIES=new Set(["completed","skipped","cancelled"]);
const PRIORITY={urgent:4,high:3,normal:2,low:1};

async function context(request,env){
 const h=request.headers.get("Authorization")||"";if(!h.startsWith("Bearer "))return null;
 const token=h.slice(7).trim();let ok=false;try{ok=await jwt.verify(token,env.JWT_SECRET||"changeme-set-in-cloudflare-dashboard")}catch{return null}if(!ok)return null;
 const p=jwt.decode(token)?.payload||{};if((p.session_type||"standard")!=="standard")return null;
 const userId=p.user_id||p.userId||p.id||p.sub;if(!userId)return null;
 const db=getTraceDatabase(env);const user=await db.prepare(`SELECT id,enterprise_id,is_active FROM users WHERE id=? LIMIT 1`).bind(userId).first();
 if(!user||Number(user.is_active)!==1)return null;return{db,userId:user.id,tenantId:user.enterprise_id||user.id};
}

function activityEffectiveComplete(a,evidenceCount,approvalRows){
 if(a.status!=="completed")return false;
 if(Number(a.requires_evidence)===1&&evidenceCount<1)return false;
 if(Number(a.requires_approval)===1&&!approvalRows.some(x=>x.status==="approved"))return false;
 return true;
}

function expectedProgress(activities){
 const required=activities.filter(a=>Number(a.is_required)===1);
 const dated=required.filter(a=>a.planned_start_at||a.due_at);
 if(!dated.length)return null;
 const now=Date.now();
 const total=dated.reduce((sum,a)=>{
  const start=a.planned_start_at?new Date(a.planned_start_at).getTime():null;
  const due=a.due_at?new Date(a.due_at).getTime():null;
  if(start&&due&&due>start){if(now<=start)return sum;if(now>=due)return sum+1;return sum+(now-start)/(due-start)}
  if(due)return sum+(now>=due?1:0);
  return sum+(start&&now>start?1:0);
 },0);
 return Math.round(total*100/dated.length);
}

function humanStageStatus({legacyStatus,totalRequired,completedRequired,blockingCount,attentionCount,hasActivity}){
 if(!hasActivity){
  if(["approved","completed"].includes(legacyStatus))return"completed";
  if(["correction_required","rejected"].includes(legacyStatus))return"requires_attention";
  if(["in_progress","pending_approval","available"].includes(legacyStatus))return"in_progress";
  return"not_started";
 }
 if(blockingCount>0)return"blocked";
 if(totalRequired>0&&completedRequired===totalRequired&&attentionCount===0)return"completed";
 if(attentionCount>0)return"requires_attention";
 if(completedRequired>0)return"in_progress";
 return"not_started";
}

export async function handleTraceV1StagesOverviewApi(request,env){
 const url=new URL(request.url);const m=url.pathname.match(/^\/api\/trace\/v1\/executions\/([^/]+)\/stages\/overview$/);if(!m)return null;
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
 if(request.method!=="GET")return json({ok:false,error:"method_not_allowed"},405);
 const c=await context(request,env);if(!c)return json({ok:false,error:"unauthorized"},401);
 const executionId=decodeURIComponent(m[1]);
 const execution=await c.db.prepare(`SELECT e.*,a.name project_name,a.location project_location,a.status project_asset_status,a.qr_slug,p.name process_name FROM trace_executions e LEFT JOIN trace_assets a ON a.id=e.asset_id LEFT JOIN trace_processes p ON p.id=e.process_id WHERE e.id=? AND e.tenant_id=? LIMIT 1`).bind(executionId,c.tenantId).first();
 if(!execution)return json({ok:false,error:"execution_not_found"},404);

 const [stageR,activityR,evidenceR,incidentR,approvalR,participantR]=await Promise.all([
  c.db.prepare(`SELECT es.*,s.name,s.description,s.stage_type,s.responsible_role,s.estimated_duration_minutes,s.requires_evidence stage_requires_evidence,s.requires_approval stage_requires_approval,u.email responsible_email FROM trace_execution_stages es JOIN trace_stages s ON s.id=es.stage_id LEFT JOIN users u ON u.id=es.assigned_to WHERE es.execution_id=? ORDER BY es.stage_order`).bind(executionId).all(),
  c.db.prepare(`SELECT ea.*,u.email assigned_email FROM trace_execution_activities ea LEFT JOIN users u ON u.id=ea.assigned_to WHERE ea.execution_id=? AND ea.tenant_id=? ORDER BY ea.activity_order`).bind(executionId,c.tenantId).all(),
  c.db.prepare(`SELECT id,execution_stage_id,execution_activity_id,evidence_type,public_url,original_filename,created_at FROM trace_evidences WHERE execution_id=? AND tenant_id=? ORDER BY created_at`).bind(executionId,c.tenantId).all(),
  c.db.prepare(`SELECT id,execution_stage_id,execution_activity_id,incident_code,title,severity,status,assigned_to,metadata_json,reported_at FROM trace_incidents WHERE execution_id=? AND tenant_id=? ORDER BY reported_at DESC`).bind(executionId,c.tenantId).all(),
  c.db.prepare(`SELECT id,execution_stage_id,execution_activity_id,status,assigned_approver_id,requested_at,decided_at,decided_by FROM trace_approvals WHERE execution_id=? AND tenant_id=? ORDER BY requested_at DESC`).bind(executionId,c.tenantId).all(),
  c.db.prepare(`SELECT ep.user_id,ep.participation_role,u.email FROM trace_execution_participants ep LEFT JOIN users u ON u.id=ep.user_id WHERE ep.execution_id=? AND ep.tenant_id=? AND ep.status='active' ORDER BY ep.created_at`).bind(executionId,c.tenantId).all(),
 ]);
 const allActivities=activityR.results||[],evidences=evidenceR.results||[],incidents=incidentR.results||[],approvals=approvalR.results||[],participants=participantR.results||[];
 const evidenceByActivity=new Map(),approvalByActivity=new Map();
 for(const e of evidences){if(!e.execution_activity_id)continue;const arr=evidenceByActivity.get(e.execution_activity_id)||[];arr.push(e);evidenceByActivity.set(e.execution_activity_id,arr)}
 for(const a of approvals){if(!a.execution_activity_id)continue;const arr=approvalByActivity.get(a.execution_activity_id)||[];arr.push(a);approvalByActivity.set(a.execution_activity_id,arr)}
 let totalRequiredProject=0,totalCompletedProject=0;
 const stages=(stageR.results||[]).map(stage=>{
  const activities=allActivities.filter(a=>a.execution_stage_id===stage.id);
  const stageIncidents=incidents.filter(i=>i.execution_stage_id===stage.id&&!CLOSED_INCIDENTS.has(i.status));
  const stageApprovals=approvals.filter(a=>a.execution_stage_id===stage.id&&a.status==="pending");
  const required=activities.filter(a=>Number(a.is_required)===1);
  const enriched=activities.map(a=>{
   const ev=evidenceByActivity.get(a.id)||[],ap=approvalByActivity.get(a.id)||[];
   const effectiveComplete=activityEffectiveComplete(a,ev.length,ap);
   return{...a,is_required:Number(a.is_required)===1,requires_evidence:Number(a.requires_evidence)===1,requires_approval:Number(a.requires_approval)===1,evidence_count:ev.length,approval_status:ap[0]?.status||null,effective_complete:effectiveComplete};
  });
  const completedRequired=enriched.filter(a=>a.is_required&&a.effective_complete).length;
  const overdue=enriched.filter(a=>a.is_required&&!a.effective_complete&&a.due_at&&new Date(a.due_at).getTime()<Date.now());
  const evidenceRequired=enriched.filter(a=>a.is_required&&a.requires_evidence);
  const evidenceSatisfied=evidenceRequired.filter(a=>a.evidence_count>0).length;
  const missingResponsible=enriched.filter(a=>a.is_required&&!a.assigned_to&&!a.effective_complete);
  const blocking=stageIncidents.filter(i=>parse(i.metadata_json,{}).blocking===true);
  const highIncidents=stageIncidents.filter(i=>["high","critical"].includes(String(i.severity).toLowerCase()));
  const reasons=[];
  if(overdue.length)reasons.push({type:"overdue",count:overdue.length,label:`${overdue.length} actividades atrasadas`});
  if(blocking.length)reasons.push({type:"blocking_incident",count:blocking.length,label:`${blocking.length} incidencias bloqueantes`});
  else if(highIncidents.length)reasons.push({type:"incident",count:highIncidents.length,label:`${highIncidents.length} incidencias de alta prioridad`});
  if(stageApprovals.length)reasons.push({type:"approval",count:stageApprovals.length,label:`${stageApprovals.length} aprobaciones pendientes`});
  if(missingResponsible.length)reasons.push({type:"responsible",count:missingResponsible.length,label:`${missingResponsible.length} actividades sin responsable`});
  if(evidenceRequired.length>evidenceSatisfied)reasons.push({type:"evidence",count:evidenceRequired.length-evidenceSatisfied,label:`${evidenceRequired.length-evidenceSatisfied} evidencias pendientes`});
  const status=humanStageStatus({legacyStatus:stage.status,totalRequired:required.length,completedRequired,blockingCount:blocking.length,attentionCount:reasons.length,hasActivity:activities.length>0});
  const progress=required.length?Math.round(completedRequired*100/required.length):null;
  totalRequiredProject+=required.length;totalCompletedProject+=completedRequired;
  const current=enriched.find(a=>a.status==="in_progress")||enriched.find(a=>a.status==="available")||enriched.find(a=>a.status==="pending_approval")||null;
  const candidate=[...enriched].filter(a=>!a.effective_complete&&!FINISHED_ACTIVITIES.has(a.status)&&a.status!=="blocked").sort((a,b)=>(PRIORITY[b.priority]||0)-(PRIORITY[a.priority]||0)||((a.due_at?new Date(a.due_at).getTime():Infinity)-(b.due_at?new Date(b.due_at).getTime():Infinity))||a.activity_order-b.activity_order)[0]||null;
  const nextAction=blocking.length?{type:"incident",id:blocking[0].id,title:`Resolver incidencia ${blocking[0].incident_code}`,incident:blocking[0]}:candidate?{type:"activity",id:candidate.id,title:candidate.title,activity:candidate}:null;
  return{
   id:stage.id,stage_id:stage.stage_id,name:stage.name,description:stage.description,order:Number(stage.stage_order),status,source_status:stage.status,
   progress,planned_progress:expectedProgress(enriched),activities_completed:completedRequired,activities_total:required.length,activities_all:enriched.length,overdue_activities:overdue.length,
   evidence_received:evidences.filter(e=>e.execution_stage_id===stage.id).length,evidence_required:evidenceRequired.length,evidence_satisfied:evidenceSatisfied,
   pending_approvals:stageApprovals.length,open_incidents:stageIncidents.length,blocking_incidents:blocking.length,
   responsible:stage.assigned_to?{id:stage.assigned_to,email:stage.responsible_email,role:stage.responsible_role}:null,
   team:participants.filter(p=>p.user_id===stage.assigned_to).map(p=>({id:p.user_id,email:p.email,role:p.participation_role})),
   started_at:stage.started_at,completed_at:stage.completed_at,current_activity:current,next_action:nextAction,attention_reasons:reasons,
  };
 });
 const projectProgress=totalRequiredProject?Math.round(totalCompletedProject*100/totalRequiredProject):0;
 const allReasons=stages.flatMap(s=>s.attention_reasons),blockingCount=stages.reduce((n,s)=>n+s.blocking_incidents,0),criticalOpen=incidents.filter(i=>!CLOSED_INCIDENTS.has(i.status)&&String(i.severity).toLowerCase()==="critical").length;
 let projectStatus="in_order";if(execution.status==="completed")projectStatus="completed";else if(blockingCount||criticalOpen)projectStatus="in_risk";else if(allReasons.length)projectStatus="requires_attention";
 return json({ok:true,data:{
  execution:{id:execution.id,code:execution.execution_code,title:execution.title,status:execution.status,priority:execution.priority,started_at:execution.started_at,due_at:execution.due_at,project:{id:execution.asset_id,name:execution.project_name,location:execution.project_location,qr_slug:execution.qr_slug},process:{id:execution.process_id,name:execution.process_name,version_id:execution.process_version_id}},
  project_progress:projectProgress,project_status:projectStatus,activities_completed:totalCompletedProject,activities_total:totalRequiredProject,stages,
 }});
}
