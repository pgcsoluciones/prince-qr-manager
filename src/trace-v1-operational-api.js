import { requireOperationalSession } from "./trace/shared/operational-auth.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Device-Id",
};

const OPERATIONAL_BASE = "/api/trace/v1/operational";
const MAX_EVIDENCE_BYTES = 20 * 1024 * 1024;

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

function uuid() {
  return crypto.randomUUID();
}

function normalizeText(value, maxLength = 2000) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function normalizeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function eventSourceForSession(session) {
  return session.role === "supervisor" ? "supervisor" : "operator";
}

function taskPermissions(row, evidenceCount = 0) {
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
    canComplete:
      status === "in_progress" &&
      (!requiresEvidence || evidenceCount > 0),
    requiresEvidence,
    requiresApproval: Number(row.requires_approval) === 1,
  };
}

function serializeEvidence(row) {
  return {
    id: row.id,
    type: row.evidence_type,
    fieldId: row.field_id,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    fileSize: Number(row.file_size || 0),
    checksum: row.checksum,
    metadata: parseJson(row.metadata_json, {}),
    uploadedBy: row.uploaded_by,
    capturedAt: row.captured_at,
    createdAt: row.created_at,
  };
}

function serializeTask(row, evidenceCount = Number(row.evidence_count || 0)) {
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
    permissions: taskPermissions(row, evidenceCount),
  };
}

async function auditOperational(db, session, eventType, details = {}, executionId = null) {
  try {
    await db.prepare(
      `INSERT INTO trace_auth_audit_log (
         id,
         tenant_id,
         user_id,
         session_id,
         challenge_id,
         event_type,
         result,
         project_id,
         execution_id,
         request_user_agent,
         details_json,
         created_at
       )
       VALUES (?, ?, ?, ?, ?, ?, 'success', ?, ?, ?, ?, datetime('now'))`
    ).bind(
      uuid(),
      session.tenant_id,
      session.user_id,
      session.id,
      session.challenge_id || null,
      eventType,
      session.project_id || null,
      executionId || session.execution_id || null,
      null,
      JSON.stringify(details)
    ).run();
  } catch (error) {
    console.error("TRACE operational audit failed:", error);
  }
}

