import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("frontend/src/App.jsx", "utf8");
const layout = fs.readFileSync("frontend/src/pages/AdminLayout.jsx", "utf8");
const page = fs.readFileSync("frontend/src/pages/admin/AdminSupportPage.jsx", "utf8");
const api = fs.readFileSync("src/support-ticket-api.js", "utf8");

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
    console.log(`✓ ${name}`);
  } catch (error) {
    results.push({ name, ok: false });
    console.error(`✗ ${name}`);
    console.error(error.message);
  }
}

test("ruta exclusiva de superadmin", () => {
  assert.match(app, /import AdminSupportPage from "\.\/pages\/admin\/AdminSupportPage\.jsx";/);
  assert.match(app, /<Route path="support" element={<AdminSupportPage \/>} \/>/);
  assert.match(app, /<ProtectedRoute roles=\{\["superadmin"\]\}>/);
});

test("acceso desde navegación administrativa", () => {
  assert.match(layout, /to: "\/admin\/support"/);
  assert.match(layout, /label: "Soporte"/);
});

test("listado y filtros usan la API real", () => {
  assert.match(page, /apiFetch\(`\/api\/support\/tickets\$\{query\}`\)/);
  assert.match(page, /statusFilter/);
  assert.match(page, /Todos los estados/);
});

test("detalle del ticket usa endpoint individual", () => {
  assert.match(page, /apiFetch\(`\/api\/support\/tickets\/\$\{encodeURIComponent\(ticketId\)\}`\)/);
  assert.match(page, /detail\?\.ticket/);
  assert.match(page, /detail\?\.messages/);
});

test("actualización administrativa cubre estado severidad y responsable", () => {
  assert.match(page, /method: "PATCH"/);
  assert.match(page, /updateTicket\(\{ status: e\.target\.value \}\)/);
  assert.match(page, /updateTicket\(\{ severity: e\.target\.value \}\)/);
  assert.match(page, /updateTicket\(\{ assigned_to_user_id: value \}\)/);
});

test("mensajes públicos y notas internas", () => {
  assert.match(page, /visibility/);
  assert.match(page, /<option value="public">Respuesta pública<\/option>/);
  assert.match(page, /<option value="internal">Nota interna<\/option>/);
  assert.match(page, /\/messages`/);
  assert.match(page, /crypto\.randomUUID\(\)/);
});

test("la API protege aislamiento y permisos", () => {
  assert.match(api, /ticket\.tenant_id === user\?\.sub/);
  assert.match(api, /user\?\.role === "superadmin"/);
  assert.match(api, /body\?\.visibility === "internal"/);
  assert.match(api, /visibility = isSuperadmin\(user\)/);
  assert.match(api, /assigned_to_user_id/);
});

test("la interfaz muestra prioridad real separada de severidad", () => {
  assert.match(page, /service_priority/);
  assert.match(page, /SERVICE_LABELS/);
  assert.match(page, /SEVERITY_STYLES/);
});

const failed = results.filter((item) => !item.ok);
console.log(`\nAdmin Support Panel: ${results.length - failed.length}/${results.length} bloques pasaron`);
if (failed.length) process.exit(1);
