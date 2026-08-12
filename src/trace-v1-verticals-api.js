import { requireOperationalSession } from "./trace/shared/operational-auth.js";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization, X-Device-Id"};
const BASE="/api/trace/v1/operational";
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}})}
function parse(value,fallback={}){try{return value?JSON.parse(value):fallback}catch{return fallback}}
async function auth(request,env){const a=await requireOperationalSession(request,env);if(!a.ok)return{ok:false,response:json({ok:false,error:a.error,message:a.message},a.status)};return a}
async function executionAccess(db,session,id){return db.prepare(`SELECT e.*,a.asset_code,a.name asset_name,a.asset_type,a.location,p.name process_name,ep.participation_role FROM trace_executions e JOIN trace_execution_participants ep ON ep.tenant_id=e.tenant_id AND ep.execution_id=e.id AND ep.user_id=? AND ep.status='active' JOIN trace_processes p ON p.id=e.process_id LEFT JOIN trace_assets a ON a.id=e.asset_id WHERE e.id=? AND e.tenant_id=? AND (? IS NULL OR e.id=?) LIMIT 1`).bind(session.user_id,id,session.tenant_id,session.execution_id||null,session.execution_id||null).first()}

async function constructionOverview(request,env,executionId){
 const a=await auth(request,env); if(!a.ok)return a.response; const {session,db}=a;
 const e=await executionAccess(db,session,executionId); if(!e)return json({ok:false,error:"execution_not_available",message:"La ejecución no está disponible."},404);
 const stages=await db.prepare(`SELECT es.id,es.stage_order,es.status,es.assigned_to,es.started_at,es.completed_at,s.name,s.stage_type,s.instructions,s.requires_evidence,s.requires_approval,(SELECT COUNT(*) FROM trace_evidences ev WHERE ev.execution_stage_id=es.id) evidence_count,(SELECT COUNT(*) FROM trace_incidents i WHERE i.execution_stage_id=es.id AND i.status NOT IN ('closed','validated')) open_incidents FROM trace_execution_stages es JOIN trace_stages s ON s.id=es.stage_id WHERE es.execution_id=? ORDER BY es.stage_order`).bind(executionId).all();
 const incidents=await db.prepare(`SELECT id,incident_code,title,severity,status,assigned_to,execution_stage_id,reported_at FROM trace_incidents WHERE tenant_id=? AND execution_id=? ORDER BY reported_at DESC LIMIT 100`).bind(session.tenant_id,executionId).all();
 const approvals=await db.prepare(`SELECT id,execution_stage_id,status,assigned_approver_id,requested_at,decided_at FROM trace_approvals WHERE tenant_id=? AND execution_id=? ORDER BY requested_at DESC LIMIT 100`).bind(session.tenant_id,executionId).all();
 const evidence=await db.prepare(`SELECT id,execution_stage_id,evidence_type,public_url,mime_type,file_size,metadata_json,created_at FROM trace_evidences WHERE tenant_id=? AND execution_id=? ORDER BY created_at DESC LIMIT 100`).bind(session.tenant_id,executionId).all();
 return json({ok:true,data:{execution:{id:e.id,code:e.execution_code,title:e.title,status:e.status,priority:e.priority,completionPercentage:Number(e.completion_percentage||0),processName:e.process_name,asset:e.asset_code?{code:e.asset_code,name:e.asset_name,type:e.asset_type,location:e.location}:null},stages:stages.results.map(r=>({id:r.id,order:Number(r.stage_order),name:r.name,type:r.stage_type,status:r.status,assignedTo:r.assigned_to,instructions:r.instructions,requiresEvidence:Boolean(r.requires_evidence),requiresApproval:Boolean(r.requires_approval),evidenceCount:Number(r.evidence_count||0),openIncidents:Number(r.open_incidents||0),startedAt:r.started_at,completedAt:r.completed_at})),incidents:incidents.results,approvals:approvals.results,evidences:evidence.results.map(r=>({...r,metadata:parse(r.metadata_json,{})}))}})
}

async function supervisorDashboard(request,env){
 const a=await auth(request,env); if(!a.ok)return a.response; const {session,db}=a;
 const allowedRole=await db.prepare(`SELECT COUNT(*) n FROM trace_execution_participants WHERE tenant_id=? AND user_id=? AND status='active' AND participation_role IN ('process_owner','department_lead','reviewer','approver')`).bind(session.tenant_id,session.user_id).first();
 if(!["superadmin","enterprise"].includes(session.role)&&Number(allowedRole?.n||0)===0)return json({ok:false,error:"forbidden",message:"Esta sesión no tiene funciones de supervisión."},403);
 const scope=session.execution_id?` AND e.id=?`:``; const binds=session.execution_id?[session.tenant_id,session.user_id,session.execution_id]:[session.tenant_id,session.user_id];
 const executions=await db.prepare(`SELECT DISTINCT e.id,e.execution_code,e.title,e.status,e.priority,e.completion_percentage,e.due_at,p.name process_name,a.name asset_name,(SELECT COUNT(*) FROM trace_incidents i WHERE i.execution_id=e.id AND i.status NOT IN ('closed','validated')) open_incidents,(SELECT COUNT(*) FROM trace_approvals ap WHERE ap.execution_id=e.id AND ap.status='pending') pending_approvals FROM trace_executions e JOIN trace_execution_participants ep ON ep.execution_id=e.id AND ep.tenant_id=e.tenant_id JOIN trace_processes p ON p.id=e.process_id LEFT JOIN trace_assets a ON a.id=e.asset_id WHERE e.tenant_id=? AND ep.user_id=? AND ep.status='active'${scope} ORDER BY CASE e.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,e.updated_at DESC LIMIT 200`).bind(...binds).all();
 const rows=executions.results; const metrics={total:rows.length,inProgress:rows.filter(r=>r.status==='in_progress').length,blocked:rows.filter(r=>['blocked','correction_required'].includes(r.status)).length,pendingApproval:rows.reduce((n,r)=>n+Number(r.pending_approvals||0),0),openIncidents:rows.reduce((n,r)=>n+Number(r.open_incidents||0),0),completed:rows.filter(r=>r.status==='completed').length};
 return json({ok:true,data:{metrics,executions:rows.map(r=>({id:r.id,code:r.execution_code,title:r.title,status:r.status,priority:r.priority,completionPercentage:Number(r.completion_percentage||0),dueAt:r.due_at,processName:r.process_name,assetName:r.asset_name,openIncidents:Number(r.open_incidents||0),pendingApprovals:Number(r.pending_approvals||0)}))}})
}

export async function handleTraceV1VerticalsApi(request,env){
 const url=new URL(request.url); if(!url.pathname.startsWith(BASE))return null; if(request.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});
 const construction=url.pathname.match(/^\/api\/trace\/v1\/operational\/construction\/([^/]+)$/); if(construction&&request.method==='GET')return constructionOverview(request,env,decodeURIComponent(construction[1]));
 if(url.pathname===`${BASE}/supervisor/dashboard`&&request.method==='GET')return supervisorDashboard(request,env);
 return null;
}
