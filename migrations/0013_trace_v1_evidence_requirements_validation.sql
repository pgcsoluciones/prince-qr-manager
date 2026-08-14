PRAGMA foreign_keys = ON;

-- =========================================================
-- KAWVO TRACE V1 · Evidencias verificables
-- Requisito versionado -> requisito materializado -> evidencia -> validación
-- Migración aditiva. Conserva evidencias legacy sin requirement_id.
-- =========================================================

CREATE TABLE IF NOT EXISTS trace_stage_activity_evidence_requirements (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  stage_activity_id TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  requirement_order INTEGER NOT NULL DEFAULT 0,
  evidence_type TEXT NOT NULL DEFAULT 'photo'
    CHECK(evidence_type IN ('photo','video','audio','file','signature','location','text')),
  required_count INTEGER NOT NULL DEFAULT 1 CHECK(required_count > 0),
  requires_validation INTEGER NOT NULL DEFAULT 1 CHECK(requires_validation IN (0,1)),
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES users(id),
  FOREIGN KEY (stage_activity_id) REFERENCES trace_stage_activities(id) ON DELETE CASCADE,
  UNIQUE(stage_activity_id, requirement_order)
);

CREATE INDEX IF NOT EXISTS idx_trace_stage_evidence_requirements_activity
  ON trace_stage_activity_evidence_requirements(stage_activity_id, requirement_order);

CREATE TABLE IF NOT EXISTS trace_execution_evidence_requirements (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  execution_stage_id TEXT NOT NULL,
  execution_activity_id TEXT NOT NULL,
  stage_requirement_id TEXT,
  label TEXT NOT NULL,
  description TEXT,
  requirement_order INTEGER NOT NULL DEFAULT 0,
  evidence_type TEXT NOT NULL DEFAULT 'photo'
    CHECK(evidence_type IN ('photo','video','audio','file','signature','location','text')),
  required_count INTEGER NOT NULL DEFAULT 1 CHECK(required_count > 0),
  requires_validation INTEGER NOT NULL DEFAULT 1 CHECK(requires_validation IN (0,1)),
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES users(id),
  FOREIGN KEY (execution_id) REFERENCES trace_executions(id) ON DELETE CASCADE,
  FOREIGN KEY (execution_stage_id) REFERENCES trace_execution_stages(id) ON DELETE CASCADE,
  FOREIGN KEY (execution_activity_id) REFERENCES trace_execution_activities(id) ON DELETE CASCADE,
  FOREIGN KEY (stage_requirement_id) REFERENCES trace_stage_activity_evidence_requirements(id),
  UNIQUE(execution_activity_id, requirement_order)
);

CREATE INDEX IF NOT EXISTS idx_trace_execution_evidence_requirements_activity
  ON trace_execution_evidence_requirements(execution_activity_id, requirement_order);

ALTER TABLE trace_evidences
  ADD COLUMN requirement_id TEXT REFERENCES trace_execution_evidence_requirements(id);

ALTER TABLE trace_evidences
  ADD COLUMN validation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK(validation_status IN ('pending','approved','observed','rejected'));

ALTER TABLE trace_evidences
  ADD COLUMN validation_notes TEXT;

ALTER TABLE trace_evidences
  ADD COLUMN validated_at TEXT;

ALTER TABLE trace_evidences
  ADD COLUMN validated_by TEXT REFERENCES users(id);

ALTER TABLE trace_evidences
  ADD COLUMN thumbnail_r2_key TEXT;

ALTER TABLE trace_evidences
  ADD COLUMN thumbnail_url TEXT;

CREATE INDEX IF NOT EXISTS idx_trace_evidences_requirement
  ON trace_evidences(requirement_id, validation_status, created_at);

CREATE INDEX IF NOT EXISTS idx_trace_evidences_validation
  ON trace_evidences(tenant_id, validation_status, created_at);

CREATE TABLE IF NOT EXISTS trace_evidence_validations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('approved','observed','rejected')),
  notes TEXT,
  decided_by TEXT NOT NULL,
  decided_at TEXT NOT NULL DEFAULT (datetime('now')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (tenant_id) REFERENCES users(id),
  FOREIGN KEY (evidence_id) REFERENCES trace_evidences(id) ON DELETE CASCADE,
  FOREIGN KEY (decided_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_trace_evidence_validations_evidence
  ON trace_evidence_validations(evidence_id, decided_at);
