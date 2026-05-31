# BITÁCORA DE DESARROLLO — Intap Code / Intap TRACE

**Sesión:** 2026-05-31
**Rama:** `claude/epic-gates-s5IVv`
**Entorno:** Cloudflare Workers + D1 + R2 | React 18 + Vite + Tailwind CSS 3

---

## 1. CONTEXTO GENERAL DEL PROYECTO

| Item | Detalle |
|------|---------|
| **Frontend** | code.intaprd.com (Cloudflare Pages) |
| **API** | api.code.intaprd.com (Cloudflare Workers) |
| **TRACE QRs** | qr.intaprd.com/t/:slug |
| **DB** | Cloudflare D1 (SQLite) |
| **Auth** | JWT HS256 vía `@tsndr/cloudflare-worker-jwt`, token `qr_token` en localStorage |
| **Roles** | superadmin → enterprise → tenant (usuario normal) |
| **IA** | `callLLM()` multi-proveedor: Claude / OpenAI / Gemini / Groq |

---

## 2. COMMITS REALIZADOS EN ESTA SESIÓN

```
d97f379  Add floating AI chat widget + improve agent configuration
797fc93  Show live QR preview in Design tab
97ad53c  Fix onboarding loop and dashboard redirect
e1207e8  Replace qr-code-styling with qrcode for reliable QR rendering
bb19ba3  Fix toast shortcuts, onboarding per-user, QR panel, mobile responsive, abbreviations
5a739f2  Fix login blocked when is_active is NULL in DB
ac5c5d4  Add PDF download to TraceQRPanel
f2ff01c  Fix TRACE form, QR panel, responses tab, and CRM temperature
```

---

## 3. PROBLEMAS DETECTADOS Y CÓMO SE RESOLVIERON

### 3.1 QR no renderiza en producción (Cloudflare Pages)

- **Síntoma:** Panel de QR mostraba spinner infinito al abrir el modal `TraceQRPanel`.
- **Causa raíz:** La librería `qr-code-styling` v1.9.2 utiliza Web Workers internamente; Cloudflare Pages los bloquea en su entorno de edge, causando que la promesa nunca resuelva.
- **Solución:** Reemplazo total por `qrcode` (npm). Esta librería usa canvas nativo sin workers.
  - `QRCode.toCanvas(ref, url, { width, margin, errorCorrectionLevel, color })` — síncrono y confiable.
  - `QRCode.toString(url, { type: "svg" })` — para exportación SVG.
- **Archivo:** `frontend/src/components/TraceQRPanel.jsx`

---

### 3.2 QR desaparece al cambiar de pestaña

- **Síntoma:** Al abrir "Diseño" y volver a "Código QR", el canvas quedaba en blanco.
- **Causa raíz:** El canvas se renderizaba condicionalmente (`{tab === "qr" && <canvas>}`), lo que desmontaba el componente y destruía el `ref`.
- **Solución:** El canvas principal **siempre está montado** en el DOM; se oculta con clase CSS `hidden` cuando no es la pestaña activa. El `useEffect` también renderiza a un segundo canvas (`previewCanvasRef`) para la pestaña Diseño.

```jsx
// Patrón clave:
<div className={tab !== "qr" ? "hidden" : ""}>
  <canvas ref={canvasRef} />
</div>
{tab === "design" && <canvas ref={previewCanvasRef} />}
```

---

### 3.3 `toast.success is not a function`

- **Síntoma:** Al subir logo u otras acciones, la consola mostraba `W.success is not a function`.
- **Causa raíz:** `Toast.jsx` exportaba `toast` como función plana; se llamaba con métodos `.success()` / `.error()` que no existían.
- **Solución:**

```js
toast.success = (msg) => toast(msg, "success");
toast.error   = (msg) => toast(msg, "error");
toast.warning = (msg) => toast(msg, "warning");
```

- **Archivo:** `frontend/src/components/Toast.jsx`

---

### 3.4 Login bloqueado desde móvil

- **Síntoma:** Credenciales válidas daban "Acceso denegado" desde dispositivo móvil.
- **Causa raíz:** La condición era `if (!user || !user.is_active)`. Para usuarios donde `is_active` era `NULL` en DB, `!null === true` bloqueaba el login.
- **Solución:**

```js
// Antes:
if (!user || !user.is_active) return error(401);

// Después:
if (!user) return error(401, "Usuario no encontrado");
if (user.is_active === 0) return error(403, "Cuenta desactivada");
```

- **Migración creada:** `fix_users_is_active.sql`

```sql
UPDATE users SET is_active = 1 WHERE is_active IS NULL;
```

