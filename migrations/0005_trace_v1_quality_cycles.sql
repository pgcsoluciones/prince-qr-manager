PRAGMA foreign_keys = ON;

-- =========================================================
-- INTAP TRACE V1
-- Incidencias, ciclos de corrección y aprobación operacional
-- =========================================================

CREATE TABLE IF NOT EXISTS trace_correction_cycles (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  incident_id TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  execution_stage_id TEXT,
  cycle_number INTEGER NOT NULL CHECK(cycle_number > 0),
  assigned_to TEXT NOT NULL,
  requested_by TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN (
      'pending',
      'in_progress',
      'submitted',
      'accepted',
      'rejected',
      'cancelled'
    )),
  request_notes TEXT,
  response_notes TEXT,
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  submitted_at TEXT,
  reviewed_at TEXT,
  reviewed_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (tenant_id) REFERENCES users(id),
  FOREIGN KEY (incident_id)
    REFERENCES trace_incidents(id)
    ON DELETE CASCADE,
  FOREIGN KEY (execution_id)
    REFERENCES trace_executions(id)
    ON DELETE CASCADE,
  FOREIGN KEY (execution_stage_id)
    REFERENCES trace_execution_stages(id),
  FOREIGN KEY (assigned_to) REFERENCES users(id),
  FOREIGN KEY (requested_by) REFERENCES users(id),
  FOREIGN KEY (reviewed_by) REFERENCES users(id),

  UNIQUE(incident_id, cycle_number)
);

CREATE INDEX IF NOT EXISTS idx_trace_correction_cycles_incident
  ON trace_correction_cycles(incident_id, cycle_number);

CREATE INDEX IF NOT EXISTS idx_trace_correction_cycles_assigned
  ON trace_correction_cycles(assigned_to, status);

CREATE INDEX IF NOT EXISTS idx_trace_correction_cycles_execution
  ON trace_correction_cycles(execution_id, status);

-- Un solo ciclo abierto por incidencia. Permite ciclos sucesivos una vez
-- aceptado/rechazado/cancelado el anterior.
CREATE UNIQUE INDEX IF NOT EXISTS idx_trace_correction_cycles_open
ON trace_correction_cycles(incident_id)
WHERE status IN ('pending','in_progress','submitted');

-- Una etapa no debe acumular más de una aprobación pendiente simultánea.
CREATE UNIQUE INDEX IF NOT EXISTS idx_trace_approvals_pending_stage
ON trace_approvals(execution_stage_id)
WHERE status = 'pending';
