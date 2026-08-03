import {
  bearerTokenFromRequest,
  findOperationalSession,
  operationalSessionIsActive,
} from "./trace/shared/operational-auth.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods":
    "GET, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Device-Id",
};

const OPERATIONAL_BASE =
  "/api/trace/v1/operational";

function json(
  data,
  status = 200
) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        ...CORS,
        "Content-Type":
          "application/json",
        "Cache-Control":
          "no-store",
      },
    }
  );
}

function taskPermissions(row) {
  const actionableStatuses =
    new Set([
      "available",
      "in_progress",
      "correction_required",
    ]);

  const actionable =
    actionableStatuses.has(
      row.stage_status
    );

  return {
    identityVerified: true,
    assignmentResolved: true,
    canViewAssignedTasks: true,
    canReportProgress: actionable,
    canUploadEvidence: actionable,
    canReportIncident: true,
    canCompleteAssignedTask:
      actionable,
    canApprove: false,
    canReassign: false,
    canManageProject: false,
  };
}

function serializeTask(row) {
  return {
    id:
      row.execution_stage_id,

    execution: {
      id:
        row.execution_id,
      code:
        row.execution_code,
      title:
        row.execution_title,
      status:
        row.execution_status,
      priority:
        row.execution_priority,
      completionPercentage:
        Number(
          row.completion_percentage ||
          0
        ),
      dueAt:
        row.due_at,
    },

    process: {
      id:
        row.process_id,
      name:
        row.process_name,
    },

    stage: {
      id:
        row.stage_id,
      name:
        row.stage_name,
      description:
        row.stage_description,
      order:
        Number(row.stage_order),
      type:
        row.stage_type,
      status:
        row.stage_status,
      responsibleRole:
        row.responsible_role,
      instructions:
        row.instructions,
      estimatedDurationMinutes:
        row.estimated_duration_minutes ===
        null
          ? null
          : Number(
              row
                .estimated_duration_minutes
            ),
      requiresEvidence:
        Number(
          row.requires_evidence
        ) === 1,
      requiresApproval:
        Number(
          row.requires_approval
        ) === 1,
      allowSkip:
        Number(
          row.allow_skip
        ) === 1,
      startedAt:
        row.stage_started_at,
      submittedAt:
        row.stage_submitted_at,
      completedAt:
        row.stage_completed_at,
      notes:
        row.stage_notes,
    },

    asset: row.asset_id
      ? {
          id:
            row.asset_id,
          code:
            row.asset_code,
          name:
            row.asset_name,
          type:
            row.asset_type,
          location:
            row.asset_location,
        }
      : null,

    assignment: {
      assignedTo:
        row.stage_assigned_to,
      participantStatus:
        "active",
    },

    permissions:
      taskPermissions(row),

    createdAt:
      row.stage_created_at,
    updatedAt:
      row.stage_updated_at,
  };
}

async function authenticateOperational(
  request,
  env
) {
  const token =
    bearerTokenFromRequest(
      request
    );

  if (!token) {
    return {
      error: json(
        {
          ok: false,
          error:
            "operational_token_required",
          message:
            "Se necesita una sesión operacional válida.",
        },
        401
      ),
    };
  }

  let result;

  try {
    result =
      await findOperationalSession(
        env,
        token
      );
  } catch {
    return {
      error: json(
        {
          ok: false,
          error:
            "authentication_configuration_error",
          message:
            "El acceso operacional no está disponible temporalmente.",
        },
        503
      ),
    };
  }

  if (
    !operationalSessionIsActive(
      result.session
    )
  ) {
    return {
      error: json(
        {
          ok: false,
          error:
            "invalid_operational_session",
          message:
            "La sesión operacional no está activa.",
        },
        401
      ),
    };
  }

  return {
    db:
      result.db,
    session:
      result.session,
  };
}

