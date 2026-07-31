import fs from "node:fs";

const indexPath = "src/index.js";
const supportPath = "src/support-ticket-api.js";

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

let indexSource = fs.readFileSync(indexPath, "utf8");
let supportSource = fs.readFileSync(supportPath, "utf8");

const importLine = 'import { handleSupportTicketApi } from "./support-ticket-api.js";';
if (!indexSource.includes(importLine)) {
  const anchor = '} from "./codi-agent-core.js";';
  if (!indexSource.includes(anchor)) fail("No se encontró el bloque de imports de Codi");
  indexSource = indexSource.replace(anchor, `${anchor}\n${importLine}`);
}

const routeBlock = `      // ── Support tickets: authenticated tenant or Super Admin ──────────────
      if (path.startsWith("/api/support/tickets")) {
        const supportUser = await getUser(request, env);
        const authError = requireAuth(supportUser);
        if (authError) return authError;

        const supportResponse = await handleSupportTicketApi({
          request,
          env,
          user: supportUser,
        });

        if (supportResponse) return supportResponse;
      }

`;

if (!indexSource.includes("handleSupportTicketApi({")) {
  const anchor = `    try {\n      // ══════════════════════════════════════════\n      // REDIRECCIÓN PÚBLICA /:slug`;
  if (!indexSource.includes(anchor)) fail("No se encontró el inicio del router principal");
  indexSource = indexSource.replace(
    anchor,
    `    try {\n${routeBlock}      // ══════════════════════════════════════════\n      // REDIRECCIÓN PÚBLICA /:slug`
  );
}

if (!supportSource.includes('"Access-Control-Allow-Origin"')) {
  const oldHeaders = `    headers: {\n      "content-type": "application/json; charset=utf-8",\n    },`;
  const newHeaders = `    headers: {\n      "content-type": "application/json; charset=utf-8",\n      "Access-Control-Allow-Origin": "*",\n      "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",\n      "Access-Control-Allow-Headers": "Content-Type, Authorization",\n    },`;
  if (!supportSource.includes(oldHeaders)) fail("No se encontró el bloque de headers del módulo de soporte");
  supportSource = supportSource.replace(oldHeaders, newHeaders);
}

fs.writeFileSync(indexPath, indexSource);
fs.writeFileSync(supportPath, supportSource);

console.log("Support Ticket API integrada correctamente.");
