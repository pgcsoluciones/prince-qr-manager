import jwt from "@tsndr/cloudflare-worker-jwt";
import { getTraceDatabase } from "./trace/shared/database.js";

const BASE="/api/trace/v1/admin/workspace";
const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization"};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});
const clean=(v,max=300)=>v==null?"":String(v).trim().slice(0,max);
const codePart=(v)=>clean(v,80).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-Z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,30)||"ITEM";

async function ctx(request,env){
 const h=request.headers.get("Authorization")||""; if(!h.startsWith("Bearer "))return null;
 const token=h.slice(7).trim(); let valid=false; try{valid=await jwt.verify(token,env.JWT_SECRET||"changeme-set-in-cloudflare-dashboard")}catch{return null} if(!valid)return null;
 const p=jwt.decode(token)?.payload||{}; const userId=p.user_id||p.userId||p.id||p.sub; if(!userId)return null;
 const db=getTraceDatabase(env); const user=await db.prepare(`SELECT id,email,role,enterprise_id,is_active FROM users WHERE id=? LIMIT 1`).bind(userId).first();
 if(!user||Number(user.is_active)!==1)return null; return{db,user,tenantId:user.enterprise_id||user.id};
}

async function listWorkspace(request,env){
 const c=await ctx(request,env); if(!c)return json({ok:false,error:"unauthorized"},401);
 const [projectsR,departmentsR,peopleR]=await Promise.all([
  c.db.prepare(`SELECT a.id,a.asset_code,a.name,a.description,a.status,a.location,a.created_at,a.updated_at,COUNT(DISTINCT e.id) operation_count,COALESCE(ROUND(AVG(e.completion_percentage)),0) progress,SUM(CASE WHEN e.status='completed' THEN 1 ELSE 0 END) completed_operations,SUM(CASE WHEN e.status NOT IN ('completed','cancelled') THEN 1 ELSE 0 END) active_operations FROM trace_assets a LEFT JOIN trace_executions e ON e.asset_id=a.id AND e.tenant_id=a.tenant_id WHERE a.tenant_id=? AND a.asset_type='project' AND a.status!='retired' GROUP BY a.id ORDER BY CASE a.status WHEN 'active' THEN 0 WHEN 'completed' THEN 2 ELSE 1 END,a.updated_at DESC`).bind(c.tenantId).all(),
  c.db.prepare(`SELECT d.id,d.department_code,d.name,d.description,d.status,d.color,d.created_at,COUNT(DISTINCT dm.user_id) member_count FROM trace_departments d LEFT JOIN trace_department_members dm ON dm.department_id=d.id AND dm.status='active' WHERE d.tenant_id=? AND d.status!='archived' GROUP BY d.id ORDER BY d.name`).bind(c.tenantId).all(),
  c.db.prepare(`SELECT u.id,u.email,u.role,GROUP_CONCAT(DISTINCT d.name) departments,GROUP_CONCAT(DISTINCT pa.name) projects,COUNT(DISTINCT e.id) assigned_operations FROM users u LEFT JOIN trace_department_members dm ON dm.user_id=u.id AND dm.tenant_id=? AND dm.status='active' LEFT JOIN trace_departments d ON d.id=dm.department_id LEFT JOIN trace_project_participants pp ON pp.user_id=u.id AND pp.tenant_id=? AND pp.status='active' LEFT JOIN trace_assets pa ON pa.id=pp.project_id AND pa.asset_type='project' LEFT JOIN trace_executions e ON e.assigned_to=u.id AND e.tenant_id=? AND e.status NOT IN ('completed','cancelled') WHERE u.is_active=1 AND (u.id=? OR u.enterprise_id=?) GROUP BY u.id ORDER BY u.email`).bind(c.tenantId,c.tenantId,c.tenantId,c.tenantId,c.tenantId).all()
 ]);
 return json({ok:true,data:{projects:projectsR.results||[],departments:departmentsR.results||[],people:(peopleR.results||[]).map(p=>({...p,departments:p.departments?String(p.departments).split(","):[],projects:p.projects?String(p.projects).split(","):[]}))}});
}

async function projectDetail(request,env,projectId){
 const c=await ctx(request,env); if(!c)return json({ok:false,error:"unauthorized"},401);
 const project=await c.db.prepare(`SELECT id,asset_code,name,description,status,location,created_at,updated_at FROM trace_assets WHERE id=? AND tenant_id=? AND asset_type='project' LIMIT 1`).bind(projectId,c.tenantId).first();
 if(!project)return json({ok:false,error:"project_not_found"},404);
 const [opsR,peopleR,deptsR]=await Promise.all([
  c.db.prepare(`SELECT e.id,e.execution_code,e.title,e.status,e.priority,e.completion_percentage,e.updated_at,p.name process_name FROM trace_executions e JOIN trace_processes p ON p.id=e.process_id WHERE e.tenant_id=? AND e.asset_id=? ORDER BY e.updated_at DESC`).bind(c.tenantId,projectId).all(),
  c.db.prepare(`SELECT pp.id,pp.project_role,u.id user_id,u.email,u.role account_role FROM trace_project_participants pp JOIN users u ON u.id=pp.user_id WHERE pp.tenant_id=? AND pp.project_id=? AND pp.user_id IS NOT NULL AND pp.status='active' ORDER BY u.email`).bind(c.tenantId,projectId).all(),
  c.db.prepare(`SELECT pp.id,pp.project_role,d.id department_id,d.name,COUNT(DISTINCT dm.user_id) member_count FROM trace_project_participants pp JOIN trace_departments d ON d.id=pp.department_id LEFT JOIN trace_department_members dm ON dm.department_id=d.id AND dm.status='active' WHERE pp.tenant_id=? AND pp.project_id=? AND pp.department_id IS NOT NULL AND pp.status='active' GROUP BY pp.id,d.id ORDER BY d.name`).bind(c.tenantId,projectId).all()
 ]);
 return json({ok:true,data:{project,operations:opsR.results||[],people:peopleR.results||[],departments:deptsR.results||[]}});
}

