PRAGMA foreign_keys = ON;

-- KAWVO TRACE V1 · Equipo del proyecto
-- Grupos operativos + invitaciones vinculadas a proyecto.

CREATE TABLE IF NOT EXISTS trace_work_groups (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  responsible_user_id TEXT,
  scope_type TEXT NOT NULL DEFAULT 'project'
    CHECK(scope_type IN ('project','execution','stage','activity','incident','inspection','correction')),
  scope_id TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','inactive','archived')),
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (tenant_id) REFERENCES users(id),
  FOREIGN KEY (project_id) REFERENCES trace_assets(id) ON DELETE CASCADE,
  FOREIGN KEY (responsible_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id),
  UNIQUE(project_id, name)
);

CREATE INDEX IF NOT EXISTS idx_trace_work_groups_project
  ON trace_work_groups(tenant_id, project_id, status, name);

CREATE INDEX IF NOT EXISTS idx_trace_work_groups_responsible
  ON trace_work_groups(responsible_user_id, status);

CREATE TABLE IF NOT EXISTS trace_work_group_members (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  work_group_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  group_role TEXT NOT NULL DEFAULT 'member'
    CHECK(group_role IN ('lead','member','observer')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','inactive','revoked')),
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (tenant_id) REFERENCES users(id),
  FOREIGN KEY (work_group_id) REFERENCES trace_work_groups(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id),
  UNIQUE(work_group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_trace_work_group_members_group
  ON trace_work_group_members(work_group_id, status, group_role);

CREATE INDEX IF NOT EXISTS idx_trace_work_group_members_user
  ON trace_work_group_members(user_id, status);

CREATE TABLE IF NOT EXISTS trace_project_team_invitations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  email TEXT NOT NULL,
  project_role TEXT NOT NULL DEFAULT 'member'
    CHECK(project_role IN ('owner','manager','supervisor','member','observer')),
  department_id TEXT,
  tenant_member_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','accepted','revoked','expired')),
  invited_by TEXT NOT NULL,
  invited_at TEXT NOT NULL DEFAULT (datetime('now')),
  accepted_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',

  FOREIGN KEY (tenant_id) REFERENCES users(id),
  FOREIGN KEY (project_id) REFERENCES trace_assets(id) ON DELETE CASCADE,
  FOREIGN KEY (department_id) REFERENCES trace_departments(id) ON DELETE SET NULL,
  FOREIGN KEY (invited_by) REFERENCES users(id),
  UNIQUE(project_id, email)
);

CREATE INDEX IF NOT EXISTS idx_trace_project_team_invites_project
  ON trace_project_team_invitations(tenant_id, project_id, status, invited_at DESC);
