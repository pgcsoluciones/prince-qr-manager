import jwt from "@tsndr/cloudflare-worker-jwt";
import { getTraceDatabase } from "./trace/shared/database.js";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization"};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});
const uuid=()=>crypto.randomUUID();
const clean=(v,n=500)=>String(v??'').trim().slice(0,n);
const PROJECT_ROLES=new Set(['owner','manager','supervisor','member','observer']);
const ORG_ROLES=new Set(['admin','manager','operator','viewer']);

async function auth(request,env){
 const h=request.headers.get('Authorization')||'';if(!h.startsWith('Bearer '))return null;
 let ok=false;const token=h.slice(7).trim();try{ok=await jwt.verify(token,env.JWT_SECRET||'changeme-set-in-cloudflare-dashboard')}catch{return null}if(!ok)return null;
 const p=jwt.decode(token)?.payload||{};if((p.session_type||'standard')!=='standard')return null;
 const userId=p.user_id||p.userId||p.id||p.sub;if(!userId)return null;
 const db=getTraceDatabase(env);const user=await db.prepare(`SELECT id,email,role,enterprise_id,is_active FROM users WHERE id=? LIMIT 1`).bind(userId).first();
 if(!user||Number(user.is_active)!==1)return null;return{db,user,tenantId:user.enterprise_id||user.id};
}
async function projectContext(a,projectId){
 const project=await a.db.prepare(`SELECT id,name FROM trace_assets WHERE id=? AND tenant_id=? AND asset_type='project' LIMIT 1`).bind(projectId,a.tenantId).first();if(!project)return null;
 const pp=await a.db.prepare(`SELECT project_role FROM trace_project_participants WHERE tenant_id=? AND project_id=? AND user_id=? AND status='active' LIMIT 1`).bind(a.tenantId,projectId,a.user.id).first();
 if(a.user.id!==a.tenantId&&!pp&&!['superadmin','enterprise'].includes(a.user.role))return null;
 return{project,projectRole:pp?.project_role||'owner'};
}
async function actorOrgRole(a){
 if(a.user.id===a.tenantId)return'admin';
 const tm=await a.db.prepare(`SELECT role FROM tenant_members WHERE tenant_owner_id=? AND user_id=? AND status='active' LIMIT 1`).bind(a.tenantId,a.user.id).first();
 return tm?.role||null;
}
async function canEvaluate(a,projectId,pc){
 const orgRole=await actorOrgRole(a);
 if(a.user.id===a.tenantId||['admin','manager'].includes(orgRole)||['owner','manager','supervisor'].includes(pc.projectRole))return{ok:true,role:orgRole||pc.projectRole||'owner'};
 const lead=await a.db.prepare(`SELECT 1 ok FROM trace_work_groups g LEFT JOIN trace_work_group_members gm ON gm.work_group_id=g.id AND gm.user_id=? AND gm.status='active' WHERE g.tenant_id=? AND g.project_id=? AND g.status='active' AND (g.responsible_user_id=? OR gm.group_role='lead') LIMIT 1`).bind(a.user.id,a.tenantId,projectId,a.user.id).first();
 return{ok:Boolean(lead),role:lead?'team_lead':null};
}
async function audit(db,{tenantId,projectId=null,entityType,entityId,eventType,actorUserId=null,metadata={}}){
 try{await db.prepare(`INSERT INTO trace_team_audit_events (id,tenant_id,project_id,entity_type,entity_id,event_type,actor_user_id,metadata_json,created_at) VALUES (?,?,?,?,?,?,?,?,datetime('now'))`).bind(uuid(),tenantId,projectId,entityType,entityId,eventType,actorUserId,JSON.stringify(metadata)).run()}catch{}
}
async function directory(a,projectId,pc){
 const rows=await a.db.prepare(`
 SELECT u.id user_id,u.email,u.phone_e164,u.is_active,
        tm.id tenant_member_id,COALESCE(tm.role,CASE WHEN u.id=? THEN 'admin' END) organization_role,
        COALESCE(tm.status,CASE WHEN u.id=? THEN 'active' END) organization_status,
        tm.invited_at organization_invited_at,tm.joined_at organization_joined_at,tm.invited_by organization_invited_by,
        pp.id participant_id,pp.project_role,pp.status project_status,pp.created_at project_joined_at,pp.created_by project_added_by,
        i.status invitation_status,i.invited_at project_invited_at,i.accepted_at project_accepted_at,i.invited_by project_invited_by,
        GROUP_CONCAT(DISTINCT d.id||':'||d.name) departments,
        ROUND((SELECT AVG(me.score) FROM trace_member_evaluations me WHERE me.tenant_id=? AND me.member_user_id=u.id),2) average_score,
        ROUND((SELECT AVG(me.score) FROM trace_member_evaluations me WHERE me.tenant_id=? AND me.member_user_id=u.id AND me.project_id=?),2) project_score,
        (SELECT COUNT(DISTINCT pp2.project_id) FROM trace_project_participants pp2 WHERE pp2.tenant_id=? AND pp2.user_id=u.id AND pp2.status='active') project_count,
        (SELECT COUNT(*) FROM trace_member_evaluations me WHERE me.tenant_id=? AND me.member_user_id=u.id) evaluation_count
 FROM users u
 LEFT JOIN tenant_members tm ON tm.tenant_owner_id=? AND tm.user_id=u.id
 LEFT JOIN trace_project_participants pp ON pp.tenant_id=? AND pp.project_id=? AND pp.user_id=u.id
 LEFT JOIN trace_project_team_invitations i ON i.tenant_id=? AND i.project_id=? AND lower(i.email)=lower(u.email)
 LEFT JOIN trace_department_members dm ON dm.tenant_id=? AND dm.user_id=u.id AND dm.status='active'
 LEFT JOIN trace_departments d ON d.id=dm.department_id AND d.tenant_id=? AND d.status='active'
 WHERE (u.id=? OR u.enterprise_id=?)
 GROUP BY u.id
 ORDER BY CASE WHEN pp.status='active' THEN 0 WHEN i.status='pending' THEN 1 ELSE 2 END,u.email
 `).bind(a.tenantId,a.tenantId,a.tenantId,a.tenantId,projectId,a.tenantId,a.tenantId,a.tenantId,a.tenantId,projectId,a.tenantId,projectId,a.tenantId,a.tenantId,a.tenantId,a.tenantId).all();
 const members=(rows.results||[]).map(r=>({
  ...r,
  departments:r.departments?String(r.departments).split(',').map(x=>{const p=x.indexOf(':');return{id:x.slice(0,p),name:x.slice(p+1)}}):[],
  state:Number(r.is_active)!==1||r.organization_status==='inactive'?'inactive':r.project_status==='active'?'active':r.invitation_status==='pending'?'invited':'available',
  average_score:r.average_score==null?null:Number(r.average_score),project_score:r.project_score==null?null:Number(r.project_score),project_count:Number(r.project_count||0),evaluation_count:Number(r.evaluation_count||0)
 }));
 const depts=await a.db.prepare(`SELECT d.id,d.name,d.description,d.created_at,d.created_by,u.email created_by_email,COUNT(DISTINCT dm.user_id) member_count FROM trace_departments d LEFT JOIN trace_department_members dm ON dm.department_id=d.id AND dm.status='active' LEFT JOIN users u ON u.id=d.created_by WHERE d.tenant_id=? AND d.status='active' GROUP BY d.id ORDER BY d.name`).bind(a.tenantId).all();
 const groups=await a.db.prepare(`SELECT g.id,g.name,g.description,g.responsible_user_id,g.scope_type,g.scope_id,g.created_at,u.email responsible_email,COUNT(DISTINCT gm.user_id) member_count FROM trace_work_groups g LEFT JOIN users u ON u.id=g.responsible_user_id LEFT JOIN trace_work_group_members gm ON gm.work_group_id=g.id AND gm.status='active' WHERE g.tenant_id=? AND g.project_id=? AND g.status='active' GROUP BY g.id ORDER BY g.name`).bind(a.tenantId,projectId).all();
 const evalPerm=await canEvaluate(a,projectId,pc);
 return json({ok:true,data:{project:pc.project,viewer:{userId:a.user.id,projectRole:pc.projectRole,canEvaluate:evalPerm.ok},summary:{organizationMembers:members.filter(m=>m.organization_status==='active').length,projectMembers:members.filter(m=>m.state==='active').length,available:members.filter(m=>m.state==='available').length,departments:(depts.results||[]).length},members,departments:depts.results||[],groups:groups.results||[]}});
}
async function profile(a,projectId,pc,userId){
 const member=await a.db.prepare(`SELECT u.id,u.email,u.phone_e164,u.is_active,tm.role organization_role,tm.status organization_status,tm.invited_at,tm.joined_at,tm.invited_by FROM users u LEFT JOIN tenant_members tm ON tm.tenant_owner_id=? AND tm.user_id=u.id WHERE u.id=? AND (u.id=? OR u.enterprise_id=?) LIMIT 1`).bind(a.tenantId,userId,a.tenantId,a.tenantId).first();if(!member)return json({ok:false,error:'member_not_found'},404);
 const projects=await a.db.prepare(`SELECT pp.project_id,p.name project_name,pp.project_role,pp.status,pp.created_at,ROUND(AVG(me.score),2) score,COUNT(me.id) evaluations FROM trace_project_participants pp JOIN trace_assets p ON p.id=pp.project_id LEFT JOIN trace_member_evaluations me ON me.member_user_id=pp.user_id AND me.project_id=pp.project_id AND me.tenant_id=pp.tenant_id WHERE pp.tenant_id=? AND pp.user_id=? GROUP BY pp.project_id ORDER BY pp.created_at DESC`).bind(a.tenantId,userId).all();
 const evaluations=await a.db.prepare(`SELECT me.id,me.project_id,p.name project_name,me.score,me.comment,me.evaluator_user_id,eu.email evaluator_email,me.evaluator_role,me.created_at FROM trace_member_evaluations me LEFT JOIN trace_assets p ON p.id=me.project_id LEFT JOIN users eu ON eu.id=me.evaluator_user_id WHERE me.tenant_id=? AND me.member_user_id=? ORDER BY me.created_at DESC LIMIT 100`).bind(a.tenantId,userId).all();
 const events=await a.db.prepare(`SELECT id,event_type,actor_user_id,metadata_json,created_at FROM trace_team_audit_events WHERE tenant_id=? AND entity_type IN ('member','project_membership') AND entity_id=? ORDER BY created_at DESC LIMIT 100`).bind(a.tenantId,userId).all();
 const derived=[];
 if(member.invited_at)derived.push({event_type:'organization_invited',created_at:member.invited_at});if(member.joined_at)derived.push({event_type:'organization_joined',created_at:member.joined_at});
 const avg=await a.db.prepare(`SELECT ROUND(AVG(score),2) average_score,COUNT(*) evaluation_count FROM trace_member_evaluations WHERE tenant_id=? AND member_user_id=?`).bind(a.tenantId,userId).first();
 const evalPerm=await canEvaluate(a,projectId,pc);
 return json({ok:true,data:{member,projects:projects.results||[],evaluations:evaluations.results||[],history:[...derived,...(events.results||[])].sort((x,y)=>String(y.created_at).localeCompare(String(x.created_at))),averageScore:avg?.average_score==null?null:Number(avg.average_score),evaluationCount:Number(avg?.evaluation_count||0),canEvaluate:evalPerm.ok}});
}
async function evaluate(request,a,projectId,pc,userId){
 const perm=await canEvaluate(a,projectId,pc);if(!perm.ok)return json({ok:false,error:'forbidden',message:'No tienes permisos para evaluar miembros en este proyecto.'},403);
 const target=await a.db.prepare(`SELECT id FROM users WHERE id=? AND is_active=1 AND (id=? OR enterprise_id=?) LIMIT 1`).bind(userId,a.tenantId,a.tenantId).first();if(!target)return json({ok:false,error:'member_not_found'},404);
 let b={};try{b=await request.json()}catch{return json({ok:false,error:'invalid_json'},400)}const score=Number(b.score),comment=clean(b.comment,1500)||null;if(!Number.isInteger(score)||score<1||score>5)return json({ok:false,error:'invalid_score',message:'La calificación debe estar entre 1 y 5 estrellas.'},422);
 const id=uuid();await a.db.prepare(`INSERT INTO trace_member_evaluations (id,tenant_id,member_user_id,project_id,evaluator_user_id,evaluator_role,score,comment,created_at) VALUES (?,?,?,?,?,?,?,?,datetime('now'))`).bind(id,a.tenantId,userId,projectId,a.user.id,perm.role,score,comment).run();
 await audit(a.db,{tenantId:a.tenantId,projectId,entityType:'member',entityId:userId,eventType:'member_evaluated',actorUserId:a.user.id,metadata:{score,comment:Boolean(comment)}});
 return json({ok:true,data:{id,score}},201);
}
async function action(request,a,projectId,pc,userId){
 const orgRole=await actorOrgRole(a);const canManage=a.user.id===a.tenantId||['admin','manager'].includes(orgRole)||['owner','manager'].includes(pc.projectRole);if(!canManage)return json({ok:false,error:'forbidden'},403);
 let b={};try{b=await request.json()}catch{return json({ok:false,error:'invalid_json'},400)}const action=clean(b.action,60);
 if(action==='change_department'){
  const departmentId=clean(b.departmentId,100)||null;if(departmentId){const d=await a.db.prepare(`SELECT id FROM trace_departments WHERE id=? AND tenant_id=? AND status='active'`).bind(departmentId,a.tenantId).first();if(!d)return json({ok:false,error:'department_not_found'},422)}
  await a.db.prepare(`UPDATE trace_department_members SET status='inactive',updated_at=datetime('now') WHERE tenant_id=? AND user_id=? AND status='active'`).bind(a.tenantId,userId).run();if(departmentId)await a.db.prepare(`INSERT INTO trace_department_members (id,tenant_id,department_id,user_id,membership_role,is_primary,status,created_by,created_at,updated_at) VALUES (?,?,?,?, 'member',0,'active',?,datetime('now'),datetime('now')) ON CONFLICT(department_id,user_id) DO UPDATE SET status='active',updated_at=datetime('now')`).bind(uuid(),a.tenantId,departmentId,userId,a.user.id).run();
  await audit(a.db,{tenantId:a.tenantId,projectId,entityType:'member',entityId:userId,eventType:'department_changed',actorUserId:a.user.id,metadata:{departmentId}});return json({ok:true});
 }
 if(action==='change_project_role'){
  const role=clean(b.projectRole,40);if(!PROJECT_ROLES.has(role))return json({ok:false,error:'invalid_project_role'},422);await a.db.prepare(`UPDATE trace_project_participants SET project_role=?,updated_at=datetime('now') WHERE tenant_id=? AND project_id=? AND user_id=?`).bind(role,a.tenantId,projectId,userId).run();await audit(a.db,{tenantId:a.tenantId,projectId,entityType:'project_membership',entityId:userId,eventType:'project_role_changed',actorUserId:a.user.id,metadata:{role}});return json({ok:true});
 }
 if(action==='remove_project'){
  await a.db.prepare(`UPDATE trace_project_participants SET status='inactive',updated_at=datetime('now') WHERE tenant_id=? AND project_id=? AND user_id=?`).bind(a.tenantId,projectId,userId).run();await audit(a.db,{tenantId:a.tenantId,projectId,entityType:'project_membership',entityId:userId,eventType:'removed_from_project',actorUserId:a.user.id});return json({ok:true});
 }
 if(action==='deactivate'){
  if(userId===a.tenantId)return json({ok:false,error:'cannot_deactivate_owner'},409);await a.db.prepare(`UPDATE users SET is_active=0,updated_at=datetime('now') WHERE id=? AND enterprise_id=?`).bind(userId,a.tenantId).run();await a.db.prepare(`UPDATE tenant_members SET status='inactive' WHERE tenant_owner_id=? AND user_id=?`).bind(a.tenantId,userId).run();await audit(a.db,{tenantId:a.tenantId,projectId,entityType:'member',entityId:userId,eventType:'member_deactivated',actorUserId:a.user.id});return json({ok:true});
 }
 return json({ok:false,error:'unsupported_action'},422);
}
export async function handleTraceV1TeamMemberDirectoryApi(request,env){
 const url=new URL(request.url),m=url.pathname.match(/^\/api\/trace\/v1\/admin\/projects\/([^/]+)\/team\/directory(?:\/members\/([^/]+)(?:\/(profile|evaluations|actions))?)?$/);if(!m)return null;if(request.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});
 const a=await auth(request,env);if(!a)return json({ok:false,error:'unauthorized'},401);const projectId=decodeURIComponent(m[1]),userId=m[2]?decodeURIComponent(m[2]):null,tail=m[3]||'';const pc=await projectContext(a,projectId);if(!pc)return json({ok:false,error:'project_not_found_or_forbidden'},404);
 if(!userId&&request.method==='GET')return directory(a,projectId,pc);
 if(userId&&tail==='profile'&&request.method==='GET')return profile(a,projectId,pc,userId);
 if(userId&&tail==='evaluations'&&request.method==='POST')return evaluate(request,a,projectId,pc,userId);
 if(userId&&tail==='actions'&&request.method==='POST')return action(request,a,projectId,pc,userId);
 return json({ok:false,error:'not_found'},404);
}
