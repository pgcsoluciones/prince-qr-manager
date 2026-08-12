import { requireOperationalSession } from "./trace/shared/operational-auth.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Device-Id",
};

const BASE = "/api/trace/v1/operational";

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

function source(session) {
  return session.role === "supervisor" ? "supervisor" : "operator";
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

async function audit(db, session, eventType, executionId, details = {}) {
  try {
    await db.prepare(
      `INSERT INTO trace_auth_audit_log (
         id, tenant_id, user_id, session_id, challenge_id, event_type, result,
         project_id, execution_id, details_json, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, 'success', ?, ?, ?, datetime('now'))`
    ).bind(
      uuid(), session.tenant_id, session.user_id, session.id,
      session.challenge_id || null, eventType, session.project_id || null,
      executionId || session.execution_id || null, JSON.stringify(details)
    ).run();
  } catch (error) {
    console.error("TRACE quality audit failed:", error);
  }
}

async function insertEvent(db, session, {
  executionId,
  executionStageId = null,
  assetId = null,
  eventType,
  description,
  payload = {},
}) {
  const id = uuid();
  await db.prepare(
    `INSERT INTO trace_events (
       id, tenant_id, execution_id, execution_stage_id, asset_id,
       event_type, event_source, actor_user_id, actor_role,
       description, payload_json, occurred_at, received_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
  ).bind(
    id, session.tenant_id, executionId, executionStageId, assetId,
    eventType, source(session), session.user_id, session.role,
    description, JSON.stringify(payload)
  ).run();
  return id;
}

async function assignedTask(db, session, executionStageId) {
  return db.prepare(
    `SELECT
       es.id AS execution_stage_id,
       es.execution_id,
       es.stage_id,
       es.stage_order,
       es.status AS stage_status,
       es.assigned_to,
       e.tenant_id,
       e.execution_code,
       e.title AS execution_title,
       e.status AS execution_status,
       e.asset_id,
       e.process_id,
       e.process_version_id,
       s.name AS stage_name,
       s.requires_evidence,
       s.requires_approval,
       (SELECT COUNT(*) FROM trace_evidences ev
        WHERE ev.tenant_id=e.tenant_id AND ev.execution_id=e.id
          AND ev.execution_stage_id=es.id) AS evidence_count
     FROM trace_execution_stages es
     JOIN trace_executions e ON e.id=es.execution_id
     JOIN trace_stages s ON s.id=es.stage_id AND s.process_version_id=e.process_version_id
     WHERE es.id=? AND e.tenant_id=? AND es.assigned_to=?
       AND (? IS NULL OR e.id=?)
       AND EXISTS (
         SELECT 1 FROM trace_execution_participants ep
         WHERE ep.tenant_id=e.tenant_id AND ep.execution_id=e.id
           AND ep.user_id=? AND ep.status='active'
       )
     LIMIT 1`
  ).bind(
    executionStageId, session.tenant_id, session.user_id,
    session.execution_id || null, session.execution_id || null, session.user_id
  ).first();
}

async function executionParticipant(db, tenantId, executionId, userId) {
  return db.prepare(
    `SELECT ep.user_id, ep.participation_role, ep.department_id, ep.status,
            u.email, u.is_active
     FROM trace_execution_participants ep
     JOIN users u ON u.id=ep.user_id
     WHERE ep.tenant_id=? AND ep.execution_id=? AND ep.user_id=?
       AND ep.status='active' AND u.is_active=1
     LIMIT 1`
  ).bind(tenantId, executionId, userId).first();
}

async function qualityAuthority(db, session, executionId) {
  if (["superadmin", "enterprise", "admin", "manager", "supervisor"].includes(session.role)) {
    return true;
  }
  const row = await db.prepare(
    `SELECT 1 AS ok
     FROM trace_execution_participants
     WHERE tenant_id=? AND execution_id=? AND user_id=? AND status='active'
       AND participation_role IN ('process_owner','department_lead','reviewer','approver')
     LIMIT 1`
  ).bind(session.tenant_id, executionId, session.user_id).first();
  return Boolean(row);
}

async function chooseApprover(db, session, executionId, excludeUserId = null) {
  const row = await db.prepare(
    `SELECT ep.user_id
     FROM trace_execution_participants ep
     JOIN users u ON u.id=ep.user_id AND u.is_active=1
     WHERE ep.tenant_id=? AND ep.execution_id=? AND ep.status='active'
       AND ep.participation_role IN ('approver','reviewer','department_lead','process_owner')
       AND (? IS NULL OR ep.user_id<>?)
     ORDER BY CASE ep.participation_role
       WHEN 'approver' THEN 1 WHEN 'reviewer' THEN 2
       WHEN 'department_lead' THEN 3 ELSE 4 END,
       ep.created_at ASC
     LIMIT 1`
  ).bind(session.tenant_id, executionId, excludeUserId, excludeUserId).first();
  return row?.user_id || null;
}

async function createIncident(request, env, executionStageId) {
  const a = await auth(request, env);
  if (!a.ok) return a.response;
  const { session, db } = a;
  const task = await assignedTask(db, session, executionStageId);
  if (!task) return json({ ok: false, error: "task_not_available", message: "La tarea no está asignada a esta sesión." }, 404);

  const parsed = await bodyJson(request);
  if (!parsed.ok) return parsed.response;
  const title = text(parsed.body.title, 180);
  const description = text(parsed.body.description, 4000);
  const category = text(parsed.body.category, 80) || "general";
  const severity = text(parsed.body.severity, 20) || "medium";
  if (!title) return json({ ok: false, error: "validation_error", message: "El título de la incidencia es obligatorio." }, 422);
  if (!["low","medium","high","critical"].includes(severity)) {
    return json({ ok: false, error: "invalid_severity", message: "La severidad indicada no es válida." }, 422);
  }

  const assignedTo = text(parsed.body.assignedTo, 100);
  if (assignedTo) {
    const participant = await executionParticipant(db, session.tenant_id, task.execution_id, assignedTo);
    if (!participant) return json({ ok: false, error: "invalid_correction_responsible", message: "El responsable debe ser un participante activo de esta ejecución." }, 422);
  }

  const count = await db.prepare(
    `SELECT COUNT(*) AS count FROM trace_incidents WHERE tenant_id=? AND execution_id=?`
  ).bind(session.tenant_id, task.execution_id).first();
  const incidentCode = `${task.execution_code}-INC-${String(Number(count?.count || 0) + 1).padStart(3, "0")}`;
  const incidentId = uuid();
  const status = assignedTo ? "assigned" : "open";

  await db.prepare(
    `INSERT INTO trace_incidents (
       id, tenant_id, execution_id, execution_stage_id, asset_id,
       incident_code, title, description, category, severity, status,
       reported_by, assigned_to, reported_at, metadata_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), '{}')`
  ).bind(
    incidentId, session.tenant_id, task.execution_id, executionStageId,
    task.asset_id || null, incidentCode, title, description, category,
    severity, status, session.user_id, assignedTo || null
  ).run();

  await insertEvent(db, session, {
    executionId: task.execution_id,
    executionStageId,
    assetId: task.asset_id,
    eventType: "incident.reported",
    description: `Incidencia reportada: ${title}`,
    payload: { incidentId, incidentCode, severity, assignedTo: assignedTo || null },
  });
  await audit(db, session, "operational.incident.reported", task.execution_id, { incidentId, executionStageId });

  return json({ ok: true, data: { id: incidentId, incidentCode, status, assignedTo: assignedTo || null } }, 201);
}

async function incidentContext(db, session, incidentId) {
  return db.prepare(
    `SELECT i.*, e.execution_code, e.asset_id, es.assigned_to AS stage_assigned_to
     FROM trace_incidents i
     JOIN trace_executions e ON e.id=i.execution_id AND e.tenant_id=i.tenant_id
     LEFT JOIN trace_execution_stages es ON es.id=i.execution_stage_id
     WHERE i.id=? AND i.tenant_id=?
       AND (? IS NULL OR i.execution_id=?)
       AND EXISTS (
         SELECT 1 FROM trace_execution_participants ep
         WHERE ep.tenant_id=i.tenant_id AND ep.execution_id=i.execution_id
           AND ep.user_id=? AND ep.status='active'
       )
     LIMIT 1`
  ).bind(
    incidentId, session.tenant_id,
    session.execution_id || null, session.execution_id || null,
    session.user_id
  ).first();
}

async function listIncidents(request, env) {
  const a = await auth(request, env);
  if (!a.ok) return a.response;
  const { session, db } = a;
  const url = new URL(request.url);
  const executionId = text(url.searchParams.get("executionId"), 100);
  const rows = await db.prepare(
    `SELECT i.*,
       (SELECT MAX(c.cycle_number) FROM trace_correction_cycles c WHERE c.incident_id=i.id) AS correction_cycle_count,
       (SELECT c.status FROM trace_correction_cycles c WHERE c.incident_id=i.id ORDER BY c.cycle_number DESC LIMIT 1) AS latest_correction_status
     FROM trace_incidents i
     WHERE i.tenant_id=?
       AND (? IS NULL OR i.execution_id=?)
       AND (? IS NULL OR i.execution_id=?)
       AND EXISTS (
         SELECT 1 FROM trace_execution_participants ep
         WHERE ep.tenant_id=i.tenant_id AND ep.execution_id=i.execution_id
           AND ep.user_id=? AND ep.status='active'
       )
     ORDER BY i.reported_at DESC`
  ).bind(
    session.tenant_id,
    session.execution_id || null, session.execution_id || null,
    executionId || null, executionId || null,
    session.user_id
  ).all();
  return json({ ok: true, data: rows.results.map((row) => ({
    id: row.id, executionId: row.execution_id, executionStageId: row.execution_stage_id,
    code: row.incident_code, title: row.title, description: row.description,
    category: row.category, severity: row.severity, status: row.status,
    reportedBy: row.reported_by, assignedTo: row.assigned_to,
    reportedAt: row.reported_at, resolvedAt: row.resolved_at,
    correctionCycleCount: Number(row.correction_cycle_count || 0),
    latestCorrectionStatus: row.latest_correction_status || null,
  })) });
}

async function assignCorrectionResponsible(request, env, incidentId) {
  const a = await auth(request, env);
  if (!a.ok) return a.response;
  const { session, db } = a;
  const incident = await incidentContext(db, session, incidentId);
  if (!incident) return json({ ok: false, error: "incident_not_available", message: "La incidencia no está disponible para esta sesión." }, 404);
  if (!(await qualityAuthority(db, session, incident.execution_id))) {
    return json({ ok: false, error: "forbidden", message: "Esta sesión no puede asignar responsables de corrección." }, 403);
  }
  const parsed = await bodyJson(request);
  if (!parsed.ok) return parsed.response;
  const assignedTo = text(parsed.body.assignedTo, 100);
  if (!assignedTo) return json({ ok: false, error: "validation_error", message: "Debes indicar el responsable de la corrección." }, 422);
  const participant = await executionParticipant(db, session.tenant_id, incident.execution_id, assignedTo);
  if (!participant) return json({ ok: false, error: "invalid_correction_responsible", message: "El responsable debe ser un participante activo de esta ejecución." }, 422);

  await db.prepare(
    `UPDATE trace_incidents SET assigned_to=?, status='assigned' WHERE id=? AND tenant_id=?`
  ).bind(assignedTo, incidentId, session.tenant_id).run();
  await insertEvent(db, session, {
    executionId: incident.execution_id,
    executionStageId: incident.execution_stage_id,
    assetId: incident.asset_id,
    eventType: "incident.assigned",
    description: "Responsable de corrección asignado.",
    payload: { incidentId, assignedTo },
  });
  await audit(db, session, "operational.incident.assigned", incident.execution_id, { incidentId, assignedTo });
  return json({ ok: true, data: { incidentId, assignedTo, status: "assigned" } });
}

async function createCorrectionCycle(request, env, incidentId, overrides = {}) {
  const a = overrides.auth || await auth(request, env);
  if (!a.ok) return a.response;
  const { session, db } = a;
  const incident = overrides.incident || await incidentContext(db, session, incidentId);
  if (!incident) return json({ ok: false, error: "incident_not_available", message: "La incidencia no está disponible para esta sesión." }, 404);
  if (!(await qualityAuthority(db, session, incident.execution_id))) {
    return json({ ok: false, error: "forbidden", message: "Esta sesión no puede solicitar ciclos de corrección." }, 403);
  }
  if (!incident.assigned_to) {
    return json({ ok: false, error: "correction_responsible_required", message: "Primero debes asignar un responsable de corrección." }, 409);
  }

  let notes = overrides.notes || null;
  if (!overrides.skipBody) {
    const parsed = await bodyJson(request);
    if (!parsed.ok) return parsed.response;
    notes = text(parsed.body.notes, 4000);
  }

  const open = await db.prepare(
    `SELECT id, cycle_number, status FROM trace_correction_cycles
     WHERE incident_id=? AND status IN ('pending','in_progress','submitted') LIMIT 1`
  ).bind(incidentId).first();
  if (open) return json({ ok: false, error: "correction_cycle_open", message: "La incidencia ya tiene un ciclo de corrección abierto." }, 409);

  const maxRow = await db.prepare(
    `SELECT COALESCE(MAX(cycle_number),0) AS n FROM trace_correction_cycles WHERE incident_id=?`
  ).bind(incidentId).first();
  const cycleNumber = Number(maxRow?.n || 0) + 1;
  const cycleId = uuid();
  await db.batch([
    db.prepare(
      `INSERT INTO trace_correction_cycles (
         id, tenant_id, incident_id, execution_id, execution_stage_id,
         cycle_number, assigned_to, requested_by, status, request_notes,
         requested_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, datetime('now'), datetime('now'), datetime('now'))`
    ).bind(
      cycleId, session.tenant_id, incidentId, incident.execution_id,
      incident.execution_stage_id || null, cycleNumber, incident.assigned_to,
      session.user_id, notes
    ),
    db.prepare(
      `UPDATE trace_incidents SET status='in_progress' WHERE id=? AND tenant_id=?`
    ).bind(incidentId, session.tenant_id),
  ]);
  await insertEvent(db, session, {
    executionId: incident.execution_id,
    executionStageId: incident.execution_stage_id,
    assetId: incident.asset_id,
    eventType: "correction.requested",
    description: `Ciclo de corrección #${cycleNumber} solicitado.`,
    payload: { incidentId, correctionCycleId: cycleId, cycleNumber, assignedTo: incident.assigned_to },
  });
  await audit(db, session, "operational.correction.requested", incident.execution_id, { incidentId, cycleId, cycleNumber });
  return json({ ok: true, data: { id: cycleId, incidentId, cycleNumber, assignedTo: incident.assigned_to, status: "pending" } }, 201);
}

