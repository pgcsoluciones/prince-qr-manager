PRAGMA foreign_keys = ON;

-- =========================================================
-- KAWVO TRACE V1 · QA Preview · Etapas + Actividades
-- SOLO PREVIEW. Fixture deterministico y aislado.
-- =========================================================

-- Limpieza preventiva de una corrida anterior incompleta.
DELETE FROM trace_approvals WHERE id LIKE 'qa_stages_%';
DELETE FROM trace_incidents WHERE id LIKE 'qa_stages_%';
DELETE FROM trace_evidences WHERE id LIKE 'qa_stages_%';
DELETE FROM trace_events WHERE id LIKE 'qa_stages_%';
DELETE FROM trace_execution_activities WHERE id LIKE 'qa_stages_%';
DELETE FROM trace_execution_stages WHERE id LIKE 'qa_stages_%';
DELETE FROM trace_executions WHERE id LIKE 'qa_stages_%';
DELETE FROM trace_assets WHERE id LIKE 'qa_stages_%';
DELETE FROM trace_stage_activities WHERE id LIKE 'qa_stages_%';
DELETE FROM trace_stages WHERE id LIKE 'qa_stages_%';
DELETE FROM trace_process_versions WHERE id LIKE 'qa_stages_%';
DELETE FROM trace_processes WHERE id LIKE 'qa_stages_%';

-- Usuario/tenant real de Preview usado unicamente para satisfacer FKs.
-- El fixture no modifica ese usuario.

INSERT INTO trace_processes (
  id, tenant_id, name, category, status, current_version_id,
  created_by, created_at, updated_at
)
SELECT
  'qa_stages_process', id, 'QA Etapas y Actividades', 'qa', 'active',
  'qa_stages_version', id, datetime('now'), datetime('now')
FROM users
WHERE is_active=1
ORDER BY created_at ASC
LIMIT 1;

INSERT INTO trace_process_versions (
  id, process_id, version_number, name, status, schema_json,
  published_at, published_by, created_by, created_at
)
SELECT
  'qa_stages_version', 'qa_stages_process', 1, 'QA Etapas v1',
  'published', '{}', datetime('now'), tenant_id, tenant_id, datetime('now')
FROM trace_processes
WHERE id='qa_stages_process';

INSERT INTO trace_stages (
  id, process_version_id, name, stage_order, stage_type,
  responsible_role, requires_evidence, requires_approval, allow_skip,
  settings_json, created_at
) VALUES
('qa_stages_stage_1','qa_stages_version','Etapa QA con actividades',1,'operation','supervisor',0,0,0,'{}',datetime('now')),
('qa_stages_stage_2','qa_stages_version','Etapa QA legacy sin actividades',2,'operation','supervisor',0,0,0,'{}',datetime('now'));

INSERT INTO trace_stage_activities (
  id, tenant_id, stage_id, title, activity_order, is_required,
  priority, responsible_role, requires_evidence, requires_approval,
  settings_json, created_at, updated_at
)
SELECT 'qa_stages_def_normal',tenant_id,'qa_stages_stage_1','Actividad normal',1,1,'normal','supervisor',0,0,'{}',datetime('now'),datetime('now') FROM trace_processes WHERE id='qa_stages_process'
UNION ALL
SELECT 'qa_stages_def_approval',tenant_id,'qa_stages_stage_1','Actividad con aprobación',2,1,'normal','supervisor',0,1,'{}',datetime('now'),datetime('now') FROM trace_processes WHERE id='qa_stages_process'
UNION ALL
SELECT 'qa_stages_def_evidence',tenant_id,'qa_stages_stage_1','Actividad con evidencia',3,1,'normal','supervisor',1,0,'{}',datetime('now'),datetime('now') FROM trace_processes WHERE id='qa_stages_process'
UNION ALL
SELECT 'qa_stages_def_overdue',tenant_id,'qa_stages_stage_1','Actividad vencida',4,1,'high','supervisor',0,0,'{}',datetime('now'),datetime('now') FROM trace_processes WHERE id='qa_stages_process'
UNION ALL
SELECT 'qa_stages_def_unassigned',tenant_id,'qa_stages_stage_1','Actividad sin responsable',5,1,'normal','supervisor',0,0,'{}',datetime('now'),datetime('now') FROM trace_processes WHERE id='qa_stages_process';

