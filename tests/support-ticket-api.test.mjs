import assert from "node:assert/strict";
import { mkdtemp, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const tempDir = await mkdtemp(join(tmpdir(), "intap-support-api-"));
const modulePath = join(tempDir, "support-ticket-api.mjs");
await copyFile(new URL("../src/support-ticket-api.js", import.meta.url), modulePath);
const { handleSupportTicketApi } = await import(pathToFileURL(modulePath));

class Statement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql.replace(/\s+/g, " ").trim();
    this.values = [];
  }
  bind(...values) { this.values = values; return this; }
  first() { return this.db.first(this.sql, this.values); }
  all() { return this.db.all(this.sql, this.values); }
  run() { return this.db.run(this.sql, this.values); }
}

class FakeDB {
  constructor() {
    this.users = [
      { id: "tenant-a", email: "a@example.com", plan: "pro", company_name: "Tenant A", company_phone: "8090000001" },
      { id: "tenant-b", email: "b@example.com", plan: "free", company_name: "Tenant B", company_phone: "8090000002" },
      { id: "admin", email: "admin@example.com", plan: "enterprise", company_name: "INTAP", company_phone: null },
    ];
    this.tickets = [];
    this.messages = [];
    this.events = [];
  }
  prepare(sql) { return new Statement(this, sql); }
  async batch(statements) { for (const statement of statements) await statement.run(); return []; }

  async first(sql, v) {
    if (sql.includes("FROM users u") && sql.includes("LEFT JOIN tenant_profiles")) {
      return this.users.find((u) => u.id === v[0]) || null;
    }
    if (sql.includes("FROM support_tickets WHERE id = ?")) {
      return this.tickets.find((t) => t.id === v[0]) || null;
    }
    if (sql.includes("WHERE tenant_id = ? AND idempotency_key = ?")) {
      const t = this.tickets.find((x) => x.tenant_id === v[0] && x.idempotency_key === v[1]);
      return t ? { id: t.id, ticket_number: t.ticket_number, status: t.status } : null;
    }
    if (sql.includes("FROM support_ticket_messages") && sql.includes("idempotency_key = ?")) {
      const m = this.messages.find((x) => x.ticket_id === v[0] && x.idempotency_key === v[1]);
      return m ? { id: m.id } : null;
    }
    throw new Error(`first() SQL no soportado: ${sql}`);
  }

  async all(sql, v) {
    if (sql.includes("FROM support_tickets")) {
      let rows = [...this.tickets];
      let cursor = 0;
      if (sql.includes("tenant_id = ?")) rows = rows.filter((t) => t.tenant_id === v[cursor++]);
      if (sql.includes("status = ?")) rows = rows.filter((t) => t.status === v[cursor++]);
      const limit = v[v.length - 2] ?? 50;
      const offset = v[v.length - 1] ?? 0;
      return { results: rows.slice(offset, offset + limit) };
    }
    if (sql.includes("FROM support_ticket_messages")) {
      let rows = this.messages.filter((m) => m.ticket_id === v[0]);
      if (sql.includes("visibility = 'public'")) rows = rows.filter((m) => m.visibility === "public");
      return { results: rows };
    }
    throw new Error(`all() SQL no soportado: ${sql}`);
  }

  async run(sql, v) {
    if (sql.startsWith("INSERT INTO support_tickets")) {
      const [id, ticket_number, tenant_id, created_by_user_id, requester_name, requester_email, requester_phone, company_name, category, subject, situation, impact, expected_resolution, severity, service_priority, plan_snapshot, first_response_target_minutes, source, idempotency_key] = v;
      this.tickets.push({ id, ticket_number, tenant_id, created_by_user_id, requester_name, requester_email, requester_phone, company_name, category, subject, situation, impact, expected_resolution, severity, service_priority, plan_snapshot, first_response_target_minutes, status: "new", source, idempotency_key, assigned_to_user_id: null, created_at: "2026-07-31", updated_at: "2026-07-31", first_response_at: null, resolved_at: null, closed_at: null });
      return { success: true };
    }
    if (sql.startsWith("INSERT INTO support_ticket_messages")) {
      const [id, ticket_id, tenant_id, author_user_id, ...rest] = v;
      if (sql.includes("'customer', 'public'")) {
        const [body, attachment_refs_json, idempotency_key] = rest;
        this.messages.push({ id, ticket_id, tenant_id, author_user_id, author_type: "customer", visibility: "public", body, attachment_refs_json, idempotency_key });
      } else {
        const [author_type, visibility, body, attachment_refs_json, idempotency_key] = rest;
        this.messages.push({ id, ticket_id, tenant_id, author_user_id, author_type, visibility, body, attachment_refs_json, idempotency_key });
      }
      return { success: true };
    }
    if (sql.startsWith("INSERT INTO support_ticket_events")) {
      this.events.push({ id: v[0], ticket_id: v[1], tenant_id: v[2], actor_user_id: v[3] });
      return { success: true };
    }
    if (sql.startsWith("UPDATE support_tickets") && sql.includes("first_response_at")) {
      const [status, authorType, ticketId] = v;
      const t = this.tickets.find((x) => x.id === ticketId);
      t.status = status;
      if (authorType === "agent" && !t.first_response_at) t.first_response_at = "2026-07-31";
      return { success: true };
    }
    if (sql.startsWith("UPDATE support_tickets") && sql.includes("assigned_to_user_id")) {
      const [status, severity, assigned, , , ticketId] = v;
      const t = this.tickets.find((x) => x.id === ticketId);
      Object.assign(t, { status, severity, assigned_to_user_id: assigned });
      return { success: true };
    }
    throw new Error(`run() SQL no soportado: ${sql}`);
  }
}

