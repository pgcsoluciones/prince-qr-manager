# Intap Code — Contexto del Proyecto

## 🎯 Descripción
**Intap Code** es un SaaS de códigos QR dinámicos construido 100% sobre el ecosistema Cloudflare.
Inspirado en Hovercode y QRCodeKit, orientado al mercado dominicano y latinoamericano.

---

## 🌐 Dominios de Producción
| Dominio | Función |
|---|---|
| `code.intaprd.com` | Frontend SaaS (login, dashboard, admin) |
| `api.code.intaprd.com` | Worker API backend |
| `qr.intaprd.com/:slug` | Redirecciones públicas QR nuevos |
| `qr.grupoprince.com/:slug` | Redirecciones legacy — NO TOCAR |

---

## 🏗️ Stack Técnico
- **Backend:** Cloudflare Workers (`src/index.js`)
- **Base de datos:** Cloudflare D1 (`prince-qr-db`)
- **Caché/Storage:** Cloudflare KV (dos namespaces)
- **Frontend:** React + Vite + Tailwind (en desarrollo)
- **Deploy:** Cloudflare Pages (`prince-qr-frontend`)
- **Repo:** `github.com/pgcsoluciones/prince-qr-manager`

---

## 🗄️ Base de Datos D1 — `prince-qr-db`
**ID:** `90c45dd2-374a-4d09-9bb6-e078214c49d3`

### Tablas activas:
- `users` — id, email, password_hash, role, plan, company_name, is_active
- `plan_configs` — límites editables por plan
- `short_links` — slug, destination_url, user_id, project, is_active, batch_id, qr_style_json
- `bulk_batches` — lotes de carga masiva
- `qr_analytics` — escaneos diferidos (slug, country, city, device, user_agent)

---

## 🔑 KV Namespaces
| Binding | ID | Función |
|---|---|---|
| `QR_LINKS` | `326ce74a62124ba08f68d864f33c79d7` | Fuente de verdad de enlaces |
| `QR_CACHE` | `4a000cd623034898ae4cf2ee1248af8a` | Caché de redirecciones TTL 1h |

### Estructura de un registro en QR_LINKS:
```json
{
  "url": "https://destino.com",
  "project": "General",
  "is_active": true,
  "user_id": "usr-xxx",
  "date": "2026-05-29T00:00:00.000Z",
  "updated_at": "2026-05-29T00:00:00.000Z"
}
```

### Claves internas (ignorar en listados):
- `__admin_config__` — `{"password":"..."}` 
- `__projects_list__` — lista global de proyectos
- `__projects_{user_id}__` — proyectos por usuario

---

## 👤 Usuarios en D1
| Email | Rol | Plan | Contraseña |
|---|---|---|---|
| `fliaprince@gmail.com` | superadmin | enterprise | `Mireina1908.` |
| `juanluis@prince.com` | enterprise | free | (prueba) |

---

## 💰 Planes en `plan_configs`
| Plan | QRs | Scans/mes | Proyectos | Equipo | Bulk | Analytics | $/mes |
|---|---|---|---|---|---|---|---|
| free | 3 | 100 | 1 | 1 | ❌ | básico | $0 |
| starter | 50 | 5,000 | 5 | 1 | ❌ | avanzado | $9 |
| pro | 300 | ilimitado | ilimitado | 3 | ✅ | avanzado | $25 |
| enterprise | ilimitado | ilimitado | ilimitado | 10 | ✅ | premium | $69 |

> ⚙️ Los límites son editables desde el panel SuperAdmin sin redeploy.

---

## ⚙️ Worker — `src/index.js`
**Worker name:** `prince-qr-manager-backend`
**URL:** `prince-qr-manager-backend.fliaprince.workers.dev`

### Dependencias npm:
- `@tsndr/cloudflare-worker-jwt` — firma y verificación JWT
- `bcryptjs` — hash de contraseñas

### `wrangler.toml` configuración:
```toml
name = "prince-qr-manager-backend"
main = "src/index.js"
compatibility_date = "2024-05-01"
compatibility_flags = ["nodejs_compat"]

[[kv_namespaces]]
binding = "QR_CACHE"
id = "4a000cd623034898ae4cf2ee1248af8a"

[[kv_namespaces]]
binding = "QR_LINKS"
id = "326ce74a62124ba08f68d864f33c79d7"

[[d1_databases]]
binding = "DB"
database_name = "prince-qr-db"
database_id = "90c45dd2-374a-4d09-9bb6-e078214c49d3"
```

### Secrets en Cloudflare:
- `JWT_SECRET` — configurado ✅

### Endpoints implementados:
```
POST   /api/auth/register       — registro con bcrypt + JWT
POST   /api/auth/login          — login, devuelve JWT con rol y plan
GET    /api/auth/me             — perfil + conteo QRs del usuario

GET    /api/plans               — planes públicos (sin auth)

GET    /api/links               — listar QRs (tenant ve los suyos, admin ve todos)
POST   /api/links               — crear QR (valida límite por plan)
DELETE /api/links               — borrar QR (valida propiedad)
POST   /api/links/toggle        — activar/desactivar QR

GET    /api/projects            — carpetas del usuario
POST   /api/projects            — guardar carpetas

POST   /api/bulk/upload         — carga masiva CSV (Pro/Enterprise)

GET    /api/analytics/summary   — métricas por slug

GET    /api/admin/users         — lista usuarios (superadmin)
PUT    /api/admin/users/:id     — editar usuario (superadmin)
PUT    /api/admin/plans/:plan   — editar límites de plan (superadmin)
```

### Lógica de redirección:
```
/:slug → busca en QR_CACHE → si miss, busca en QR_LINKS → redirige 302 → registra analítica en D1
```

---

## 🎨 Frontend — Estado actual
- **Rama de Claude Code:** `claude/epic-gates-s5IVv`
- **Pages:** `prince-qr-frontend` → `code.intaprd.com`
- **Framework:** React 18 + Vite + Tailwind

### Pantallas a construir:
| Pantalla | Acceso |
|---|---|
| Login / Registro | Público |
| Dashboard — Mis QRs (CRUD + toggle + descarga PNG) | Todos |
| Generador QR (PNG, SVG, PDF + personalización) | Todos |
| Analíticas por slug | Starter+ |
| Proyectos / Carpetas | Todos |
| Bulk Upload CSV | Pro+ |
| Panel SuperAdmin — Usuarios | SuperAdmin |
| Panel SuperAdmin — Planes (editar límites) | SuperAdmin |
| Panel SuperAdmin — Estadísticas globales | SuperAdmin |

---

## 🚨 Pendientes críticos
1. **Deploy del Worker con auth JWT** — hacer `npx wrangler deploy` desde `~/Desktop/intap-code` para activar bcrypt y JWT en producción
2. **Frontend React** — continuar construcción en rama `claude/epic-gates-s5IVv`
3. **URL del QR generado** — usar `https://qr.intaprd.com/{slug}` para QRs nuevos

---

## 📁 Estructura del repo
```
intap-code/
├── src/
│   └── index.js          ← Worker backend (JWT auth + endpoints)
├── frontend/             ← React + Vite (en desarrollo por Claude Code)
├── schema.sql            ← Schema D1 completo
├── wrangler.toml         ← Config Cloudflare
├── package.json          ← bcryptjs + cloudflare-worker-jwt
└── CONTEXT.md            ← Este archivo
```

---

## 🏢 Empresa
**PGC Soluciones** — Juan Luis
GitHub: `pgcsoluciones`
Dominio principal: `grupoprince.com` / `intaprd.com`
