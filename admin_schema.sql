CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  status TEXT DEFAULT 'trial',     -- trial|active|past_due|cancelled|suspended
  trial_ends_at TEXT,
  current_period_start TEXT,
  current_period_end TEXT,
  billing_cycle TEXT DEFAULT 'monthly',  -- monthly|annual
  gateway TEXT,                    -- stripe|mercadopago|manual
  gateway_subscription_id TEXT,
  amount_usd REAL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admin_notifications (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  segment TEXT DEFAULT 'all',      -- all|free|starter|pro|enterprise
  channel TEXT DEFAULT 'in_app',   -- in_app|email|whatsapp
  status TEXT DEFAULT 'draft',     -- draft|sent
  sent_at TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tenant_ai_config (
  user_id TEXT PRIMARY KEY,
  llm_provider TEXT DEFAULT 'claude',  -- claude|openai|gemini|groq|llama
  llm_api_key TEXT,                    -- encrypted or null (use platform key)
  system_prompt TEXT,                  -- custom agent instructions
  weekly_report_enabled INTEGER DEFAULT 1,
  max_tokens_month INTEGER DEFAULT 50000,
  tokens_used_month INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);