- **Archivo:** `src/index.js` — handler de `POST /api/auth/login`

---

### 3.5 Onboarding se mostraba en cada dispositivo / tras refresh

- **Síntoma:** Usuarios que ya completaron onboarding eran redirigidos al entrar desde móvil o tras limpiar caché. El botón "Ir al dashboard" quedaba en bucle infinito.
- **Causa raíz 1:** `OnboardingGate` solo revisaba la clave nueva `onboarding_done_<userId>`, pero usuarios existentes tenían la clave antigua `onboarding_done` o nada.
- **Causa raíz 2:** El botón "Ir al dashboard" navegaba sin marcar el flag como completado.
- **Causa raíz 3:** `handleFinish` no persistía el estado en el servidor.
- **Solución en `App.jsx`:**

```jsx
const done =
  localStorage.getItem("onboarding_done") ||
  localStorage.getItem("onboarding_done_" + user.id) ||
  user?.settings?.onboarding_done;
if (!done) return <Navigate to="/onboarding" replace />;
```

- **Solución en `OnboardingPage.jsx`:**
  - `handleFinish` llama `api.put("/api/settings", { onboarding_done: true })` antes de navegar.
  - El botón "Ir al dashboard" establece `localStorage.setItem("onboarding_done", "1")` antes de navegar.
- **Backend:** `/api/auth/me` ahora devuelve el campo `settings` parseado como objeto.
- **Archivos:** `frontend/src/App.jsx`, `frontend/src/pages/OnboardingPage.jsx`, `src/index.js`

---

### 3.6 Formulario TRACE: campo "Otro" sin texto libre

- **Síntoma:** Al seleccionar "Otro" como referido, no había campo para escribir la fuente.
- **Solución:** En `serveTraceForm()` se añadió un `<input id="otroReferral">` que aparece/desaparece via `onchange` de los radio buttons. Al submit, si `referral === "otro"` se usa el valor del campo libre.
- **Archivo:** `src/index.js`

---

### 3.7 Formulario de contacto TRACE incompleto

- **Síntoma:** Solo pedía email; se necesitaba nombre + teléfono + correo.
- **Solución:** Se añadieron campos `contactName` y `contactPhone` al formulario. Se actualizó el INSERT de `trace_responses` y el UPSERT de `trace_contacts`.
- **Migración:** `alter_trace_responses_contact.sql`

```sql
ALTER TABLE trace_responses ADD COLUMN contact_name TEXT;
ALTER TABLE trace_responses ADD COLUMN contact_phone TEXT;
ALTER TABLE trace_contacts ADD COLUMN contact_name TEXT;
ALTER TABLE trace_contacts ADD COLUMN contact_phone TEXT;
```

---

### 3.8 Abreviaturas en panel de Respuestas

- **Síntoma:** Etiquetas crípticas: "STAFF", "NPS Mín.", "NPS Máx.", etc.
- **Solución:**

```js
const RESPONDENT_LABELS = {
  staff:     "Personal / Staff",
  anonymous: "Anónimo / Cliente",
  customer:  "Cliente",
};
```

- **Archivos:** `frontend/src/pages/TraceResponsesPage.jsx`, `frontend/src/pages/TracePage.jsx`

---

### 3.9 Filas de respuestas no expandibles

- **Síntoma:** Al hacer clic en una respuesta no se veía el detalle.
- **Solución:** Se agregó estado `expanded` en `TracePage.jsx`. Cada fila al hacer clic muestra una grilla con: dispositivo, OS, navegador, país/ciudad, idioma, pantalla, tiempo en página, secuencia de escaneos, referido, datos de contacto, checklist y respuestas de encuesta.

---

### 3.10 Temperatura CRM "Promotor" sin contexto

- **Síntoma:** La columna mostraba "Promotor" sin explicar qué significa.
- **Solución:** `getTemperature()` retorna campo `tooltip` con descripción de rangos NPS. El badge usa `title={temp.tooltip}` con `cursor-help`.
- **Archivo:** `frontend/src/components/TraceCRMTab.jsx`

---

### 3.11 Descarga PDF no implementada

- **Síntoma:** Faltaba el formato PDF en los botones de descarga del panel QR.
- **Solución:** Se abre una ventana nueva con el canvas exportado como PNG, se inyecta HTML con estilos de impresión y se llama `window.print()` automáticamente.

---

### 3.12 Overflow horizontal en móvil (TRACE)

- **Síntoma:** Pantallas de TRACE sobresalían del viewport en móviles generando scroll horizontal no deseado.
- **Solución:** `overflow-x-hidden` en el contenedor raíz de `TracePage.jsx`; tabs con `overflow-x-auto scrollbar-none` para scroll suave sin barra visible.

