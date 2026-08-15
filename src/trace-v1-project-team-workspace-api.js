import jwt from "@tsndr/cloudflare-worker-jwt";
import * as XLSX from "xlsx";
import { getTraceDatabase } from "./trace/shared/database.js";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization"};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});
const uuid=()=>crypto.randomUUID();
const text=(v,n=255)=>{const s=String(v??"").trim();return s?s.slice(0,n):null};
const ROLES=new Set(["owner","manager","supervisor","member","observer"]);
const USER_ROLES=new Set(["operator","manager","viewer"]);
const normEmail=v=>String(v||"").trim().toLowerCase();

async function context(request,env){
 const h=request.headers.get("Authorization")||"";if(!h.startsWith("Bearer "))return null;
 const token=h.slice(7).trim();let ok=false;try{ok=await jwt.verify(token,env.JWT_SECRET||"changeme-set-in-cloudflare-dashboard")}catch{return null}if(!ok)return null;
 const p=jwt.decode(token)?.payload||{};if((p.session_type||"standard")!=="standard")return null;
 const userId=p.user_id||p.userId||p.id||p.sub;if(!userId)return null;
 const db=getTraceDatabase(env);const user=await db.prepare(`SELECT id,email,role,enterprise_id,is_active FROM users WHERE id=? LIMIT 1`).bind(userId).first();
 if(!user||Number(user.is_active)!==1)return null;return{db,user,tenantId:user.enterprise_id||user.id};
}
async function project(c,projectId){
 const p=await c.db.prepare(`SELECT id,name,status FROM trace_assets WHERE id=? AND tenant_id=? AND asset_type='project' LIMIT 1`).bind(projectId,c.tenantId).first();
 if(!p)return null;
 const participant=await c.db.prepare(`SELECT project_role FROM trace_project_participants WHERE project_id=? AND tenant_id=? AND user_id=? AND status='active' LIMIT 1`).bind(projectId,c.tenantId,c.user.id).first();
 if(c.user.id!==c.tenantId&&!participant&&!['superadmin','enterprise'].includes(c.user.role))return null;
 return{project:p,projectRole:participant?.project_role||'owner'};
}
const canManage=(c,pc)=>c.user.id===c.tenantId||['superadmin','enterprise'].includes(c.user.role)||['owner','manager'].includes(pc.projectRole);

