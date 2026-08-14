-- MANUAL ROLLBACK ONLY · Preview
-- Ejecutar únicamente si 0011 debe revertirse antes de continuar.
PRAGMA foreign_keys = OFF;

DROP INDEX IF EXISTS idx_trace_events_activity;
DROP INDEX IF EXISTS idx_trace_evidences_activity;
DROP INDEX IF EXISTS idx_trace_incidents_activity;
DROP INDEX IF EXISTS idx_trace_approvals_activity;

ALTER TABLE trace_events DROP COLUMN execution_activity_id;
ALTER TABLE trace_evidences DROP COLUMN execution_activity_id;
ALTER TABLE trace_incidents DROP COLUMN execution_activity_id;
ALTER TABLE trace_approvals DROP COLUMN execution_activity_id;

DROP TABLE IF EXISTS trace_execution_activities;
DROP TABLE IF EXISTS trace_stage_activities;

PRAGMA foreign_keys = ON;
