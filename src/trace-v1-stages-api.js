import jwt from "@tsndr/cloudflare-worker-jwt";
import { getTraceDatabase } from "./trace/shared/database.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const STAGE_TYPES = new Set([
  "start",
  "operation",
  "inspection",
  "approval",
  "handoff",
  "completion",
]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS,
      "Content-Type": "application/json",
    },
  });
}

function uuid() {
  return crypto.randomUUID();
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeText(value, maxLength = 255) {
  if (value === null || value === undefined) return null;

  const normalized = String(value).trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function normalizeBoolean(value, fallback = 0) {
  if (value === undefined) return fallback;
  return value === true || value === 1 ? 1 : 0;
}

function serializeStage(row) {
  return {
    id: row.id,
    processVersionId: row.process_version_id,
    name: row.name,
    description: row.description,
    order: Number(row.stage_order),
    type: row.stage_type,
    responsibleRole: row.responsible_role,
    instructions: row.instructions,
    estimatedDurationMinutes:
      row.estimated_duration_minutes === null
        ? null
        : Number(row.estimated_duration_minutes),
    requiresEvidence: Number(row.requires_evidence) === 1,
    requiresApproval: Number(row.requires_approval) === 1,
    allowSkip: Number(row.allow_skip) === 1,
    settings: parseJson(row.settings_json, {}),
    fieldsCount: Number(row.fields_count || 0),
    createdAt: row.created_at,
  };
}

async function authenticate(request, env) {
  const authorization = request.headers.get("Authorization") || "";

  if (!authorization.startsWith("Bearer ")) {
    return {
      error: json(
        {
          ok: false,
          error: "unauthorized",
          message: "Se requiere un token de acceso.",
        },
        401
      ),
    };
  }

  const jwtSecret =
    env.JWT_SECRET || "changeme-set-in-cloudflare-dashboard";

  const token = authorization.slice(7).trim();
  const valid = await jwt.verify(token, jwtSecret);

  if (!valid) {
    return {
      error: json(
        {
          ok: false,
          error: "invalid_token",
          message: "El token de acceso no es válido.",
        },
        401
      ),
    };
  }

  const decoded = jwt.decode(token);
  const payload = decoded?.payload || {};
  const userId =
    payload.user_id ||
    payload.userId ||
    payload.id ||
    payload.sub ||
    null;

  if (!userId) {
    return {
      error: json(
        {
          ok: false,
          error: "invalid_token_payload",
          message: "El token no identifica al usuario.",
        },
        401
      ),
    };
  }

  const user = await getTraceDatabase(env).prepare(
    `SELECT id, email, role, plan, enterprise_id, is_active
     FROM users
     WHERE id = ?
     LIMIT 1`
  )
    .bind(userId)
    .first();

  if (!user || Number(user.is_active) !== 1) {
    return {
      error: json(
        {
          ok: false,
          error: "inactive_user",
          message: "El usuario no existe o está inactivo.",
        },
        401
      ),
    };
  }

  return {
    user,
    tenantId: user.enterprise_id || user.id,
  };
}

async function getEditableProcess(env, tenantId, processId) {
  return getTraceDatabase(env).prepare(
    `SELECT
       p.id,
       p.tenant_id,
       p.current_version_id,
       p.status AS process_status,
       v.status AS version_status
     FROM trace_processes p
     JOIN trace_process_versions v
       ON v.id = p.current_version_id
     WHERE p.id = ?
       AND p.tenant_id = ?
     LIMIT 1`
  )
    .bind(processId, tenantId)
    .first();
}

async function requireEditableProcess(env, tenantId, processId) {
  const process = await getEditableProcess(env, tenantId, processId);

  if (!process) {
    return {
      error: json(
        {
          ok: false,
          error: "not_found",
          message: "El proceso no existe.",
        },
        404
      ),
    };
  }

  if (process.version_status !== "draft") {
    return {
      error: json(
        {
          ok: false,
          error: "version_locked",
          message: "Solo pueden modificarse etapas de una versión en borrador.",
        },
        409
      ),
    };
  }

  return { process };
}

async function listStages(env, process) {
  const result = await getTraceDatabase(env).prepare(
    `SELECT
       s.*,
       (
         SELECT COUNT(*)
         FROM trace_stage_fields f
         WHERE f.stage_id = s.id
       ) AS fields_count
     FROM trace_stages s
     WHERE s.process_version_id = ?
     ORDER BY s.stage_order ASC, s.created_at ASC`
  )
    .bind(process.current_version_id)
    .all();

  return json({
    ok: true,
    data: result.results.map(serializeStage),
  });
}

async function createStage(request, env, process) {
  let body;

  try {
    body = await request.json();
  } catch {
    return json(
      {
        ok: false,
        error: "invalid_json",
        message: "El cuerpo enviado no contiene JSON válido.",
      },
      400
    );
  }

  const name = normalizeText(body.name, 160);

  if (!name) {
    return json(
      {
        ok: false,
        error: "validation_error",
        message: "El nombre de la etapa es obligatorio.",
      },
      422
    );
  }

  const type = normalizeText(body.type, 40) || "operation";

  if (!STAGE_TYPES.has(type)) {
    return json(
      {
        ok: false,
        error: "validation_error",
        message: "El tipo de etapa no es válido.",
      },
      422
    );
  }

  const maxOrder = await getTraceDatabase(env).prepare(
    `SELECT COALESCE(MAX(stage_order), 0) AS max_order
     FROM trace_stages
     WHERE process_version_id = ?`
  )
    .bind(process.current_version_id)
    .first();

  const stageId = uuid();
  const stageOrder = Number(maxOrder?.max_order || 0) + 1;

  const duration =
    body.estimatedDurationMinutes === undefined ||
    body.estimatedDurationMinutes === null
      ? null
      : Math.max(0, Number(body.estimatedDurationMinutes) || 0);

  const settings =
    body.settings &&
    typeof body.settings === "object" &&
    !Array.isArray(body.settings)
      ? body.settings
      : {};

  await getTraceDatabase(env).prepare(
    `INSERT INTO trace_stages (
       id,
       process_version_id,
       name,
       description,
       stage_order,
       stage_type,
       responsible_role,
       instructions,
       estimated_duration_minutes,
       requires_evidence,
       requires_approval,
       allow_skip,
       settings_json,
       created_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  )
    .bind(
      stageId,
      process.current_version_id,
      name,
      normalizeText(body.description, 2000),
      stageOrder,
      type,
      normalizeText(body.responsibleRole, 80),
      normalizeText(body.instructions, 4000),
      duration,
      normalizeBoolean(body.requiresEvidence),
      normalizeBoolean(body.requiresApproval),
      normalizeBoolean(body.allowSkip),
      JSON.stringify(settings)
    )
    .run();

  const created = await getTraceDatabase(env).prepare(
    `SELECT s.*, 0 AS fields_count
     FROM trace_stages s
     WHERE s.id = ?
     LIMIT 1`
  )
    .bind(stageId)
    .first();

  return json(
    {
      ok: true,
      data: serializeStage(created),
    },
    201
  );
}

async function updateStage(request, env, process, stageId) {
  const existing = await getTraceDatabase(env).prepare(
    `SELECT *
     FROM trace_stages
     WHERE id = ?
       AND process_version_id = ?
     LIMIT 1`
  )
    .bind(stageId, process.current_version_id)
    .first();

  if (!existing) {
    return json(
      {
        ok: false,
        error: "not_found",
        message: "La etapa no existe.",
      },
      404
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json(
      {
        ok: false,
        error: "invalid_json",
        message: "El cuerpo enviado no contiene JSON válido.",
      },
      400
    );
  }

  const name =
    body.name === undefined
      ? existing.name
      : normalizeText(body.name, 160);

  if (!name) {
    return json(
      {
        ok: false,
        error: "validation_error",
        message: "El nombre de la etapa no puede quedar vacío.",
      },
      422
    );
  }

  const type =
    body.type === undefined
      ? existing.stage_type
      : normalizeText(body.type, 40);

  if (!STAGE_TYPES.has(type)) {
    return json(
      {
        ok: false,
        error: "validation_error",
        message: "El tipo de etapa no es válido.",
      },
      422
    );
  }

  const duration =
    body.estimatedDurationMinutes === undefined
      ? existing.estimated_duration_minutes
      : body.estimatedDurationMinutes === null
        ? null
        : Math.max(0, Number(body.estimatedDurationMinutes) || 0);

  const settings =
    body.settings === undefined
      ? parseJson(existing.settings_json, {})
      : body.settings &&
          typeof body.settings === "object" &&
          !Array.isArray(body.settings)
        ? body.settings
        : {};

  await getTraceDatabase(env).prepare(
    `UPDATE trace_stages
     SET
       name = ?,
       description = ?,
       stage_type = ?,
       responsible_role = ?,
       instructions = ?,
       estimated_duration_minutes = ?,
       requires_evidence = ?,
       requires_approval = ?,
       allow_skip = ?,
       settings_json = ?
     WHERE id = ?
       AND process_version_id = ?`
  )
    .bind(
      name,
      body.description === undefined
        ? existing.description
        : normalizeText(body.description, 2000),
      type,
      body.responsibleRole === undefined
        ? existing.responsible_role
        : normalizeText(body.responsibleRole, 80),
      body.instructions === undefined
        ? existing.instructions
        : normalizeText(body.instructions, 4000),
      duration,
      normalizeBoolean(
        body.requiresEvidence,
        Number(existing.requires_evidence)
      ),
      normalizeBoolean(
        body.requiresApproval,
        Number(existing.requires_approval)
      ),
      normalizeBoolean(body.allowSkip, Number(existing.allow_skip)),
      JSON.stringify(settings),
      stageId,
      process.current_version_id
    )
    .run();

  const updated = await getTraceDatabase(env).prepare(
    `SELECT
       s.*,
       (
         SELECT COUNT(*)
         FROM trace_stage_fields f
         WHERE f.stage_id = s.id
       ) AS fields_count
     FROM trace_stages s
     WHERE s.id = ?
     LIMIT 1`
  )
    .bind(stageId)
    .first();

  return json({
    ok: true,
    data: serializeStage(updated),
  });
}

async function deleteStage(env, process, stageId) {
  const existing = await getTraceDatabase(env).prepare(
    `SELECT id
     FROM trace_stages
     WHERE id = ?
       AND process_version_id = ?
     LIMIT 1`
  )
    .bind(stageId, process.current_version_id)
    .first();

  if (!existing) {
    return json(
      {
        ok: false,
        error: "not_found",
        message: "La etapa no existe.",
      },
      404
    );
  }

  await getTraceDatabase(env).prepare(
    `DELETE FROM trace_stages
     WHERE id = ?
       AND process_version_id = ?`
  )
    .bind(stageId, process.current_version_id)
    .run();

  return json({
    ok: true,
    deletedId: stageId,
  });
}

async function reorderStages(request, env, process) {
  let body;

  try {
    body = await request.json();
  } catch {
    return json(
      {
        ok: false,
        error: "invalid_json",
        message: "El cuerpo enviado no contiene JSON válido.",
      },
      400
    );
  }

  if (!Array.isArray(body.stageIds) || body.stageIds.length === 0) {
    return json(
      {
        ok: false,
        error: "validation_error",
        message: "stageIds debe contener el orden completo de las etapas.",
      },
      422
    );
  }

  const current = await getTraceDatabase(env).prepare(
    `SELECT id
     FROM trace_stages
     WHERE process_version_id = ?
     ORDER BY stage_order`
  )
    .bind(process.current_version_id)
    .all();

  const currentIds = current.results.map((row) => row.id);
  const requestedIds = body.stageIds.map(String);

  if (
    currentIds.length !== requestedIds.length ||
    new Set(requestedIds).size !== requestedIds.length ||
    currentIds.some((id) => !requestedIds.includes(id))
  ) {
    return json(
      {
        ok: false,
        error: "validation_error",
        message: "Debe enviarse exactamente el conjunto actual de etapas.",
      },
      422
    );
  }

  const temporaryUpdates = requestedIds.map((stageId, index) =>
    getTraceDatabase(env).prepare(
      `UPDATE trace_stages
       SET stage_order = ?
       WHERE id = ?
         AND process_version_id = ?`
    ).bind(
      -(index + 1),
      stageId,
      process.current_version_id
    )
  );

  const finalUpdates = requestedIds.map((stageId, index) =>
    getTraceDatabase(env).prepare(
      `UPDATE trace_stages
       SET stage_order = ?
       WHERE id = ?
         AND process_version_id = ?`
    ).bind(
      index + 1,
      stageId,
      process.current_version_id
    )
  );

  await getTraceDatabase(env).batch([
    ...temporaryUpdates,
    ...finalUpdates,
  ]);

  return listStages(env, process);
}

export async function handleTraceV1Stages(request, env) {
  const url = new URL(request.url);

  const match = url.pathname.match(
    /^\/api\/trace\/v1\/processes\/([^/]+)\/stages(?:\/([^/]+))?$/
  );

  if (!match) return null;

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CORS,
    });
  }

  const auth = await authenticate(request, env);
  if (auth.error) return auth.error;

  const processId = decodeURIComponent(match[1]);
  const actionOrStageId = match[2]
    ? decodeURIComponent(match[2])
    : null;

  const editable = await requireEditableProcess(
    env,
    auth.tenantId,
    processId
  );

  if (editable.error) return editable.error;

  const process = editable.process;

  if (!actionOrStageId && request.method === "GET") {
    return listStages(env, process);
  }

  if (!actionOrStageId && request.method === "POST") {
    return createStage(request, env, process);
  }

  if (actionOrStageId === "reorder" && request.method === "PUT") {
    return reorderStages(request, env, process);
  }

  if (actionOrStageId && request.method === "PATCH") {
    return updateStage(
      request,
      env,
      process,
      actionOrStageId
    );
  }

  if (actionOrStageId && request.method === "DELETE") {
    return deleteStage(
      env,
      process,
      actionOrStageId
    );
  }

  return json(
    {
      ok: false,
      error: "method_not_allowed",
      message: "Método no permitido.",
    },
    405
  );
}
