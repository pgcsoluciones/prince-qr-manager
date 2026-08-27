import coreWorker from "./index.js";

const CURRENT_QR_ORIGIN = "https://qr.intaprd.com";
const LEGACY_QR_ORIGIN = "https://qr.grupoprince.com";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

async function getVisibleLink(request, env, ctx, slug) {
  const auth = request.headers.get("Authorization") || "";
  const url = new URL(request.url);
  url.pathname = "/api/links";
  url.search = "";

  const listRequest = new Request(url.toString(), {
    method: "GET",
    headers: { Authorization: auth },
  });

  const response = await coreWorker.fetch(listRequest, env, ctx);
  if (!response.ok) return { response };

  const data = await response.json();
  const link = (data.links || []).find((item) => item.slug === slug);
  if (!link) return { response: json({ ok: false, error: "Enlace no encontrado" }, 404) };

  return { link };
}

async function syncLegacyDestination(env, slug, destinationUrl, legacyRaw) {
  if (!legacyRaw || !destinationUrl) return;

  let nextValue = destinationUrl;
  try {
    const record = JSON.parse(legacyRaw);
    if (record && typeof record === "object" && !Array.isArray(record)) {
      record.url = destinationUrl;
      if (Object.prototype.hasOwnProperty.call(record, "destination_url")) {
        record.destination_url = destinationUrl;
      }
      record.updated_at = new Date().toISOString();
      nextValue = JSON.stringify(record);
    }
  } catch (_) {
    // Los registros legacy antiguos también pueden ser una URL plana.
  }

  await env.QR_LINKS.put(slug, nextValue);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Diagnóstico temporal de Preview: solo lectura y solo cuando ENVIRONMENT=preview.
    // Permite comprobar la identidad legacy sin exponer ni modificar el destino.
    const previewIdentityMatch = path.match(/^\/__preview\/identity\/([^/]+)$/);
    if (env.ENVIRONMENT === "preview" && previewIdentityMatch && method === "GET") {
      const slug = decodeURIComponent(previewIdentityMatch[1]);
      const legacyRaw = await env.QR_LINKS.get(slug);
      const isLegacy = Boolean(legacyRaw);
      const origin = isLegacy ? LEGACY_QR_ORIGIN : CURRENT_QR_ORIGIN;
      return json({
        ok: true,
        slug,
        is_legacy: isLegacy,
        public_url: `${origin}/${slug}`,
      });
    }

    const identityMatch = path.match(/^\/api\/links\/([^/]+)\/identity$/);
    if (identityMatch && method === "GET") {
      const slug = decodeURIComponent(identityMatch[1]);
      const { link, response } = await getVisibleLink(request, env, ctx, slug);
      if (response) return response;

      const legacyRaw = await env.QR_LINKS.get(slug);
      const isLegacy = Boolean(legacyRaw);
      const origin = isLegacy ? LEGACY_QR_ORIGIN : CURRENT_QR_ORIGIN;

      return json({
        ok: true,
        slug,
        is_legacy: isLegacy,
        public_url: `${origin}/${slug}`,
        destination_url: link.destination_url,
      });
    }

    const updateMatch = path.match(/^\/api\/links\/([^/]+)$/);
    if (updateMatch && method === "PUT") {
      const slug = decodeURIComponent(updateMatch[1]);
      const legacyRaw = await env.QR_LINKS.get(slug);

      let body = null;
      try {
        body = await request.clone().json();
      } catch (_) {}

      const response = await coreWorker.fetch(request, env, ctx);

      if (response.ok && legacyRaw && body?.destination_url) {
        await syncLegacyDestination(env, slug, body.destination_url, legacyRaw);
      }

      return response;
    }

    return coreWorker.fetch(request, env, ctx);
  },

  async scheduled(event, env, ctx) {
    if (typeof coreWorker.scheduled === "function") {
      return coreWorker.scheduled(event, env, ctx);
    }
  },
};
