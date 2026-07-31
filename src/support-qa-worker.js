import jwt from "@tsndr/cloudflare-worker-jwt";
import { handleSupportTicketApi } from "./support-ticket-api.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

async function getUser(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();

  if (!token) return null;
  if (!env.JWT_SECRET) throw new Error("JWT_SECRET no configurado");

  const valid = await jwt.verify(token, env.JWT_SECRET, {
    algorithm: "HS256",
  });

  if (!valid) return null;
  return jwt.decode(token).payload;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({
        ok: true,
        service: "intap-code-support-qa",
        environment: env.ENVIRONMENT || "qa",
      });
    }

    if (!url.pathname.startsWith("/api/support/tickets")) {
      return json({ ok: false, error: "Ruta no disponible en QA" }, 404);
    }

    try {
      const user = await getUser(request, env);

      if (!user) {
        return json({ ok: false, error: "No autenticado" }, 401);
      }

      return handleSupportTicketApi({ request, env, user });
    } catch (error) {
      console.error("support-qa-worker", error);
      return json({ ok: false, error: "Error interno" }, 500);
    }
  },
};
