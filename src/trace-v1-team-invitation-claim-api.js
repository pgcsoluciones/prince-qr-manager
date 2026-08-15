import jwt from "@tsndr/cloudflare-worker-jwt";
import { getTraceDatabase } from "./trace/shared/database.js";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization"};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});
const uuid=()=>crypto.randomUUID();
const txt=(v,n=255)=>{const s=String(v??"").trim();return s?s.slice(0,n):null};
const normPhone=v=>{const s=String(v||"").replace(/[^\d+]/g,"");return /^\+[1-9]\d{7,14}$/.test(s)?s:null};
const normEmail=v=>String(v||"").trim().toLowerCase();

function b64(bytes){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}
function opaque(){const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return `ktr_${b64(bytes)}`}
function code(){const v=new Uint32Array(1);crypto.getRandomValues(v);return String(v[0]%1000000).padStart(6,"0")}
async function sha256(v){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(v)));return Array.from(new Uint8Array(d)).map(x=>x.toString(16).padStart(2,"0")).join("")}
const sqlDate=d=>d.toISOString().replace("T"," ").replace(/\.\d{3}Z$/,"");
const maskEmail=e=>{const [a,b]=String(e||"").split("@");return b?`${a.slice(0,2)}***@${b}`:null};
const maskPhone=p=>p?`***${String(p).slice(-4)}`:null;

async function adminContext(request,env){const h=request.headers.get("Authorization")||"";if(!h.startsWith("Bearer "))return null;let ok=false;const token=h.slice(7).trim();try{ok=await jwt.verify(token,env.JWT_SECRET||"changeme-set-in-cloudflare-dashboard")}catch{return null}if(!ok)return null;const p=jwt.decode(token)?.payload||{};if((p.session_type||"standard")!=="standard")return null;const userId=p.user_id||p.userId||p.id||p.sub;if(!userId)return null;const db=getTraceDatabase(env);const user=await db.prepare(`SELECT id,email,role,enterprise_id,is_active FROM users WHERE id=? LIMIT 1`).bind(userId).first();if(!user||Number(user.is_active)!==1)return null;return{db,user,tenantId:user.enterprise_id||user.id}}
async function canManage(c,projectId){const project=await c.db.prepare(`SELECT id FROM trace_assets WHERE id=? AND tenant_id=? AND asset_type='project' LIMIT 1`).bind(projectId,c.tenantId).first();if(!project)return false;if(c.user.id===c.tenantId||['superadmin','enterprise'].includes(c.user.role))return true;const pp=await c.db.prepare(`SELECT project_role FROM trace_project_participants WHERE tenant_id=? AND project_id=? AND user_id=? AND status='active' LIMIT 1`).bind(c.tenantId,projectId,c.user.id).first();return ['owner','manager'].includes(pp?.project_role)}

export async function createTeamInvitationClaim(db,{tenantId,projectId,invitationId,createdBy,phoneE164=null,channel="manual",hours=48}){
 const token=opaque(),otp=code(),tokenHash=await sha256(token),codeHash=await sha256(otp),expiresAt=sqlDate(new Date(Date.now()+hours*3600000));
 await db.prepare(`UPDATE trace_project_team_invitation_claims SET status='revoked',revoked_at=datetime('now'),updated_at=datetime('now') WHERE invitation_id=? AND status IN ('pending','verified')`).bind(invitationId).run();
 await db.prepare(`INSERT INTO trace_project_team_invitation_claims (id,tenant_id,project_id,invitation_id,token_hash,code_hash,verification_channel,phone_e164,status,attempt_count,max_attempts,expires_at,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?, 'pending',0,5,?,?,datetime('now'),datetime('now')) ON CONFLICT(invitation_id) DO UPDATE SET token_hash=excluded.token_hash,code_hash=excluded.code_hash,verification_channel=excluded.verification_channel,phone_e164=excluded.phone_e164,status='pending',attempt_count=0,max_attempts=5,expires_at=excluded.expires_at,verified_at=NULL,consumed_at=NULL,revoked_at=NULL,created_by=excluded.created_by,updated_at=datetime('now')`).bind(uuid(),tenantId,projectId,invitationId,tokenHash,codeHash,channel,phoneE164,expiresAt,createdBy).run();
 await db.prepare(`UPDATE trace_project_team_invitations SET phone_e164=?,expires_at=?,status='pending',invited_at=datetime('now') WHERE id=?`).bind(phoneE164,expiresAt,invitationId).run();
 return{token,code:otp,expiresAt,acceptPath:`/trace/invite/${encodeURIComponent(token)}`,channel};
}