async function correctionContext(db, session, correctionId) {
  return db.prepare(
    `SELECT c.*, i.asset_id, i.status AS incident_status
     FROM trace_correction_cycles c
     JOIN trace_incidents i ON i.id=c.incident_id AND i.tenant_id=c.tenant_id
     WHERE c.id=? AND c.tenant_id=?
       AND (? IS NULL OR c.execution_id=?)
       AND EXISTS (
         SELECT 1 FROM trace_execution_participants ep
         WHERE ep.tenant_id=c.tenant_id AND ep.execution_id=c.execution_id
           AND ep.user_id=? AND ep.status='active'
       )
     LIMIT 1`
  ).bind(
    correctionId, session.tenant_id,
    session.execution_id || null, session.execution_id || null,
    session.user_id
  ).first();
}

async function startCorrection(request, env, correctionId) {
  const a = await auth(request, env);
  if (!a.ok) return a.response;
  const { session, db } = a;
  const cycle = await correctionContext(db, session, correctionId);
  if (!cycle) return json({ ok: false, error: "correction_not_available", message: "El ciclo de corrección no está disponible." }, 404);
  if (cycle.assigned_to !== session.user_id) return json({ ok: false, error: "forbidden", message: "La corrección está asignada a otro participante." }, 403);
  if (cycle.status !== "pending") return json({ ok: false, error: "invalid_correction_state", message: "Solo un ciclo pendiente puede iniciarse." }, 409);
  await db.prepare(
    `UPDATE trace_correction_cycles SET status='in_progress', started_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND status='pending'`
  ).bind(correctionId).run();
  await insertEvent(db, session, {
    executionId: cycle.execution_id, executionStageId: cycle.execution_stage_id,
    assetId: cycle.asset_id, eventType: "correction.started",
    description: `Corrección #${cycle.cycle_number} iniciada.`,
    payload: { incidentId: cycle.incident_id, correctionCycleId: cycle.id, cycleNumber: cycle.cycle_number },
  });
  return json({ ok: true, data: { id: cycle.id, status: "in_progress" } });
}

