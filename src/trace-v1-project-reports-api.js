import jwt from "@tsndr/cloudflare-worker-jwt";
import { getTraceDatabase } from "./trace/shared/database.js";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization"};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});
const uuid=()=>crypto.randomUUID();
const text=(v,n=255)=>{if(v===null||v===undefined)return null;const s=String(v).trim();return s?s.slice(0,n):null};
const parse=(v,f)=>{try{return v?JSON.parse(v):f}catch{return f}};
const REPORT_TYPES=new Set(["executive","traceability","incidents","evidence","compliance","analytics","client"]);
const DEFAULT_SECTIONS={
 executive:["summary","stages","activities","incidents","approvals","evidence"],
 traceability:["summary","timeline","stages","activities","incidents","approvals","evidence"],
 incidents:["summary","incidents","timeline","evidence"],
 evidence:["summary","evidence"],
 compliance:["summary","stages","activities","approvals","evidence"],
 analytics:["summary","stages","activities","incidents","approvals"],
 client:["summary","stages","incidents","approvals","evidence"],
};

async function context(request,env){
 const h=request.headers.get("Authorization")||"";if(!h.startsWith("Bearer "))return null;
 let ok=false,token=h.slice(7).trim();try{ok=await jwt.verify(token,env.JWT_SECRET||"changeme-set-in-cloudflare-dashboard")}catch{return null}if(!ok)return null;
 const p=jwt.decode(token)?.payload||{};if((p.session_type||"standard")!=="standard")return null;
 const userId=p.user_id||p.userId||p.id||p.sub;if(!userId)return null;
 const db=getTraceDatabase(env),user=await db.prepare(`SELECT id,email,role,enterprise_id,is_active FROM users WHERE id=? LIMIT 1`).bind(userId).first();
 if(!user||Number(user.is_active)!==1)return null;
 return{db,user,tenantId:user.enterprise_id||user.id};
}

async function projectAccess(c,projectId){
 const project=await c.db.prepare(`SELECT id,name,description,status,location,qr_slug,process_id,created_at,updated_at FROM trace_assets WHERE id=? AND tenant_id=? AND asset_type='project' LIMIT 1`).bind(projectId,c.tenantId).first();
 if(!project)return null;
 const participant=await c.db.prepare(`SELECT project_role,status FROM trace_project_participants WHERE tenant_id=? AND project_id=? AND user_id=? AND status='active' LIMIT 1`).bind(c.tenantId,projectId,c.user.id).first();
 if(c.user.id!==c.tenantId&&!participant)return null;
 return{project,projectRole:participant?.project_role||"owner"};
}

function mapReport(r){return{
 id:r.id,code:`RPT-${String(r.id).replace(/-/g,"").slice(0,8).toUpperCase()}`,projectId:r.project_id,executionId:r.execution_id||null,
 type:r.report_type,title:r.title,description:r.description||null,scope:{type:r.scope_type,id:r.scope_id||null},period:{from:r.period_from||null,to:r.period_to||null},status:r.status,
 definition:parse(r.definition_json,{}),generatedBy:r.generated_by,generatedByEmail:r.generated_by_email||null,generatedAt:r.generated_at,createdAt:r.created_at,
};}