async function overview(c,projectId,pc){
 const [membersR,deptsR,groupsR,invitesR]=await Promise.all([
  c.db.prepare(`SELECT pp.id participant_id,pp.user_id,pp.project_role,pp.created_at,u.email,u.role,u.is_active,
   GROUP_CONCAT(DISTINCT d.name) departments,
   (SELECT COUNT(*) FROM trace_execution_activities ea JOIN trace_executions e ON e.id=ea.execution_id WHERE e.tenant_id=pp.tenant_id AND e.asset_id=pp.project_id AND ea.assigned_to=pp.user_id AND ea.status NOT IN ('completed','cancelled','skipped')) activity_assignments,
   (SELECT COUNT(*) FROM trace_execution_stages es JOIN trace_executions e ON e.id=es.execution_id WHERE e.tenant_id=pp.tenant_id AND e.asset_id=pp.project_id AND es.assigned_to=pp.user_id AND es.status NOT IN ('completed','cancelled')) stage_assignments
   FROM trace_project_participants pp JOIN users u ON u.id=pp.user_id
   LEFT JOIN trace_department_members dm ON dm.user_id=u.id AND dm.tenant_id=pp.tenant_id AND dm.status='active'
   LEFT JOIN trace_departments d ON d.id=dm.department_id AND d.status='active'
   WHERE pp.tenant_id=? AND pp.project_id=? AND pp.user_id IS NOT NULL AND pp.status='active'
   GROUP BY pp.id ORDER BY u.email`).bind(c.tenantId,projectId).all(),
  c.db.prepare(`SELECT d.id,d.name,d.description,d.status,
   COUNT(DISTINCT dm.user_id) member_count,
   MAX(CASE WHEN dm.membership_role='lead' AND dm.is_primary=1 THEN u.email END) responsible_email,
   MAX(CASE WHEN dm.membership_role='lead' AND dm.is_primary=1 THEN u.id END) responsible_user_id
   FROM trace_project_participants pp JOIN trace_departments d ON d.id=pp.department_id
   LEFT JOIN trace_department_members dm ON dm.department_id=d.id AND dm.status='active'
   LEFT JOIN users u ON u.id=dm.user_id
   WHERE pp.tenant_id=? AND pp.project_id=? AND pp.department_id IS NOT NULL AND pp.status='active'
   GROUP BY d.id ORDER BY d.name`).bind(c.tenantId,projectId).all(),
  c.db.prepare(`SELECT g.id,g.name,g.description,g.responsible_user_id,g.scope_type,g.scope_id,g.status,g.created_at,u.email responsible_email,COUNT(DISTINCT gm.user_id) member_count
   FROM trace_work_groups g LEFT JOIN users u ON u.id=g.responsible_user_id
   LEFT JOIN trace_work_group_members gm ON gm.work_group_id=g.id AND gm.status='active'
   WHERE g.tenant_id=? AND g.project_id=? AND g.status='active'
   GROUP BY g.id ORDER BY g.name`).bind(c.tenantId,projectId).all(),
  c.db.prepare(`SELECT i.id,i.email,i.project_role,i.status,i.invited_at,d.name department_name FROM trace_project_team_invitations i LEFT JOIN trace_departments d ON d.id=i.department_id WHERE i.tenant_id=? AND i.project_id=? AND i.status='pending' ORDER BY i.invited_at DESC`).bind(c.tenantId,projectId).all()
 ]);
 const members=(membersR.results||[]).map(x=>({...x,departments:x.departments?String(x.departments).split(','):[],assignmentCount:Number(x.activity_assignments||0)+Number(x.stage_assignments||0),status:Number(x.is_active)===1?'active':'inactive'}));
 const departments=deptsR.results||[],groups=groupsR.results||[],invitations=invitesR.results||[];
 return json({ok:true,data:{project:pc.project,viewer:{userId:c.user.id,projectRole:pc.projectRole,canManage:canManage(c,pc)},summary:{members:members.length,active:members.filter(x=>x.status==='active').length,unassigned:members.filter(x=>x.assignmentCount===0).length,departments:departments.length},members,departments,groups,invitations}});
}

async function createDepartment(request,c,projectId,pc){
 if(!canManage(c,pc))return json({ok:false,error:'forbidden'},403);let b={};try{b=await request.json()}catch{return json({ok:false,error:'invalid_json'},400)}
 const name=text(b.name,120),responsibleUserId=text(b.responsibleUserId,100),memberIds=Array.isArray(b.memberIds)?[...new Set(b.memberIds.map(x=>text(x,100)).filter(Boolean))]:[];
 if(!name)return json({ok:false,error:'name_required'},422);
 const exists=await c.db.prepare(`SELECT id FROM trace_departments WHERE tenant_id=? AND lower(name)=lower(?) AND status='active' LIMIT 1`).bind(c.tenantId,name).first();
 let departmentId=exists?.id||uuid();
 if(!exists)await c.db.prepare(`INSERT INTO trace_departments (id,tenant_id,department_code,name,status,created_by,created_at,updated_at) VALUES (?,?,?,?, 'active',?,datetime('now'),datetime('now'))`).bind(departmentId,c.tenantId,`DEP-${departmentId.slice(0,8).toUpperCase()}`,name,c.user.id).run();
 await c.db.prepare(`INSERT INTO trace_project_participants (id,tenant_id,project_id,department_id,project_role,status,created_by,created_at,updated_at) VALUES (?,?,?,?, 'member','active',?,datetime('now'),datetime('now')) ON CONFLICT(project_id,department_id) WHERE department_id IS NOT NULL DO UPDATE SET status='active',updated_at=datetime('now')`).bind(uuid(),c.tenantId,projectId,departmentId,c.user.id).run();
 for(const userId of memberIds){
  const eligible=await c.db.prepare(`SELECT id FROM users WHERE id=? AND is_active=1 AND (id=? OR enterprise_id=?) LIMIT 1`).bind(userId,c.tenantId,c.tenantId).first();if(!eligible)continue;
  const role=userId===responsibleUserId?'lead':'member',primary=userId===responsibleUserId?1:0;
  await c.db.prepare(`INSERT INTO trace_department_members (id,tenant_id,department_id,user_id,membership_role,is_primary,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?, 'active',?,datetime('now'),datetime('now')) ON CONFLICT(department_id,user_id) DO UPDATE SET membership_role=excluded.membership_role,is_primary=excluded.is_primary,status='active',updated_at=datetime('now')`).bind(uuid(),c.tenantId,departmentId,userId,role,primary,c.user.id).run();
 }
 return json({ok:true,data:{id:departmentId,name,existing:Boolean(exists)}},201);
}

