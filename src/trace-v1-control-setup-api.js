import jwt from "@tsndr/cloudflare-worker-jwt";
import { getTraceDatabase } from "./trace/shared/database.js";

const ADMIN = "/api/trace/v1/admin";
const PUBLIC = "/api/trace/v1/public";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
function uuid() { return crypto.randomUUID(); }
function text(v, n = 500) { if (v === null || v === undefined) return null; const s = String(v).trim(); return s ? s.slice(0, n) : null; }
function arr(v) { return Array.isArray(v) ? v : []; }
function parse(v, fallback = {}) { try { return v ? JSON.parse(v) : fallback; } catch { return fallback; } }
function slugPart(v) { return String(v || "trace").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "trace"; }

async function context(request, env) {
  const h = request.headers.get("Authorization") || "";
  if (!h.startsWith("Bearer ")) return null;
  const token = h.slice(7).trim();
  let valid = false;
  try { valid = await jwt.verify(token, env.JWT_SECRET || "changeme-set-in-cloudflare-dashboard"); } catch { return null; }
  if (!valid) return null;
  const payload = jwt.decode(token)?.payload || {};
  const userId = payload.user_id || payload.userId || payload.id || payload.sub;
  if (!userId) return null;
  const db = getTraceDatabase(env);
  const user = await db.prepare(`SELECT id,email,role,plan,enterprise_id,is_active FROM users WHERE id=? LIMIT 1`).bind(userId).first();
  if (!user || Number(user.is_active) !== 1) return null;
  return { db, user, tenantId: user.enterprise_id || user.id };
}

async function setupOptions(request, env) {
  const c = await context(request, env);
  if (!c) return json({ ok:false, error:"unauthorized" }, 401);
  const [usersR, deptsR] = await Promise.all([
    c.db.prepare(`SELECT id,email,role FROM users WHERE is_active=1 AND (id=? OR enterprise_id=?) ORDER BY email`).bind(c.tenantId, c.tenantId).all(),
    c.db.prepare(`SELECT id,department_code,name,description FROM trace_departments WHERE tenant_id=? AND status='active' ORDER BY name`).bind(c.tenantId).all(),
  ]);
  return json({ ok:true, data:{ users:usersR.results || [], departments:deptsR.results || [] } });
}