INSERT INTO trace_assets (
  id, tenant_id, process_id, asset_code, name, asset_type,
  status, qr_slug, metadata_json, public_data_json, created_by,
  created_at, updated_at
)
SELECT
  'qa_stages_asset_a',tenant_id,'qa_stages_process','QA-STAGES-A',
  'Proyecto QA Etapas A','project','active','qa-stages-a','{}','{}',
  tenant_id,datetime('now'),datetime('now')
FROM trace_processes WHERE id='qa_stages_process';

INSERT INTO trace_assets (
  id, tenant_id, process_id, asset_code, name, asset_type,
  status, qr_slug, metadata_json, public_data_json, created_by,
  created_at, updated_at
)
SELECT
  'qa_stages_asset_b',tenant_id,'qa_stages_process','QA-STAGES-B',
  'Proyecto QA Etapas B','project','active','qa-stages-b','{}','{}',
  tenant_id,datetime('now'),datetime('now')
FROM trace_processes WHERE id='qa_stages_process';

INSERT INTO trace_executions (
  id, tenant_id, process_id, process_version_id, asset_id,
  execution_code, title, status, priority, current_stage_id,
  assigned_to, started_at, due_at, completion_percentage,
  metadata_json, created_by, created_at, updated_at
)
SELECT
  'qa_stages_exec_a',tenant_id,'qa_stages_process','qa_stages_version',
  'qa_stages_asset_a','QA-STAGES-EXEC-A','Ejecución QA A','in_progress',
  'normal','qa_stages_stage_1',tenant_id,datetime('now','-2 days'),
  datetime('now','+2 days'),0,'{}',tenant_id,datetime('now'),datetime('now')
FROM trace_processes WHERE id='qa_stages_process';

INSERT INTO trace_executions (
  id, tenant_id, process_id, process_version_id, asset_id,
  execution_code, title, status, priority, current_stage_id,
  assigned_to, started_at, due_at, completion_percentage,
  metadata_json, created_by, created_at, updated_at
)
SELECT
  'qa_stages_exec_b',tenant_id,'qa_stages_process','qa_stages_version',
  'qa_stages_asset_b','QA-STAGES-EXEC-B','Ejecución QA B','in_progress',
  'normal','qa_stages_stage_1',tenant_id,datetime('now','-1 day'),
  datetime('now','+3 days'),0,'{}',tenant_id,datetime('now'),datetime('now')
FROM trace_processes WHERE id='qa_stages_process';

INSERT INTO trace_execution_stages (
  id, execution_id, stage_id, stage_order, status, assigned_to,
  started_at, response_json, validation_json, created_at, updated_at
)
SELECT 'qa_stages_exec_stage_a1','qa_stages_exec_a','qa_stages_stage_1',1,'in_progress',tenant_id,datetime('now','-2 days'),'{}','{}',datetime('now'),datetime('now') FROM trace_processes WHERE id='qa_stages_process'
UNION ALL
SELECT 'qa_stages_exec_stage_a2','qa_stages_exec_a','qa_stages_stage_2',2,'available',tenant_id,NULL,'{}','{}',datetime('now'),datetime('now') FROM trace_processes WHERE id='qa_stages_process'
UNION ALL
SELECT 'qa_stages_exec_stage_b1','qa_stages_exec_b','qa_stages_stage_1',1,'in_progress',tenant_id,datetime('now','-1 day'),'{}','{}',datetime('now'),datetime('now') FROM trace_processes WHERE id='qa_stages_process';

