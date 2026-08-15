-- KAWVO Trace V1 · Equipo
-- Trazabilidad discreta de gestión de miembros/departamentos + evaluaciones 1..5.

CREATE TABLE IF NOT EXISTS trace_team_audit_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('member','department','work_group','project_membership')),
  entity_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_user_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES users(id),
  FOREIGN KEY (project_id) REFERENCES trace_assets(id),
  FOREIGN KEY (actor_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_trace_team_audit_entity
ON trace_team_audit_events(tenant_id, entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trace_team_audit_project
ON trace_team_audit_events(tenant_id, project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS trace_member_evaluations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  member_user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  evaluator_user_id TEXT NOT NULL,
  evaluator_role TEXT,
  score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES users(id),
  FOREIGN KEY (member_user_id) REFERENCES users(id),
  FOREIGN KEY (project_id) REFERENCES trace_assets(id),
  FOREIGN KEY (evaluator_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_trace_member_evaluations_member
ON trace_member_evaluations(tenant_id, member_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trace_member_evaluations_project
ON trace_member_evaluations(tenant_id, project_id, member_user_id, created_at DESC);
