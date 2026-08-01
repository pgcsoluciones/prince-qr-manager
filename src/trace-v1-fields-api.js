import jwt from "@tsndr/cloudflare-worker-jwt";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const FIELD_TYPES = new Set([
  "text",
  "textarea",
  "number",
  "decimal",
  "date",
  "datetime",
  "time",
  "select",
  "multiselect",
  "checkbox",
  "yes_no",
  "rating",
  "signature",
  "photo",
  "video",
  "audio",
  "file",
  "location",
  "qr_scan",
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

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeText(value, maxLength = 255) {
  if (value === null || value === undefined) return null;

  const normalized = String(value).trim();

  return normalized
    ? normalized.slice(0, maxLength)
    : null;
}

function normalizeBoolean(value, fallback = 0) {
  if (value === undefined) return fallback;

  return value === true || value === 1
    ? 1
    : 0;
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

function normalizeArray(value, fallback = []) {
  return Array.isArray(value)
    ? value
    : fallback;
}

function serializeField(row) {
  return {
    id: row.id,
    stageId: row.stage_id,
    key: row.field_key,
    label: row.label,
    description: row.description,
    type: row.field_type,
    order: Number(row.field_order),
    required: Number(row.is_required) === 1,
    options: parseJson(row.options_json, []),
    validation: parseJson(row.validation_json, {}),
    conditional: parseJson(row.conditional_json, {}),
    defaultValue: parseJson(row.default_value_json, null),
    createdAt: row.created_at,
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

async function getEditableStage(
  env,
  tenantId,
  processId,
  stageId
) {
  return env.DB.prepare(
    `SELECT
       p.id AS process_id,
       p.tenant_id,
       p.current_version_id,
       v.status AS version_status,
       s.id AS stage_id,
       s.name AS stage_name
     FROM trace_processes p
     JOIN trace_process_versions v
       ON v.id = p.current_version_id
     JOIN trace_stages s
       ON s.process_version_id = p.current_version_id
     WHERE p.id = ?
       AND p.tenant_id = ?
       AND s.id = ?
     LIMIT 1`
  )
    .bind(processId, tenantId, stageId)
    .first();
}

async function requireEditableStage(
  env,
  tenantId,
  processId,
  stageId
) {
  const context = await getEditableStage(
    env,
    tenantId,
    processId,
    stageId
  );

  if (!context) {
    return {
      error: json(
        {
          ok: false,
          error: "not_found",
          message: "El proceso o la etapa no existe.",
        },
        404
      ),
    };
  }

  if (context.version_status !== "draft") {
    return {
      error: json(
        {
          ok: false,
          error: "version_locked",
          message:
            "Solo pueden modificarse campos de una versión en borrador.",
        },
        409
      ),
    };
  }

  return { context };
}

async function listFields(env, stageId) {
  const result = await env.DB.prepare(
    `SELECT *
     FROM trace_stage_fields
     WHERE stage_id = ?
     ORDER BY field_order ASC, created_at ASC`
  )
    .bind(stageId)
    .all();

  return json({
    ok: true,
    data: result.results.map(serializeField),
  });
}

async function createField(
  request,
  env,
  stageId
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

  const key = normalizeText(body.key, 100);
  const label = normalizeText(body.label, 160);
  const type = normalizeText(body.type, 40);

  if (!key || !label || !type) {
    return json(
      {
        ok: false,
        error: "validation_error",
        message:
          "La clave, la etiqueta y el tipo son obligatorios.",
      },
      422
    );
  }

  if (!/^[a-z][a-z0-9_]*$/.test(key)) {
    return json(
      {
        ok: false,
        error: "validation_error",
        message:
          "La clave debe usar minúsculas, números y guion bajo.",
      },
      422
    );
  }

  if (!FIELD_TYPES.has(type)) {
    return json(
      {
        ok: false,
        error: "validation_error",
        message: "El tipo de campo no es válido.",
      },
      422
    );
  }

  const duplicate = await env.DB.prepare(
    `SELECT id
     FROM trace_stage_fields
     WHERE stage_id = ?
       AND field_key = ?
     LIMIT 1`
  )
    .bind(stageId, key)
    .first();

  if (duplicate) {
    return json(
      {
        ok: false,
        error: "duplicate_field_key",
        message:
          "Ya existe un campo con esa clave en la etapa.",
      },
      409
    );
  }

  const maxOrder = await env.DB.prepare(
    `SELECT
       COALESCE(MAX(field_order), 0) AS max_order
     FROM trace_stage_fields
     WHERE stage_id = ?`
  )
    .bind(stageId)
    .first();

  const fieldId = uuid();
  const fieldOrder =
    Number(maxOrder?.max_order || 0) + 1;

  const options = normalizeArray(body.options, []);
  const validation = normalizeObject(
    body.validation,
    {}
  );
  const conditional = normalizeObject(
    body.conditional,
    {}
  );

  const defaultValue =
    body.defaultValue === undefined
      ? null
      : body.defaultValue;

  await env.DB.prepare(
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
  )
    .bind(
      fieldId,
      stageId,
      key,
      label,
      normalizeText(body.description, 2000),
      type,
      fieldOrder,
      normalizeBoolean(body.required),
      JSON.stringify(options),
      JSON.stringify(validation),
      JSON.stringify(conditional),
      defaultValue === null
        ? null
        : JSON.stringify(defaultValue)
    )
    .run();

  const created = await env.DB.prepare(
    `SELECT *
     FROM trace_stage_fields
     WHERE id = ?
     LIMIT 1`
  )
    .bind(fieldId)
    .first();

  return json(
    {
      ok: true,
      data: serializeField(created),
    },
    201
  );
}

async function updateField(
  request,
  env,
  stageId,
  fieldId
) {
  const existing = await env.DB.prepare(
    `SELECT *
     FROM trace_stage_fields
     WHERE id = ?
       AND stage_id = ?
     LIMIT 1`
  )
    .bind(fieldId, stageId)
    .first();

  if (!existing) {
    return json(
      {
        ok: false,
        error: "not_found",
        message: "El campo no existe.",
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
        message:
          "El cuerpo enviado no contiene JSON válido.",
      },
      400
    );
  }

  const key =
    body.key === undefined
      ? existing.field_key
      : normalizeText(body.key, 100);

  const label =
    body.label === undefined
      ? existing.label
      : normalizeText(body.label, 160);

  const type =
    body.type === undefined
      ? existing.field_type
      : normalizeText(body.type, 40);

  if (!key || !label || !type) {
    return json(
      {
        ok: false,
        error: "validation_error",
        message:
          "La clave, la etiqueta y el tipo no pueden quedar vacíos.",
      },
      422
    );
  }

  if (!/^[a-z][a-z0-9_]*$/.test(key)) {
    return json(
      {
        ok: false,
        error: "validation_error",
        message:
          "La clave debe usar minúsculas, números y guion bajo.",
      },
      422
    );
  }

  if (!FIELD_TYPES.has(type)) {
    return json(
      {
        ok: false,
        error: "validation_error",
        message: "El tipo de campo no es válido.",
      },
      422
    );
  }

  const duplicate = await env.DB.prepare(
    `SELECT id
     FROM trace_stage_fields
     WHERE stage_id = ?
       AND field_key = ?
       AND id <> ?
     LIMIT 1`
  )
    .bind(stageId, key, fieldId)
    .first();

  if (duplicate) {
    return json(
      {
        ok: false,
        error: "duplicate_field_key",
        message:
          "Ya existe otro campo con esa clave.",
      },
      409
    );
  }

  const options =
    body.options === undefined
      ? parseJson(existing.options_json, [])
      : normalizeArray(body.options, []);

  const validation =
    body.validation === undefined
      ? parseJson(existing.validation_json, {})
      : normalizeObject(body.validation, {});

  const conditional =
    body.conditional === undefined
      ? parseJson(existing.conditional_json, {})
      : normalizeObject(body.conditional, {});

  const defaultValue =
    body.defaultValue === undefined
      ? parseJson(existing.default_value_json, null)
      : body.defaultValue;

  await env.DB.prepare(
    `UPDATE trace_stage_fields
     SET
       field_key = ?,
       label = ?,
       description = ?,
       field_type = ?,
       is_required = ?,
       options_json = ?,
       validation_json = ?,
       conditional_json = ?,
       default_value_json = ?
     WHERE id = ?
       AND stage_id = ?`
  )
    .bind(
      key,
      label,
      body.description === undefined
        ? existing.description
        : normalizeText(body.description, 2000),
      type,
      normalizeBoolean(
        body.required,
        Number(existing.is_required)
      ),
      JSON.stringify(options),
      JSON.stringify(validation),
      JSON.stringify(conditional),
      defaultValue === null
        ? null
        : JSON.stringify(defaultValue),
      fieldId,
      stageId
    )
    .run();

  const updated = await env.DB.prepare(
    `SELECT *
     FROM trace_stage_fields
     WHERE id = ?
     LIMIT 1`
  )
    .bind(fieldId)
    .first();

  return json({
    ok: true,
    data: serializeField(updated),
  });
}

async function deleteField(
  env,
  stageId,
  fieldId
) {
  const existing = await env.DB.prepare(
    `SELECT id
     FROM trace_stage_fields
     WHERE id = ?
       AND stage_id = ?
     LIMIT 1`
  )
    .bind(fieldId, stageId)
    .first();

  if (!existing) {
    return json(
      {
        ok: false,
        error: "not_found",
        message: "El campo no existe.",
      },
      404
    );
  }

  await env.DB.prepare(
    `DELETE FROM trace_stage_fields
     WHERE id = ?
       AND stage_id = ?`
  )
    .bind(fieldId, stageId)
    .run();

  return json({
    ok: true,
    deletedId: fieldId,
  });
}

async function reorderFields(
  request,
  env,
  stageId
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

  if (
    !Array.isArray(body.fieldIds) ||
    body.fieldIds.length === 0
  ) {
    return json(
      {
        ok: false,
        error: "validation_error",
        message:
          "fieldIds debe contener el orden completo de los campos.",
      },
      422
    );
  }

  const current = await env.DB.prepare(
    `SELECT id
     FROM trace_stage_fields
     WHERE stage_id = ?
     ORDER BY field_order`
  )
    .bind(stageId)
    .all();

  const currentIds =
    current.results.map((row) => row.id);

  const requestedIds =
    body.fieldIds.map(String);

  if (
    currentIds.length !== requestedIds.length ||
    new Set(requestedIds).size !==
      requestedIds.length ||
    currentIds.some(
      (id) => !requestedIds.includes(id)
    )
  ) {
    return json(
      {
        ok: false,
        error: "validation_error",
        message:
          "Debe enviarse exactamente el conjunto actual de campos.",
      },
      422
    );
  }

  const temporaryUpdates =
    requestedIds.map((fieldId, index) =>
      env.DB.prepare(
        `UPDATE trace_stage_fields
         SET field_order = ?
         WHERE id = ?
           AND stage_id = ?`
      ).bind(
        -(index + 1),
        fieldId,
        stageId
      )
    );

  const finalUpdates =
    requestedIds.map((fieldId, index) =>
      env.DB.prepare(
        `UPDATE trace_stage_fields
         SET field_order = ?
         WHERE id = ?
           AND stage_id = ?`
      ).bind(
        index + 1,
        fieldId,
        stageId
      )
    );

  await env.DB.batch([
    ...temporaryUpdates,
    ...finalUpdates,
  ]);

  return listFields(env, stageId);
}

export async function handleTraceV1Fields(
  request,
  env
) {
  const url = new URL(request.url);

  const match = url.pathname.match(
    /^\/api\/trace\/v1\/processes\/([^/]+)\/stages\/([^/]+)\/fields(?:\/([^/]+))?$/
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

  const processId =
    decodeURIComponent(match[1]);

  const stageId =
    decodeURIComponent(match[2]);

  const actionOrFieldId =
    match[3]
      ? decodeURIComponent(match[3])
      : null;

  const editable =
    await requireEditableStage(
      env,
      auth.tenantId,
      processId,
      stageId
    );

  if (editable.error) {
    return editable.error;
  }

  if (
    !actionOrFieldId &&
    request.method === "GET"
  ) {
    return listFields(env, stageId);
  }

  if (
    !actionOrFieldId &&
    request.method === "POST"
  ) {
    return createField(
      request,
      env,
      stageId
    );
  }

  if (
    actionOrFieldId === "reorder" &&
    request.method === "PUT"
  ) {
    return reorderFields(
      request,
      env,
      stageId
    );
  }

  if (
    actionOrFieldId &&
    request.method === "PATCH"
  ) {
    return updateField(
      request,
      env,
      stageId,
      actionOrFieldId
    );
  }

  if (
    actionOrFieldId &&
    request.method === "DELETE"
  ) {
    return deleteField(
      env,
      stageId,
      actionOrFieldId
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
