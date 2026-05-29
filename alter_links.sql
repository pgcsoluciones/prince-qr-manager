-- Agregar columnas de campaña y redirección programática a short_links
ALTER TABLE short_links ADD COLUMN expires_at    DATETIME;
ALTER TABLE short_links ADD COLUMN max_scans     INTEGER;
ALTER TABLE short_links ADD COLUMN fallback_url  TEXT;
ALTER TABLE short_links ADD COLUMN redirect_mode TEXT NOT NULL DEFAULT 'direct';
ALTER TABLE short_links ADD COLUMN redirect_rules TEXT;

-- redirect_mode: 'direct' | 'weighted' | 'ab_test' | 'sequential' | 'geo' | 'device'
-- redirect_rules JSON examples:
--   weighted/ab_test: [{"url":"https://a.com","weight":60},{"url":"https://b.com","weight":40}]
--   sequential:       [{"url":"https://a.com"},{"url":"https://b.com"},{"url":"https://c.com"}]
--   geo:              [{"country":"US","url":"https://en.com"},{"country":"ES","url":"https://es.com"}]
--   device:           {"mobile":"https://m.com","tablet":"https://t.com","desktop":"https://d.com"}
