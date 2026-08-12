PRAGMA foreign_keys = ON;

-- =========================================================
-- INTAP TRACE V1 · roadmap 9-12
-- Conversaciones, notificaciones, proyección pública y logística
-- =========================================================

CREATE TABLE IF NOT EXISTS trace_threads (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  execution_stage_id TEXT,
  incident_id TEXT,
  thread_type TEXT NOT NULL DEFAULT 'official'
    CHECK(thread_type IN ('official','private','contextual')),
  title TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK(status IN ('open','closed','archived')),
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES users(id),
  FOREIGN KEY (execution_id) REFERENCES trace_executions(id) ON DELETE CASCADE,
  FOREIGN KEY (execution_stage_id) REFERENCES trace_execution_stages(id),
  FOREIGN KEY (incident_id) REFERENCES trace_incidents(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_trace_threads_execution ON trace_threads(execution_id, status, updated_at);

CREATE TABLE IF NOT EXISTS trace_thread_members (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  member_role TEXT NOT NULL DEFAULT 'member'
    CHECK(member_role IN ('owner','member','observer')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','left','removed')),
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES users(id),
  FOREIGN KEY (thread_id) REFERENCES trace_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(thread_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_trace_thread_members_user ON trace_thread_members(user_id, status);

CREATE TABLE IF NOT EXISTS trace_messages (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  sender_user_id TEXT NOT NULL,
  body TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text'
    CHECK(message_type IN ('text','system','evidence_reference','incident_reference')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  edited_at TEXT,
  FOREIGN KEY (tenant_id) REFERENCES users(id),
  FOREIGN KEY (thread_id) REFERENCES trace_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (execution_id) REFERENCES trace_executions(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_trace_messages_thread ON trace_messages(thread_id, created_at);

CREATE TABLE IF NOT EXISTS trace_notifications (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  execution_id TEXT,
  thread_id TEXT,
  message_id TEXT,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'unread'
    CHECK(status IN ('unread','read','archived')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  read_at TEXT,
  FOREIGN KEY (tenant_id) REFERENCES users(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (execution_id) REFERENCES trace_executions(id) ON DELETE CASCADE,
  FOREIGN KEY (thread_id) REFERENCES trace_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES trace_messages(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_trace_notifications_user ON trace_notifications(user_id, status, created_at);

CREATE TABLE IF NOT EXISTS trace_public_projections (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  public_slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','paused','revoked')),
  projection_json TEXT NOT NULL DEFAULT '{}',
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES users(id),
  FOREIGN KEY (execution_id) REFERENCES trace_executions(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id),
  UNIQUE(execution_id)
);
CREATE INDEX IF NOT EXISTS idx_trace_public_projection_execution ON trace_public_projections(execution_id, status);

-- Logística usa el mismo Process -> Execution -> Stage -> Event.
-- Esta tabla solo agrega contexto comercial/logístico, no crea un motor paralelo.
CREATE TABLE IF NOT EXISTS trace_logistics_contexts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  order_reference TEXT,
  tracking_code TEXT,
  shipment_type TEXT NOT NULL DEFAULT 'delivery'
    CHECK(shipment_type IN ('delivery','pickup','transfer','return')),
  origin_json TEXT NOT NULL DEFAULT '{}',
  destination_json TEXT NOT NULL DEFAULT '{}',
  sender_json TEXT NOT NULL DEFAULT '{}',
  recipient_json TEXT NOT NULL DEFAULT '{}',
  package_json TEXT NOT NULL DEFAULT '{}',
  expected_delivery_at TEXT,
  delivered_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES users(id),
  FOREIGN KEY (execution_id) REFERENCES trace_executions(id) ON DELETE CASCADE,
  UNIQUE(execution_id),
  UNIQUE(tenant_id, tracking_code)
);
CREATE INDEX IF NOT EXISTS idx_trace_logistics_tracking ON trace_logistics_contexts(tenant_id, tracking_code);
