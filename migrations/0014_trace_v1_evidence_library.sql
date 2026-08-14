PRAGMA foreign_keys = ON;

-- =========================================================
-- TRACE V1 · Biblioteca privada de evidencias
-- Captura una vez, conserva contexto y reutiliza por referencia.
-- No altera trace_evidences ni el flujo operacional existente.
-- =========================================================

CREATE TABLE IF NOT EXISTS trace_evidence_library_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  execution_id TEXT,
  execution_stage_id TEXT,
  execution_activity_id TEXT,
  owner_user_id TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general'
    CHECK(category IN ('general','documentation','refutation','correction','inspection','reference')),
  visibility TEXT NOT NULL DEFAULT 'private'
    CHECK(visibility IN ('private','context')),
  title TEXT,
  notes TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  evidence_type TEXT NOT NULL
    CHECK(evidence_type IN ('photo','video','audio','file','signature','location','text')),
  r2_key TEXT,
  thumbnail_r2_key TEXT,
  original_filename TEXT,
  mime_type TEXT,
  file_size INTEGER,
  checksum TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  captured_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (tenant_id) REFERENCES users(id),
  FOREIGN KEY (project_id) REFERENCES trace_assets(id) ON DELETE CASCADE,
  FOREIGN KEY (execution_id) REFERENCES trace_executions(id) ON DELETE SET NULL,
  FOREIGN KEY (execution_stage_id) REFERENCES trace_execution_stages(id) ON DELETE SET NULL,
  FOREIGN KEY (execution_activity_id) REFERENCES trace_execution_activities(id) ON DELETE SET NULL,
  FOREIGN KEY (owner_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_trace_evidence_library_owner
  ON trace_evidence_library_items(tenant_id, owner_user_id, project_id, created_at);

CREATE INDEX IF NOT EXISTS idx_trace_evidence_library_stage
  ON trace_evidence_library_items(project_id, execution_stage_id, created_at);

CREATE TABLE IF NOT EXISTS trace_evidence_library_mentions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  library_item_id TEXT NOT NULL,
  mentioned_user_id TEXT,
  mentioned_department_id TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (tenant_id) REFERENCES users(id),
  FOREIGN KEY (library_item_id) REFERENCES trace_evidence_library_items(id) ON DELETE CASCADE,
  FOREIGN KEY (mentioned_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (mentioned_department_id) REFERENCES trace_departments(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id),

  CHECK ((mentioned_user_id IS NOT NULL AND mentioned_department_id IS NULL) OR
         (mentioned_user_id IS NULL AND mentioned_department_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_trace_evidence_library_mention_user
  ON trace_evidence_library_mentions(library_item_id, mentioned_user_id)
  WHERE mentioned_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_trace_evidence_library_mention_department
  ON trace_evidence_library_mentions(library_item_id, mentioned_department_id)
  WHERE mentioned_department_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS trace_evidence_library_links (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  library_item_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  link_type TEXT NOT NULL
    CHECK(link_type IN ('stage','activity','incident','approval')),
  link_id TEXT NOT NULL,
  note TEXT,
  linked_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (tenant_id) REFERENCES users(id),
  FOREIGN KEY (library_item_id) REFERENCES trace_evidence_library_items(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES trace_assets(id) ON DELETE CASCADE,
  FOREIGN KEY (linked_by) REFERENCES users(id),

  UNIQUE(library_item_id, link_type, link_id)
);

CREATE INDEX IF NOT EXISTS idx_trace_evidence_library_links_context
  ON trace_evidence_library_links(tenant_id, project_id, link_type, link_id);
