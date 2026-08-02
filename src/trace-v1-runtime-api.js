import jwt from "@tsndr/cloudflare-worker-jwt";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

function parseJson(value, fallback) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeText(value, maxLength = 255) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const normalized = String(value).trim();

  return normalized
    ? normalized.slice(0, maxLength)
    : null;
}

function normalizeObject(value, fallback = {}) {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value;
  }

  return fallback;
}

function serializeAsset(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    processId: row.process_id,
    assetCode: row.asset_code,
    name: row.name,
    description: row.description,
    assetType: row.asset_type,
    status: row.status,
    qrSlug: row.qr_slug,
    externalReference: row.external_reference,
    location: row.location,
    metadata: parseJson(row.metadata_json, {}),
    publicData: parseJson(
      row.public_data_json,
      {}
    ),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeExecution(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    processId: row.process_id,
    processVersionId:
      row.process_version_id,
    assetId: row.asset_id,
    assignmentId: row.assignment_id,
    executionCode: row.execution_code,
    title: row.title,
    status: row.status,
    priority: row.priority,
    currentStageId: row.current_stage_id,
    assignedTo: row.assigned_to,
    startedAt: row.started_at,
    dueAt: row.due_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    completionPercentage:
      Number(row.completion_percentage),
    metadata: parseJson(
      row.metadata_json,
      {}
    ),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeExecutionStage(row) {
  return {
    id: row.id,
    executionId: row.execution_id,
    stageId: row.stage_id,
    stageOrder: Number(row.stage_order),
    status: row.status,
    assignedTo: row.assigned_to,
    startedAt: row.started_at,
    submittedAt: row.submitted_at,
    completedAt: row.completed_at,
    skippedAt: row.skipped_at,
    response: parseJson(
      row.response_json,
      {}
    ),
    validation: parseJson(
      row.validation_json,
      {}
    ),
    notes: row.notes,
    name: row.stage_name,
    type: row.stage_type,
    instructions: row.instructions,
    responsibleRole:
      row.responsible_role,
    requiresEvidence:
      Number(row.requires_evidence) === 1,
    requiresApproval:
      Number(row.requires_approval) === 1,
    fieldsCount:
      Number(row.fields_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeEvent(row) {
  return {
    id: row.id,
    executionId: row.execution_id,
    executionStageId:
      row.execution_stage_id,
    assetId: row.asset_id,
    eventType: row.event_type,
    eventSource: row.event_source,
    actorUserId: row.actor_user_id,
    actorRole: row.actor_role,
    description: row.description,
    location: parseJson(
      row.location_json,
      null
    ),
    payload: parseJson(
      row.payload_json,
      {}
    ),
    occurredAt: row.occurred_at,
    receivedAt: row.received_at,
  };
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
          message:
            "Se requiere un token de acceso.",
        },
        401
      ),
    };
  }

  const jwtSecret =
    env.JWT_SECRET ||
    "changeme-set-in-cloudflare-dashboard";

  const token =
    authorization.slice(7).trim();

  const valid =
    await jwt.verify(token, jwtSecret);

  if (!valid) {
    return {
      error: json(
        {
          ok: false,
          error: "invalid_token",
          message:
            "El token de acceso no es válido.",
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
          message:
            "El token no identifica al usuario.",
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

  if (
    !user ||
    Number(user.is_active) !== 1
  ) {
    return {
      error: json(
        {
          ok: false,
          error: "inactive_user",
          message:
            "El usuario no existe o está inactivo.",
        },
        401
      ),
    };
  }

  return {
    user,
    tenantId:
      user.enterprise_id || user.id,
  };
}

async function getOwnedProcess(
  env,
  tenantId,
  processId
) {
  return env.DB.prepare(
    `SELECT
       id,
       name,
       description,
       status
     FROM trace_processes
     WHERE id = ?
       AND tenant_id = ?
     LIMIT 1`
  )
    .bind(processId, tenantId)
    .first();
}

async function getLatestPublishedVersion(
  env,
  processId
) {
  return env.DB.prepare(
    `SELECT
       id,
       process_id,
       version_number,
       name,
       description,
       status,
       published_at,
       published_by
     FROM trace_process_versions
     WHERE process_id = ?
       AND status = 'published'
     ORDER BY version_number DESC
     LIMIT 1`
  )
    .bind(processId)
    .first();
}

async function listAssets(
  env,
  tenantId,
  url
) {
  const status =
    normalizeText(
      url.searchParams.get("status"),
      30
    );

  const processId =
    normalizeText(
      url.searchParams.get("processId"),
      100
    );

  const clauses = ["tenant_id = ?"];
  const values = [tenantId];

  if (status) {
    clauses.push("status = ?");
    values.push(status);
  }

  if (processId) {
    clauses.push("process_id = ?");
    values.push(processId);
  }

  const result = await env.DB.prepare(
    `SELECT *
     FROM trace_assets
     WHERE ${clauses.join(" AND ")}
     ORDER BY created_at DESC`
  )
    .bind(...values)
    .all();

  return json({
    ok: true,
    data: result.results.map(
      serializeAsset
    ),
  });
}

async function getAsset(
  env,
  tenantId,
  assetId
) {
  const asset = await env.DB.prepare(
    `SELECT *
     FROM trace_assets
     WHERE id = ?
       AND tenant_id = ?
     LIMIT 1`
  )
    .bind(assetId, tenantId)
    .first();

  if (!asset) {
    return json(
      {
        ok: false,
        error: "not_found",
        message:
          "El elemento trazable no existe.",
      },
      404
    );
  }

  const executions = await env.DB.prepare(
    `SELECT *
     FROM trace_executions
     WHERE asset_id = ?
       AND tenant_id = ?
     ORDER BY created_at DESC`
  )
    .bind(assetId, tenantId)
    .all();

  return json({
    ok: true,
    data: {
      ...serializeAsset(asset),
      executions:
        executions.results.map(
          serializeExecution
        ),
    },
  });
}

async function createAsset(
  request,
  env,
  auth
) {
  let body;

  try {
    body = await request.json();
  } catch {
    return json(
      {
        ok: false,
        error: "invalid_json",
        message:
          "El cuerpo enviado no contiene JSON válido.",
      },
      400
    );
  }

  const assetCode =
    normalizeText(body.assetCode, 100);

  const name =
    normalizeText(body.name, 180);

  const processId =
    normalizeText(body.processId, 100);

  if (!assetCode || !name) {
    return json(
      {
        ok: false,
        error: "validation_error",
        message:
          "El código y el nombre son obligatorios.",
      },
      422
    );
  }

  if (processId) {
    const process = await getOwnedProcess(
      env,
      auth.tenantId,
      processId
    );

    if (!process) {
      return json(
        {
          ok: false,
          error: "invalid_process",
          message:
            "El proceso indicado no pertenece al usuario.",
        },
        422
      );
    }
  }

  const existing = await env.DB.prepare(
    `SELECT *
     FROM trace_assets
     WHERE tenant_id = ?
       AND asset_code = ?
     LIMIT 1`
  )
    .bind(
      auth.tenantId,
      assetCode
    )
    .first();

  if (existing) {
    return json({
      ok: true,
      created: false,
      data: serializeAsset(existing),
    });
  }

  const qrSlug =
    normalizeText(body.qrSlug, 160);

  if (qrSlug) {
    const duplicateSlug =
      await env.DB.prepare(
        `SELECT id
         FROM trace_assets
         WHERE qr_slug = ?
         LIMIT 1`
      )
        .bind(qrSlug)
        .first();

    if (duplicateSlug) {
      return json(
        {
          ok: false,
          error: "duplicate_qr_slug",
          message:
            "El identificador público ya está siendo utilizado.",
        },
        409
      );
    }
  }

  const assetId = uuid();

  await env.DB.prepare(
    `INSERT INTO trace_assets (
       id,
       tenant_id,
       process_id,
       asset_code,
       name,
       description,
       asset_type,
       status,
       qr_slug,
       external_reference,
       location,
       metadata_json,
       public_data_json,
       created_by,
       created_at,
       updated_at
     )
     VALUES (
       ?,
       ?,
       ?,
       ?,
       ?,
       ?,
       ?,
       'active',
       ?,
       ?,
       ?,
       ?,
       ?,
       ?,
       datetime('now'),
       datetime('now')
     )`
  )
    .bind(
      assetId,
      auth.tenantId,
      processId,
      assetCode,
      name,
      normalizeText(
        body.description,
        2000
      ),
      normalizeText(
        body.assetType,
        80
      ) || "item",
      qrSlug,
      normalizeText(
        body.externalReference,
        180
      ),
      normalizeText(
        body.location,
        500
      ),
      JSON.stringify(
        normalizeObject(body.metadata)
      ),
      JSON.stringify(
        normalizeObject(body.publicData)
      ),
      auth.user.id
    )
    .run();

  const created = await env.DB.prepare(
    `SELECT *
     FROM trace_assets
     WHERE id = ?
     LIMIT 1`
  )
    .bind(assetId)
    .first();

  return json(
    {
      ok: true,
      created: true,
      data: serializeAsset(created),
    },
    201
  );
}

async function listExecutions(
  env,
  tenantId,
  url
) {
  const status =
    normalizeText(
      url.searchParams.get("status"),
      40
    );

  const processId =
    normalizeText(
      url.searchParams.get("processId"),
      100
    );

  const assetId =
    normalizeText(
      url.searchParams.get("assetId"),
      100
    );

  const clauses = ["tenant_id = ?"];
  const values = [tenantId];

  if (status) {
    clauses.push("status = ?");
    values.push(status);
  }

  if (processId) {
    clauses.push("process_id = ?");
    values.push(processId);
  }

  if (assetId) {
    clauses.push("asset_id = ?");
    values.push(assetId);
  }

  const result = await env.DB.prepare(
    `SELECT *
     FROM trace_executions
     WHERE ${clauses.join(" AND ")}
     ORDER BY created_at DESC`
  )
    .bind(...values)
    .all();

  return json({
    ok: true,
    data: result.results.map(
      serializeExecution
    ),
  });
}

async function getExecution(
  env,
  tenantId,
  executionId
) {
  const execution = await env.DB.prepare(
    `SELECT *
     FROM trace_executions
     WHERE id = ?
       AND tenant_id = ?
     LIMIT 1`
  )
    .bind(executionId, tenantId)
    .first();

  if (!execution) {
    return json(
      {
        ok: false,
        error: "not_found",
        message:
          "La ejecución no existe.",
      },
      404
    );
  }

  const stages = await env.DB.prepare(
    `SELECT
       es.*,
       s.name AS stage_name,
       s.stage_type,
       s.instructions,
       s.responsible_role,
       s.requires_evidence,
       s.requires_approval,
       (
         SELECT COUNT(*)
         FROM trace_stage_fields f
         WHERE f.stage_id = s.id
       ) AS fields_count
     FROM trace_execution_stages es
     JOIN trace_stages s
       ON s.id = es.stage_id
     WHERE es.execution_id = ?
     ORDER BY es.stage_order ASC`
  )
    .bind(executionId)
    .all();

  const events = await env.DB.prepare(
    `SELECT *
     FROM trace_events
     WHERE execution_id = ?
       AND tenant_id = ?
     ORDER BY occurred_at ASC,
              received_at ASC`
  )
    .bind(executionId, tenantId)
    .all();

  return json({
    ok: true,
    data: {
      ...serializeExecution(execution),
      stages: stages.results.map(
        serializeExecutionStage
      ),
      events: events.results.map(
        serializeEvent
      ),
    },
  });
}

async function createExecution(
  request,
  env,
  auth
) {
  let body;

  try {
    body = await request.json();
  } catch {
    return json(
      {
        ok: false,
        error: "invalid_json",
        message:
          "El cuerpo enviado no contiene JSON válido.",
      },
      400
    );
  }

  const processId =
    normalizeText(body.processId, 100);

  const assetId =
    normalizeText(body.assetId, 100);

  const executionCode =
    normalizeText(
      body.executionCode,
      120
    );

  if (!processId || !executionCode) {
    return json(
      {
        ok: false,
        error: "validation_error",
        message:
          "El proceso y el código de ejecución son obligatorios.",
      },
      422
    );
  }

  const process = await getOwnedProcess(
    env,
    auth.tenantId,
    processId
  );

  if (!process) {
    return json(
      {
        ok: false,
        error: "invalid_process",
        message:
          "El proceso no existe o no pertenece al usuario.",
      },
      422
    );
  }

  const publishedVersion =
    await getLatestPublishedVersion(
      env,
      processId
    );

  if (!publishedVersion) {
    return json(
      {
        ok: false,
        error: "published_version_required",
        message:
          "El proceso necesita una versión publicada antes de ejecutarse.",
      },
      409
    );
  }

  let asset = null;

  if (assetId) {
    asset = await env.DB.prepare(
      `SELECT *
       FROM trace_assets
       WHERE id = ?
         AND tenant_id = ?
       LIMIT 1`
    )
      .bind(
        assetId,
        auth.tenantId
      )
      .first();

    if (!asset) {
      return json(
        {
          ok: false,
          error: "invalid_asset",
          message:
            "El elemento trazable no existe.",
        },
        422
      );
    }

    if (
      asset.process_id &&
      asset.process_id !== processId
    ) {
      return json(
        {
          ok: false,
          error: "asset_process_mismatch",
          message:
            "El elemento está vinculado a otro proceso.",
        },
        409
      );
    }
  }

  const existing = await env.DB.prepare(
    `SELECT *
     FROM trace_executions
     WHERE tenant_id = ?
       AND execution_code = ?
     LIMIT 1`
  )
    .bind(
      auth.tenantId,
      executionCode
    )
    .first();

  if (existing) {
    const detail = await getExecution(
      env,
      auth.tenantId,
      existing.id
    );

    const payload =
      await detail.json();

    return json({
      ok: true,
      created: false,
      data: payload.data,
    });
  }

  const sourceStages = await env.DB.prepare(
    `SELECT *
     FROM trace_stages
     WHERE process_version_id = ?
     ORDER BY stage_order ASC`
  )
    .bind(publishedVersion.id)
    .all();

  if (!sourceStages.results.length) {
    return json(
      {
        ok: false,
        error: "published_version_empty",
        message:
          "La versión publicada no contiene etapas.",
      },
      409
    );
  }

  const executionId = uuid();
  const firstStage =
    sourceStages.results[0];

  const assignedTo =
    normalizeText(
      body.assignedTo,
      100
    ) || auth.user.id;

  if (assignedTo) {
    const assignee = await env.DB.prepare(
      `SELECT id
       FROM users
       WHERE id = ?
         AND is_active = 1
       LIMIT 1`
    )
      .bind(assignedTo)
      .first();

    if (!assignee) {
      return json(
        {
          ok: false,
          error: "invalid_assignee",
          message:
            "El usuario asignado no existe o está inactivo.",
        },
        422
      );
    }
  }

  const executionStatus =
    assignedTo ? "assigned" : "pending";

  const eventId = uuid();

  const statements = [
    env.DB.prepare(
      `INSERT INTO trace_executions (
         id,
         tenant_id,
         process_id,
         process_version_id,
         asset_id,
         assignment_id,
         execution_code,
         title,
         status,
         priority,
         current_stage_id,
         assigned_to,
         started_at,
         due_at,
         completion_percentage,
         metadata_json,
         created_by,
         created_at,
         updated_at
       )
       VALUES (
         ?,
         ?,
         ?,
         ?,
         ?,
         NULL,
         ?,
         ?,
         ?,
         ?,
         ?,
         ?,
         NULL,
         ?,
         0,
         ?,
         ?,
         datetime('now'),
         datetime('now')
       )`
    ).bind(
      executionId,
      auth.tenantId,
      processId,
      publishedVersion.id,
      assetId,
      executionCode,
      normalizeText(
        body.title,
        220
      ) ||
        `${process.name} · ${executionCode}`,
      executionStatus,
      normalizeText(
        body.priority,
        20
      ) || "normal",
      firstStage.id,
      assignedTo,
      normalizeText(
        body.dueAt,
        80
      ),
      JSON.stringify(
        normalizeObject(body.metadata)
      ),
      auth.user.id
    ),
  ];

  const executionStageIds = [];

  for (
    let index = 0;
    index < sourceStages.results.length;
    index += 1
  ) {
    const stage =
      sourceStages.results[index];

    const executionStageId = uuid();

    executionStageIds.push({
      id: executionStageId,
      stage,
    });

    statements.push(
      env.DB.prepare(
        `INSERT INTO trace_execution_stages (
           id,
           execution_id,
           stage_id,
           stage_order,
           status,
           assigned_to,
           response_json,
           validation_json,
           created_at,
           updated_at
         )
         VALUES (
           ?,
           ?,
           ?,
           ?,
           ?,
           ?,
           '{}',
           '{}',
           datetime('now'),
           datetime('now')
         )`
      ).bind(
        executionStageId,
        executionId,
        stage.id,
        stage.stage_order,
        index === 0
          ? "available"
          : "pending",
        assignedTo
      )
    );
  }

  statements.push(
    env.DB.prepare(
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
         location_json,
         payload_json,
         occurred_at,
         received_at
       )
       VALUES (
         ?,
         ?,
         ?,
         ?,
         ?,
         'execution_created',
         'admin',
         ?,
         ?,
         ?,
         NULL,
         ?,
         datetime('now'),
         datetime('now')
       )`
    ).bind(
      eventId,
      auth.tenantId,
      executionId,
      executionStageIds[0].id,
      assetId,
      auth.user.id,
      auth.user.role || "admin",
      "La ejecución fue creada y quedó lista para iniciar.",
      JSON.stringify({
        processId,
        processVersionId:
          publishedVersion.id,
        versionNumber:
          Number(
            publishedVersion.version_number
          ),
        firstStageId:
          firstStage.id,
        assignedTo,
      })
    )
  );

  if (
    asset &&
    !asset.process_id
  ) {
    statements.push(
      env.DB.prepare(
        `UPDATE trace_assets
         SET
           process_id = ?,
           updated_at = datetime('now')
         WHERE id = ?
           AND tenant_id = ?`
      ).bind(
        processId,
        asset.id,
        auth.tenantId
      )
    );
  }

  await env.DB.batch(statements);

  const detail = await getExecution(
    env,
    auth.tenantId,
    executionId
  );

  const payload = await detail.json();

  return json(
    {
      ok: true,
      created: true,
      data: payload.data,
    },
    201
  );
}

export async function handleTraceV1Runtime(
  request,
  env
) {
  const url = new URL(request.url);

  const assetMatch = url.pathname.match(
    /^\/api\/trace\/v1\/assets(?:\/([^/]+))?\/?$/
  );

  const executionMatch =
    url.pathname.match(
      /^\/api\/trace\/v1\/executions(?:\/([^/]+))?\/?$/
    );

  if (!assetMatch && !executionMatch) {
    return null;
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CORS,
    });
  }

  const auth =
    await authenticate(request, env);

  if (auth.error) {
    return auth.error;
  }

  if (assetMatch) {
    const assetId = assetMatch[1]
      ? decodeURIComponent(assetMatch[1])
      : null;

    if (
      !assetId &&
      request.method === "GET"
    ) {
      return listAssets(
        env,
        auth.tenantId,
        url
      );
    }

    if (
      !assetId &&
      request.method === "POST"
    ) {
      return createAsset(
        request,
        env,
        auth
      );
    }

    if (
      assetId &&
      request.method === "GET"
    ) {
      return getAsset(
        env,
        auth.tenantId,
        assetId
      );
    }
  }

  if (executionMatch) {
    const executionId =
      executionMatch[1]
        ? decodeURIComponent(
            executionMatch[1]
          )
        : null;

    if (
      !executionId &&
      request.method === "GET"
    ) {
      return listExecutions(
        env,
        auth.tenantId,
        url
      );
    }

    if (
      !executionId &&
      request.method === "POST"
    ) {
      return createExecution(
        request,
        env,
        auth
      );
    }

    if (
      executionId &&
      request.method === "GET"
    ) {
      return getExecution(
        env,
        auth.tenantId,
        executionId
      );
    }
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
