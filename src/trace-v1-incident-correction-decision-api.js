import { requireOperationalSession } from "./trace/shared/operational-auth.js";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization, X-Device-Id"};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});
const uuid=()=>crypto.randomUUID();
const text=(v,n=4000)=>{const s=String(v??"").trim();return s?s.slice(0,n):null};
function parse(v){try{return JSON.parse(v||"{}")}catch{return{}}}
async function event(db,session,row,type,description,payload){await db.prepare(`INSERT INTO trace_events (id,tenant_id,execution_id,execution_stage_id,execution_activity_id,asset_id,event_type,event_source,actor_user_id,actor_role,description,payload_json,occurred_at,received_at) VALUES (?,?,?,?,?,?,?,'supervisor',?,?,?,?,datetime('now'),datetime('now'))`).bind(uuid(),session.tenant_id,row.execution_id,row.execution_stage_id,row.execution_activity_id||null,row.asset_id||null,type,session.user_id,session.role,description,JSON.stringify(payload||{})).run()}

export async function handleTraceV1IncidentCorrectionDecisionApi(request,env){
 const url=new URL(request.url),m=url.pathname.match(/^\/api\/trace\/v1\/operational\/approvals\/([^/]+)\/(approve|observe|reject)$/);if(!m)return null;if(request.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});if(request.method!=="POST")return null;
 const a=await requireOperationalSession(request,env);if(!a.ok)return json({ok:false,error:a.error,message:a.message},a.status);const{session,db}=a,approvalId=decodeURIComponent(m[1]),decision=m[2];
 const ap=await db.prepare(`SELECT ap.*,e.asset_id,i.title incident_title FROM trace_approvals ap JOIN trace_executions e ON e.id=ap.execution_id AND e.tenant_id=ap.tenant_id LEFT JOIN trace_incidents i ON i.id=json_extract(ap.metadata_json,'$.incidentId') WHERE ap.id=? AND ap.tenant_id=? AND ap.assigned_approver_id=? AND ap.status='pending' LIMIT 1`).bind(approvalId,session.tenant_id,session.user_id).first();if(!ap)return null;
 const meta=parse(ap.metadata_json);if(!meta.incidentId||!meta.correctionCycleId)return null;
 let b={};try{b=await request.json()}catch{}const notes=text(b.notes,4000),approvalStatus=decision==="approve"?"approved":decision==="observe"?"correction_required":"rejected";
 await db.prepare(`UPDATE trace_approvals SET status=?,decision_notes=?,decided_at=datetime('now'),decided_by=? WHERE id=? AND status='pending'`).bind(approvalStatus,notes,session.user_id,approvalId).run();
 if(decision==="approve"){
  await db.batch([db.prepare(`UPDATE trace_correction_cycles SET status='accepted',reviewed_at=datetime('now'),reviewed_by=?,updated_at=datetime('now') WHERE id=? AND incident_id=?`).bind(session.user_id,meta.correctionCycleId,meta.incidentId),db.prepare(`UPDATE trace_incidents SET status='validated',resolved_at=COALESCE(resolved_at,datetime('now')),validated_at=datetime('now'),resolution_notes=COALESCE(?,resolution_notes) WHERE id=? AND tenant_id=?`).bind(notes,meta.incidentId,session.tenant_id)]);
  await event(db,session,ap,"incident.validated",`Incidencia validada: ${ap.incident_title||meta.incidentId}`,{incidentId:meta.incidentId,correctionCycleId:meta.correctionCycleId,approvalId,notes});return json({ok:true,data:{approvalId,status:"approved",incidentId:meta.incidentId,incidentStatus:"validated"}})
 }
 await db.batch([db.prepare(`UPDATE trace_correction_cycles SET status='rejected',reviewed_at=datetime('now'),reviewed_by=?,updated_at=datetime('now') WHERE id=? AND incident_id=?`).bind(session.user_id,meta.correctionCycleId,meta.incidentId),db.prepare(`UPDATE trace_incidents SET status=? WHERE id=? AND tenant_id=?`).bind(decision==="observe"?"reopened":"on_hold",meta.incidentId,session.tenant_id)]);
 await event(db,session,ap,decision==="observe"?"incident.observed":"incident.rejected",decision==="observe"?`Corrección observada: ${ap.incident_title||meta.incidentId}`:`Corrección rechazada: ${ap.incident_title||meta.incidentId}`,{incidentId:meta.incidentId,correctionCycleId:meta.correctionCycleId,approvalId,notes});return json({ok:true,data:{approvalId,status:approvalStatus,incidentId:meta.incidentId,incidentStatus:decision==="observe"?"reopened":"on_hold"}})
}