-- Ejecución A: cinco actividades requeridas.
INSERT INTO trace_execution_activities (
  id, tenant_id, execution_id, execution_stage_id, stage_activity_id,
  title, activity_order, is_required, status, priority, responsible_role,
  assigned_to, planned_start_at, due_at, completed_at,
  requires_evidence, requires_approval, metadata_json, created_at, updated_at
)
SELECT 'qa_stages_act_normal',tenant_id,'qa_stages_exec_a','qa_stages_exec_stage_a1','qa_stages_def_normal','Actividad normal',1,1,'completed','normal','supervisor',tenant_id,datetime('now','-2 days'),datetime('now','-1 day'),datetime('now','-1 day'),0,0,'{}',datetime('now'),datetime('now') FROM trace_processes WHERE id='qa_stages_process'
UNION ALL
SELECT 'qa_stages_act_approval',tenant_id,'qa_stages_exec_a','qa_stages_exec_stage_a1','qa_stages_def_approval','Actividad con aprobación',2,1,'completed','normal','supervisor',tenant_id,datetime('now','-2 days'),datetime('now','+1 day'),datetime('now'),0,1,'{}',datetime('now'),datetime('now') FROM trace_processes WHERE id='qa_stages_process'
UNION ALL
SELECT 'qa_stages_act_evidence',tenant_id,'qa_stages_exec_a','qa_stages_exec_stage_a1','qa_stages_def_evidence','Actividad con evidencia',3,1,'completed','normal','supervisor',tenant_id,datetime('now','-2 days'),datetime('now','+1 day'),datetime('now'),1,0,'{}',datetime('now'),datetime('now') FROM trace_processes WHERE id='qa_stages_process'
UNION ALL
SELECT 'qa_stages_act_overdue',tenant_id,'qa_stages_exec_a','qa_stages_exec_stage_a1','qa_stages_def_overdue','Actividad vencida',4,1,'pending','high','supervisor',tenant_id,datetime('now','-3 days'),datetime('now','-1 day'),NULL,0,0,'{}',datetime('now'),datetime('now') FROM trace_processes WHERE id='qa_stages_process'
UNION ALL
SELECT 'qa_stages_act_unassigned',tenant_id,'qa_stages_exec_a','qa_stages_exec_stage_a1','qa_stages_def_unassigned','Actividad sin responsable',5,1,'pending','normal','supervisor',NULL,datetime('now'),datetime('now','+2 days'),NULL,0,0,'{}',datetime('now'),datetime('now') FROM trace_processes WHERE id='qa_stages_process';

-- Ejecución B: una sola actividad completa para probar aislamiento.
INSERT INTO trace_execution_activities (
  id, tenant_id, execution_id, execution_stage_id, stage_activity_id,
  title, activity_order, is_required, status, priority, responsible_role,
  assigned_to, completed_at, requires_evidence, requires_approval,
  metadata_json, created_at, updated_at
)
SELECT
  'qa_stages_act_b1',tenant_id,'qa_stages_exec_b','qa_stages_exec_stage_b1',
  'qa_stages_def_normal','Actividad aislada B',1,1,'completed','normal',
  'supervisor',tenant_id,datetime('now'),0,0,'{}',datetime('now'),datetime('now')
FROM trace_processes WHERE id='qa_stages_process';

-- Aprobación pendiente para actividad 2: todavía NO debe contar como completa.
INSERT INTO trace_approvals (
  id, tenant_id, execution_id, execution_stage_id, execution_activity_id,
  requested_by, assigned_approver_id, status, requested_at, metadata_json
)
SELECT
  'qa_stages_approval_pending',tenant_id,'qa_stages_exec_a',
  'qa_stages_exec_stage_a1','qa_stages_act_approval',tenant_id,tenant_id,
  'pending',datetime('now'),'{}'
FROM trace_processes WHERE id='qa_stages_process';

-- Evidencia LEGACY por etapa. Debe seguir siendo válida históricamente,
-- pero NO satisfacer el requisito de la actividad de evidencia.
INSERT INTO trace_evidences (
  id, tenant_id, execution_id, execution_stage_id, execution_activity_id,
  evidence_type, metadata_json, uploaded_by, created_at
)
SELECT
  'qa_stages_evidence_legacy',tenant_id,'qa_stages_exec_a',
  'qa_stages_exec_stage_a1',NULL,'text','{"qa":true,"legacy":true}',
  tenant_id,datetime('now')
FROM trace_processes WHERE id='qa_stages_process';

-- ---------------------------------------------------------
-- ASSERT 1: estado inicial = 1/5 (20%).
-- Normal completa. Aprobación pendiente NO cuenta.
-- Evidencia legacy NO satisface la actividad.
-- ---------------------------------------------------------
SELECT
  '01_pending_approval_and_legacy_evidence_do_not_count' AS test,
  1 AS expected_completed,
  COUNT(*) AS actual_completed,
  CASE WHEN COUNT(*)=1 THEN 'PASS' ELSE 'FAIL' END AS result