async function submitCorrection(request, env, correctionId) {
  const a = await auth(request, env);
  if (!a.ok) return a.response;
  const { session, db } = a;
  const cycle = await correctionContext(db, session, correctionId);
  if (!cycle) return json({ ok: false, error: "correction_not_available", message: "El ciclo de corrección no está disponible." }, 404);
  if (cycle.assigned_to !== session.user_id) return json({ ok: false, error: "forbidden", message: "La corrección está asignada a otro participante." }, 403);
  if (cycle.status !== "in_progress") return json({ ok: false, error: "invalid_correction_state", message: "La corrección debe estar en progreso para enviarse." }, 409);
  const parsed = await bodyJson(request);
  if (!parsed.ok) return parsed.response;
  const responseNotes = text(parsed.body.notes, 4000);
  const approverId = await chooseApprover(db, session, cycle.execution_id, session.user_id);
  if (!approverId) return json({ ok: false, error: "approval_responsible_missing", message: "La ejecución no tiene un aprobador o revisor activo." }, 409);
  const approvalId = uuid();

  await db.batch([
    db.prepare(
      `UPDATE trace_correction_cycles SET status='submitted', response_notes=?, submitted_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND status='in_progress'`
    ).bind(responseNotes, correctionId),
    db.prepare(
      `UPDATE trace_incidents SET status='in_review' WHERE id=? AND tenant_id=?`
    ).bind(cycle.incident_id, session.tenant_id),
    db.prepare(
      `UPDATE trace_execution_stages SET status='pending_approval', submitted_at=datetime('now'), updated_at=datetime('now') WHERE id=?`
    ).bind(cycle.execution_stage_id),
    db.prepare(
      `UPDATE trace_executions SET status='pending_approval', updated_at=datetime('now') WHERE id=? AND tenant_id=?`
    ).bind(cycle.execution_id, session.tenant_id),
    db.prepare(
      `INSERT INTO trace_approvals (
         id, tenant_id, execution_id, execution_stage_id, requested_by,
         assigned_approver_id, status, requested_at, metadata_json
       ) VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'), ?)`
    ).bind(
      approvalId, session.tenant_id, cycle.execution_id, cycle.execution_stage_id,
      session.user_id, approverId,
      JSON.stringify({ incidentId: cycle.incident_id, correctionCycleId: correctionId, correctionCycleNumber: cycle.cycle_number })
    ),
  ]);
  await insertEvent(db, session, {
    executionId: cycle.execution_id, executionStageId: cycle.execution_stage_id,
    assetId: cycle.asset_id, eventType: "correction.submitted",
    description: `Corrección #${cycle.cycle_number} enviada a revisión.`,
    payload: { incidentId: cycle.incident_id, correctionCycleId: correctionId, approvalId, approverId },
  });
  await audit(db, session, "operational.correction.submitted", cycle.execution_id, { correctionId, approvalId });
  return json({ ok: true, data: { id: correctionId, status: "submitted", approvalId, approverId } });
}

