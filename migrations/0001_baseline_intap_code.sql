PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE qr_analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL,
    country TEXT,
    city TEXT,
    device TEXT,
    user_agent TEXT,
    scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (slug) REFERENCES short_links(slug) ON DELETE CASCADE
);
CREATE TABLE plan_configs (
    plan              TEXT PRIMARY KEY,
    max_qr            INTEGER NOT NULL,
    max_tenants       INTEGER NOT NULL DEFAULT 0,
    has_analytics     INTEGER NOT NULL DEFAULT 0,
    has_bulk          INTEGER NOT NULL DEFAULT 0,
    has_custom_domain INTEGER NOT NULL DEFAULT 0,
    price_usd         REAL NOT NULL DEFAULT 0,
    updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP
, billing_cycles TEXT DEFAULT '["monthly","quarterly","semiannual","annual"]', annual_discount_pct INTEGER DEFAULT 20, quarterly_discount_pct INTEGER DEFAULT 10, semiannual_discount_pct INTEGER DEFAULT 15, features_json TEXT DEFAULT '{}', trial_days INTEGER DEFAULT 14, ai_provider TEXT NOT NULL DEFAULT 'anthropic', ai_model TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001');
CREATE TABLE users (
    id            TEXT PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'tenant' CHECK(role IN ('superadmin','enterprise','tenant')),
    plan          TEXT NOT NULL DEFAULT 'free' REFERENCES plan_configs(plan),
    enterprise_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    is_active     INTEGER NOT NULL DEFAULT 1,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
, settings TEXT DEFAULT '{}', rubro TEXT NOT NULL DEFAULT 'general');
CREATE TABLE projects (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE bulk_batches (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    total_links INTEGER DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE short_links (
    slug            TEXT PRIMARY KEY,
    destination_url TEXT NOT NULL,
    user_id         TEXT NOT NULL,
    project_id      TEXT,
    batch_id        TEXT,
    qr_style_json   TEXT,
    is_active       INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
, expires_at    DATETIME, max_scans     INTEGER, fallback_url  TEXT, redirect_mode TEXT NOT NULL DEFAULT 'direct', redirect_rules TEXT, tags TEXT DEFAULT '[]', notify_on_scan INTEGER DEFAULT 0, qr_password TEXT);
CREATE TABLE trace_points (
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
, brand_color TEXT DEFAULT '#2563eb', brand_logo TEXT, trace_project_id TEXT, scan_count INTEGER DEFAULT 0, last_scan_at TEXT, point_slug TEXT, responsible_id TEXT, notify_collaborator_ids TEXT DEFAULT '[]');
CREATE TABLE trace_responses (
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
, city TEXT, region TEXT, browser TEXT, device_type TEXT, os TEXT, time_on_page_seconds INTEGER, scan_sequence INTEGER DEFAULT 1, device_fingerprint TEXT, latitude REAL, longitude REAL, referrer TEXT, language TEXT, screen_size TEXT, referral_source TEXT, contact_name TEXT, contact_phone TEXT);
CREATE TABLE trace_alerts (
  id TEXT PRIMARY KEY,
  point_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  alert_type TEXT NOT NULL,  -- 'overdue' | 'low_nps' | 'missed_checklist'
  message TEXT,
  is_resolved INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE trace_contacts (
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
, stage TEXT DEFAULT 'nuevo', contact_name TEXT, contact_phone TEXT);
CREATE TABLE tenant_members (
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
CREATE TABLE subscriptions (
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
, payment_status TEXT DEFAULT 'active' CHECK(payment_status IN ('active','past_due','suspended','cancelled')), last_payment_at TEXT, next_billing_at TEXT, failed_attempts INTEGER DEFAULT 0, grace_period_days INTEGER DEFAULT 3);
CREATE TABLE admin_notifications (
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
CREATE TABLE tenant_ai_config (
  user_id TEXT PRIMARY KEY,
  llm_provider TEXT DEFAULT 'claude',  -- claude|openai|gemini|groq|llama
  llm_api_key TEXT,                    -- encrypted or null (use platform key)
  system_prompt TEXT,                  -- custom agent instructions
  weekly_report_enabled INTEGER DEFAULT 1,
  max_tokens_month INTEGER DEFAULT 50000,
  tokens_used_month INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
, max_tokens_per_response INTEGER DEFAULT 1000, knowledge_base TEXT);
CREATE TABLE trace_projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#2563eb',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE trace_automations (
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
CREATE TABLE trace_templates (
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
CREATE TABLE trace_notification_channels (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  channel_type TEXT NOT NULL,  -- 'email' | 'whatsapp' | 'slack' | 'webhook'
  config TEXT NOT NULL,        -- JSON: {"email": "..."} or {"phone": "+52..."} or {"webhook_url": "..."}
  label TEXT,                  -- friendly name e.g. "Email del gerente"
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE tenant_profiles (
  tenant_id TEXT PRIMARY KEY,
  company_name TEXT,
  company_address TEXT,
  company_phone TEXT,
  company_email TEXT,
  company_logo TEXT,
  brand_color TEXT DEFAULT '#2563eb',
  cover_image TEXT,
  cover_message TEXT DEFAULT '¡Gracias por tu visita!',
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE collaborators (
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
CREATE TABLE trace_tracking (
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
CREATE TABLE trace_tracking_events (
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
CREATE TABLE invoices (
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
CREATE TABLE payment_gateways (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  is_default INTEGER DEFAULT 0,
  config_json TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE platform_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
DELETE FROM sqlite_sequence;
CREATE INDEX idx_analytics_slug ON qr_analytics(slug);
CREATE INDEX idx_users_enterprise ON users(enterprise_id);
CREATE INDEX idx_users_email      ON users(email);
CREATE INDEX idx_projects_user ON projects(user_id);
CREATE INDEX idx_links_user   ON short_links(user_id);
CREATE INDEX idx_links_active ON short_links(is_active);
CREATE INDEX idx_analytics_date ON qr_analytics(scanned_at);
CREATE INDEX idx_trace_contacts_user_id ON trace_contacts(user_id);
CREATE INDEX idx_trace_contacts_email ON trace_contacts(email);
