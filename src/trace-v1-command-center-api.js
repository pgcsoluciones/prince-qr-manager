import jwt from "@tsndr/cloudflare-worker-jwt";
import { getTraceDatabase } from "./trace/shared/database.js";

const BASE = "/api/trace/v1/admin/command-center";
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
function text(value, max = 500) {
  if (value === null || value === undefined) return null;
  const v = String(value).trim();
  return v ? v.slice(0, max) : null;
}
function uuid() { return crypto.randomUUID(); }

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
  const user = await db.prepare(`SELECT id,email,role,enterprise_id,is_active FROM users WHERE id=? LIMIT 1`).bind(userId).first();
  if (!user || Number(user.is_active) !== 1) return null;
  return { db, user, tenantId: user.enterprise_id || user.id };
}

async function workspace(request, env, executionId) {
  const c = await context(request, env);
  if (!c) return json({ ok:false, error:"unauthorized" }, 401);

  const execution = await c.db.prepare(`
    SELECT e.id,e.execution_code,e.title,e.status,e.priority,e.completion_percentage,e.started_at,e.due_at,e.completed_at,e.updated_at,
           e.assigned_to,p.id process_id,p.name process_name,p.category,a.id asset_id,a.name asset_name,a.asset_code,
           u.email assigned_email
    FROM trace_executions e
    JOIN trace_processes p ON p.id=e.process_id
    LEFT JOIN trace_assets a ON a.id=e.asset_id
    LEFT JOIN users u ON u.id=e.assigned_to
    WHERE e.id=? AND e.tenant_id=? LIMIT 1
  `).bind(executionId, c.tenantId).first();
  if (!execution) return json({ ok:false, error:"execution_not_found" }, 404);

  const [stagesR, incidentsR, approvalsR, evidencesR, eventsR, usersR] = await Promise.all([
    c.db.prepare(`
      SELECT es.id,es.stage_order,es.status,es.assigned_to,es.started_at,es.submitted_at,es.completed_at,es.notes,
             s.name,s.description,s.stage_type,s.requires_evidence,s.requires_approval,s.responsible_role,
             u.email assigned_email
      FROM trace_execution_stages es
      JOIN trace_stages s ON s.id=es.stage_id
      LEFT JOIN users u ON u.id=es.assigned_to
      WHERE es.execution_id=? ORDER BY es.stage_order
    `).bind(executionId).all(),
    c.db.prepare(`SELECT id,incident_code,title,severity,status,reported_at,resolved_at FROM trace_incidents WHERE tenant_id=? AND execution_id=? ORDER BY reported_at DESC LIMIT 20`).bind(c.tenantId,executionId).all(),
    c.db.prepare(`SELECT id,status,requested_at,decided_at,decision_notes,execution_stage_id FROM trace_approvals WHERE tenant_id=? AND execution_id=? ORDER BY requested_at DESC LIMIT 20`).bind(c.tenantId,executionId).all(),
    c.db.prepare(`SELECT id,evidence_type,mime_type,original_filename,caption,created_at,execution_stage_id FROM trace_evidences WHERE tenant_id=? AND execution_id=? ORDER BY created_at DESC LIMIT 24`).bind(c.tenantId,executionId).all(),
    c.db.prepare(`SELECT id,event_type,description,actor_user_id,actor_role,occurred_at,execution_stage_id FROM trace_events WHERE tenant_id=? AND execution_id=? ORDER BY occurred_at DESC LIMIT 30`).bind(c.tenantId,executionId).all(),
    c.db.prepare(`SELECT id,email,role FROM users WHERE is_active=1 AND (id=? OR enterprise_id=?) ORDER BY email`).bind(c.tenantId,c.tenantId).all(),
  ]);

  return json({ ok:true, data:{
    execution,
    stages: stagesR.results || [],
    incidents: incidentsR.results || [],
    approvals: approvalsR.results || [],
    evidences: evidencesR.results || [],
    events: eventsR.results || [],
    users: usersR.results || [],
  }});
}

async function assignStage(request, env, executionStageId) {
  const c = await context(request, env);
  if (!c) return json({ ok:false, error:"unauthorized" }, 401);
  let body = {}; try { body = await request.json(); } catch { return json({ ok:false, error:"invalid_json" },400); }
  const userId = text(body.userId, 100);
  if (!userId) return json({ ok:false, error:"user_required", message:"Selecciona un responsable." },422);

  const stage = await c.db.prepare(`
    SELECT es.id,es.execution_id,s.name stage_name
    FROM trace_execution_stages es
    JOIN trace_executions e ON e.id=es.execution_id
    JOIN trace_stages s ON s.id=es.stage_id
    WHERE es.id=? AND e.tenant_id=? LIMIT 1
  `).bind(executionStageId,c.tenantId).first();
  if (!stage) return json({ ok:false, error:"stage_not_found" },404);
  const user = await c.db.prepare(`SELECT id,email FROM users WHERE id=? AND is_active=1 AND (id=? OR enterprise_id=?) LIMIT 1`).bind(userId,c.tenantId,c.tenantId).first();
  if (!user) return json({ ok:false, error:"user_not_available" },422);

  await c.db.batch([
    c.db.prepare(`UPDATE trace_execution_stages SET assigned_to=?,updated_at=datetime('now') WHERE id=?`).bind(user.id,stage.id),
    c.db.prepare(`INSERT INTO trace_events (id,tenant_id,execution_id,execution_stage_id,event_type,event_source,actor_user_id,actor_role,description,payload_json,occurred_at,received_at) VALUES (?,?,?,?,?,'admin',?,?,?,?,datetime('now'),datetime('now'))`)
      .bind(uuid(),c.tenantId,stage.execution_id,stage.id,"stage.assigned",c.user.id,c.user.role,`Responsable asignado a ${stage.stage_name}.`,JSON.stringify({assignedUserId:user.id,assignedEmail:user.email})),
  ]);

  return json({ ok:true, data:{ executionStageId:stage.id, userId:user.id, email:user.email } });
}

export async function handleTraceV1CommandCenterApi(request, env) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS" && url.pathname.startsWith(BASE)) return new Response(null,{status:204,headers:CORS});
  const workspaceMatch = url.pathname.match(/^\/api\/trace\/v1\/admin\/command-center\/executions\/([^/]+)$/);
  if (workspaceMatch && request.method === "GET") return workspace(request, env, decodeURIComponent(workspaceMatch[1]));
  const assignMatch = url.pathname.match(/^\/api\/trace\/v1\/admin\/command-center\/stages\/([^/]+)\/assign$/);
  if (assignMatch && request.method === "POST") return assignStage(request, env, decodeURIComponent(assignMatch[1]));
  return null;
}
