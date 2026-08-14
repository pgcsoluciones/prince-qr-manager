PRAGMA foreign_keys = ON;

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

SELECT
  'QA_CLEANUP' AS marker,
  (SELECT COUNT(*) FROM trace_processes WHERE id LIKE 'qa_stages_%') AS processes,
  (SELECT COUNT(*) FROM trace_executions WHERE id LIKE 'qa_stages_%') AS executions,
  (SELECT COUNT(*) FROM trace_execution_activities WHERE id LIKE 'qa_stages_%') AS activities,
  (SELECT COUNT(*) FROM trace_evidences WHERE id LIKE 'qa_stages_%') AS evidences,
  (SELECT COUNT(*) FROM trace_approvals WHERE id LIKE 'qa_stages_%') AS approvals,
  (SELECT COUNT(*) FROM trace_incidents WHERE id LIKE 'qa_stages_%') AS incidents;