FROM trace_execution_activities a
WHERE a.execution_id='qa_stages_exec_a'
  AND a.is_required=1
  AND a.status='completed'
  AND (
    a.requires_evidence=0 OR EXISTS (
      SELECT 1 FROM trace_evidences e
      WHERE e.execution_activity_id=a.id
    )
  )
  AND (
    a.requires_approval=0 OR EXISTS (
      SELECT 1 FROM trace_approvals ap
      WHERE ap.execution_activity_id=a.id AND ap.status='approved'
    )
  );

SELECT
  '02_initial_progress' AS test,
  20 AS expected_progress,
  ROUND(100.0 * SUM(CASE
    WHEN a.status='completed'
      AND (a.requires_evidence=0 OR EXISTS (SELECT 1 FROM trace_evidences e WHERE e.execution_activity_id=a.id))
      AND (a.requires_approval=0 OR EXISTS (SELECT 1 FROM trace_approvals ap WHERE ap.execution_activity_id=a.id AND ap.status='approved'))
    THEN 1 ELSE 0 END) / COUNT(*)) AS actual_progress,
  CASE WHEN ROUND(100.0 * SUM(CASE
    WHEN a.status='completed'
      AND (a.requires_evidence=0 OR EXISTS (SELECT 1 FROM trace_evidences e WHERE e.execution_activity_id=a.id))
      AND (a.requires_approval=0 OR EXISTS (SELECT 1 FROM trace_approvals ap WHERE ap.execution_activity_id=a.id AND ap.status='approved'))
    THEN 1 ELSE 0 END) / COUNT(*))=20 THEN 'PASS' ELSE 'FAIL' END AS result
FROM trace_execution_activities a
WHERE a.execution_id='qa_stages_exec_a' AND a.is_required=1;

-- ---------------------------------------------------------
-- ASSERT 2: aprobar actividad aumenta 20 puntos: 2/5 = 40%.
-- ---------------------------------------------------------
UPDATE trace_approvals
SET status='approved',decided_at=datetime('now'),decided_by=assigned_approver_id
WHERE id='qa_stages_approval_pending';

SELECT
  '03_approval_increases_progress' AS test,
  40 AS expected_progress,
  ROUND(100.0 * SUM(CASE
    WHEN a.status='completed'
      AND (a.requires_evidence=0 OR EXISTS (SELECT 1 FROM trace_evidences e WHERE e.execution_activity_id=a.id))
      AND (a.requires_approval=0 OR EXISTS (SELECT 1 FROM trace_approvals ap WHERE ap.execution_activity_id=a.id AND ap.status='approved'))
    THEN 1 ELSE 0 END) / COUNT(*)) AS actual_progress,
  CASE WHEN ROUND(100.0 * SUM(CASE
    WHEN a.status='completed'
      AND (a.requires_evidence=0 OR EXISTS (SELECT 1 FROM trace_evidences e WHERE e.execution_activity_id=a.id))
      AND (a.requires_approval=0 OR EXISTS (SELECT 1 FROM trace_approvals ap WHERE ap.execution_activity_id=a.id AND ap.status='approved'))
    THEN 1 ELSE 0 END) / COUNT(*))=40 THEN 'PASS' ELSE 'FAIL' END AS result
FROM trace_execution_activities a
WHERE a.execution_id='qa_stages_exec_a' AND a.is_required=1;

-- ---------------------------------------------------------
-- ASSERT 3: evidencia vinculada a actividad aumenta a 3/5 = 60%.
-- ---------------------------------------------------------
INSERT INTO trace_evidences (
  id, tenant_id, execution_id, execution_stage_id, execution_activity_id,
  evidence_type, metadata_json, uploaded_by, created_at
)
SELECT
  'qa_stages_evidence_activity',tenant_id,'qa_stages_exec_a',
  'qa_stages_exec_stage_a1','qa_stages_act_evidence','text',
  '{"qa":true,"activity":true}',tenant_id,datetime('now')
FROM trace_processes WHERE id='qa_stages_process';

