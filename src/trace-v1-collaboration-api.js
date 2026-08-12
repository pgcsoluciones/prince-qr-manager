import { requireOperationalSession } from "./trace/shared/operational-auth.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Device-Id",
};

const BASE = "/api/trace/v1";
const OP = `${BASE}/operational`;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function uuid() {
  return crypto.randomUUID();
}

function text(value, max = 4000) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized ? normalized.slice(0, max) : null;
}

function object(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function parse(value, fallback = {}) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function bodyJson(request) {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false, response: json({ ok: false, error: "invalid_json", message: "El cuerpo enviado no contiene JSON válido." }, 400) };
  }
}

async function auth(request, env) {
  const result = await requireOperationalSession(request, env);
  if (!result.ok) {
    return {
      ok: false,
      response: json({ ok: false, error: result.error, message: result.message }, result.status),
    };
  }
  return result;
}

async function executionAccess(db, session, executionId) {
  return db.prepare(
    `SELECT e.*, ep.participation_role
     FROM trace_executions e
     JOIN trace_execution_participants ep
       ON ep.tenant_id=e.tenant_id AND ep.execution_id=e.id
      AND ep.user_id=? AND ep.status='active'
     WHERE e.id=? AND e.tenant_id=?
       AND (? IS NULL OR e.id=?)
     LIMIT 1`
  ).bind(
    session.user_id,
    executionId,
    session.tenant_id,
    session.execution_id || null,
    session.execution_id || null
  ).first();
}

function hasManagementAuthority(session, execution) {
  return ["superadmin", "enterprise"].includes(session.role) ||
    ["process_owner", "department_lead", "reviewer", "approver"].includes(execution.participation_role);
}

async function activeParticipant(db, tenantId, executionId, userId) {
  return db.prepare(
    `SELECT ep.user_id, ep.participation_role
     FROM trace_execution_participants ep
     JOIN users u ON u.id=ep.user_id AND u.is_active=1
     WHERE ep.tenant_id=? AND ep.execution_id=? AND ep.user_id=? AND ep.status='active'
     LIMIT 1`
  ).bind(tenantId, executionId, userId).first();
}