async function createControl(request, env) {
  const c = await context(request, env);
  if (!c) return json({ ok:false, error:"unauthorized" }, 401);
  let body = {}; try { body = await request.json(); } catch { return json({ ok:false, error:"invalid_json" }, 400); }
  const templateId = text(body.templateId, 120);
  const name = text(body.name, 180);
  if (!templateId || !name) return json({ ok:false, error:"missing_fields", message:"Selecciona una solución y escribe el nombre del control." }, 422);
  const tpl = await c.db.prepare(`SELECT * FROM trace_process_templates WHERE id=? AND status='active' LIMIT 1`).bind(templateId).first();
  if (!tpl) return json({ ok:false, error:"template_not_found" }, 404);

  const processSpec = parse(tpl.process_json, {});
  const stages = parse(tpl.stages_json, []);
  const fields = parse(tpl.fields_json, []);
  const processId = uuid();
  const versionId = uuid();
  const publicView = body.publicView !== false;
  const settings = {
    ...(processSpec.settings || {}),
    templateId: tpl.id,
    templateKey: tpl.template_key,
    publicView: {
      enabled: publicView,
      audience: arr(body.publicAudience).length ? arr(body.publicAudience) : ["cliente","propietario","inversionista","usuario"],
      visibility: text(body.publicVisibility, 30) || "summary",
    },
  };

  const statements = [
    c.db.prepare(`INSERT INTO trace_processes (id,tenant_id,name,description,category,status,current_version_id,color,icon,settings_json,created_by,created_at,updated_at,process_mode) VALUES (?,?,?,?,?,'active',?,?,?, ?,?,datetime('now'),datetime('now'),?)`)
      .bind(processId,c.tenantId,name,text(body.description,1000)||tpl.description,processSpec.category||tpl.industry||"general",versionId,processSpec.color||"#2563eb",processSpec.icon||null,JSON.stringify(settings),c.user.id,(arr(body.departmentIds).length||arr(body.responsibleUserIds).length)>1?"team":"simple"),
    c.db.prepare(`INSERT INTO trace_process_versions (id,process_id,version_number,name,description,status,schema_json,published_at,published_by,created_by,created_at) VALUES (?,?,1,?,?,'published','{}',datetime('now'),?,?,datetime('now'))`)
      .bind(versionId,processId,name,text(body.description,1000)||tpl.description,c.user.id,c.user.id),
  ];

  const stageIds = {};
  stages.forEach((s,i) => {
    const stageId = uuid(); stageIds[s.key || String(i+1)] = stageId;
    statements.push(c.db.prepare(`INSERT INTO trace_stages (id,process_version_id,name,description,stage_order,stage_type,responsible_role,instructions,estimated_duration_minutes,requires_evidence,requires_approval,allow_skip,settings_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`)
      .bind(stageId,versionId,text(s.name,180)||`Paso ${i+1}`,text(s.description,1000),i+1,s.stageType||"operation",text(s.responsibleRole,80),text(s.instructions,2000),Number(s.estimatedDurationMinutes||0)||null,s.requiresEvidence?1:0,s.requiresApproval?1:0,s.allowSkip?1:0,JSON.stringify(s.settings||{})));
  });
  fields.forEach((f,i) => {
    const stageId = stageIds[f.stageKey]; if (!stageId) return;
    statements.push(c.db.prepare(`INSERT INTO trace_stage_fields (id,stage_id,field_key,label,description,field_type,field_order,is_required,options_json,validation_json,conditional_json,default_value_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`)
      .bind(uuid(),stageId,text(f.key,100)||`field_${i+1}`,text(f.label,180)||`Dato ${i+1}`,text(f.description,800),f.type||"text",Number(f.order||i+1),f.required?1:0,JSON.stringify(arr(f.options)),JSON.stringify(f.validation||{}),JSON.stringify(f.conditional||{}),f.defaultValue===undefined?null:JSON.stringify(f.defaultValue)));
  });

  const validUsers = [];
  for (const userId of [...new Set(arr(body.responsibleUserIds).map(v=>text(v,100)).filter(Boolean))]) {
    const u = await c.db.prepare(`SELECT id FROM users WHERE id=? AND is_active=1 AND (id=? OR enterprise_id=?) LIMIT 1`).bind(userId,c.tenantId,c.tenantId).first();
    if (u) validUsers.push(u.id);
  }
  validUsers.forEach((userId,index) => {
    statements.push(c.db.prepare(`INSERT INTO trace_process_version_participants (id,tenant_id,process_id,process_version_id,department_id,user_id,participation_role,assignment_mode,settings_json,created_by,created_at) VALUES (?,?,?,?,NULL,?,?,?,'{}',?,datetime('now'))`)
      .bind(uuid(),c.tenantId,processId,versionId,userId,index===0?"process_owner":"executor",index===0?"required":"default",c.user.id));
  });

  const validDepartments = [];
  for (const departmentId of [...new Set(arr(body.departmentIds).map(v=>text(v,100)).filter(Boolean))]) {
    const d = await c.db.prepare(`SELECT id FROM trace_departments WHERE id=? AND tenant_id=? AND status='active' LIMIT 1`).bind(departmentId,c.tenantId).first();
    if (d) validDepartments.push(d.id);
  }
  validDepartments.forEach((departmentId,index) => {
    statements.push(c.db.prepare(`INSERT INTO trace_process_version_departments (id,tenant_id,process_id,process_version_id,department_id,participation_role,is_required,can_reassign,settings_json,created_by,created_at) VALUES (?,?,?,?,?,?,1,1,'{}',?,datetime('now'))`)
      .bind(uuid(),c.tenantId,processId,versionId,departmentId,index===0?"owner":"executor",c.user.id));
  });

  await c.db.batch(statements);
  return json({ ok:true, data:{ id:processId, versionId, name, status:"active", publicView:settings.publicView, responsibleUserIds:validUsers, departmentIds:validDepartments, steps:stages.length } }, 201);
}

async function registerActivity(request, env) {
  const c = await context(request, env);
  if (!c) return json({ ok:false, error:"unauthorized" }, 401);
  let body = {}; try { body = await request.json(); } catch { return json({ ok:false, error:"invalid_json" }, 400); }
  const executionId = text(body.executionId, 100);
  const type = text(body.type, 80) || "activity.recorded";
  const description = text(body.description, 2000);
  if (!executionId || !description) return json({ ok:false, error:"missing_fields", message:"Selecciona el trabajo y describe lo ocurrido." }, 422);
  const execution = await c.db.prepare(`SELECT id,asset_id FROM trace_executions WHERE id=? AND tenant_id=? LIMIT 1`).bind(executionId,c.tenantId).first();
  if (!execution) return json({ ok:false, error:"execution_not_found" }, 404);
  const stageId = text(body.executionStageId,100);
  if (stageId) {
    const stage = await c.db.prepare(`SELECT id FROM trace_execution_stages WHERE id=? AND execution_id=? LIMIT 1`).bind(stageId,executionId).first();
    if (!stage) return json({ ok:false, error:"invalid_stage" }, 422);
  }
  const id = uuid();
  await c.db.batch([
    c.db.prepare(`INSERT INTO trace_events (id,tenant_id,execution_id,execution_stage_id,asset_id,event_type,event_source,actor_user_id,actor_role,description,payload_json,occurred_at,received_at) VALUES (?,?,?,?,?,?, 'admin',?,?,?, ?,datetime('now'),datetime('now'))`)
      .bind(id,c.tenantId,executionId,stageId||null,execution.asset_id||null,type,c.user.id,c.user.role,description,JSON.stringify(body.data||{})),
    c.db.prepare(`UPDATE trace_executions SET updated_at=datetime('now') WHERE id=? AND tenant_id=?`).bind(executionId,c.tenantId),
  ]);
  return json({ ok:true, data:{ id, executionId, type, description } }, 201);
}