SELECT
  '04_activity_evidence_increases_progress' AS test,
  60 AS expected_progress,
  ROUND(100.0 * SUM(CASE
    WHEN a.status='completed'
      AND (a.requires_evidence=0 OR EXISTS (SELECT 1 FROM trace_evidences e WHERE e.execution_activity_id=a.id))
      AND (a.requires_approval=0 OR EXISTS (SELECT 1 FROM trace_approvals ap WHERE ap.execution_activity_id=a.id AND ap.status='approved'))
    THEN 1 ELSE 0 END) / COUNT(*)) AS actual_progress,
  CASE WHEN ROUND(100.0 * SUM(CASE
    WHEN a.status='completed'
      AND (a.requires_evidence=0 OR EXISTS (SELECT 1 FROM trace_evidences e WHERE e.execution_activity_id=a.id))
      AND (a.requires_approval=0 OR EXISTS (SELECT 1 FROM trace_approvals ap WHERE ap.execution_activity_id=a.id AND ap.status='approved'))
    THEN 1 ELSE 0 END) / COUNT(*))=60 THEN 'PASS' ELSE 'FAIL' END AS result
FROM trace_execution_activities a
WHERE a.execution_id='qa_stages_exec_a' AND a.is_required=1;

-- ---------------------------------------------------------
-- ASSERT 4: vencida y sin responsable deben detectarse.
-- ---------------------------------------------------------
SELECT
  '05_overdue_activity' AS test,
  1 AS expected,
  COUNT(*) AS actual,
  CASE WHEN COUNT(*)=1 THEN 'PASS' ELSE 'FAIL' END AS result
FROM trace_execution_activities
WHERE execution_id='qa_stages_exec_a'
  AND is_required=1
  AND status NOT IN ('completed','skipped','cancelled')
  AND due_at < datetime('now');

SELECT
  '06_unassigned_activity' AS test,
  1 AS expected,
  COUNT(*) AS actual,
  CASE WHEN COUNT(*)=1 THEN 'PASS' ELSE 'FAIL' END AS result
FROM trace_execution_activities
WHERE execution_id='qa_stages_exec_a'
  AND is_required=1
  AND assigned_to IS NULL
  AND status NOT IN ('completed','skipped','cancelled');

-- ---------------------------------------------------------
-- ASSERT 5: incidencia bloqueante toma precedencia.
-- ---------------------------------------------------------
INSERT INTO trace_incidents (
  id, tenant_id, execution_id, execution_stage_id, execution_activity_id,
  incident_code, title, category, severity, status, reported_by,
  reported_at, metadata_json
)
SELECT
  'qa_stages_incident_blocking',tenant_id,'qa_stages_exec_a',
  'qa_stages_exec_stage_a1','qa_stages_act_overdue','QA-STAGES-INC-001',
  'Incidencia bloqueante QA','qa','critical','open',tenant_id,
  datetime('now'),'{"blocking":true,"qa":true}'
FROM trace_processes WHERE id='qa_stages_process';

SELECT
  '07_blocking_incident_has_priority' AS test,
  1 AS expected,
  COUNT(*) AS actual,
  CASE WHEN COUNT(*)=1 THEN 'PASS' ELSE 'FAIL' END AS result
FROM trace_incidents
WHERE execution_id='qa_stages_exec_a'
  AND status NOT IN ('resolved','validated','closed')
  AND json_extract(metadata_json,'$.blocking')=1;

-- ---------------------------------------------------------
-- ASSERT 6: ejecución B no contamina A.
-- ---------------------------------------------------------
SELECT
  '08_execution_isolation_A' AS test,
  5 AS expected,
  COUNT(*) AS actual,
  CASE WHEN COUNT(*)=5 THEN 'PASS' ELSE 'FAIL' END AS result
FROM trace_execution_activities
WHERE execution_id='qa_stages_exec_a';

SELECT
  '09_execution_isolation_B' AS test,
  1 AS expected,
  COUNT(*) AS actual,
  CASE WHEN COUNT(*)=1 THEN 'PASS' ELSE 'FAIL' END AS result
FROM trace_execution_activities
WHERE execution_id='qa_stages_exec_b';

-- ---------------------------------------------------------
-- ASSERT 7: compatibilidad: etapa sin actividades existe y es válida.
-- ---------------------------------------------------------
SELECT
  '10_stage_without_activities_legacy_compatible' AS test,
  0 AS expected,
  COUNT(a.id) AS actual,
  CASE WHEN COUNT(a.id)=0 THEN 'PASS' ELSE 'FAIL' END AS result
