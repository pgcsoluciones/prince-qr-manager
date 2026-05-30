CREATE TABLE IF NOT EXISTS collaborators (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  position TEXT,
  department TEXT,
  email TEXT,
  phone TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES users(id)
);

ALTER TABLE trace_points ADD COLUMN responsible_id TEXT;
ALTER TABLE trace_points ADD COLUMN notify_collaborator_ids TEXT DEFAULT '[]';
