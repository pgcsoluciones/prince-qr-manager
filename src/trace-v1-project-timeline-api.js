import jwt from "@tsndr/cloudflare-worker-jwt";
import { getTraceDatabase } from "./trace/shared/database.js";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization"};
const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store",...extra}});
const safe=v=>String(v||"").trim();
const enc=o=>btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
function dec(v){try{const x=v.replace(/-/g,"+").replace(/_/g,"/");return JSON.parse(decodeURIComponent(escape(atob(x+"=".repeat((4-x.length%4)%4)))))}catch{return null}}

async function context(request,env){
 const h=request.headers.get("Authorization")||"";if(!h.startsWith("Bearer "))return null;
 const token=h.slice(7).trim();let ok=false;try{ok=await jwt.verify(token,env.JWT_SECRET||"changeme-set-in-cloudflare-dashboard")}catch{return null}if(!ok)return null;
 const p=jwt.decode(token)?.payload||{};if((p.session_type||"standard")!=="standard")return null;
 const userId=p.user_id||p.userId||p.id||p.sub;if(!userId)return null;
 const db=getTraceDatabase(env);const user=await db.prepare(`SELECT id,role,enterprise_id,is_active FROM users WHERE id=? LIMIT 1`).bind(userId).first();
 if(!user||Number(user.is_active)!==1)return null;return{db,user,tenantId:user.enterprise_id||user.id};
}

function typeClause(types,binds){
 if(!types.length)return"";const parts=[];
 for(const t of types){
  if(t==="progress")parts.push(`(ev.event_type LIKE 'progress.%' OR ev.event_type LIKE 'activity.%' OR ev.event_type LIKE 'stage.%')`);
  else if(t==="incident")parts.push(`ev.event_type LIKE 'incident.%'`);
  else if(t==="evidence")parts.push(`ev.event_type LIKE 'evidence.%'`);
  else if(t==="approval")parts.push(`(ev.event_type LIKE 'approval.%' OR ev.event_type LIKE 'correction.%')`);
  else{parts.push(`ev.event_type=?`);binds.push(t)}
 }
 return parts.length?` AND (${parts.join(" OR ")})`:"";
}
function periodClause(period,from,to,binds){
 if(from){binds.push(from);return` AND ev.occurred_at>=?${to?(binds.push(to)," AND ev.occurred_at<=?"):""}`}
 if(period==="today")return` AND ev.occurred_at>=datetime('now','start of day')`;
 if(period==="yesterday")return` AND ev.occurred_at>=datetime('now','start of day','-1 day') AND ev.occurred_at<datetime('now','start of day')`;
 if(period==="month")return` AND ev.occurred_at>=datetime('now','start of month')`;
 if(period==="30d")return` AND ev.occurred_at>=datetime('now','-30 days')`;
 if(period==="custom")return"";
 return` AND ev.occurred_at>=datetime('now','-7 days')`;
}
function buildFilters(url,c,projectId,ownOnly,{cursor=true}={}){
 const q=safe(url.searchParams.get("q")).slice(0,120),stage=safe(url.searchParams.get("stage")),responsible=safe(url.searchParams.get("responsible")),state=safe(url.searchParams.get("state")),priority=safe(url.searchParams.get("priority")),source=safe(url.searchParams.get("source")),evidence=safe(url.searchParams.get("evidence"));
 const types=url.searchParams.getAll("type").flatMap(v=>v.split(",")).map(safe).filter(Boolean).slice(0,8);
 const period=safe(url.searchParams.get("period"))||"week",from=safe(url.searchParams.get("date_from")),to=safe(url.searchParams.get("date_to"));
 const binds=[c.tenantId,projectId];let where=` WHERE ev.tenant_id=? AND e.asset_id=?`;
 if(ownOnly){where+=` AND (ev.actor_user_id=? OR e.assigned_to=? OR es.assigned_to=? OR ea.assigned_to=?)`;binds.push(c.user.id,c.user.id,c.user.id,c.user.id)}
 if(q){where+=` AND (ev.description LIKE ? OR ev.event_type LIKE ? OR COALESCE(u.email,'') LIKE ? OR COALESCE(s.name,'') LIKE ? OR COALESCE(ea.title,e.title,'') LIKE ? OR COALESCE(e.execution_code,'') LIKE ? OR EXISTS(SELECT 1 FROM trace_evidences te WHERE te.event_id=ev.id AND COALESCE(te.original_filename,'') LIKE ?) OR EXISTS(SELECT 1 FROM trace_incidents ti WHERE ti.execution_id=ev.execution_id AND COALESCE(ti.title,'') LIKE ?))`;const n=`%${q}%`;binds.push(n,n,n,n,n,n,n,n)}
 if(stage){where+=` AND s.id=?`;binds.push(stage)}
 if(responsible){where+=` AND COALESCE(ea.assigned_to,es.assigned_to,ev.actor_user_id)=?`;binds.push(responsible)}
 if(state){where+=` AND COALESCE(ea.status,e.status)=?`;binds.push(state)}
 if(priority){where+=` AND COALESCE(ea.priority,e.priority)=?`;binds.push(priority)}
 if(source){where+=` AND ev.event_source=?`;binds.push(source)}
 if(evidence==="with")where+=` AND EXISTS(SELECT 1 FROM trace_evidences te WHERE te.event_id=ev.id OR (ev.execution_activity_id IS NOT NULL AND te.execution_activity_id=ev.execution_activity_id))`;
 if(evidence==="without")where+=` AND NOT EXISTS(SELECT 1 FROM trace_evidences te WHERE te.event_id=ev.id OR (ev.execution_activity_id IS NOT NULL AND te.execution_activity_id=ev.execution_activity_id))`;
 where+=typeClause(types,binds);where+=periodClause(period,from,to,binds);
 if(cursor){const cur=dec(safe(url.searchParams.get("cursor")));if(cur?.at&&cur?.id){where+=` AND (ev.occurred_at<? OR (ev.occurred_at=? AND ev.id<?))`;binds.push(cur.at,cur.at,cur.id)}}
 return{where,binds,filters:{q,stage,responsible,state,priority,source,evidence,types,period,from,to}};
}

