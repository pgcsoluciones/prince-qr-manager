const STATUS_VALUES = new Set([
  "new",
  "open",
  "in_progress",
  "waiting_customer",
  "resolved",
  "closed",
]);

const SEVERITY_VALUES = new Set([
  "low",
  "normal",
  "high",
  "critical",
]);

const CATEGORY_VALUES = new Set([
  "account",
  "billing",
  "qr",
  "trace",
  "analytics",
  "technical",
  "feature_request",
  "other",
]);

const SERVICE_LEVELS = {
  free: { priority: "standard", firstResponseMinutes: 1440 },
  starter: { priority: "standard", firstResponseMinutes: 720 },
  pro: { priority: "priority", firstResponseMinutes: 240 },
  enterprise: { priority: "urgent", firstResponseMinutes: 120 },
};

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

function cleanText(value, maxLength = 2000) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function parseJsonArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function isSuperadmin(user) {
  return user?.role === "superadmin";
}

function ticketNumber() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase();
  return `SUP-${date}-${suffix}`;
}

function ticketIdFromPath(path) {
  const match = path.match(/^\/api\/support\/tickets\/([^/]+)(?:\/messages)?$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

async function loadRequester(env, userId) {
  return env.DB.prepare(
    `SELECT u.id, u.email, u.plan, tp.company_name, tp.company_phone
     FROM users u
     LEFT JOIN tenant_profiles tp ON tp.tenant_id = u.id
     WHERE u.id = ?`
  ).bind(userId).first();
}

async function loadTicket(env, ticketId) {
  return env.DB.prepare(
    `SELECT * FROM support_tickets WHERE id = ?`
  ).bind(ticketId).first();
}

function canReadTicket(user, ticket) {
  return Boolean(
    ticket &&
    (isSuperadmin(user) || ticket.tenant_id === user?.sub)
  );
}

async function createTicket({ request, env, user }) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return response({ ok: false, error: "Cuerpo JSON inválido" }, 400);
  }

  const category = cleanText(body.category, 60)?.toLowerCase();
  const subject = cleanText(body.subject, 180);
  const situation = cleanText(body.situation, 5000);
  const impact = cleanText(body.impact, 2000);
  const expectedResolution = cleanText(body.expected_resolution, 2000);
  const severity = cleanText(body.severity, 20)?.toLowerCase() || "normal";
  const idempotencyKey = cleanText(body.idempotency_key, 180);

  if (!category || !CATEGORY_VALUES.has(category)) {
    return response({ ok: false, error: "Categoría inválida" }, 400);
  }
  if (!subject) {
    return response({ ok: false, error: "Asunto requerido" }, 400);
  }
  if (!situation) {
    return response({ ok: false, error: "Situación requerida" }, 400);
  }
  if (!SEVERITY_VALUES.has(severity)) {
    return response({ ok: false, error: "Severidad inválida" }, 400);
  }
  if (!idempotencyKey) {
    return response({ ok: false, error: "idempotency_key requerido" }, 400);
  }

  const requester = await loadRequester(env, user.sub);
  if (!requester) {
    return response({ ok: false, error: "Usuario no encontrado" }, 404);
  }

  const existing = await env.DB.prepare(
    `SELECT id, ticket_number, status
     FROM support_tickets
     WHERE tenant_id = ? AND idempotency_key = ?`
  ).bind(user.sub, idempotencyKey).first();

  if (existing) {
    return response({ ok: true, duplicate: true, ticket: existing }, 200);
  }

  const service = SERVICE_LEVELS[requester.plan] || SERVICE_LEVELS.free;
  const id = crypto.randomUUID();
  const number = ticketNumber();
  const requesterName = cleanText(body.requester_name, 160);
  const requesterEmail = cleanText(body.requester_email, 254) || requester.email;
  const requesterPhone = cleanText(body.requester_phone, 80) || requester.company_phone;
  const companyName = cleanText(body.company_name, 180) || requester.company_name;
  const source = ["codi", "dashboard", "api"].includes(body.source)
    ? body.source
    : "codi";
  const attachments = parseJsonArray(body.attachments);
  const firstMessageId = crypto.randomUUID();
  const eventId = crypto.randomUUID();

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO support_tickets (
        id, ticket_number, tenant_id, created_by_user_id,
        requester_name, requester_email, requester_phone, company_name,
        category, subject, situation, impact, expected_resolution, severity,
        service_priority, plan_snapshot, first_response_target_minutes,
        status, source, idempotency_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)`
    ).bind(
      id,
      number,
      user.sub,
      user.sub,
      requesterName,
      requesterEmail,
      requesterPhone,
      companyName,
      category,
      subject,
      situation,
      impact,
      expectedResolution,
      severity,
      service.priority,
      requester.plan,
      service.firstResponseMinutes,
      source,
      idempotencyKey
    ),
    env.DB.prepare(
      `INSERT INTO support_ticket_messages (
        id, ticket_id, tenant_id, author_user_id,
        author_type, visibility, body, attachment_refs_json, idempotency_key
      ) VALUES (?, ?, ?, ?, 'customer', 'public', ?, ?, ?)`
    ).bind(
      firstMessageId,
      id,
      user.sub,
      user.sub,
      situation,
      JSON.stringify(attachments),
      `${idempotencyKey}:initial-message`
    ),
    env.DB.prepare(
      `INSERT INTO support_ticket_events (
        id, ticket_id, tenant_id, actor_user_id,
        event_type, new_value_json, metadata_json
      ) VALUES (?, ?, ?, ?, 'ticket_created', ?, ?)`
    ).bind(
      eventId,
      id,
      user.sub,
      user.sub,
      JSON.stringify({ status: "new", severity, category }),
      JSON.stringify({ source, plan_snapshot: requester.plan })
    ),
  ]);

  return response({
    ok: true,
    duplicate: false,
    ticket: {
      id,
      ticket_number: number,
      status: "new",
      severity,
      service_priority: service.priority,
      first_response_target_minutes: service.firstResponseMinutes,
    },
  }, 201);
}

async function listTickets({ request, env, user }) {
  const url = new URL(request.url);
  const status = cleanText(url.searchParams.get("status"), 30);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 100);
  const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);
  const filters = [];
  const values = [];

  if (!isSuperadmin(user)) {
    filters.push("tenant_id = ?");
    values.push(user.sub);
  }

  if (status) {
    if (!STATUS_VALUES.has(status)) {
      return response({ ok: false, error: "Estado inválido" }, 400);
    }
    filters.push("status = ?");
    values.push(status);
  }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const query = `
    SELECT id, ticket_number, tenant_id, requester_name, requester_email,
           company_name, category, subject, severity, service_priority,
           status, assigned_to_user_id, created_at, updated_at,
           first_response_at, resolved_at, closed_at
    FROM support_tickets
    ${where}
    ORDER BY
      CASE severity
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'normal' THEN 3
        ELSE 4
      END,
      updated_at DESC
    LIMIT ? OFFSET ?`;

  const result = await env.DB.prepare(query)
    .bind(...values, limit, offset)
    .all();

  return response({ ok: true, tickets: result.results || [], limit, offset });
}

async function getTicket({ env, user, ticketId }) {
  const ticket = await loadTicket(env, ticketId);
  if (!ticket) return response({ ok: false, error: "Ticket no encontrado" }, 404);
  if (!canReadTicket(user, ticket)) {
    return response({ ok: false, error: "Acceso denegado" }, 403);
  }

  const messageQuery = isSuperadmin(user)
    ? `SELECT * FROM support_ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC`
    : `SELECT * FROM support_ticket_messages WHERE ticket_id = ? AND visibility = 'public' ORDER BY created_at ASC`;

  const messages = await env.DB.prepare(messageQuery).bind(ticketId).all();
  return response({ ok: true, ticket, messages: messages.results || [] });
}

async function addMessage({ request, env, user, ticketId }) {
  const ticket = await loadTicket(env, ticketId);
  if (!ticket) return response({ ok: false, error: "Ticket no encontrado" }, 404);
  if (!canReadTicket(user, ticket)) {
    return response({ ok: false, error: "Acceso denegado" }, 403);
  }

  const body = await request.json().catch(() => null);
  const messageBody = cleanText(body?.body, 10000);
  const idempotencyKey = cleanText(body?.idempotency_key, 180);
  const visibility = isSuperadmin(user) && body?.visibility === "internal"
    ? "internal"
    : "public";

  if (!messageBody) return response({ ok: false, error: "Mensaje requerido" }, 400);
  if (!idempotencyKey) {
    return response({ ok: false, error: "idempotency_key requerido" }, 400);
  }

  const existing = await env.DB.prepare(
    `SELECT id FROM support_ticket_messages
     WHERE ticket_id = ? AND idempotency_key = ?`
  ).bind(ticketId, idempotencyKey).first();

  if (existing) {
    return response({ ok: true, duplicate: true, message_id: existing.id });
  }

  const messageId = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  const authorType = isSuperadmin(user) ? "agent" : "customer";
  const nextStatus = isSuperadmin(user)
    ? (ticket.status === "new" ? "open" : ticket.status)
    : (ticket.status === "waiting_customer" ? "open" : ticket.status);

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO support_ticket_messages (
        id, ticket_id, tenant_id, author_user_id,
        author_type, visibility, body, attachment_refs_json, idempotency_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      messageId,
      ticketId,
      ticket.tenant_id,
      user.sub,
      authorType,
      visibility,
      messageBody,
      JSON.stringify(parseJsonArray(body?.attachments)),
      idempotencyKey
    ),
    env.DB.prepare(
      `UPDATE support_tickets
       SET status = ?,
           first_response_at = CASE
             WHEN ? = 'agent' AND first_response_at IS NULL THEN CURRENT_TIMESTAMP
             ELSE first_response_at
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(nextStatus, authorType, ticketId),
    env.DB.prepare(
      `INSERT INTO support_ticket_events (
        id, ticket_id, tenant_id, actor_user_id,
        event_type, metadata_json
      ) VALUES (?, ?, ?, ?, 'message_added', ?)`
    ).bind(
      eventId,
      ticketId,
      ticket.tenant_id,
      user.sub,
      JSON.stringify({ author_type: authorType, visibility })
    ),
  ]);

  return response({ ok: true, duplicate: false, message_id: messageId, status: nextStatus }, 201);
}

