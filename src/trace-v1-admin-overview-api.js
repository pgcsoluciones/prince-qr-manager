import jwt from "@tsndr/cloudflare-worker-jwt";
import { getTraceDatabase } from "./trace/shared/database.js";

const BASE = "/api/trace/v1/admin/overview";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function context(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const token = authorization.slice(7).trim();
  let valid = false;
  try { valid = await jwt.verify(token, env.JWT_SECRET || "changeme-set-in-cloudflare-dashboard"); } catch { return null; }
  if (!valid) return null;
  const payload = jwt.decode(token)?.payload || {};
  const userId = payload.user_id || payload.userId || payload.id || payload.sub;
  if (!userId) return null;
  const db = getTraceDatabase(env);
  const user = await db.prepare(`SELECT id,enterprise_id,is_active FROM users WHERE id=? LIMIT 1`).bind(userId).first();
  if (!user || Number(user.is_active) !== 1) return null;
  return { db, tenantId: user.enterprise_id || user.id };
}

export async function handleTraceV1AdminOverviewApi(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== BASE) return null;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "GET") return json({ ok:false, error:"method_not_allowed" }, 405);

  const ctx = await context(request, env);
  if (!ctx) return json({ ok:false, error:"unauthorized" }, 401);
  const { db, tenantId } = ctx;

  const [processesR, executionsR, incidentsR, approvalsR, assetsR, stagesR] = await Promise.all([
    db.prepare(`SELECT p.id,p.name,p.description,p.category,p.status,p.current_version_id,p.color,p.icon,p.created_at,p.updated_at,
      (SELECT COUNT(*) FROM trace_process_versions v WHERE v.process_id=p.id) version_count,
      (SELECT COUNT(*) FROM trace_process_versions v WHERE v.process_id=p.id AND v.status='published') published_versions,
      (SELECT COUNT(*) FROM trace_executions e WHERE e.process_id=p.id) execution_count
      FROM trace_processes p WHERE p.tenant_id=? ORDER BY p.updated_at DESC LIMIT 100`).bind(tenantId).all(),
    db.prepare(`SELECT e.id,e.execution_code,e.title,e.status,e.priority,e.completion_percentage,e.started_at,e.due_at,e.completed_at,e.created_at,
      p.name process_name,a.asset_code,a.name asset_name,
      (SELECT COUNT(*) FROM trace_execution_stages es WHERE es.execution_id=e.id) stage_count,
      (SELECT COUNT(*) FROM trace_execution_stages es WHERE es.execution_id=e.id AND es.status IN ('completed','approved')) completed_stages,
      (SELECT COUNT(*) FROM trace_incidents i WHERE i.execution_id=e.id AND i.status NOT IN ('resolved','validated','closed')) open_incidents,
      (SELECT COUNT(*) FROM trace_approvals ap WHERE ap.execution_id=e.id AND ap.status='pending') pending_approvals
      FROM trace_executions e
      JOIN trace_processes p ON p.id=e.process_id
      LEFT JOIN trace_assets a ON a.id=e.asset_id
      WHERE e.tenant_id=? ORDER BY e.created_at DESC LIMIT 200`).bind(tenantId).all(),
    db.prepare(`SELECT i.id,i.incident_code,i.title,i.category,i.severity,i.status,i.reported_at,i.resolved_at,
      e.execution_code,e.title execution_title
      FROM trace_incidents i JOIN trace_executions e ON e.id=i.execution_id
      WHERE i.tenant_id=? ORDER BY i.reported_at DESC LIMIT 100`).bind(tenantId).all(),
    db.prepare(`SELECT ap.id,ap.status,ap.requested_at,ap.decided_at,ap.decision_notes,
      e.execution_code,e.title execution_title,s.name stage_name
      FROM trace_approvals ap
      JOIN trace_executions e ON e.id=ap.execution_id
      LEFT JOIN trace_execution_stages es ON es.id=ap.execution_stage_id
      LEFT JOIN trace_stages s ON s.id=es.stage_id
      WHERE ap.tenant_id=? ORDER BY ap.requested_at DESC LIMIT 100`).bind(tenantId).all(),
    db.prepare(`SELECT COUNT(*) total, SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) active FROM trace_assets WHERE tenant_id=?`).bind(tenantId).first(),
    db.prepare(`SELECT COUNT(*) total, SUM(CASE WHEN es.status='pending_approval' THEN 1 ELSE 0 END) pending_approval,
      SUM(CASE WHEN es.status='correction_required' THEN 1 ELSE 0 END) correction_required
      FROM trace_execution_stages es JOIN trace_executions e ON e.id=es.execution_id WHERE e.tenant_id=?`).bind(tenantId).first(),
  ]);

  const processes = processesR.results || [];
  const executions = executionsR.results || [];
  const incidents = incidentsR.results || [];
  const approvals = approvalsR.results || [];

  const metrics = {
    processes: processes.length,
    activeProcesses: processes.filter(x => x.status === "active").length,
    draftProcesses: processes.filter(x => x.status === "draft").length,
    executions: executions.length,
    inProgress: executions.filter(x => ["assigned","in_progress","blocked","pending_approval","correction_required","overdue"].includes(x.status)).length,
    completed: executions.filter(x => x.status === "completed").length,
    blocked: executions.filter(x => ["blocked","correction_required","overdue"].includes(x.status)).length,
    openIncidents: incidents.filter(x => !["resolved","validated","closed"].includes(x.status)).length,
    criticalIncidents: incidents.filter(x => x.severity === "critical" && !["resolved","validated","closed"].includes(x.status)).length,
    pendingApprovals: approvals.filter(x => x.status === "pending").length,
    correctionApprovals: approvals.filter(x => x.status === "correction_required").length,
    assets: Number(assetsR?.total || 0),
    activeAssets: Number(assetsR?.active || 0),
    pendingApprovalStages: Number(stagesR?.pending_approval || 0),
    correctionStages: Number(stagesR?.correction_required || 0),
  };

  return json({ ok:true, data:{ metrics, processes, executions, incidents, approvals } });
}
