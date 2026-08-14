import jwt from "@tsndr/cloudflare-worker-jwt";
import { getTraceDatabase } from "./trace/shared/database.js";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization"};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});
const codePart=v=>String(v||"TRACE").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-Z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,24)||"TRACE";

async function context(request,env){
 const h=request.headers.get("Authorization")||"";if(!h.startsWith("Bearer "))return null;
 const token=h.slice(7).trim();let ok=false;try{ok=await jwt.verify(token,env.JWT_SECRET||"changeme-set-in-cloudflare-dashboard")}catch{return null}if(!ok)return null;
 const p=jwt.decode(token)?.payload||{};if((p.session_type||"standard")!=="standard")return null;
 const userId=p.user_id||p.userId||p.id||p.sub;if(!userId)return null;
 const db=getTraceDatabase(env);const user=await db.prepare(`SELECT id,enterprise_id,is_active FROM users WHERE id=? LIMIT 1`).bind(userId).first();
 if(!user||Number(user.is_active)!==1)return null;return{db,user,tenantId:user.enterprise_id||user.id};
}

export async function handleTraceV1OnboardingExecutionApi(request,env){
 const url=new URL(request.url);const m=url.pathname.match(/^\/api\/trace\/v1\/admin\/onboarding\/projects\/([^/]+)\/operationalize$/);if(!m)return null;
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
 if(request.method!=="POST")return json({ok:false,error:"method_not_allowed"},405);
 const c=await context(request,env);if(!c)return json({ok:false,error:"unauthorized"},401);
 const projectId=decodeURIComponent(m[1]);
 const project=await c.db.prepare(`SELECT a.id,a.name,a.process_id,a.status,p.current_version_id,p.status process_status,v.status version_status FROM trace_assets a JOIN trace_processes p ON p.id=a.process_id JOIN trace_process_versions v ON v.id=p.current_version_id WHERE a.id=? AND a.tenant_id=? AND a.asset_type='project' LIMIT 1`).bind(projectId,c.tenantId).first();
 if(!project)return json({ok:false,error:"project_not_found"},404);
 if(project.status!=="active"||project.process_status!=="active"||project.version_status!=="published")return json({ok:false,error:"project_not_activated",message:"Primero activa la configuración de Trace."},409);
 const existing=await c.db.prepare(`SELECT id,execution_code,status FROM trace_executions WHERE tenant_id=? AND asset_id=? AND process_id=? AND status!='cancelled' ORDER BY created_at DESC LIMIT 1`).bind(c.tenantId,projectId,project.process_id).first();
 if(existing)return json({ok:true,data:{executionId:existing.id,executionCode:existing.execution_code,status:existing.status,reused:true}});
 const stages=await c.db.prepare(`SELECT id,stage_order FROM trace_stages WHERE process_version_id=? ORDER BY stage_order`).bind(project.current_version_id).all();
 if(!(stages.results||[]).length)return json({ok:false,error:"stages_missing",message:"El seguimiento activado no contiene etapas."},422);
 const executionId=crypto.randomUUID();const executionCode=`TRACE-${codePart(project.name)}-${crypto.randomUUID().slice(0,6).toUpperCase()}`;
 const statements=[
  c.db.prepare(`INSERT INTO trace_executions (id,tenant_id,process_id,process_version_id,asset_id,execution_code,title,status,priority,current_stage_id,assigned_to,completion_percentage,metadata_json,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'assigned','normal',?,?,0,'{}',?,datetime('now'),datetime('now'))`).bind(executionId,c.tenantId,project.process_id,project.current_version_id,projectId,executionCode,project.name,stages.results[0].id,c.user.id,c.user.id),
 ];
 (stages.results||[]).forEach((s,i)=>statements.push(c.db.prepare(`INSERT INTO trace_execution_stages (id,execution_id,stage_id,stage_order,status,assigned_to,response_json,validation_json,created_at,updated_at) VALUES (?,?,?,?,?,?, '{}','{}',datetime('now'),datetime('now'))`).bind(crypto.randomUUID(),executionId,s.id,Number(s.stage_order),i===0?'available':'pending',i===0?c.user.id:null)));
 statements.push(c.db.prepare(`INSERT INTO trace_events (id,tenant_id,execution_id,asset_id,event_type,event_source,actor_user_id,actor_role,description,payload_json,occurred_at,received_at) VALUES (?,?,?,?, 'execution.created','admin',?,?,?, '{}',datetime('now'),datetime('now'))`).bind(crypto.randomUUID(),c.tenantId,executionId,projectId,c.user.id,'manager',`Trace fue activado para ${project.name}.`));
 await c.db.batch(statements);
 return json({ok:true,data:{executionId,executionCode,status:"assigned",reused:false}},201);
}
