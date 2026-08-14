import jwt from "@tsndr/cloudflare-worker-jwt";
import { getTraceDatabase } from "./trace/shared/database.js";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization"};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});
const safe=v=>String(v??"").trim();
function parse(v,f={}){try{return v?JSON.parse(v):f}catch{return f}}
async function context(request,env){
 const h=request.headers.get("Authorization")||"";if(!h.startsWith("Bearer "))return null;
 const token=h.slice(7).trim();let ok=false;try{ok=await jwt.verify(token,env.JWT_SECRET||"changeme-set-in-cloudflare-dashboard")}catch{return null}if(!ok)return null;
 const p=jwt.decode(token)?.payload||{};if((p.session_type||"standard")!=="standard")return null;
 const userId=p.user_id||p.userId||p.id||p.sub;if(!userId)return null;
 const db=getTraceDatabase(env);const user=await db.prepare(`SELECT id,email,role,enterprise_id,is_active FROM users WHERE id=? LIMIT 1`).bind(userId).first();
 if(!user||Number(user.is_active)!==1)return null;return{db,user,tenantId:user.enterprise_id||user.id};
}
function statusLabel(v){return({open:"Abierta",assigned:"Asignada",in_progress:"En corrección",in_review:"Pendiente de decisión",on_hold:"En espera",resolved:"Resuelta",validated:"Validada",closed:"Cerrada",reopened:"Reabierta"})[v]||v}
function nextAction(row){
 if(["closed","validated"].includes(row.status))return{key:"none",title:"Sin acción pendiente",description:"La incidencia ya fue validada o cerrada."};
 if(row.status==="open"&&!row.assigned_to)return{key:"assign",title:"Asignar responsable",description:"Define quién tendrá a cargo la corrección."};
 if(row.status==="assigned"&&!row.correction_id)return{key:"start_cycle",title:"Iniciar corrección",description:"Abre el ciclo de corrección para el responsable asignado."};
 if(row.correction_status==="pending")return{key:"start_correction",title:"Confirmar recepción",description:"El responsable debe iniciar el trabajo de corrección."};
 if(row.correction_status==="in_progress")return{key:"complete_correction",title:"Completar corrección",description:"Finaliza la intervención y envíala a revisión."};
 if(row.status==="in_review"||row.correction_status==="submitted")return{key:"decide",title:"Validación de supervisión",description:"Revisa la corrección y registra la decisión correspondiente."};
 if(row.status==="reopened"||row.correction_status==="rejected")return{key:"start_cycle",title:"Realizar nueva corrección",description:"Inicia un nuevo ciclo con la observación recibida."};
 return{key:"follow_up",title:"Dar seguimiento",description:"Revisa el estado actual y continúa el proceso de corrección."};
}
async function projectContext(c,projectId){
 const project=await c.db.prepare(`SELECT id,name,status,qr_slug FROM trace_assets WHERE id=? AND tenant_id=? AND asset_type='project' LIMIT 1`).bind(projectId,c.tenantId).first();if(!project)return null;
 const pp=await c.db.prepare(`SELECT project_role FROM trace_project_participants WHERE tenant_id=? AND project_id=? AND user_id=? AND status='active' LIMIT 1`).bind(c.tenantId,projectId,c.user.id).first();
 return{project,projectRole:pp?.project_role||null,ownOnly:pp?.project_role==="member"};
}
function baseSelect(){return `
 SELECT i.id,i.incident_code,i.title,i.description,i.category,i.severity,i.status,i.reported_by,i.assigned_to,i.reported_at,i.resolved_at,i.validated_at,i.closed_at,i.due_at,i.metadata_json,
        i.execution_id,i.execution_stage_id,i.execution_activity_id,e.execution_code,e.title execution_title,
        s.id stage_id,s.name stage_name,ea.title activity_title,u.email responsible_email,
        cc.id correction_id,cc.cycle_number correction_cycle_number,cc.status correction_status,cc.request_notes correction_request_notes,cc.response_notes correction_response_notes,cc.started_at correction_started_at,cc.submitted_at correction_submitted_at,
        ap.id pending_approval_id,ap.assigned_approver_id,ap.requested_at approval_requested_at,
        (SELECT COUNT(*) FROM trace_evidences te WHERE te.tenant_id=i.tenant_id AND te.execution_id=i.execution_id AND (json_extract(te.metadata_json,'$.incidentId')=i.id OR EXISTS(SELECT 1 FROM trace_events iev WHERE iev.id=te.event_id AND json_extract(iev.payload_json,'$.incidentId')=i.id))) evidence_count,
        (SELECT GROUP_CONCAT(te.public_url,'|') FROM trace_evidences te WHERE te.tenant_id=i.tenant_id AND te.execution_id=i.execution_id AND te.public_url IS NOT NULL AND (json_extract(te.metadata_json,'$.incidentId')=i.id OR EXISTS(SELECT 1 FROM trace_events iev WHERE iev.id=te.event_id AND json_extract(iev.payload_json,'$.incidentId')=i.id)) LIMIT 3) evidence_urls
 FROM trace_incidents i
 JOIN trace_executions e ON e.id=i.execution_id AND e.tenant_id=i.tenant_id
 LEFT JOIN trace_execution_stages es ON es.id=i.execution_stage_id
 LEFT JOIN trace_stages s ON s.id=es.stage_id
 LEFT JOIN trace_execution_activities ea ON ea.id=i.execution_activity_id
 LEFT JOIN users u ON u.id=i.assigned_to
 LEFT JOIN trace_correction_cycles cc ON cc.id=(SELECT c2.id FROM trace_correction_cycles c2 WHERE c2.incident_id=i.id ORDER BY c2.cycle_number DESC LIMIT 1)
 LEFT JOIN trace_approvals ap ON ap.id=(SELECT a2.id FROM trace_approvals a2 WHERE a2.tenant_id=i.tenant_id AND a2.execution_id=i.execution_id AND a2.status='pending' AND json_extract(a2.metadata_json,'$.incidentId')=i.id ORDER BY a2.requested_at DESC LIMIT 1)`}
