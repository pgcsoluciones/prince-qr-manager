import {
  getTraceDatabase,
} from "./trace/shared/database.js";

import {
  bearerTokenFromRequest,
  findOperationalSession,
  getTraceAuthPepper,
  hashOperationalToken,
  operationalSessionIsActive,
  serializeOperationalSession,
} from "./trace/shared/operational-auth.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Device-Id",
};

const ACCESS_BASE =
  "/api/trace/v1/access";

const OTP_CHANNELS = new Set([
  "email",
  "whatsapp",
  "sms",
]);

const OTP_PURPOSES = new Set([
  "login",
]);

const OTP_TTL_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;
const OTP_REQUEST_LIMIT = 5;
const OTP_WINDOW_MINUTES = 15;
const OTP_BLOCK_MINUTES = 15;
const OPERATIONAL_SESSION_HOURS = 8;

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        ...CORS,
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    }
  );
}

function uuid() {
  return crypto.randomUUID();
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

function normalizeEmail(value) {
  const normalized =
    normalizeText(value, 320);

  if (!normalized) return null;

  const email =
    normalized.toLowerCase();

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email
    )
  ) {
    return null;
  }

  return email;
}

function normalizePhone(value) {
  const normalized =
    normalizeText(value, 30);

  if (!normalized) return null;

  const compact =
    normalized.replace(
      /[^\d+]/g,
      ""
    );

  if (
    !/^\+[1-9]\d{7,14}$/.test(
      compact
    )
  ) {
    return null;
  }

  return compact;
}

function normalizeChannel(value) {
  const normalized =
    normalizeText(value, 30)
      ?.toLowerCase();

  return OTP_CHANNELS.has(normalized)
    ? normalized
    : null;
}

function normalizePurpose(value) {
  const normalized =
    normalizeText(value, 40)
      ?.toLowerCase() ||
    "login";

  return OTP_PURPOSES.has(normalized)
    ? normalized
    : null;
}

function addMinutes(date, minutes) {
  return new Date(
    date.getTime() +
    minutes * 60 * 1000
  );
}

function addHours(date, hours) {
  return new Date(
    date.getTime() +
    hours * 60 * 60 * 1000
  );
}

function toSqlDate(date) {
  return date
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, "");
}

function constantTimeEqual(
  left,
  right
) {
  if (
    typeof left !== "string" ||
    typeof right !== "string" ||
    left.length !== right.length
  ) {
    return false;
  }

  let difference = 0;

  for (
    let index = 0;
    index < left.length;
    index += 1
  ) {
    difference |=
      left.charCodeAt(index) ^
      right.charCodeAt(index);
  }

  return difference === 0;
}

async function sha256(value) {
  const bytes =
    new TextEncoder().encode(
      String(value)
    );

  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      bytes
    );

  return Array.from(
    new Uint8Array(digest)
  )
    .map((byte) =>
      byte.toString(16).padStart(2, "0")
    )
    .join("");
}

