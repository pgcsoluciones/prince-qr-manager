import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("src/support-ticket-api.js", "utf8");

const checks = [
  ["mantiene esquema productivo", /LEFT JOIN tenant_profiles tp ON tp\.tenant_id = u\.id/],
  ["mantiene users.plan de INTAP CODE", /u\.plan, tp\.company_name, tp\.company_phone/],
  ["fallback solo ante incompatibilidad conocida", /no such table: tenant_profiles/],
  ["fallback también cubre ausencia de users.plan", /no such column: u\.plan/],
  ["usa plan_id en Preview", /COALESCE\(u\.plan_id, 'free'\) AS plan/],
  ["usa nombre como empresa en Preview", /u\.name AS company_name/],
  ["usa teléfono de contacto en Preview", /u\.contact_phone AS company_phone/],
  ["no oculta errores desconocidos", /if \(!compatibleMissingSchema\) throw error/],
];

for (const [name, pattern] of checks) {
  assert.match(source, pattern, name);
  console.log(`✓ ${name}`);
}

console.log(`\nSupport Requester Compatibility: ${checks.length}/${checks.length} bloques pasaron`);