async function interceptApprovalSubmission(request, env, executionStageId) {
  if (request.method !== "POST") return null;
  const a = await auth(request, env);
  if (!a.ok) return a.response;
  const { session, db } = a;
  const task = await assignedTask(db, session, executionStageId);
  if (!task || Number(task.requires_approval) !== 1) return null;
  if (task.stage_status !== "in_progress") return json({ ok: false, error: "invalid_stage_state", message: "La etapa debe estar en progreso para enviarse a aprobación." }, 409);
  if (Number(task.requires_evidence) === 1 && Number(task.evidence_count || 0) < 1) {
    return json({ ok: false, error: "evidence_required", message: "Esta etapa requiere evidencia antes de enviarse a aprobación." }, 422);
  }
  const existing = await db.prepare(
    `SELECT id FROM trace_approvals WHERE execution_stage_id=? AND status='pending' LIMIT 1`
  ).bind(executionStageId).first();
  if (existing) return json({ ok: false, error: "approval_already_pending", message: "La etapa ya tiene una aprobación pendiente." }, 409);
  const approverId = await chooseApprover(db, session, task.execution_id, session.user_id);
  if (!approverId) return json({ ok: false, error: "approval_responsible_missing", message: "La ejecución no tiene un aprobador o revisor activo." }, 409);
  const approvalId = uuid();

  await db.batch([
    db.prepare(
      `UPDATE trace_execution_stages SET status='pending_approval', submitted_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND assigned_to=? AND status='in_progress'`
    ).bind(executionStageId, session.user_id),
    db.prepare(
      `UPDATE trace_executions SET status='pending_approval', updated_at=datetime('now') WHERE id=? AND tenant_id=?`
    ).bind(task.execution_id, session.tenant_id),
    db.prepare(
      `INSERT INTO trace_approvals (
         id, tenant_id, execution_id, execution_stage_id, requested_by,
         assigned_approver_id, status, requested_at, metadata_json
       ) VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'), '{}')`
    ).bind(approvalId, session.tenant_id, task.execution_id, executionStageId, session.user_id, approverId),
  ]);
  await insertEvent(db, session, {
    executionId: task.execution_id, executionStageId, assetId: task.asset_id,
    eventType: "approval.requested", description: `Aprobación solicitada para: ${task.stage_name}`,
    payload: { approvalId, approverId, evidenceCount: Number(task.evidence_count || 0) },
  });
  await audit(db, session, "operational.approval.requested", task.execution_id, { approvalId, executionStageId, approverId });
  return json({ ok: true, data: { executionStageId, status: "pending_approval", approvalId, approverId, requiresApproval: true } });
}

