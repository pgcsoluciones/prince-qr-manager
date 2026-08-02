import jwt from "@tsndr/cloudflare-worker-jwt";
import { getTraceDatabase } from "./trace/shared/database.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
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
  if (value === null || value === undefined || value === "") return fallback;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function serializeProcess(row) {
  if (!row) return null;

  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description,
    category: row.category,
    status: row.status,
    currentVersionId: row.current_version_id,
    color: row.color,
    icon: row.icon,
    settings: parseJson(row.settings_json, {}),
    versionNumber: row.version_number ?? null,
    versionStatus: row.version_status ?? null,
    stagesCount: Number(row.stages_count || 0),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
  const sessionType =
    payload.session_type ||
    "standard";

  if (sessionType !== "standard") {
    return {
      error: json(
        {
          ok: false,
          error:
            "restricted_session_scope",
          message:
            "Esta sesión no tiene acceso a funciones administrativas.",
        },
        403
      ),
    };
  }


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

function normalizeText(value, maxLength = 255) {
  if (value === null || value === undefined) return null;

  const normalized = String(value).trim();

  if (!normalized) return null;

  return normalized.slice(0, maxLength);
}

function normalizeSettings(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value;
}

async function listProcesses(env, tenantId, url) {
  const status = normalizeText(url.searchParams.get("status"), 40);
  const search = normalizeText(url.searchParams.get("search"), 120);

  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit") || 50), 1),
    100
  );

  const offset = Math.max(
    Number(url.searchParams.get("offset") || 0),
    0
  );

  const conditions = ["p.tenant_id = ?"];
  const bindings = [tenantId];

  if (status) {
    conditions.push("p.status = ?");
    bindings.push(status);
  }

  if (search) {
    conditions.push(
      "(LOWER(p.name) LIKE LOWER(?) OR LOWER(COALESCE(p.description, '')) LIKE LOWER(?))"
    );

    const pattern = `%${search}%`;
    bindings.push(pattern, pattern);
  }

  bindings.push(limit, offset);

  const result = await getTraceDatabase(env).prepare(
    `SELECT
       p.*,
       v.version_number,
       v.status AS version_status,
       (
         SELECT COUNT(*)
         FROM trace_stages s
         WHERE s.process_version_id = p.current_version_id
       ) AS stages_count
     FROM trace_processes p
     LEFT JOIN trace_process_versions v
       ON v.id = p.current_version_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY p.updated_at DESC, p.created_at DESC
     LIMIT ? OFFSET ?`
  )
    .bind(...bindings)
    .all();

  return json({
    ok: true,
    data: result.results.map(serializeProcess),
    pagination: {
      limit,
      offset,
      returned: result.results.length,
    },
  });
}

async function createProcess(request, env, auth) {
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
        message: "El nombre del proceso es obligatorio.",
        fields: {
          name: "required",
        },
      },
      422
    );
  }

  const processId = uuid();
  const versionId = uuid();

  const description = normalizeText(body.description, 2000);
  const category = normalizeText(body.category, 80) || "general";
  const color = normalizeText(body.color, 20) || "#2563eb";
  const icon = normalizeText(body.icon, 80);
  const settings = normalizeSettings(body.settings);

  await getTraceDatabase(env).batch([
    getTraceDatabase(env).prepare(
      `INSERT INTO trace_processes (
         id,
         tenant_id,
         name,
         description,
         category,
         status,
         current_version_id,
         color,
         icon,
         settings_json,
         created_by,
         created_at,
         updated_at
       )
       VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).bind(
      processId,
      auth.tenantId,
      name,
      description,
      category,
      versionId,
      color,
      icon,
      JSON.stringify(settings),
      auth.user.id
    ),

    getTraceDatabase(env).prepare(
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
       VALUES (?, ?, 1, ?, ?, 'draft', '{}', ?, datetime('now'))`
    ).bind(
      versionId,
      processId,
      name,
      description,
      auth.user.id
    ),
  ]);

  const created = await getTraceDatabase(env).prepare(
    `SELECT
       p.*,
       v.version_number,
       v.status AS version_status,
       0 AS stages_count
     FROM trace_processes p
     LEFT JOIN trace_process_versions v
       ON v.id = p.current_version_id
     WHERE p.id = ?
       AND p.tenant_id = ?
     LIMIT 1`
  )
    .bind(processId, auth.tenantId)
    .first();

  return json(
    {
      ok: true,
      data: serializeProcess(created),
    },
    201
  );
}

