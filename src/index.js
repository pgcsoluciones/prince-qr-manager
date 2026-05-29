/**
 * prince-qr-manager-backend — SaaS QR dinámico
 * Stack: Cloudflare Workers + D1 + KV
 * Roles: superadmin | enterprise | tenant
 */

import jwt from "@tsndr/cloudflare-worker-jwt";
import bcrypt from "bcryptjs";

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function uuid() { return crypto.randomUUID(); }

function deviceType(ua = "") {
  const u = ua.toLowerCase();
  if (u.includes("mobi") || u.includes("android") || u.includes("iphone")) return "mobile";
  if (u.includes("tablet") || u.includes("ipad")) return "tablet";
  return "desktop";
}

// ──────────────────────────────────────────────
// Redirect logic (programmatic)
// ──────────────────────────────────────────────

async function resolveDestination(link, scanCount, country, device) {
  const mode  = link.redirect_mode || "direct";
  const rules = link.redirect_rules ? JSON.parse(link.redirect_rules) : null;

  switch (mode) {
    case "weighted":
    case "ab_test": {
      if (!Array.isArray(rules) || rules.length === 0) return link.destination_url;
      const total = rules.reduce((s, r) => s + (r.weight || 1), 0);
      let rand = Math.random() * total;
      for (const rule of rules) {
        rand -= (rule.weight || 1);
        if (rand <= 0) return rule.url;
      }
      return rules[rules.length - 1].url;
    }
    case "sequential": {
      if (!Array.isArray(rules) || rules.length === 0) return link.destination_url;
      return rules[scanCount % rules.length].url;
    }
    case "geo": {
      if (!Array.isArray(rules)) return link.destination_url;
      const match = rules.find((r) => r.country?.toUpperCase() === country?.toUpperCase());
      return match?.url || link.destination_url;
    }
    case "device": {
      if (!rules) return link.destination_url;
      return rules[device] || link.destination_url;
    }
    default:
      return link.destination_url;
  }
}

// ──────────────────────────────────────────────
// JWT helpers
// ──────────────────────────────────────────────

async function signToken(payload, secret) {
  return jwt.sign({ ...payload, iat: Math.floor(Date.now() / 1000) }, secret, { algorithm: "HS256" });
}

async function verifyToken(token, secret) {
  const ok = await jwt.verify(token, secret, { algorithm: "HS256" });
  if (!ok) return null;
  return jwt.decode(token).payload;
}

async function getUser(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.replace("Bearer ", "").trim();
  if (!token) return null;
  const secret = env.JWT_SECRET || "changeme-set-in-cloudflare-dashboard";
  return verifyToken(token, secret);
}

function requireAuth(user, ...roles) {
  if (!user) return json({ ok: false, error: "No autenticado" }, 401);
  if (roles.length && !roles.includes(user.role)) {
    return json({ ok: false, error: "Acceso denegado" }, 403);
  }
  return null;
}

// ──────────────────────────────────────────────
// Plan helpers
// ──────────────────────────────────────────────

async function getPlan(db, plan) {
  return db.prepare("SELECT * FROM plan_configs WHERE plan = ?").bind(plan).first();
}

async function countUserLinks(db, userId) {
  const r = await db.prepare("SELECT COUNT(*) as c FROM short_links WHERE user_id = ?").bind(userId).first();
  return r?.c ?? 0;
}

// Feature gates por plan
const PLAN_FEATURES = {
  free:       { redirect_modes: ["direct"],                           expiration: false, max_scans: false },
  starter:    { redirect_modes: ["direct"],                           expiration: true,  max_scans: false },
  pro:        { redirect_modes: ["direct","weighted","ab_test","geo","device"], expiration: true, max_scans: true },
  enterprise: { redirect_modes: ["direct","weighted","ab_test","geo","device","sequential"], expiration: true, max_scans: true },
};

function canUseFeature(plan, feature, value) {
  const f = PLAN_FEATURES[plan] || PLAN_FEATURES.free;
  if (feature === "redirect_mode") return f.redirect_modes.includes(value);
  return f[feature] === true;
}

// ──────────────────────────────────────────────
// Analytics
// ──────────────────────────────────────────────

async function saveAnalytics(db, slug, country, city, device, ua) {
  try {
    await db.prepare(
      "INSERT INTO qr_analytics (slug, country, city, device, user_agent) VALUES (?,?,?,?,?)"
    ).bind(slug, country, city, device, ua).run();
  } catch (_) {}
}

