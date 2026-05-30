CREATE TABLE IF NOT EXISTS trace_tracking (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  tenant_id TEXT NOT NULL,
  project_id TEXT,
  title TEXT NOT NULL,
  tracking_type TEXT NOT NULL CHECK(tracking_type IN ('delivery','rental','retail','custom')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in_transit','delivered','returned','closed','cancelled')),
  item_description TEXT,
  item_code TEXT,
  origin_location TEXT,
  destination_location TEXT,
  assigned_to TEXT,
  notes TEXT,
  metadata TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS trace_tracking_events (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  tracking_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  description TEXT,
  location TEXT,
  scanned_by TEXT,
  receiver_name TEXT,
  receiver_signature TEXT,
  photo_url TEXT,
  timestamp TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (tracking_id) REFERENCES trace_tracking(id)
);