function request(path, method = "GET", body) {
  return new Request(`https://api.code.intaprd.com${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function call(db, user, path, method = "GET", body) {
  const res = await handleSupportTicketApi({ request: request(path, method, body), env: { DB: db }, user });
  return { status: res.status, body: await res.json() };
}

const db = new FakeDB();
const tenantA = { sub: "tenant-a", role: "tenant" };
const tenantB = { sub: "tenant-b", role: "tenant" };
const admin = { sub: "admin", role: "superadmin" };

try {
  const created = await call(db, tenantA, "/api/support/tickets", "POST", {
    category: "technical",
    subject: "No puedo publicar un QR",
    situation: "El botón devuelve un error.",
    impact: "La campaña está detenida.",
    expected_resolution: "Poder publicar el QR.",
    severity: "high",
    idempotency_key: "conversation-1:ticket-1",
    source: "codi",
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.ok, true);
  assert.equal(created.body.duplicate, false);
  assert.equal(created.body.ticket.service_priority, "priority");
  const ticketId = created.body.ticket.id;

  const duplicate = await call(db, tenantA, "/api/support/tickets", "POST", {
    category: "technical", subject: "Duplicado", situation: "No debe crear otro.", idempotency_key: "conversation-1:ticket-1",
  });
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.body.duplicate, true);
  assert.equal(db.tickets.length, 1);

  const ownList = await call(db, tenantA, "/api/support/tickets");
  assert.equal(ownList.body.tickets.length, 1);

  const otherList = await call(db, tenantB, "/api/support/tickets");
  assert.equal(otherList.body.tickets.length, 0);

  const forbidden = await call(db, tenantB, `/api/support/tickets/${ticketId}`);
  assert.equal(forbidden.status, 403);

  const publicMessage = await call(db, tenantA, `/api/support/tickets/${ticketId}/messages`, "POST", {
    body: "Información adicional del cliente.", idempotency_key: "message-1",
  });
  assert.equal(publicMessage.status, 201);

  const internalMessage = await call(db, admin, `/api/support/tickets/${ticketId}/messages`, "POST", {
    body: "Nota interna para soporte.", visibility: "internal", idempotency_key: "message-2",
  });
  assert.equal(internalMessage.status, 201);

  const tenantDetail = await call(db, tenantA, `/api/support/tickets/${ticketId}`);
  assert.equal(tenantDetail.body.messages.some((m) => m.visibility === "internal"), false);

  const adminDetail = await call(db, admin, `/api/support/tickets/${ticketId}`);
  assert.equal(adminDetail.body.messages.some((m) => m.visibility === "internal"), true);

  const tenantPatch = await call(db, tenantA, `/api/support/tickets/${ticketId}`, "PATCH", { status: "resolved" });
  assert.equal(tenantPatch.status, 403);

  const adminPatch = await call(db, admin, `/api/support/tickets/${ticketId}`, "PATCH", {
    status: "in_progress", severity: "critical", assigned_to_user_id: "admin",
  });
  assert.equal(adminPatch.status, 200);
  assert.equal(db.tickets[0].status, "in_progress");
  assert.equal(db.tickets[0].severity, "critical");

  const badCategory = await call(db, tenantA, "/api/support/tickets", "POST", {
    category: "invented", subject: "X", situation: "Y", idempotency_key: "bad-1",
  });
  assert.equal(badCategory.status, 400);

  console.log("✓ creación de ticket");
  console.log("✓ idempotencia sin duplicados");
  console.log("✓ aislamiento entre tenants");
  console.log("✓ mensajes públicos e internos");
  console.log("✓ permisos de actualización");
  console.log("✓ validación de categoría");
  console.log("\nSupport Ticket API: 6/6 bloques pasaron");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