async function createGroup(request,c,projectId,pc){
 if(!canManage(c,pc))return json({ok:false,error:'forbidden'},403);let b={};try{b=await request.json()}catch{return json({ok:false,error:'invalid_json'},400)}
 const name=text(b.name,140),responsibleUserId=text(b.responsibleUserId,100),scopeType=text(b.scopeType,40)||'project',scopeId=text(b.scopeId,100),memberIds=Array.isArray(b.memberIds)?[...new Set(b.memberIds.map(x=>text(x,100)).filter(Boolean))]:[];
 if(!name)return json({ok:false,error:'name_required'},422);if(!['project','execution','stage','activity','incident','inspection','correction'].includes(scopeType))return json({ok:false,error:'invalid_scope'},422);
 const id=uuid();await c.db.prepare(`INSERT INTO trace_work_groups (id,tenant_id,project_id,name,description,responsible_user_id,scope_type,scope_id,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,'active',?,datetime('now'),datetime('now'))`).bind(id,c.tenantId,projectId,name,text(b.description,600),responsibleUserId||null,scopeType,scopeId||null,c.user.id).run();
 for(const userId of memberIds){const participant=await c.db.prepare(`SELECT 1 ok FROM trace_project_participants WHERE tenant_id=? AND project_id=? AND user_id=? AND status='active' LIMIT 1`).bind(c.tenantId,projectId,userId).first();if(!participant)continue;await c.db.prepare(`INSERT INTO trace_work_group_members (id,tenant_id,work_group_id,user_id,group_role,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,'active',?,datetime('now'),datetime('now'))`).bind(uuid(),c.tenantId,id,userId,userId===responsibleUserId?'lead':'member',c.user.id).run();}
 return json({ok:true,data:{id,name,memberCount:memberIds.length}},201);
}

