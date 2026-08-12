import { requireOperationalSession } from "./trace/shared/operational-auth.js";

const PATH = "/api/trace/v1/operational/tasks";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Device-Id",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  try { return JSON.parse(value) ?? fallback; } catch { return fallback; }
}

function permissions(row, evidenceCount) {
  const status = row.stage_status;
  const requiresEvidence = Number(row.requires_evidence) === 1;
  return {
    identityVerified: true,
    assignmentResolved: true,
    canViewAssignedTasks: true,
    canOpenTask: true,
    canStart: status === "available",
    canUpdateProgress: status === "in_progress",
    canAddEvidence: status === "in_progress",
    canComplete: status === "in_progress" && (!requiresEvidence || evidenceCount > 0),
    requiresEvidence,
    requiresApproval: Number(row.requires_approval) === 1,
    awaitingApproval: status === "pending_approval",
    correctionRequired: status === "correction_required" || status === "rejected",
  };
}

function serialize(row) {
  const evidenceCount = Number(row.evidence_count || 0);
  return {
    id: row.execution_stage_id,
    executionId: row.execution_id,
    executionCode: row.execution_code,
    executionTitle: row.execution_title,
    executionStatus: row.execution_status,
    priority: row.priority,
    dueAt: row.due_at,
    asset: row.asset_id ? {
      id: row.asset_id,
      code: row.asset_code,
      name: row.asset_name,
      type: row.asset_type,
      location: row.asset_location,
    } : null,
    process: { id: row.process_id, name: row.process_name, versionId: row.process_version_id },
    stage: {
      id: row.stage_id,
      name: row.stage_name,
      description: row.stage_description,
      type: row.stage_type,
      order: Number(row.stage_order),
      status: row.stage_status,
      responsibleRole: row.responsible_role,
      instructions: row.instructions,
      requiresEvidence: Number(row.requires_evidence) === 1,
      requiresApproval: Number(row.requires_approval) === 1,
      startedAt: row.stage_started_at,
      submittedAt: row.stage_submitted_at,
      completedAt: row.stage_completed_at,
      response: parseJson(row.response_json, {}),
      notes: row.stage_notes,
    },
    evidenceCount,
    permissions: permissions(row, evidenceCount),
  };
}

async function listTasks(request, env) {
  const auth = await requireOperationalSession(request, env);
  if (!auth.ok) return json({ ok:false, error:auth.error, message:auth.message }, auth.status);
  const { session, db } = auth;

  const result = await db.prepare(`SELECT
      es.id execution_stage_id, es.execution_id, es.stage_id, es.stage_order,
      es.status stage_status, es.started_at stage_started_at,
      es.submitted_at stage_submitted_at, es.completed_at stage_completed_at,
      es.response_json, es.notes stage_notes,
      e.execution_code, e.title execution_title, e.status execution_status,
      e.priority, e.due_at, e.process_id, e.process_version_id,
      p.name process_name,
      s.name stage_name, s.description stage_description, s.stage_type,
      s.responsible_role, s.instructions, s.requires_evidence, s.requires_approval,
      a.id asset_id, a.asset_code, a.name asset_name, a.asset_type,
      a.location asset_location,
      (SELECT COUNT(*) FROM trace_evidences ev
       WHERE ev.tenant_id=e.tenant_id AND ev.execution_id=e.id
         AND ev.execution_stage_id=es.id) evidence_count
    FROM trace_execution_stages es
    JOIN trace_executions e ON e.id=es.execution_id
    JOIN trace_stages s ON s.id=es.stage_id AND s.process_version_id=e.process_version_id
    JOIN trace_processes p ON p.id=e.process_id AND p.tenant_id=e.tenant_id
    LEFT JOIN trace_assets a ON a.id=e.asset_id AND a.tenant_id=e.tenant_id
    WHERE e.tenant_id=? AND es.assigned_to=?
      AND es.status IN ('available','in_progress','pending_approval','correction_required','rejected')
      AND e.status NOT IN ('completed','cancelled')
      AND (? IS NULL OR e.id=?)
      AND EXISTS (
        SELECT 1 FROM trace_execution_participants ep
        WHERE ep.tenant_id=e.tenant_id AND ep.execution_id=e.id
          AND ep.user_id=? AND ep.status='active'
      )
    ORDER BY
      CASE es.status
        WHEN 'correction_required' THEN 1 WHEN 'rejected' THEN 1
        WHEN 'in_progress' THEN 2 WHEN 'available' THEN 3
        WHEN 'pending_approval' THEN 4 ELSE 5 END,
      CASE e.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
      COALESCE(e.due_at,'9999-12-31 23:59:59'), es.stage_order`).bind(
        session.tenant_id,
        session.user_id,
        session.execution_id || null,
        session.execution_id || null,
        session.user_id
      ).all();

  return json({ ok:true, data:result.results.map(serialize) });
}

export async function handleTraceV1OperationalInboxApi(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== PATH) return null;
  if (request.method === "OPTIONS") return new Response(null,{status:204,headers:CORS});
  if (request.method === "GET") return listTasks(request, env);
  return null;
}