async function listApprovals(request, env) {
  const a = await auth(request, env);
  if (!a.ok) return a.response;
  const { session, db } = a;
  const rows = await db.prepare(
    `SELECT ap.id, ap.execution_id, ap.execution_stage_id, ap.status,
            ap.requested_by, ap.assigned_approver_id, ap.requested_at,
            ap.metadata_json, e.execution_code, e.title AS execution_title,
            es.stage_order, es.assigned_to, s.name AS stage_name,
            (SELECT COUNT(*) FROM trace_evidences ev
             WHERE ev.tenant_id=ap.tenant_id AND ev.execution_id=ap.execution_id
               AND ev.execution_stage_id=ap.execution_stage_id) AS evidence_count
     FROM trace_approvals ap
     JOIN trace_executions e ON e.id=ap.execution_id AND e.tenant_id=ap.tenant_id
     JOIN trace_execution_stages es ON es.id=ap.execution_stage_id
     JOIN trace_stages s ON s.id=es.stage_id
     WHERE ap.tenant_id=? AND ap.assigned_approver_id=? AND ap.status='pending'
       AND (? IS NULL OR ap.execution_id=?)
     ORDER BY ap.requested_at ASC`
  ).bind(session.tenant_id, session.user_id, session.execution_id || null, session.execution_id || null).all();
  return json({ ok: true, data: rows.results.map((row) => ({
    id: row.id, executionId: row.execution_id, executionStageId: row.execution_stage_id,
    executionCode: row.execution_code, executionTitle: row.execution_title,
    stageName: row.stage_name, stageOrder: Number(row.stage_order),
    requestedBy: row.requested_by, assignedTo: row.assigned_to,
    evidenceCount: Number(row.evidence_count || 0), requestedAt: row.requested_at,
    metadata: JSON.parse(row.metadata_json || "{}"),
    actions: ["approve","observe","reject"],
  })) });
}

