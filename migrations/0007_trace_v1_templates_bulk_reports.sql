PRAGMA foreign_keys = ON;

-- INTAP TRACE V1 · Plantillas por rubro, importaciones masivas y reportes

CREATE TABLE IF NOT EXISTS trace_process_templates (
  id TEXT PRIMARY KEY,
  template_key TEXT NOT NULL UNIQUE,
  industry TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','retired')),
  process_json TEXT NOT NULL DEFAULT '{}',
  stages_json TEXT NOT NULL DEFAULT '[]',
  fields_json TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_trace_process_templates_industry
  ON trace_process_templates(industry, status);

CREATE TABLE IF NOT EXISTS trace_import_batches (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  import_type TEXT NOT NULL CHECK(import_type IN ('assets','processes','users','participants')),
  source_name TEXT,
  source_format TEXT NOT NULL DEFAULT 'xlsx' CHECK(source_format IN ('xlsx','csv','json')),
  idempotency_key TEXT,
  status TEXT NOT NULL DEFAULT 'validated' CHECK(status IN ('validated','processing','completed','partial','failed','cancelled')),
  total_rows INTEGER NOT NULL DEFAULT 0,
  success_rows INTEGER NOT NULL DEFAULT 0,
  failed_rows INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (tenant_id) REFERENCES users(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  UNIQUE(tenant_id, import_type, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_trace_import_batches_tenant
  ON trace_import_batches(tenant_id, import_type, created_at);

CREATE TABLE IF NOT EXISTS trace_import_rows (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  row_number INTEGER NOT NULL,
  external_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','success','failed','skipped')),
  input_json TEXT NOT NULL DEFAULT '{}',
  result_entity_type TEXT,
  result_entity_id TEXT,
  error_code TEXT,
  error_column TEXT,
  error_message TEXT,
  processed_at TEXT,
  FOREIGN KEY (batch_id) REFERENCES trace_import_batches(id) ON DELETE CASCADE,
  UNIQUE(batch_id, row_number)
);
CREATE INDEX IF NOT EXISTS idx_trace_import_rows_batch
  ON trace_import_rows(batch_id, status, row_number);

CREATE TABLE IF NOT EXISTS trace_import_identity_map (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('asset','process','user','participant')),
  external_key TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES users(id),
  UNIQUE(tenant_id, entity_type, external_key)
);
CREATE INDEX IF NOT EXISTS idx_trace_import_identity_map_entity
  ON trace_import_identity_map(tenant_id, entity_type, entity_id);

-- Plantillas base iniciales. Son configuración de producto, no datos operativos del tenant.
INSERT OR IGNORE INTO trace_process_templates (
  id, template_key, industry, name, description, version, process_json, stages_json, fields_json, metadata_json
) VALUES
(
  'tpl-construction-progress-v1',
  'construction.progress-control',
  'construction',
  'Control y evidencia de avance de obra',
  'Plantilla base editable para seguimiento de avance, evidencia, calidad y entrega.',
  1,
  '{"category":"construction","color":"#2563eb","icon":"building"}',
  '[{"key":"start","name":"Inicio y preparación","stageType":"start","responsibleRole":"supervisor","instructions":"Confirmar área, personal y condiciones iniciales.","requiresEvidence":1,"requiresApproval":0},{"key":"grey-work","name":"Obra gris","stageType":"operation","responsibleRole":"operator","instructions":"Registrar avance estructural y evidencias.","requiresEvidence":1,"requiresApproval":0},{"key":"plaster","name":"Pañete","stageType":"operation","responsibleRole":"operator","instructions":"Verificar cobertura, nivelación y terminación.","requiresEvidence":1,"requiresApproval":0},{"key":"first-paint","name":"Primera pintura","stageType":"operation","responsibleRole":"operator","instructions":"Registrar aplicación y estado de la superficie.","requiresEvidence":1,"requiresApproval":0},{"key":"quality","name":"Inspección y aprobación de calidad","stageType":"approval","responsibleRole":"approver","instructions":"Revisar evidencias, terminación y observaciones.","requiresEvidence":1,"requiresApproval":1},{"key":"close","name":"Cierre y entrega","stageType":"completion","responsibleRole":"supervisor","instructions":"Confirmar cierre del proceso y entrega.","requiresEvidence":0,"requiresApproval":1}]',
  '[]',
  '{"editable":true,"source":"intap-v1"}'
),
(
  'tpl-logistics-delivery-v1',
  'logistics.order-delivery',
  'logistics',
  'Pedido, despacho y entrega',
  'Plantilla base editable para trazabilidad logística desde recepción del pedido hasta entrega.',
  1,
  '{"category":"logistics","color":"#2563eb","icon":"truck"}',
  '[{"key":"order","name":"Pedido recibido","stageType":"start","responsibleRole":"operator","instructions":"Validar pedido, referencia y destino.","requiresEvidence":0,"requiresApproval":0},{"key":"prepare","name":"Preparación","stageType":"operation","responsibleRole":"operator","instructions":"Preparar y verificar mercancía.","requiresEvidence":1,"requiresApproval":0},{"key":"dispatch","name":"Despacho","stageType":"handoff","responsibleRole":"operator","instructions":"Registrar salida, transporte y responsable.","requiresEvidence":1,"requiresApproval":0},{"key":"transit","name":"En tránsito","stageType":"operation","responsibleRole":"operator","instructions":"Registrar hitos de transporte y novedades.","requiresEvidence":0,"requiresApproval":0},{"key":"receive","name":"Recepción en destino","stageType":"inspection","responsibleRole":"operator","instructions":"Confirmar recepción y condición del pedido.","requiresEvidence":1,"requiresApproval":0},{"key":"delivery","name":"Entrega confirmada","stageType":"completion","responsibleRole":"approver","instructions":"Confirmar entrega final y conformidad.","requiresEvidence":1,"requiresApproval":1}]',
  '[]',
  '{"editable":true,"source":"intap-v1"}'
);
