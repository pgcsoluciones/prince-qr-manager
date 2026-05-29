CREATE TABLE IF NOT EXISTS tenant_members (
  id TEXT PRIMARY KEY,
  tenant_owner_id TEXT NOT NULL,   -- the enterprise user who owns this tenant space
  user_id TEXT,                     -- null if invitation pending
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer', -- owner|admin|manager|operator|viewer
  status TEXT DEFAULT 'pending',    -- pending|active|revoked
  invited_at TEXT DEFAULT (datetime('now')),
  joined_at TEXT,
  invited_by TEXT
);
