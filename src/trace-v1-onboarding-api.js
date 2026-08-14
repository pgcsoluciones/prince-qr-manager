import jwt from "@tsndr/cloudflare-worker-jwt";
import { getTraceDatabase } from "./trace/shared/database.js";

const ADMIN="/api/trace/v1/admin/onboarding";
const PUBLIC="/api/trace/v1/public/projects";
const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization"};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});
const txt=(v,n=300)=>v==null?"":String(v).trim().slice(0,n);
const bool=v=>v===true||v===1;
const slugPart=v=>String(v||"trace").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,45)||"trace";

async function auth(request,env){
 const h=request.headers.get("Authorization")||""; if(!h.startsWith("Bearer "))return null;
 let ok=false; const token=h.slice(7).trim(); try{ok=await jwt.verify(token,env.JWT_SECRET||"changeme-set-in-cloudflare-dashboard")}catch{return null} if(!ok)return null;
 const p=jwt.decode(token)?.payload||{}; if((p.session_type||"standard")!=="standard")return null;
 const userId=p.user_id||p.userId||p.id||p.sub; if(!userId)return null;
 const db=getTraceDatabase(env); const user=await db.prepare(`SELECT id,email,role,enterprise_id,is_active FROM users WHERE id=? LIMIT 1`).bind(userId).first();
 if(!user||Number(user.is_active)!==1)return null; return{db,user,tenantId:user.enterprise_id||user.id};
}

function normalizeStages(value){
 if(!Array.isArray(value))return[];
 return value.map((s,i)=>({
  name:txt(s.name,160), order:i+1,
  evidence:bool(s.evidenceRequired), incidents:bool(s.incidentEnabled), dates:bool(s.dueDatesEnabled), approval:bool(s.approvalRequired),
  approverRole:bool(s.approvalRequired)?txt(s.approverRole,40):"",
 })).filter(s=>s.name);
}

function validate(stages){
 const errors=[]; if(!stages.length)errors.push("Debe existir al menos una etapa.");
 stages.forEach((s,i)=>{if(!s.name)errors.push(`La etapa ${i+1} necesita nombre.`);if(s.approval&&!s.approverRole)errors.push(`${s.name}: selecciona quién aprueba.`)});
 return errors;
}

