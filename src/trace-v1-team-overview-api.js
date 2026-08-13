import jwt from "@tsndr/cloudflare-worker-jwt";
import { getTraceDatabase } from "./trace/shared/database.js";

const PATH="/api/trace/v1/admin/team-overview";
const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization"};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});

async function context(request,env){
 const header=request.headers.get("Authorization")||"";
 if(!header.startsWith("Bearer "))return null;
 const token=header.slice(7).trim();
 let valid=false;
 try{valid=await jwt.verify(token,env.JWT_SECRET||"changeme-set-in-cloudflare-dashboard")}catch{return null}
 if(!valid)return null;
 const payload=jwt.decode(token)?.payload||{};
 const userId=payload.user_id||payload.userId||payload.id||payload.sub;
 if(!userId)return null;
 const db=getTraceDatabase(env);
 const user=await db.prepare(`SELECT id,enterprise_id,is_active FROM users WHERE id=? LIMIT 1`).bind(userId).first();
 if(!user||Number(user.is_active)!==1)return null;
 return{db,tenantId:user.enterprise_id||user.id};
}

function groupAssignments(rows,key){
 const map=new Map();
 for(const row of rows){
  if(!map.has(row[key]))map.set(row[key],[]);
  map.get(row[key]).push({projectId:row.project_id,projectName:row.project_name,projectRole:row.project_role,participantId:row.participant_id});
 }
 return map;
}

export async function handleTraceV1TeamOverviewApi(request,env){
 const url=new URL(request.url);
 if(url.pathname!==PATH)return null;
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
 if(request.method!=="GET")return json({ok:false,error:"method_not_allowed"},405);
 const c=await context(request,env);
 if(!c)return json({ok:false,error:"unauthorized"},401);
 const [peopleR,deptsR,projectsR,userAssignmentsR,deptAssignmentsR]=await Promise.all([
  c.db.prepare(`SELECT u.id,u.email,u.role,GROUP_CONCAT(DISTINCT d.name) departments FROM users u LEFT JOIN trace_department_members dm ON dm.user_id=u.id AND dm.tenant_id=? AND dm.status='active' LEFT JOIN trace_departments d ON d.id=dm.department_id WHERE u.is_active=1 AND (u.id=? OR u.enterprise_id=?) GROUP BY u.id ORDER BY u.email`).bind(c.tenantId,c.tenantId,c.tenantId).all(),
  c.db.prepare(`SELECT d.id,d.name,d.description,d.status,COUNT(DISTINCT dm.user_id) member_count FROM trace_departments d LEFT JOIN trace_department_members dm ON dm.department_id=d.id AND dm.status='active' WHERE d.tenant_id=? AND d.status='active' GROUP BY d.id ORDER BY d.name`).bind(c.tenantId).all(),
  c.db.prepare(`SELECT id,name,status,location FROM trace_assets WHERE tenant_id=? AND asset_type='project' AND status!='retired' ORDER BY name`).bind(c.tenantId).all(),
  c.db.prepare(`SELECT pp.id participant_id,pp.user_id,pp.project_id,pp.project_role,a.name project_name FROM trace_project_participants pp JOIN trace_assets a ON a.id=pp.project_id WHERE pp.tenant_id=? AND pp.user_id IS NOT NULL AND pp.status='active' ORDER BY a.name`).bind(c.tenantId).all(),
  c.db.prepare(`SELECT pp.id participant_id,pp.department_id,pp.project_id,pp.project_role,a.name project_name FROM trace_project_participants pp JOIN trace_assets a ON a.id=pp.project_id WHERE pp.tenant_id=? AND pp.department_id IS NOT NULL AND pp.status='active' ORDER BY a.name`).bind(c.tenantId).all()
 ]);
 const userAssignments=groupAssignments(userAssignmentsR.results||[],"user_id");
 const deptAssignments=groupAssignments(deptAssignmentsR.results||[],"department_id");
 const people=(peopleR.results||[]).map(p=>({...p,departments:p.departments?String(p.departments).split(","):[],assignments:userAssignments.get(p.id)||[]}));
 const departments=(deptsR.results||[]).map(d=>({...d,assignments:deptAssignments.get(d.id)||[]}));
 return json({ok:true,data:{people,departments,projects:projectsR.results||[]}});
}
