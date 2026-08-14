import jwt from "@tsndr/cloudflare-worker-jwt";
import { getTraceDatabase } from "./trace/shared/database.js";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization"};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});
const text=(v,n=200)=>{const s=String(v??"").trim();return s?s.slice(0,n):null};
const parse=(v,f={})=>{try{return v?JSON.parse(v):f}catch{return f}};

async function context(request,env){
 const h=request.headers.get("Authorization")||"";if(!h.startsWith("Bearer "))return null;
 const token=h.slice(7).trim();let ok=false;try{ok=await jwt.verify(token,env.JWT_SECRET||"changeme-set-in-cloudflare-dashboard")}catch{return null}if(!ok)return null;
 const p=jwt.decode(token)?.payload||{};if((p.session_type||"standard")!=="standard")return null;
 const userId=p.user_id||p.userId||p.id||p.sub;if(!userId)return null;
 const db=getTraceDatabase(env);const user=await db.prepare(`SELECT id,email,role,enterprise_id,is_active FROM users WHERE id=? LIMIT 1`).bind(userId).first();
 if(!user||Number(user.is_active)!==1)return null;return{db,user,tenantId:user.enterprise_id||user.id};
}
async function projectContext(c,projectId){
 const project=await c.db.prepare(`SELECT id,name,status FROM trace_assets WHERE id=? AND tenant_id=? AND asset_type='project' LIMIT 1`).bind(projectId,c.tenantId).first();if(!project)return null;
 const part=await c.db.prepare(`SELECT project_role FROM trace_project_participants WHERE tenant_id=? AND project_id=? AND user_id=? AND status='active' LIMIT 1`).bind(c.tenantId,projectId,c.user.id).first();
 return{project,projectRole:part?.project_role||null};
}
const canDecide=(c,pc,ap)=>['superadmin','enterprise','admin','manager','supervisor'].includes(c.user.role)||['owner','manager','supervisor'].includes(pc.projectRole||'')||ap?.assigned_approver_id===c.user.id;
function baseSelect(){return `
 SELECT ap.id,ap.tenant_id,ap.execution_id,ap.execution_stage_id,ap.execution_activity_id,ap.requested_by,ap.assigned_approver_id,ap.status,ap.decision_notes,ap.requested_at,ap.decided_at,ap.decided_by,ap.metadata_json,
        e.execution_code,e.title execution_title,e.priority execution_priority,e.asset_id,
        s.id stage_id,s.name stage_name,s.stage_order,
        ea.title activity_title,ea.status activity_status,
        rq.email requester_email,aa.email approver_email,du.email decided_by_email,
        i.id incident_id,i.incident_code,i.title incident_title,i.severity incident_severity,i.status incident_status,
        (SELECT COUNT(*) FROM trace_evidences ev WHERE ev.tenant_id=ap.tenant_id AND ev.execution_id=ap.execution_id AND (ev.execution_activity_id=ap.execution_activity_id OR (ap.execution_activity_id IS NULL AND ev.execution_stage_id=ap.execution_stage_id))) evidence_count,
        EXISTS(SELECT 1 FROM trace_events tev WHERE tev.tenant_id=ap.tenant_id AND tev.execution_id=ap.execution_id AND tev.event_type IN ('incident.observed','approval.correction_requested','activity.correction_requested') AND (json_extract(tev.payload_json,'$.incidentId')=json_extract(ap.metadata_json,'$.incidentId') OR json_extract(tev.payload_json,'$.approvalId')=ap.id)) was_observed
 FROM trace_approvals ap
 JOIN trace_executions e ON e.id=ap.execution_id AND e.tenant_id=ap.tenant_id
 JOIN trace_execution_stages es ON es.id=ap.execution_stage_id
 JOIN trace_stages s ON s.id=es.stage_id
 LEFT JOIN trace_execution_activities ea ON ea.id=ap.execution_activity_id
 LEFT JOIN users rq ON rq.id=ap.requested_by
 LEFT JOIN users aa ON aa.id=ap.assigned_approver_id
 LEFT JOIN users du ON du.id=ap.decided_by
 LEFT JOIN trace_incidents i ON i.id=json_extract(ap.metadata_json,'$.incidentId')`}
