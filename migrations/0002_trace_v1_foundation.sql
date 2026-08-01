PRAGMA foreign_keys = ON;

-- =========================================================
-- INTAP TRACE V1
-- Fundación del dominio operativo y de trazabilidad
-- =========================================================

-- ---------------------------------------------------------
-- Procesos
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS trace_processes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','active','paused','retired','archived')),
  current_version_id TEXT,
  color TEXT DEFAULT '#2563eb',
  icon TEXT,
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (tenant_id) REFERENCES users(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_trace_processes_tenant
  ON trace_processes(tenant_id);

CREATE INDEX IF NOT EXISTS idx_trace_processes_status
  ON trace_processes(tenant_id, status);

-- ---------------------------------------------------------
-- Versiones publicables e inmutables
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS trace_process_versions (
  id TEXT PRIMARY KEY,
  process_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  name TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','published','retired')),
  schema_json TEXT NOT NULL DEFAULT '{}',
  published_at TEXT,
  published_by TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (process_id) REFERENCES trace_processes(id) ON DELETE CASCADE,
  FOREIGN KEY (published_by) REFERENCES users(id),
  FOREIGN KEY (created_by) REFERENCES users(id),

  UNIQUE(process_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_trace_process_versions_process
  ON trace_process_versions(process_id, version_number);

CREATE INDEX IF NOT EXISTS idx_trace_process_versions_status
  ON trace_process_versions(process_id, status);

-- ---------------------------------------------------------
-- Etapas
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS trace_stages (
  id TEXT PRIMARY KEY,
  process_version_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  stage_order INTEGER NOT NULL,
  stage_type TEXT NOT NULL DEFAULT 'operation'
    CHECK(stage_type IN (
      'start',
      'operation',
      'inspection',
      'approval',
      'handoff',
      'completion'
    )),
  responsible_role TEXT,
  instructions TEXT,
  estimated_duration_minutes INTEGER,
  requires_evidence INTEGER NOT NULL DEFAULT 0
    CHECK(requires_evidence IN (0,1)),
  requires_approval INTEGER NOT NULL DEFAULT 0
    CHECK(requires_approval IN (0,1)),
  allow_skip INTEGER NOT NULL DEFAULT 0
    CHECK(allow_skip IN (0,1)),
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (process_version_id)
    REFERENCES trace_process_versions(id)
    ON DELETE CASCADE,

  UNIQUE(process_version_id, stage_order)
);

CREATE INDEX IF NOT EXISTS idx_trace_stages_version
  ON trace_stages(process_version_id, stage_order);

-- ---------------------------------------------------------
-- Campos y formularios de cada etapa
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS trace_stage_fields (
  id TEXT PRIMARY KEY,
  stage_id TEXT NOT NULL,
  field_key TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  field_type TEXT NOT NULL
    CHECK(field_type IN (
      'text',
      'textarea',
      'number',
      'decimal',
      'date',
      'datetime',
      'time',
      'select',
      'multiselect',
      'checkbox',
      'yes_no',
      'rating',
      'signature',
      'photo',
      'video',
      'audio',
      'file',
      'location',
      'qr_scan'
    )),
  field_order INTEGER NOT NULL DEFAULT 0,
  is_required INTEGER NOT NULL DEFAULT 0
    CHECK(is_required IN (0,1)),
  options_json TEXT NOT NULL DEFAULT '[]',
  validation_json TEXT NOT NULL DEFAULT '{}',
  conditional_json TEXT NOT NULL DEFAULT '{}',
  default_value_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (stage_id)
    REFERENCES trace_stages(id)
    ON DELETE CASCADE,

  UNIQUE(stage_id, field_key)
);

CREATE INDEX IF NOT EXISTS idx_trace_stage_fields_stage
  ON trace_stage_fields(stage_id, field_order);

-- ---------------------------------------------------------
-- Elementos trazables
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS trace_assets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  process_id TEXT,
  asset_code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  asset_type TEXT NOT NULL DEFAULT 'item',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN (
      'active',
      'inactive',
      'maintenance',
      'completed',
      'retired'
    )),
  qr_slug TEXT,
  external_reference TEXT,
  location TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  public_data_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (tenant_id) REFERENCES users(id),
  FOREIGN KEY (process_id) REFERENCES trace_processes(id),
  FOREIGN KEY (created_by) REFERENCES users(id),

  UNIQUE(tenant_id, asset_code),
  UNIQUE(qr_slug)
);

CREATE INDEX IF NOT EXISTS idx_trace_assets_tenant
  ON trace_assets(tenant_id);

CREATE INDEX IF NOT EXISTS idx_trace_assets_process
  ON trace_assets(process_id);

CREATE INDEX IF NOT EXISTS idx_trace_assets_status
  ON trace_assets(tenant_id, status);

-- ---------------------------------------------------------
-- Asignaciones de procesos
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS trace_process_assignments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  process_id TEXT NOT NULL,
  asset_id TEXT,
  assigned_user_id TEXT,
  assigned_role TEXT,
  assignment_type TEXT NOT NULL DEFAULT 'manual'
    CHECK(assignment_type IN ('manual','automatic','role','team')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','paused','completed','cancelled')),
  starts_at TEXT,
  ends_at TEXT,
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (tenant_id) REFERENCES users(id),
  FOREIGN KEY (process_id) REFERENCES trace_processes(id),
  FOREIGN KEY (asset_id) REFERENCES trace_assets(id),
  FOREIGN KEY (assigned_user_id) REFERENCES users(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_trace_assignments_tenant
  ON trace_process_assignments(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_trace_assignments_user
  ON trace_process_assignments(assigned_user_id, status);

CREATE INDEX IF NOT EXISTS idx_trace_assignments_asset
  ON trace_process_assignments(asset_id);

-- ---------------------------------------------------------
-- Ejecuciones
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS trace_executions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  process_id TEXT NOT NULL,
  process_version_id TEXT NOT NULL,
  asset_id TEXT,
  assignment_id TEXT,
  execution_code TEXT NOT NULL,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN (
      'pending',
      'assigned',
      'in_progress',
      'paused',
      'blocked',
      'pending_approval',
      'correction_required',
      'completed',
      'cancelled',
      'overdue'
    )),
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK(priority IN ('low','normal','high','urgent')),
  current_stage_id TEXT,
  assigned_to TEXT,
  started_at TEXT,
  due_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT,
  completion_percentage INTEGER NOT NULL DEFAULT 0
    CHECK(completion_percentage BETWEEN 0 AND 100),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (tenant_id) REFERENCES users(id),
  FOREIGN KEY (process_id) REFERENCES trace_processes(id),
  FOREIGN KEY (process_version_id) REFERENCES trace_process_versions(id),
  FOREIGN KEY (asset_id) REFERENCES trace_assets(id),
  FOREIGN KEY (assignment_id) REFERENCES trace_process_assignments(id),
  FOREIGN KEY (current_stage_id) REFERENCES trace_stages(id),
  FOREIGN KEY (assigned_to) REFERENCES users(id),
  FOREIGN KEY (created_by) REFERENCES users(id),

  UNIQUE(tenant_id, execution_code)
);

CREATE INDEX IF NOT EXISTS idx_trace_executions_tenant
  ON trace_executions(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_trace_executions_process
  ON trace_executions(process_id, status);

CREATE INDEX IF NOT EXISTS idx_trace_executions_asset
  ON trace_executions(asset_id, status);

CREATE INDEX IF NOT EXISTS idx_trace_executions_assigned
  ON trace_executions(assigned_to, status);

CREATE INDEX IF NOT EXISTS idx_trace_executions_due
  ON trace_executions(due_at, status);

-- ---------------------------------------------------------
-- Instancias de etapas
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS trace_execution_stages (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL,
  stage_id TEXT NOT NULL,
  stage_order INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN (
      'pending',
      'available',
      'in_progress',
      'pending_approval',
      'approved',
      'rejected',
      'correction_required',
      'completed',
      'skipped',
      'cancelled'
    )),
  assigned_to TEXT,
  started_at TEXT,
  submitted_at TEXT,
  completed_at TEXT,
  skipped_at TEXT,
  response_json TEXT NOT NULL DEFAULT '{}',
  validation_json TEXT NOT NULL DEFAULT '{}',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (execution_id)
    REFERENCES trace_executions(id)
    ON DELETE CASCADE,

  FOREIGN KEY (stage_id) REFERENCES trace_stages(id),
  FOREIGN KEY (assigned_to) REFERENCES users(id),

  UNIQUE(execution_id, stage_id)
);

CREATE INDEX IF NOT EXISTS idx_trace_execution_stages_execution
  ON trace_execution_stages(execution_id, stage_order);

CREATE INDEX IF NOT EXISTS idx_trace_execution_stages_assigned
  ON trace_execution_stages(assigned_to, status);

-- ---------------------------------------------------------
-- Eventos append-only
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS trace_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  execution_stage_id TEXT,
  asset_id TEXT,
  event_type TEXT NOT NULL,
  event_source TEXT NOT NULL DEFAULT 'system'
    CHECK(event_source IN (
      'system',
      'operator',
      'supervisor',
      'admin',
      'public',
      'integration'
    )),
  actor_user_id TEXT,
  actor_role TEXT,
  description TEXT,
  location_json TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
  received_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (tenant_id) REFERENCES users(id),
  FOREIGN KEY (execution_id)
    REFERENCES trace_executions(id)
    ON DELETE CASCADE,
  FOREIGN KEY (execution_stage_id)
    REFERENCES trace_execution_stages(id),
  FOREIGN KEY (asset_id) REFERENCES trace_assets(id),
  FOREIGN KEY (actor_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_trace_events_execution
  ON trace_events(execution_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_trace_events_asset
  ON trace_events(asset_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_trace_events_tenant
  ON trace_events(tenant_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_trace_events_type
  ON trace_events(event_type, occurred_at);

-- ---------------------------------------------------------
-- Evidencias almacenadas en R2
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS trace_evidences (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  execution_stage_id TEXT,
  field_id TEXT,
  event_id TEXT,
  evidence_type TEXT NOT NULL
    CHECK(evidence_type IN (
      'photo',
      'video',
      'audio',
      'file',
      'signature',
      'location',
      'text'
    )),
  r2_key TEXT,
  public_url TEXT,
  original_filename TEXT,
  mime_type TEXT,
  file_size INTEGER,
  checksum TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  uploaded_by TEXT,
  captured_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (tenant_id) REFERENCES users(id),
  FOREIGN KEY (execution_id)
    REFERENCES trace_executions(id)
    ON DELETE CASCADE,
  FOREIGN KEY (execution_stage_id)
    REFERENCES trace_execution_stages(id),
  FOREIGN KEY (field_id) REFERENCES trace_stage_fields(id),
  FOREIGN KEY (event_id) REFERENCES trace_events(id),
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_trace_evidences_execution
  ON trace_evidences(execution_id, created_at);

CREATE INDEX IF NOT EXISTS idx_trace_evidences_stage
  ON trace_evidences(execution_stage_id);

-- ---------------------------------------------------------
-- Incidencias
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS trace_incidents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  execution_stage_id TEXT,
  asset_id TEXT,
  incident_code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general',
  severity TEXT NOT NULL DEFAULT 'medium'
    CHECK(severity IN ('low','medium','high','critical')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK(status IN (
      'open',
      'assigned',
      'in_review',
      'in_progress',
      'on_hold',
      'resolved',
      'validated',
      'closed',
      'reopened'
    )),
  reported_by TEXT,
  assigned_to TEXT,
  resolution_notes TEXT,
  reported_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  validated_at TEXT,
  closed_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',

  FOREIGN KEY (tenant_id) REFERENCES users(id),
  FOREIGN KEY (execution_id)
    REFERENCES trace_executions(id)
    ON DELETE CASCADE,
  FOREIGN KEY (execution_stage_id)
    REFERENCES trace_execution_stages(id),
  FOREIGN KEY (asset_id) REFERENCES trace_assets(id),
  FOREIGN KEY (reported_by) REFERENCES users(id),
  FOREIGN KEY (assigned_to) REFERENCES users(id),

  UNIQUE(tenant_id, incident_code)
);

CREATE INDEX IF NOT EXISTS idx_trace_incidents_tenant
  ON trace_incidents(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_trace_incidents_execution
  ON trace_incidents(execution_id, status);

CREATE INDEX IF NOT EXISTS idx_trace_incidents_assigned
  ON trace_incidents(assigned_to, status);

-- ---------------------------------------------------------
-- Aprobaciones
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS trace_approvals (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  execution_stage_id TEXT NOT NULL,
  requested_by TEXT,
  assigned_approver_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN (
      'pending',
      'approved',
      'rejected',
      'correction_required',
      'cancelled'
    )),
  decision_notes TEXT,
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at TEXT,
  decided_by TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',

  FOREIGN KEY (tenant_id) REFERENCES users(id),
  FOREIGN KEY (execution_id)
    REFERENCES trace_executions(id)
    ON DELETE CASCADE,
  FOREIGN KEY (execution_stage_id)
    REFERENCES trace_execution_stages(id)
    ON DELETE CASCADE,
  FOREIGN KEY (requested_by) REFERENCES users(id),
  FOREIGN KEY (assigned_approver_id) REFERENCES users(id),
  FOREIGN KEY (decided_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_trace_approvals_execution
  ON trace_approvals(execution_id, status);

CREATE INDEX IF NOT EXISTS idx_trace_approvals_approver
  ON trace_approvals(assigned_approver_id, status);

-- ---------------------------------------------------------
-- Proyección pública segura
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS trace_public_views (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  execution_id TEXT,
  asset_id TEXT,
  public_slug TEXT NOT NULL UNIQUE,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','paused','expired','revoked')),
  visibility TEXT NOT NULL DEFAULT 'summary'
    CHECK(visibility IN ('summary','timeline','full')),
  projection_json TEXT NOT NULL DEFAULT '{}',
  access_token_hash TEXT,
  expires_at TEXT,
  last_generated_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (tenant_id) REFERENCES users(id),
  FOREIGN KEY (execution_id) REFERENCES trace_executions(id),
  FOREIGN KEY (asset_id) REFERENCES trace_assets(id)
);

CREATE INDEX IF NOT EXISTS idx_trace_public_views_execution
  ON trace_public_views(execution_id);

CREATE INDEX IF NOT EXISTS idx_trace_public_views_asset
  ON trace_public_views(asset_id);

-- ---------------------------------------------------------
-- Idempotencia para móvil, offline e integraciones
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS trace_idempotency_keys (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  operation TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  request_hash TEXT,
  response_status INTEGER,
  response_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT,

  FOREIGN KEY (tenant_id) REFERENCES users(id),

  UNIQUE(tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_trace_idempotency_expiration
  ON trace_idempotency_keys(expires_at);

-- ---------------------------------------------------------
-- Vincular proceso con su versión actual
-- SQLite permite agregar la FK conceptual mediante índice,
-- evitando reconstruir la tabla después de crear versiones.
-- ---------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_trace_processes_current_version
  ON trace_processes(current_version_id);