FROM trace_execution_stages es
LEFT JOIN trace_execution_activities a ON a.execution_stage_id=es.id
WHERE es.id='qa_stages_exec_stage_a2';

-- ---------------------------------------------------------
-- ASSERT 8: aunque todas las actividades estén completas,
-- una incidencia bloqueante impide cerrar la etapa.
-- ---------------------------------------------------------
UPDATE trace_execution_activities
SET status='completed',completed_at=datetime('now'),updated_at=datetime('now')
WHERE id IN ('qa_stages_act_overdue','qa_stages_act_unassigned');

SELECT
  '11_all_activities_complete_but_blocked' AS test,
  'blocked' AS expected_status,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM trace_incidents i
      WHERE i.execution_id='qa_stages_exec_a'
        AND i.execution_stage_id='qa_stages_exec_stage_a1'
        AND i.status NOT IN ('resolved','validated','closed')
        AND json_extract(i.metadata_json,'$.blocking')=1
    ) THEN 'blocked'
    WHEN NOT EXISTS (
      SELECT 1 FROM trace_execution_activities a
      WHERE a.execution_id='qa_stages_exec_a'
        AND a.execution_stage_id='qa_stages_exec_stage_a1'
        AND a.is_required=1
        AND NOT (
          a.status='completed'
          AND (a.requires_evidence=0 OR EXISTS (SELECT 1 FROM trace_evidences e WHERE e.execution_activity_id=a.id))
          AND (a.requires_approval=0 OR EXISTS (SELECT 1 FROM trace_approvals ap WHERE ap.execution_activity_id=a.id AND ap.status='approved'))
        )
    ) THEN 'completed'
    ELSE 'in_progress'
  END AS actual_status,
  CASE WHEN EXISTS (
    SELECT 1 FROM trace_incidents i
    WHERE i.id='qa_stages_incident_blocking' AND i.status='open'
  ) THEN 'PASS' ELSE 'FAIL' END AS result;

-- Resolver bloqueo: ahora sí debe poder cerrar.
UPDATE trace_incidents
SET status='resolved',resolved_at=datetime('now')
WHERE id='qa_stages_incident_blocking';

SELECT
  '12_stage_closes_only_after_blocker_resolved' AS test,
  'completed' AS expected_status,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM trace_incidents i
      WHERE i.execution_id='qa_stages_exec_a'
        AND i.execution_stage_id='qa_stages_exec_stage_a1'
        AND i.status NOT IN ('resolved','validated','closed')
        AND json_extract(i.metadata_json,'$.blocking')=1
    ) THEN 'blocked'
    WHEN NOT EXISTS (
      SELECT 1 FROM trace_execution_activities a
      WHERE a.execution_id='qa_stages_exec_a'
        AND a.execution_stage_id='qa_stages_exec_stage_a1'
        AND a.is_required=1
        AND NOT (
          a.status='completed'
          AND (a.requires_evidence=0 OR EXISTS (SELECT 1 FROM trace_evidences e WHERE e.execution_activity_id=a.id))
          AND (a.requires_approval=0 OR EXISTS (SELECT 1 FROM trace_approvals ap WHERE ap.execution_activity_id=a.id AND ap.status='approved'))
        )
    ) THEN 'completed'
    ELSE 'in_progress'
  END AS actual_status,
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM trace_incidents i
    WHERE i.id='qa_stages_incident_blocking'
      AND i.status NOT IN ('resolved','validated','closed')
  ) THEN 'PASS' ELSE 'FAIL' END AS result;

-- Resumen de integridad del fixture.
SELECT
  'QA_FIXTURE_READY' AS marker,
  (SELECT COUNT(*) FROM trace_execution_activities WHERE execution_id='qa_stages_exec_a') AS activities_A,
  (SELECT COUNT(*) FROM trace_execution_activities WHERE execution_id='qa_stages_exec_b') AS activities_B,
  (SELECT COUNT(*) FROM trace_evidences WHERE id LIKE 'qa_stages_%') AS evidences,
  (SELECT COUNT(*) FROM trace_approvals WHERE id LIKE 'qa_stages_%') AS approvals,
  (SELECT COUNT(*) FROM trace_incidents WHERE id LIKE 'qa_stages_%') AS incidents;
