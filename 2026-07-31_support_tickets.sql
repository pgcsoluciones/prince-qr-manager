-- INTAP CODE — Soporte guiado por Codi
-- Migración incremental. No ejecutar en producción sin backup y revisión del esquema remoto.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS support_tickets (
    id TEXT PRIMARY KEY,
    ticket_number TEXT NOT NULL UNIQUE,

    -- Propiedad y aislamiento
    tenant_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    assigned_to_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,

    -- Datos del solicitante capturados al crear el caso
    requester_name TEXT,
    requester_email TEXT,
    requester_phone TEXT,
    company_name TEXT,

    -- Clasificación
    category TEXT NOT NULL,
    subject TEXT NOT NULL,
    situation TEXT NOT NULL,
    impact TEXT,
    expected_resolution TEXT,
    severity TEXT NOT NULL DEFAULT 'normal'
        CHECK (severity IN ('low','normal','high','critical')),

    -- Prioridad de servicio: snapshot del plan al momento de creación
    service_priority TEXT NOT NULL DEFAULT 'standard'
        CHECK (service_priority IN ('standard','priority','urgent')),
    plan_snapshot TEXT,
    first_response_target_minutes INTEGER,

    -- Ciclo de vida
    status TEXT NOT NULL DEFAULT 'new'
        CHECK (status IN ('new','open','in_progress','waiting_customer','resolved','closed')),
    source TEXT NOT NULL DEFAULT 'codi'
        CHECK (source IN ('codi','dashboard','admin','api')),

    -- Prevención de duplicados
    idempotency_key TEXT NOT NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    first_response_at DATETIME,
    resolved_at DATETIME,
    closed_at DATETIME,

    UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_tenant_status
    ON support_tickets (tenant_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_assignee_status
    ON support_tickets (assigned_to_user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_priority_status
    ON support_tickets (service_priority, severity, status, created_at DESC);

CREATE TABLE IF NOT EXISTS support_ticket_messages (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    author_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,

    author_type TEXT NOT NULL
        CHECK (author_type IN ('customer','agent','system','codi')),
    visibility TEXT NOT NULL DEFAULT 'public'
        CHECK (visibility IN ('public','internal')),
    body TEXT NOT NULL,

    attachment_refs_json TEXT NOT NULL DEFAULT '[]',
    idempotency_key TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (ticket_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_created
    ON support_ticket_messages (ticket_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_support_messages_tenant_created
    ON support_ticket_messages (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS support_ticket_events (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,

    event_type TEXT NOT NULL,
    previous_value_json TEXT,
    new_value_json TEXT,
    metadata_json TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_support_events_ticket_created
    ON support_ticket_events (ticket_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_support_events_tenant_created
    ON support_ticket_events (tenant_id, created_at DESC);
