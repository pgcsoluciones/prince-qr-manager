import fs from "node:fs";

const path = "src/support-ticket-api.js";
const source = fs.readFileSync(path, "utf8");

const before = `async function loadRequester(env, userId) {
  return env.DB.prepare(
    \`SELECT u.id, u.email, u.plan, tp.company_name, tp.company_phone
     FROM users u
     LEFT JOIN tenant_profiles tp ON tp.tenant_id = u.id
     WHERE u.id = ?\`
  ).bind(userId).first();
}`;

const after = `async function loadRequester(env, userId) {
  try {
    return await env.DB.prepare(
      \`SELECT u.id, u.email, u.plan, tp.company_name, tp.company_phone
       FROM users u
       LEFT JOIN tenant_profiles tp ON tp.tenant_id = u.id
       WHERE u.id = ?\`
    ).bind(userId).first();
  } catch (error) {
    const message = String(error?.message || error || "");
    const compatibleMissingSchema =
      message.includes("no such table: tenant_profiles") ||
      message.includes("no such column: u.plan");

    if (!compatibleMissingSchema) throw error;

    return env.DB.prepare(
      \`SELECT
         u.id,
         u.email,
         COALESCE(u.plan_id, 'free') AS plan,
         u.name AS company_name,
         u.contact_phone AS company_phone
       FROM users u
       WHERE u.id = ?\`
    ).bind(userId).first();
  }
}`;

if (source.includes(after)) {
  console.log("Compatibilidad de solicitante ya instalada.");
  process.exit(0);
}

if (!source.includes(before)) {
  throw new Error("No se encontró el bloque loadRequester esperado.");
}

fs.writeFileSync(path, source.replace(before, after));
console.log("Compatibilidad INTAP CODE / Flipbook Preview instalada correctamente.");
