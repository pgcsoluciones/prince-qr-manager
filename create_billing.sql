CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  tenant_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  billing_cycle TEXT NOT NULL DEFAULT 'monthly',
  amount_usd REAL NOT NULL,
  currency TEXT DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','failed','cancelled','refunded')),
  payment_method TEXT,
  payment_gateway TEXT,
  gateway_ref TEXT,
  notes TEXT,
  due_date TEXT,
  paid_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS payment_gateways (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  is_default INTEGER DEFAULT 0,
  config_json TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);

ALTER TABLE subscriptions ADD COLUMN payment_status TEXT DEFAULT 'active' CHECK(payment_status IN ('active','past_due','suspended','cancelled'));
ALTER TABLE subscriptions ADD COLUMN last_payment_at TEXT;
ALTER TABLE subscriptions ADD COLUMN next_billing_at TEXT;
ALTER TABLE subscriptions ADD COLUMN failed_attempts INTEGER DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN grace_period_days INTEGER DEFAULT 3;