async function saveConfig(request,env,activate=false){
 const c=await auth(request,env); if(!c)return json({ok:false,error:"unauthorized"},401);
 let b={};try{b=await request.json()}catch{return json({ok:false,error:"invalid_json"},400)}
 const projectId=txt(b.projectId,100), company=txt(b.company,180), operation=txt(b.operation,180), category=txt(b.category,80)||"general";
 const stages=normalizeStages(b.stages); const errors=validate(stages);
 if(!projectId||!operation)return json({ok:false,error:"missing_fields",message:"Falta el proyecto o el tipo de seguimiento."},422);
 if(errors.length)return json({ok:false,error:"validation_error",details:errors},422);
 const project=await c.db.prepare(`SELECT id,name,process_id,qr_slug,metadata_json FROM trace_assets WHERE id=? AND tenant_id=? AND asset_type='project' LIMIT 1`).bind(projectId,c.tenantId).first();
 if(!project)return json({ok:false,error:"project_not_found"},404);
 let processId=project.process_id||txt(b.processId,100)||null, versionId=null;
 if(processId){const p=await c.db.prepare(`SELECT p.id,p.current_version_id,v.status version_status FROM trace_processes p JOIN trace_process_versions v ON v.id=p.current_version_id WHERE p.id=? AND p.tenant_id=? LIMIT 1`).bind(processId,c.tenantId).first();if(!p)return json({ok:false,error:"process_not_found"},404);if(p.version_status!=="draft")return json({ok:false,error:"version_locked",message:"La configuración publicada no puede sobrescribirse desde el onboarding."},409);versionId=p.current_version_id;await c.db.prepare(`DELETE FROM trace_stages WHERE process_version_id=?`).bind(versionId).run();await c.db.prepare(`UPDATE trace_processes SET name=?,description=?,category=?,status='draft',settings_json=?,updated_at=datetime('now') WHERE id=? AND tenant_id=?`).bind(operation,company?`${company} · ${operation}`:operation,category,JSON.stringify({onboarding:true,projectId,trackingSetup:{stages}}),processId,c.tenantId).run();}
 else{processId=crypto.randomUUID();versionId=crypto.randomUUID();await c.db.batch([
  c.db.prepare(`INSERT INTO trace_processes (id,tenant_id,name,description,category,status,current_version_id,color,icon,settings_json,created_by,created_at,updated_at) VALUES (?,?,?,?,?,'draft',?,'#0b66f0',NULL,?,?,datetime('now'),datetime('now'))`).bind(processId,c.tenantId,operation,company?`${company} · ${operation}`:operation,category,versionId,JSON.stringify({onboarding:true,projectId,trackingSetup:{stages}}),c.user.id),
  c.db.prepare(`INSERT INTO trace_process_versions (id,process_id,version_number,name,description,status,schema_json,created_by,created_at) VALUES (?,?,1,?,?,'draft','{}',?,datetime('now'))`).bind(versionId,processId,operation,company?`${company} · ${operation}`:operation,c.user.id),
  c.db.prepare(`UPDATE trace_assets SET process_id=?,updated_at=datetime('now') WHERE id=? AND tenant_id=?`).bind(processId,projectId,c.tenantId)
 ]);}
 const inserts=stages.map((s,i)=>c.db.prepare(`INSERT INTO trace_stages (id,process_version_id,name,description,stage_order,stage_type,responsible_role,instructions,estimated_duration_minutes,requires_evidence,requires_approval,allow_skip,settings_json,created_at) VALUES (?,?,?,?,?,?,?,?,NULL,?,?,0,?,datetime('now'))`).bind(crypto.randomUUID(),versionId,s.name,null,i+1,i===0?'start':i===stages.length-1?'completion':'operation','member',null,s.evidence?1:0,s.approval?1:0,JSON.stringify({incidentEnabled:s.incidents,dueDatesEnabled:s.dates,approverRole:s.approverRole||null})));
 if(inserts.length)await c.db.batch(inserts);
 let slug=project.qr_slug||null;
 if(activate){slug=slug||`${slugPart(project.name)}-${crypto.randomUUID().slice(0,8)}`;const schema={processId,versionId,stages:stages.map(s=>({name:s.name,order:s.order,requiresEvidence:s.evidence,incidentEnabled:s.incidents,dueDatesEnabled:s.dates,requiresApproval:s.approval,approverRole:s.approverRole||null}))};await c.db.batch([
  c.db.prepare(`UPDATE trace_process_versions SET status='published',schema_json=?,published_at=datetime('now'),published_by=? WHERE id=? AND process_id=? AND status='draft'`).bind(JSON.stringify(schema),c.user.id,versionId,processId),
  c.db.prepare(`UPDATE trace_processes SET status='active',updated_at=datetime('now') WHERE id=? AND tenant_id=?`).bind(processId,c.tenantId),
  c.db.prepare(`UPDATE trace_assets SET status='active',qr_slug=?,metadata_json=?,updated_at=datetime('now') WHERE id=? AND tenant_id=?`).bind(slug,JSON.stringify({onboardingActivatedAt:new Date().toISOString(),company,operation}),projectId,c.tenantId)
 ]);}
 return json({ok:true,data:{projectId,processId,versionId,status:activate?'active':'draft',slug,publicPath:slug?`/trace-project/${slug}`:null,stagesCount:stages.length}},activate?200:201);
}

async function publicProject(env,slug){
 const db=getTraceDatabase(env); const row=await db.prepare(`SELECT a.name,a.description,a.status,a.location,a.qr_slug,p.name process_name,p.status process_status FROM trace_assets a LEFT JOIN trace_processes p ON p.id=a.process_id WHERE a.qr_slug=? AND a.asset_type='project' AND a.status!='retired' LIMIT 1`).bind(slug).first();
 if(!row)return json({ok:false,error:"project_not_found"},404);
 const stages=row.process_name?await db.prepare(`SELECT s.name,s.stage_order FROM trace_stages s JOIN trace_process_versions v ON v.id=s.process_version_id JOIN trace_processes p ON p.current_version_id=v.id JOIN trace_assets a ON a.process_id=p.id WHERE a.qr_slug=? ORDER BY s.stage_order`).bind(slug).all():{results:[]};
 return json({ok:true,data:{name:row.name,description:row.description,status:row.status,location:row.location,tracking:row.process_name,stages:(stages.results||[]).map(s=>({name:s.name,order:Number(s.stage_order)}))}});
}

export async function handleTraceV1OnboardingApi(request,env){
 const url=new URL(request.url); if(request.method==='OPTIONS'&&(url.pathname.startsWith(ADMIN)||url.pathname.startsWith(PUBLIC)))return new Response(null,{status:204,headers:CORS});
 if(url.pathname===`${ADMIN}/tracking/draft`&&request.method==='POST')return saveConfig(request,env,false);
 if(url.pathname===`${ADMIN}/tracking/activate`&&request.method==='POST')return saveConfig(request,env,true);
 const m=url.pathname.match(/^\/api\/trace\/v1\/public\/projects\/([^/]+)$/);if(m&&request.method==='GET')return publicProject(env,decodeURIComponent(m[1]));
 return null;
}
