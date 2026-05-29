/**
 * prince-qr-manager-backend
 * Arquitectura: QR_LINKS (fuente de verdad) + QR_CACHE (acelerador) + D1 (analytics)
 * 
 * ✅ QR_LINKS  = KV principal — todos los enlaces viven aquí
 * ✅ QR_CACHE  = KV caché — acelera redirecciones, TTL 1h
 * ✅ D1        = solo analíticas de escaneos
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    try {

      // ══════════════════════════════════════════
      // REDIRECCIÓN PÚBLICA: /:slug
      // ══════════════════════════════════════════
      if (!path.startsWith("/api") && path !== "/" && path.length > 1) {
        const slug = path.replace("/", "").trim().toLowerCase();

        // 1. Buscar en caché rápida
        let destination = await env.QR_CACHE.get(slug);

        if (destination === "INACTIVE") {
          return new Response("Enlace inactivo", { status: 404 });
        }

        // 2. Si no está en caché, buscar en QR_LINKS (fuente de verdad)
        if (!destination) {
          const raw = await env.QR_LINKS.get(slug);
          if (!raw) {
            return new Response("Enlace no encontrado", { status: 404 });
          }

          const record = JSON.parse(raw);

          if (record.is_active === false) {
            ctx.waitUntil(env.QR_CACHE.put(slug, "INACTIVE", { expirationTtl: 3600 }));
            return new Response("Enlace inactivo", { status: 404 });
          }

          destination = record.url;
          // Poblar caché para próximas visitas
          ctx.waitUntil(env.QR_CACHE.put(slug, destination, { expirationTtl: 3600 }));
        }

        // 3. Registrar analítica de forma diferida
        const cf = request.cf || {};
        ctx.waitUntil(saveAnalytics(
          env.DB, slug,
          cf.country || "Desconocido",
          cf.city || "Desconocido",
          getDeviceType(request.headers.get("user-agent") || ""),
          request.headers.get("user-agent") || ""
        ));

        return Response.redirect(destination, 302);
      }

      // ══════════════════════════════════════════
      // POST /api/login
      // ══════════════════════════════════════════
      if (path === "/api/login" && method === "POST") {
        const { password } = await request.json();
        if (!password) return json({ ok: false, error: "Contraseña requerida" }, 400);

        const configRaw = await env.QR_LINKS.get("__admin_config__");
        const config = configRaw ? JSON.parse(configRaw) : { password: "prince2024" };

        if (password !== config.password) return json({ ok: false, error: "Acceso denegado" }, 401);
        return json({ ok: true });
      }

      // ══════════════════════════════════════════
      // POST /api/settings (cambiar contraseña)
      // ══════════════════════════════════════════
      if (path === "/api/settings" && method === "POST") {
        const { newPassword } = await request.json();
        if (!newPassword || newPassword.length < 4) return json({ ok: false, error: "Contraseña muy corta" }, 400);

        const configRaw = await env.QR_LINKS.get("__admin_config__");
        const config = configRaw ? JSON.parse(configRaw) : {};
        config.password = newPassword;
        await env.QR_LINKS.put("__admin_config__", JSON.stringify(config));
        return json({ ok: true });
      }

      // ══════════════════════════════════════════
      // GET /api/projects — leer carpetas desde KV
      // ══════════════════════════════════════════
      if (path === "/api/projects" && method === "GET") {
        const raw = await env.QR_LINKS.get("__projects_list__");
        const list = raw ? JSON.parse(raw) : ["General"];
        if (!list.includes("General")) list.unshift("General");
        return json(list);
      }

      // POST /api/projects — guardar lista de carpetas en KV
      if (path === "/api/projects" && method === "POST") {
        const { projects } = await request.json();
        if (!Array.isArray(projects)) return json({ ok: false, error: "Lista inválida" }, 400);
        if (!projects.includes("General")) projects.unshift("General");
        await env.QR_LINKS.put("__projects_list__", JSON.stringify(projects));
        return json({ ok: true });
      }

      // ══════════════════════════════════════════
      // GET /api/links — listar todos los enlaces desde QR_LINKS
      // ══════════════════════════════════════════
      if (path === "/api/links" && method === "GET") {
        const listed = await env.QR_LINKS.list();
        const results = [];

        for (const key of listed.keys) {
          // Ignorar claves internas del sistema
          if (key.name.startsWith("__")) continue;

          const raw = await env.QR_LINKS.get(key.name);
          if (!raw) continue;

          try {
            const record = JSON.parse(raw);
            results.push({
              slug: key.name,
              url: record.url,
              project: record.project || "General",
              is_active: record.is_active !== false ? 1 : 0,
              date: record.date || null,
            });
          } catch {
            // Si el valor no es JSON (legacy string directo)
            results.push({
              slug: key.name,
              url: raw,
              project: "General",
              is_active: 1,
              date: null,
            });
          }
        }

        // Ordenar por fecha descendente
        results.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        return json(results);
      }

      // ══════════════════════════════════════════
      // POST /api/links — crear o actualizar enlace
      // ══════════════════════════════════════════
      if (path === "/api/links" && method === "POST") {
        const body = await request.json();
        const { slug, target, destination_url, project } = body;
        const destination = target || destination_url;

        if (!slug || !destination) return json({ ok: false, error: "Faltan parámetros: slug y url" }, 400);

        const cleanSlug = slug.trim().toLowerCase();
        const activeProj = project || "General";

        // Verificar si ya existe para preservar fecha original
        const existing = await env.QR_LINKS.get(cleanSlug);
        const existingRecord = existing ? JSON.parse(existing) : null;

        const record = {
          url: destination,
          project: activeProj,
          is_active: true,
          date: existingRecord?.date || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        // Guardar en QR_LINKS (fuente de verdad)
        await env.QR_LINKS.put(cleanSlug, JSON.stringify(record));

        // Actualizar caché
        await env.QR_CACHE.put(cleanSlug, destination, { expirationTtl: 3600 });

        return json({ ok: true });
      }

      // ══════════════════════════════════════════
      // DELETE /api/links — borrar enlace
      // ══════════════════════════════════════════
      if (path === "/api/links" && method === "DELETE") {
        const { slug } = await request.json();
        if (!slug) return json({ ok: false, error: "Slug faltante" }, 400);

        const cleanSlug = slug.trim().toLowerCase();
        await env.QR_LINKS.delete(cleanSlug);
        await env.QR_CACHE.delete(cleanSlug);

        return json({ ok: true });
      }

      // ══════════════════════════════════════════
      // POST /api/links/toggle — activar/desactivar
      // ══════════════════════════════════════════
      if (path === "/api/links/toggle" && method === "POST") {
        const { slug, is_active } = await request.json();
        if (!slug || (is_active !== 0 && is_active !== 1)) return json({ ok: false, error: "Parámetros inválidos" }, 400);

        const cleanSlug = slug.trim().toLowerCase();
        const raw = await env.QR_LINKS.get(cleanSlug);
        if (!raw) return json({ ok: false, error: "Enlace no existe" }, 404);

        const record = JSON.parse(raw);
        record.is_active = is_active === 1;
        record.updated_at = new Date().toISOString();

        await env.QR_LINKS.put(cleanSlug, JSON.stringify(record));
        await env.QR_CACHE.put(cleanSlug, is_active === 0 ? "INACTIVE" : record.url, { expirationTtl: 3600 });

        return json({ ok: true });
      }

      // ══════════════════════════════════════════
      // POST /api/bulk/upload — carga masiva
      // ══════════════════════════════════════════
      if (path === "/api/bulk/upload" && method === "POST") {
        const { batch_name, links } = await request.json();
        if (!batch_name || !Array.isArray(links) || links.length === 0) return json({ ok: false, error: "Datos de lote incompletos" }, 400);

        const now = new Date().toISOString();
        let inserted = 0;

        for (const link of links) {
          const cleanSlug = (link.slug || "").trim().toLowerCase();
          const destination = link.destination_url || link.url || link.target;
          if (!cleanSlug || !destination) continue;

          const record = {
            url: destination,
            project: batch_name,
            is_active: true,
            date: now,
            updated_at: now,
          };

          await env.QR_LINKS.put(cleanSlug, JSON.stringify(record));
          ctx.waitUntil(env.QR_CACHE.put(cleanSlug, destination, { expirationTtl: 3600 }));
          inserted++;
        }

        // Actualizar lista de proyectos
        const projRaw = await env.QR_LINKS.get("__projects_list__");
        const projList = projRaw ? JSON.parse(projRaw) : ["General"];
        if (!projList.includes(batch_name)) {
          projList.push(batch_name);
          await env.QR_LINKS.put("__projects_list__", JSON.stringify(projList));
        }

        return json({ ok: true, total_inserted: inserted }, 201);
      }

      // ══════════════════════════════════════════
      // GET /api/analytics/summary
      // ══════════════════════════════════════════
      if (path === "/api/analytics/summary" && method === "GET") {
        const slug = url.searchParams.get("slug")?.trim().toLowerCase();
        if (!slug) return json({ ok: false, error: "Falta slug" }, 400);

        const [total, paises, dispositivos] = await Promise.all([
          env.DB.prepare("SELECT COUNT(*) as total FROM qr_analytics WHERE slug = ?").bind(slug).first(),
          env.DB.prepare("SELECT country, COUNT(*) as count FROM qr_analytics WHERE slug = ? GROUP BY country ORDER BY count DESC LIMIT 5").bind(slug).all(),
          env.DB.prepare("SELECT device, COUNT(*) as count FROM qr_analytics WHERE slug = ? GROUP BY device ORDER BY count DESC").bind(slug).all()
        ]);

        return json({
          ok: true,
          summary: {
            total_scans: total?.total || 0,
            top_countries: paises.results || [],
            devices_distribution: dispositivos.results || []
          }
        });
      }

      // Ruta raíz
      return json({ ok: true, status: "online" });

    } catch (e) {
      return json({ ok: false, error: `Error interno: ${e.message}` }, 500);
    }
  }
};

async function saveAnalytics(db, slug, country, city, device, ua) {
  try {
    await db.prepare(
      "INSERT INTO qr_analytics (slug, country, city, device, user_agent) VALUES (?, ?, ?, ?, ?)"
    ).bind(slug, country, city, device, ua).run();
  } catch (e) {
    console.error("Analytics error:", e);
  }
}

function getDeviceType(ua) {
  const u = ua.toLowerCase();
  if (u.includes("mobi") || u.includes("android") || u.includes("iphone")) return "Móvil";
  if (u.includes("tablet") || u.includes("ipad")) return "Tablet";
  return "Desktop";
}