async function createProject(request,env){
 const c=await ctx(request,env); if(!c)return json({ok:false,error:"unauthorized"},401); let b={};try{b=await request.json()}catch{return json({ok:false,error:"invalid_json"},400)}
 const name=clean(b.name,160),location=clean(b.location,220)||null,description=clean(b.description,500)||null; if(!name)return json({ok:false,error:"name_required",message:"Escribe el nombre del proyecto."},422);
 const id=crypto.randomUUID(),assetCode=`PRJ-${codePart(name)}-${crypto.randomUUID().slice(0,4).toUpperCase()}`;
 await c.db.prepare(`INSERT INTO trace_assets (id,tenant_id,asset_code,name,description,asset_type,status,location,metadata_json,public_data_json,created_by,created_at,updated_at) VALUES (?,?,?,?,?,'project','active',?,'{}','{}',?,datetime('now'),datetime('now'))`).bind(id,c.tenantId,assetCode,name,description,location,c.user.id).run();
 return json({ok:true,data:{id,assetCode,name,location,status:"active"}},201);
}

async function assignProjectParticipant(request,env,projectId){
 const c=await ctx(request,env); if(!c)return json({ok:false,error:"unauthorized"},401); let b={};try{b=await request.json()}catch{return json({ok:false,error:"invalid_json"},400)}
 const userId=clean(b.userId,100)||null,departmentId=clean(b.departmentId,100)||null,projectRole=clean(b.projectRole,30)||'member';
 if((userId&&departmentId)||(!userId&&!departmentId))return json({ok:false,error:"participant_required",message:"Selecciona una persona o un departamento."},422);
 const project=await c.db.prepare(`SELECT id FROM trace_assets WHERE id=? AND tenant_id=? AND asset_type='project' LIMIT 1`).bind(projectId,c.tenantId).first(); if(!project)return json({ok:false,error:"project_not_found"},404);
 if(userId){const u=await c.db.prepare(`SELECT id FROM users WHERE id=? AND is_active=1 AND (id=? OR enterprise_id=?) LIMIT 1`).bind(userId,c.tenantId,c.tenantId).first();if(!u)return json({ok:false,error:"user_not_available"},422)}
 if(departmentId){const d=await c.db.prepare(`SELECT id FROM trace_departments WHERE id=? AND tenant_id=? AND status='active' LIMIT 1`).bind(departmentId,c.tenantId).first();if(!d)return json({ok:false,error:"department_not_available"},422)}
 const id=crypto.randomUUID();
 await c.db.prepare(`INSERT INTO trace_project_participants (id,tenant_id,project_id,user_id,department_id,project_role,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,'active',?,datetime('now'),datetime('now')) ON CONFLICT DO UPDATE SET project_role=excluded.project_role,status='active',updated_at=datetime('now')`).bind(id,c.tenantId,projectId,userId,departmentId,projectRole,c.user.id).run();
 return json({ok:true,data:{projectId,userId,departmentId,projectRole}});
}

async function createDepartment(request,env){
 const c=await ctx(request,env); if(!c)return json({ok:false,error:"unauthorized"},401); let b={};try{b=await request.json()}catch{return json({ok:false,error:"invalid_json"},400)}
 const name=clean(b.name,120),description=clean(b.description,300)||null; if(!name)return json({ok:false,error:"name_required",message:"Escribe el nombre del departamento."},422);
 const dup=await c.db.prepare(`SELECT id FROM trace_departments WHERE tenant_id=? AND lower(name)=lower(?) AND status!='archived' LIMIT 1`).bind(c.tenantId,name).first(); if(dup)return json({ok:false,error:"department_exists",message:"Ya existe un departamento con ese nombre."},409);
 const id=crypto.randomUUID(),departmentCode=`DEP-${codePart(name)}-${crypto.randomUUID().slice(0,4).toUpperCase()}`;
 await c.db.prepare(`INSERT INTO trace_departments (id,tenant_id,department_code,name,description,status,color,settings_json,created_by,created_at,updated_at) VALUES (?,?,?,?,?,'active','#2563eb','{}',?,datetime('now'),datetime('now'))`).bind(id,c.tenantId,departmentCode,name,description,c.user.id).run();
 return json({ok:true,data:{id,departmentCode,name,status:"active"}},201);
}

export async function handleTraceV1WorkspaceApi(request,env){
 const url=new URL(request.url); if(!url.pathname.startsWith(BASE))return null; if(request.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
 if(url.pathname===BASE&&request.method==="GET")return listWorkspace(request,env);
 if(url.pathname===`${BASE}/projects`&&request.method==="POST")return createProject(request,env);
 const projectMatch=url.pathname.match(/^\/api\/trace\/v1\/admin\/workspace\/projects\/([^/]+)$/); if(projectMatch&&request.method==="GET")return projectDetail(request,env,decodeURIComponent(projectMatch[1]));
 const participantMatch=url.pathname.match(/^\/api\/trace\/v1\/admin\/workspace\/projects\/([^/]+)\/participants$/); if(participantMatch&&request.method==="POST")return assignProjectParticipant(request,env,decodeURIComponent(participantMatch[1]));
 if(url.pathname===`${BASE}/departments`&&request.method==="POST")return createDepartment(request,env);
 return json({ok:false,error:"not_found"},404);
}
