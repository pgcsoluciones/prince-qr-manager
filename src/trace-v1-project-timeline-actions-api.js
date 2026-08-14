import jwt from "@tsndr/cloudflare-worker-jwt";
import { getTraceDatabase } from "./trace/shared/database.js";
import { stageActivityAggregate } from "./trace/shared/activity-context.js";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization"};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});
const uuid=()=>crypto.randomUUID();
const text=(v,n=4000)=>{const s=String(v??"").trim();return s?s.slice(0,n):null};

async function context(request,env){
 const h=request.headers.get("Authorization")||"";if(!h.startsWith("Bearer "))return null;
 const token=h.slice(7).trim();let ok=false;try{ok=await jwt.verify(token,env.JWT_SECRET||"changeme-set-in-cloudflare-dashboard")}catch{return null}if(!ok)return null;
 const p=jwt.decode(token)?.payload||{};if((p.session_type||"standard")!=="standard")return null;
 const userId=p.user_id||p.userId||p.id||p.sub;if(!userId)return null;
 const db=getTraceDatabase(env);const user=await db.prepare(`SELECT id,role,enterprise_id,is_active FROM users WHERE id=? LIMIT 1`).bind(userId).first();
 if(!user||Number(user.is_active)!==1)return null;return{db,user,tenantId:user.enterprise_id||user.id};
}
async function event(db,c,a,type,description,payload={}){
 await db.prepare(`INSERT INTO trace_events (id,tenant_id,execution_id,execution_stage_id,execution_activity_id,asset_id,event_type,event_source,actor_user_id,actor_role,description,payload_json,occurred_at,received_at) VALUES (?,?,?,?,?,?,?,'admin',?,?,?,?,datetime('now'),datetime('now'))`).bind(uuid(),c.tenantId,a.execution_id,a.execution_stage_id||null,a.execution_activity_id||null,a.asset_id||null,type,c.user.id,c.user.role,description,JSON.stringify(payload)).run();
}
async function register(request,env){
 const c=await context(request,env);if(!c)return json({ok:false,error:"unauthorized"},401);
 let body={};try{body=await request.json()}catch{return json({ok:false,error:"invalid_json"},400)}
 const executionId=text(body.executionId,100),executionStageId=text(body.executionStageId,100),executionActivityId=text(body.executionActivityId,100),type=text(body.type,80)||"activity.recorded",description=text(body.description,2000);
 if(!executionId||!description)return json({ok:false,error:"missing_fields",message:"Selecciona el trabajo y describe lo ocurrido."},422);
 const execution=await c.db.prepare(`SELECT id,asset_id FROM trace_executions WHERE id=? AND tenant_id=? LIMIT 1`).bind(executionId,c.tenantId).first();if(!execution)return json({ok:false,error:"execution_not_found"},404);
 if(executionStageId){const stage=await c.db.prepare(`SELECT id FROM trace_execution_stages WHERE id=? AND execution_id=? LIMIT 1`).bind(executionStageId,executionId).first();if(!stage)return json({ok:false,error:"invalid_stage"},422)}
 if(executionActivityId){const activity=await c.db.prepare(`SELECT id,execution_stage_id FROM trace_execution_activities WHERE id=? AND tenant_id=? AND execution_id=? LIMIT 1`).bind(executionActivityId,c.tenantId,executionId).first();if(!activity||executionStageId&&activity.execution_stage_id!==executionStageId)return json({ok:false,error:"invalid_execution_activity"},422)}
 const id=uuid();await c.db.batch([
  c.db.prepare(`INSERT INTO trace_events (id,tenant_id,execution_id,execution_stage_id,execution_activity_id,asset_id,event_type,event_source,actor_user_id,actor_role,description,payload_json,occurred_at,received_at) VALUES (?,?,?,?,?,?,?,'admin',?,?,?,?,datetime('now'),datetime('now'))`).bind(id,c.tenantId,executionId,executionStageId||null,executionActivityId||null,execution.asset_id||null,type,c.user.id,c.user.role,description,JSON.stringify(body.data||{})),
  c.db.prepare(`UPDATE trace_executions SET updated_at=datetime('now') WHERE id=? AND tenant_id=?`).bind(executionId,c.tenantId)
 ]);
 return json({ok:true,data:{id,executionId,executionStageId:executionStageId||null,executionActivityId:executionActivityId||null,type,description}},201);
}
async function decide(request,env,projectId,approvalId,decision){
 const c=await context(request,env);if(!c)return json({ok:false,error:"unauthorized"},401);
 if(!["approve","correction","reject"].includes(decision))return json({ok:false,error:"invalid_decision"},422);
 let body={};try{body=await request.json()}catch{}const notes=text(body.notes,4000);
 const approval=await c.db.prepare(`SELECT ap.*,e.asset_id,e.status execution_status,es.stage_order,es.status stage_status,s.name stage_name,ea.title activity_title FROM trace_approvals ap JOIN trace_executions e ON e.id=ap.execution_id AND e.tenant_id=ap.tenant_id JOIN trace_execution_stages es ON es.id=ap.execution_stage_id JOIN trace_stages s ON s.id=es.stage_id LEFT JOIN trace_execution_activities ea ON ea.id=ap.execution_activity_id WHERE ap.id=? AND ap.tenant_id=? AND e.asset_id=? AND ap.status='pending' LIMIT 1`).bind(approvalId,c.tenantId,projectId).first();
 if(!approval)return json({ok:false,error:"approval_not_found"},404);
 const participant=await c.db.prepare(`SELECT project_role FROM trace_project_participants WHERE tenant_id=? AND project_id=? AND user_id=? AND status='active' LIMIT 1`).bind(c.tenantId,projectId,c.user.id).first();
 const role=participant?.project_role||"",allowed=["owner","manager","supervisor"].includes(role)||approval.assigned_approver_id===c.user.id;if(!allowed)return json({ok:false,error:"forbidden",message:"No tienes permiso para decidir esta aprobación."},403);
 const status=decision==="approve"?"approved":decision==="reject"?"rejected":"correction_required";await c.db.prepare(`UPDATE trace_approvals SET status=?,decision_notes=?,decided_at=datetime('now'),decided_by=? WHERE id=? AND status='pending'`).bind(status,notes,c.user.id,approvalId).run();
 if(approval.execution_activity_id){
  if(decision==="approve"){
   await c.db.prepare(`UPDATE trace_execution_activities SET status='completed',completed_at=COALESCE(completed_at,datetime('now')),updated_at=datetime('now') WHERE id=? AND tenant_id=?`).bind(approval.execution_activity_id,c.tenantId).run();
   const agg=await stageActivityAggregate(c.db,{tenantId:c.tenantId,executionId:approval.execution_id,executionStageId:approval.execution_stage_id});await c.db.prepare(`UPDATE trace_execution_stages SET status=?,completed_at=CASE WHEN ?='completed' THEN COALESCE(completed_at,datetime('now')) ELSE completed_at END,updated_at=datetime('now') WHERE id=?`).bind(agg.derivedStatus,agg.derivedStatus,approval.execution_stage_id).run();
   await event(c.db,c,approval,"activity.approved",`Actividad aprobada: ${approval.activity_title||approval.stage_name}`,{approvalId,notes,stageProgress:agg.progress});return json({ok:true,data:{approvalId,status,activityStatus:"completed",stageStatus:agg.derivedStatus,stageProgress:agg.progress}});
  }
  await c.db.batch([c.db.prepare(`UPDATE trace_execution_activities SET status='correction_required',updated_at=datetime('now') WHERE id=? AND tenant_id=?`).bind(approval.execution_activity_id,c.tenantId),c.db.prepare(`UPDATE trace_execution_stages SET status='correction_required',updated_at=datetime('now') WHERE id=?`).bind(approval.execution_stage_id),c.db.prepare(`UPDATE trace_executions SET status='correction_required',updated_at=datetime('now') WHERE id=? AND tenant_id=?`).bind(approval.execution_id,c.tenantId)]);
  await event(c.db,c,approval,decision==="reject"?"activity.rejected":"activity.correction_requested",decision==="reject"?`Actividad rechazada: ${approval.activity_title||approval.stage_name}`:`Corrección solicitada: ${approval.activity_title||approval.stage_name}`,{approvalId,notes});return json({ok:true,data:{approvalId,status,activityStatus:"correction_required",stageStatus:"correction_required"}});
 }
 if(decision==="approve"){
  const next=await c.db.prepare(`SELECT id,stage_id FROM trace_execution_stages WHERE execution_id=? AND stage_order>? AND status='pending' ORDER BY stage_order LIMIT 1`).bind(approval.execution_id,approval.stage_order).first();const statements=[c.db.prepare(`UPDATE trace_execution_stages SET status='approved',completed_at=COALESCE(completed_at,datetime('now')),updated_at=datetime('now') WHERE id=?`).bind(approval.execution_stage_id)];
  if(next){statements.push(c.db.prepare(`UPDATE trace_execution_stages SET status='available',updated_at=datetime('now') WHERE id=?`).bind(next.id),c.db.prepare(`UPDATE trace_executions SET status='in_progress',current_stage_id=?,updated_at=datetime('now') WHERE id=? AND tenant_id=?`).bind(next.stage_id,approval.execution_id,c.tenantId))}else statements.push(c.db.prepare(`UPDATE trace_executions SET status='completed',current_stage_id=NULL,completion_percentage=100,completed_at=COALESCE(completed_at,datetime('now')),updated_at=datetime('now') WHERE id=? AND tenant_id=?`).bind(approval.execution_id,c.tenantId));
  await c.db.batch(statements);await event(c.db,c,approval,"approval.approved",`Etapa aprobada: ${approval.stage_name}`,{approvalId,notes});return json({ok:true,data:{approvalId,status,nextStageId:next?.id||null,executionCompleted:!next}});
 }
 const stageStatus=decision==="reject"?"rejected":"correction_required",executionStatus=decision==="reject"?"blocked":"correction_required";await c.db.batch([c.db.prepare(`UPDATE trace_execution_stages SET status=?,updated_at=datetime('now') WHERE id=?`).bind(stageStatus,approval.execution_stage_id),c.db.prepare(`UPDATE trace_executions SET status=?,updated_at=datetime('now') WHERE id=? AND tenant_id=?`).bind(executionStatus,approval.execution_id,c.tenantId)]);
 await event(c.db,c,approval,decision==="reject"?"approval.rejected":"approval.correction_requested",decision==="reject"?`Etapa rechazada: ${approval.stage_name}`:`Corrección solicitada: ${approval.stage_name}`,{approvalId,notes});return json({ok:true,data:{approvalId,status,stageStatus,executionStatus}});
}

export async function handleTraceV1ProjectTimelineActionsApi(request,env){
 const url=new URL(request.url);if(request.method==="OPTIONS"&&(url.pathname.startsWith("/api/trace/v1/admin/activities")||url.pathname.includes("/approvals/")))return new Response(null,{status:204,headers:CORS});
 if(url.pathname==="/api/trace/v1/admin/activities"&&request.method==="POST")return register(request,env);
 const m=url.pathname.match(/^\/api\/trace\/v1\/admin\/projects\/([^/]+)\/approvals\/([^/]+)\/(approve|correction|reject)$/);if(!m)return null;if(request.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
 return decide(request,env,decodeURIComponent(m[1]),decodeURIComponent(m[2]),m[3]);
}
