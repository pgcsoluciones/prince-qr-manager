import { requireOperationalSession } from "./trace/shared/operational-auth.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Device-Id",
};

const OPERATIONAL_BASE = "/api/trace/v1/operational";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function serializeTask(row) {
  return {
    id: row.execution_stage_id,
    executionId: row.execution_id,
    executionCode: row.execution_code,
    executionTitle: row.execution_title,
    executionStatus: row.execution_status,
    priority: row.priority,
    dueAt: row.due_at,
    asset: row.asset_id
      ? {
          id: row.asset_id,
          code: row.asset_code,
          name: row.asset_name,
          type: row.asset_type,
          location: row.asset_location,
        }
      : null,
    process: {
      id: row.process_id,
      name: row.process_name,
      versionId: row.process_version_id,
    },
    stage: {
      id: row.stage_id,
      name: row.stage_name,
      type: row.stage_type,
      order: Number(row.stage_order),
      status: row.stage_status,
      responsibleRole: row.responsible_role,
      instructions: row.instructions,
      requiresEvidence: Number(row.requires_evidence) === 1,
      requiresApproval: Number(row.requires_approval) === 1,
      startedAt: row.stage_started_at,
    },
  };
}

async function listMyTasks(request, env) {
  const auth = await requireOperationalSession(request, env);

  if (!auth.ok) {
    return json(
      {
        ok: false,
        error: auth.error,
        message: auth.message,
      },
      auth.status
    );
  }

  const { session, db } = auth;

  const result = await db.prepare(
    `SELECT
       es.id AS execution_stage_id,
       es.execution_id,
       es.stage_id,
       es.stage_order,
       es.status AS stage_status,
       es.started_at AS stage_started_at,
       e.execution_code,
       e.title AS execution_title,
       e.status AS execution_status,
       e.priority,
       e.due_at,
       e.process_id,
       e.process_version_id,
       p.name AS process_name,
       s.name AS stage_name,
       s.stage_type,
       s.responsible_role,
       s.instructions,
       s.requires_evidence,
       s.requires_approval,
       a.id AS asset_id,
       a.asset_code,
       a.name AS asset_name,
       a.asset_type,
       a.location AS asset_location
     FROM trace_execution_stages es
     JOIN trace_executions e
       ON e.id = es.execution_id
      AND e.tenant_id = es.tenant_id
     JOIN trace_stages s
       ON s.id = es.stage_id
     JOIN trace_processes p
       ON p.id = e.process_id
      AND p.tenant_id = e.tenant_id
     LEFT JOIN trace_assets a
       ON a.id = e.asset_id
      AND a.tenant_id = e.tenant_id
     WHERE es.tenant_id = ?
       AND es.assigned_to = ?
       AND es.status IN ('available', 'in_progress')
       AND e.status NOT IN ('completed', 'cancelled')
       AND EXISTS (
         SELECT 1
         FROM trace_execution_participants ep
         WHERE ep.tenant_id = es.tenant_id
           AND ep.execution_id = es.execution_id
           AND ep.user_id = ?
       )
     ORDER BY
       CASE e.priority
         WHEN 'critical' THEN 1
         WHEN 'high' THEN 2
         WHEN 'normal' THEN 3
         WHEN 'low' THEN 4
         ELSE 5
       END,
       COALESCE(e.due_at, '9999-12-31 23:59:59'),
       es.stage_order ASC`
  )
    .bind(
      session.tenant_id,
      session.user_id,
      session.user_id
    )
    .all();

  return json({
    ok: true,
    data: result.results.map(serializeTask),
  });
}

export async function handleTraceV1OperationalApi(request, env) {
  const url = new URL(request.url);

  if (!url.pathname.startsWith(OPERATIONAL_BASE)) {
    return null;
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CORS,
    });
  }

  if (
    request.method === "GET" &&
    url.pathname === `${OPERATIONAL_BASE}/tasks`
  ) {
    return listMyTasks(request, env);
  }

  return json(
    {
      ok: false,
      error: "not_found",
      message: "La ruta operacional solicitada no existe.",
    },
    404
  );
}