---

### 3.13 Vista previa QR en pestaña Diseño no aparecía

- **Síntoma:** Al editar colores en "Diseño", no había preview del QR resultante.
- **Solución:** Se añadió un segundo `canvasRef` (`previewCanvasRef`, 160px) que se renderiza en el mismo `useEffect` y se muestra únicamente en la pestaña Diseño.

---

## 4. ARCHIVOS CREADOS

| Archivo | Descripción |
|---------|-------------|
| `frontend/src/components/AIChat.jsx` | Widget flotante de chat IA (burbuja bottom-right) |
| `alter_ai_config.sql` | Migración: agrega `max_tokens_per_response` y `knowledge_base` a `tenant_ai_config` |
| `alter_trace_responses_contact.sql` | Migración: agrega `contact_name`, `contact_phone` a `trace_responses` y `trace_contacts` |
| `fix_users_is_active.sql` | Migración: normaliza `is_active = 1` donde era NULL |

---

## 5. ARCHIVOS MODIFICADOS

| Archivo | Cambios principales |
|---------|---------------------|
| `src/index.js` | Fix login, `/api/auth/me` devuelve settings, `serveTraceForm()` campo libre "Otro" y 3 campos de contacto, INSERT/UPSERT con nuevas columnas, `/api/ai/chat` con history/max_tokens/knowledge_base, PUT `/api/settings/ai` con nuevos campos |
| `frontend/src/components/TraceQRPanel.jsx` | Reescritura completa: usa `qrcode`, doble canvas (280px + 160px preview), descargas PNG/JPEG/WebP/SVG/PDF, paleta de colores, selector de corrección de error |
| `frontend/src/components/Toast.jsx` | Agrega `toast.success`, `toast.error`, `toast.warning` como métodos del objeto función |
| `frontend/src/components/TraceCRMTab.jsx` | `getTemperature()` retorna tooltip, badge con `cursor-help` y `title` |
| `frontend/src/App.jsx` | `OnboardingGate` verifica 3 fuentes de estado de onboarding |
| `frontend/src/pages/OnboardingPage.jsx` | `handleFinish` guarda en API y localStorage; botón "Ir al dashboard" marca flag |
| `frontend/src/pages/TracePage.jsx` | Filas expandibles en ResponsesTab, overflow-x-hidden, tabs scrollables |
| `frontend/src/pages/TraceResponsesPage.jsx` | Etiquetas completas sin abreviaturas, TypeBadge con labels, stats sin siglas |
| `frontend/src/pages/DashboardLayout.jsx` | Reemplaza `AIBanner` por `AIChat` |
| `frontend/src/pages/SettingsPage.jsx` | Pestaña "Agente IA": selector max_tokens (300/500/1000/2000/4000) + textarea knowledge_base |

---

## 6. MIGRACIONES DE BASE DE DATOS (D1)

Ejecutar con:

```bash
wrangler d1 execute <DB_NAME> --file=<migration>.sql --env production
```

| Archivo SQL | Tablas afectadas | Estado |
|-------------|-----------------|--------|
| `fix_users_is_active.sql` | `users` | ✅ Aplicada |
| `alter_trace_responses_contact.sql` | `trace_responses`, `trace_contacts` | ✅ Aplicada |
| `alter_ai_config.sql` | `tenant_ai_config` | ✅ Aplicada |

---

## 7. ARQUITECTURA DEL WIDGET AI CHAT

```
AIChat.jsx
│
├── Estado: open, minimized, messages[], input, loading
├── Persistencia: sessionStorage["ai_chat_messages"]
│
├── UI cerrado: botón 56px — posición fixed bottom-6 right-6 (blue-indigo gradient)
│   └── Ícono robot + punto verde "online"
│
└── UI abierto: dialog 360×520px
    ├── Header: avatar "IA", "Intap IA", "En línea", botones minimize / close
    ├── Mensajes: AI = izquierda / gris, Usuario = derecha / azul, timestamps
    ├── Loading: 3 puntos animados
    ├── Pills rápidas: preguntas sugeridas cuando el chat está vacío
    └── Input: Enter = enviar, Shift+Enter = nueva línea

API Call → POST /api/ai/chat
  Body:    { message: string, history: Message[] (últimos 10) }
  Response: { reply: string }

Backend: usa desde tenant_ai_config
  - model                    → modelo configurado por el tenant
  - max_tokens_per_response  → límite de tokens (DEFAULT 1000)
  - knowledge_base           → contexto del negocio (prepended al system prompt)
  - system_prompt            → instrucciones del agente
```

---

## 8. ESTRUCTURA DE ARCHIVOS CLAVE

