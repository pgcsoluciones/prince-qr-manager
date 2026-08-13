import jwt from "@tsndr/cloudflare-worker-jwt";
import { getTraceDatabase } from "./trace/shared/database.js";

const BASE="/api/trace/v1/admin/project-team";
const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"DELETE,OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization"};
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
 return{db,user,tenantId:user.enterprise_id||user.id};
}

async function removeParticipant(request,env,projectId){
 const c=await context(request,env);
 if(!c)return json({ok:false,error:"unauthorized"},401);
 let body={};
 try{body=await request.json()}catch{return json({ok:false,error:"invalid_json"},400)}
 const userId=body.userId?String(body.userId).trim():null;
 const departmentId=body.departmentId?String(body.departmentId).trim():null;
 if((userId&&departmentId)||(!userId&&!departmentId))return json({ok:false,error:"participant_required"},422);
 const project=await c.db.prepare(`SELECT id FROM trace_assets WHERE id=? AND tenant_id=? AND asset_type='project' LIMIT 1`).bind(projectId,c.tenantId).first();
 if(!project)return json({ok:false,error:"project_not_found"},404);
 const result=userId
  ?await c.db.prepare(`UPDATE trace_project_participants SET status='revoked',updated_at=datetime('now') WHERE tenant_id=? AND project_id=? AND user_id=? AND status='active'`).bind(c.tenantId,projectId,userId).run()
  :await c.db.prepare(`UPDATE trace_project_participants SET status='revoked',updated_at=datetime('now') WHERE tenant_id=? AND project_id=? AND department_id=? AND status='active'`).bind(c.tenantId,projectId,departmentId).run();
 return json({ok:true,data:{projectId,userId,departmentId,changed:result.meta?.changes||0}});
}

export async function handleTraceV1ProjectTeamApi(request,env){
 const url=new URL(request.url);
 if(!url.pathname.startsWith(BASE))return null;
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
 const match=url.pathname.match(/^\/api\/trace\/v1\/admin\/project-team\/projects\/([^/]+)\/participants$/);
 if(match&&request.method==="DELETE")return removeParticipant(request,env,decodeURIComponent(match[1]));
 return json({ok:false,error:"not_found"},404);
}