function base64UrlEncode(bytes) {
  let binary = "";

  for (
    let index = 0;
    index < bytes.length;
    index += 1
  ) {
    binary += String.fromCharCode(
      bytes[index]
    );
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function generateOpaqueToken() {
  const bytes =
    new Uint8Array(48);

  crypto.getRandomValues(bytes);

  return `trace_op_${base64UrlEncode(
    bytes
  )}`;
}

function generateOtpCode() {
  const values =
    new Uint32Array(1);

  crypto.getRandomValues(values);

  return String(
    values[0] % 1000000
  ).padStart(6, "0");
}

function maskEmail(email) {
  if (!email) return null;

  const [
    local,
    domain,
  ] = email.split("@");

  if (!domain) return null;

  const visible =
    local.slice(0, 2);

  return `${visible}${"*".repeat(
    Math.max(3, local.length - 2)
  )}@${domain}`;
}

function maskPhone(phone) {
  if (!phone) return null;

  return `***${phone.slice(-4)}`;
}

function requestIp(request) {
  return (
    request.headers.get(
      "CF-Connecting-IP"
    ) ||
    request.headers.get(
      "X-Forwarded-For"
    ) ||
    ""
  )
    .split(",")[0]
    .trim();
}

async function requestFingerprint(
  request
) {
  const ip =
    requestIp(request);

  const deviceId =
    normalizeText(
      request.headers.get(
        "X-Device-Id"
      ),
      200
    ) || "";

  const userAgent =
    normalizeText(
      request.headers.get(
        "User-Agent"
      ),
      500
    ) || "";

  return {
    ipHash: ip
      ? await sha256(ip)
      : null,
    deviceHash:
      deviceId || userAgent
        ? await sha256(
            `${deviceId}|${userAgent}`
          )
        : null,
    userAgent:
      userAgent || null,
  };
}

function tenantIdForUser(user) {
  return (
    user.enterprise_id ||
    user.id
  );
}

async function findEligibleUser(
  db,
  identifier,
  channel
) {
  const field =
    channel === "email"
      ? "email"
      : "phone_e164";

  return db.prepare(
    `SELECT
       id,
       email,
       phone_e164,
       role,
       plan,
       enterprise_id,
       is_active,
       operational_access_enabled
     FROM users
     WHERE ${field} = ?
     LIMIT 1`
  )
    .bind(identifier)
    .first();
}

async function writeAudit(
  db,
  {
    tenantId,
    userId = null,
    sessionId = null,
    challengeId = null,
    eventType,
    result,
    projectId = null,
    executionId = null,
    fingerprint,
    details = {},
  }
) {
  if (!tenantId) return;

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
       request_ip_hash,
       request_device_hash,
       request_user_agent,
       details_json
     )
     VALUES (
       ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
     )`
  )
    .bind(
      uuid(),
      tenantId,
      userId,
      sessionId,
      challengeId,
      eventType,
      result,
      projectId,
      executionId,
      fingerprint?.ipHash || null,
      fingerprint?.deviceHash || null,
      fingerprint?.userAgent || null,
      JSON.stringify(details)
    )
    .run();
}

async function applyRateLimit(
  db,
  {
    tenantId,
    scopeType,
    scopeHash,
    actionType,
  }
) {
  const now =
    new Date();

  const current =
    await db.prepare(
      `SELECT
         id,
         attempt_count,
         window_started_at,
         blocked_until
       FROM trace_auth_rate_limits
       WHERE tenant_id = ?
         AND scope_type = ?
         AND scope_hash = ?
         AND action_type = ?
       LIMIT 1`
    )
      .bind(
        tenantId,
        scopeType,
        scopeHash,
        actionType
      )
      .first();

  if (
    current?.blocked_until &&
    new Date(
      `${current.blocked_until}Z`
    ) > now
  ) {
    return {
      allowed: false,
      blockedUntil:
        current.blocked_until,
    };
  }

  const windowStarted =
    current?.window_started_at
      ? new Date(
          `${current.window_started_at}Z`
        )
      : null;

  const windowExpired =
    !windowStarted ||
    now.getTime() -
      windowStarted.getTime() >
      OTP_WINDOW_MINUTES *
        60 *
        1000;

  const nextAttemptCount =
    windowExpired
      ? 1
      : Number(
          current?.attempt_count || 0
        ) + 1;

  const shouldBlock =
    nextAttemptCount >
    OTP_REQUEST_LIMIT;

  const blockedUntil =
    shouldBlock
      ? toSqlDate(
          addMinutes(
            now,
            OTP_BLOCK_MINUTES
          )
        )
      : null;

  if (current) {
    await db.prepare(
      `UPDATE trace_auth_rate_limits
       SET
         attempt_count = ?,
         window_started_at = ?,
         blocked_until = ?,
         updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(
        nextAttemptCount,
        windowExpired
          ? toSqlDate(now)
          : current.window_started_at,
        blockedUntil,
        current.id
      )
      .run();
  } else {
    await db.prepare(
      `INSERT INTO trace_auth_rate_limits (
         id,
         tenant_id,
         scope_type,
         scope_hash,
         action_type,
         attempt_count,
         window_started_at,
         blocked_until
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        uuid(),
        tenantId,
        scopeType,
        scopeHash,
        actionType,
        nextAttemptCount,
        toSqlDate(now),
        blockedUntil
      )
      .run();
  }

  return {
    allowed: !shouldBlock,
    blockedUntil,
  };
}

async function deliverOtp(
  env,
  {
    channel,
    destination,
    code,
  }
) {
  const isPreview =
    String(
      env.ENVIRONMENT || ""
    ).toLowerCase() ===
    "preview";

  const exposePreviewCode =
    String(
      env.TRACE_OTP_EXPOSE_CODE ||
      ""
    ).toLowerCase() ===
    "true";

  if (isPreview) {
    return {
      delivered: true,
      mode: "preview",
      previewCode:
        exposePreviewCode
          ? code
          : null,
    };
  }

  return {
    delivered: false,
    mode: "provider_unavailable",
    previewCode: null,
  };
}

async function requestOtp(
  request,
  env
) {
  let body;

  try {
    body =
      await request.json();
  } catch {
    return json(
      {
        ok: false,
        error: "invalid_json",
        message:
          "El cuerpo de la solicitud no es válido.",
      },
      400
    );
  }

  const channel =
    normalizeChannel(
      body.channel
    );

  const purpose =
    normalizePurpose(
      body.purpose
    );

  if (!channel || !purpose) {
    return json(
      {
        ok: false,
        error: "validation_error",
        message:
          "El canal o propósito no es válido.",
      },
      400
    );
  }

  const identifier =
    channel === "email"
      ? normalizeEmail(
          body.identifier
        )
      : normalizePhone(
          body.identifier
        );

  if (!identifier) {
    return json(
      {
        ok: false,
        error: "validation_error",
        message:
          channel === "email"
            ? "El correo no es válido."
            : "El teléfono debe incluir el código de país.",
      },
      400
    );
  }

  const requestedProjectId =
    normalizeText(
      body.projectId,
      100
    );

  const requestedExecutionId =
    normalizeText(
      body.executionId,
      100
    );

  if (
    requestedProjectId ||
    requestedExecutionId
  ) {
    return json(
      {
        ok: false,
        error:
          "operational_context_not_available",
        message:
          "La asignación operativa todavía no puede resolverse mediante esta ruta.",
      },
      422
    );
  }

  const projectId = null;
  const executionId = null;

  const db =
    getTraceDatabase(env);

  const fingerprint =
    await requestFingerprint(
      request
    );

  const fakeChallengeId =
    uuid();

  const user =
    await findEligibleUser(
      db,
      identifier,
      channel
    );

  const neutralResponse = {
    ok: true,
    accepted: true,
    challengeId:
      fakeChallengeId,
    message:
      "Si los datos corresponden a una cuenta autorizada, recibirás un código de acceso.",
    expiresInSeconds:
      OTP_TTL_MINUTES * 60,
  };

  if (
    !user ||
    Number(user.is_active) !== 1 ||
    Number(
      user.operational_access_enabled
    ) !== 1
  ) {
    return json(
      neutralResponse,
      202
    );
  }

  const tenantId =
    tenantIdForUser(user);

  const destinationHash =
    await sha256(identifier);

  const rateLimit =
    await applyRateLimit(
      db,
      {
        tenantId,
        scopeType:
          channel === "email"
            ? "email"
            : "phone",
        scopeHash:
          destinationHash,
        actionType:
          "request_otp",
      }
    );

  if (!rateLimit.allowed) {
    await writeAudit(
      db,
      {
        tenantId,
        userId: user.id,
        eventType:
          "otp_request",
        result: "blocked",
        fingerprint,
        details: {
          channel,
          purpose,
          reason:
            "rate_limit",
        },
      }
    );

    return json(
      neutralResponse,
      202
    );
  }

  const challengeId =
    uuid();

  const code =
    generateOtpCode();

  let authPepper;

  try {
    authPepper =
      getTraceAuthPepper(env);
  } catch {
    return json(
      {
        ok: false,
        error:
          "authentication_configuration_error",
        message:
          "El acceso operacional no está disponible temporalmente.",
      },
      503
    );
  }

  const codeHash =
    await sha256(
      `trace-otp:${authPepper}:${challengeId}:${code}`
    );

  const now =
    new Date();

  const expiresAt =
    addMinutes(
      now,
      OTP_TTL_MINUTES
    );


  const hint =
    channel === "email"
      ? maskEmail(user.email)
      : maskPhone(
          user.phone_e164
        );

  const delivery =
    await deliverOtp(
      env,
      {
        channel,
        destination: identifier,
        code,
      }
    );

  if (!delivery.delivered) {
    await writeAudit(
      db,
      {
        tenantId,
        userId: user.id,
        eventType:
          "otp_delivery",
        result: "failure",
        projectId,
        executionId,
        fingerprint,
        details: {
          channel,
          purpose,
          reason:
            delivery.mode,
        },
      }
    );

    return json(
      {
        ok: false,
        error:
          "delivery_provider_unavailable",
        message:
          "El canal de acceso no está disponible temporalmente.",
      },
      503
    );
  }

  await db.prepare(
    `INSERT INTO trace_auth_challenges (
       id,
       tenant_id,
       user_id,
       purpose,
       channel,
       destination_hash,
       destination_hint,
       code_hash,
       status,
       attempt_count,
       max_attempts,
       request_ip_hash,
       request_device_hash,
       request_user_agent,
       project_id,
       execution_id,
       metadata_json,
       expires_at
     )
     VALUES (
       ?, ?, ?, ?, ?, ?, ?, ?, 'pending',
       0, ?, ?, ?, ?, ?, ?, ?, ?
     )`
  )
    .bind(
      challengeId,
      tenantId,
      user.id,
      purpose,
      channel,
      destinationHash,
      hint,
      codeHash,
      OTP_MAX_ATTEMPTS,
      fingerprint.ipHash,
      fingerprint.deviceHash,
      fingerprint.userAgent,
      projectId,
      executionId,
      JSON.stringify({
        deliveryMode:
          delivery.mode,
      }),
      toSqlDate(expiresAt)
    )
    .run();

  await writeAudit(
    db,
    {
      tenantId,
      userId: user.id,
      challengeId,
      eventType:
        "otp_request",
      result: "success",
      projectId,
      executionId,
      fingerprint,
      details: {
        channel,
        purpose,
        deliveryMode:
          delivery.mode,
      },
    }
  );

  return json(
    {
      ...neutralResponse,
      challengeId,
      destinationHint: hint,
      deliveryMode:
        delivery.mode,
      ...(delivery.previewCode
        ? {
            previewCode:
              delivery.previewCode,
          }
        : {}),
    },
    202
  );
}

async function verifyOtp(
  request,
  env
) {
  let body;

  try {
    body =
      await request.json();
  } catch {
    return json(
      {
        ok: false,
        error: "invalid_json",
        message:
          "El cuerpo de la solicitud no es válido.",
      },
      400
    );
  }

  const challengeId =
    normalizeText(
      body.challengeId,
      100
    );

  const code =
    normalizeText(
      body.code,
      12
    );

  if (
    !challengeId ||
    !/^\d{6}$/.test(code || "")
  ) {
    return json(
      {
        ok: false,
        error: "validation_error",
        message:
          "El código de acceso no es válido.",
      },
      400
    );
  }

  const db =
    getTraceDatabase(env);

  const fingerprint =
    await requestFingerprint(
      request
    );

  const challenge =
    await db.prepare(
      `SELECT
         c.*,
         u.email,
         u.role,
         u.plan,
         u.enterprise_id,
         u.is_active,
         u.operational_access_enabled
       FROM trace_auth_challenges c
       JOIN users u
         ON u.id = c.user_id
       WHERE c.id = ?
       LIMIT 1`
    )
      .bind(challengeId)
      .first();

  if (!challenge) {
    return json(
      {
        ok: false,
        error:
          "invalid_or_expired_code",
        message:
          "El código no es válido o ya expiró.",
      },
      401
    );
  }

  const now =
    new Date();

  const expiresAt =
    new Date(
      `${challenge.expires_at}Z`
    );

  if (
    challenge.status !==
      "pending" ||
    expiresAt <= now ||
    Number(challenge.is_active) !==
      1 ||
    Number(
      challenge
        .operational_access_enabled
    ) !== 1
  ) {
    if (
      challenge.status ===
        "pending" &&
      expiresAt <= now
    ) {
      await db.prepare(
        `UPDATE trace_auth_challenges
         SET
           status = 'expired',
           updated_at = datetime('now')
         WHERE id = ?
           AND status = 'pending'`
      )
        .bind(challengeId)
        .run();
    }

    await writeAudit(
      db,
      {
        tenantId:
          challenge.tenant_id,
        userId:
          challenge.user_id,
        challengeId,
        eventType:
          "otp_verify",
        result: "expired",
        projectId:
          challenge.project_id,
        executionId:
          challenge.execution_id,
        fingerprint,
        details: {
          status:
            challenge.status,
        },
      }
    );

    return json(
      {
        ok: false,
        error:
          "invalid_or_expired_code",
        message:
          "El código no es válido o ya expiró.",
      },
      401
    );
  }

  let authPepper;

  try {
    authPepper =
      getTraceAuthPepper(env);
  } catch {
    return json(
      {
        ok: false,
        error:
          "authentication_configuration_error",
        message:
          "El acceso operacional no está disponible temporalmente.",
      },
      503
    );
  }

  const submittedHash =
    await sha256(
      `trace-otp:${authPepper}:${challengeId}:${code}`
    );

  const validCode =
    constantTimeEqual(
      submittedHash,
      challenge.code_hash
    );

  if (!validCode) {
    const nextAttempts =
      Number(
        challenge.attempt_count || 0
      ) + 1;

    const blocked =
      nextAttempts >=
      Number(
        challenge.max_attempts ||
        OTP_MAX_ATTEMPTS
      );

    await db.prepare(
      `UPDATE trace_auth_challenges
       SET
         attempt_count = ?,
         status = ?,
         blocked_until = ?,
         updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(
        nextAttempts,
        blocked
          ? "blocked"
          : "pending",
        blocked
          ? toSqlDate(
              addMinutes(
                now,
                OTP_BLOCK_MINUTES
              )
            )
          : null,
        challengeId
      )
      .run();

    await writeAudit(
      db,
      {
        tenantId:
          challenge.tenant_id,
        userId:
          challenge.user_id,
        challengeId,
        eventType:
          "otp_verify",
        result:
          blocked
            ? "blocked"
            : "failure",
        projectId:
          challenge.project_id,
        executionId:
          challenge.execution_id,
        fingerprint,
        details: {
          attemptCount:
            nextAttempts,
        },
      }
    );

    return json(
      {
        ok: false,
        error:
          "invalid_or_expired_code",
        message:
          "El código no es válido o ya expiró.",
      },
      401
    );
  }

  const sessionId =
    uuid();

  const sessionExpiresAt =
    addHours(
      now,
      OPERATIONAL_SESSION_HOURS
    );

  const authenticationMethod =
    `${challenge.channel}_otp`;

  const permissions = {
    identityVerified: true,
    assignmentResolved: false,
    canViewAssignedTasks: false,
    canReportProgress: false,
    canUploadEvidence: false,
    canReportIncident: false,
    canCompleteAssignedTask:
      false,
    canApprove: false,
    canReassign: false,
    canManageProject: false,
  };

  const token =
    generateOpaqueToken();

  const tokenHash =
    await hashOperationalToken(
      token,
      authPepper
    );

  const consumeResult =
    await db.prepare(
      `UPDATE trace_auth_challenges
       SET
         status = 'consumed',
         verified_at = datetime('now'),
         consumed_at = datetime('now'),
         updated_at = datetime('now')
       WHERE id = ?
         AND status = 'pending'
         AND consumed_at IS NULL`
    )
      .bind(challengeId)
      .run();

  if (
    Number(
      consumeResult?.meta?.changes ||
      consumeResult?.changes ||
      0
    ) !== 1
  ) {
    return json(
      {
        ok: false,
        error:
          "invalid_or_expired_code",
        message:
          "El código no es válido o ya fue utilizado.",
      },
      401
    );
  }

  try {
    await db.prepare(
      `INSERT INTO trace_auth_sessions (
         id,
         tenant_id,
         user_id,
         session_type,
         authentication_method,
         challenge_id,
         project_id,
         execution_id,
         permissions_json,
         session_token_hash,
         status,
         request_ip_hash,
         request_device_hash,
         request_user_agent,
         last_activity_at,
         expires_at
       )
       VALUES (
         ?, ?, ?, 'operational', ?, ?, ?, ?, ?,
         ?, 'active', ?, ?, ?, datetime('now'), ?
       )`
    )
      .bind(
        sessionId,
        challenge.tenant_id,
        challenge.user_id,
        authenticationMethod,
        challengeId,
        challenge.project_id,
        challenge.execution_id,
        JSON.stringify(
          permissions
        ),
        tokenHash,
        fingerprint.ipHash,
        fingerprint.deviceHash,
        fingerprint.userAgent,
        toSqlDate(
          sessionExpiresAt
        )
      )
      .run();
  } catch (error) {
    await db.prepare(
      `UPDATE trace_auth_challenges
       SET
         status = 'pending',
         verified_at = NULL,
         consumed_at = NULL,
         updated_at = datetime('now')
       WHERE id = ?
         AND status = 'consumed'`
    )
      .bind(challengeId)
      .run();

    throw error;
  }

  await writeAudit(
    db,
    {
      tenantId:
        challenge.tenant_id,
      userId:
        challenge.user_id,
      sessionId,
      challengeId,
      eventType:
        "otp_verify",
      result: "success",
      projectId:
        challenge.project_id,
      executionId:
        challenge.execution_id,
      fingerprint,
      details: {
        authenticationMethod,
        sessionType:
          "operational",
      },
    }
  );

  return json({
    ok: true,
    data: {
      token,
      tokenType: "Bearer",
      expiresAt:
        sessionExpiresAt
          .toISOString(),
      session: {
        id: sessionId,
        type: "operational",
        authenticationMethod,
        projectId:
          challenge.project_id,
        executionId:
          challenge.execution_id,
        permissions,
      },
      user: {
        id:
          challenge.user_id,
        email:
          challenge.email,
        role:
          challenge.role,
        plan:
          challenge.plan,
      },
    },
  });
}

async function validateOperationalSession(
  request,
  env
) {
  const token =
    bearerTokenFromRequest(
      request
    );

  if (!token) {
    return json(
      {
        ok: false,
        error:
          "invalid_operational_token",
        message:
          "El token operacional no es válido.",
      },
      401
    );
  }

  let lookup;

  try {
    lookup =
      await findOperationalSession(
        env,
        token
      );
  } catch {
    return json(
      {
        ok: false,
        error:
          "authentication_configuration_error",
        message:
          "El acceso operacional no está disponible temporalmente.",
      },
      503
    );
  }

  const {
    db,
    session,
  } = lookup;

  const fingerprint =
    await requestFingerprint(
      request
    );

  if (
    !operationalSessionIsActive(
      session
    )
  ) {
    if (
      session &&
      session.status === "active" &&
      !session.revoked_at
    ) {
      await db.prepare(
        `UPDATE trace_auth_sessions
         SET
           status = 'expired',
           updated_at = datetime('now')
         WHERE id = ?
           AND status = 'active'
           AND revoked_at IS NULL
           AND expires_at <= datetime('now')`
      )
        .bind(session.id)
        .run();
    }

    await writeAudit(
      db,
      {
        tenantId:
          session?.tenant_id,
        userId:
          session?.user_id,
        sessionId:
          session?.id,
        challengeId:
          session?.challenge_id,
        eventType:
          "session_validate",
        result:
          "failure",
        projectId:
          session?.project_id,
        executionId:
          session?.execution_id,
        fingerprint,
        details: {
          reason:
            "inactive_or_invalid_session",
        },
      }
    );

    return json(
      {
        ok: false,
        error:
          "invalid_operational_session",
        message:
          "La sesión operacional no está activa.",
      },
      401
    );
  }

  const activityResult =
    await db.prepare(
      `UPDATE trace_auth_sessions
       SET
         last_activity_at =
           datetime('now'),
         updated_at =
           datetime('now')
       WHERE id = ?
         AND status = 'active'
         AND revoked_at IS NULL
         AND expires_at > datetime('now')`
    )
      .bind(session.id)
      .run();

  const activityChanges =
    Number(
      activityResult?.meta?.changes ||
      activityResult?.changes ||
      0
    );

  if (activityChanges !== 1) {
    return json(
      {
        ok: false,
        error:
          "invalid_operational_session",
        message:
          "La sesión operacional no está activa.",
      },
      401
    );
  }

  await writeAudit(
    db,
    {
      tenantId:
        session.tenant_id,
      userId:
        session.user_id,
      sessionId:
        session.id,
      challengeId:
        session.challenge_id,
      eventType:
        "session_validate",
      result:
        "success",
      projectId:
        session.project_id,
      executionId:
        session.execution_id,
      fingerprint,
      details: {
        sessionType:
          session.session_type,
      },
    }
  );

  return json({
    ok: true,
    data: {
      session:
        serializeOperationalSession(
          {
            ...session,
            last_activity_at:
              toSqlDate(
                new Date()
              ),
          }
        ),
      user: {
        id:
          session.user_id,
        email:
          session.email,
        role:
          session.role,
        plan:
          session.plan,
      },
    },
  });
}

async function revokeOperationalSession(
  request,
  env
) {
  const token =
    bearerTokenFromRequest(
      request
    );

  if (!token) {
    return json(
      {
        ok: false,
        error:
          "invalid_operational_token",
        message:
          "El token operacional no es válido.",
      },
      401
    );
  }

  let lookup;

  try {
    lookup =
      await findOperationalSession(
        env,
        token
      );
  } catch {
    return json(
      {
        ok: false,
        error:
          "authentication_configuration_error",
        message:
          "El acceso operacional no está disponible temporalmente.",
      },
      503
    );
  }

  const {
    db,
    session,
  } = lookup;

  const fingerprint =
    await requestFingerprint(
      request
    );

  if (
    !operationalSessionIsActive(
      session
    )
  ) {
    return json(
      {
        ok: false,
        error:
          "invalid_operational_session",
        message:
          "La sesión operacional no está activa.",
      },
      401
    );
  }

  const revokeResult =
    await db.prepare(
      `UPDATE trace_auth_sessions
       SET
         status = 'revoked',
         revoked_at =
           datetime('now'),
         updated_at =
           datetime('now')
       WHERE id = ?
         AND status = 'active'
         AND revoked_at IS NULL
         AND expires_at > datetime('now')`
    )
      .bind(session.id)
      .run();

  const changes =
    Number(
      revokeResult?.meta?.changes ||
      revokeResult?.changes ||
      0
    );

  if (changes !== 1) {
    return json(
      {
        ok: false,
        error:
          "invalid_operational_session",
        message:
          "La sesión operacional no está activa.",
      },
      401
    );
  }

  await writeAudit(
    db,
    {
      tenantId:
        session.tenant_id,
      userId:
        session.user_id,
      sessionId:
        session.id,
      challengeId:
        session.challenge_id,
      eventType:
        "session_revoke",
      result:
        "success",
      projectId:
        session.project_id,
      executionId:
        session.execution_id,
      fingerprint,
      details: {
        revokedBy:
          "session_holder",
      },
    }
  );

  return json({
    ok: true,
    data: {
      sessionId:
        session.id,
      status:
        "revoked",
    },
  });
}

export async function
handleTraceV1Access(
  request,
  env
) {
  const url =
    new URL(request.url);

  const path =
    url.pathname;

  if (
    !path.startsWith(
      `${ACCESS_BASE}/`
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
    path ===
      `${ACCESS_BASE}/otp/request` &&
    request.method ===
      "POST"
  ) {
    return requestOtp(
      request,
      env
    );
  }

  if (
    path ===
      `${ACCESS_BASE}/otp/verify` &&
    request.method ===
      "POST"
  ) {
    return verifyOtp(
      request,
      env
    );
  }

  if (
    path ===
      `${ACCESS_BASE}/session/validate` &&
    request.method ===
      "POST"
  ) {
    return validateOperationalSession(
      request,
      env
    );
  }

  if (
    path ===
      `${ACCESS_BASE}/session/revoke` &&
    request.method ===
      "POST"
  ) {
    return revokeOperationalSession(
      request,
      env
    );
  }

  return json(
    {
      ok: false,
      error: "route_not_found",
      message:
        "La ruta de acceso solicitada no existe.",
    },
    404
  );
}
