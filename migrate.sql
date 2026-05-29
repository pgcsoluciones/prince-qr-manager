-- Migración limpia SaaS multi-tenant
-- Los 132 QRs están en KV, NO en D1 → se pueden recrear tablas sin perder datos

-- 1. Borrar tablas con schema incompatible (orden correcto por dependencias)
DROP TABLE IF EXISTS short_links;
DROP TABLE IF EXISTS bulk_batches;
DROP TABLE IF EXISTS projects;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS plan_configs;
-- qr_analytics se conserva si ya existe con datos de escaneo

-- 2. plan_configs
CREATE TABLE IF NOT EXISTS plan_configs (
    plan              TEXT PRIMARY KEY,
    max_qr            INTEGER NOT NULL,
    max_tenants       INTEGER NOT NULL DEFAULT 0,
    has_analytics     INTEGER NOT NULL DEFAULT 0,
    has_bulk          INTEGER NOT NULL DEFAULT 0,
    has_custom_domain INTEGER NOT NULL DEFAULT 0,
    price_usd         REAL NOT NULL DEFAULT 0,
    updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO plan_configs (plan, max_qr, max_tenants, has_analytics, has_bulk, has_custom_domain, price_usd) VALUES ('free',        5,  0, 0, 0, 0,  0);
INSERT INTO plan_configs (plan, max_qr, max_tenants, has_analytics, has_bulk, has_custom_domain, price_usd) VALUES ('starter',    50,  0, 1, 0, 0,  9.9);
INSERT INTO plan_configs (plan, max_qr, max_tenants, has_analytics, has_bulk, has_custom_domain, price_usd) VALUES ('pro',        500, 0, 1, 1, 1, 29.9);
INSERT INTO plan_configs (plan, max_qr, max_tenants, has_analytics, has_bulk, has_custom_domain, price_usd) VALUES ('enterprise', -1, 20, 1, 1, 1, 99.9);

-- 3. users
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'tenant' CHECK(role IN ('superadmin','enterprise','tenant')),
    plan          TEXT NOT NULL DEFAULT 'free' REFERENCES plan_configs(plan),
    enterprise_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    is_active     INTEGER NOT NULL DEFAULT 1,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_enterprise ON users(enterprise_id);
CREATE INDEX IF NOT EXISTS idx_users_email      ON users(email);

-- 4. projects
CREATE TABLE IF NOT EXISTS projects (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);

-- 5. bulk_batches
CREATE TABLE IF NOT EXISTS bulk_batches (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    total_links INTEGER DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 6. short_links (sin FK a users para no bloquear migración KV→D1)
CREATE TABLE IF NOT EXISTS short_links (
    slug            TEXT PRIMARY KEY,
    destination_url TEXT NOT NULL,
    user_id         TEXT NOT NULL,
    project_id      TEXT,
    batch_id        TEXT,
    qr_style_json   TEXT,
    is_active       INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_links_user   ON short_links(user_id);
CREATE INDEX IF NOT EXISTS idx_links_active ON short_links(is_active);

-- 7. qr_analytics (CREATE IF NOT EXISTS — conserva datos previos si existen)
CREATE TABLE IF NOT EXISTS qr_analytics (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    slug       TEXT NOT NULL,
    country    TEXT,
    city       TEXT,
    device     TEXT,
    user_agent TEXT,
    scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_analytics_slug ON qr_analytics(slug);
CREATE INDEX IF NOT EXISTS idx_analytics_date ON qr_analytics(scanned_at);
