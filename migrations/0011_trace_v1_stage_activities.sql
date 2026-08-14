PRAGMA foreign_keys = ON;

-- =========================================================
-- KAWVO TRACE V1 · Actividades en dos niveles
-- Definición versionada + materialización por ejecución
-- Migración aditiva. Relaciones históricas por etapa se conservan.
-- =========================================================

-- ---------------------------------------------------------
-- Actividades definidas dentro de una etapa versionada
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS trace_stage_activities (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  stage_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  activity_order INTEGER NOT NULL DEFAULT 0,
  is_required INTEGER NOT NULL DEFAULT 1
    CHECK(is_required IN (0,1)),
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK(priority IN ('low','normal','high','urgent')),
  responsible_role TEXT,
  planned_start_offset_minutes INTEGER,
  due_offset_minutes INTEGER,
  estimated_duration_minutes INTEGER,
  requires_evidence INTEGER NOT NULL DEFAULT 0
    CHECK(requires_evidence IN (0,1)),
  requires_approval INTEGER NOT NULL DEFAULT 0
    CHECK(requires_approval IN (0,1)),
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (tenant_id) REFERENCES users(id),
  FOREIGN KEY (stage_id) REFERENCES trace_stages(id) ON DELETE CASCADE,

  UNIQUE(stage_id, activity_order)
);

CREATE INDEX IF NOT EXISTS idx_trace_stage_activities_stage
  ON trace_stage_activities(stage_id, activity_order);

CREATE INDEX IF NOT EXISTS idx_trace_stage_activities_tenant
  ON trace_stage_activities(tenant_id, stage_id);

-- ---------------------------------------------------------
-- Actividades materializadas para una ejecución concreta
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS trace_execution_activities (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  execution_stage_id TEXT NOT NULL,
  stage_activity_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  activity_order INTEGER NOT NULL DEFAULT 0,
  is_required INTEGER NOT NULL DEFAULT 1
    CHECK(is_required IN (0,1)),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN (
      'pending',
      'available',
      'in_progress',
      'pending_approval',
      'correction_required',
      'completed',
      'skipped',
      'cancelled',
      'blocked'
    )),
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK(priority IN ('low','normal','high','urgent')),
  responsible_role TEXT,
  assigned_to TEXT,
  planned_start_at TEXT,
  due_at TEXT,
  started_at TEXT,
  submitted_at TEXT,
  completed_at TEXT,
  requires_evidence INTEGER NOT NULL DEFAULT 0
    CHECK(requires_evidence IN (0,1)),
  requires_approval INTEGER NOT NULL DEFAULT 0
    CHECK(requires_approval IN (0,1)),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (tenant_id) REFERENCES users(id),
  FOREIGN KEY (execution_id) REFERENCES trace_executions(id) ON DELETE CASCADE,
  FOREIGN KEY (execution_stage_id) REFERENCES trace_execution_stages(id) ON DELETE CASCADE,
  FOREIGN KEY (stage_activity_id) REFERENCES trace_stage_activities(id),
  FOREIGN KEY (assigned_to) REFERENCES users(id),

  UNIQUE(execution_stage_id, activity_order)
);

CREATE INDEX IF NOT EXISTS idx_trace_execution_activities_execution
  ON trace_execution_activities(execution_id, activity_order);

CREATE INDEX IF NOT EXISTS idx_trace_execution_activities_stage
  ON trace_execution_activities(execution_stage_id, status, activity_order);

CREATE INDEX IF NOT EXISTS idx_trace_execution_activities_assigned
  ON trace_execution_activities(assigned_to, status, due_at);

CREATE INDEX IF NOT EXISTS idx_trace_execution_activities_due
  ON trace_execution_activities(tenant_id, due_at, status);

-- ---------------------------------------------------------
-- Relaciones opcionales hacia actividad materializada.
-- Se conserva execution_stage_id para compatibilidad histórica.
-- ---------------------------------------------------------
ALTER TABLE trace_events
  ADD COLUMN execution_activity_id TEXT REFERENCES trace_execution_activities(id);

ALTER TABLE trace_evidences
  ADD COLUMN execution_activity_id TEXT REFERENCES trace_execution_activities(id);

ALTER TABLE trace_incidents
  ADD COLUMN execution_activity_id TEXT REFERENCES trace_execution_activities(id);

ALTER TABLE trace_approvals
  ADD COLUMN execution_activity_id TEXT REFERENCES trace_execution_activities(id);

CREATE INDEX IF NOT EXISTS idx_trace_events_activity
  ON trace_events(execution_activity_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_trace_evidences_activity
  ON trace_evidences(execution_activity_id, created_at);

CREATE INDEX IF NOT EXISTS idx_trace_incidents_activity
  ON trace_incidents(execution_activity_id, status);

CREATE INDEX IF NOT EXISTS idx_trace_approvals_activity
  ON trace_approvals(execution_activity_id, status);