async function approvalContext(db, session, approvalId) {
  return db.prepare(
    `SELECT ap.*, e.asset_id, e.execution_code, e.title AS execution_title,
            es.stage_id, es.stage_order, es.assigned_to AS stage_assigned_to,
            es.status AS stage_status, s.name AS stage_name
     FROM trace_approvals ap
     JOIN trace_executions e ON e.id=ap.execution_id AND e.tenant_id=ap.tenant_id
     JOIN trace_execution_stages es ON es.id=ap.execution_stage_id
     JOIN trace_stages s ON s.id=es.stage_id
     WHERE ap.id=? AND ap.tenant_id=? AND ap.assigned_approver_id=? AND ap.status='pending'
       AND (? IS NULL OR ap.execution_id=?)
     LIMIT 1`
  ).bind(
    approvalId, session.tenant_id, session.user_id,
    session.execution_id || null, session.execution_id || null
  ).first();
}

async function advanceAfterApproval(db, session, approval) {
  const next = await db.prepare(
    `SELECT id, stage_id, assigned_to FROM trace_execution_stages
     WHERE execution_id=? AND stage_order>? AND status='pending'
     ORDER BY stage_order ASC LIMIT 1`
  ).bind(approval.execution_id, approval.stage_order).first();
  const completed = await db.prepare(
    `SELECT COUNT(*) AS n FROM trace_execution_stages
     WHERE execution_id=? AND status IN ('completed','approved','skipped')`
  ).bind(approval.execution_id).first();
  const total = await db.prepare(
    `SELECT COUNT(*) AS n FROM trace_execution_stages WHERE execution_id=?`
  ).bind(approval.execution_id).first();
  const completion = Math.min(100, Math.round(((Number(completed?.n || 0) + 1) / Math.max(1, Number(total?.n || 1))) * 100));

  const statements = [
    db.prepare(
      `UPDATE trace_execution_stages SET status='approved', completed_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND status='pending_approval'`
    ).bind(approval.execution_stage_id),
  ];
  if (next) {
    statements.push(
      db.prepare(`UPDATE trace_execution_stages SET status='available', updated_at=datetime('now') WHERE id=? AND status='pending'`).bind(next.id),
      db.prepare(`UPDATE trace_executions SET status='in_progress', current_stage_id=?, completion_percentage=?, updated_at=datetime('now') WHERE id=? AND tenant_id=?`).bind(next.stage_id, completion, approval.execution_id, session.tenant_id)
    );
  } else {
    statements.push(
      db.prepare(`UPDATE trace_executions SET status='completed', current_stage_id=NULL, completion_percentage=100, completed_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND tenant_id=?`).bind(approval.execution_id, session.tenant_id)
    );
  }
  await db.batch(statements);
  return { next, completion: next ? completion : 100, executionCompleted: !next };
}