async function addPerson(request,c,projectId,pc){
 if(!canManage(c,pc))return json({ok:false,error:'forbidden'},403);let b={};try{b=await request.json()}catch{return json({ok:false,error:'invalid_json'},400)}
 const email=normEmail(b.email),projectRole=ROLES.has(b.projectRole)?b.projectRole:'member',departmentId=text(b.departmentId,100),accountRole=USER_ROLES.has(b.accountRole)?b.accountRole:'operator';if(!email||!email.includes('@'))return json({ok:false,error:'valid_email_required'},422);
 const user=await c.db.prepare(`SELECT id,email FROM users WHERE lower(email)=lower(?) AND is_active=1 AND (id=? OR enterprise_id=?) LIMIT 1`).bind(email,c.tenantId,c.tenantId).first();
 if(user){await c.db.prepare(`INSERT INTO trace_project_participants (id,tenant_id,project_id,user_id,project_role,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,'active',?,datetime('now'),datetime('now')) ON CONFLICT(project_id,user_id) WHERE user_id IS NOT NULL DO UPDATE SET project_role=excluded.project_role,status='active',updated_at=datetime('now')`).bind(uuid(),c.tenantId,projectId,user.id,projectRole,c.user.id).run();if(departmentId)await c.db.prepare(`INSERT INTO trace_department_members (id,tenant_id,department_id,user_id,membership_role,status,created_by,created_at,updated_at) VALUES (?,?,?,?, 'member','active',?,datetime('now'),datetime('now')) ON CONFLICT(department_id,user_id) DO UPDATE SET status='active',updated_at=datetime('now')`).bind(uuid(),c.tenantId,departmentId,user.id,c.user.id).run();return json({ok:true,data:{mode:'existing',userId:user.id,email}},200)}
 let tm=await c.db.prepare(`SELECT id,status FROM tenant_members WHERE tenant_owner_id=? AND lower(email)=lower(?) LIMIT 1`).bind(c.tenantId,email).first();if(!tm){const id=uuid();await c.db.prepare(`INSERT INTO tenant_members (id,tenant_owner_id,user_id,email,role,status,invited_at,invited_by) VALUES (?,?,NULL,?,?, 'pending',datetime('now'),?)`).bind(id,c.tenantId,email,accountRole,c.user.id).run();tm={id,status:'pending'}}
 await c.db.prepare(`INSERT INTO trace_project_team_invitations (id,tenant_id,project_id,email,project_role,department_id,tenant_member_id,status,invited_by,invited_at,metadata_json) VALUES (?,?,?,?,?,?,?,'pending',?,datetime('now'),'{}') ON CONFLICT(project_id,email) DO UPDATE SET project_role=excluded.project_role,department_id=excluded.department_id,tenant_member_id=excluded.tenant_member_id,status='pending',invited_by=excluded.invited_by,invited_at=datetime('now')`).bind(uuid(),c.tenantId,projectId,email,projectRole,departmentId||null,tm.id,c.user.id).run();
 return json({ok:true,data:{mode:'invited',email,tenantMemberId:tm.id}},201);
}

function templateWorkbook(){
 const wb=XLSX.utils.book_new();
 const ws=XLSX.utils.aoa_to_sheet([["nombre","apellido","correo","telefono","rol","departamento"],["Carlos","Méndez","carlos@empresa.com","8095550001","member","Terminaciones"]]);XLSX.utils.book_append_sheet(wb,ws,'MIEMBROS');
 const ins=XLSX.utils.aoa_to_sheet([["INSTRUCCIONES"],["Campos obligatorios: correo y rol."],["Roles de proyecto válidos: owner, manager, supervisor, member, observer."],["El teléfono es opcional y se conserva como referencia de importación."],["Los departamentos deben existir antes de confirmar la importación."],["Si el correo ya existe en la empresa, se agrega al proyecto sin duplicar la cuenta."],["Los duplicados dentro del archivo se marcan para revisión."]]);XLSX.utils.book_append_sheet(wb,ins,'INSTRUCCIONES');return wb;
}
async function template(){const bytes=XLSX.write(templateWorkbook(),{bookType:'xlsx',type:'array',compression:true});return new Response(bytes,{headers:{...CORS,'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename=kawvo-trace-equipo.xlsx','Cache-Control':'no-store'}})}

