import { getTraceDatabase } from "./database.js";

function normalizeText(value, maxLength = 255) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function getTraceAuthPepper(env) {
  const pepper = typeof env.TRACE_AUTH_PEPPER === "string"
    ? env.TRACE_AUTH_PEPPER.trim()
    : "";

  if (!pepper) {
    throw new Error("TRACE_AUTH_PEPPER is required.");
  }

  return pepper;
}

export function bearerTokenFromRequest(request) {
  const authorization = request.headers.get("Authorization") || "";
  const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);
  if (!bearerMatch) return null;

  const token = bearerMatch[1].trim();
  return /^trace_op_[A-Za-z0-9_-]{64}$/.test(token)
    ? token
    : null;
}

export async function hashOperationalToken(token, pepper) {
  return sha256(`trace-operational-token:${pepper}:${token}`);
}

export function parseOperationalPermissions(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

export function operationalSessionIsActive(session, now = new Date()) {
  if (!session) return false;

  if (
    session.session_type !== "operational" ||
    session.status !== "active" ||
    session.revoked_at ||
    Number(session.is_active) !== 1 ||
    Number(session.operational_access_enabled) !== 1
  ) {
    return false;
  }

  const expectedTenantId = session.enterprise_id || session.user_id;
  if (expectedTenantId !== session.tenant_id) return false;

  const expiresAt = new Date(`${session.expires_at}Z`);
  return !Number.isNaN(expiresAt.getTime()) && expiresAt > now;
}

export async function findOperationalSession(env, token) {
  const db = getTraceDatabase(env);
  const tokenHash = await hashOperationalToken(token, getTraceAuthPepper(env));

  const session = await db.prepare(
    `SELECT
       s.id,
       s.tenant_id,
       s.user_id,
       s.session_type,
       s.authentication_method,
       s.challenge_id,
       s.project_id,
       s.execution_id,
       s.permissions_json,
       s.status,
       s.last_activity_at,
       s.expires_at,
       s.revoked_at,
       s.created_at,
       u.email,
       u.role,
       u.plan,
       u.enterprise_id,
       u.is_active,
       u.operational_access_enabled
     FROM trace_auth_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.session_token_hash = ?
       AND s.session_type = 'operational'
     LIMIT 1`
  ).bind(tokenHash).first();

  return { db, session, tokenHash };
}

export async function requireOperationalSession(request, env) {
  const token = bearerTokenFromRequest(request);
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "unauthorized",
      message: "Se requiere una sesión operacional válida.",
    };
  }

  const result = await findOperationalSession(env, token);
  if (!operationalSessionIsActive(result.session)) {
    return {
      ok: false,
      status: 401,
      error: "invalid_operational_session",
      message: "La sesión operacional no es válida, expiró o fue revocada.",
    };
  }

  const updated = await result.db.prepare(
    `UPDATE trace_auth_sessions
     SET last_activity_at = datetime('now')
     WHERE id = ?
       AND status = 'active'
       AND revoked_at IS NULL
       AND expires_at > datetime('now')`
  ).bind(result.session.id).run();

  if (Number(updated.meta?.changes || 0) !== 1) {
    return {
      ok: false,
      status: 401,
      error: "operational_session_changed",
      message: "La sesión operacional ya no está activa.",
    };
  }

  return {
    ok: true,
    db: result.db,
    tokenHash: result.tokenHash,
    session: {
      ...result.session,
      permissions: parseOperationalPermissions(result.session.permissions_json),
    },
  };
}