async function getProcess(env, tenantId, processId) {
  const process = await getTraceDatabase(env).prepare(
    `SELECT
       p.*,
       v.version_number,
       v.status AS version_status,
       (
         SELECT COUNT(*)
         FROM trace_stages s
         WHERE s.process_version_id = p.current_version_id
       ) AS stages_count
     FROM trace_processes p
     LEFT JOIN trace_process_versions v
       ON v.id = p.current_version_id
     WHERE p.id = ?
       AND p.tenant_id = ?
     LIMIT 1`
  )
    .bind(processId, tenantId)
    .first();

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

  const versions = await getTraceDatabase(env).prepare(
    `SELECT
       id,
       version_number,
       name,
       description,
       status,
       published_at,
       published_by,
       created_by,
       created_at
     FROM trace_process_versions
     WHERE process_id = ?
     ORDER BY version_number DESC`
  )
    .bind(processId)
    .all();

  return json({
    ok: true,
    data: {
      ...serializeProcess(process),
      versions: versions.results.map((version) => ({
        id: version.id,
        versionNumber: version.version_number,
        name: version.name,
        description: version.description,
        status: version.status,
        publishedAt: version.published_at,
        publishedBy: version.published_by,
        createdBy: version.created_by,
        createdAt: version.created_at,
      })),
    },
  });
}

async function updateProcess(request, env, auth, processId) {
  const existing = await getTraceDatabase(env).prepare(
    `SELECT *
     FROM trace_processes
     WHERE id = ?
       AND tenant_id = ?
     LIMIT 1`
  )
    .bind(processId, auth.tenantId)
    .first();

  if (!existing) {
    return json(
      {
        ok: false,
        error: "not_found",
        message: "El proceso no existe.",
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

  const allowedStatuses = new Set([
    "draft",
    "active",
    "paused",
    "retired",
    "archived",
  ]);

  const name =
    body.name === undefined
      ? existing.name
      : normalizeText(body.name, 160);

  if (!name) {
    return json(
      {
        ok: false,
        error: "validation_error",
        message: "El nombre del proceso no puede quedar vacío.",
      },
      422
    );
  }

  const status =
    body.status === undefined
      ? existing.status
      : normalizeText(body.status, 40);

  if (!allowedStatuses.has(status)) {
    return json(
      {
        ok: false,
        error: "validation_error",
        message: "El estado indicado no es válido.",
      },
      422
    );
  }

  const description =
    body.description === undefined
      ? existing.description
      : normalizeText(body.description, 2000);

  const category =
    body.category === undefined
      ? existing.category
      : normalizeText(body.category, 80) || "general";

  const color =
    body.color === undefined
      ? existing.color
      : normalizeText(body.color, 20) || "#2563eb";

  const icon =
    body.icon === undefined
      ? existing.icon
      : normalizeText(body.icon, 80);

  const settings =
    body.settings === undefined
      ? parseJson(existing.settings_json, {})
      : normalizeSettings(body.settings);

  await getTraceDatabase(env).prepare(
    `UPDATE trace_processes
     SET
       name = ?,
       description = ?,
       category = ?,
       status = ?,
       color = ?,
       icon = ?,
       settings_json = ?,
       updated_at = datetime('now')
     WHERE id = ?
       AND tenant_id = ?`
  )
    .bind(
      name,
      description,
      category,
      status,
      color,
      icon,
      JSON.stringify(settings),
      processId,
      auth.tenantId
    )
    .run();

  if (existing.status === "draft") {
    await getTraceDatabase(env).prepare(
      `UPDATE trace_process_versions
       SET
         name = ?,
         description = ?
       WHERE id = ?
         AND status = 'draft'`
    )
      .bind(
        name,
        description,
        existing.current_version_id
      )
      .run();
  }

  return getProcess(env, auth.tenantId, processId);
}

export async function handleTraceV1Processes(request, env) {
  const url = new URL(request.url);

  const processRouteMatch = url.pathname.match(
    /^\/api\/trace\/v1\/processes(?:\/([^/]+))?\/?$/
  );

  if (!processRouteMatch) {
    return null;
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CORS,
    });
  }

  const auth = await authenticate(request, env);

  if (auth.error) return auth.error;

  const processId = processRouteMatch[1]
    ? decodeURIComponent(processRouteMatch[1])
    : null;

  if (!processId && request.method === "GET") {
    return listProcesses(env, auth.tenantId, url);
  }

  if (!processId && request.method === "POST") {
    return createProcess(request, env, auth);
  }

  if (processId && request.method === "GET") {
    return getProcess(env, auth.tenantId, processId);
  }

  if (processId && request.method === "PATCH") {
    return updateProcess(request, env, auth, processId);
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