const BASE=` FROM trace_events ev JOIN trace_executions e ON e.id=ev.execution_id LEFT JOIN trace_execution_stages es ON es.id=ev.execution_stage_id LEFT JOIN trace_stages s ON s.id=es.stage_id LEFT JOIN trace_execution_activities ea ON ea.id=ev.execution_activity_id LEFT JOIN users u ON u.id=ev.actor_user_id`;
const SELECT=`SELECT ev.id,ev.event_type,ev.event_source,ev.actor_user_id,ev.actor_role,ev.description,ev.payload_json,ev.occurred_at,ev.execution_id,ev.execution_stage_id,ev.execution_activity_id,e.execution_code,COALESCE(ea.title,e.title) activity_title,COALESCE(ea.status,e.status) activity_status,COALESCE(ea.priority,e.priority) priority,COALESCE(ea.assigned_to,es.assigned_to) responsible_user_id,u.email actor_email,s.id stage_id,s.name stage_name,(SELECT COUNT(*) FROM trace_evidences te WHERE te.event_id=ev.id OR (ev.execution_activity_id IS NOT NULL AND te.execution_activity_id=ev.execution_activity_id)) evidence_count,(SELECT GROUP_CONCAT(te.public_url,'|') FROM trace_evidences te WHERE (te.event_id=ev.id OR (ev.execution_activity_id IS NOT NULL AND te.execution_activity_id=ev.execution_activity_id)) AND te.public_url IS NOT NULL LIMIT 3) evidence_urls,(SELECT GROUP_CONCAT(te.original_filename,'|') FROM trace_evidences te WHERE (te.event_id=ev.id OR (ev.execution_activity_id IS NOT NULL AND te.execution_activity_id=ev.execution_activity_id)) AND te.original_filename IS NOT NULL LIMIT 3) evidence_names`;