async function decideApproval(request, env, approvalId, decision) {
  const a = await auth(request, env);
  if (!a.ok) return a.response;
  const { session, db } = a;
  const approval = await approvalContext(db, session, approvalId);
  if (!approval) return json({ ok: false, error: "approval_not_available", message: "La aprobación no está disponible para esta sesión." }, 404);
  const parsed = await bodyJson(request);
  if (!parsed.ok) return parsed.response;
  const notes = text(parsed.body.notes, 4000);

  if (decision === "approve") {
    await db.prepare(
      `UPDATE trace_approvals SET status='approved', decision_notes=?, decided_at=datetime('now'), decided_by=? WHERE id=? AND status='pending'`
    ).bind(notes, session.user_id, approvalId).run();
    const submittedCycle = await db.prepare(
      `SELECT c.id, c.incident_id FROM trace_correction_cycles c
       WHERE c.execution_stage_id=? AND c.status='submitted'
       ORDER BY c.cycle_number DESC LIMIT 1`
    ).bind(approval.execution_stage_id).first();
    if (submittedCycle) {
      await db.batch([
        db.prepare(`UPDATE trace_correction_cycles SET status='accepted', reviewed_at=datetime('now'), reviewed_by=?, updated_at=datetime('now') WHERE id=?`).bind(session.user_id, submittedCycle.id),
        db.prepare(`UPDATE trace_incidents SET status='validated', validated_at=datetime('now'), resolution_notes=COALESCE(?,resolution_notes) WHERE id=? AND tenant_id=?`).bind(notes, submittedCycle.incident_id, session.tenant_id),
      ]);
    }
    const advance = await advanceAfterApproval(db, session, approval);
    await insertEvent(db, session, {
      executionId: approval.execution_id, executionStageId: approval.execution_stage_id,
      assetId: approval.asset_id, eventType: "approval.approved",
      description: `Etapa aprobada: ${approval.stage_name}`,
      payload: { approvalId, notes, executionCompleted: advance.executionCompleted },
    });
    await audit(db, session, "operational.approval.approved", approval.execution_id, { approvalId });
    return json({ ok: true, data: { approvalId, status: "approved", ...advance } });
  }

  if (decision === "reject") {
    await db.batch([
      db.prepare(`UPDATE trace_approvals SET status='rejected', decision_notes=?, decided_at=datetime('now'), decided_by=? WHERE id=? AND status='pending'`).bind(notes, session.user_id, approvalId),
      db.prepare(`UPDATE trace_execution_stages SET status='rejected', updated_at=datetime('now') WHERE id=? AND status='pending_approval'`).bind(approval.execution_stage_id),
      db.prepare(`UPDATE trace_executions SET status='blocked', updated_at=datetime('now') WHERE id=? AND tenant_id=?`).bind(approval.execution_id, session.tenant_id),
      db.prepare(`UPDATE trace_correction_cycles SET status='rejected', reviewed_at=datetime('now'), reviewed_by=?, updated_at=datetime('now') WHERE execution_stage_id=? AND status='submitted'`).bind(session.user_id, approval.execution_stage_id),
    ]);
    await insertEvent(db, session, {
      executionId: approval.execution_id, executionStageId: approval.execution_stage_id,
      assetId: approval.asset_id, eventType: "approval.rejected",
      description: `Etapa rechazada: ${approval.stage_name}`,
      payload: { approvalId, notes },
    });
    await audit(db, session, "operational.approval.rejected", approval.execution_id, { approvalId });
    return json({ ok: true, data: { approvalId, status: "rejected", executionStatus: "blocked" } });
  }

  const correctionResponsible = approval.stage_assigned_to;
  if (!correctionResponsible) {
    return json({ ok: false, error: "correction_responsible_missing", message: "La etapa no tiene un responsable al cual devolver la observación." }, 409);
  }

  let incident = await db.prepare(
    `SELECT * FROM trace_incidents
     WHERE tenant_id=? AND execution_id=? AND execution_stage_id=?
       AND status NOT IN ('closed','validated')
     ORDER BY reported_at DESC LIMIT 1`
  ).bind(session.tenant_id, approval.execution_id, approval.execution_stage_id).first();

  if (!incident) {
    const count = await db.prepare(`SELECT COUNT(*) AS count FROM trace_incidents WHERE tenant_id=? AND execution_id=?`).bind(session.tenant_id, approval.execution_id).first();
    const incidentId = uuid();
    const incidentCode = `${approval.execution_code}-INC-${String(Number(count?.count || 0) + 1).padStart(3, "0")}`;
    await db.prepare(
      `INSERT INTO trace_incidents (
         id, tenant_id, execution_id, execution_stage_id, asset_id,
         incident_code, title, description, category, severity, status,
         reported_by, assigned_to, reported_at, metadata_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'quality', 'medium', 'assigned', ?, ?, datetime('now'), ?)`
    ).bind(
      incidentId, session.tenant_id, approval.execution_id, approval.execution_stage_id,
      approval.asset_id || null, incidentCode, `Observación de aprobación: ${approval.stage_name}`,
      notes, session.user_id, correctionResponsible,
      JSON.stringify({ approvalId, source: "approval_observation" })
    ).run();
    incident = await db.prepare(`SELECT * FROM trace_incidents WHERE id=?`).bind(incidentId).first();
  } else {
    await db.prepare(`UPDATE trace_incidents SET assigned_to=?, status='assigned' WHERE id=?`).bind(correctionResponsible, incident.id).run();
  }

  await db.batch([
    db.prepare(`UPDATE trace_approvals SET status='correction_required', decision_notes=?, decided_at=datetime('now'), decided_by=? WHERE id=? AND status='pending'`).bind(notes, session.user_id, approvalId),
    db.prepare(`UPDATE trace_execution_stages SET status='correction_required', updated_at=datetime('now') WHERE id=? AND status='pending_approval'`).bind(approval.execution_stage_id),
    db.prepare(`UPDATE trace_executions SET status='correction_required', updated_at=datetime('now') WHERE id=? AND tenant_id=?`).bind(approval.execution_id, session.tenant_id),
    db.prepare(`UPDATE trace_correction_cycles SET status='rejected', reviewed_at=datetime('now'), reviewed_by=?, updated_at=datetime('now') WHERE execution_stage_id=? AND status='submitted'`).bind(session.user_id, approval.execution_stage_id),
  ]);

  const cycleResponse = await createCorrectionCycle(request, env, incident.id, {
    auth: a, incident, notes, skipBody: true,
  });
  if (!cycleResponse.ok) {
    // createCorrectionCycle returns a Response object, so only catastrophic exceptions arrive here.
  }
  await insertEvent(db, session, {
    executionId: approval.execution_id, executionStageId: approval.execution_stage_id,
    assetId: approval.asset_id, eventType: "approval.observed",
    description: `Etapa observada y devuelta a corrección: ${approval.stage_name}`,
    payload: { approvalId, incidentId: incident.id, assignedTo: correctionResponsible, notes },
  });
  await audit(db, session, "operational.approval.observed", approval.execution_id, { approvalId, incidentId: incident.id });

  return json({ ok: true, data: { approvalId, status: "correction_required", incidentId: incident.id, assignedTo: correctionResponsible } });
}

