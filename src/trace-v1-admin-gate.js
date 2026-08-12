import jwt from "@tsndr/cloudflare-worker-jwt";
import { getTraceDatabase } from "./trace/shared/database.js";

const BASE = "/api/trace/v1/admin";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function guardTraceV1AdminApi(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(BASE)) return null;
  if (request.method === "OPTIONS") return null;

  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    return json({ ok: false, error: "unauthorized", message: "Se requiere un token administrativo." }, 401);
  }

  const token = authorization.slice(7).trim();

  // Operational TRACE sessions are opaque trace_op_* tokens, not JWTs.
  // Reject them explicitly before invoking the JWT parser so malformed/non-JWT
  // credentials never surface as an unhandled Worker exception.
  if (!token || token.startsWith("trace_op_") || token.split(".").length !== 3) {
    return json({
      ok: false,
      error: "restricted_session_scope",
      message: "Las sesiones operacionales no tienen acceso a funciones administrativas TRACE.",
    }, 403);
  }

  let valid = false;
  let payload = {};

  try {
    valid = await jwt.verify(token, env.JWT_SECRET || "changeme-set-in-cloudflare-dashboard");
    if (valid) payload = jwt.decode(token)?.payload || {};
  } catch {
    return json({ ok: false, error: "invalid_token" }, 401);
  }

  if (!valid) return json({ ok: false, error: "invalid_token" }, 401);

  if ((payload.session_type || "standard") !== "standard") {
    return json({ ok: false, error: "restricted_session_scope" }, 403);
  }

  const userId = payload.user_id || payload.userId || payload.id || payload.sub;
  if (!userId) return json({ ok: false, error: "invalid_token_payload" }, 401);

  const db = getTraceDatabase(env);
  const user = await db.prepare(
    `SELECT id, role, enterprise_id, is_active FROM users WHERE id = ? LIMIT 1`
  ).bind(userId).first();

  if (!user || Number(user.is_active) !== 1) {
    return json({ ok: false, error: "inactive_user" }, 401);
  }

  if (user.role === "superadmin") return null;

  const tenantId = user.enterprise_id || user.id;
  if (user.role === "enterprise" && user.id === tenantId) return null;

  const membership = await db.prepare(
    `SELECT role, status
     FROM tenant_members
     WHERE tenant_owner_id = ?
       AND user_id = ?
       AND status = 'active'
       AND role IN ('owner','admin','manager')
     LIMIT 1`
  ).bind(tenantId, user.id).first();

  if (membership) return null;

  return json({
    ok: false,
    error: "forbidden",
    message: "Tu usuario no tiene permisos administrativos para plantillas, importaciones o reportes TRACE.",
  }, 403);
}