```
frontend/src/
├── components/
│   ├── AIChat.jsx              ← NUEVO
│   ├── TraceQRPanel.jsx        ← MODIFICADO (reescritura completa)
│   ├── Toast.jsx               ← MODIFICADO
│   ├── TraceCRMTab.jsx         ← MODIFICADO
│   ├── TraceLandingPreview.jsx
│   └── TracePointModal.jsx
├── pages/
│   ├── App.jsx                 ← MODIFICADO
│   ├── DashboardLayout.jsx     ← MODIFICADO
│   ├── OnboardingPage.jsx      ← MODIFICADO
│   ├── SettingsPage.jsx        ← MODIFICADO
│   ├── TracePage.jsx           ← MODIFICADO
│   ├── TraceResponsesPage.jsx  ← MODIFICADO
│   └── admin/
src/
└── index.js                    ← MODIFICADO (backend monolítico)
```

---

## 9. MÉTODO DE TRABAJO UTILIZADO

1. **Bug triage visual**: el usuario enviaba screenshots con los problemas marcados; se analizaron causas raíz antes de tocar código.
2. **Cambios atómicos por commit**: cada fix/feature en su propio commit con mensaje descriptivo.
3. **Migraciones SQL separadas**: nunca se modificó `schema.sql` directamente; se usaron archivos `alter_*.sql` independientes aplicables en producción sin downtime.
4. **Fixes quirúrgicos**: no se refactorizó lo que funcionaba; solo se tocaron las líneas necesarias.
5. **Ciclo de despliegue**: código → push → el usuario ejecuta `wrangler deploy` + `wrangler d1 execute` → feedback → siguiente fix.

---

## 10. VARIABLES DE ENTORNO REQUERIDAS

```bash
# Secrets en Cloudflare Workers (wrangler secret put <KEY>)
JWT_SECRET=...
ANTHROPIC_API_KEY=...   # para Claude (principal)
OPENAI_API_KEY=...      # opcional
GEMINI_API_KEY=...      # opcional
GROQ_API_KEY=...        # opcional
```

---

## 11. COMANDOS DE DESPLIEGUE

```bash
# Backend (Workers)
wrangler deploy

# Frontend (Pages)
cd frontend
npm run build
wrangler pages deploy dist --project-name=intap-code

# Migraciones D1 (ejecutar una sola vez por entorno)
wrangler d1 execute <DB_NAME> --file=fix_users_is_active.sql --env production
wrangler d1 execute <DB_NAME> --file=alter_trace_responses_contact.sql --env production
wrangler d1 execute <DB_NAME> --file=alter_ai_config.sql --env production
```

---

## 12. LO QUE ESTÁ COMPLETADO

- [x] QR rendering confiable en producción (Cloudflare Pages)
- [x] Descarga QR en PNG, JPEG, WebP, SVG, PDF
- [x] Preview en vivo en pestaña "Diseño"
- [x] Login funciona con `is_active = NULL` (usuarios legacy)
- [x] Onboarding per-user, multi-dispositivo, sin bucles
- [x] `toast.success / error / warning` funcionan
- [x] Formulario TRACE con campo libre para "Otro" referido
- [x] Formulario contacto TRACE con nombre + teléfono + correo
- [x] Respuestas expandibles con detalle completo
- [x] Etiquetas completas sin abreviaturas en módulo TRACE
- [x] Temperatura CRM con tooltip explicativo de rangos NPS
- [x] Mobile: sin overflow horizontal en TRACE
- [x] Widget flotante AI Chat bottom-right en todo el dashboard
- [x] Settings: configurar max tokens y base de conocimiento de la IA
- [x] Backend AI Chat soporta historial de conversación

---

## 13. LO QUE FALTA POR COMPLETAR

### Alta prioridad
- [ ] **Validación de formularios**: ningún formulario (TRACE, config puntos, perfil) muestra advertencias de campos faltantes. Agregar validación client-side con mensajes inline antes de cada submit.
- [ ] **Tooltips vacíos**: algunos `title=""` quedaron sin contenido. Revisar `TraceConfigTab.jsx` y `TracePointModal.jsx`.

### Media prioridad
- [ ] **Optimización móvil profunda**: los formularios de configuración de punto TRACE y el modal de crear punto no están optimizados para pantallas < 400px. Los grids de 2 columnas deben colapsar a 1 columna en móvil.
- [ ] **Historial de actividad de usuario**: no hay log de acciones (qué QRs creó, qué cambios hizo). Útil para auditoría.
- [ ] **SVG en Illustrator**: el SVG exportado genera warning "El recorte se perderá al exportar a Tiny SVG". Es un warning de Illustrator con `clipPath`, no es un bug nuestro, pero se puede agregar una nota en la UI.

