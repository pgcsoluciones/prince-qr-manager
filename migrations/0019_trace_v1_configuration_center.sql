CREATE TABLE IF NOT EXISTS trace_configuration_settings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT,
  section_key TEXT NOT NULL,
  settings_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'configured',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tenant_id, project_id, section_key),
  FOREIGN KEY (tenant_id) REFERENCES users(id),
  FOREIGN KEY (project_id) REFERENCES trace_assets(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (updated_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_trace_configuration_settings_tenant_project
ON trace_configuration_settings (tenant_id, project_id, section_key);

CREATE TABLE IF NOT EXISTS trace_configuration_audit_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT,
  section_key TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_user_id TEXT,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES users(id),
  FOREIGN KEY (project_id) REFERENCES trace_assets(id),
  FOREIGN KEY (actor_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_trace_configuration_audit_events_lookup
ON trace_configuration_audit_events (tenant_id, project_id, section_key, created_at);
