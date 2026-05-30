CREATE TABLE IF NOT EXISTS tenant_profiles (
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
