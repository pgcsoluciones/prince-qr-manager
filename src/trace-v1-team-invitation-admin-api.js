import jwt from "@tsndr/cloudflare-worker-jwt";
import { getTraceDatabase } from "./trace/shared/database.js";
import { createTeamInvitationClaim } from "./trace-v1-team-invitation-claim-api.js";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization"};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});
const uuid=()=>crypto.randomUUID();
const email=v=>String(v||"").trim().toLowerCase();
const phone=v=>{const s=String(v||"").replace(/[^\d+]/g,"");return s&&/^\+[1-9]\d{7,14}$/.test(s)?s:null};
const ROLES=new Set(['owner','manager','supervisor','member','observer']);
const titleCase=v=>String(v||'').replace(/[._-]+/g,' ').replace(/\s+/g,' ').trim().split(' ').filter(Boolean).map(x=>x.charAt(0).toUpperCase()+x.slice(1)).join(' ');
function inviterName(user){const local=String(user?.email||'').split('@')[0];return titleCase(local)||'Un responsable'}
function companyFromProject(project){let meta={};try{meta=JSON.parse(project?.metadata_json||'{}')}catch{}return String(meta.company||meta.companyName||meta.enterprise||'').trim()||null}

async function context(request,env){const h=request.headers.get('Authorization')||'';if(!h.startsWith('Bearer '))return null;let ok=false;const token=h.slice(7).trim();try{ok=await jwt.verify(token,env.JWT_SECRET||'changeme-set-in-cloudflare-dashboard')}catch{return null}if(!ok)return null;const p=jwt.decode(token)?.payload||{};if((p.session_type||'standard')!=='standard')return null;const userId=p.user_id||p.userId||p.id||p.sub;if(!userId)return null;const db=getTraceDatabase(env);const user=await db.prepare(`SELECT id,email,role,enterprise_id,is_active FROM users WHERE id=? LIMIT 1`).bind(userId).first();if(!user||Number(user.is_active)!==1)return null;return{db,user,tenantId:user.enterprise_id||user.id}}
async function canManage(c,projectId){const p=await c.db.prepare(`SELECT id FROM trace_assets WHERE id=? AND tenant_id=? AND asset_type='project' LIMIT 1`).bind(projectId,c.tenantId).first();if(!p)return false;if(c.user.id===c.tenantId||['superadmin','enterprise'].includes(c.user.role))return true;const pp=await c.db.prepare(`SELECT project_role FROM trace_project_participants WHERE tenant_id=? AND project_id=? AND user_id=? AND status='active' LIMIT 1`).bind(c.tenantId,projectId,c.user.id).first();return ['owner','manager'].includes(pp?.project_role)}

async function createInvite(request,env,projectId){
 const c=await context(request,env);if(!c)return json({ok:false,error:'unauthorized'},401);if(!(await canManage(c,projectId)))return json({ok:false,error:'forbidden'},403);
 let b={};try{b=await request.json()}catch{return json({ok:false,error:'invalid_json'},400)}
 const inviteEmail=email(b.email),requestedPhone=phone(b.phone),projectRole=ROLES.has(b.projectRole)?b.projectRole:'member',departmentId=String(b.departmentId||'').trim()||null;
 if(!inviteEmail||!inviteEmail.includes('@'))return json({ok:false,error:'valid_email_required'},422);if(b.phone&&!requestedPhone)return json({ok:false,error:'valid_phone_required',message:'El teléfono debe incluir código de país, por ejemplo +18095550000.'},422);
 const project=await c.db.prepare(`SELECT id,name,metadata_json FROM trace_assets WHERE id=? AND tenant_id=? AND asset_type='project' LIMIT 1`).bind(projectId,c.tenantId).first();if(!project)return json({ok:false,error:'project_not_found'},404);
 const orgMember=await c.db.prepare(`SELECT tm.id tenant_member_id,tm.role account_role,tm.status,u.id user_id,u.email,u.phone_e164 FROM tenant_members tm JOIN users u ON u.id=tm.user_id WHERE tm.tenant_owner_id=? AND lower(tm.email)=lower(?) AND tm.status='active' AND u.is_active=1 AND (u.id=? OR u.enterprise_id=?) LIMIT 1`).bind(c.tenantId,inviteEmail,c.tenantId,c.tenantId).first();
 if(!orgMember)return json({ok:false,error:'organization_member_required',message:'Esta persona todavía no pertenece a la organización. Agrégala primero desde Gestionar equipo → Agregar miembro manualmente.'},409);
 const phoneE164=orgMember.phone_e164||requestedPhone;if(!phoneE164)return json({ok:false,error:'organization_member_phone_required',message:'Este miembro no tiene teléfono registrado. Actualiza sus datos antes de generar la invitación.'},422);
 if(requestedPhone&&orgMember.phone_e164&&requestedPhone!==orgMember.phone_e164)return json({ok:false,error:'phone_mismatch',message:'El teléfono indicado no coincide con el registrado para este miembro.'},422);
 if(departmentId){const dep=await c.db.prepare(`SELECT id FROM trace_departments WHERE id=? AND tenant_id=? AND status='active' LIMIT 1`).bind(departmentId,c.tenantId).first();if(!dep)return json({ok:false,error:'department_not_found'},422)}
 const prior=await c.db.prepare(`SELECT id FROM trace_project_team_invitations WHERE tenant_id=? AND project_id=? AND lower(email)=lower(?) LIMIT 1`).bind(c.tenantId,projectId,inviteEmail).first();
 const invitationId=prior?.id||uuid(),metadata=JSON.stringify({accountRole:orgMember.account_role,userId:orgMember.user_id});
 if(prior)await c.db.prepare(`UPDATE trace_project_team_invitations SET project_role=?,department_id=?,tenant_member_id=?,phone_e164=?,status='pending',invited_by=?,invited_at=datetime('now'),accepted_at=NULL,metadata_json=? WHERE id=?`).bind(projectRole,departmentId,orgMember.tenant_member_id,phoneE164,c.user.id,metadata,invitationId).run();
 else await c.db.prepare(`INSERT INTO trace_project_team_invitations (id,tenant_id,project_id,email,project_role,department_id,tenant_member_id,status,invited_by,invited_at,metadata_json,phone_e164) VALUES (?,?,?,?,?,?,?,'pending',?,datetime('now'),?,?)`).bind(invitationId,c.tenantId,projectId,inviteEmail,projectRole,departmentId,orgMember.tenant_member_id,c.user.id,metadata,phoneE164).run();
 const claim=await createTeamInvitationClaim(c.db,{tenantId:c.tenantId,projectId,invitationId,createdBy:c.user.id,phoneE164,channel:'whatsapp',hours:48});
 return json({ok:true,data:{mode:'invited',invitationId,email:inviteEmail,phone:phoneE164,projectRole,inviterName:inviterName(c.user),companyName:companyFromProject(project),projectName:project.name,...claim}},201);
}

export async function handleTraceV1TeamInvitationAdminApi(request,env){const url=new URL(request.url),m=url.pathname.match(/^\/api\/trace\/v1\/admin\/projects\/([^/]+)\/team\/invitations$/);if(!m)return null;if(request.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});if(request.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);return createInvite(request,env,decodeURIComponent(m[1]))}