async function taskContext(db, session, executionStageId) {
  return db.prepare(
    `SELECT
       es.id AS execution_stage_id,
       es.execution_id,
       es.stage_id,
       es.stage_order,
       es.status AS stage_status,
       es.assigned_to,
       es.started_at AS stage_started_at,
       es.submitted_at AS stage_submitted_at,
       es.completed_at AS stage_completed_at,
       es.response_json,
       es.notes AS stage_notes,
       e.tenant_id,
       e.execution_code,
       e.title AS execution_title,
       e.status AS execution_status,
       e.priority,
       e.due_at,
       e.process_id,
       e.process_version_id,
       e.asset_id,
       p.name AS process_name,
       s.name AS stage_name,
       s.description AS stage_description,
       s.stage_type,
       s.responsible_role,
       s.instructions,
       s.requires_evidence,
       s.requires_approval,
       a.asset_code,
       a.name AS asset_name,
       a.asset_type,
       a.location AS asset_location,
       (
         SELECT COUNT(*)
         FROM trace_evidences ev
         WHERE ev.tenant_id = e.tenant_id
           AND ev.execution_id = e.id
           AND ev.execution_stage_id = es.id
       ) AS evidence_count
     FROM trace_execution_stages es
     JOIN trace_executions e
       ON e.id = es.execution_id
     JOIN trace_stages s
       ON s.id = es.stage_id
      AND s.process_version_id = e.process_version_id
     JOIN trace_processes p
       ON p.id = e.process_id
      AND p.tenant_id = e.tenant_id
     LEFT JOIN trace_assets a
       ON a.id = e.asset_id
      AND a.tenant_id = e.tenant_id
     WHERE es.id = ?
       AND e.tenant_id = ?
       AND es.assigned_to = ?
       AND (? IS NULL OR e.id = ?)
       AND EXISTS (
         SELECT 1
         FROM trace_execution_participants ep
         WHERE ep.tenant_id = e.tenant_id
           AND ep.execution_id = e.id
           AND ep.user_id = ?
           AND ep.status = 'active'
       )
     LIMIT 1`
  ).bind(
    executionStageId,
    session.tenant_id,
    session.user_id,
    session.execution_id || null,
    session.execution_id || null,
    session.user_id
  ).first();
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
       es.submitted_at AS stage_submitted_at,
       es.completed_at AS stage_completed_at,
       es.response_json,
       es.notes AS stage_notes,
       e.execution_code,
       e.title AS execution_title,
       e.status AS execution_status,
       e.priority,
       e.due_at,
       e.process_id,
       e.process_version_id,
       p.name AS process_name,
       s.name AS stage_name,
       s.description AS stage_description,
       s.stage_type,
       s.responsible_role,
       s.instructions,
       s.requires_evidence,
       s.requires_approval,
       a.id AS asset_id,
       a.asset_code,
       a.name AS asset_name,
       a.asset_type,
       a.location AS asset_location,
       (
         SELECT COUNT(*)
         FROM trace_evidences ev
         WHERE ev.tenant_id = e.tenant_id
           AND ev.execution_id = e.id
           AND ev.execution_stage_id = es.id
       ) AS evidence_count
     FROM trace_execution_stages es
     JOIN trace_executions e
       ON e.id = es.execution_id
     JOIN trace_stages s
       ON s.id = es.stage_id
      AND s.process_version_id = e.process_version_id
     JOIN trace_processes p
       ON p.id = e.process_id
      AND p.tenant_id = e.tenant_id
     LEFT JOIN trace_assets a
       ON a.id = e.asset_id
      AND a.tenant_id = e.tenant_id
     WHERE e.tenant_id = ?
       AND es.assigned_to = ?
       AND es.status IN ('available', 'in_progress')
       AND e.status NOT IN ('completed', 'cancelled')
       AND (? IS NULL OR e.id = ?)
       AND EXISTS (
         SELECT 1
         FROM trace_execution_participants ep
         WHERE ep.tenant_id = e.tenant_id
           AND ep.execution_id = e.id
           AND ep.user_id = ?
           AND ep.status = 'active'
       )
     ORDER BY
       CASE e.priority
         WHEN 'urgent' THEN 1
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
      session.execution_id || null,
      session.execution_id || null,
      session.user_id
    )
    .all();

  await auditOperational(
    db,
    session,
    "operational.tasks.viewed",
    { count: result.results.length }
  );

  return json({
    ok: true,
    data: result.results.map((row) => serializeTask(row)),
  });
}

