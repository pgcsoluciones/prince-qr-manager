-- TRACE module tables
CREATE TABLE IF NOT EXISTS trace_points (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  area TEXT,
  description TEXT,
  template TEXT DEFAULT 'custom',
  qr_type TEXT DEFAULT 'mixed',  -- 'checklist' | 'survey' | 'mixed'
  checklist_items TEXT DEFAULT '[]',  -- JSON array of {id, label, required}
  survey_questions TEXT DEFAULT '[]', -- JSON array of {id, label, type} type: nps|rating|text|yesno
  alert_config TEXT DEFAULT '{}',  -- JSON {email, whatsapp, threshold_minutes, nps_threshold}
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trace_responses (
  id TEXT PRIMARY KEY,
  point_id TEXT NOT NULL,
  respondent_type TEXT DEFAULT 'anonymous',  -- 'staff' | 'customer' | 'anonymous'
  user_id TEXT,  -- if staff (logged in)
  checklist_data TEXT DEFAULT '{}',  -- JSON {item_id: true/false}
  survey_data TEXT DEFAULT '{}',     -- JSON {question_id: value}
  nps_score INTEGER,
  contact_email TEXT,
  notes TEXT,
  ip TEXT,
  country TEXT,
  device TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trace_alerts (
  id TEXT PRIMARY KEY,
  point_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  alert_type TEXT NOT NULL,  -- 'overdue' | 'low_nps' | 'missed_checklist'
  message TEXT,
  is_resolved INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