async function claimByToken(env,rawToken){if(!/^ktr_[A-Za-z0-9_-]{40,}$/.test(rawToken||""))return null;const db=getTraceDatabase(env),hash=await sha256(rawToken);const row=await db.prepare(`SELECT c.*,i.email,i.project_role,i.department_id,i.tenant_member_id,i.status invitation_status,i.metadata_json,a.name project_name FROM trace_project_team_invitation_claims c JOIN trace_project_team_invitations i ON i.id=c.invitation_id JOIN trace_assets a ON a.id=c.project_id WHERE c.token_hash=? LIMIT 1`).bind(hash).first();return row?{db,row}:null}
function live(row){if(!row||!['pending','verified'].includes(row.status)||row.invitation_status!=='pending')return false;const exp=new Date(`${row.expires_at}Z`);return !Number.isNaN(exp.getTime())&&exp>new Date()}

async function inspect(env,token){const found=await claimByToken(env,token);if(!found||!live(found.row))return json({ok:false,error:'invite_invalid_or_expired'},410);const r=found.row;return json({ok:true,data:{projectName:r.project_name,role:r.project_role,emailHint:maskEmail(r.email),phoneHint:maskPhone(r.phone_e164),channel:r.verification_channel,expiresAt:r.expires_at,requiresPhone:Boolean(r.phone_e164)}})}

async function accept(request,env,token){const found=await claimByToken(env,token);if(!found||!live(found.row))return json({ok:false,error:'invite_invalid_or_expired'},410);const{db,row:r}=found;let b={};try{b=await request.json()}catch{return json({ok:false,error:'invalid_json'},400)}const providedCode=String(b.code||"").trim(),providedPhone=normPhone(b.phone);
 if(!/^\d{6}$/.test(providedCode))return json({ok:false,error:'code_required'},422);
 if(r.phone_e164&&providedPhone!==r.phone_e164)return json({ok:false,error:'phone_mismatch',message:'El número no coincide con la invitación.'},422);
 const hash=await sha256(providedCode);if(hash!==r.code_hash){const attempts=Number(r.attempt_count||0)+1,status=attempts>=Number(r.max_attempts||5)?'blocked':'pending';await db.prepare(`UPDATE trace_project_team_invitation_claims SET attempt_count=?,status=?,updated_at=datetime('now') WHERE id=?`).bind(attempts,status,r.id).run();return json({ok:false,error:status==='blocked'?'invite_blocked':'invalid_code',attemptsRemaining:Math.max(0,Number(r.max_attempts||5)-attempts)},status==='blocked'?423:422)}
 await db.prepare(`UPDATE trace_project_team_invitation_claims SET status='verified',verified_at=COALESCE(verified_at,datetime('now')),updated_at=datetime('now') WHERE id=? AND status IN ('pending','verified')`).bind(r.id).run();
 const email=normEmail(r.email);let user=await db.prepare(`SELECT id,email,phone_e164,enterprise_id FROM users WHERE lower(email)=lower(?) LIMIT 1`).bind(email).first();
 if(!user&&providedPhone)user=await db.prepare(`SELECT id,email,phone_e164,enterprise_id FROM users WHERE phone_e164=? LIMIT 1`).bind(providedPhone).first();
 if(user&&user.enterprise_id&&user.enterprise_id!==r.tenant_id)return json({ok:false,error:'identity_conflict'},409);
 if(user&&normEmail(user.email)!==email)return json({ok:false,error:'identity_conflict'},409);
 if(!user){const id=uuid(),disabled=`disabled:${await sha256(opaque())}`;try{await db.prepare(`INSERT INTO users (id,email,password_hash,role,plan,enterprise_id,is_active,phone_e164,phone_verified_at,credentials_support_required,created_at,updated_at) VALUES (?,?,?,'tenant','free',?,1,?,datetime('now'),1,datetime('now'),datetime('now'))`).bind(id,email,disabled,r.tenant_id,providedPhone||r.phone_e164||null).run();user={id,email,phone_e164:providedPhone||r.phone_e164||null,enterprise_id:r.tenant_id}}catch(e){return json({ok:false,error:'identity_create_failed',message:String(e?.message||e)},409)}}
 else if((providedPhone||r.phone_e164)&&!user.phone_e164){await db.prepare(`UPDATE users SET phone_e164=?,phone_verified_at=datetime('now'),updated_at=datetime('now') WHERE id=?`).bind(providedPhone||r.phone_e164,user.id).run()}
 let meta={};try{meta=JSON.parse(r.metadata_json||'{}')}catch{}const tenantRole=['owner','admin','manager','operator','viewer'].includes(meta.accountRole)?meta.accountRole:'operator';
 await db.batch([
  db.prepare(`UPDATE tenant_members SET user_id=?,role=?,status='active',joined_at=COALESCE(joined_at,datetime('now')) WHERE id=?`).bind(user.id,tenantRole,r.tenant_member_id),
  db.prepare(`INSERT INTO trace_project_participants (id,tenant_id,project_id,user_id,project_role,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,'active',?,datetime('now'),datetime('now')) ON CONFLICT(project_id,user_id) WHERE user_id IS NOT NULL DO UPDATE SET project_role=excluded.project_role,status='active',updated_at=datetime('now')`).bind(uuid(),r.tenant_id,r.project_id,user.id,r.project_role,r.created_by),
  db.prepare(`UPDATE trace_project_team_invitations SET status='accepted',accepted_at=datetime('now') WHERE id=? AND status='pending'`).bind(r.invitation_id),
  db.prepare(`UPDATE trace_project_team_invitation_claims SET status='consumed',consumed_at=datetime('now'),updated_at=datetime('now') WHERE id=? AND status='verified'`).bind(r.id)
 ]);
 if(r.department_id)await db.prepare(`INSERT INTO trace_department_members (id,tenant_id,department_id,user_id,membership_role,status,created_by,created_at,updated_at) VALUES (?,?,?,?, 'member','active',?,datetime('now'),datetime('now')) ON CONFLICT(department_id,user_id) DO UPDATE SET status='active',updated_at=datetime('now')`).bind(uuid(),r.tenant_id,r.department_id,user.id,r.created_by).run();
 return json({ok:true,data:{accepted:true,projectId:r.project_id,projectName:r.project_name,projectRole:r.project_role,userId:user.id,access:{method:(providedPhone||r.phone_e164)?'phone_otp':'email_otp',identifier:(providedPhone||r.phone_e164)||email},credentialsSupportRequired:true}})
}