async function getTaskDetail(request, env, executionStageId) {
  const auth = await requireOperationalSession(request, env);
  if (!auth.ok) {
    return json({ ok: false, error: auth.error, message: auth.message }, auth.status);
  }

  const { session, db } = auth;
  const task = await taskContext(db, session, executionStageId);

  if (!task) {
    return json(
      {
        ok: false,
        error: "task_not_available",
        message: "La tarea no existe o no está asignada a esta sesión.",
      },
      404
    );
  }

  const [fields, evidences, events] = await Promise.all([
    db.prepare(
      `SELECT
         id,
         field_key,
         label,
         description,
         field_type,
         field_order,
         is_required,
         options_json,
         validation_json,
         conditional_json,
         default_value_json
       FROM trace_stage_fields
       WHERE stage_id = ?
       ORDER BY field_order ASC, created_at ASC`
    ).bind(task.stage_id).all(),

    db.prepare(
      `SELECT
         id,
         evidence_type,
         field_id,
         original_filename,
         mime_type,
         file_size,
         checksum,
         metadata_json,
         uploaded_by,
         captured_at,
         created_at
       FROM trace_evidences
       WHERE tenant_id = ?
         AND execution_id = ?
         AND execution_stage_id = ?
       ORDER BY created_at DESC`
    ).bind(
      session.tenant_id,
      task.execution_id,
      task.execution_stage_id
    ).all(),

    db.prepare(
      `SELECT
         id,
         event_type,
         event_source,
         actor_user_id,
         actor_role,
         description,
         payload_json,
         occurred_at
       FROM trace_events
       WHERE tenant_id = ?
         AND execution_id = ?
         AND execution_stage_id = ?
       ORDER BY occurred_at DESC
       LIMIT 30`
    ).bind(
      session.tenant_id,
      task.execution_id,
      task.execution_stage_id
    ).all(),
  ]);

  await auditOperational(
    db,
    session,
    "operational.task.opened",
    { executionStageId },
    task.execution_id
  );

  return json({
    ok: true,
    data: {
      ...serializeTask(task, evidences.results.length),
      fields: fields.results.map((field) => ({
        id: field.id,
        key: field.field_key,
        label: field.label,
        description: field.description,
        type: field.field_type,
        order: Number(field.field_order),
        required: Number(field.is_required) === 1,
        options: parseJson(field.options_json, []),
        validation: parseJson(field.validation_json, {}),
        conditional: parseJson(field.conditional_json, {}),
        defaultValue: parseJson(field.default_value_json, null),
      })),
      evidences: evidences.results.map(serializeEvidence),
      events: events.results.map((event) => ({
        id: event.id,
        type: event.event_type,
        source: event.event_source,
        actorUserId: event.actor_user_id,
        actorRole: event.actor_role,
        description: event.description,
        payload: parseJson(event.payload_json, {}),
        occurredAt: event.occurred_at,
      })),
    },
  });
}

async function startTask(request, env, executionStageId) {
  const auth = await requireOperationalSession(request, env);
  if (!auth.ok) {
    return json({ ok: false, error: auth.error, message: auth.message }, auth.status);
  }

  const { session, db } = auth;
  const task = await taskContext(db, session, executionStageId);

  if (!task) {
    return json({ ok: false, error: "task_not_available", message: "La tarea no está asignada a esta sesión." }, 404);
  }

  if (task.stage_status !== "available") {
    return json(
      {
        ok: false,
        error: "invalid_stage_state",
        message: "Solo una etapa disponible puede iniciarse.",
      },
      409
    );
  }

  const eventId = uuid();

  await db.batch([
    db.prepare(
      `UPDATE trace_execution_stages
       SET status = 'in_progress',
           started_at = COALESCE(started_at, datetime('now')),
           updated_at = datetime('now')
       WHERE id = ?
         AND assigned_to = ?
         AND status = 'available'`
    ).bind(executionStageId, session.user_id),

    db.prepare(
      `UPDATE trace_executions
       SET status = 'in_progress',
           current_stage_id = ?,
           started_at = COALESCE(started_at, datetime('now')),
           updated_at = datetime('now')
       WHERE id = ?
         AND tenant_id = ?`
    ).bind(
      task.stage_id,
      task.execution_id,
      session.tenant_id
    ),

    db.prepare(
      `INSERT INTO trace_events (
         id,
         tenant_id,
         execution_id,
         execution_stage_id,
         asset_id,
         event_type,
         event_source,
         actor_user_id,
         actor_role,
         description,
         payload_json,
         occurred_at,
         received_at
       )
       VALUES (?, ?, ?, ?, ?, 'stage.started', ?, ?, ?, ?, '{}', datetime('now'), datetime('now'))`
    ).bind(
      eventId,
      session.tenant_id,
      task.execution_id,
      executionStageId,
      task.asset_id || null,
      eventSourceForSession(session),
      session.user_id,
      session.role,
      `Etapa iniciada: ${task.stage_name}`
    ),
  ]);

  await auditOperational(
    db,
    session,
    "operational.task.started",
    { executionStageId, stageId: task.stage_id },
    task.execution_id
  );

  return getTaskDetail(request, env, executionStageId);
}

