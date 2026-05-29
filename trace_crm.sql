-- TRACE CRM layer — contacts table
CREATE TABLE IF NOT EXISTS trace_contacts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email TEXT,
  name TEXT,
  phone TEXT,
  first_seen TEXT DEFAULT (datetime('now')),
  last_seen TEXT DEFAULT (datetime('now')),
  total_responses INTEGER DEFAULT 0,
  avg_nps REAL,
  tags TEXT DEFAULT '[]',  -- JSON array
  notes TEXT,
  source_point_id TEXT      -- first point they interacted with
);

CREATE INDEX IF NOT EXISTS idx_trace_contacts_user_id ON trace_contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_trace_contacts_email ON trace_contacts(email);
