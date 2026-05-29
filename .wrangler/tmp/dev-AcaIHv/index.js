var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-1IQVpw/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// src/index.js
var src_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };
    if (method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    if (path.startsWith("/q/")) {
      const slug = path.split("/q/")[1]?.trim().toLowerCase();
      if (!slug) {
        return new Response(JSON.stringify({ ok: false, error: "Slug no prove\xEDdo" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      try {
        let destination = await env.QR_CACHE.get(slug);
        if (destination === "INACTIVE") {
          return new Response("Enlace inactivo", { status: 404 });
        }
        if (!destination) {
          const dbResult = await env.DB.prepare(
            "SELECT destination_url, is_active FROM short_links WHERE slug = ? LIMIT 1"
          ).bind(slug).first();
          if (!dbResult) {
            return new Response("Enlace no encontrado", { status: 404 });
          }
          if (dbResult.is_active === 0) {
            ctx.waitUntil(env.QR_CACHE.put(slug, "INACTIVE", { expirationTtl: 3600 }));
            return new Response("Enlace inactivo", { status: 404 });
          }
          destination = dbResult.destination_url;
          ctx.waitUntil(env.QR_CACHE.put(slug, destination, { expirationTtl: 3600 }));
        }
        const cf = request.cf || {};
        const country = cf.country || "Desconocido";
        const city = cf.city || "Desconocido";
        const userAgent = request.headers.get("user-agent") || "Desconocido";
        const device = getDeviceType(userAgent);
        ctx.waitUntil(
          saveAnalytics(env.DB, slug, country, city, device, userAgent)
        );
        return Response.redirect(destination, 302);
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: "Error interno en redirecci\xF3n", details: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }
    if (path === "/api/bulk/upload" && method === "POST") {
      try {
        const body = await request.json();
        const { user_id, batch_name, links } = body;
        if (!user_id || !batch_name || !Array.isArray(links) || links.length === 0) {
          return new Response(JSON.stringify({ ok: false, error: "Faltan par\xE1metros requeridos" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        const userRole = await getUserRole(env.DB, user_id);
        if (!userRole) {
          return new Response(JSON.stringify({ ok: false, error: "Usuario no registrado" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        if (userRole !== "enterprise" && userRole !== "superadmin") {
          return new Response(JSON.stringify({ ok: false, error: "Acceso denegado: Requiere Plan Enterprise para cargas masivas" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        const batchId = crypto.randomUUID();
        const totalLinks = links.length;
        const statements = [];
        statements.push(
          env.DB.prepare(
            "INSERT INTO bulk_batches (id, user_id, name, total_links) VALUES (?, ?, ?, ?)"
          ).bind(batchId, user_id, batch_name, totalLinks)
        );
        for (const link of links) {
          const cleanSlug = link.slug.trim().toLowerCase();
          const qrStyle = link.qr_style_json ? JSON.stringify(link.qr_style_json) : null;
          statements.push(
            env.DB.prepare(
              "INSERT INTO short_links (slug, destination_url, user_id, batch_id, qr_style_json, is_active) VALUES (?, ?, ?, ?, ?, 1)"
            ).bind(cleanSlug, link.destination_url, user_id, batchId, qrStyle)
          );
        }
        await env.DB.batch(statements);
        ctx.waitUntil(
          bulkWriteToKV(env.QR_CACHE, links)
        );
        return new Response(JSON.stringify({ ok: true, batch_id: batchId, total_inserted: totalLinks }), {
          status: 201,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: "Error en carga masiva", details: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }
    if (path === "/api/links/toggle" && method === "POST") {
      try {
        const body = await request.json();
        const { slug, is_active } = body;
        if (!slug || is_active !== 0 && is_active !== 1) {
          return new Response(JSON.stringify({ ok: false, error: "Par\xE1metros inv\xE1lidos" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        const cleanSlug = slug.trim().toLowerCase();
        const dbResult = await env.DB.prepare(
          "SELECT destination_url FROM short_links WHERE slug = ? LIMIT 1"
        ).bind(cleanSlug).first();
        if (!dbResult) {
          return new Response(JSON.stringify({ ok: false, error: "El slug no existe" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        await env.DB.prepare(
          "UPDATE short_links SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE slug = ?"
        ).bind(is_active, cleanSlug).run();
        if (is_active === 0) {
          await env.QR_CACHE.put(cleanSlug, "INACTIVE", { expirationTtl: 3600 });
        } else {
          await env.QR_CACHE.put(cleanSlug, dbResult.destination_url, { expirationTtl: 3600 });
        }
        return new Response(JSON.stringify({ ok: true, message: `Slug /${cleanSlug} actualizado a estado: ${is_active}` }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: "Error al cambiar estado del enlace", details: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }
    if (path === "/api/admin/update-subscription" && method === "POST") {
      try {
        const authHeader = request.headers.get("Authorization");
        const expectedSecret = env.SUPERADMIN_SECRET || "prince_admin_master_key_dev";
        if (!authHeader || !authHeader.startsWith("Bearer ") || authHeader.split(" ")[1] !== expectedSecret) {
          return new Response(JSON.stringify({ ok: false, error: "Acceso no autorizado" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        const body = await request.json();
        const { target_user_id, new_role } = body;
        if (!target_user_id || !["tenant", "enterprise", "superadmin"].includes(new_role)) {
          return new Response(JSON.stringify({ ok: false, error: "Par\xE1metros de suscripci\xF3n inv\xE1lidos" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        const result = await env.DB.prepare(
          "UPDATE users SET role = ? WHERE id = ?"
        ).bind(new_role, target_user_id).run();
        if (result.meta.changes === 0) {
          return new Response(JSON.stringify({ ok: false, error: "Usuario objetivo no encontrado" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        return new Response(JSON.stringify({ ok: true, message: `Suscripci\xF3n del usuario ${target_user_id} actualizada a: ${new_role}` }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: "Error en actualizaci\xF3n de suscripci\xF3n", details: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }
    if (path === "/api/analytics/summary" && method === "GET") {
      try {
        const slug = url.searchParams.get("slug")?.trim().toLowerCase();
        if (!slug) {
          return new Response(JSON.stringify({ ok: false, error: "Falta el par\xE1metro slug en la consulta" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        const linkCheck = await env.DB.prepare(
          "SELECT slug FROM short_links WHERE slug = ? LIMIT 1"
        ).bind(slug).first();
        if (!linkCheck) {
          return new Response(JSON.stringify({ ok: false, error: "El slug especificado no existe" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        const [totalEscaneosResult, topPaisesResult, topDispositivosResult] = await Promise.all([
          // a) Conteo total de escaneos
          env.DB.prepare("SELECT COUNT(*) as total FROM qr_analytics WHERE slug = ?").bind(slug).first(),
          // b) Top Países ordenado desc
          env.DB.prepare("SELECT country, COUNT(*) as count FROM qr_analytics WHERE slug = ? GROUP BY country ORDER BY count DESC LIMIT 5").bind(slug).all(),
          // c) Distribución de Dispositivos (Móvil vs Desktop vs Tablet)
          env.DB.prepare("SELECT device, COUNT(*) as count FROM qr_analytics WHERE slug = ? GROUP BY device ORDER BY count DESC").bind(slug).all()
        ]);
        return new Response(JSON.stringify({
          ok: true,
          slug,
          summary: {
            total_scans: totalEscaneosResult.total || 0,
            top_countries: topPaisesResult.results || [],
            devices_distribution: topDispositivosResult.results || []
          }
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: "Error obteniendo resumen anal\xEDtico", details: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }
    return new Response(JSON.stringify({ ok: true, message: "Prince QR SaaS API Activa" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
};
async function bulkWriteToKV(kvNamespace, links) {
  try {
    for (const link of links) {
      const cleanSlug = link.slug.trim().toLowerCase();
      await kvNamespace.put(cleanSlug, link.destination_url, { expirationTtl: 3600 });
    }
  } catch (err) {
    console.error("Error al inyectar enlaces en KV:", err);
  }
}
__name(bulkWriteToKV, "bulkWriteToKV");
async function getUserRole(db, userId) {
  try {
    const user = await db.prepare(
      "SELECT role FROM users WHERE id = ? LIMIT 1"
    ).bind(userId).first();
    return user ? user.role : null;
  } catch (err) {
    console.error("Error obteniendo rol de usuario:", err);
    return null;
  }
}
__name(getUserRole, "getUserRole");
async function saveAnalytics(db, slug, country, city, device, userAgent) {
  try {
    await db.prepare(
      "INSERT INTO qr_analytics (slug, country, city, device, user_agent) VALUES (?, ?, ?, ?, ?)"
    ).bind(slug, country, city, device, userAgent).run();
  } catch (err) {
    console.error(`Error guardando anal\xEDticas para /q/${slug}:`, err);
  }
}
__name(saveAnalytics, "saveAnalytics");
function getDeviceType(userAgent) {
  const ua = userAgent.toLowerCase();
  if (ua.includes("mobi") || ua.includes("android") || ua.includes("iphone")) {
    return "M\xF3vil";
  }
  if (ua.includes("tablet") || ua.includes("ipad")) {
    return "Tablet";
  }
  return "Desktop";
}
__name(getDeviceType, "getDeviceType");

// ../../../../.nvm/versions/node/v24.12.0/lib/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// .wrangler/tmp/bundle-1IQVpw/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default
];
var middleware_insertion_facade_default = src_default;

// ../../../../.nvm/versions/node/v24.12.0/lib/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-1IQVpw/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