async function updateTaskProgress(request, env, executionStageId) {
  const auth = await requireOperationalSession(request, env);
  if (!auth.ok) {
    return json({ ok: false, error: auth.error, message: auth.message }, auth.status);
  }

  const { session, db } = auth;
  const task = await taskContext(db, session, executionStageId);

  if (!task) {
    return json({ ok: false, error: "task_not_available", message: "La tarea no está asignada a esta sesión." }, 404);
  }

  if (task.stage_status !== "in_progress") {
    return json(
      {
        ok: false,
        error: "invalid_stage_state",
        message: "La etapa debe estar en progreso para registrar avances.",
      },
      409
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "invalid_json", message: "El cuerpo enviado no contiene JSON válido." }, 400);
  }

  const response = normalizeObject(body.response, parseJson(task.response_json, {}));
  const notes = normalizeText(body.notes, 4000);
  const description = normalizeText(body.description, 500) || "Avance operacional registrado.";
  const eventId = uuid();

  await db.batch([
    db.prepare(
      `UPDATE trace_execution_stages
       SET response_json = ?,
           notes = COALESCE(?, notes),
           updated_at = datetime('now')
       WHERE id = ?
         AND assigned_to = ?
         AND status = 'in_progress'`
    ).bind(
      JSON.stringify(response),
      notes,
      executionStageId,
      session.user_id
    ),

    db.prepare(
      `INSERT INTO trace_events (
         id,
         tenant_id,
         execution_id,
         execution_stage_id,
         asset_id,
         event_type,
         event_source,
         actor_user_id,
         actor_role,
         description,
         payload_json,
         occurred_at,
         received_at
       )
       VALUES (?, ?, ?, ?, ?, 'stage.progressed', ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).bind(
      eventId,
      session.tenant_id,
      task.execution_id,
      executionStageId,
      task.asset_id || null,
      eventSourceForSession(session),
      session.user_id,
      session.role,
      description,
      JSON.stringify({
        responseKeys: Object.keys(response).slice(0, 50),
        hasNotes: Boolean(notes),
      })
    ),
  ]);

  await auditOperational(
    db,
    session,
    "operational.task.progressed",
    { executionStageId },
    task.execution_id
  );

  return getTaskDetail(request, env, executionStageId);
}

function inferEvidenceType(mimeType) {
  if (mimeType.startsWith("image/")) return "photo";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "file";
}

async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function addEvidence(request, env, executionStageId) {
  const auth = await requireOperationalSession(request, env);
  if (!auth.ok) {
    return json({ ok: false, error: auth.error, message: auth.message }, auth.status);
  }

  const { session, db } = auth;
  const task = await taskContext(db, session, executionStageId);

  if (!task) {
    return json({ ok: false, error: "task_not_available", message: "La tarea no está asignada a esta sesión." }, 404);
  }

  if (task.stage_status !== "in_progress") {
    return json(
      {
        ok: false,
        error: "invalid_stage_state",
        message: "La etapa debe estar en progreso para adjuntar evidencia.",
      },
      409
    );
  }

  if (!env.ASSETS) {
    return json(
      {
        ok: false,
        error: "evidence_storage_unavailable",
        message: "El almacenamiento de evidencias no está configurado.",
      },
      503
    );
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return json(
      {
        ok: false,
        error: "invalid_multipart",
        message: "La evidencia debe enviarse como multipart/form-data.",
      },
      400
    );
  }

  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return json({ ok: false, error: "file_required", message: "Debes adjuntar un archivo." }, 422);
  }

  if (file.size <= 0 || file.size > MAX_EVIDENCE_BYTES) {
    return json(
      {
        ok: false,
        error: "invalid_file_size",
        message: "La evidencia debe pesar entre 1 byte y 20 MB.",
      },
      422
    );
  }

  const allowedMimePrefixes = ["image/", "video/", "audio/"];
  const allowedExactMimeTypes = [
    "application/pdf",
    "text/plain",
    "application/octet-stream",
  ];
  const mimeType = file.type || "application/octet-stream";

  if (
    !allowedMimePrefixes.some((prefix) => mimeType.startsWith(prefix)) &&
    !allowedExactMimeTypes.includes(mimeType)
  ) {
    return json(
      {
        ok: false,
        error: "unsupported_file_type",
        message: "El formato de la evidencia no está permitido.",
      },
      422
    );
  }

  const fieldId = normalizeText(formData.get("fieldId"), 100);
  if (fieldId) {
    const field = await db.prepare(
      `SELECT id
       FROM trace_stage_fields
       WHERE id = ?
         AND stage_id = ?
       LIMIT 1`
    ).bind(fieldId, task.stage_id).first();

    if (!field) {
      return json(
        {
          ok: false,
          error: "invalid_field",
          message: "El campo de evidencia no pertenece a esta etapa.",
        },
        422
      );
    }
  }

  const metadataRaw = normalizeText(formData.get("metadata"), 8000);
  let metadata = {};
  if (metadataRaw) {
    try {
      metadata = normalizeObject(JSON.parse(metadataRaw), {});
    } catch {
      return json({ ok: false, error: "invalid_metadata", message: "metadata debe contener JSON válido." }, 422);
    }
  }

  const capturedAt = normalizeText(formData.get("capturedAt"), 80);
  const originalFilename = normalizeText(file.name, 255) || "evidence";
  const evidenceType = inferEvidenceType(mimeType);
  const evidenceId = uuid();
  const extension = originalFilename.includes(".")
    ? originalFilename.split(".").pop().replace(/[^A-Za-z0-9]/g, "").slice(0, 10)
    : "bin";
  const r2Key =
    `trace/${session.tenant_id}/${task.execution_id}/${executionStageId}/${evidenceId}.${extension || "bin"}`;

  const buffer = await file.arrayBuffer();
  const checksum = await sha256Hex(buffer);

  await env.ASSETS.put(r2Key, buffer, {
    httpMetadata: {
      contentType: mimeType,
    },
    customMetadata: {
      tenantId: session.tenant_id,
      executionId: task.execution_id,
      executionStageId,
      uploadedBy: session.user_id,
    },
  });

  const eventId = uuid();

  try {
    await db.batch([
      db.prepare(
        `INSERT INTO trace_events (
           id,
           tenant_id,
           execution_id,
           execution_stage_id,
           asset_id,
           event_type,
           event_source,
           actor_user_id,
           actor_role,
           description,
           payload_json,
           occurred_at,
           received_at
         )
         VALUES (?, ?, ?, ?, ?, 'evidence.added', ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
      ).bind(
        eventId,
        session.tenant_id,
        task.execution_id,
        executionStageId,
        task.asset_id || null,
        eventSourceForSession(session),
        session.user_id,
        session.role,
        `Evidencia añadida a la etapa: ${task.stage_name}`,
        JSON.stringify({
          evidenceId,
          evidenceType,
          mimeType,
          fileSize: file.size,
          fieldId,
        })
      ),

      db.prepare(
        `INSERT INTO trace_evidences (
           id,
           tenant_id,
           execution_id,
           execution_stage_id,
           field_id,
           event_id,
           evidence_type,
           r2_key,
           public_url,
           original_filename,
           mime_type,
           file_size,
           checksum,
           metadata_json,
           uploaded_by,
           captured_at,
           created_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      ).bind(
        evidenceId,
        session.tenant_id,
        task.execution_id,
        executionStageId,
        fieldId,
        eventId,
        evidenceType,
        r2Key,
        originalFilename,
        mimeType,
        file.size,
        checksum,
        JSON.stringify(metadata),
        session.user_id,
        capturedAt
      ),
    ]);
  } catch (error) {
    await env.ASSETS.delete(r2Key).catch(() => {});
    throw error;
  }

  await auditOperational(
    db,
    session,
    "operational.evidence.added",
    { executionStageId, evidenceId, evidenceType, fileSize: file.size },
    task.execution_id
  );

  return json(
    {
      ok: true,
      data: {
        id: evidenceId,
        type: evidenceType,
        originalFilename,
        mimeType,
        fileSize: file.size,
        checksum,
        fieldId,
        capturedAt,
      },
    },
    201
  );
}

async function completeTask(request, env, executionStageId) {
  const auth = await requireOperationalSession(request, env);
  if (!auth.ok) {
    return json({ ok: false, error: auth.error, message: auth.message }, auth.status);
  }

  const { session, db } = auth;
  const task = await taskContext(db, session, executionStageId);

  if (!task) {
    return json({ ok: false, error: "task_not_available", message: "La tarea no está asignada a esta sesión." }, 404);
  }

  if (task.stage_status !== "in_progress") {
    return json(
      {
        ok: false,
        error: "invalid_stage_state",
        message: "La etapa debe estar en progreso para completarse.",
      },
      409
    );
  }

  const evidenceCount = Number(task.evidence_count || 0);
  if (Number(task.requires_evidence) === 1 && evidenceCount < 1) {
    return json(
      {
        ok: false,
        error: "evidence_required",
        message: "Esta etapa requiere al menos una evidencia antes de completarse.",
      },
      422
    );
  }

  if (Number(task.requires_approval) === 1) {
    const eventId = uuid();

    await db.batch([
      db.prepare(
        `UPDATE trace_execution_stages
         SET status = 'pending_approval',
             submitted_at = datetime('now'),
             updated_at = datetime('now')
         WHERE id = ?
           AND assigned_to = ?
           AND status = 'in_progress'`
      ).bind(executionStageId, session.user_id),

      db.prepare(
        `UPDATE trace_executions
         SET status = 'pending_approval',
             updated_at = datetime('now')
         WHERE id = ?
           AND tenant_id = ?`
      ).bind(task.execution_id, session.tenant_id),

      db.prepare(
        `INSERT INTO trace_events (
           id,
           tenant_id,
           execution_id,
           execution_stage_id,
           asset_id,
           event_type,
           event_source,
           actor_user_id,
           actor_role,
           description,
           payload_json,
           occurred_at,
           received_at
         )
         VALUES (?, ?, ?, ?, ?, 'stage.submitted', ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
      ).bind(
        eventId,
        session.tenant_id,
        task.execution_id,
        executionStageId,
        task.asset_id || null,
        eventSourceForSession(session),
        session.user_id,
        session.role,
        `Etapa enviada a aprobación: ${task.stage_name}`,
        JSON.stringify({ evidenceCount })
      ),
    ]);

    await auditOperational(
      db,
      session,
      "operational.task.submitted",
      { executionStageId, evidenceCount },
      task.execution_id
    );

    return json({
      ok: true,
      data: {
        executionStageId,
        status: "pending_approval",
        requiresApproval: true,
      },
    });
  }

  const nextStage = await db.prepare(
    `SELECT id, stage_id, stage_order, assigned_to
     FROM trace_execution_stages
     WHERE execution_id = ?
       AND stage_order > ?
       AND status = 'pending'
     ORDER BY stage_order ASC
     LIMIT 1`
  ).bind(task.execution_id, task.stage_order).first();

  const completedCountRow = await db.prepare(
    `SELECT COUNT(*) AS count
     FROM trace_execution_stages
     WHERE execution_id = ?
       AND status IN ('completed', 'approved', 'skipped')`
  ).bind(task.execution_id).first();

  const totalCountRow = await db.prepare(
    `SELECT COUNT(*) AS count
     FROM trace_execution_stages
     WHERE execution_id = ?`
  ).bind(task.execution_id).first();

  const completedAfter = Number(completedCountRow?.count || 0) + 1;
  const totalStages = Math.max(1, Number(totalCountRow?.count || 1));
  const completionPercentage = Math.min(
    100,
    Math.round((completedAfter / totalStages) * 100)
  );

  const eventId = uuid();
  const statements = [
    db.prepare(
      `UPDATE trace_execution_stages
       SET status = 'completed',
           submitted_at = COALESCE(submitted_at, datetime('now')),
           completed_at = datetime('now'),
           updated_at = datetime('now')
       WHERE id = ?
         AND assigned_to = ?
         AND status = 'in_progress'`
    ).bind(executionStageId, session.user_id),

    db.prepare(
      `INSERT INTO trace_events (
         id,
         tenant_id,
         execution_id,
         execution_stage_id,
         asset_id,
         event_type,
         event_source,
         actor_user_id,
         actor_role,
         description,
         payload_json,
         occurred_at,
         received_at
       )
       VALUES (?, ?, ?, ?, ?, 'stage.completed', ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).bind(
      eventId,
      session.tenant_id,
      task.execution_id,
      executionStageId,
      task.asset_id || null,
      eventSourceForSession(session),
      session.user_id,
      session.role,
      `Etapa completada: ${task.stage_name}`,
      JSON.stringify({ evidenceCount, completionPercentage })
    ),
  ];

  if (nextStage) {
    statements.push(
      db.prepare(
        `UPDATE trace_execution_stages
         SET status = 'available',
             updated_at = datetime('now')
         WHERE id = ?
           AND status = 'pending'`
      ).bind(nextStage.id),

      db.prepare(
        `UPDATE trace_executions
         SET status = 'in_progress',
             current_stage_id = ?,
             completion_percentage = ?,
             updated_at = datetime('now')
         WHERE id = ?
           AND tenant_id = ?`
      ).bind(
        nextStage.stage_id,
        completionPercentage,
        task.execution_id,
        session.tenant_id
      )
    );
  } else {
    const executionEventId = uuid();
    statements.push(
      db.prepare(
        `UPDATE trace_executions
         SET status = 'completed',
             current_stage_id = NULL,
             completion_percentage = 100,
             completed_at = datetime('now'),
             updated_at = datetime('now')
         WHERE id = ?
           AND tenant_id = ?`
      ).bind(task.execution_id, session.tenant_id),

      db.prepare(
        `INSERT INTO trace_events (
           id,
           tenant_id,
           execution_id,
           execution_stage_id,
           asset_id,
           event_type,
           event_source,
           actor_user_id,
           actor_role,
           description,
           payload_json,
           occurred_at,
           received_at
         )
         VALUES (?, ?, ?, NULL, ?, 'execution.completed', ?, ?, ?, ?, '{}', datetime('now'), datetime('now'))`
      ).bind(
        executionEventId,
        session.tenant_id,
        task.execution_id,
        task.asset_id || null,
        eventSourceForSession(session),
        session.user_id,
        session.role,
        `Ejecución completada: ${task.execution_title || task.execution_code}`
      )
    );
  }

  await db.batch(statements);

  await auditOperational(
    db,
    session,
    "operational.task.completed",
    {
      executionStageId,
      evidenceCount,
      nextExecutionStageId: nextStage?.id || null,
      executionCompleted: !nextStage,
    },
    task.execution_id
  );

  return json({
    ok: true,
    data: {
      executionStageId,
      status: "completed",
      completionPercentage: nextStage ? completionPercentage : 100,
      nextTaskAvailable:
        nextStage?.assigned_to === session.user_id
          ? nextStage.id
          : null,
      executionCompleted: !nextStage,
    },
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

  const taskMatch = url.pathname.match(
    /^\/api\/trace\/v1\/operational\/tasks\/([^/]+)$/
  );

  if (request.method === "GET" && taskMatch) {
    return getTaskDetail(request, env, decodeURIComponent(taskMatch[1]));
  }

  const actionMatch = url.pathname.match(
    /^\/api\/trace\/v1\/operational\/tasks\/([^/]+)\/(start|progress|complete|evidence)$/
  );

  if (request.method === "POST" && actionMatch) {
    const executionStageId = decodeURIComponent(actionMatch[1]);
    const action = actionMatch[2];

    if (action === "start") {
      return startTask(request, env, executionStageId);
    }

    if (action === "progress") {
      return updateTaskProgress(request, env, executionStageId);
    }

    if (action === "complete") {
      return completeTask(request, env, executionStageId);
    }

    if (action === "evidence") {
      return addEvidence(request, env, executionStageId);
    }
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
