PRAGMA foreign_keys = ON;

-- =========================================================
-- INTAP TRACE V1
-- Organización, departamentos y procesos en equipo
-- =========================================================

-- ---------------------------------------------------------
-- Modo de participación del proceso
-- ---------------------------------------------------------

ALTER TABLE trace_processes
ADD COLUMN process_mode TEXT NOT NULL DEFAULT 'simple'
  CHECK(process_mode IN ('simple','team'));

-- ---------------------------------------------------------
-- Departamentos del tenant
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS trace_departments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  department_code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  parent_department_id TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','inactive','archived')),
  color TEXT,
  icon TEXT,
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (tenant_id)
    REFERENCES users(id),

  FOREIGN KEY (parent_department_id)
    REFERENCES trace_departments(id)
    ON DELETE SET NULL,

  FOREIGN KEY (created_by)
    REFERENCES users(id),

  UNIQUE(tenant_id, department_code),
  UNIQUE(tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_trace_departments_tenant
  ON trace_departments(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_trace_departments_parent
  ON trace_departments(parent_department_id);

-- ---------------------------------------------------------
-- Usuarios registrados dentro de departamentos
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS trace_department_members (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  department_id TEXT NOT NULL,
  user_id TEXT NOT NULL,

  membership_role TEXT NOT NULL DEFAULT 'member'
    CHECK(membership_role IN (
      'lead',
      'supervisor',
      'member',
      'assistant',
      'observer'
    )),

  is_primary INTEGER NOT NULL DEFAULT 0
    CHECK(is_primary IN (0,1)),

  can_receive_assignments INTEGER NOT NULL DEFAULT 1
    CHECK(can_receive_assignments IN (0,1)),

  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN (
      'active',
      'inactive',
      'temporary',
      'revoked'
    )),

  starts_at TEXT,
  ends_at TEXT,
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (tenant_id)
    REFERENCES users(id),

  FOREIGN KEY (department_id)
    REFERENCES trace_departments(id)
    ON DELETE CASCADE,

  FOREIGN KEY (user_id)
    REFERENCES users(id),

  FOREIGN KEY (created_by)
    REFERENCES users(id),

  UNIQUE(department_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_trace_department_members_tenant
  ON trace_department_members(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_trace_department_members_department
  ON trace_department_members(
    department_id,
    status,
    membership_role
  );

CREATE INDEX IF NOT EXISTS idx_trace_department_members_user
  ON trace_department_members(user_id, status);

-- Solo un responsable principal activo por departamento.
CREATE UNIQUE INDEX IF NOT EXISTS
  idx_trace_department_primary_lead
ON trace_department_members(department_id)
WHERE
  membership_role = 'lead'
  AND is_primary = 1
  AND status = 'active';

-- ---------------------------------------------------------
-- Departamentos participantes de una versión de proceso
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS
trace_process_version_departments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  process_id TEXT NOT NULL,
  process_version_id TEXT NOT NULL,
  department_id TEXT NOT NULL,

  participation_role TEXT NOT NULL DEFAULT 'executor'
    CHECK(participation_role IN (
      'owner',
      'executor',
      'collaborator',
      'reviewer',
      'approver',
      'consulted',
      'informed'
    )),

  is_required INTEGER NOT NULL DEFAULT 1
    CHECK(is_required IN (0,1)),

  can_reassign INTEGER NOT NULL DEFAULT 0
    CHECK(can_reassign IN (0,1)),

  settings_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (tenant_id)
    REFERENCES users(id),

  FOREIGN KEY (process_id)
    REFERENCES trace_processes(id)
    ON DELETE CASCADE,

  FOREIGN KEY (process_version_id)
    REFERENCES trace_process_versions(id)
    ON DELETE CASCADE,

  FOREIGN KEY (department_id)
    REFERENCES trace_departments(id),

  FOREIGN KEY (created_by)
    REFERENCES users(id),

  UNIQUE(
    process_version_id,
    department_id,
    participation_role
  )
);

CREATE INDEX IF NOT EXISTS
  idx_trace_process_version_departments_version
ON trace_process_version_departments(
  process_version_id,
  participation_role
);

CREATE INDEX IF NOT EXISTS
  idx_trace_process_version_departments_department
ON trace_process_version_departments(
  department_id,
  participation_role
);

-- ---------------------------------------------------------
-- Participantes predeterminados de una versión de proceso
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS
trace_process_version_participants (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  process_id TEXT NOT NULL,
  process_version_id TEXT NOT NULL,
  department_id TEXT,
  user_id TEXT NOT NULL,

  participation_role TEXT NOT NULL DEFAULT 'executor'
    CHECK(participation_role IN (
      'process_owner',
      'department_lead',
      'executor',
      'collaborator',
      'reviewer',
      'approver',
      'consulted',
      'informed'
    )),

  assignment_mode TEXT NOT NULL DEFAULT 'default'
    CHECK(assignment_mode IN (
      'default',
      'required',
      'optional',
      'fallback'
    )),

  settings_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (tenant_id)
    REFERENCES users(id),

  FOREIGN KEY (process_id)
    REFERENCES trace_processes(id)
    ON DELETE CASCADE,

  FOREIGN KEY (process_version_id)
    REFERENCES trace_process_versions(id)
    ON DELETE CASCADE,

  FOREIGN KEY (department_id)
    REFERENCES trace_departments(id),

  FOREIGN KEY (user_id)
    REFERENCES users(id),

  FOREIGN KEY (created_by)
    REFERENCES users(id),

  UNIQUE(
    process_version_id,
    user_id,
    participation_role
  )
);

CREATE INDEX IF NOT EXISTS
  idx_trace_process_version_participants_version
ON trace_process_version_participants(
  process_version_id,
  participation_role
);

CREATE INDEX IF NOT EXISTS
  idx_trace_process_version_participants_user
ON trace_process_version_participants(
  user_id,
  participation_role
);

-- ---------------------------------------------------------
-- Departamentos reales participantes en una ejecución
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS trace_execution_departments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  department_id TEXT NOT NULL,
  responsible_user_id TEXT,

  participation_role TEXT NOT NULL DEFAULT 'executor'
    CHECK(participation_role IN (
      'owner',
      'executor',
      'collaborator',
      'reviewer',
      'approver',
      'consulted',
      'informed'
    )),

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN (
      'pending',
      'available',
      'in_progress',
      'waiting_information',
      'blocked',
      'pending_approval',
      'correction_required',
      'completed',
      'cancelled'
    )),

  started_at TEXT,
  completed_at TEXT,
  due_at TEXT,
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (tenant_id)
    REFERENCES users(id),

  FOREIGN KEY (execution_id)
    REFERENCES trace_executions(id)
    ON DELETE CASCADE,

  FOREIGN KEY (department_id)
    REFERENCES trace_departments(id),

  FOREIGN KEY (responsible_user_id)
    REFERENCES users(id),

  UNIQUE(
    execution_id,
    department_id,
    participation_role
  )
);

CREATE INDEX IF NOT EXISTS
  idx_trace_execution_departments_execution
ON trace_execution_departments(
  execution_id,
  status
);

CREATE INDEX IF NOT EXISTS
  idx_trace_execution_departments_department
ON trace_execution_departments(
  department_id,
  status
);

CREATE INDEX IF NOT EXISTS
  idx_trace_execution_departments_responsible
ON trace_execution_departments(
  responsible_user_id,
  status
);

-- ---------------------------------------------------------
-- Participantes reales de una ejecución
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS trace_execution_participants (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  department_id TEXT,
  user_id TEXT NOT NULL,

  participation_role TEXT NOT NULL DEFAULT 'executor'
    CHECK(participation_role IN (
      'process_owner',
      'department_lead',
      'executor',
      'collaborator',
      'reviewer',
      'approver',
      'consulted',
      'informed'
    )),

  assignment_source TEXT NOT NULL DEFAULT 'process'
    CHECK(assignment_source IN (
      'process',
      'department',
      'manual',
      'automatic',
      'substitution',
      'delegation'
    )),

  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN (
      'active',
      'inactive',
      'substituted',
      'completed',
      'revoked'
    )),

  substituted_user_id TEXT,
  starts_at TEXT,
  ends_at TEXT,
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (tenant_id)
    REFERENCES users(id),

  FOREIGN KEY (execution_id)
    REFERENCES trace_executions(id)
    ON DELETE CASCADE,

  FOREIGN KEY (department_id)
    REFERENCES trace_departments(id),

  FOREIGN KEY (user_id)
    REFERENCES users(id),

  FOREIGN KEY (substituted_user_id)
    REFERENCES users(id),

  FOREIGN KEY (created_by)
    REFERENCES users(id),

  UNIQUE(
    execution_id,
    user_id,
    participation_role
  )
);

CREATE INDEX IF NOT EXISTS
  idx_trace_execution_participants_execution
ON trace_execution_participants(
  execution_id,
  status
);

CREATE INDEX IF NOT EXISTS
  idx_trace_execution_participants_user
ON trace_execution_participants(
  user_id,
  status
);

CREATE INDEX IF NOT EXISTS
  idx_trace_execution_participants_department
ON trace_execution_participants(
  department_id,
  status
);
