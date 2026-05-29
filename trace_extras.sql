-- TRACE projects (separate from regular QR projects)
CREATE TABLE IF NOT EXISTS trace_projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#2563eb',
  created_at TEXT DEFAULT (datetime('now'))
);

-- TRACE automations
CREATE TABLE IF NOT EXISTS trace_automations (
  id TEXT PRIMARY KEY,
  point_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL, -- 'overdue_minutes' | 'low_nps' | 'missed_checklist' | 'no_response_since'
  trigger_value TEXT,         -- JSON config: {"minutes": 60} or {"threshold": 7} etc
  action_type TEXT NOT NULL,  -- 'notify_email' | 'notify_whatsapp' | 'notify_slack' | 'create_task'
  action_config TEXT,         -- JSON: {"to": "email@x.com", "message": "..."}
  message_template TEXT,      -- e.g. "No hemos recibido su reporte del ciclo reciente, presenta un atraso de {{minutes}} minutos"
  is_active INTEGER DEFAULT 1,
  last_triggered_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- TRACE custom templates (tenant-branded)
CREATE TABLE IF NOT EXISTS trace_templates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  industry TEXT,
  brand_color TEXT DEFAULT '#2563eb',
  brand_logo TEXT,
  checklist_items TEXT DEFAULT '[]',
  survey_questions TEXT DEFAULT '[]',
  is_public INTEGER DEFAULT 0,  -- shared with sub-tenants
  created_at TEXT DEFAULT (datetime('now'))
);

-- TRACE notification channels per user
CREATE TABLE IF NOT EXISTS trace_notification_channels (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  channel_type TEXT NOT NULL,  -- 'email' | 'whatsapp' | 'slack' | 'webhook'
  config TEXT NOT NULL,        -- JSON: {"email": "..."} or {"phone": "+52..."} or {"webhook_url": "..."}
  label TEXT,                  -- friendly name e.g. "Email del gerente"
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