function csvEscape(v){const s=String(v??"");return/[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s}
function csvResponse(items,project){
 const head=["Fecha","Tipo","Autor","Origen","Etapa","Actividad","Estado","Prioridad","Descripción","Evidencias","ID"];
 const rows=items.map(r=>[r.occurred_at,r.event_type,r.actor_email||r.actor_role||"Trace",r.event_source,r.stage_name||"Proyecto",r.activity_title||"",r.activity_status||"",r.priority||"",r.description||"",r.evidence_count||0,r.id]);
 const csv="\uFEFF"+[head,...rows].map(row=>row.map(csvEscape).join(",")).join("\r\n");
 const name=String(project.name||"bitacora").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9_-]+/g,"-").replace(/^-|-$/g,"").toLowerCase()||"bitacora";
 return new Response(csv,{status:200,headers:{...CORS,"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename=\"${name}-bitacora.csv\"`,"Cache-Control":"no-store"}});
}

export async function handleTraceV1ProjectTimelineApi(request,env){
 const url=new URL(request.url);const m=url.pathname.match(/^\/api\/trace\/v1\/admin\/projects\/([^/]+)\/timeline(?:\/export)?$/);if(!m)return null;
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
 if(request.method!=="GET")return json({ok:false,error:"method_not_allowed"},405);
 const c=await context(request,env);if(!c)return json({ok:false,error:"unauthorized"},401);
 const projectId=decodeURIComponent(m[1]);
 const project=await c.db.prepare(`SELECT id,name,status,qr_slug FROM trace_assets WHERE id=? AND tenant_id=? AND asset_type='project' LIMIT 1`).bind(projectId,c.tenantId).first();if(!project)return json({ok:false,error:"project_not_found"},404);
 const participant=await c.db.prepare(`SELECT project_role FROM trace_project_participants WHERE tenant_id=? AND project_id=? AND user_id=? AND status='active' LIMIT 1`).bind(c.tenantId,projectId,c.user.id).first();
 const projectRole=participant?.project_role||null,ownOnly=projectRole==="member";
 if(url.pathname.endsWith("/export")){
  if(projectRole==="member")return json({ok:false,error:"forbidden",message:"Tu rol no permite exportar toda la bitácora del proyecto."},403);
  const f=buildFilters(url,c,projectId,ownOnly,{cursor:false});
  const rows=await c.db.prepare(`${SELECT}${BASE}${f.where} ORDER BY ev.occurred_at DESC,ev.id DESC LIMIT 5000`).bind(...f.binds).all();
  return csvResponse(rows.results||[],project);
 }
 const f=buildFilters(url,c,projectId,ownOnly,{cursor:true}),limit=20;
 const rows=await c.db.prepare(`${SELECT}${BASE}${f.where} ORDER BY ev.occurred_at DESC,ev.id DESC LIMIT ?`).bind(...f.binds,limit+1).all();
 const result=rows.results||[],hasMore=result.length>limit,items=result.slice(0,limit).map(r=>{let payload={};try{payload=JSON.parse(r.payload_json||"{}")}catch{}return{...r,payload,evidenceUrls:String(r.evidence_urls||"").split("|").filter(Boolean),evidenceNames:String(r.evidence_names||"").split("|").filter(Boolean)}}),last=items[items.length-1];
 const cf=buildFilters(url,c,projectId,ownOnly,{cursor:false});
 const totals=await c.db.prepare(`SELECT COUNT(*) activities,SUM(CASE WHEN EXISTS(SELECT 1 FROM trace_evidences te WHERE te.event_id=ev.id OR (ev.execution_activity_id IS NOT NULL AND te.execution_activity_id=ev.execution_activity_id)) THEN 1 ELSE 0 END) with_evidence,SUM(CASE WHEN ev.event_type LIKE 'approval.%' THEN 1 ELSE 0 END) approvals,SUM(CASE WHEN ev.event_type LIKE 'incident.%' THEN 1 ELSE 0 END) incidents${BASE}${cf.where}`).bind(...cf.binds).first();
 const stages=await c.db.prepare(`SELECT DISTINCT s.id,s.name,s.stage_order FROM trace_stages s JOIN trace_process_versions v ON v.id=s.process_version_id JOIN trace_processes p ON p.current_version_id=v.id JOIN trace_assets a ON a.process_id=p.id WHERE a.id=? AND a.tenant_id=? ORDER BY s.stage_order`).bind(projectId,c.tenantId).all();
 const people=await c.db.prepare(`SELECT DISTINCT u.id,u.email FROM users u JOIN trace_project_participants pp ON pp.user_id=u.id WHERE pp.tenant_id=? AND pp.project_id=? AND pp.status='active' ORDER BY u.email`).bind(c.tenantId,projectId).all();
 const approvals=projectRole==="owner"||projectRole==="manager"||projectRole==="supervisor"?await c.db.prepare(`SELECT ap.id,ap.status,ap.requested_at,ap.execution_id,ap.execution_stage_id,ap.execution_activity_id,COALESCE(ea.title,e.title) activity_title,s.name stage_name,u.email responsible_email,(SELECT te.public_url FROM trace_evidences te WHERE (ap.execution_activity_id IS NOT NULL AND te.execution_activity_id=ap.execution_activity_id) OR (ap.execution_activity_id IS NULL AND te.execution_stage_id=ap.execution_stage_id) AND te.public_url IS NOT NULL ORDER BY te.created_at DESC LIMIT 1) preview_url FROM trace_approvals ap JOIN trace_executions e ON e.id=ap.execution_id LEFT JOIN trace_execution_stages es ON es.id=ap.execution_stage_id LEFT JOIN trace_stages s ON s.id=es.stage_id LEFT JOIN trace_execution_activities ea ON ea.id=ap.execution_activity_id LEFT JOIN users u ON u.id=COALESCE(ea.assigned_to,es.assigned_to) WHERE ap.tenant_id=? AND e.asset_id=? AND ap.status='pending' AND (? IN ('owner','manager') OR ?='supervisor' OR ap.assigned_approver_id=?) ORDER BY ap.requested_at ASC LIMIT 6`).bind(c.tenantId,projectId,projectRole||"",projectRole||"",c.user.id).all():{results:[]};
 const newest=await c.db.prepare(`SELECT ev.occurred_at,ev.id${BASE} WHERE ev.tenant_id=? AND e.asset_id=? ORDER BY ev.occurred_at DESC,ev.id DESC LIMIT 1`).bind(c.tenantId,projectId).first();
 return json({ok:true,data:{project:{...project},viewer:{projectRole,scope:ownOnly?"own":"project",canExport:!ownOnly},items,nextCursor:hasMore&&last?enc({at:last.occurred_at,id:last.id}):null,hasMore,newestEvent:newest||null,totals:{activities:Number(totals?.activities||0),evidences:Number(totals?.with_evidence||0),approvals:Number(totals?.approvals||0),incidents:Number(totals?.incidents||0)},stages:stages.results||[],people:people.results||[],pendingApprovals:approvals.results||[]}});
}
