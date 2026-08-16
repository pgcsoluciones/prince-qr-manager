import jwt from "@tsndr/cloudflare-worker-jwt";
import { getTraceDatabase } from "./trace/shared/database.js";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,PUT,OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization"};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});
const uuid=()=>crypto.randomUUID();
const SECTIONS=new Set(['company','projects','zones','process','team','external','evidence','notifications','public','integrations','advanced']);
const TENANT_SECTIONS=new Set(['company']);

async function auth(request,env){
 const h=request.headers.get('Authorization')||'';if(!h.startsWith('Bearer '))return null;
 const token=h.slice(7).trim();let ok=false;try{ok=await jwt.verify(token,env.JWT_SECRET||'changeme-set-in-cloudflare-dashboard')}catch{return null}if(!ok)return null;
 const p=jwt.decode(token)?.payload||{};if((p.session_type||'standard')!=='standard')return null;
 const userId=p.user_id||p.userId||p.id||p.sub;if(!userId)return null;
 const db=getTraceDatabase(env);const user=await db.prepare(`SELECT id,email,role,enterprise_id,is_active FROM users WHERE id=? LIMIT 1`).bind(userId).first();
 if(!user||Number(user.is_active)!==1)return null;return{db,user,tenantId:user.enterprise_id||user.id};
}
async function projectContext(a,projectId){
 const project=await a.db.prepare(`SELECT id,name,status FROM trace_assets WHERE id=? AND tenant_id=? AND asset_type='project' LIMIT 1`).bind(projectId,a.tenantId).first();if(!project)return null;
 const pp=await a.db.prepare(`SELECT project_role FROM trace_project_participants WHERE tenant_id=? AND project_id=? AND user_id=? AND status='active' LIMIT 1`).bind(a.tenantId,projectId,a.user.id).first();
 if(a.user.id!==a.tenantId&&!pp&&!['superadmin','enterprise'].includes(a.user.role))return null;
 return{project,projectRole:pp?.project_role||'owner'};
}
async function orgRole(a){
 if(a.user.id===a.tenantId)return'admin';
 const tm=await a.db.prepare(`SELECT role FROM tenant_members WHERE tenant_owner_id=? AND user_id=? AND status='active' LIMIT 1`).bind(a.tenantId,a.user.id).first();
 return tm?.role||null;
}
async function canWrite(a,pc){const role=await orgRole(a);return a.user.id===a.tenantId||['superadmin','enterprise'].includes(a.user.role)||['admin','manager'].includes(role)||['owner','manager'].includes(pc.projectRole)}
function safeSettings(v){if(!v||typeof v!=='object'||Array.isArray(v))return null;const raw=JSON.stringify(v);if(raw.length>50000)return null;return v}
function parse(v){try{return JSON.parse(v||'{}')}catch{return{}}}

async function readAll(a,projectId,pc){
 const rows=await a.db.prepare(`SELECT section_key,settings_json,status,updated_at,updated_by,project_id FROM trace_configuration_settings WHERE tenant_id=? AND (project_id=? OR project_id IS NULL) ORDER BY section_key`).bind(a.tenantId,projectId).all();
 const settings={};for(const r of rows.results||[]){if(TENANT_SECTIONS.has(r.section_key)&&r.project_id!==null)continue;if(!TENANT_SECTIONS.has(r.section_key)&&r.project_id===null)continue;settings[r.section_key]={values:parse(r.settings_json),status:r.status,updatedAt:r.updated_at,updatedBy:r.updated_by}}
 return json({ok:true,data:{project:pc.project,settings}});
}
async function writeSection(request,a,projectId,pc,section){
 if(!SECTIONS.has(section))return json({ok:false,error:'invalid_section'},404);
 if(!(await canWrite(a,pc)))return json({ok:false,error:'forbidden',message:'No tienes permisos para modificar la configuración.'},403);
 let body={};try{body=await request.json()}catch{return json({ok:false,error:'invalid_json'},400)}
 const values=safeSettings(body.values);if(!values)return json({ok:false,error:'invalid_settings',message:'La configuración enviada no es válida.'},422);
 const scopedProjectId=TENANT_SECTIONS.has(section)?null:projectId;
 const existing=await a.db.prepare(`SELECT id,settings_json FROM trace_configuration_settings WHERE tenant_id=? AND section_key=? AND ${scopedProjectId===null?'project_id IS NULL':'project_id=?'} LIMIT 1`).bind(...(scopedProjectId===null?[a.tenantId,section]:[a.tenantId,section,scopedProjectId])).first();
 const before=existing?parse(existing.settings_json):null;
 if(existing){await a.db.prepare(`UPDATE trace_configuration_settings SET settings_json=?,status='configured',updated_by=?,updated_at=datetime('now') WHERE id=?`).bind(JSON.stringify(values),a.user.id,existing.id).run()}
 else{await a.db.prepare(`INSERT INTO trace_configuration_settings (id,tenant_id,project_id,section_key,settings_json,status,created_by,created_at,updated_by,updated_at) VALUES (?,?,?,?,?,'configured',?,datetime('now'),?,datetime('now'))`).bind(uuid(),a.tenantId,scopedProjectId,section,JSON.stringify(values),a.user.id,a.user.id).run()}
 await a.db.prepare(`INSERT INTO trace_configuration_audit_events (id,tenant_id,project_id,section_key,action,actor_user_id,before_json,after_json,created_at) VALUES (?,?,?,?, 'configuration.updated',?,?,?,datetime('now'))`).bind(uuid(),a.tenantId,scopedProjectId,section,a.user.id,before?JSON.stringify(before):null,JSON.stringify(values)).run();
 return json({ok:true,data:{section,values,status:'configured'}},200);
}
export async function handleTraceV1ConfigurationApi(request,env){
 const url=new URL(request.url);const m=url.pathname.match(/^\/api\/trace\/v1\/admin\/projects\/([^/]+)\/configuration(?:\/([^/]+))?$/);if(!m)return null;
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});
 const a=await auth(request,env);if(!a)return json({ok:false,error:'unauthorized'},401);
 const projectId=decodeURIComponent(m[1]),section=m[2]?decodeURIComponent(m[2]):null;const pc=await projectContext(a,projectId);if(!pc)return json({ok:false,error:'project_not_found_or_forbidden'},404);
 if(!section&&request.method==='GET')return readAll(a,projectId,pc);
 if(section&&request.method==='PUT')return writeSection(request,a,projectId,pc,section);
 return json({ok:false,error:'method_not_allowed'},405);
}
