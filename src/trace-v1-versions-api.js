import jwt from "@tsndr/cloudflare-worker-jwt";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

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

async function authenticate(request, env) {
  const authorization =
    request.headers.get("Authorization") || "";

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
    env.JWT_SECRET ||
    "changeme-set-in-cloudflare-dashboard";

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

  const user = await env.DB.prepare(
    `SELECT
       id,
       email,
       role,
       plan,
       enterprise_id,
       is_active
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

async function getProcessContext(
  env,
  tenantId,
  processId
) {
  return env.DB.prepare(
    `SELECT
       p.id,
       p.tenant_id,
       p.name,
       p.description,
       p.status AS process_status,
       p.current_version_id,
       v.version_number,
       v.status AS version_status,
       v.name AS version_name,
       v.description AS version_description,
       v.schema_json
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

async function validatePublication(
  env,
  process
) {
  const stages = await env.DB.prepare(
    `SELECT
       s.id,
       s.name,
       s.stage_order,
       s.stage_type,
       s.requires_evidence,
       s.requires_approval,
       COUNT(f.id) AS fields_count
     FROM trace_stages s
     LEFT JOIN trace_stage_fields f
       ON f.stage_id = s.id
     WHERE s.process_version_id = ?
     GROUP BY
       s.id,
       s.name,
       s.stage_order,
       s.stage_type,
       s.requires_evidence,
       s.requires_approval
     ORDER BY s.stage_order ASC`
  )
    .bind(process.current_version_id)
    .all();

  const errors = [];
  const rows = stages.results;

  if (rows.length < 2) {
    errors.push({
      code: "insufficient_stages",
      message:
        "El proceso debe contener por lo menos dos etapas.",
    });
  }

  const orders = rows.map(
    (stage) => Number(stage.stage_order)
  );

  const expectedOrders = rows.map(
    (_, index) => index + 1
  );

  if (
    orders.length &&
    orders.some(
      (order, index) =>
        order !== expectedOrders[index]
    )
  ) {
    errors.push({
      code: "invalid_stage_order",
      message:
        "Las etapas deben tener un orden continuo comenzando en uno.",
    });
  }

  const startStages = rows.filter(
    (stage) => stage.stage_type === "start"
  );

  if (startStages.length !== 1) {
    errors.push({
      code: "invalid_start_stage",
      message:
        "El proceso debe tener exactamente una etapa de inicio.",
    });
  }

  const completionStages = rows.filter(
    (stage) => stage.stage_type === "completion"
  );

  if (completionStages.length !== 1) {
    errors.push({
      code: "invalid_completion_stage",
      message:
        "El proceso debe tener exactamente una etapa de cierre.",
    });
  }

  if (
    rows.length &&
    rows[0].stage_type !== "start"
  ) {
    errors.push({
      code: "start_stage_order",
      message:
        "La primera etapa debe ser la etapa de inicio.",
    });
  }

  if (
    rows.length &&
    rows[rows.length - 1].stage_type !==
      "completion"
  ) {
    errors.push({
      code: "completion_stage_order",
      message:
        "La última etapa debe ser la etapa de cierre.",
    });
  }

  const fields = await env.DB.prepare(
    `SELECT
       f.id,
       f.stage_id,
       f.field_key,
       f.label,
       f.field_type,
       f.field_order,
       f.is_required,
       f.options_json,
       f.validation_json,
       f.conditional_json,
       f.default_value_json
     FROM trace_stage_fields f
     JOIN trace_stages s
       ON s.id = f.stage_id
     WHERE s.process_version_id = ?
     ORDER BY
       s.stage_order ASC,
       f.field_order ASC`
  )
    .bind(process.current_version_id)
    .all();

  const schema = {
    processId: process.id,
    versionId: process.current_version_id,
    versionNumber: Number(
      process.version_number
    ),
    stages: rows.map((stage) => ({
      id: stage.id,
      name: stage.name,
      order: Number(stage.stage_order),
      type: stage.stage_type,
      requiresEvidence:
        Number(stage.requires_evidence) === 1,
      requiresApproval:
        Number(stage.requires_approval) === 1,
      fieldsCount: Number(
        stage.fields_count || 0
      ),
      fields: fields.results
        .filter(
          (field) =>
            field.stage_id === stage.id
        )
        .map((field) => ({
          id: field.id,
          key: field.field_key,
          label: field.label,
          type: field.field_type,
          order: Number(field.field_order),
          required:
            Number(field.is_required) === 1,
        })),
    })),
  };

  return {
    valid: errors.length === 0,
    errors,
    schema,
    stagesCount: rows.length,
    fieldsCount: fields.results.length,
  };
}

async function publishVersion(
  env,
  auth,
  processId
) {
  const process = await getProcessContext(
    env,
    auth.tenantId,
    processId
  );

  if (!process) {
    return json(
      {
        ok: false,
        error: "not_found",
        message: "El proceso no existe.",
      },
      404
    );
  }

  if (process.version_status === "published") {
    return json(
      {
        ok: false,
        error: "already_published",
        message:
          "La versión actual ya está publicada.",
      },
      409
    );
  }

  if (process.version_status !== "draft") {
    return json(
      {
        ok: false,
        error: "invalid_version_status",
        message:
          "Solo puede publicarse una versión en borrador.",
      },
      409
    );
  }

  const validation =
    await validatePublication(env, process);

  if (!validation.valid) {
    return json(
      {
        ok: false,
        error: "publication_validation_failed",
        message:
          "El proceso todavía no cumple las condiciones para publicarse.",
        details: validation.errors,
      },
      422
    );
  }

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE trace_process_versions
       SET
         status = 'published',
         schema_json = ?,
         published_at = datetime('now'),
         published_by = ?
       WHERE id = ?
         AND process_id = ?
         AND status = 'draft'`
    ).bind(
      JSON.stringify(validation.schema),
      auth.user.id,
      process.current_version_id,
      processId
    ),

    env.DB.prepare(
      `UPDATE trace_processes
       SET
         status = 'active',
         updated_at = datetime('now')
       WHERE id = ?
         AND tenant_id = ?`
    ).bind(
      processId,
      auth.tenantId
    ),
  ]);

  const published = await env.DB.prepare(
    `SELECT
       id,
       process_id,
       version_number,
       name,
       description,
       status,
       published_at,
       published_by,
       created_by,
       created_at
     FROM trace_process_versions
     WHERE id = ?
     LIMIT 1`
  )
    .bind(process.current_version_id)
    .first();

  return json({
    ok: true,
    data: {
      processId,
      processStatus: "active",
      version: {
        id: published.id,
        versionNumber:
          Number(published.version_number),
        name: published.name,
        description: published.description,
        status: published.status,
        publishedAt: published.published_at,
        publishedBy: published.published_by,
        createdBy: published.created_by,
        createdAt: published.created_at,
      },
      summary: {
        stagesCount:
          validation.stagesCount,
        fieldsCount:
          validation.fieldsCount,
      },
    },
  });
}

async function createDraftVersion(
  env,
  auth,
  processId
) {
  const process = await getProcessContext(
    env,
    auth.tenantId,
    processId
  );

  if (!process) {
    return json(
      {
        ok: false,
        error: "not_found",
        message: "El proceso no existe.",
      },
      404
    );
  }

  if (process.version_status === "draft") {
    return json(
      {
        ok: false,
        error: "draft_already_exists",
        message:
          "El proceso ya tiene una versión borrador activa.",
      },
      409
    );
  }

  if (process.version_status !== "published") {
    return json(
      {
        ok: false,
        error: "invalid_source_version",
        message:
          "La nueva versión debe originarse desde una versión publicada.",
      },
      409
    );
  }

  const existingDraft = await env.DB.prepare(
    `SELECT id
     FROM trace_process_versions
     WHERE process_id = ?
       AND status = 'draft'
     LIMIT 1`
  )
    .bind(processId)
    .first();

  if (existingDraft) {
    return json(
      {
        ok: false,
        error: "draft_already_exists",
        message:
          "Ya existe otra versión borrador para este proceso.",
      },
      409
    );
  }

  const sourceStages = await env.DB.prepare(
    `SELECT *
     FROM trace_stages
     WHERE process_version_id = ?
     ORDER BY stage_order ASC`
  )
    .bind(process.current_version_id)
    .all();

  const sourceFields = await env.DB.prepare(
    `SELECT f.*
     FROM trace_stage_fields f
     JOIN trace_stages s
       ON s.id = f.stage_id
     WHERE s.process_version_id = ?
     ORDER BY
       s.stage_order ASC,
       f.field_order ASC`
  )
    .bind(process.current_version_id)
    .all();

  const maxVersion = await env.DB.prepare(
    `SELECT
       COALESCE(MAX(version_number), 0)
         AS max_version
     FROM trace_process_versions
     WHERE process_id = ?`
  )
    .bind(processId)
    .first();

  const newVersionId = uuid();

  const newVersionNumber =
    Number(maxVersion?.max_version || 0) + 1;

  const stageIdMap = new Map();

  for (const stage of sourceStages.results) {
    stageIdMap.set(stage.id, uuid());
  }

  const statements = [
    env.DB.prepare(
      `INSERT INTO trace_process_versions (
         id,
         process_id,
         version_number,
         name,
         description,
         status,
         schema_json,
         created_by,
         created_at
       )
       VALUES (
         ?,
         ?,
         ?,
         ?,
         ?,
         'draft',
         '{}',
         ?,
         datetime('now')
       )`
    ).bind(
      newVersionId,
      processId,
      newVersionNumber,
      process.version_name || process.name,
      process.version_description ||
        process.description,
      auth.user.id
    ),
  ];

  for (const stage of sourceStages.results) {
    statements.push(
      env.DB.prepare(
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
         VALUES (
           ?,
           ?,
           ?,
           ?,
           ?,
           ?,
           ?,
           ?,
           ?,
           ?,
           ?,
           ?,
           ?,
           datetime('now')
         )`
      ).bind(
        stageIdMap.get(stage.id),
        newVersionId,
        stage.name,
        stage.description,
        stage.stage_order,
        stage.stage_type,
        stage.responsible_role,
        stage.instructions,
        stage.estimated_duration_minutes,
        stage.requires_evidence,
        stage.requires_approval,
        stage.allow_skip,
        stage.settings_json || "{}"
      )
    );
  }

  for (const field of sourceFields.results) {
    const newStageId =
      stageIdMap.get(field.stage_id);

    if (!newStageId) {
      return json(
        {
          ok: false,
          error: "clone_integrity_error",
          message:
            "No fue posible relacionar un campo con su nueva etapa.",
        },
        500
      );
    }

    statements.push(
      env.DB.prepare(
        `INSERT INTO trace_stage_fields (
           id,
           stage_id,
           field_key,
           label,
           description,
           field_type,
           field_order,
           is_required,
           options_json,
           validation_json,
           conditional_json,
           default_value_json,
           created_at
         )
         VALUES (
           ?,
           ?,
           ?,
           ?,
           ?,
           ?,
           ?,
           ?,
           ?,
           ?,
           ?,
           ?,
           datetime('now')
         )`
      ).bind(
        uuid(),
        newStageId,
        field.field_key,
        field.label,
        field.description,
        field.field_type,
        field.field_order,
        field.is_required,
        field.options_json || "[]",
        field.validation_json || "{}",
        field.conditional_json || "{}",
        field.default_value_json
      )
    );
  }

  statements.push(
    env.DB.prepare(
      `UPDATE trace_processes
       SET
         current_version_id = ?,
         updated_at = datetime('now')
       WHERE id = ?
         AND tenant_id = ?`
    ).bind(
      newVersionId,
      processId,
      auth.tenantId
    )
  );

  await env.DB.batch(statements);

  return json(
    {
      ok: true,
      data: {
        processId,
        sourceVersionId:
          process.current_version_id,
        version: {
          id: newVersionId,
          versionNumber:
            newVersionNumber,
          status: "draft",
        },
        cloned: {
          stagesCount:
            sourceStages.results.length,
          fieldsCount:
            sourceFields.results.length,
        },
      },
    },
    201
  );
}

export async function handleTraceV1Versions(
  request,
  env
) {
  const url = new URL(request.url);

  const publishMatch = url.pathname.match(
    /^\/api\/trace\/v1\/processes\/([^/]+)\/publish$/
  );

  const draftMatch = url.pathname.match(
    /^\/api\/trace\/v1\/processes\/([^/]+)\/versions\/draft$/
  );

  if (!publishMatch && !draftMatch) {
    return null;
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CORS,
    });
  }

  if (request.method !== "POST") {
    return json(
      {
        ok: false,
        error: "method_not_allowed",
        message: "Método no permitido.",
      },
      405
    );
  }

  const auth = await authenticate(request, env);

  if (auth.error) return auth.error;

  if (publishMatch) {
    const processId =
      decodeURIComponent(publishMatch[1]);

    return publishVersion(
      env,
      auth,
      processId
    );
  }

  const processId =
    decodeURIComponent(draftMatch[1]);

  return createDraftVersion(
    env,
    auth,
    processId
  );
}
