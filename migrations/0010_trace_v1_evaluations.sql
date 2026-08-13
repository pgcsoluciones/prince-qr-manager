PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS trace_evaluations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  evaluation_type TEXT NOT NULL DEFAULT 'quality'
    CHECK(evaluation_type IN ('quality','checklist','survey','delivery','service')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('draft','active','closed','archived')),
  project_id TEXT,
  execution_id TEXT,
  public_enabled INTEGER NOT NULL DEFAULT 0 CHECK(public_enabled IN (0,1)),
  definition_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (tenant_id) REFERENCES users(id),
  FOREIGN KEY (project_id) REFERENCES trace_assets(id) ON DELETE SET NULL,
  FOREIGN KEY (execution_id) REFERENCES trace_executions(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS trace_evaluation_responses (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  evaluation_id TEXT NOT NULL,
  execution_id TEXT,
  respondent_user_id TEXT,
  respondent_name TEXT,
  score REAL CHECK(score IS NULL OR (score >= 1 AND score <= 5)),
  answers_json TEXT NOT NULL DEFAULT '{}',
  comment TEXT,
  source TEXT NOT NULL DEFAULT 'internal'
    CHECK(source IN ('internal','public','operator','supervisor','client')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (tenant_id) REFERENCES users(id),
  FOREIGN KEY (evaluation_id) REFERENCES trace_evaluations(id) ON DELETE CASCADE,
  FOREIGN KEY (execution_id) REFERENCES trace_executions(id) ON DELETE SET NULL,
  FOREIGN KEY (respondent_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_trace_evaluations_tenant_status
ON trace_evaluations(tenant_id,status,created_at);

CREATE INDEX IF NOT EXISTS idx_trace_evaluations_project
ON trace_evaluations(tenant_id,project_id);

CREATE INDEX IF NOT EXISTS idx_trace_evaluations_execution
ON trace_evaluations(tenant_id,execution_id);

CREATE INDEX IF NOT EXISTS idx_trace_evaluation_responses_eval
ON trace_evaluation_responses(tenant_id,evaluation_id,created_at);