async function buildSnapshot(c,projectId,definition){
 const access=await projectAccess(c,projectId);if(!access)return null;
 const {project}=access,from=text(definition?.period?.from,10),to=text(definition?.period?.to,10),scope=definition?.scope||{type:"project"};
 const dateClause=(column)=>`${from?` AND date(${column})>=date(?)`:""}${to?` AND date(${column})<=date(?)`:""}`;
 const dateArgs=()=>[...(from?[from]:[]),...(to?[to]:[])];
 const [execR,incR,appR,evR,eventR,stageR,teamR]=await Promise.all([
  c.db.prepare(`SELECT e.id,e.execution_code,e.title,e.status,e.priority,e.completion_percentage,e.assigned_to,u.email assigned_email,e.started_at,e.due_at,e.completed_at,e.created_at,e.updated_at FROM trace_executions e LEFT JOIN users u ON u.id=e.assigned_to WHERE e.tenant_id=? AND e.asset_id=?${dateClause("e.created_at")} ORDER BY e.created_at ASC`).bind(c.tenantId,projectId,...dateArgs()).all(),
  c.db.prepare(`SELECT i.id,i.incident_code,i.title,i.description,i.severity,i.status,i.reported_at,i.resolved_at,i.execution_id,i.execution_stage_id,u.email reported_by_email FROM trace_incidents i JOIN trace_executions e ON e.id=i.execution_id LEFT JOIN users u ON u.id=i.reported_by WHERE i.tenant_id=? AND e.asset_id=?${dateClause("i.reported_at")} ORDER BY i.reported_at ASC`).bind(c.tenantId,projectId,...dateArgs()).all(),
  c.db.prepare(`SELECT ap.id,ap.status,ap.requested_at,ap.decided_at,ap.execution_id,ap.execution_stage_id,ap.execution_activity_id,ap.decision_notes,s.name stage_name,u.email requested_by_email FROM trace_approvals ap JOIN trace_executions e ON e.id=ap.execution_id LEFT JOIN trace_execution_stages es ON es.id=ap.execution_stage_id LEFT JOIN trace_stages s ON s.id=es.stage_id LEFT JOIN users u ON u.id=ap.requested_by WHERE ap.tenant_id=? AND e.asset_id=?${dateClause("ap.requested_at")} ORDER BY ap.requested_at ASC`).bind(c.tenantId,projectId,...dateArgs()).all(),
  c.db.prepare(`SELECT ev.id,ev.original_filename,ev.mime_type,ev.evidence_type,ev.validation_status status,ev.created_at,ev.execution_id,ev.execution_stage_id,ev.execution_activity_id,ev.metadata_json,ev.checksum,u.email uploaded_by_email,s.name stage_name,ea.title activity_title FROM trace_evidences ev JOIN trace_executions e ON e.id=ev.execution_id LEFT JOIN users u ON u.id=ev.uploaded_by LEFT JOIN trace_execution_stages es ON es.id=ev.execution_stage_id LEFT JOIN trace_stages s ON s.id=es.stage_id LEFT JOIN trace_execution_activities ea ON ea.id=ev.execution_activity_id WHERE ev.tenant_id=? AND e.asset_id=?${dateClause("ev.created_at")} ORDER BY ev.created_at ASC`).bind(c.tenantId,projectId,...dateArgs()).all(),
  c.db.prepare(`SELECT ev.id,ev.event_type,ev.event_source,ev.description,ev.occurred_at,ev.execution_id,ev.execution_stage_id,ev.execution_activity_id,u.email actor_email,s.name stage_name FROM trace_events ev JOIN trace_executions e ON e.id=ev.execution_id LEFT JOIN users u ON u.id=ev.actor_user_id LEFT JOIN trace_execution_stages es ON es.id=ev.execution_stage_id LEFT JOIN trace_stages s ON s.id=es.stage_id WHERE ev.tenant_id=? AND e.asset_id=?${dateClause("ev.occurred_at")} ORDER BY ev.occurred_at ASC`).bind(c.tenantId,projectId,...dateArgs()).all(),
  c.db.prepare(`SELECT es.id execution_stage_id,es.execution_id,es.status,es.started_at,es.completed_at,s.id stage_id,s.name,s.stage_order,u.email assigned_email FROM trace_execution_stages es JOIN trace_executions e ON e.id=es.execution_id JOIN trace_stages s ON s.id=es.stage_id LEFT JOIN users u ON u.id=es.assigned_to WHERE e.tenant_id=? AND e.asset_id=? ORDER BY s.stage_order,e.created_at`).bind(c.tenantId,projectId).all(),
  c.db.prepare(`SELECT pp.user_id,pp.project_role,u.email FROM trace_project_participants pp JOIN users u ON u.id=pp.user_id WHERE pp.tenant_id=? AND pp.project_id=? AND pp.status='active' ORDER BY u.email`).bind(c.tenantId,projectId).all(),
 ]);
 const executions=execR.results||[],incidents=incR.results||[],approvals=appR.results||[],evidence=(evR.results||[]).map(x=>({...x,metadata:parse(x.metadata_json,{})})),events=eventR.results||[],stages=stageR.results||[];
 const progress=executions.length?Math.round(executions.reduce((n,x)=>n+Number(x.completion_percentage||0),0)/executions.length):0;
 const openIncidents=incidents.filter(x=>!["resolved","validated","closed"].includes(x.status));
 const pendingApprovals=approvals.filter(x=>x.status==="pending");
 const completed=executions.filter(x=>["completed","approved"].includes(x.status)).length;
 return{
  schemaVersion:1,snapshotAt:new Date().toISOString(),source:"kawvo-trace",project,scope,period:{from:from||null,to:to||null},
  summary:{progress,totalExecutions:executions.length,completedExecutions:completed,activeExecutions:executions.length-completed,openIncidents:openIncidents.length,pendingApprovals:pendingApprovals.length,evidenceCount:evidence.length,eventCount:events.length},
  executions,stages,incidents,approvals,evidence,events,team:teamR.results||[]
 };
}

