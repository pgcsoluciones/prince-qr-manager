PRAGMA foreign_keys = ON;

-- KAWVO Trace V1 · Incidencias
-- Fecha límite operacional de la incidencia.
-- Migración aditiva; conserva estados, relaciones y metadata existentes.

ALTER TABLE trace_incidents ADD COLUMN due_at TEXT;

CREATE INDEX IF NOT EXISTS idx_trace_incidents_due
  ON trace_incidents(tenant_id, due_at, status);
