PRAGMA foreign_keys = ON;

-- TRACE V1 · Participantes y departamentos asignados a proyectos.
-- Permite preparar el equipo de un proyecto antes de crear operaciones.

CREATE TABLE IF NOT EXISTS trace_project_participants (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  user_id TEXT,
  department_id TEXT,
  project_role TEXT NOT NULL DEFAULT 'member'
    CHECK(project_role IN ('owner','manager','supervisor','member','observer')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','inactive','revoked')),
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (tenant_id) REFERENCES users(id),
  FOREIGN KEY (project_id) REFERENCES trace_assets(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (department_id) REFERENCES trace_departments(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id),

  CHECK ((user_id IS NOT NULL AND department_id IS NULL) OR
         (user_id IS NULL AND department_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_trace_project_participant_user
ON trace_project_participants(project_id,user_id)
WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_trace_project_participant_department
ON trace_project_participants(project_id,department_id)
WHERE department_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trace_project_participants_tenant
ON trace_project_participants(tenant_id,project_id,status);