function mapRow(r,projectId){const meta=parse(r.metadata_json,{}),severity=r.incident_severity||r.execution_priority||'normal';return{
 id:r.id,code:`APP-${String(r.id).replace(/-/g,'').slice(0,4).toUpperCase()}`,status:r.status,requestedAt:r.requested_at,decidedAt:r.decided_at,decisionNotes:r.decision_notes,
 executionId:r.execution_id,executionCode:r.execution_code,executionTitle:r.execution_title,executionStageId:r.execution_stage_id,stageId:r.stage_id,stageName:r.stage_name,stageOrder:Number(r.stage_order||0),executionActivityId:r.execution_activity_id,activityTitle:r.activity_title,activityStatus:r.activity_status,
 priority:severity,critical:r.incident_severity==='critical'||r.execution_priority==='urgent',wasObserved:Boolean(r.was_observed),opinionStatus:meta.opinionStatus||null,
 requestedBy:r.requested_by,requesterEmail:r.requester_email,assignedApproverId:r.assigned_approver_id,approverEmail:r.approver_email,decidedBy:r.decided_by,decidedByEmail:r.decided_by_email,
 incident:r.incident_id?{id:r.incident_id,code:r.incident_code,title:r.incident_title,severity:r.incident_severity,status:r.incident_status}:null,
 evidenceCount:Number(r.evidence_count||0),metadata:meta,detailUrl:`/api/trace/v1/admin/projects/${encodeURIComponent(projectId)}/approvals/${encodeURIComponent(r.id)}`
}}
async function list(request,c,projectId,pc){
 const u=new URL(request.url),status=text(u.searchParams.get('status'),40)||'pending',stage=text(u.searchParams.get('stage'),100),priority=text(u.searchParams.get('priority'),40),type=text(u.searchParams.get('type'),40),order=text(u.searchParams.get('order'),40)||'urgent';
 let where=` WHERE ap.tenant_id=? AND e.asset_id=?`,binds=[c.tenantId,projectId];if(status!=='all'){where+=` AND ap.status=?`;binds.push(status)}if(stage){where+=` AND s.id=?`;binds.push(stage)}if(priority){where+=` AND (i.severity=? OR e.priority=?)`;binds.push(priority,priority)}if(type==='activity')where+=` AND ap.execution_activity_id IS NOT NULL`;if(type==='stage')where+=` AND ap.execution_activity_id IS NULL`;
 const ordering=order==='oldest'?`ap.requested_at ASC`:`CASE WHEN i.severity='critical' OR e.priority='urgent' THEN 0 WHEN i.severity='high' OR e.priority='high' THEN 1 WHEN EXISTS(SELECT 1 FROM trace_events tx WHERE tx.tenant_id=ap.tenant_id AND tx.execution_id=ap.execution_id AND tx.event_type IN ('incident.observed','approval.correction_requested','activity.correction_requested') AND (json_extract(tx.payload_json,'$.incidentId')=json_extract(ap.metadata_json,'$.incidentId') OR json_extract(tx.payload_json,'$.approvalId')=ap.id)) THEN 2 ELSE 3 END, ap.requested_at ASC`;
 const rows=await c.db.prepare(`${baseSelect()}${where} ORDER BY ${ordering} LIMIT 100`).bind(...binds).all();const items=(rows.results||[]).map(r=>mapRow(r,projectId));
 const metrics=await c.db.prepare(`SELECT
   SUM(CASE WHEN ap.status='pending' THEN 1 ELSE 0 END) pending,
   SUM(CASE WHEN ap.status='pending' AND (i.severity='critical' OR e.priority='urgent') THEN 1 ELSE 0 END) critical,
   SUM(CASE WHEN ap.status='pending' AND EXISTS(SELECT 1 FROM trace_events tx WHERE tx.tenant_id=ap.tenant_id AND tx.execution_id=ap.execution_id AND tx.event_type IN ('incident.observed','approval.correction_requested','activity.correction_requested') AND (json_extract(tx.payload_json,'$.incidentId')=json_extract(ap.metadata_json,'$.incidentId') OR json_extract(tx.payload_json,'$.approvalId')=ap.id)) THEN 1 ELSE 0 END) observed,
   SUM(CASE WHEN ap.status='pending' AND json_extract(ap.metadata_json,'$.opinionStatus')='requested' THEN 1 ELSE 0 END) opinion
   FROM trace_approvals ap JOIN trace_executions e ON e.id=ap.execution_id AND e.tenant_id=ap.tenant_id LEFT JOIN trace_incidents i ON i.id=json_extract(ap.metadata_json,'$.incidentId') WHERE ap.tenant_id=? AND e.asset_id=?`).bind(c.tenantId,projectId).first();
 const stages=await c.db.prepare(`SELECT DISTINCT s.id,s.name,s.stage_order FROM trace_approvals ap JOIN trace_executions e ON e.id=ap.execution_id JOIN trace_execution_stages es ON es.id=ap.execution_stage_id JOIN trace_stages s ON s.id=es.stage_id WHERE ap.tenant_id=? AND e.asset_id=? ORDER BY s.stage_order`).bind(c.tenantId,projectId).all();
 return json({ok:true,data:{project:pc.project,viewer:{projectRole:pc.projectRole},summary:{pending:Number(metrics?.pending||0),critical:Number(metrics?.critical||0),observed:Number(metrics?.observed||0),opinion:Number(metrics?.opinion||0)},items,stages:stages.results||[]}})
}
async function detail(c,projectId,pc,approvalId){
 const r=await c.db.prepare(`${baseSelect()} WHERE ap.id=? AND ap.tenant_id=? AND e.asset_id=? LIMIT 1`).bind(approvalId,c.tenantId,projectId).first();if(!r)return json({ok:false,error:'approval_not_found'},404);const approval=mapRow(r,projectId),meta=approval.metadata||{};
 const ev=await c.db.prepare(`SELECT ev.id,ev.original_filename,ev.mime_type,ev.validation_status,ev.created_at,ev.metadata_json,ev.thumbnail_r2_key FROM trace_evidences ev WHERE ev.tenant_id=? AND ev.execution_id=? AND (ev.execution_activity_id=? OR (? IS NULL AND ev.execution_stage_id=?)) ORDER BY ev.created_at DESC LIMIT 20`).bind(c.tenantId,r.execution_id,r.execution_activity_id,r.execution_activity_id,r.execution_stage_id).all();
 const mapped=(ev.results||[]).map(x=>{const m=parse(x.metadata_json,{});return{id:x.id,name:x.original_filename,type:x.mime_type,status:x.validation_status,createdAt:x.created_at,metadata:m,thumbnailUrl:x.thumbnail_r2_key?`/api/trace/v1/admin/projects/${encodeURIComponent(projectId)}/evidence/${encodeURIComponent(x.id)}/thumbnail`:null,fileUrl:`/api/trace/v1/admin/projects/${encodeURIComponent(projectId)}/evidence/${encodeURIComponent(x.id)}/file`}});
 const cycleId=meta.correctionCycleId||null,correctionEvidence=cycleId?mapped.filter(x=>x.metadata?.correctionCycleId===cycleId):[],initialEvidence=cycleId?mapped.filter(x=>x.metadata?.correctionCycleId!==cycleId):mapped;
 const history=await c.db.prepare(`SELECT id,event_type,description,actor_user_id,actor_role,payload_json,occurred_at FROM trace_events WHERE tenant_id=? AND execution_id=? AND (json_extract(payload_json,'$.approvalId')=? OR (? IS NOT NULL AND json_extract(payload_json,'$.incidentId')=?) OR (? IS NOT NULL AND execution_activity_id=?)) ORDER BY occurred_at DESC,id DESC LIMIT 12`).bind(c.tenantId,r.execution_id,approvalId,approval.incident?.id||null,approval.incident?.id||null,r.execution_activity_id,r.execution_activity_id).all();
 const allowed=canDecide(c,pc,r)&&r.status==='pending';return json({ok:true,data:{approval,viewer:{projectRole:pc.projectRole,canDecide:allowed},correctionEvidence,initialEvidence,recentHistory:(history.results||[]).map(h=>({...h,payload:parse(h.payload_json,{})})),availableActions:allowed?['approve','observe','reject']:[]}})
}

export async function handleTraceV1ProjectApprovalsApi(request,env){
 const u=new URL(request.url),m=u.pathname.match(/^\/api\/trace\/v1\/admin\/projects\/([^/]+)\/approvals(?:\/([^/]+))?$/);if(!m)return null;if(request.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});if(request.method!=='GET')return null;
 const c=await context(request,env);if(!c)return json({ok:false,error:'unauthorized'},401);const projectId=decodeURIComponent(m[1]),pc=await projectContext(c,projectId);if(!pc)return json({ok:false,error:'project_not_found'},404);return m[2]?detail(c,projectId,pc,decodeURIComponent(m[2])):list(request,c,projectId,pc)
}