function normalizeImportRow(row,index){return{row:index+2,firstName:text(row.nombre||row.Nombre,80)||'',lastName:text(row.apellido||row.Apellido,80)||'',email:normEmail(row.correo||row.email||row.Correo),phone:text(row.telefono||row.teléfono||row.Telefono,40)||'',projectRole:text(row.rol||row.role||row.Rol,40)||'member',department:text(row.departamento||row.Departamento,120)||''}}
async function validateRows(c,projectId,rows){
 const depts=await c.db.prepare(`SELECT id,name FROM trace_departments WHERE tenant_id=? AND status='active'`).bind(c.tenantId).all();const deptMap=new Map((depts.results||[]).map(d=>[d.name.toLowerCase(),d]));const seen=new Set();const out=[];
 for(const row of rows){const errors=[],warnings=[];if(!row.email||!row.email.includes('@'))errors.push('Correo inválido');if(!ROLES.has(row.projectRole))errors.push('Rol inválido');if(seen.has(row.email))errors.push('Correo duplicado en archivo');seen.add(row.email);const department=row.department?deptMap.get(row.department.toLowerCase()):null;if(row.department&&!department)errors.push(`Departamento inexistente: ${row.department}`);const user=row.email?await c.db.prepare(`SELECT id FROM users WHERE lower(email)=lower(?) AND is_active=1 AND (id=? OR enterprise_id=?) LIMIT 1`).bind(row.email,c.tenantId,c.tenantId).first():null;const participant=user?await c.db.prepare(`SELECT 1 ok FROM trace_project_participants WHERE tenant_id=? AND project_id=? AND user_id=? AND status='active' LIMIT 1`).bind(c.tenantId,projectId,user.id).first():null;if(participant)warnings.push('Ya pertenece al proyecto');out.push({...row,departmentId:department?.id||null,userId:user?.id||null,mode:user?'existing':'invite',errors,warnings,valid:errors.length===0})}
 return out;
}
async function importPreview(request,c,projectId,pc){
 if(!canManage(c,pc))return json({ok:false,error:'forbidden'},403);let form;try{form=await request.formData()}catch{return json({ok:false,error:'invalid_multipart'},400)}const file=form.get('file');if(!file||typeof file==='string')return json({ok:false,error:'file_required'},422);if(file.size>10*1024*1024)return json({ok:false,error:'file_too_large'},422);let wb;try{wb=XLSX.read(await file.arrayBuffer(),{type:'array'})}catch{return json({ok:false,error:'invalid_xlsx'},422)}const sheet=wb.Sheets[wb.SheetNames[0]];if(!sheet)return json({ok:false,error:'empty_workbook'},422);const raw=XLSX.utils.sheet_to_json(sheet,{defval:''});if(raw.length>1000)return json({ok:false,error:'too_many_rows'},422);const rows=raw.map(normalizeImportRow);const checked=await validateRows(c,projectId,rows);return json({ok:true,data:{total:checked.length,valid:checked.filter(x=>x.valid).length,review:checked.filter(x=>x.warnings.length).length,invalid:checked.filter(x=>!x.valid).length,rows:checked}})}
async function importConfirm(request,c,projectId,pc){
 if(!canManage(c,pc))return json({ok:false,error:'forbidden'},403);let b={};try{b=await request.json()}catch{return json({ok:false,error:'invalid_json'},400)}const rows=Array.isArray(b.rows)?b.rows.map(normalizeImportRow):[];const checked=await validateRows(c,projectId,rows);if(checked.some(x=>!x.valid))return json({ok:false,error:'rows_require_review',data:{rows:checked}},422);let existing=0,invited=0,skipped=0;for(const row of checked){if(row.warnings.includes('Ya pertenece al proyecto')){skipped++;continue}const fake=new Request('https://local',{method:'POST',body:JSON.stringify({email:row.email,projectRole:row.projectRole,departmentId:row.departmentId,accountRole:'operator'}),headers:{'Content-Type':'application/json'}});const res=await addPerson(fake,c,projectId,pc);if(res.ok){if(row.mode==='existing')existing++;else invited++}}return json({ok:true,data:{processed:checked.length,existingAdded:existing,invited,skipped}})}

export async function handleTraceV1ProjectTeamWorkspaceApi(request,env){
 const url=new URL(request.url);const m=url.pathname.match(/^\/api\/trace\/v1\/admin\/projects\/([^/]+)\/team(?:\/(.*))?$/);if(!m)return null;if(request.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});const c=await context(request,env);if(!c)return json({ok:false,error:'unauthorized'},401);const projectId=decodeURIComponent(m[1]),tail=m[2]||'';const pc=await project(c,projectId);if(!pc)return json({ok:false,error:'project_not_found_or_forbidden'},404);
 if(!tail&&request.method==='GET')return overview(c,projectId,pc);
 if(tail==='departments'&&request.method==='POST')return createDepartment(request,c,projectId,pc);
 if(tail==='groups'&&request.method==='POST')return createGroup(request,c,projectId,pc);
 if(tail==='members'&&request.method==='POST')return addPerson(request,c,projectId,pc);
 if(tail==='import/template'&&request.method==='GET')return template();
 if(tail==='import/preview'&&request.method==='POST')return importPreview(request,c,projectId,pc);
 if(tail==='import/confirm'&&request.method==='POST')return importConfirm(request,c,projectId,pc);
 return json({ok:false,error:'not_found'},404);
}