async function listReports(c,projectId,url){
 const access=await projectAccess(c,projectId);if(!access)return json({ok:false,error:"project_not_found_or_forbidden"},404);
 const type=text(url.searchParams.get("type"),40),status=text(url.searchParams.get("status"),40),q=text(url.searchParams.get("q"),120);
 const where=["r.tenant_id=?","r.project_id=?"],args=[c.tenantId,projectId];
 if(type){where.push("r.report_type=?");args.push(type)}if(status){where.push("r.status=?");args.push(status)}if(q){where.push("(r.title LIKE ? OR r.description LIKE ?)");args.push(`%${q}%`,`%${q}%`)}
 const rows=await c.db.prepare(`SELECT r.*,u.email generated_by_email FROM trace_reports r LEFT JOIN users u ON u.id=r.generated_by WHERE ${where.join(" AND ")} ORDER BY r.generated_at DESC LIMIT 100`).bind(...args).all();
 const summary=await c.db.prepare(`SELECT COUNT(*) total,SUM(CASE WHEN generated_at>=datetime('now','start of month') THEN 1 ELSE 0 END) this_month,SUM(CASE WHEN status='shared' THEN 1 ELSE 0 END) shared FROM trace_reports WHERE tenant_id=? AND project_id=?`).bind(c.tenantId,projectId).first();
 const schedules=await c.db.prepare(`SELECT COUNT(*) total FROM trace_report_schedules WHERE tenant_id=? AND project_id=? AND status='active'`).bind(c.tenantId,projectId).first();
 return json({ok:true,data:{project:access.project,summary:{generated:Number(summary?.total||0),thisMonth:Number(summary?.this_month||0),shared:Number(summary?.shared||0),scheduled:Number(schedules?.total||0)},items:(rows.results||[]).map(mapReport)}});
}

async function createReport(c,projectId,request){
 const access=await projectAccess(c,projectId);if(!access)return json({ok:false,error:"project_not_found_or_forbidden"},404);
 let body={};try{body=await request.json()}catch{return json({ok:false,error:"invalid_json"},400)}
 const type=text(body.type,40)||"executive";if(!REPORT_TYPES.has(type))return json({ok:false,error:"invalid_report_type"},422);
 const sections=Array.isArray(body.sections)&&body.sections.length?body.sections:DEFAULT_SECTIONS[type];
 const definition={type,scope:body.scope&&typeof body.scope==="object"?body.scope:{type:"project"},period:body.period&&typeof body.period==="object"?body.period:{from:null,to:null},sections};
 const snapshot=await buildSnapshot(c,projectId,definition);if(!snapshot)return json({ok:false,error:"project_not_found_or_forbidden"},404);
 const id=uuid(),title=text(body.title,180)||`${typeLabel(type)} · ${new Date().toLocaleDateString("es-DO",{year:"numeric",month:"long",day:"numeric"})}`,description=text(body.description,800),executionId=definition.scope.type==="execution"?definition.scope.id||null:null;
 await c.db.prepare(`INSERT INTO trace_reports (id,tenant_id,project_id,execution_id,report_type,title,description,scope_type,scope_id,period_from,period_to,status,definition_json,snapshot_json,generated_by,generated_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,'ready',?,?,?,datetime('now'),datetime('now'),datetime('now'))`).bind(id,c.tenantId,projectId,executionId,type,title,description,definition.scope.type||"project",definition.scope.id||null,definition.period.from||null,definition.period.to||null,JSON.stringify(definition),JSON.stringify(snapshot),c.user.id).run();
 const row=await c.db.prepare(`SELECT r.*,u.email generated_by_email FROM trace_reports r LEFT JOIN users u ON u.id=r.generated_by WHERE r.id=? LIMIT 1`).bind(id).first();
 return json({ok:true,data:{...mapReport(row),snapshot}},201);
}

function typeLabel(type){return({executive:"Reporte ejecutivo",traceability:"Reporte de trazabilidad",incidents:"Incidencias y correcciones",evidence:"Registro de evidencias",compliance:"Cumplimiento de actividades",analytics:"Analítica y tiempos",client:"Informe para cliente"})[type]||"Reporte"}

async function getReport(c,projectId,reportId){
 const access=await projectAccess(c,projectId);if(!access)return json({ok:false,error:"project_not_found_or_forbidden"},404);
 const row=await c.db.prepare(`SELECT r.*,u.email generated_by_email FROM trace_reports r LEFT JOIN users u ON u.id=r.generated_by WHERE r.id=? AND r.tenant_id=? AND r.project_id=? LIMIT 1`).bind(reportId,c.tenantId,projectId).first();
 if(!row)return json({ok:false,error:"report_not_found"},404);
 const files=await c.db.prepare(`SELECT id,format,original_filename,mime_type,size_bytes,checksum_sha256,status,generated_at FROM trace_report_files WHERE report_id=? ORDER BY format`).bind(reportId).all();
 return json({ok:true,data:{...mapReport(row),snapshot:parse(row.snapshot_json,{}),files:files.results||[]}});
}

export async function handleTraceV1ProjectReportsApi(request,env){
 const url=new URL(request.url),m=url.pathname.match(/^\/api\/trace\/v1\/admin\/projects\/([^/]+)\/reports(?:\/([^/]+))?$/);if(!m)return null;
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
 const c=await context(request,env);if(!c)return json({ok:false,error:"unauthorized"},401);
 const projectId=decodeURIComponent(m[1]),reportId=m[2]?decodeURIComponent(m[2]):null;
 if(!reportId&&request.method==="GET")return listReports(c,projectId,url);
 if(!reportId&&request.method==="POST")return createReport(c,projectId,request);
 if(reportId&&request.method==="GET")return getReport(c,projectId,reportId);
 return json({ok:false,error:"method_not_allowed"},405);
}