### Baja prioridad / Roadmap
- [ ] **Estilos decorativos de puntos QR**: la librería `qrcode` no soporta dots/rounded corners como `qr-code-styling`. Si se requieren, generar el QR en el Worker (server-side canvas) o explorar post-processing en canvas.
- [ ] **Logo en centro del QR**: el campo `brand_logo` existe en DB pero no se sobreimprime en el canvas. Requiere error correction level mínimo "H".
- [ ] **Notificaciones en tiempo real**: la infraestructura existe (`alert_config` en `trace_points`) pero los WebSocket/SSE no están implementados.
- [ ] **IA con acceso a datos reales del tenant**: el chat responde preguntas generales pero no tiene acceso a métricas reales. Se necesita inyectar estadísticas del tenant en el contexto del sistema.

---

## 14. PRÓXIMOS PASOS SEGÚN MAPA DE RUTA

### Paso 1 — Validación de formularios (1-2 días)

Archivos a tocar:
- `frontend/src/components/TracePointModal.jsx`
- `frontend/src/pages/SettingsPage.jsx`
- `frontend/src/pages/ProfilePage.jsx`

Patrón sugerido:

```js
// hook reutilizable
function useFormValidation(rules) {
  const [errors, setErrors] = useState({});
  const validate = (data) => { /* valida contra rules */ };
  return { errors, validate, isValid: Object.keys(errors).length === 0 };
}
```

---

### Paso 2 — Optimización móvil profunda (1-2 días)

Archivos a tocar:
- `frontend/src/components/TracePointModal.jsx` — grids `md:grid-cols-2`
- `frontend/src/components/TraceConfigTab.jsx`
- `frontend/src/pages/TracePage.jsx` — tablas → tarjetas en móvil

---

### Paso 3 — Logo en centro del QR (1 día)

Archivo: `frontend/src/components/TraceQRPanel.jsx`

```js
// Después de QRCode.toCanvas():
const ctx = canvas.getContext("2d");
const img = new Image();
img.src = logoUrl;
img.onload = () => {
  const size = canvas.width * 0.2;
  const x = (canvas.width - size) / 2;
  const y = (canvas.height - size) / 2;
  ctx.fillStyle = "#fff";
  ctx.fillRect(x - 4, y - 4, size + 8, size + 8);
  ctx.drawImage(img, x, y, size, size);
};
```

> Nota: usar error correction level `"H"` cuando hay logo (30% de redundancia).

---

### Paso 4 — IA con acceso a datos del tenant (2-3 días)

Archivos a tocar:
- `src/index.js` — endpoint `/api/ai/chat`: inyectar métricas reales en el system prompt
- `frontend/src/components/AIChat.jsx` — pasar el módulo activo como contexto

El endpoint debería recibir opcionalmente `{ module: "trace" | "links" }` y hacer un SELECT de estadísticas del tenant para incluirlas.

---

### Paso 5 — Notificaciones en tiempo real

Evaluar: **Cloudflare Durable Objects** (WebSocket nativo) vs **polling cada 30s** (más simple).
Las columnas `alert_config` ya existen en `trace_points`; solo falta el canal de entrega.

---

## 15. RECOMENDACIONES PARA EL EQUIPO

1. **No modificar `schema.sql` en producción** — siempre crear un nuevo `alter_*.sql`.
2. **`src/index.js` es monolítico** (~4000+ líneas). Planificar una sesión de refactoring para dividirlo en módulos: `routes/auth.js`, `routes/trace.js`, `routes/qr.js`, etc.
3. **La librería `qrcode`** no soporta estilos decorativos. Si el cliente los requiere, evaluar generación server-side o API externa.
4. **`sessionStorage` para el chat IA**: los mensajes se pierden al cerrar el tab. Si se quiere persistencia real entre sesiones, crear tabla `ai_chat_history` en D1.
5. **Test de onboarding**: al crear usuario nuevo de prueba, verificar que el flag `onboarding_done` en `users.settings` se guarda correctamente. Es la fuente de verdad cross-device.
6. **El campo `knowledge_base`** en `tenant_ai_config` es texto plano. Si crece, considerar dividirlo en secciones JSON para mejor control de tokens enviados al LLM.
7. **Errores silenciosos en Workers**: el `console.error` en Cloudflare Workers va a los logs de Wrangler, no al navegador. Usar `wrangler tail` para debug en tiempo real en producción.

---

*Bitácora generada: 2026-05-31 | Rama: `claude/epic-gates-s5IVv` | Último commit: `d97f379`*
