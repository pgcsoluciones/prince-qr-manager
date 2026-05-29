-- Tabla de Usuarios con roles SaaS
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, -- UUID de usuario
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('superadmin', 'enterprise', 'tenant')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabla para rastrear la carga por lotes de empresas
CREATE TABLE IF NOT EXISTS bulk_batches (
    id TEXT PRIMARY KEY, -- UUID de lote
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    total_links INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Enlaces cortos (con soporte para estilo de QR dinámico y lotes)
CREATE TABLE IF NOT EXISTS short_links (
    slug TEXT PRIMARY KEY,
    destination_url TEXT NOT NULL,
    user_id TEXT NOT NULL,
    batch_id TEXT, -- Opcional, si pertenece a un lote
    qr_style_json TEXT, -- Opciones de personalización visual (colores, logo, etc.)
    is_active INTEGER DEFAULT 1 CHECK(is_active IN (0, 1)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (batch_id) REFERENCES bulk_batches(id) ON DELETE SET NULL
);

-- Analíticas de escaneo de QRs (inserciones optimizadas de forma diferida)
CREATE TABLE IF NOT EXISTS qr_analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL,
    country TEXT,
    city TEXT,
    device TEXT,
    user_agent TEXT,
    scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (slug) REFERENCES short_links(slug) ON DELETE CASCADE
);

-- Índice para mejorar el rendimiento de consultas analíticas
CREATE INDEX IF NOT EXISTS idx_analytics_slug ON qr_analytics(slug);
