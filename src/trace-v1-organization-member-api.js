import jwt from "@tsndr/cloudflare-worker-jwt";
import { getTraceDatabase } from "./trace/shared/database.js";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization"};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});
const uuid=()=>crypto.randomUUID();
const email=v=>String(v||"").trim().toLowerCase();
function phone(v){
 const raw=String(v||'').trim();if(!raw)return null;
 const digits=raw.replace(/\D/g,'');
 if(/^\+?[1-9]\d{7,14}$/.test(raw.replace(/[\s().-]/g,''))&&raw.startsWith('+'))return `+${digits}`;
 if(/^1(?:809|829|849)\d{7}$/.test(digits))return `+${digits}`;
 if(/^(809|829|849)\d{7}$/.test(digits))return `+1${digits}`;
 return null;
}
const ACCOUNT_ROLES=new Set(['admin','manager','operator','viewer']);

async function context(request,env){
 const h=request.headers.get('Authorization')||'';if(!h.startsWith('Bearer '))return null;
 const token=h.slice(7).trim();let ok=false;try{ok=await jwt.verify(token,env.JWT_SECRET||'changeme-set-in-cloudflare-dashboard')}catch{return null}if(!ok)return null;
 const p=jwt.decode(token)?.payload||{};if((p.session_type||'standard')!=='standard')return null;
 const userId=p.user_id||p.userId||p.id||p.sub;if(!userId)return null;
 const db=getTraceDatabase(env);const user=await db.prepare(`SELECT id,email,role,plan,enterprise_id,is_active FROM users WHERE id=? LIMIT 1`).bind(userId).first();
 if(!user||Number(user.is_active)!==1)return null;return{db,user,tenantId:user.enterprise_id||user.id};
}
async function canManage(c,projectId){
 const project=await c.db.prepare(`SELECT id FROM trace_assets WHERE id=? AND tenant_id=? AND asset_type='project' LIMIT 1`).bind(projectId,c.tenantId).first();if(!project)return false;
 if(c.user.id===c.tenantId||['superadmin','enterprise'].includes(c.user.role))return true;
 const pp=await c.db.prepare(`SELECT project_role FROM trace_project_participants WHERE tenant_id=? AND project_id=? AND user_id=? AND status='active' LIMIT 1`).bind(c.tenantId,projectId,c.user.id).first();
 return ['owner','manager'].includes(pp?.project_role);
}

async function addOrganizationMember(request,env,projectId){
 const c=await context(request,env);if(!c)return json({ok:false,error:'unauthorized'},401);if(!(await canManage(c,projectId)))return json({ok:false,error:'forbidden'},403);
 let b={};try{b=await request.json()}catch{return json({ok:false,error:'invalid_json'},400)}
 const memberEmail=email(b.email),phoneE164=phone(b.phone),accountRole=ACCOUNT_ROLES.has(b.accountRole)?b.accountRole:'operator',departmentId=String(b.departmentId||'').trim()||null;
 if(!memberEmail||!memberEmail.includes('@'))return json({ok:false,error:'valid_email_required',message:'Indica un correo válido.'},422);
 if(!phoneE164)return json({ok:false,error:'valid_phone_required',message:'Indica un teléfono válido. En República Dominicana puedes escribir 809, 829 o 849 sin +1; KAWVO lo normaliza automáticamente.'},422);
 if(departmentId){const dep=await c.db.prepare(`SELECT id FROM trace_departments WHERE id=? AND tenant_id=? AND status='active' LIMIT 1`).bind(departmentId,c.tenantId).first();if(!dep)return json({ok:false,error:'department_not_found',message:'El departamento seleccionado no pertenece a la organización.'},422)}
 const tenant=await c.db.prepare(`SELECT id,plan FROM users WHERE id=? AND is_active=1 LIMIT 1`).bind(c.tenantId).first();if(!tenant)return json({ok:false,error:'tenant_not_found'},404);
 const plan=await c.db.prepare(`SELECT plan FROM plan_configs WHERE plan=? LIMIT 1`).bind(tenant.plan).first();if(!plan)return json({ok:false,error:'tenant_plan_invalid',message:'El plan de la organización no está configurado correctamente.'},409);
 let user=await c.db.prepare(`SELECT id,email,enterprise_id,phone_e164,is_active FROM users WHERE lower(email)=lower(?) LIMIT 1`).bind(memberEmail).first();
 if(user&&user.id!==c.tenantId&&user.enterprise_id!==c.tenantId)return json({ok:false,error:'identity_conflict',message:'Ese correo ya pertenece a otra organización.'},409);
 const byPhone=await c.db.prepare(`SELECT id,email,enterprise_id FROM users WHERE phone_e164=? LIMIT 1`).bind(phoneE164).first();if(byPhone&&(!user||byPhone.id!==user.id))return json({ok:false,error:'phone_in_use',message:'Ese teléfono ya está vinculado a otra cuenta.'},409);
 if(!user){
  const id=uuid(),disabled=`disabled:${uuid()}:${uuid()}`;
  await c.db.prepare(`INSERT INTO users (id,email,password_hash,role,plan,enterprise_id,is_active,phone_e164,credentials_support_required,created_at,updated_at) VALUES (?,?,?,'tenant',?,?,1,?,1,datetime('now'),datetime('now'))`).bind(id,memberEmail,disabled,tenant.plan,c.tenantId,phoneE164).run();
  user={id,email:memberEmail,enterprise_id:c.tenantId,phone_e164:phoneE164,is_active:1};
 }else{
  await c.db.prepare(`UPDATE users SET enterprise_id=COALESCE(enterprise_id,?),phone_e164=?,is_active=1,credentials_support_required=1,updated_at=datetime('now') WHERE id=?`).bind(c.tenantId,phoneE164,user.id).run();
 }
 let tm=await c.db.prepare(`SELECT id FROM tenant_members WHERE tenant_owner_id=? AND lower(email)=lower(?) LIMIT 1`).bind(c.tenantId,memberEmail).first();
 if(!tm){const id=uuid();await c.db.prepare(`INSERT INTO tenant_members (id,tenant_owner_id,user_id,email,role,status,invited_at,joined_at,invited_by) VALUES (?,?,?,?,?,'active',datetime('now'),datetime('now'),?)`).bind(id,c.tenantId,user.id,memberEmail,accountRole,c.user.id).run();tm={id}}else await c.db.prepare(`UPDATE tenant_members SET user_id=?,role=?,status='active',joined_at=COALESCE(joined_at,datetime('now')),invited_by=? WHERE id=?`).bind(user.id,accountRole,c.user.id,tm.id).run();
 if(departmentId)await c.db.prepare(`INSERT INTO trace_department_members (id,tenant_id,department_id,user_id,membership_role,is_primary,status,created_by,created_at,updated_at) VALUES (?,?,?,?, 'member',0,'active',?,datetime('now'),datetime('now')) ON CONFLICT(department_id,user_id) DO UPDATE SET status='active',updated_at=datetime('now')`).bind(uuid(),c.tenantId,departmentId,user.id,c.user.id).run();
 return json({ok:true,message:'Miembro agregado correctamente a la organización.',data:{memberId:tm.id,userId:user.id,email:memberEmail,phone:phoneE164,accountRole,departmentId,projectMembership:false}},201);
}

export async function handleTraceV1OrganizationMemberApi(request,env){
 const url=new URL(request.url),m=url.pathname.match(/^\/api\/trace\/v1\/admin\/projects\/([^/]+)\/team\/organization-members$/);if(!m)return null;
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});if(request.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
 return addOrganizationMember(request,env,decodeURIComponent(m[1]));
}