async function adminRegenerate(request,env,projectId,inviteId){const c=await adminContext(request,env);if(!c)return json({ok:false,error:'unauthorized'},401);if(!(await canManage(c,projectId)))return json({ok:false,error:'forbidden'},403);const invite=await c.db.prepare(`SELECT id,phone_e164,status FROM trace_project_team_invitations WHERE id=? AND tenant_id=? AND project_id=? LIMIT 1`).bind(inviteId,c.tenantId,projectId).first();if(!invite||invite.status!=='pending')return json({ok:false,error:'pending_invitation_not_found'},404);const claim=await createTeamInvitationClaim(c.db,{tenantId:c.tenantId,projectId,invitationId:invite.id,createdBy:c.user.id,phoneE164:invite.phone_e164||null});return json({ok:true,data:claim})}
async function adminRevoke(request,env,projectId,inviteId){const c=await adminContext(request,env);if(!c)return json({ok:false,error:'unauthorized'},401);if(!(await canManage(c,projectId)))return json({ok:false,error:'forbidden'},403);await c.db.batch([c.db.prepare(`UPDATE trace_project_team_invitations SET status='revoked' WHERE id=? AND tenant_id=? AND project_id=? AND status='pending'`).bind(inviteId,c.tenantId,projectId),c.db.prepare(`UPDATE trace_project_team_invitation_claims SET status='revoked',revoked_at=datetime('now'),updated_at=datetime('now') WHERE invitation_id=? AND status IN ('pending','verified')`).bind(inviteId)]);return json({ok:true})}

export async function handleTraceV1TeamInvitationClaimApi(request,env){const url=new URL(request.url);if(request.method==='OPTIONS'&&(url.pathname.startsWith('/api/trace/v1/public/team-invitations/')||url.pathname.includes('/team/invitations/')))return new Response(null,{status:204,headers:CORS});
 let m=url.pathname.match(/^\/api\/trace\/v1\/public\/team-invitations\/([^/]+)(?:\/(accept))?$/);if(m){const token=decodeURIComponent(m[1]);if(!m[2]&&request.method==='GET')return inspect(env,token);if(m[2]==='accept'&&request.method==='POST')return accept(request,env,token);return json({ok:false,error:'method_not_allowed'},405)}
 m=url.pathname.match(/^\/api\/trace\/v1\/admin\/projects\/([^/]+)\/team\/invitations\/([^/]+)\/(regenerate|revoke)$/);if(m&&request.method==='POST'){const projectId=decodeURIComponent(m[1]),inviteId=decodeURIComponent(m[2]);return m[3]==='regenerate'?adminRegenerate(request,env,projectId,inviteId):adminRevoke(request,env,projectId,inviteId)}
 return null}
