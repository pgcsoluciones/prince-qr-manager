PRAGMA foreign_keys = ON;

-- KAWVO TRACE V1 · Reportes persistentes y snapshots canónicos

CREATE TABLE IF NOT EXISTS trace_reports (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  execution_id TEXT,
  report_type TEXT NOT NULL CHECK(report_type IN ('executive','traceability','incidents','evidence','compliance','analytics','client')),
  title TEXT NOT NULL,
  description TEXT,
  scope_type TEXT NOT NULL DEFAULT 'project' CHECK(scope_type IN ('project','execution','stage','activity')),
  scope_id TEXT,
  period_from TEXT,
  period_to TEXT,
  status TEXT NOT NULL DEFAULT 'ready' CHECK(status IN ('generating','ready','failed','shared','archived')),
  definition_json TEXT NOT NULL DEFAULT '{}',
  snapshot_json TEXT NOT NULL,
  generated_by TEXT NOT NULL,
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES users(id),
  FOREIGN KEY (project_id) REFERENCES trace_assets(id),
  FOREIGN KEY (execution_id) REFERENCES trace_executions(id),
  FOREIGN KEY (generated_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_trace_reports_project
  ON trace_reports(tenant_id, project_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_trace_reports_type_status
  ON trace_reports(tenant_id, project_id, report_type, status, generated_at DESC);

CREATE TABLE IF NOT EXISTS trace_report_files (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  format TEXT NOT NULL CHECK(format IN ('pdf','docx','xlsx')),
  r2_key TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  checksum_sha256 TEXT,
  status TEXT NOT NULL DEFAULT 'ready' CHECK(status IN ('generating','ready','failed')),
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (report_id) REFERENCES trace_reports(id) ON DELETE CASCADE,
  UNIQUE(report_id, format)
);
CREATE INDEX IF NOT EXISTS idx_trace_report_files_report
  ON trace_report_files(report_id, format);

CREATE TABLE IF NOT EXISTS trace_report_shares (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT,
  pin_hash TEXT,
  can_download INTEGER NOT NULL DEFAULT 0 CHECK(can_download IN (0,1)),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (report_id) REFERENCES trace_reports(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_trace_report_shares_report
  ON trace_report_shares(report_id, revoked_at, expires_at);

CREATE TABLE IF NOT EXISTS trace_report_schedules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  report_type TEXT NOT NULL CHECK(report_type IN ('executive','traceability','incidents','evidence','compliance','analytics','client')),
  definition_json TEXT NOT NULL DEFAULT '{}',
  cadence TEXT NOT NULL,
  recipients_json TEXT NOT NULL DEFAULT '[]',
  format TEXT NOT NULL DEFAULT 'pdf' CHECK(format IN ('pdf','docx','xlsx')),
  timezone TEXT,
  next_run_at TEXT,
  last_run_at TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','archived')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES users(id),
  FOREIGN KEY (project_id) REFERENCES trace_assets(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_trace_report_schedules_due
  ON trace_report_schedules(tenant_id, status, next_run_at);
