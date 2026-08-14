import jwt from "@tsndr/cloudflare-worker-jwt";
import { getTraceDatabase } from "./trace/shared/database.js";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization"};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});

async function context(request,env){
  const h=request.headers.get("Authorization")||"";
  if(!h.startsWith("Bearer "))return null;
  const token=h.slice(7).trim();let ok=false;
  try{ok=await jwt.verify(token,env.JWT_SECRET||"changeme-set-in-cloudflare-dashboard")}catch{return null}
  if(!ok)return null;
  const p=jwt.decode(token)?.payload||{};
  if((p.session_type||"standard")!=="standard")return null;
  const userId=p.user_id||p.userId||p.id||p.sub;if(!userId)return null;
  const db=getTraceDatabase(env);
  const user=await db.prepare(`SELECT id,enterprise_id,is_active FROM users WHERE id=? LIMIT 1`).bind(userId).first();
  if(!user||Number(user.is_active)!==1)return null;
  return{db,tenantId:user.enterprise_id||user.id};
}

export async function handleTraceV1ProjectDashboardApi(request,env){
  const url=new URL(request.url);
  const m=url.pathname.match(/^\/api\/trace\/v1\/admin\/projects\/([^/]+)\/dashboard$/);
  if(!m)return null;
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
  if(request.method!=="GET")return json({ok:false,error:"method_not_allowed"},405);
  const c=await context(request,env);if(!c)return json({ok:false,error:"unauthorized"},401);
  const projectId=decodeURIComponent(m[1]);
  const period=["today","month"].includes(url.searchParams.get("period"))?url.searchParams.get("period"):"week";
  const project=await c.db.prepare(`SELECT id,name,description,status,location,qr_slug,process_id,updated_at FROM trace_assets WHERE id=? AND tenant_id=? AND asset_type='project' LIMIT 1`).bind(projectId,c.tenantId).first();
  if(!project)return json({ok:false,error:"project_not_found"},404);

  const [execR,incR,appR,eventsR,dueR,stageR]=await Promise.all([
    c.db.prepare(`SELECT id,execution_code,title,status,priority,completion_percentage,assigned_to,due_at,updated_at FROM trace_executions WHERE tenant_id=? AND asset_id=? ORDER BY updated_at DESC`).bind(c.tenantId,projectId).all(),
    c.db.prepare(`SELECT i.id,i.title,i.severity,i.status,i.reported_at,e.id execution_id,e.title execution_title FROM trace_incidents i JOIN trace_executions e ON e.id=i.execution_id WHERE i.tenant_id=? AND e.asset_id=? ORDER BY i.reported_at DESC LIMIT 50`).bind(c.tenantId,projectId).all(),
    c.db.prepare(`SELECT ap.id,ap.status,ap.requested_at,ap.execution_id,s.name stage_name FROM trace_approvals ap JOIN trace_executions e ON e.id=ap.execution_id LEFT JOIN trace_execution_stages es ON es.id=ap.execution_stage_id LEFT JOIN trace_stages s ON s.id=es.stage_id WHERE ap.tenant_id=? AND e.asset_id=? ORDER BY ap.requested_at DESC LIMIT 50`).bind(c.tenantId,projectId).all(),
    c.db.prepare(`SELECT ev.id,ev.event_type,ev.description,ev.actor_role,ev.occurred_at,ev.execution_id,u.email actor_email,s.name stage_name,e.title execution_title FROM trace_events ev JOIN trace_executions e ON e.id=ev.execution_id LEFT JOIN users u ON u.id=ev.actor_user_id LEFT JOIN trace_execution_stages es ON es.id=ev.execution_stage_id LEFT JOIN trace_stages s ON s.id=es.stage_id WHERE ev.tenant_id=? AND e.asset_id=? AND ev.occurred_at>=CASE ? WHEN 'today' THEN datetime('now','start of day') WHEN 'month' THEN datetime('now','-30 days') ELSE datetime('now','-7 days') END ORDER BY ev.occurred_at DESC LIMIT 60`).bind(c.tenantId,projectId,period).all(),
    c.db.prepare(`SELECT e.id,e.title,e.execution_code,e.due_at,e.status,u.email assigned_email FROM trace_executions e LEFT JOIN users u ON u.id=e.assigned_to WHERE e.tenant_id=? AND e.asset_id=? AND e.status NOT IN ('completed','cancelled') AND e.due_at IS NOT NULL AND date(e.due_at)<=date('now') ORDER BY e.due_at ASC LIMIT 20`).bind(c.tenantId,projectId).all(),
    c.db.prepare(`SELECT s.id,s.name,s.stage_order,COUNT(e.id) total_instances,SUM(CASE WHEN e.id IS NOT NULL AND es.status IN ('approved','completed') THEN 1 ELSE 0 END) completed_instances FROM trace_stages s JOIN trace_process_versions v ON v.id=s.process_version_id JOIN trace_processes p ON p.current_version_id=v.id LEFT JOIN trace_execution_stages es ON es.stage_id=s.id LEFT JOIN trace_executions e ON e.id=es.execution_id AND e.asset_id=? WHERE p.id=? GROUP BY s.id ORDER BY s.stage_order`).bind(projectId,project.process_id||"").all(),
  ]);

  const executions=execR.results||[],incidents=incR.results||[],approvals=appR.results||[];
  const activeStatuses=new Set(["assigned","in_progress","blocked","pending_approval","correction_required","overdue"]);
  const openIncidents=incidents.filter(x=>!["resolved","validated","closed"].includes(x.status));
  const pendingApprovals=approvals.filter(x=>x.status==="pending");
  const progress=executions.length?Math.round(executions.reduce((a,x)=>a+Number(x.completion_percentage||0),0)/executions.length):0;
  const overdue=executions.filter(x=>x.status==="overdue"||(x.due_at&&new Date(x.due_at)<new Date()&&!['completed','cancelled'].includes(x.status)));
  const critical=openIncidents.filter(x=>["critical","high"].includes(String(x.severity).toLowerCase()));
  const alerts=[];
  if(overdue.length)alerts.push({type:"overdue",count:overdue.length,label:`${overdue.length} actividades atrasadas`});
  if(critical.length)alerts.push({type:"incidents",count:critical.length,label:`${critical.length} incidencias requieren atención`});
  if(pendingApprovals.length)alerts.push({type:"approvals",count:pendingApprovals.length,label:`${pendingApprovals.length} aprobaciones pendientes`});

  return json({ok:true,data:{
    project:{...project,publicPath:project.qr_slug?`/trace-project/${project.qr_slug}`:null},
    metrics:{progress,inProgress:executions.filter(x=>activeStatuses.has(x.status)).length,openIncidents:openIncidents.length,pendingApprovals:pendingApprovals.length},
    executions,
    incidents,
    approvals,
    activities:eventsR.results||[],
    dueToday:dueR.results||[],
    alerts,
    stages:(stageR.results||[]).map(s=>({...s,progress:Number(s.total_instances||0)?Math.round(Number(s.completed_instances||0)*100/Number(s.total_instances)):0})),
  }});
}