// ──────────────────────────────────────────────
// Main handler
// ──────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method;

    if (method === "OPTIONS") return new Response(null, { headers: CORS });

    const JWT_SECRET = env.JWT_SECRET || "changeme-set-in-cloudflare-dashboard";

    try {
      // ══════════════════════════════════════════
      // REDIRECCIÓN PÚBLICA /:slug
      // ══════════════════════════════════════════
      if (!path.startsWith("/api") && path !== "/" && path.length > 1) {
        const slug   = path.slice(1).trim().toLowerCase();
        const cf     = request.cf || {};
        const country = cf.country || "unknown";
        const city    = cf.city    || "unknown";
        const ua      = request.headers.get("user-agent") || "";
        const device  = deviceType(ua);

        // Fast cache para direct links
        let cached = await env.QR_CACHE.get(slug);
        if (cached === "INACTIVE") return new Response("Enlace inactivo", { status: 404 });
        if (cached === "EXPIRED")  return new Response("Enlace expirado", { status: 410 });

        // Buscar en D1
        let link = await env.DB.prepare(
          "SELECT *, (SELECT COUNT(*) FROM qr_analytics WHERE slug=short_links.slug) as scan_count FROM short_links WHERE slug=?"
        ).bind(slug).first();

        // Fallback KV legacy
        if (!link) {
          const raw = await env.QR_LINKS.get(slug);
          if (!raw) return new Response("Enlace no encontrado", { status: 404 });
          let dest;
          try {
            const rec = JSON.parse(raw);
            if (rec.is_active === false) return new Response("Enlace inactivo", { status: 404 });
            dest = rec.url || raw;
          } catch { dest = raw; }
          ctx.waitUntil(Promise.all([
            env.QR_CACHE.put(slug, dest, { expirationTtl: 3600 }),
            saveAnalytics(env.DB, slug, country, city, device, ua),
          ]));
          return Response.redirect(dest, 302);
        }

        // Verificar estado activo
        if (!link.is_active) {
          ctx.waitUntil(env.QR_CACHE.put(slug, "INACTIVE", { expirationTtl: 3600 }));
          return new Response("Enlace inactivo", { status: 404 });
        }

        // Verificar expiración por fecha
        if (link.expires_at && new Date(link.expires_at) < new Date()) {
          ctx.waitUntil(env.QR_CACHE.put(slug, "EXPIRED", { expirationTtl: 3600 }));
          if (link.fallback_url) return Response.redirect(link.fallback_url, 302);
          return new Response("Enlace expirado", { status: 410 });
        }

        // Verificar expiración por escaneos
        if (link.max_scans && link.scan_count >= link.max_scans) {
          ctx.waitUntil(env.QR_CACHE.put(slug, "EXPIRED", { expirationTtl: 3600 }));
          if (link.fallback_url) return Response.redirect(link.fallback_url, 302);
          return new Response("Límite de escaneos alcanzado", { status: 410 });
        }

        // Resolver destino según modo
        const destination = await resolveDestination(link, link.scan_count || 0, country, device);

        // Cache solo si es direct (los otros modos varían)
        if (!link.redirect_mode || link.redirect_mode === "direct") {
          ctx.waitUntil(env.QR_CACHE.put(slug, destination, { expirationTtl: 3600 }));
        }

        ctx.waitUntil(saveAnalytics(env.DB, slug, country, city, device, ua));
        return Response.redirect(destination, 302);
      }

      // ══════════════════════════════════════════
      // POST /api/auth/register
      // ══════════════════════════════════════════
      if (path === "/api/auth/register" && method === "POST") {
        const { email, password, role = "tenant", enterprise_id } = await request.json();
        if (!email || !password) return json({ ok: false, error: "Email y contraseña requeridos" }, 400);
        if (password.length < 6) return json({ ok: false, error: "Contraseña mínima 6 caracteres" }, 400);
        if (!["superadmin","enterprise","tenant"].includes(role)) return json({ ok: false, error: "Rol inválido" }, 400);

        const existing = await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email.toLowerCase()).first();
        if (existing) return json({ ok: false, error: "Email ya registrado" }, 409);

        if (role === "superadmin") {
          const u = await getUser(request, env);
          const err = requireAuth(u, "superadmin");
          if (err) return err;
        }

        const hash = await bcrypt.hash(password, 10);
        const id   = uuid();
        const plan = role === "enterprise" || role === "superadmin" ? "enterprise" : "free";

        await env.DB.prepare(
          "INSERT INTO users (id, email, password_hash, role, plan, enterprise_id) VALUES (?,?,?,?,?,?)"
        ).bind(id, email.toLowerCase(), hash, role, plan, enterprise_id || null).run();

        const token = await signToken({ sub: id, email: email.toLowerCase(), role, plan }, JWT_SECRET);
        return json({ ok: true, token, user: { id, email, role, plan } }, 201);
      }

      // ══════════════════════════════════════════
      // POST /api/auth/login
      // ══════════════════════════════════════════
      if (path === "/api/auth/login" && method === "POST") {
        const { email, password } = await request.json();
        if (!email || !password) return json({ ok: false, error: "Email y contraseña requeridos" }, 400);

        const user = await env.DB.prepare(
          "SELECT id, email, password_hash, role, plan, is_active FROM users WHERE email=?"
        ).bind(email.toLowerCase()).first();

        if (!user || !user.is_active) return json({ ok: false, error: "Credenciales inválidas" }, 401);

        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) return json({ ok: false, error: "Credenciales inválidas" }, 401);

        const token = await signToken(
          { sub: user.id, email: user.email, role: user.role, plan: user.plan },
          JWT_SECRET
        );
        return json({ ok: true, token, user: { id: user.id, email: user.email, role: user.role, plan: user.plan } });
      }

      // ══════════════════════════════════════════
      // POST /api/auth/change-password
      // ══════════════════════════════════════════
      if (path === "/api/auth/change-password" && method === "POST") {
        const user = await getUser(request, env);
        const err  = requireAuth(user);
        if (err) return err;

        const { current_password, new_password } = await request.json();
        if (!current_password || !new_password) return json({ ok: false, error: "Faltan campos" }, 400);
        if (new_password.length < 6) return json({ ok: false, error: "Contraseña mínima 6 caracteres" }, 400);

        const dbUser = await env.DB.prepare("SELECT password_hash FROM users WHERE id=?").bind(user.sub).first();
        if (!dbUser) return json({ ok: false, error: "Usuario no encontrado" }, 404);

        const ok = await bcrypt.compare(current_password, dbUser.password_hash);
        if (!ok) return json({ ok: false, error: "Contraseña actual incorrecta" }, 401);

        const hash = await bcrypt.hash(new_password, 10);
        await env.DB.prepare("UPDATE users SET password_hash=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(hash, user.sub).run();
        return json({ ok: true });
      }

      // ══════════════════════════════════════════
      // GET /api/auth/me
      // ══════════════════════════════════════════
      if (path === "/api/auth/me" && method === "GET") {
        const user = await getUser(request, env);
        const err  = requireAuth(user);
        if (err) return err;
        const dbUser = await env.DB.prepare(
          "SELECT id, email, role, plan, enterprise_id, is_active, created_at FROM users WHERE id=?"
        ).bind(user.sub).first();
        if (!dbUser) return json({ ok: false, error: "Usuario no encontrado" }, 404);
        return json({ ok: true, user: dbUser });
      }

      // ══════════════════════════════════════════
      // GET /api/plan-features — features del plan actual
      // ══════════════════════════════════════════
      if (path === "/api/plan-features" && method === "GET") {
        const user = await getUser(request, env);
        const err  = requireAuth(user);
        if (err) return err;
        return json({ ok: true, features: PLAN_FEATURES[user.plan] || PLAN_FEATURES.free });
      }

      // ══════════════════════════════════════════
      // GET /api/links
      // ══════════════════════════════════════════
      if (path === "/api/links" && method === "GET") {
        const user = await getUser(request, env);
        const err  = requireAuth(user);
        if (err) return err;

        let query, binds;
        if (user.role === "superadmin") {
          query = `SELECT sl.*, u.email as owner_email,
                   (SELECT COUNT(*) FROM qr_analytics WHERE slug=sl.slug) as scan_count
                   FROM short_links sl JOIN users u ON sl.user_id=u.id
                   ORDER BY sl.created_at DESC LIMIT 1000`;
          binds = [];
        } else if (user.role === "enterprise") {
          query = `SELECT sl.*, u.email as owner_email,
                   (SELECT COUNT(*) FROM qr_analytics WHERE slug=sl.slug) as scan_count
                   FROM short_links sl JOIN users u ON sl.user_id=u.id
                   WHERE sl.user_id=? OR u.enterprise_id=?
                   ORDER BY sl.created_at DESC LIMIT 1000`;
          binds = [user.sub, user.sub];
        } else {
          query = `SELECT sl.*,
                   (SELECT COUNT(*) FROM qr_analytics WHERE slug=sl.slug) as scan_count
                   FROM short_links sl WHERE sl.user_id=? ORDER BY sl.created_at DESC LIMIT 1000`;
          binds = [user.sub];
        }

        const stmt   = env.DB.prepare(query);
        const result = await (binds.length ? stmt.bind(...binds) : stmt).all();
        return json({ ok: true, links: result.results });
      }

      // ══════════════════════════════════════════
      // POST /api/links — crear enlace
      // ══════════════════════════════════════════
      if (path === "/api/links" && method === "POST") {
        const user = await getUser(request, env);
        const err  = requireAuth(user);
        if (err) return err;

        const body = await request.json();
        const { slug, destination_url, project_id, qr_style_json,
                redirect_mode = "direct", redirect_rules, expires_at, max_scans, fallback_url } = body;

        if (!slug || !destination_url) return json({ ok: false, error: "slug y destination_url requeridos" }, 400);

        // Verificar feature gates del plan
        if (redirect_mode !== "direct" && !canUseFeature(user.plan, "redirect_mode", redirect_mode) && user.role !== "superadmin") {
          return json({ ok: false, error: `El modo "${redirect_mode}" requiere plan Pro o superior` }, 403);
        }
        if (expires_at && !canUseFeature(user.plan, "expiration") && user.role !== "superadmin") {
          return json({ ok: false, error: "Las fechas de expiración requieren plan Starter o superior" }, 403);
        }
        if (max_scans && !canUseFeature(user.plan, "max_scans") && user.role !== "superadmin") {
          return json({ ok: false, error: "El límite de escaneos requiere plan Pro o superior" }, 403);
        }

        // Verificar límite del plan
        const planConfig = await getPlan(env.DB, user.plan);
        if (planConfig && planConfig.max_qr !== -1) {
          const count = await countUserLinks(env.DB, user.sub);
          if (count >= planConfig.max_qr) {
            return json({ ok: false, error: `Límite de QRs alcanzado para plan ${user.plan} (${planConfig.max_qr})` }, 403);
          }
        }

        const cleanSlug = slug.trim().toLowerCase();
        const existing  = await env.DB.prepare("SELECT slug FROM short_links WHERE slug=?").bind(cleanSlug).first();
        if (existing) return json({ ok: false, error: "Slug ya en uso" }, 409);

        await env.DB.prepare(
          `INSERT INTO short_links
           (slug, destination_url, user_id, project_id, qr_style_json, redirect_mode, redirect_rules, expires_at, max_scans, fallback_url)
           VALUES (?,?,?,?,?,?,?,?,?,?)`
        ).bind(
          cleanSlug, destination_url, user.sub,
          project_id || null, qr_style_json || null,
          redirect_mode, redirect_rules ? JSON.stringify(redirect_rules) : null,
          expires_at || null, max_scans || null, fallback_url || null
        ).run();

        if (redirect_mode === "direct") {
          ctx.waitUntil(env.QR_CACHE.put(cleanSlug, destination_url, { expirationTtl: 3600 }));
        }
        return json({ ok: true, slug: cleanSlug }, 201);
      }

      // ══════════════════════════════════════════
      // PUT /api/links/:slug — actualizar
      // ══════════════════════════════════════════
      if (path.startsWith("/api/links/") && method === "PUT") {
        const user = await getUser(request, env);
        const err  = requireAuth(user);
        if (err) return err;

        const slug = path.split("/api/links/")[1];
        const body = await request.json();
        const { destination_url, project_id, qr_style_json,
                redirect_mode = "direct", redirect_rules, expires_at, max_scans, fallback_url } = body;

        if (!destination_url) return json({ ok: false, error: "destination_url requerido" }, 400);

        const link = await env.DB.prepare("SELECT user_id FROM short_links WHERE slug=?").bind(slug).first();
        if (!link) return json({ ok: false, error: "Enlace no encontrado" }, 404);
        if (user.role !== "superadmin" && link.user_id !== user.sub) return json({ ok: false, error: "Sin permiso" }, 403);

        // Verificar feature gates
        if (redirect_mode !== "direct" && !canUseFeature(user.plan, "redirect_mode", redirect_mode) && user.role !== "superadmin") {
          return json({ ok: false, error: `El modo "${redirect_mode}" requiere plan Pro o superior` }, 403);
        }

        await env.DB.prepare(
          `UPDATE short_links SET
           destination_url=?, project_id=?, qr_style_json=?,
           redirect_mode=?, redirect_rules=?, expires_at=?, max_scans=?, fallback_url=?,
           updated_at=CURRENT_TIMESTAMP
           WHERE slug=?`
        ).bind(
          destination_url, project_id || null, qr_style_json || null,
          redirect_mode, redirect_rules ? JSON.stringify(redirect_rules) : null,
          expires_at || null, max_scans || null, fallback_url || null,
          slug
        ).run();

        ctx.waitUntil(env.QR_CACHE.delete(slug));
        return json({ ok: true });
      }

      // ══════════════════════════════════════════
      // DELETE /api/links/:slug
      // ══════════════════════════════════════════
      if (path.startsWith("/api/links/") && !path.includes("/toggle") && method === "DELETE") {
        const user = await getUser(request, env);
        const err  = requireAuth(user);
        if (err) return err;

        const slug = path.split("/api/links/")[1];
        const link = await env.DB.prepare("SELECT user_id FROM short_links WHERE slug=?").bind(slug).first();
        if (!link) return json({ ok: false, error: "Enlace no encontrado" }, 404);
        if (user.role !== "superadmin" && link.user_id !== user.sub) return json({ ok: false, error: "Sin permiso" }, 403);

        await env.DB.prepare("DELETE FROM short_links WHERE slug=?").bind(slug).run();
        ctx.waitUntil(env.QR_CACHE.delete(slug));
        return json({ ok: true });
      }

      // ══════════════════════════════════════════
      // PATCH /api/links/:slug/toggle
      // ══════════════════════════════════════════
      if (path.match(/^\/api\/links\/.+\/toggle$/) && method === "PATCH") {
        const user = await getUser(request, env);
        const err  = requireAuth(user);
        if (err) return err;

        const slug = path.split("/api/links/")[1].replace("/toggle","");
        const { is_active } = await request.json();
        if (is_active !== 0 && is_active !== 1) return json({ ok: false, error: "is_active debe ser 0 o 1" }, 400);

        const link = await env.DB.prepare("SELECT user_id, destination_url FROM short_links WHERE slug=?").bind(slug).first();
        if (!link) return json({ ok: false, error: "Enlace no encontrado" }, 404);
        if (user.role !== "superadmin" && link.user_id !== user.sub) return json({ ok: false, error: "Sin permiso" }, 403);

        await env.DB.prepare("UPDATE short_links SET is_active=?, updated_at=CURRENT_TIMESTAMP WHERE slug=?").bind(is_active, slug).run();
        const cacheVal = is_active === 0 ? "INACTIVE" : link.destination_url;
        ctx.waitUntil(env.QR_CACHE.put(slug, cacheVal, { expirationTtl: 3600 }));
        return json({ ok: true });
      }

      // ══════════════════════════════════════════
      // POST /api/bulk/upload
      // ══════════════════════════════════════════
      if (path === "/api/bulk/upload" && method === "POST") {
        const user = await getUser(request, env);
        const err  = requireAuth(user);
        if (err) return err;

        const planConfig = await getPlan(env.DB, user.plan);
        if (!planConfig?.has_bulk && user.role !== "superadmin") {
          return json({ ok: false, error: "Carga masiva no disponible en tu plan" }, 403);
        }

        const { batch_name, links } = await request.json();
        if (!batch_name || !Array.isArray(links) || links.length === 0) {
          return json({ ok: false, error: "batch_name y links[] requeridos" }, 400);
        }

        const batchId = uuid();
        await env.DB.prepare("INSERT INTO bulk_batches (id, user_id, name, total_links) VALUES (?,?,?,?)").bind(batchId, user.sub, batch_name, links.length).run();

        let inserted = 0;
        for (const link of links) {
          const slug = (link.slug || "").trim().toLowerCase();
          const dest = link.destination_url || link.url || link.target;
          if (!slug || !dest) continue;
          try {
            await env.DB.prepare(
              "INSERT OR IGNORE INTO short_links (slug, destination_url, user_id, batch_id) VALUES (?,?,?,?)"
            ).bind(slug, dest, user.sub, batchId).run();
            ctx.waitUntil(env.QR_CACHE.put(slug, dest, { expirationTtl: 3600 }));
            inserted++;
          } catch (_) {}
        }

        await env.DB.prepare("UPDATE bulk_batches SET total_links=? WHERE id=?").bind(inserted, batchId).run();
        return json({ ok: true, batch_id: batchId, total_inserted: inserted }, 201);
      }

      // ══════════════════════════════════════════
      // GET /api/analytics/summary?slug=
      // ══════════════════════════════════════════
      if (path === "/api/analytics/summary" && method === "GET") {
        const user = await getUser(request, env);
        const err  = requireAuth(user);
        if (err) return err;

        const planConfig = await getPlan(env.DB, user.plan);
        if (!planConfig?.has_analytics && user.role !== "superadmin") {
          return json({ ok: false, error: "Analytics no disponibles en tu plan" }, 403);
        }

        const slug = url.searchParams.get("slug")?.trim().toLowerCase();
        if (!slug) return json({ ok: false, error: "Falta slug" }, 400);

        const link = await env.DB.prepare("SELECT user_id FROM short_links WHERE slug=?").bind(slug).first();
        if (!link) return json({ ok: false, error: "Enlace no encontrado" }, 404);
        if (user.role !== "superadmin" && link.user_id !== user.sub) return json({ ok: false, error: "Sin permiso" }, 403);

        const [total, countries, devices, daily] = await Promise.all([
          env.DB.prepare("SELECT COUNT(*) as total FROM qr_analytics WHERE slug=?").bind(slug).first(),
          env.DB.prepare("SELECT country, COUNT(*) as count FROM qr_analytics WHERE slug=? GROUP BY country ORDER BY count DESC LIMIT 10").bind(slug).all(),
          env.DB.prepare("SELECT device, COUNT(*) as count FROM qr_analytics WHERE slug=? GROUP BY device").bind(slug).all(),
          env.DB.prepare("SELECT date(scanned_at) as day, COUNT(*) as count FROM qr_analytics WHERE slug=? GROUP BY day ORDER BY day DESC LIMIT 30").bind(slug).all(),
        ]);

        return json({
          ok: true,
          summary: {
            total_scans: total?.total ?? 0,
            top_countries: countries.results,
            devices: devices.results,
            daily: daily.results,
          },
        });
      }

      // ══════════════════════════════════════════
      // GET /api/analytics/global — superadmin
      // ══════════════════════════════════════════
      if (path === "/api/analytics/global" && method === "GET") {
        const user = await getUser(request, env);
        const err  = requireAuth(user, "superadmin");
        if (err) return err;

        const [totalUsers, totalLinks, totalScans, planDist] = await Promise.all([
          env.DB.prepare("SELECT COUNT(*) as c FROM users").first(),
          env.DB.prepare("SELECT COUNT(*) as c FROM short_links").first(),
          env.DB.prepare("SELECT COUNT(*) as c FROM qr_analytics").first(),
          env.DB.prepare("SELECT plan, COUNT(*) as c FROM users GROUP BY plan").all(),
        ]);

        return json({
          ok: true,
          stats: {
            total_users:       totalUsers?.c  ?? 0,
            total_links:       totalLinks?.c  ?? 0,
            total_scans:       totalScans?.c  ?? 0,
            plan_distribution: planDist.results,
          },
        });
      }

      // ══════════════════════════════════════════
      // PROJECTS
      // ══════════════════════════════════════════
      if (path === "/api/projects" && method === "GET") {
        const user = await getUser(request, env);
        const err  = requireAuth(user);
        if (err) return err;
        const result = await env.DB.prepare("SELECT * FROM projects WHERE user_id=? ORDER BY name").bind(user.sub).all();
        return json({ ok: true, projects: result.results });
      }

      if (path === "/api/projects" && method === "POST") {
        const user = await getUser(request, env);
        const err  = requireAuth(user);
        if (err) return err;
        const { name } = await request.json();
        if (!name) return json({ ok: false, error: "Nombre requerido" }, 400);
        const id = uuid();
        await env.DB.prepare("INSERT INTO projects (id, user_id, name) VALUES (?,?,?)").bind(id, user.sub, name).run();
        return json({ ok: true, project: { id, name } }, 201);
      }

      if (path.startsWith("/api/projects/") && method === "DELETE") {
        const user = await getUser(request, env);
        const err  = requireAuth(user);
        if (err) return err;
        const id      = path.split("/api/projects/")[1];
        const project = await env.DB.prepare("SELECT user_id FROM projects WHERE id=?").bind(id).first();
        if (!project) return json({ ok: false, error: "Proyecto no encontrado" }, 404);
        if (user.role !== "superadmin" && project.user_id !== user.sub) return json({ ok: false, error: "Sin permiso" }, 403);
        await env.DB.prepare("DELETE FROM projects WHERE id=?").bind(id).run();
        return json({ ok: true });
      }

      // ══════════════════════════════════════════
      // ENTERPRISE — tenants
      // ══════════════════════════════════════════
      if (path === "/api/enterprise/tenants" && method === "GET") {
        const user = await getUser(request, env);
        const err  = requireAuth(user, "enterprise", "superadmin");
        if (err) return err;
        const enterpriseId = user.role === "superadmin" ? (url.searchParams.get("enterprise_id") || user.sub) : user.sub;
        const result = await env.DB.prepare(
          "SELECT id, email, plan, is_active, created_at FROM users WHERE enterprise_id=? AND role='tenant'"
        ).bind(enterpriseId).all();
        return json({ ok: true, tenants: result.results });
      }

      if (path === "/api/enterprise/tenants" && method === "POST") {
        const user = await getUser(request, env);
        const err  = requireAuth(user, "enterprise", "superadmin");
        if (err) return err;

        const planConfig     = await getPlan(env.DB, user.plan);
        const currentTenants = await env.DB.prepare("SELECT COUNT(*) as c FROM users WHERE enterprise_id=? AND role='tenant'").bind(user.sub).first();
        if (planConfig && planConfig.max_tenants > 0 && (currentTenants?.c ?? 0) >= planConfig.max_tenants) {
          return json({ ok: false, error: `Límite de tenants alcanzado (${planConfig.max_tenants})` }, 403);
        }

        const { email, password } = await request.json();
        if (!email || !password) return json({ ok: false, error: "Email y contraseña requeridos" }, 400);

        const existing = await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email.toLowerCase()).first();
        if (existing) return json({ ok: false, error: "Email ya registrado" }, 409);

        const hash = await bcrypt.hash(password, 10);
        const id   = uuid();
        await env.DB.prepare(
          "INSERT INTO users (id, email, password_hash, role, plan, enterprise_id) VALUES (?,?,?,'tenant','free',?)"
        ).bind(id, email.toLowerCase(), hash, user.sub).run();
        return json({ ok: true, tenant: { id, email, role: "tenant", plan: "free" } }, 201);
      }

      // ══════════════════════════════════════════
      // SUPERADMIN — Usuarios
      // ══════════════════════════════════════════
      if (path === "/api/admin/users" && method === "GET") {
        const user = await getUser(request, env);
        const err  = requireAuth(user, "superadmin");
        if (err) return err;
        const page   = parseInt(url.searchParams.get("page") || "1");
        const limit  = 50;
        const offset = (page - 1) * limit;
        const [users, total] = await Promise.all([
          env.DB.prepare("SELECT id, email, role, plan, is_active, enterprise_id, created_at FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?").bind(limit, offset).all(),
          env.DB.prepare("SELECT COUNT(*) as c FROM users").first(),
        ]);
        return json({ ok: true, users: users.results, total: total?.c ?? 0, page, limit });
      }

      if (path === "/api/admin/users" && method === "POST") {
        const user = await getUser(request, env);
        const err  = requireAuth(user, "superadmin");
        if (err) return err;
        const { email, password, role = "tenant", plan = "free", enterprise_id } = await request.json();
        if (!email || !password) return json({ ok: false, error: "Email y contraseña requeridos" }, 400);
        const existing = await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email.toLowerCase()).first();
        if (existing) return json({ ok: false, error: "Email ya registrado" }, 409);
        const hash = await bcrypt.hash(password, 10);
        const id   = uuid();
        await env.DB.prepare("INSERT INTO users (id, email, password_hash, role, plan, enterprise_id) VALUES (?,?,?,?,?,?)").bind(id, email.toLowerCase(), hash, role, plan, enterprise_id || null).run();
        return json({ ok: true, user: { id, email, role, plan } }, 201);
      }

      if (path.startsWith("/api/admin/users/") && method === "PATCH") {
        const user = await getUser(request, env);
        const err  = requireAuth(user, "superadmin");
        if (err) return err;
        const targetId = path.split("/api/admin/users/")[1];
        const updates  = await request.json();
        const allowed  = ["role","plan","is_active","enterprise_id"];
        const sets = [], vals = [];
        for (const key of allowed) {
          if (key in updates) { sets.push(`${key}=?`); vals.push(updates[key]); }
        }
        if (!sets.length) return json({ ok: false, error: "Sin campos" }, 400);
        sets.push("updated_at=CURRENT_TIMESTAMP");
        vals.push(targetId);
        await env.DB.prepare(`UPDATE users SET ${sets.join(",")} WHERE id=?`).bind(...vals).run();
        return json({ ok: true });
      }

      if (path.startsWith("/api/admin/users/") && method === "DELETE") {
        const user = await getUser(request, env);
        const err  = requireAuth(user, "superadmin");
        if (err) return err;
        const targetId = path.split("/api/admin/users/")[1];
        if (targetId === user.sub) return json({ ok: false, error: "No puedes eliminarte a ti mismo" }, 400);
        await env.DB.prepare("DELETE FROM users WHERE id=?").bind(targetId).run();
        return json({ ok: true });
      }

      // ══════════════════════════════════════════
      // SUPERADMIN — Planes
      // ══════════════════════════════════════════
      if (path === "/api/admin/plans" && method === "GET") {
        const user = await getUser(request, env);
        const err  = requireAuth(user, "superadmin");
        if (err) return err;
        const result = await env.DB.prepare("SELECT * FROM plan_configs ORDER BY price_usd").all();
        return json({ ok: true, plans: result.results });
      }

      if (path.startsWith("/api/admin/plans/") && method === "PUT") {
        const user = await getUser(request, env);
        const err  = requireAuth(user, "superadmin");
        if (err) return err;
        const plan = path.split("/api/admin/plans/")[1];
        const { max_qr, max_tenants, has_analytics, has_bulk, has_custom_domain, price_usd } = await request.json();
        await env.DB.prepare(
          `UPDATE plan_configs SET max_qr=?, max_tenants=?, has_analytics=?, has_bulk=?, has_custom_domain=?, price_usd=?, updated_at=CURRENT_TIMESTAMP WHERE plan=?`
        ).bind(max_qr, max_tenants, has_analytics, has_bulk, has_custom_domain, price_usd, plan).run();
        return json({ ok: true });
      }

      // ══════════════════════════════════════════
      // POST /api/admin/migrate-kv
      // ══════════════════════════════════════════
      if (path === "/api/admin/migrate-kv" && method === "POST") {
        const user = await getUser(request, env);
        const err  = requireAuth(user, "superadmin");
        if (err) return err;

        const listed = await env.QR_LINKS.list();
        let migrated = 0, skipped = 0, errors = 0;

        for (const key of listed.keys) {
          if (key.name.startsWith("__")) { skipped++; continue; }
          const existing = await env.DB.prepare("SELECT slug FROM short_links WHERE slug=?").bind(key.name).first();
          if (existing) { skipped++; continue; }
          const raw = await env.QR_LINKS.get(key.name);
          if (!raw) { skipped++; continue; }
          try {
            let destUrl, project = "General", isActive = true, createdAt = new Date().toISOString();
            try {
              const rec = JSON.parse(raw);
              destUrl   = rec.url || rec.destination_url;
              project   = rec.project || "General";
              isActive  = rec.is_active !== false;
              createdAt = rec.date || rec.created_at || createdAt;
            } catch { destUrl = raw; }
            if (!destUrl) { skipped++; continue; }
            await env.DB.prepare(
              "INSERT OR IGNORE INTO short_links (slug, destination_url, user_id, qr_style_json, is_active, created_at) VALUES (?,?,?,?,?,?)"
            ).bind(key.name, destUrl, user.sub, JSON.stringify({ project }), isActive ? 1 : 0, createdAt).run();
            migrated++;
          } catch (e) { console.error(`migrate-kv ${key.name}:`, e); errors++; }
        }
        return json({ ok: true, migrated, skipped, errors });
      }

      // ══════════════════════════════════════════
      // TRACE — public endpoints (no auth)
      // ══════════════════════════════════════════

      // GET /api/trace/public/:pointId — get point config for form rendering
      if (path.match(/^\/api\/trace\/public\/[^/]+$/) && method === "GET") {
        const pointId = path.split("/api/trace/public/")[1];
        const point = await env.DB.prepare(
          "SELECT id, name, area, qr_type, checklist_items, survey_questions FROM trace_points WHERE id=? AND is_active=1"
        ).bind(pointId).first();
        if (!point) return json({ ok: false, error: "Punto no encontrado" }, 404);
        return json({ ok: true, point: {
          ...point,
          checklist_items: JSON.parse(point.checklist_items || "[]"),
          survey_questions: JSON.parse(point.survey_questions || "[]"),
        }});
      }

      // POST /api/trace/public/:pointId/respond — submit response
      if (path.match(/^\/api\/trace\/public\/[^/]+\/respond$/) && method === "POST") {
        const pointId = path.split("/api/trace/public/")[1].replace("/respond", "");
        const point = await env.DB.prepare(
          "SELECT * FROM trace_points WHERE id=? AND is_active=1"
        ).bind(pointId).first();
        if (!point) return json({ ok: false, error: "Punto no encontrado" }, 404);

        const body = await request.json();
        const {
          respondent_type = "anonymous",
          user_id: respondentUserId,
          checklist_data = {},
          survey_data = {},
          nps_score,
          contact_email,
          notes,
        } = body;

        const cf = request.cf || {};
        const ip = request.headers.get("CF-Connecting-IP") || "unknown";
        const country = cf.country || "unknown";
        const ua = request.headers.get("user-agent") || "";
        const device = deviceType(ua);

        const responseId = uuid();
        await env.DB.prepare(
          `INSERT INTO trace_responses
           (id, point_id, respondent_type, user_id, checklist_data, survey_data, nps_score, contact_email, notes, ip, country, device)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
        ).bind(
          responseId, pointId, respondent_type,
          respondentUserId || null,
          JSON.stringify(checklist_data),
          JSON.stringify(survey_data),
          nps_score ?? null,
          contact_email || null,
          notes || null,
          ip, country, device
        ).run();

        // Generate alerts
        const alertConfig = JSON.parse(point.alert_config || "{}");
        const npsThreshold = alertConfig.nps_threshold ?? 7;
        const alertOps = [];

        if (nps_score !== undefined && nps_score !== null && nps_score < npsThreshold) {
          alertOps.push(env.DB.prepare(
            "INSERT INTO trace_alerts (id, point_id, user_id, alert_type, message) VALUES (?,?,?,?,?)"
          ).bind(uuid(), pointId, point.user_id, "low_nps", `NPS score ${nps_score} está por debajo del umbral ${npsThreshold}`).run());
        }

        const checklistItems = JSON.parse(point.checklist_items || "[]");
        const requiredItems = checklistItems.filter(i => i.required);
        const hasMissedRequired = requiredItems.some(i => !checklist_data[i.id]);
        if (requiredItems.length > 0 && hasMissedRequired) {
          alertOps.push(env.DB.prepare(
            "INSERT INTO trace_alerts (id, point_id, user_id, alert_type, message) VALUES (?,?,?,?,?)"
          ).bind(uuid(), pointId, point.user_id, "missed_checklist", "Ítems obligatorios del checklist no completados").run());
        }

        if (alertOps.length > 0) {
          ctx.waitUntil(Promise.all(alertOps));
        }

        return json({ ok: true, response_id: responseId }, 201);
      }

      // ══════════════════════════════════════════
      // TRACE — authenticated endpoints
      // ══════════════════════════════════════════

      // GET /api/trace/alerts
      if (path === "/api/trace/alerts" && method === "GET") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const result = await env.DB.prepare(
          "SELECT * FROM trace_alerts WHERE user_id=? AND is_resolved=0 ORDER BY created_at DESC LIMIT 100"
        ).bind(user.sub).all();
        return json({ ok: true, alerts: result.results });
      }

      // PATCH /api/trace/alerts/:id/resolve
      if (path.match(/^\/api\/trace\/alerts\/[^/]+\/resolve$/) && method === "PATCH") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const alertId = path.split("/api/trace/alerts/")[1].replace("/resolve", "");
        const alert = await env.DB.prepare("SELECT user_id FROM trace_alerts WHERE id=?").bind(alertId).first();
        if (!alert) return json({ ok: false, error: "Alerta no encontrada" }, 404);
        if (alert.user_id !== user.sub && user.role !== "superadmin") return json({ ok: false, error: "Sin permiso" }, 403);
        await env.DB.prepare("UPDATE trace_alerts SET is_resolved=1 WHERE id=?").bind(alertId).run();
        return json({ ok: true });
      }

      // GET /api/trace/responses — all responses for user's points
      if (path === "/api/trace/responses" && method === "GET") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const limit = parseInt(url.searchParams.get("limit") || "50");
        const offset = parseInt(url.searchParams.get("offset") || "0");
        const result = await env.DB.prepare(
          `SELECT tr.* FROM trace_responses tr
           JOIN trace_points tp ON tr.point_id = tp.id
           WHERE tp.user_id=?
           ORDER BY tr.created_at DESC LIMIT ? OFFSET ?`
        ).bind(user.sub, limit, offset).all();
        return json({ ok: true, responses: result.results });
      }

      // GET /api/trace/points/:id/responses
      if (path.match(/^\/api\/trace\/points\/[^/]+\/responses$/) && method === "GET") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const pointId = path.split("/api/trace/points/")[1].replace("/responses", "");
        const point = await env.DB.prepare("SELECT user_id FROM trace_points WHERE id=?").bind(pointId).first();
        if (!point) return json({ ok: false, error: "Punto no encontrado" }, 404);
        if (point.user_id !== user.sub && user.role !== "superadmin") return json({ ok: false, error: "Sin permiso" }, 403);
        const limit = parseInt(url.searchParams.get("limit") || "50");
        const offset = parseInt(url.searchParams.get("offset") || "0");
        const result = await env.DB.prepare(
          "SELECT * FROM trace_responses WHERE point_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?"
        ).bind(pointId, limit, offset).all();
        return json({ ok: true, responses: result.results });
      }

      // GET /api/trace/points/:id
      if (path.match(/^\/api\/trace\/points\/[^/]+$/) && method === "GET") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const pointId = path.split("/api/trace/points/")[1];
        const point = await env.DB.prepare("SELECT * FROM trace_points WHERE id=?").bind(pointId).first();
        if (!point) return json({ ok: false, error: "Punto no encontrado" }, 404);
        if (point.user_id !== user.sub && user.role !== "superadmin") return json({ ok: false, error: "Sin permiso" }, 403);
        return json({ ok: true, point: {
          ...point,
          checklist_items: JSON.parse(point.checklist_items || "[]"),
          survey_questions: JSON.parse(point.survey_questions || "[]"),
          alert_config: JSON.parse(point.alert_config || "{}"),
        }});
      }

      // PUT /api/trace/points/:id
      if (path.match(/^\/api\/trace\/points\/[^/]+$/) && method === "PUT") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const pointId = path.split("/api/trace/points/")[1];
        const point = await env.DB.prepare("SELECT user_id FROM trace_points WHERE id=?").bind(pointId).first();
        if (!point) return json({ ok: false, error: "Punto no encontrado" }, 404);
        if (point.user_id !== user.sub && user.role !== "superadmin") return json({ ok: false, error: "Sin permiso" }, 403);

        const { name, area, description, template, qr_type, checklist_items, survey_questions, alert_config, is_active } = await request.json();
        await env.DB.prepare(
          `UPDATE trace_points SET
           name=?, area=?, description=?, template=?, qr_type=?,
           checklist_items=?, survey_questions=?, alert_config=?, is_active=?
           WHERE id=?`
        ).bind(
          name, area || null, description || null, template || "custom", qr_type || "mixed",
          JSON.stringify(checklist_items || []),
          JSON.stringify(survey_questions || []),
          JSON.stringify(alert_config || {}),
          is_active !== undefined ? (is_active ? 1 : 0) : 1,
          pointId
        ).run();
        return json({ ok: true });
      }

      // DELETE /api/trace/points/:id
      if (path.match(/^\/api\/trace\/points\/[^/]+$/) && method === "DELETE") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const pointId = path.split("/api/trace/points/")[1];
        const point = await env.DB.prepare("SELECT user_id FROM trace_points WHERE id=?").bind(pointId).first();
        if (!point) return json({ ok: false, error: "Punto no encontrado" }, 404);
        if (point.user_id !== user.sub && user.role !== "superadmin") return json({ ok: false, error: "Sin permiso" }, 403);
        await env.DB.prepare("DELETE FROM trace_points WHERE id=?").bind(pointId).run();
        return json({ ok: true });
      }

      // GET /api/trace/points
      if (path === "/api/trace/points" && method === "GET") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const result = await env.DB.prepare(
          "SELECT * FROM trace_points WHERE user_id=? ORDER BY created_at DESC"
        ).bind(user.sub).all();
        return json({ ok: true, points: result.results.map(p => ({
          ...p,
          checklist_items: JSON.parse(p.checklist_items || "[]"),
          survey_questions: JSON.parse(p.survey_questions || "[]"),
          alert_config: JSON.parse(p.alert_config || "{}"),
        }))});
      }

      // POST /api/trace/points
      if (path === "/api/trace/points" && method === "POST") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;

        // Plan gate
        if (!["pro", "enterprise"].includes(user.plan) && user.role !== "superadmin") {
          return json({ ok: false, error: "TRACE requiere plan Pro o superior" }, 403);
        }

        const { name, area, description, template, qr_type, checklist_items, survey_questions, alert_config } = await request.json();
        if (!name) return json({ ok: false, error: "Nombre requerido" }, 400);

        const id = uuid();
        await env.DB.prepare(
          `INSERT INTO trace_points
           (id, user_id, name, area, description, template, qr_type, checklist_items, survey_questions, alert_config)
           VALUES (?,?,?,?,?,?,?,?,?,?)`
        ).bind(
          id, user.sub, name, area || null, description || null,
          template || "custom", qr_type || "mixed",
          JSON.stringify(checklist_items || []),
          JSON.stringify(survey_questions || []),
          JSON.stringify(alert_config || {})
        ).run();

        return json({ ok: true, point: { id, name } }, 201);
      }

      // Root
      return json({ ok: true, service: "prince-qr-manager", version: "2.1.0" });

    } catch (e) {
      console.error(e);
      return json({ ok: false, error: `Error interno: ${e.message}` }, 500);
    }
  },
};
