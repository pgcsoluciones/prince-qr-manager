import fs from "node:fs";

const appPath = "frontend/src/App.jsx";
const layoutPath = "frontend/src/pages/AdminLayout.jsx";

function replaceOnce(source, search, replacement, label) {
  if (!source.includes(search)) {
    throw new Error(`No se encontró el ancla: ${label}`);
  }
  return source.replace(search, replacement);
}

let app = fs.readFileSync(appPath, "utf8");
if (!app.includes('AdminSupportPage from "./pages/admin/AdminSupportPage.jsx"')) {
  app = replaceOnce(
    app,
    'import AdminBillingPage from "./pages/admin/AdminBillingPage.jsx";',
    'import AdminBillingPage from "./pages/admin/AdminBillingPage.jsx";\nimport AdminSupportPage from "./pages/admin/AdminSupportPage.jsx";',
    "import AdminSupportPage"
  );
}

if (!app.includes('<Route path="support" element={<AdminSupportPage />} />')) {
  app = replaceOnce(
    app,
    '            <Route path="billing" element={<AdminBillingPage />} />',
    '            <Route path="billing" element={<AdminBillingPage />} />\n            <Route path="support" element={<AdminSupportPage />} />',
    "ruta support"
  );
}
fs.writeFileSync(appPath, app);

let layout = fs.readFileSync(layoutPath, "utf8");
if (!layout.includes('support: (')) {
  layout = replaceOnce(
    layout,
    '    bell: (',
    '    support: (\n      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>\n        <path strokeLinecap="round" strokeLinejoin="round" d="M18 10c0 3.314-2.686 6-6 6a6.7 6.7 0 01-2.4-.44L5 17l1.44-3.6A5.97 5.97 0 016 10c0-3.314 2.686-6 6-6s6 2.686 6 6z" />\n        <path strokeLinecap="round" d="M9.5 10h.01M12 10h.01M14.5 10h.01" />\n      </svg>\n    ),\n    bell: (',
    "icono support"
  );
}

if (!layout.includes('to: "/admin/support"')) {
  layout = replaceOnce(
    layout,
    '  { to: "/admin/notifications",  icon: "bell",           label: "Notificaciones"  },',
    '  { to: "/admin/notifications",  icon: "bell",           label: "Notificaciones"  },\n  { to: "/admin/support",        icon: "support",        label: "Soporte"         },',
    "nav support"
  );
}
fs.writeFileSync(layoutPath, layout);

console.log("Panel de soporte Super Admin integrado correctamente.");