async function updateTicket({ request, env, user, ticketId }) {
  if (!isSuperadmin(user)) {
    return response({ ok: false, error: "Acceso denegado" }, 403);
  }

  const ticket = await loadTicket(env, ticketId);
  if (!ticket) return response({ ok: false, error: "Ticket no encontrado" }, 404);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return response({ ok: false, error: "Cuerpo JSON inválido" }, 400);
  }

  const nextStatus = body.status === undefined ? ticket.status : cleanText(body.status, 30);
  const nextSeverity = body.severity === undefined ? ticket.severity : cleanText(body.severity, 20);
  const assignedTo = body.assigned_to_user_id === undefined
    ? ticket.assigned_to_user_id
    : cleanText(body.assigned_to_user_id, 120);

  if (!STATUS_VALUES.has(nextStatus)) {
    return response({ ok: false, error: "Estado inválido" }, 400);
  }
  if (!SEVERITY_VALUES.has(nextSeverity)) {
    return response({ ok: false, error: "Severidad inválida" }, 400);
  }

  const eventId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE support_tickets
       SET status = ?, severity = ?, assigned_to_user_id = ?,
           resolved_at = CASE WHEN ? = 'resolved' THEN COALESCE(resolved_at, CURRENT_TIMESTAMP) ELSE resolved_at END,
           closed_at = CASE WHEN ? = 'closed' THEN COALESCE(closed_at, CURRENT_TIMESTAMP) ELSE closed_at END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(nextStatus, nextSeverity, assignedTo, nextStatus, nextStatus, ticketId),
    env.DB.prepare(
      `INSERT INTO support_ticket_events (
        id, ticket_id, tenant_id, actor_user_id,
        event_type, previous_value_json, new_value_json
      ) VALUES (?, ?, ?, ?, 'ticket_updated', ?, ?)`
    ).bind(
      eventId,
      ticketId,
      ticket.tenant_id,
      user.sub,
      JSON.stringify({
        status: ticket.status,
        severity: ticket.severity,
        assigned_to_user_id: ticket.assigned_to_user_id,
      }),
      JSON.stringify({
        status: nextStatus,
        severity: nextSeverity,
        assigned_to_user_id: assignedTo,
      })
    ),
  ]);

  return response({ ok: true, ticket_id: ticketId, status: nextStatus, severity: nextSeverity });
}

export async function handleSupportTicketApi({ request, env, user }) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  if (!user?.sub) {
    return response({ ok: false, error: "No autorizado" }, 401);
  }

  if (path === "/api/support/tickets" && method === "POST") {
    return createTicket({ request, env, user });
  }

  if (path === "/api/support/tickets" && method === "GET") {
    return listTickets({ request, env, user });
  }

  const ticketId = ticketIdFromPath(path);
  if (!ticketId) return null;

  if (path.endsWith("/messages") && method === "POST") {
    return addMessage({ request, env, user, ticketId });
  }

  if (method === "GET") {
    return getTicket({ env, user, ticketId });
  }

  if (method === "PATCH") {
    return updateTicket({ request, env, user, ticketId });
  }

  return response({ ok: false, error: "Método no permitido" }, 405);
}