export async function handleTraceV1OperationalQualityApi(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(BASE)) return null;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const approvalComplete = url.pathname.match(/^\/api\/trace\/v1\/operational\/tasks\/([^/]+)\/complete$/);
  if (approvalComplete && request.method === "POST") {
    return interceptApprovalSubmission(request, env, decodeURIComponent(approvalComplete[1]));
  }

  if (url.pathname === `${BASE}/incidents` && request.method === "GET") {
    return listIncidents(request, env);
  }

  if (url.pathname === `${BASE}/approvals` && request.method === "GET") {
    return listApprovals(request, env);
  }

  const taskIncident = url.pathname.match(/^\/api\/trace\/v1\/operational\/tasks\/([^/]+)\/incidents$/);
  if (taskIncident && request.method === "POST") {
    return createIncident(request, env, decodeURIComponent(taskIncident[1]));
  }

  const incidentAssign = url.pathname.match(/^\/api\/trace\/v1\/operational\/incidents\/([^/]+)\/assign$/);
  if (incidentAssign && request.method === "POST") {
    return assignCorrectionResponsible(request, env, decodeURIComponent(incidentAssign[1]));
  }

  const incidentCorrection = url.pathname.match(/^\/api\/trace\/v1\/operational\/incidents\/([^/]+)\/corrections$/);
  if (incidentCorrection && request.method === "POST") {
    return createCorrectionCycle(request, env, decodeURIComponent(incidentCorrection[1]));
  }

  const correctionAction = url.pathname.match(/^\/api\/trace\/v1\/operational\/corrections\/([^/]+)\/(start|submit)$/);
  if (correctionAction && request.method === "POST") {
    const id = decodeURIComponent(correctionAction[1]);
    return correctionAction[2] === "start"
      ? startCorrection(request, env, id)
      : submitCorrection(request, env, id);
  }

  const approvalAction = url.pathname.match(/^\/api\/trace\/v1\/operational\/approvals\/([^/]+)\/(approve|observe|reject)$/);
  if (approvalAction && request.method === "POST") {
    return decideApproval(request, env, decodeURIComponent(approvalAction[1]), approvalAction[2]);
  }

  return null;
}
