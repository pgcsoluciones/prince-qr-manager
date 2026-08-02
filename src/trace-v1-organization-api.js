import jwt from "@tsndr/cloudflare-worker-jwt";
import {
  getTraceDatabase,
} from "./trace/shared/database.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods":
    "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization",
};

const DEPARTMENT_STATUSES = new Set([
  "active",
  "inactive",
  "archived",
]);

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        ...CORS,
        "Content-Type": "application/json",
      },
    }
  );
}

function uuid() {
  return crypto.randomUUID();
}

function parseJson(value, fallback = {}) {
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

function normalizeText(
  value,
  maxLength = 255
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const normalized =
    String(value).trim();

  return normalized
    ? normalized.slice(0, maxLength)
    : null;
}

function normalizeCode(value) {
  const normalized =
    normalizeText(value, 60);

  if (!normalized) return null;

  return normalized
    .toUpperCase()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(/[^A-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function normalizeSettings(value) {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value;
  }

  return {};
}

function serializeDepartment(row) {
  if (!row) return null;

  return {
    id: row.id,
    tenantId: row.tenant_id,
    departmentCode:
      row.department_code,
    name: row.name,
    description: row.description,
    parentDepartmentId:
      row.parent_department_id,
    parentDepartmentName:
      row.parent_department_name ||
      null,
    status: row.status,
    color: row.color,
    icon: row.icon,
    settings: parseJson(
      row.settings_json,
      {}
    ),
    membersCount: Number(
      row.members_count || 0
    ),
    activeMembersCount: Number(
      row.active_members_count || 0
    ),
    primaryLead: row.primary_lead_user_id
      ? {
          userId:
            row.primary_lead_user_id,
          email:
            row.primary_lead_email ||
            null,
        }
      : null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function authenticate(
  request,
  env
) {
  const authorization =
    request.headers.get(
      "Authorization"
    ) || "";

  if (
    !authorization.startsWith(
      "Bearer "
    )
  ) {
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

  const token =
    authorization
      .slice(7)
      .trim();

  const jwtSecret =
    env.JWT_SECRET ||
    "changeme-set-in-cloudflare-dashboard";

  const valid = await jwt.verify(
    token,
    jwtSecret
  );

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
  const payload =
    decoded?.payload || {};

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
          error:
            "invalid_token_payload",
          message:
            "El token no identifica al usuario.",
        },
        401
      ),
    };
  }

  const db = getTraceDatabase(env);

  const user = await db.prepare(
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
      user.enterprise_id ||
      user.id,
  };
}

function canManageOrganization(auth) {
  return [
    "superadmin",
    "enterprise",
    "tenant",
  ].includes(auth.user.role);
}

function forbidden() {
  return json(
    {
      ok: false,
      error: "forbidden",
      message:
        "No tienes permiso para administrar la organización.",
    },
    403
  );
}

function departmentSelect() {
  return `
    SELECT
      d.*,
      parent.name
        AS parent_department_name,

      (
        SELECT COUNT(*)
        FROM trace_department_members dm
        WHERE dm.department_id = d.id
      ) AS members_count,

      (
        SELECT COUNT(*)
        FROM trace_department_members dm
        WHERE dm.department_id = d.id
          AND dm.status = 'active'
      ) AS active_members_count,

      (
        SELECT dm.user_id
        FROM trace_department_members dm
        WHERE dm.department_id = d.id
          AND dm.membership_role = 'lead'
          AND dm.is_primary = 1
          AND dm.status = 'active'
        LIMIT 1
      ) AS primary_lead_user_id,

      (
        SELECT u.email
        FROM trace_department_members dm
        JOIN users u
          ON u.id = dm.user_id
        WHERE dm.department_id = d.id
          AND dm.membership_role = 'lead'
          AND dm.is_primary = 1
          AND dm.status = 'active'
        LIMIT 1
      ) AS primary_lead_email

    FROM trace_departments d

    LEFT JOIN trace_departments parent
      ON parent.id =
        d.parent_department_id
  `;
}

async function findDepartment(
  env,
  tenantId,
  departmentId
) {
  return getTraceDatabase(env)
    .prepare(
      `${departmentSelect()}
       WHERE d.id = ?
         AND d.tenant_id = ?
       LIMIT 1`
    )
    .bind(
      departmentId,
      tenantId
    )
    .first();
}

async function listDepartments(
  env,
  tenantId,
  url
) {
  const status =
    normalizeText(
      url.searchParams.get(
        "status"
      ),
      30
    );

  const search =
    normalizeText(
      url.searchParams.get(
        "search"
      ),
      120
    );

  if (
    status &&
    !DEPARTMENT_STATUSES.has(status)
  ) {
    return json(
      {
        ok: false,
        error: "validation_error",
        message:
          "El estado solicitado no es válido.",
        fields: {
          status: "invalid",
        },
      },
      422
    );
  }

  const limit = Math.min(
    Math.max(
      Number(
        url.searchParams.get(
          "limit"
        ) || 100
      ),
      1
    ),
    200
  );

  const offset = Math.max(
    Number(
      url.searchParams.get(
        "offset"
      ) || 0
    ),
    0
  );

  const clauses = [
    "d.tenant_id = ?",
  ];

  const bindings = [
    tenantId,
  ];

  if (status) {
    clauses.push(
      "d.status = ?"
    );

    bindings.push(status);
  }

  if (search) {
    clauses.push(
      `(
        LOWER(d.name)
          LIKE LOWER(?)
        OR
        LOWER(d.department_code)
          LIKE LOWER(?)
        OR
        LOWER(
          COALESCE(
            d.description,
            ''
          )
        ) LIKE LOWER(?)
      )`
    );

    const pattern =
      `%${search}%`;

    bindings.push(
      pattern,
      pattern,
      pattern
    );
  }

  bindings.push(
    limit,
    offset
  );

  const result =
    await getTraceDatabase(env)
      .prepare(
        `${departmentSelect()}
         WHERE ${clauses.join(
           " AND "
         )}
         ORDER BY
           CASE d.status
             WHEN 'active' THEN 0
             WHEN 'inactive' THEN 1
             ELSE 2
           END,
           d.name COLLATE NOCASE
         LIMIT ? OFFSET ?`
      )
      .bind(...bindings)
      .all();

  return json({
    ok: true,
    data:
      result.results.map(
        serializeDepartment
      ),
    pagination: {
      limit,
      offset,
      returned:
        result.results.length,
    },
  });
}

async function createDepartment(
  request,
  env,
  auth
) {
  if (
    !canManageOrganization(auth)
  ) {
    return forbidden();
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

  const name =
    normalizeText(
      body.name,
      160
    );

  const departmentCode =
    normalizeCode(
      body.departmentCode ||
      body.department_code ||
      body.code ||
      name
    );

  if (!name) {
    return json(
      {
        ok: false,
        error: "validation_error",
        message:
          "El nombre del departamento es obligatorio.",
        fields: {
          name: "required",
        },
      },
      422
    );
  }

  if (!departmentCode) {
    return json(
      {
        ok: false,
        error: "validation_error",
        message:
          "El código del departamento no es válido.",
        fields: {
          departmentCode:
            "invalid",
        },
      },
      422
    );
  }

  const status =
    normalizeText(
      body.status,
      30
    ) || "active";

  if (
    !DEPARTMENT_STATUSES.has(
      status
    )
  ) {
    return json(
      {
        ok: false,
        error: "validation_error",
        message:
          "El estado indicado no es válido.",
        fields: {
          status: "invalid",
        },
      },
      422
    );
  }

  const parentDepartmentId =
    normalizeText(
      body.parentDepartmentId ||
      body.parent_department_id,
      80
    );

  if (parentDepartmentId) {
    const parent =
      await findDepartment(
        env,
        auth.tenantId,
        parentDepartmentId
      );

    if (!parent) {
      return json(
        {
          ok: false,
          error:
            "parent_department_not_found",
          message:
            "El departamento superior no existe dentro del tenant.",
        },
        422
      );
    }
  }

  const db =
    getTraceDatabase(env);

  const duplicate =
    await db.prepare(
      `SELECT id
       FROM trace_departments
       WHERE tenant_id = ?
         AND (
           LOWER(name) =
             LOWER(?)
           OR department_code = ?
         )
       LIMIT 1`
    )
      .bind(
        auth.tenantId,
        name,
        departmentCode
      )
      .first();

  if (duplicate) {
    return json(
      {
        ok: false,
        error:
          "department_already_exists",
        message:
          "Ya existe un departamento con ese nombre o código.",
      },
      409
    );
  }

  const departmentId =
    uuid();

  await db.prepare(
    `INSERT INTO trace_departments (
       id,
       tenant_id,
       department_code,
       name,
       description,
       parent_department_id,
       status,
       color,
       icon,
       settings_json,
       created_by
     )
     VALUES (
       ?, ?, ?, ?, ?, ?,
       ?, ?, ?, ?, ?
     )`
  )
    .bind(
      departmentId,
      auth.tenantId,
      departmentCode,
      name,
      normalizeText(
        body.description,
        2000
      ),
      parentDepartmentId,
      status,
      normalizeText(
        body.color,
        30
      ),
      normalizeText(
        body.icon,
        120
      ),
      JSON.stringify(
        normalizeSettings(
          body.settings
        )
      ),
      auth.user.id
    )
    .run();

  const created =
    await findDepartment(
      env,
      auth.tenantId,
      departmentId
    );

  return json(
    {
      ok: true,
      data:
        serializeDepartment(
          created
        ),
    },
    201
  );
}

async function updateDepartment(
  request,
  env,
  auth,
  departmentId
) {
  if (
    !canManageOrganization(auth)
  ) {
    return forbidden();
  }

  const existing =
    await findDepartment(
      env,
      auth.tenantId,
      departmentId
    );

  if (!existing) {
    return json(
      {
        ok: false,
        error:
          "department_not_found",
        message:
          "El departamento no existe.",
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

  const updates = [];
  const bindings = [];

  if (
    Object.prototype.hasOwnProperty.call(
      body,
      "name"
    )
  ) {
    const name =
      normalizeText(
        body.name,
        160
      );

    if (!name) {
      return json(
        {
          ok: false,
          error:
            "validation_error",
          message:
            "El nombre no puede estar vacío.",
          fields: {
            name: "required",
          },
        },
        422
      );
    }

    updates.push("name = ?");
    bindings.push(name);
  }

  if (
    Object.prototype.hasOwnProperty.call(
      body,
      "departmentCode"
    ) ||
    Object.prototype.hasOwnProperty.call(
      body,
      "department_code"
    ) ||
    Object.prototype.hasOwnProperty.call(
      body,
      "code"
    )
  ) {
    const code =
      normalizeCode(
        body.departmentCode ||
        body.department_code ||
        body.code
      );

    if (!code) {
      return json(
        {
          ok: false,
          error:
            "validation_error",
          message:
            "El código no es válido.",
          fields: {
            departmentCode:
              "invalid",
          },
        },
        422
      );
    }

    updates.push(
      "department_code = ?"
    );

    bindings.push(code);
  }

  if (
    Object.prototype.hasOwnProperty.call(
      body,
      "description"
    )
  ) {
    updates.push(
      "description = ?"
    );

    bindings.push(
      normalizeText(
        body.description,
        2000
      )
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(
      body,
      "status"
    )
  ) {
    const status =
      normalizeText(
        body.status,
        30
      );

    if (
      !DEPARTMENT_STATUSES.has(
        status
      )
    ) {
      return json(
        {
          ok: false,
          error:
            "validation_error",
          message:
            "El estado no es válido.",
          fields: {
            status: "invalid",
          },
        },
        422
      );
    }

    updates.push("status = ?");
    bindings.push(status);
  }

  if (
    Object.prototype.hasOwnProperty.call(
      body,
      "parentDepartmentId"
    ) ||
    Object.prototype.hasOwnProperty.call(
      body,
      "parent_department_id"
    )
  ) {
    const parentDepartmentId =
      normalizeText(
        body.parentDepartmentId ??
        body.parent_department_id,
        80
      );

    if (
      parentDepartmentId ===
      departmentId
    ) {
      return json(
        {
          ok: false,
          error:
            "invalid_parent_department",
          message:
            "Un departamento no puede depender de sí mismo.",
        },
        422
      );
    }

    if (parentDepartmentId) {
      const parent =
        await findDepartment(
          env,
          auth.tenantId,
          parentDepartmentId
        );

      if (!parent) {
        return json(
          {
            ok: false,
            error:
              "parent_department_not_found",
            message:
              "El departamento superior no existe dentro del tenant.",
          },
          422
        );
      }

      let currentParentId =
        parent.parent_department_id;

      const visited =
        new Set([
          parentDepartmentId,
        ]);

      while (currentParentId) {
        if (
          currentParentId ===
          departmentId
        ) {
          return json(
            {
              ok: false,
              error:
                "department_cycle",
              message:
                "La relación indicada crearía un ciclo entre departamentos.",
            },
            422
          );
        }

        if (
          visited.has(
            currentParentId
          )
        ) {
          break;
        }

        visited.add(
          currentParentId
        );

        const ancestor =
          await findDepartment(
            env,
            auth.tenantId,
            currentParentId
          );

        currentParentId =
          ancestor
            ?.parent_department_id ||
          null;
      }
    }

    updates.push(
      "parent_department_id = ?"
    );

    bindings.push(
      parentDepartmentId
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(
      body,
      "color"
    )
  ) {
    updates.push("color = ?");

    bindings.push(
      normalizeText(
        body.color,
        30
      )
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(
      body,
      "icon"
    )
  ) {
    updates.push("icon = ?");

    bindings.push(
      normalizeText(
        body.icon,
        120
      )
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(
      body,
      "settings"
    )
  ) {
    updates.push(
      "settings_json = ?"
    );

    bindings.push(
      JSON.stringify(
        normalizeSettings(
          body.settings
        )
      )
    );
  }

  if (!updates.length) {
    return json(
      {
        ok: false,
        error:
          "nothing_to_update",
        message:
          "No se recibieron campos para actualizar.",
      },
      400
    );
  }

  const resultingName =
    updates.includes("name = ?")
      ? bindings[
          updates.indexOf(
            "name = ?"
          )
        ]
      : existing.name;

  const resultingCode =
    updates.includes(
      "department_code = ?"
    )
      ? bindings[
          updates.indexOf(
            "department_code = ?"
          )
        ]
      : existing.department_code;

  const duplicate =
    await getTraceDatabase(env)
      .prepare(
        `SELECT id
         FROM trace_departments
         WHERE tenant_id = ?
           AND id <> ?
           AND (
             LOWER(name) =
               LOWER(?)
             OR department_code = ?
           )
         LIMIT 1`
      )
      .bind(
        auth.tenantId,
        departmentId,
        resultingName,
        resultingCode
      )
      .first();

  if (duplicate) {
    return json(
      {
        ok: false,
        error:
          "department_already_exists",
        message:
          "Ya existe otro departamento con ese nombre o código.",
      },
      409
    );
  }

  updates.push(
    "updated_at = datetime('now')"
  );

  bindings.push(
    departmentId,
    auth.tenantId
  );

  await getTraceDatabase(env)
    .prepare(
      `UPDATE trace_departments
       SET ${updates.join(", ")}
       WHERE id = ?
         AND tenant_id = ?`
    )
    .bind(...bindings)
    .run();

  const updated =
    await findDepartment(
      env,
      auth.tenantId,
      departmentId
    );

  return json({
    ok: true,
    data:
      serializeDepartment(
        updated
      ),
  });
}

async function deleteDepartment(
  env,
  auth,
  departmentId
) {
  if (
    !canManageOrganization(auth)
  ) {
    return forbidden();
  }

  const existing =
    await findDepartment(
      env,
      auth.tenantId,
      departmentId
    );

  if (!existing) {
    return json(
      {
        ok: false,
        error:
          "department_not_found",
        message:
          "El departamento no existe.",
      },
      404
    );
  }

  const dependencies =
    await getTraceDatabase(env)
      .prepare(
        `SELECT
           (
             SELECT COUNT(*)
             FROM trace_department_members
             WHERE department_id = ?
           ) AS members_count,

           (
             SELECT COUNT(*)
             FROM trace_process_version_departments
             WHERE department_id = ?
           ) AS process_links_count,

           (
             SELECT COUNT(*)
             FROM trace_process_version_participants
             WHERE department_id = ?
           ) AS process_participants_count,

           (
             SELECT COUNT(*)
             FROM trace_execution_departments
             WHERE department_id = ?
           ) AS execution_links_count,

           (
             SELECT COUNT(*)
             FROM trace_execution_participants
             WHERE department_id = ?
           ) AS execution_participants_count,

           (
             SELECT COUNT(*)
             FROM trace_departments
             WHERE parent_department_id = ?
           ) AS child_departments_count`
      )
      .bind(
        departmentId,
        departmentId,
        departmentId,
        departmentId,
        departmentId,
        departmentId
      )
      .first();

  const dependencyTotal =
    Number(
      dependencies.members_count || 0
    ) +
    Number(
      dependencies.process_links_count ||
      0
    ) +
    Number(
      dependencies.process_participants_count ||
      0
    ) +
    Number(
      dependencies.execution_links_count ||
      0
    ) +
    Number(
      dependencies.execution_participants_count ||
      0
    ) +
    Number(
      dependencies.child_departments_count ||
      0
    );

  if (dependencyTotal > 0) {
    return json(
      {
        ok: false,
        error:
          "department_has_dependencies",
        message:
          "El departamento tiene relaciones activas y no puede eliminarse. Puedes archivarlo.",
        dependencies: {
          members: Number(
            dependencies.members_count ||
            0
          ),
          processes: Number(
            dependencies.process_links_count ||
            0
          ),
          processParticipants:
            Number(
              dependencies.process_participants_count ||
              0
            ),
          executions: Number(
            dependencies.execution_links_count ||
            0
          ),
          executionParticipants:
            Number(
              dependencies.execution_participants_count ||
              0
            ),
          childDepartments:
            Number(
              dependencies.child_departments_count ||
              0
            ),
        },
      },
      409
    );
  }

  await getTraceDatabase(env)
    .prepare(
      `DELETE FROM trace_departments
       WHERE id = ?
         AND tenant_id = ?`
    )
    .bind(
      departmentId,
      auth.tenantId
    )
    .run();

  return json({
    ok: true,
    deletedId: departmentId,
  });
}

export async function
handleTraceV1Organization(
  request,
  env
) {
  const url =
    new URL(request.url);

  const path =
    url.pathname;

  const method =
    request.method.toUpperCase();

  const basePath =
    "/api/trace/v1/departments";

  if (
    path !== basePath &&
    !path.startsWith(
      `${basePath}/`
    )
  ) {
    return null;
  }

  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CORS,
    });
  }

  const auth =
    await authenticate(
      request,
      env
    );

  if (auth.error) {
    return auth.error;
  }

  if (
    path === basePath &&
    method === "GET"
  ) {
    return listDepartments(
      env,
      auth.tenantId,
      url
    );
  }

  if (
    path === basePath &&
    method === "POST"
  ) {
    return createDepartment(
      request,
      env,
      auth
    );
  }

  const match =
    path.match(
      /^\/api\/trace\/v1\/departments\/([^/]+)$/
    );

  if (match) {
    const departmentId =
      decodeURIComponent(
        match[1]
      );

    if (method === "GET") {
      const department =
        await findDepartment(
          env,
          auth.tenantId,
          departmentId
        );

      if (!department) {
        return json(
          {
            ok: false,
            error:
              "department_not_found",
            message:
              "El departamento no existe.",
          },
          404
        );
      }

      return json({
        ok: true,
        data:
          serializeDepartment(
            department
          ),
      });
    }

    if (method === "PATCH") {
      return updateDepartment(
        request,
        env,
        auth,
        departmentId
      );
    }

    if (method === "DELETE") {
      return deleteDepartment(
        env,
        auth,
        departmentId
      );
    }
  }

  return json(
    {
      ok: false,
      error: "route_not_found",
      message:
        "La ruta organizacional solicitada no existe.",
    },
    404
  );
}