async function createPublicView(request, env, executionId) {
  const c = await context(request, env);
  if (!c) return json({ ok:false, error:"unauthorized" }, 401);
  const execution = await c.db.prepare(`SELECT e.id,e.execution_code,e.title,e.status,e.completion_percentage,e.started_at,e.due_at,e.completed_at,p.name process_name,p.settings_json,a.name asset_name,a.asset_code FROM trace_executions e JOIN trace_processes p ON p.id=e.process_id LEFT JOIN trace_assets a ON a.id=e.asset_id WHERE e.id=? AND e.tenant_id=? LIMIT 1`).bind(executionId,c.tenantId).first();
  if (!execution) return json({ ok:false, error:"execution_not_found" }, 404);
  const settings = parse(execution.settings_json, {});
  if (settings?.publicView?.enabled === false) return json({ ok:false, error:"public_view_disabled", message:"Este control no tiene habilitada una vista pública." }, 422);
  const existing = await c.db.prepare(`SELECT id,public_slug FROM trace_public_views WHERE tenant_id=? AND execution_id=? AND status='active' LIMIT 1`).bind(c.tenantId,executionId).first();
  const slug = existing?.public_slug || `${slugPart(execution.asset_name || execution.title || execution.process_name)}-${crypto.randomUUID().slice(0,8)}`;
  const projection = {
    title: execution.title || execution.process_name,
    reference: execution.execution_code,
    control: execution.process_name,
    item: execution.asset_name || null,
    itemCode: execution.asset_code || null,
    status: execution.status,
    progress: Number(execution.completion_percentage || 0),
    startedAt: execution.started_at || null,
    dueAt: execution.due_at || null,
    completedAt: execution.completed_at || null,
    lastUpdatedAt: new Date().toISOString(),
  };
  if (existing) {
    await c.db.prepare(`UPDATE trace_public_views SET projection_json=?,last_generated_at=datetime('now'),updated_at=datetime('now') WHERE id=? AND tenant_id=?`).bind(JSON.stringify(projection),existing.id,c.tenantId).run();
  } else {
    await c.db.prepare(`INSERT INTO trace_public_views (id,tenant_id,execution_id,asset_id,public_slug,title,status,visibility,projection_json,last_generated_at,created_at,updated_at) SELECT ?,tenant_id,id,asset_id,?,?, 'active','summary',?,datetime('now'),datetime('now'),datetime('now') FROM trace_executions WHERE id=? AND tenant_id=?`)
      .bind(uuid(),slug,projection.title,JSON.stringify(projection),executionId,c.tenantId).run();
  }
  return json({ ok:true, data:{ slug, path:`${PUBLIC}/${slug}`, projection } });
}

async function getPublicView(request, env, slug) {
  const db = getTraceDatabase(env);
  const row = await db.prepare(`SELECT title,visibility,projection_json,expires_at,updated_at FROM trace_public_views WHERE public_slug=? AND status='active' AND (expires_at IS NULL OR expires_at>datetime('now')) LIMIT 1`).bind(slug).first();
  if (!row) return json({ ok:false, error:"public_view_not_found" }, 404);
  return json({ ok:true, data:{ title:row.title, visibility:row.visibility, ...parse(row.projection_json,{}), updatedAt:row.updated_at } });
}

export async function handleTraceV1ControlSetupApi(request, env) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS" && (url.pathname.startsWith(ADMIN) || url.pathname.startsWith(PUBLIC))) return new Response(null,{status:204,headers:CORS});
  if (url.pathname === `${ADMIN}/setup-options` && request.method === "GET") return setupOptions(request,env);
  if (url.pathname === `${ADMIN}/controls` && request.method === "POST") return createControl(request,env);
  if (url.pathname === `${ADMIN}/activities` && request.method === "POST") return registerActivity(request,env);
  const pubCreate = url.pathname.match(/^\/api\/trace\/v1\/admin\/executions\/([^/]+)\/public-view$/);
  if (pubCreate && request.method === "POST") return createPublicView(request,env,decodeURIComponent(pubCreate[1]));
  const pubRead = url.pathname.match(/^\/api\/trace\/v1\/public\/([^/]+)$/);
  if (pubRead && request.method === "GET") return getPublicView(request,env,decodeURIComponent(pubRead[1]));
  return null;
}