async function insertEvent(db, session, executionId, eventType, description, payload = {}) {
  await db.prepare(
    `INSERT INTO trace_events (
       id, tenant_id, execution_id, event_type, event_source,
       actor_user_id, actor_role, description, payload_json,
       occurred_at, received_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
  ).bind(
    uuid(), session.tenant_id, executionId, eventType,
    session.role === "supervisor" ? "supervisor" : "operator",
    session.user_id, session.role, description, JSON.stringify(payload)
  ).run();
}

async function threadAccess(db, session, threadId) {
  const row = await db.prepare(
    `SELECT t.*,
       EXISTS(
         SELECT 1 FROM trace_thread_members tm
         WHERE tm.thread_id=t.id AND tm.user_id=? AND tm.status='active'
       ) AS is_member
     FROM trace_threads t
     WHERE t.id=? AND t.tenant_id=?
       AND (? IS NULL OR t.execution_id=?)
       AND EXISTS(
         SELECT 1 FROM trace_execution_participants ep
         WHERE ep.tenant_id=t.tenant_id AND ep.execution_id=t.execution_id
           AND ep.user_id=? AND ep.status='active'
       )
     LIMIT 1`
  ).bind(
    session.user_id,
    threadId,
    session.tenant_id,
    session.execution_id || null,
    session.execution_id || null,
    session.user_id
  ).first();
  if (!row) return null;
  if (row.thread_type === "private" && Number(row.is_member) !== 1) return null;
  return row;
}

async function listThreads(request, env) {
  const a = await auth(request, env);
  if (!a.ok) return a.response;
  const { session, db } = a;
  const url = new URL(request.url);
  const executionId = text(url.searchParams.get("executionId"), 100);
  if (!executionId) return json({ ok: false, error: "execution_required", message: "executionId es obligatorio." }, 422);
  const execution = await executionAccess(db, session, executionId);
  if (!execution) return json({ ok: false, error: "execution_not_available", message: "La ejecución no está disponible para esta sesión." }, 404);

  const rows = await db.prepare(
    `SELECT t.*,
       (SELECT COUNT(*) FROM trace_messages m WHERE m.thread_id=t.id) AS message_count,
       (SELECT MAX(m.created_at) FROM trace_messages m WHERE m.thread_id=t.id) AS last_message_at
     FROM trace_threads t
     WHERE t.tenant_id=? AND t.execution_id=? AND t.status<>'archived'
       AND (
         t.thread_type<>'private' OR EXISTS(
           SELECT 1 FROM trace_thread_members tm
           WHERE tm.thread_id=t.id AND tm.user_id=? AND tm.status='active'
         )
       )
     ORDER BY COALESCE(last_message_at,t.created_at) DESC`
  ).bind(session.tenant_id, executionId, session.user_id).all();

  return json({ ok: true, data: rows.results.map((r) => ({
    id: r.id,
    executionId: r.execution_id,
    executionStageId: r.execution_stage_id,
    incidentId: r.incident_id,
    type: r.thread_type,
    title: r.title,
    status: r.status,
    createdBy: r.created_by,
    createdAt: r.created_at,
    messageCount: Number(r.message_count || 0),
    lastMessageAt: r.last_message_at || null,
  })) });
}

async function createThread(request, env) {
  const a = await auth(request, env);
  if (!a.ok) return a.response;
  const { session, db } = a;
  const parsed = await bodyJson(request);
  if (!parsed.ok) return parsed.response;
  const executionId = text(parsed.body.executionId, 100);
  const type = text(parsed.body.type, 20) || "official";
  const title = text(parsed.body.title, 180);
  const executionStageId = text(parsed.body.executionStageId, 100);
  const incidentId = text(parsed.body.incidentId, 100);
  if (!executionId) return json({ ok: false, error: "execution_required", message: "executionId es obligatorio." }, 422);
  if (!["official", "private", "contextual"].includes(type)) return json({ ok: false, error: "invalid_thread_type", message: "El tipo de conversación no es válido." }, 422);
  const execution = await executionAccess(db, session, executionId);
  if (!execution) return json({ ok: false, error: "execution_not_available", message: "La ejecución no está disponible para esta sesión." }, 404);

  if (executionStageId) {
    const stage = await db.prepare(`SELECT id FROM trace_execution_stages WHERE id=? AND execution_id=?`).bind(executionStageId, executionId).first();
    if (!stage) return json({ ok: false, error: "invalid_stage", message: "La etapa indicada no pertenece a la ejecución." }, 422);
  }
  if (incidentId) {
    const incident = await db.prepare(`SELECT id FROM trace_incidents WHERE id=? AND tenant_id=? AND execution_id=?`).bind(incidentId, session.tenant_id, executionId).first();
    if (!incident) return json({ ok: false, error: "invalid_incident", message: "La incidencia indicada no pertenece a la ejecución." }, 422);
  }

  const requestedMembers = [...new Set(array(parsed.body.memberUserIds).map((v) => text(v, 100)).filter(Boolean))];
  if (type === "private" && requestedMembers.length === 0) {
    return json({ ok: false, error: "private_members_required", message: "Una conversación privada debe indicar participantes." }, 422);
  }

  for (const userId of requestedMembers) {
    if (!(await activeParticipant(db, session.tenant_id, executionId, userId))) {
      return json({ ok: false, error: "invalid_thread_member", message: "Todos los miembros deben ser participantes activos de la ejecución." }, 422);
    }
  }

  const threadId = uuid();
  const members = new Set([session.user_id, ...requestedMembers]);
  const statements = [
    db.prepare(
      `INSERT INTO trace_threads (
         id, tenant_id, execution_id, execution_stage_id, incident_id,
         thread_type, title, status, created_by, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, datetime('now'), datetime('now'))`
    ).bind(threadId, session.tenant_id, executionId, executionStageId || null, incidentId || null, type, title, session.user_id),
  ];
  for (const userId of members) {
    statements.push(db.prepare(
      `INSERT INTO trace_thread_members (id,tenant_id,thread_id,user_id,member_role,status,joined_at)
       VALUES (?,?,?,?,?,'active',datetime('now'))`
    ).bind(uuid(), session.tenant_id, threadId, userId, userId === session.user_id ? "owner" : "member"));
  }
  await db.batch(statements);
  await insertEvent(db, session, executionId, "thread.created", "Conversación creada.", { threadId, type, executionStageId, incidentId });
  return json({ ok: true, data: { id: threadId, executionId, type, title, memberUserIds: [...members] } }, 201);
}

async function listMessages(request, env, threadId) {
  const a = await auth(request, env);
  if (!a.ok) return a.response;
  const { session, db } = a;
  const thread = await threadAccess(db, session, threadId);
  if (!thread) return json({ ok: false, error: "thread_not_available", message: "La conversación no está disponible para esta sesión." }, 404);
  const rows = await db.prepare(
    `SELECT id,sender_user_id,body,message_type,metadata_json,created_at,edited_at
     FROM trace_messages WHERE tenant_id=? AND thread_id=? ORDER BY created_at ASC LIMIT 300`
  ).bind(session.tenant_id, threadId).all();
  return json({ ok: true, data: rows.results.map((r) => ({
    id: r.id, senderUserId: r.sender_user_id, body: r.body,
    type: r.message_type, metadata: parse(r.metadata_json, {}),
    createdAt: r.created_at, editedAt: r.edited_at,
  })) });
}

async function postMessage(request, env, threadId) {
  const a = await auth(request, env);
  if (!a.ok) return a.response;
  const { session, db } = a;
  const thread = await threadAccess(db, session, threadId);
  if (!thread || thread.status !== "open") return json({ ok: false, error: "thread_not_available", message: "La conversación no está abierta para esta sesión." }, 404);
  const parsed = await bodyJson(request);
  if (!parsed.ok) return parsed.response;
  const body = text(parsed.body.body, 6000);
  if (!body) return json({ ok: false, error: "message_required", message: "El mensaje no puede estar vacío." }, 422);
  const mentionUserIds = [...new Set(array(parsed.body.mentionUserIds).map((v) => text(v, 100)).filter(Boolean))];
  for (const userId of mentionUserIds) {
    if (!(await activeParticipant(db, session.tenant_id, thread.execution_id, userId))) {
      return json({ ok: false, error: "invalid_mention", message: "Las menciones solo pueden dirigirse a participantes activos." }, 422);
    }
    if (thread.thread_type === "private") {
      const member = await db.prepare(`SELECT 1 AS ok FROM trace_thread_members WHERE thread_id=? AND user_id=? AND status='active'`).bind(threadId, userId).first();
      if (!member) return json({ ok: false, error: "invalid_private_mention", message: "La persona mencionada no pertenece a esta conversación privada." }, 422);
    }
  }

  const messageId = uuid();
  await db.prepare(
    `INSERT INTO trace_messages (id,tenant_id,thread_id,execution_id,sender_user_id,body,message_type,metadata_json,created_at)
     VALUES (?,?,?,?,?,?,'text',?,datetime('now'))`
  ).bind(messageId, session.tenant_id, threadId, thread.execution_id, session.user_id, body, JSON.stringify({ mentionUserIds })).run();
  await db.prepare(`UPDATE trace_threads SET updated_at=datetime('now') WHERE id=?`).bind(threadId).run();

  let recipients = [];
  if (thread.thread_type === "private") {
    const rows = await db.prepare(`SELECT user_id FROM trace_thread_members WHERE thread_id=? AND status='active' AND user_id<>?`).bind(threadId, session.user_id).all();
    recipients = rows.results.map((r) => r.user_id);
  } else {
    const rows = await db.prepare(`SELECT user_id FROM trace_execution_participants WHERE tenant_id=? AND execution_id=? AND status='active' AND user_id<>?`).bind(session.tenant_id, thread.execution_id, session.user_id).all();
    recipients = rows.results.map((r) => r.user_id);
  }
  recipients = [...new Set([...recipients, ...mentionUserIds])].filter((id) => id !== session.user_id);
  if (recipients.length) {
    await db.batch(recipients.map((userId) => db.prepare(
      `INSERT INTO trace_notifications (
         id,tenant_id,user_id,execution_id,thread_id,message_id,
         notification_type,title,body,status,metadata_json,created_at
       ) VALUES (?,?,?,?,?,?,?, ?,?,'unread',?,datetime('now'))`
    ).bind(
      uuid(), session.tenant_id, userId, thread.execution_id, threadId, messageId,
      mentionUserIds.includes(userId) ? "mention" : "thread_message",
      mentionUserIds.includes(userId) ? "Te mencionaron en una conversación" : "Nuevo mensaje en una conversación",
      body.slice(0, 240), JSON.stringify({ senderUserId: session.user_id })
    )));
  }
  await insertEvent(db, session, thread.execution_id, "thread.message_added", "Mensaje agregado a una conversación.", { threadId, messageId, recipientCount: recipients.length });
  return json({ ok: true, data: { id: messageId, threadId, mentionUserIds, notifiedUserIds: recipients } }, 201);
}

async function listNotifications(request, env) {
  const a = await auth(request, env);
  if (!a.ok) return a.response;
  const { session, db } = a;
  const rows = await db.prepare(
    `SELECT id,execution_id,thread_id,message_id,notification_type,title,body,status,metadata_json,created_at,read_at
     FROM trace_notifications WHERE tenant_id=? AND user_id=? AND status<>'archived'
     ORDER BY created_at DESC LIMIT 200`
  ).bind(session.tenant_id, session.user_id).all();
  return json({ ok: true, data: rows.results.map((r) => ({
    id:r.id, executionId:r.execution_id, threadId:r.thread_id, messageId:r.message_id,
    type:r.notification_type, title:r.title, body:r.body, status:r.status,
    metadata:parse(r.metadata_json,{}), createdAt:r.created_at, readAt:r.read_at,
  })) });
}

async function readNotification(request, env, notificationId) {
  const a = await auth(request, env);
  if (!a.ok) return a.response;
  const { session, db } = a;
  const result = await db.prepare(
    `UPDATE trace_notifications SET status='read',read_at=COALESCE(read_at,datetime('now'))
     WHERE id=? AND tenant_id=? AND user_id=? AND status='unread'`
  ).bind(notificationId, session.tenant_id, session.user_id).run();
  if (!result.meta?.changes) return json({ ok:false,error:"notification_not_available",message:"La notificación no está disponible." },404);
  return json({ ok:true,data:{ id:notificationId,status:"read" } });
}

function safeSlug(value) {
  return (text(value, 80) || "").toLowerCase().replace(/[^a-z0-9-_]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

async function upsertPublicProjection(request, env, executionId) {
  const a = await auth(request, env);
  if (!a.ok) return a.response;
  const { session, db } = a;
  const execution = await executionAccess(db, session, executionId);
  if (!execution) return json({ok:false,error:"execution_not_available",message:"La ejecución no está disponible para esta sesión."},404);
  if (!hasManagementAuthority(session, execution)) return json({ok:false,error:"forbidden",message:"Esta sesión no puede publicar la proyección pública."},403);
  const parsed = await bodyJson(request);
  if (!parsed.ok) return parsed.response;
  const requestedSlug = safeSlug(parsed.body.publicSlug);
  const projection = object(parsed.body.projection, {});
  const existing = await db.prepare(`SELECT id,public_slug FROM trace_public_projections WHERE execution_id=?`).bind(executionId).first();
  const publicSlug = requestedSlug || existing?.public_slug || `trace-${execution.execution_code.toLowerCase().replace(/[^a-z0-9]+/g,"-")}-${crypto.randomUUID().slice(0,8)}`;
  if (existing) {
    await db.prepare(
      `UPDATE trace_public_projections SET public_slug=?,status='active',projection_json=?,generated_at=datetime('now'),updated_at=datetime('now') WHERE id=? AND tenant_id=?`
    ).bind(publicSlug, JSON.stringify(projection), existing.id, session.tenant_id).run();
  } else {
    await db.prepare(
      `INSERT INTO trace_public_projections (id,tenant_id,execution_id,public_slug,status,projection_json,generated_at,created_by,created_at,updated_at)
       VALUES (?,?,?,?,'active',?,datetime('now'),?,datetime('now'),datetime('now'))`
    ).bind(uuid(), session.tenant_id, executionId, publicSlug, JSON.stringify(projection), session.user_id).run();
  }
  await insertEvent(db, session, executionId, "public_projection.published", "Proyección pública actualizada.", { publicSlug });
  return json({ok:true,data:{executionId,publicSlug,status:"active",projection}});
}

async function publicProjection(env, slug) {
  const db = env.DB;
  const row = await db.prepare(
    `SELECT pp.projection_json,pp.generated_at,pp.expires_at,
            e.id AS execution_id,e.execution_code,e.title,e.status,e.completion_percentage,
            p.name AS process_name,a.asset_code,a.name AS asset_name,
            lc.order_reference,lc.tracking_code
     FROM trace_public_projections pp
     JOIN trace_executions e ON e.id=pp.execution_id AND e.tenant_id=pp.tenant_id
     JOIN trace_processes p ON p.id=e.process_id AND p.tenant_id=e.tenant_id
     LEFT JOIN trace_assets a ON a.id=e.asset_id AND a.tenant_id=e.tenant_id
     LEFT JOIN trace_logistics_contexts lc ON lc.execution_id=e.id AND lc.tenant_id=e.tenant_id
     WHERE pp.public_slug=? AND pp.status='active'
       AND (pp.expires_at IS NULL OR pp.expires_at>datetime('now'))
     LIMIT 1`
  ).bind(slug).first();
  if (!row) return json({ok:false,error:"public_trace_not_found",message:"El seguimiento público no está disponible."},404);
  const config = parse(row.projection_json, {});
  const stages = config.showStageTimeline === false ? [] : (await db.prepare(
    `SELECT es.stage_order,es.status,es.completed_at,s.name
     FROM trace_execution_stages es JOIN trace_stages s ON s.id=es.stage_id
     WHERE es.execution_id=? ORDER BY es.stage_order ASC`
  ).bind(row.execution_id).all()).results.map((s) => ({order:Number(s.stage_order),name:s.name,status:s.status,completedAt:s.completed_at}));
  let logistics = null;
  if (config.showLogisticsTracking === true && row.tracking_code) {
    const milestones = await db.prepare(
      `SELECT event_type,description,occurred_at FROM trace_events
       WHERE execution_id=? AND event_type LIKE 'logistics.%' ORDER BY occurred_at ASC`
    ).bind(row.execution_id).all();
    logistics = {
      orderReference: row.order_reference,
      trackingCode: row.tracking_code,
      milestones: milestones.results.map((m) => ({type:m.event_type.replace(/^logistics\./,""),description:m.description,occurredAt:m.occurred_at})),
    };
  }
  return json({ok:true,data:{
    title: config.title || row.title || row.execution_code,
    summary: config.summary || null,
    processName: row.process_name,
    status: row.status,
    completionPercentage: Number(row.completion_percentage || 0),
    asset: row.asset_code ? {code:row.asset_code,name:row.asset_name} : null,
    stages,
    logistics,
    generatedAt: row.generated_at,
  }});
}

async function getLogistics(request, env, executionId) {
  const a = await auth(request, env);
  if (!a.ok) return a.response;
  const { session, db } = a;
  const execution = await executionAccess(db, session, executionId);
  if (!execution) return json({ok:false,error:"execution_not_available",message:"La ejecución no está disponible para esta sesión."},404);
  const row = await db.prepare(`SELECT * FROM trace_logistics_contexts WHERE tenant_id=? AND execution_id=?`).bind(session.tenant_id,executionId).first();
  const milestones = await db.prepare(`SELECT id,event_type,description,payload_json,occurred_at FROM trace_events WHERE tenant_id=? AND execution_id=? AND event_type LIKE 'logistics.%' ORDER BY occurred_at ASC`).bind(session.tenant_id,executionId).all();
  return json({ok:true,data:{
    executionId,
    context: row ? {
      orderReference:row.order_reference,trackingCode:row.tracking_code,shipmentType:row.shipment_type,
      origin:parse(row.origin_json,{}),destination:parse(row.destination_json,{}),
      sender:parse(row.sender_json,{}),recipient:parse(row.recipient_json,{}),package:parse(row.package_json,{}),
      expectedDeliveryAt:row.expected_delivery_at,deliveredAt:row.delivered_at,metadata:parse(row.metadata_json,{}),
    } : null,
    milestones:milestones.results.map((m)=>({id:m.id,type:m.event_type.replace(/^logistics\./,""),description:m.description,payload:parse(m.payload_json,{}),occurredAt:m.occurred_at})),
  }});
}

async function upsertLogistics(request, env, executionId) {
  const a = await auth(request, env);
  if (!a.ok) return a.response;
  const { session, db } = a;
  const execution = await executionAccess(db, session, executionId);
  if (!execution) return json({ok:false,error:"execution_not_available",message:"La ejecución no está disponible para esta sesión."},404);
  if (!hasManagementAuthority(session, execution)) return json({ok:false,error:"forbidden",message:"Esta sesión no puede configurar el contexto logístico."},403);
  const parsed = await bodyJson(request);
  if (!parsed.ok) return parsed.response;
  const shipmentType = text(parsed.body.shipmentType,20)||"delivery";
  if (!["delivery","pickup","transfer","return"].includes(shipmentType)) return json({ok:false,error:"invalid_shipment_type",message:"El tipo de movimiento logístico no es válido."},422);
  const trackingCode = text(parsed.body.trackingCode,120);
  const orderReference = text(parsed.body.orderReference,120);
  const existing = await db.prepare(`SELECT id FROM trace_logistics_contexts WHERE execution_id=?`).bind(executionId).first();
  const values = {
    origin:object(parsed.body.origin,{}),destination:object(parsed.body.destination,{}),sender:object(parsed.body.sender,{}),
    recipient:object(parsed.body.recipient,{}),package:object(parsed.body.package,{}),metadata:object(parsed.body.metadata,{}),
  };
  if (existing) {
    await db.prepare(
      `UPDATE trace_logistics_contexts SET order_reference=?,tracking_code=?,shipment_type=?,origin_json=?,destination_json=?,sender_json=?,recipient_json=?,package_json=?,expected_delivery_at=?,metadata_json=?,updated_at=datetime('now') WHERE id=? AND tenant_id=?`
    ).bind(orderReference,trackingCode,shipmentType,JSON.stringify(values.origin),JSON.stringify(values.destination),JSON.stringify(values.sender),JSON.stringify(values.recipient),JSON.stringify(values.package),text(parsed.body.expectedDeliveryAt,80),JSON.stringify(values.metadata),existing.id,session.tenant_id).run();
  } else {
    await db.prepare(
      `INSERT INTO trace_logistics_contexts (id,tenant_id,execution_id,order_reference,tracking_code,shipment_type,origin_json,destination_json,sender_json,recipient_json,package_json,expected_delivery_at,metadata_json,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`
    ).bind(uuid(),session.tenant_id,executionId,orderReference,trackingCode,shipmentType,JSON.stringify(values.origin),JSON.stringify(values.destination),JSON.stringify(values.sender),JSON.stringify(values.recipient),JSON.stringify(values.package),text(parsed.body.expectedDeliveryAt,80),JSON.stringify(values.metadata)).run();
  }
  await insertEvent(db,session,executionId,"logistics.context_updated","Contexto logístico actualizado.",{trackingCode,orderReference,shipmentType});
  return getLogistics(request,env,executionId);
}

async function addLogisticsMilestone(request, env, executionId) {
  const a = await auth(request, env);
  if (!a.ok) return a.response;
  const { session, db } = a;
  const execution = await executionAccess(db,session,executionId);
  if (!execution) return json({ok:false,error:"execution_not_available",message:"La ejecución no está disponible para esta sesión."},404);
  const context = await db.prepare(`SELECT id FROM trace_logistics_contexts WHERE tenant_id=? AND execution_id=?`).bind(session.tenant_id,executionId).first();
  if (!context) return json({ok:false,error:"logistics_context_required",message:"Primero debes configurar el contexto logístico de la ejecución."},409);
  const parsed = await bodyJson(request);
  if (!parsed.ok) return parsed.response;
  const type = text(parsed.body.type,40);
  const allowed = ["order_received","prepared","dispatched","in_transit","arrived","delivered","exception","returned"];
  if (!allowed.includes(type)) return json({ok:false,error:"invalid_logistics_milestone",message:"El hito logístico indicado no es válido."},422);
  const description = text(parsed.body.description,500) || `Hito logístico: ${type}`;
  await insertEvent(db,session,executionId,`logistics.${type}`,description,object(parsed.body.payload,{}));
  if (type === "delivered") {
    await db.prepare(`UPDATE trace_logistics_contexts SET delivered_at=datetime('now'),updated_at=datetime('now') WHERE tenant_id=? AND execution_id=?`).bind(session.tenant_id,executionId).run();
  }
  return getLogistics(request,env,executionId);
}

export async function handleTraceV1CollaborationApi(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(BASE)) return null;
  if (request.method === "OPTIONS") return new Response(null,{status:204,headers:CORS});

  const publicMatch = url.pathname.match(/^\/api\/trace\/v1\/public\/([^/]+)$/);
  if (publicMatch && request.method === "GET") return publicProjection(env,decodeURIComponent(publicMatch[1]));

  if (!url.pathname.startsWith(OP)) return null;

  if (url.pathname === `${OP}/threads` && request.method === "GET") return listThreads(request,env);
  if (url.pathname === `${OP}/threads` && request.method === "POST") return createThread(request,env);
  const messages = url.pathname.match(/^\/api\/trace\/v1\/operational\/threads\/([^/]+)\/messages$/);
  if (messages && request.method === "GET") return listMessages(request,env,decodeURIComponent(messages[1]));
  if (messages && request.method === "POST") return postMessage(request,env,decodeURIComponent(messages[1]));

  if (url.pathname === `${OP}/notifications` && request.method === "GET") return listNotifications(request,env);
  const notificationRead = url.pathname.match(/^\/api\/trace\/v1\/operational\/notifications\/([^/]+)\/read$/);
  if (notificationRead && request.method === "POST") return readNotification(request,env,decodeURIComponent(notificationRead[1]));

  const projection = url.pathname.match(/^\/api\/trace\/v1\/operational\/executions\/([^/]+)\/public-projection$/);
  if (projection && request.method === "POST") return upsertPublicProjection(request,env,decodeURIComponent(projection[1]));

  const logistics = url.pathname.match(/^\/api\/trace\/v1\/operational\/logistics\/([^/]+)$/);
  if (logistics && request.method === "GET") return getLogistics(request,env,decodeURIComponent(logistics[1]));
  if (logistics && request.method === "POST") return upsertLogistics(request,env,decodeURIComponent(logistics[1]));
  const milestone = url.pathname.match(/^\/api\/trace\/v1\/operational\/logistics\/([^/]+)\/milestones$/);
  if (milestone && request.method === "POST") return addLogisticsMilestone(request,env,decodeURIComponent(milestone[1]));

  return null;
}