function mapRow(r){const meta=parse(r.metadata_json,{});return{...r,blocking:meta.blocking===true,evidenceUrls:String(r.evidence_urls||"").split("|").filter(Boolean),evidence_count:Number(r.evidence_count||0),correction_cycle_number:Number(r.correction_cycle_number||0),status_label:statusLabel(r.status),next_action:nextAction(r)}}

export async function handleTraceV1ProjectIncidentsApi(request,env){
 const url=new URL(request.url);const m=url.pathname.match(/^\/api\/trace\/v1\/admin\/projects\/([^/]+)\/incidents(?:\/([^/]+))?$/);if(!m)return null;
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
 if(request.method!=="GET")return json({ok:false,error:"method_not_allowed"},405);
 const c=await context(request,env);if(!c)return json({ok:false,error:"unauthorized"},401);
 const projectId=decodeURIComponent(m[1]),incidentId=m[2]?decodeURIComponent(m[2]):null,pc=await projectContext(c,projectId);if(!pc)return json({ok:false,error:"project_not_found"},404);
 const own=pc.ownOnly?` AND (i.reported_by=? OR i.assigned_to=? OR e.assigned_to=?)`:"";
 const ownBinds=pc.ownOnly?[c.user.id,c.user.id,c.user.id]:[];
 if(incidentId){
  const r=await c.db.prepare(`${baseSelect()} WHERE i.tenant_id=? AND e.asset_id=? AND i.id=?${own} LIMIT 1`).bind(c.tenantId,projectId,incidentId,...ownBinds).first();if(!r)return json({ok:false,error:"incident_not_found"},404);
  const history=await c.db.prepare(`SELECT ev.id,ev.event_type,ev.description,ev.event_source,ev.actor_role,ev.occurred_at,u.email actor_email,ev.payload_json FROM trace_events ev LEFT JOIN users u ON u.id=ev.actor_user_id WHERE ev.tenant_id=? AND ev.execution_id=? AND (json_extract(ev.payload_json,'$.incidentId')=? OR (ev.event_type LIKE 'incident.%' AND json_extract(ev.payload_json,'$.incidentId')=?)) ORDER BY ev.occurred_at DESC,ev.id DESC LIMIT 100`).bind(c.tenantId,r.execution_id,r.id,r.id).all();
  return json({ok:true,data:{project:pc.project,viewer:{projectRole:pc.projectRole,scope:pc.ownOnly?"own":"project"},incident:mapRow(r),history:(history.results||[]).map(x=>({...x,payload:parse(x.payload_json,{})}))}});
 }
 const stage=safe(url.searchParams.get("stage")),sort=safe(url.searchParams.get("sort"))||"recent";const binds=[c.tenantId,projectId,...ownBinds];let where=` WHERE i.tenant_id=? AND e.asset_id=?${own}`;if(stage){where+=` AND s.id=?`;binds.push(stage)}
 const order=sort==="priority"?`CASE i.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,i.reported_at DESC`:`i.reported_at DESC`;
 const rows=await c.db.prepare(`${baseSelect()}${where} ORDER BY ${order} LIMIT 250`).bind(...binds).all();const items=(rows.results||[]).map(mapRow);
 const open=items.filter(x=>!["resolved","validated","closed"].includes(x.status));
 const metrics={open:open.length,critical:open.filter(x=>["critical","high"].includes(x.severity)).length,inCorrection:open.filter(x=>x.status==="in_progress"||["pending","in_progress"].includes(x.correction_status)).length,pendingDecision:open.filter(x=>x.status==="in_review"||x.correction_status==="submitted"||Boolean(x.pending_approval_id)).length};
 const stages=await c.db.prepare(`SELECT DISTINCT s.id,s.name,s.stage_order FROM trace_incidents i JOIN trace_executions e ON e.id=i.execution_id LEFT JOIN trace_execution_stages es ON es.id=i.execution_stage_id LEFT JOIN trace_stages s ON s.id=es.stage_id WHERE i.tenant_id=? AND e.asset_id=? AND s.id IS NOT NULL ORDER BY s.stage_order`).bind(c.tenantId,projectId).all();
 return json({ok:true,data:{project:pc.project,viewer:{projectRole:pc.projectRole,scope:pc.ownOnly?"own":"project"},metrics,items,stages:stages.results||[]}});
}