async function listOperationalTasks(
  request,
  env
) {
  const auth =
    await authenticateOperational(
      request,
      env
    );

  if (auth.error) {
    return auth.error;
  }

  const {
    db,
    session,
  } = auth;

  const result =
    await db.prepare(
      `SELECT
         es.id
           AS execution_stage_id,
         es.execution_id,
         es.stage_id,
         es.stage_order,
         es.status
           AS stage_status,
         es.assigned_to
           AS stage_assigned_to,
         es.started_at
           AS stage_started_at,
         es.submitted_at
           AS stage_submitted_at,
         es.completed_at
           AS stage_completed_at,
         es.notes
           AS stage_notes,
         es.created_at
           AS stage_created_at,
         es.updated_at
           AS stage_updated_at,

         e.execution_code,
         e.title
           AS execution_title,
         e.status
           AS execution_status,
         e.priority
           AS execution_priority,
         e.completion_percentage,
         e.due_at,
         e.process_id,
         e.asset_id,

         p.name
           AS process_name,

         s.name
           AS stage_name,
         s.description
           AS stage_description,
         s.stage_type,
         s.responsible_role,
         s.instructions,
         s.estimated_duration_minutes,
         s.requires_evidence,
         s.requires_approval,
         s.allow_skip,

         a.asset_code,
         a.name
           AS asset_name,
         a.asset_type,
         a.location
           AS asset_location

       FROM trace_execution_stages es

       JOIN trace_executions e
         ON e.id = es.execution_id

       JOIN trace_processes p
         ON p.id = e.process_id
        AND p.tenant_id =
            e.tenant_id

       JOIN trace_stages s
         ON s.id = es.stage_id

       LEFT JOIN trace_assets a
         ON a.id = e.asset_id
        AND a.tenant_id =
            e.tenant_id

       WHERE e.tenant_id = ?
         AND es.assigned_to = ?

         AND EXISTS (
           SELECT 1
           FROM
             trace_execution_participants ep
           WHERE
             ep.tenant_id =
               e.tenant_id
             AND ep.execution_id =
               e.id
             AND ep.user_id = ?
             AND ep.status =
               'active'
         )

         AND (
           ? IS NULL OR
           e.id = ?
         )

         AND e.status NOT IN (
           'completed',
           'cancelled'
         )

         AND es.status NOT IN (
           'approved',
           'completed',
           'skipped',
           'cancelled'
         )

       ORDER BY
         CASE e.priority
           WHEN 'urgent' THEN 1
           WHEN 'high' THEN 2
           WHEN 'normal' THEN 3
           WHEN 'low' THEN 4
           ELSE 5
         END,
         CASE es.status
           WHEN 'in_progress' THEN 1
           WHEN 'correction_required'
             THEN 2
           WHEN 'available' THEN 3
           WHEN 'pending_approval'
             THEN 4
           WHEN 'pending' THEN 5
           ELSE 6
         END,
         e.due_at IS NULL,
         e.due_at ASC,
         es.stage_order ASC

       LIMIT 100`
    )
      .bind(
        session.tenant_id,
        session.user_id,
        session.user_id,
        session.execution_id,
        session.execution_id
      )
      .all();

  await db.prepare(
    `UPDATE trace_auth_sessions
     SET
       last_activity_at =
         datetime('now'),
       updated_at =
         datetime('now')
     WHERE id = ?
       AND status = 'active'
       AND revoked_at IS NULL`
  )
    .bind(session.id)
    .run();

  const tasks =
    result.results.map(
      serializeTask
    );

  return json({
    ok: true,
    data: {
      tasks,
      count:
        tasks.length,
      scope: {
        tenantId:
          session.tenant_id,
        userId:
          session.user_id,
        executionId:
          session.execution_id,
      },
    },
  });
}

export async function
handleTraceV1Operational(
  request,
  env
) {
  const url =
    new URL(request.url);

  if (
    !url.pathname.startsWith(
      `${OPERATIONAL_BASE}/`
    )
  ) {
    return null;
  }

  if (
    request.method ===
    "OPTIONS"
  ) {
    return new Response(
      null,
      {
        status: 204,
        headers: CORS,
      }
    );
  }

  if (
    url.pathname ===
      `${OPERATIONAL_BASE}/tasks` &&
    request.method ===
      "GET"
  ) {
    return listOperationalTasks(
      request,
      env
    );
  }

  return json(
    {
      ok: false,
      error: "route_not_found",
      message:
        "La ruta operacional solicitada no existe.",
    },
    404
  );
}
