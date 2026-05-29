/**
 * prince-qr-manager-backend — SaaS QR dinámico
 * Stack: Cloudflare Workers + D1 + KV
 * Roles: superadmin | enterprise | tenant
 */

import jwt from "@tsndr/cloudflare-worker-jwt";
import bcrypt from "bcryptjs";

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function uuid() { return crypto.randomUUID(); }

function deviceType(ua = "") {
  const u = ua.toLowerCase();
  if (u.includes("mobi") || u.includes("android") || u.includes("iphone")) return "mobile";
  if (u.includes("tablet") || u.includes("ipad")) return "tablet";
  return "desktop";
}

// ──────────────────────────────────────────────
// Redirect logic (programmatic)
// ──────────────────────────────────────────────

async function resolveDestination(link, scanCount, country, device) {
  const mode  = link.redirect_mode || "direct";
  const rules = link.redirect_rules ? JSON.parse(link.redirect_rules) : null;

  switch (mode) {
    case "weighted":
    case "ab_test": {
      if (!Array.isArray(rules) || rules.length === 0) return link.destination_url;
      const total = rules.reduce((s, r) => s + (r.weight || 1), 0);
      let rand = Math.random() * total;
      for (const rule of rules) {
        rand -= (rule.weight || 1);
        if (rand <= 0) return rule.url;
      }
      return rules[rules.length - 1].url;
    }
    case "sequential": {
      if (!Array.isArray(rules) || rules.length === 0) return link.destination_url;
      return rules[scanCount % rules.length].url;
    }
    case "geo": {
      if (!Array.isArray(rules)) return link.destination_url;
      const match = rules.find((r) => r.country?.toUpperCase() === country?.toUpperCase());
      return match?.url || link.destination_url;
    }
    case "device": {
      if (!rules) return link.destination_url;
      return rules[device] || link.destination_url;
    }
    default:
      return link.destination_url;
  }
}

// ──────────────────────────────────────────────
// JWT helpers
// ──────────────────────────────────────────────

async function signToken(payload, secret) {
  return jwt.sign({ ...payload, iat: Math.floor(Date.now() / 1000) }, secret, { algorithm: "HS256" });
}

async function verifyToken(token, secret) {
  const ok = await jwt.verify(token, secret, { algorithm: "HS256" });
  if (!ok) return null;
  return jwt.decode(token).payload;
}

async function getUser(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.replace("Bearer ", "").trim();
  if (!token) return null;
  const secret = env.JWT_SECRET || "changeme-set-in-cloudflare-dashboard";
  return verifyToken(token, secret);
}

function requireAuth(user, ...roles) {
  if (!user) return json({ ok: false, error: "No autenticado" }, 401);
  if (roles.length && !roles.includes(user.role)) {
    return json({ ok: false, error: "Acceso denegado" }, 403);
  }
  return null;
}

// ──────────────────────────────────────────────
// Plan helpers
// ──────────────────────────────────────────────

async function getPlan(db, plan) {
  return db.prepare("SELECT * FROM plan_configs WHERE plan = ?").bind(plan).first();
}

async function countUserLinks(db, userId) {
  const r = await db.prepare("SELECT COUNT(*) as c FROM short_links WHERE user_id = ?").bind(userId).first();
  return r?.c ?? 0;
}

// Feature gates por plan
const PLAN_FEATURES = {
  free:       { redirect_modes: ["direct"],                           expiration: false, max_scans: false },
  starter:    { redirect_modes: ["direct"],                           expiration: true,  max_scans: false },
  pro:        { redirect_modes: ["direct","weighted","ab_test","geo","device"], expiration: true, max_scans: true },
  enterprise: { redirect_modes: ["direct","weighted","ab_test","geo","device","sequential"], expiration: true, max_scans: true },
};

function canUseFeature(plan, feature, value) {
  const f = PLAN_FEATURES[plan] || PLAN_FEATURES.free;
  if (feature === "redirect_mode") return f.redirect_modes.includes(value);
  return f[feature] === true;
}

// ──────────────────────────────────────────────
// Analytics
// ──────────────────────────────────────────────

async function saveAnalytics(db, slug, country, city, device, ua) {
  try {
    await db.prepare(
      "INSERT INTO qr_analytics (slug, country, city, device, user_agent) VALUES (?,?,?,?,?)"
    ).bind(slug, country, city, device, ua).run();
  } catch (_) {}
}

// ──────────────────────────────────────────────
// TRACE form HTML renderer (shared between t/ prefix and direct ID)
// ──────────────────────────────────────────────

function serveTraceForm(tracePoint) {
  const checklistItems = JSON.parse(tracePoint.checklist_items || "[]");
  const surveyQuestions = JSON.parse(tracePoint.survey_questions || "[]");
  const qrType = tracePoint.qr_type || "mixed";
  const brandColor = tracePoint.brand_color || "#2563eb";
  const brandLogo = tracePoint.brand_logo || null;

  const checklistHtml = (qrType === "checklist" || qrType === "mixed") && checklistItems.length > 0 ? `
    <div class="section">
      <h2 class="section-title">Checklist de verificación</h2>
      ${checklistItems.map(item => `
        <label class="checklist-item">
          <input type="checkbox" name="checklist_${item.id}" id="check_${item.id}" ${item.required ? 'data-required="true"' : ''}>
          <span>${item.label}${item.required ? ' <span class="required-badge">*</span>' : ''}</span>
        </label>
      `).join("")}
    </div>
  ` : "";

  const surveyHtml = (qrType === "survey" || qrType === "mixed") && surveyQuestions.length > 0 ? `
    <div class="section">
      <h2 class="section-title">Encuesta</h2>
      ${surveyQuestions.map(q => {
        if (q.type === "nps") return `
          <div class="question" id="q_${q.id}">
            <p class="question-label">${q.label}</p>
            <div class="nps-buttons">
              ${[1,2,3,4,5,6,7,8,9,10].map(n => `<button type="button" class="nps-btn" data-q="${q.id}" data-val="${n}" onclick="selectNPS('${q.id}',${n},this)">${n}</button>`).join("")}
            </div>
            <div class="nps-labels"><span>Muy malo</span><span>Excelente</span></div>
          </div>`;
        if (q.type === "rating") return `
          <div class="question" id="q_${q.id}">
            <p class="question-label">${q.label}</p>
            <div class="stars" id="stars_${q.id}">
              ${[1,2,3,4,5].map(n => `<span class="star" data-q="${q.id}" data-val="${n}" onclick="selectStar('${q.id}',${n})">&#9733;</span>`).join("")}
            </div>
          </div>`;
        if (q.type === "yesno") return `
          <div class="question" id="q_${q.id}">
            <p class="question-label">${q.label}</p>
            <div class="yesno-buttons">
              <button type="button" class="yesno-btn" data-q="${q.id}" data-val="yes" onclick="selectYesNo('${q.id}','yes',this)">Si</button>
              <button type="button" class="yesno-btn" data-q="${q.id}" data-val="no" onclick="selectYesNo('${q.id}','no',this)">No</button>
            </div>
          </div>`;
        return `
          <div class="question" id="q_${q.id}">
            <p class="question-label">${q.label}</p>
            <textarea class="text-input" id="text_${q.id}" placeholder="Escribe tu respuesta aqui..." rows="3"></textarea>
          </div>`;
      }).join("")}
    </div>
  ` : "";

  const htmlPage = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${tracePoint.name} - Intap TRACE</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Inter',sans-serif;background:#f1f5f9;min-height:100vh;padding:16px 16px 48px}
    .logo-bar{text-align:center;margin-bottom:16px;display:none}
    .logo-bar img{height:28px}
    .logo-text{font-size:15px;font-weight:700;color:${brandColor};letter-spacing:-0.3px}
    @media(min-width:640px){body{display:flex;align-items:flex-start;justify-content:center;padding:40px 16px 60px}.page-wrapper{width:100%;max-width:560px}.logo-bar{display:block}}
    .container{max-width:560px;width:100%;margin:0 auto}
    .header{background:linear-gradient(135deg,${brandColor},${brandColor}dd);color:white;border-radius:16px;padding:24px;margin-bottom:16px}
    @media(min-width:640px){.header{padding:32px 28px;margin-bottom:20px}}
    .header-badge{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,0.2);border-radius:20px;padding:4px 12px;font-size:12px;font-weight:600;margin-bottom:12px}
    .header h1{font-size:22px;font-weight:700;margin-bottom:4px}
    @media(min-width:640px){.header h1{font-size:26px}}
    .header .area{font-size:14px;opacity:0.85}
    .card{background:white;border-radius:16px;padding:20px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.07)}
    @media(min-width:640px){.card{padding:28px}}
    .section-title{font-size:15px;font-weight:600;color:#1e293b;margin-bottom:14px}
    .checklist-item{display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid #f1f5f9;cursor:pointer;min-height:44px}
    .checklist-item:last-child{border-bottom:none}
    .checklist-item input[type=checkbox]{width:22px;height:22px;accent-color:${brandColor};cursor:pointer;flex-shrink:0}
    .checklist-item span{font-size:14px;color:#374151}
    .required-badge{color:#ef4444;font-size:12px}
    .question{margin-bottom:20px}
    .question-label{font-size:14px;font-weight:500;color:#1e293b;margin-bottom:12px}
    .nps-buttons{display:flex;gap:8px;flex-wrap:wrap}
    .nps-btn{min-width:48px;height:48px;flex:1;border:2px solid #e2e8f0;border-radius:10px;background:white;font-size:15px;font-weight:600;cursor:pointer;transition:all 0.15s;color:#374151;min-height:44px}
    @media(min-width:640px){.nps-btn{min-width:44px;flex:none;width:48px}}
    .nps-btn:hover{border-color:${brandColor};color:${brandColor}}
    .nps-btn.selected{background:${brandColor};border-color:${brandColor};color:white}
    .nps-labels{display:flex;justify-content:space-between;margin-top:6px;font-size:11px;color:#94a3b8}
    .stars{display:flex;gap:8px}
    .star{font-size:36px;cursor:pointer;color:#e2e8f0;transition:color 0.15s;min-height:44px;display:flex;align-items:center}
    .star.selected,.star:hover{color:#f59e0b}
    .yesno-buttons{display:flex;gap:12px}
    .yesno-btn{flex:1;padding:14px;border:2px solid #e2e8f0;border-radius:10px;background:white;font-size:15px;font-weight:600;cursor:pointer;transition:all 0.15s;min-height:44px}
    .yesno-btn:hover{border-color:${brandColor}}
    .yesno-btn.selected{border-color:${brandColor};background:rgba(37,99,235,0.07);color:${brandColor}}
    .text-input,.email-input{width:100%;border:2px solid #e2e8f0;border-radius:10px;padding:14px;font-family:inherit;font-size:14px;resize:vertical;outline:none;transition:border-color 0.15s;min-height:44px}
    .text-input:focus,.email-input:focus{border-color:${brandColor}}
    .submit-btn{width:100%;padding:18px;background:${brandColor};color:white;border:none;border-radius:12px;font-size:16px;font-weight:700;cursor:pointer;transition:opacity 0.2s;margin-top:8px;min-height:56px}
    .submit-btn:hover{opacity:0.9}
    .submit-btn:disabled{opacity:0.5;cursor:not-allowed}
    .success-card{background:#f0fdf4;border:2px solid #86efac;border-radius:16px;padding:40px 32px;text-align:center}
    .check-anim{font-size:64px;margin-bottom:16px;display:block;animation:pop 0.4s cubic-bezier(0.175,0.885,0.32,1.275)}
    @keyframes pop{0%{transform:scale(0.3);opacity:0}100%{transform:scale(1);opacity:1}}
    .success-card h2{color:#166534;font-size:24px;margin-bottom:8px;font-weight:700}
    .success-card p{color:#15803d;font-size:14px;margin-top:6px}
    .success-contact-msg{margin-top:16px;padding:10px 16px;background:#dbeafe;border-radius:10px;color:#1d4ed8;font-size:13px;font-weight:500;display:none}
    .error-msg{background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:12px;color:#dc2626;font-size:14px;margin-top:12px;display:none}
    .offline-banner{background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;padding:12px 16px;color:#92400e;font-size:13px;margin-bottom:16px;display:none;font-weight:500}
    .section{margin-bottom:0}
    .powered{text-align:center;margin-top:24px;font-size:12px;color:#94a3b8}
    .powered a{color:${brandColor};text-decoration:none}
    .contact-section{margin-top:4px}
    .contact-label{font-size:13px;font-weight:500;color:#64748b;margin-bottom:8px}
  </style>
</head>
<body>
  <div class="page-wrapper">
  <div class="logo-bar">
    ${brandLogo ? `<img src="${brandLogo}" alt="Logo" />` : `<span class="logo-text">Intap TRACE</span>`}
  </div>
  <div class="container">
    <div id="offlineBanner" class="offline-banner">Sin conexion - tus respuestas se guardaran cuando vuelvas</div>
    <div class="header">
      <div class="header-badge">Intap TRACE</div>
      <h1>${tracePoint.name}</h1>
      ${tracePoint.area ? `<p class="area">${tracePoint.area}</p>` : ""}
    </div>
    <div id="formArea">
      <form id="traceForm">
        ${checklistHtml ? `<div class="card">${checklistHtml}</div>` : ""}
        ${surveyHtml ? `<div class="card">${surveyHtml}</div>` : ""}
        <div class="card contact-section">
          <p class="contact-label">Quieres que te contactemos? (opcional)</p>
          <input type="email" id="contactEmail" class="email-input" placeholder="tu@correo.com">
        </div>
        <div id="errorMsg" class="error-msg"></div>
        <button type="submit" class="submit-btn">Enviar respuesta</button>
      </form>
    </div>
    <div id="successArea" style="display:none">
      <div class="success-card">
        <span class="check-anim">&#10003;</span>
        <h2>Gracias por tu respuesta</h2>
        <p>Tu respuesta ha sido registrada correctamente.</p>
        <div id="contactConfirm" class="success-contact-msg">Te contactaremos pronto</div>
      </div>
    </div>
    <p class="powered">Verificacion por <a href="https://code.intaprd.com" target="_blank">Intap Code</a></p>
  </div>
  </div>
  <script>
    const surveyAnswers={};
    const API_BASE='https://api.code.intaprd.com';
    const POINT_ID='${tracePoint.id}';
    const QUEUE_KEY='trace_queue_'+POINT_ID;
    function updateOfflineBanner(){document.getElementById('offlineBanner').style.display=navigator.onLine?'none':'block'}
    window.addEventListener('online',()=>{updateOfflineBanner();flushQueue()});
    window.addEventListener('offline',updateOfflineBanner);
    updateOfflineBanner();
    const qrToken=localStorage.getItem('qr_token');
    function selectNPS(qId,val,btn){document.querySelectorAll('[data-q="'+qId+'"]').forEach(b=>b.classList.remove('selected'));btn.classList.add('selected');surveyAnswers[qId]=val}
    function selectStar(qId,val){const stars=document.querySelectorAll('#stars_'+qId+' .star');stars.forEach((s,i)=>s.classList.toggle('selected',i<val));surveyAnswers[qId]=val}
    function selectYesNo(qId,val,btn){document.querySelectorAll('[data-q="'+qId+'"]').forEach(b=>b.classList.remove('selected'));btn.classList.add('selected');surveyAnswers[qId]=val}
    async function submitPayload(payload){const res=await fetch(API_BASE+'/api/trace/public/'+POINT_ID+'/respond',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});return res.json()}
    async function flushQueue(){const raw=localStorage.getItem(QUEUE_KEY);if(!raw)return;const queue=JSON.parse(raw);if(!queue.length)return;for(const item of queue){try{await submitPayload(item)}catch(e){return}}localStorage.removeItem(QUEUE_KEY)}
    if(navigator.onLine)flushQueue();
    document.getElementById('traceForm').addEventListener('submit',async function(e){
      e.preventDefault();
      const btn=document.querySelector('.submit-btn');
      const errEl=document.getElementById('errorMsg');
      btn.disabled=true;btn.textContent='Enviando...';errEl.style.display='none';
      const checklistData={};
      document.querySelectorAll('[name^="checklist_"]').forEach(inp=>{const id=inp.name.replace('checklist_','');checklistData[id]=inp.checked});
      const surveyData={...surveyAnswers};
      document.querySelectorAll('textarea[id^="text_"]').forEach(ta=>{const id=ta.id.replace('text_','');surveyData[id]=ta.value});
      let npsScore=null;
      ${surveyQuestions.filter(q => q.type === "nps").map(q => `if(surveyAnswers['${q.id}']!==undefined)npsScore=surveyAnswers['${q.id}'];`).join("")}
      const contactEmail=document.getElementById('contactEmail').value.trim()||null;
      const respondentType=qrToken?'staff':'anonymous';
      const payload={respondent_type:respondentType,checklist_data:checklistData,survey_data:surveyData,nps_score:npsScore,contact_email:contactEmail};
      if(!navigator.onLine){const raw=localStorage.getItem(QUEUE_KEY);const queue=raw?JSON.parse(raw):[];queue.push(payload);localStorage.setItem(QUEUE_KEY,JSON.stringify(queue));document.getElementById('formArea').style.display='none';document.getElementById('successArea').style.display='block';if(contactEmail)document.getElementById('contactConfirm').style.display='block';return}
      try{const data=await submitPayload(payload);if(data.ok){document.getElementById('formArea').style.display='none';document.getElementById('successArea').style.display='block';if(contactEmail)document.getElementById('contactConfirm').style.display='block'}else{throw new Error(data.error||'Error al enviar')}}catch(ex){errEl.textContent=ex.message;errEl.style.display='block';btn.disabled=false;btn.textContent='Enviar respuesta'}
    });
  </script>
</body>
</html>`;
  return new Response(htmlPage, { status: 200, headers: { "Content-Type": "text/html;charset=UTF-8" } });
}

// ──────────────────────────────────────────────
// Main handler
// ──────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method;

    if (method === "OPTIONS") return new Response(null, { headers: CORS });

    const JWT_SECRET = env.JWT_SECRET || "changeme-set-in-cloudflare-dashboard";

    try {
      // ══════════════════════════════════════════
      // REDIRECCIÓN PÚBLICA /:slug
      // ══════════════════════════════════════════
      if (!path.startsWith("/api") && path !== "/" && path.length > 1) {
        const slug   = path.slice(1).trim().toLowerCase();
        const cf     = request.cf || {};
        const country = cf.country || "unknown";
        const city    = cf.city    || "unknown";
        const ua      = request.headers.get("user-agent") || "";
        const device  = deviceType(ua);

        // Fast cache para direct links
        let cached = await env.QR_CACHE.get(slug);
        if (cached === "INACTIVE") return new Response("Enlace inactivo", { status: 404 });
        if (cached === "EXPIRED")  return new Response("Enlace expirado", { status: 410 });

        // Check if slug starts with 't/' — TRACE point URL (qr.intaprd.com/t/:pointId)
        if (slug.startsWith("t/")) {
          const pointId = slug.slice(2);
          const tracePoint = await env.DB.prepare(
            "SELECT id, name, area, qr_type, checklist_items, survey_questions, brand_color, brand_logo FROM trace_points WHERE id=? AND is_active=1"
          ).bind(pointId).first();
          if (tracePoint) {
            return serveTraceForm(tracePoint);
          }
          return new Response("Punto TRACE no encontrado", { status: 404 });
        }

        // Buscar en D1
        let link = await env.DB.prepare(
          "SELECT *, (SELECT COUNT(*) FROM qr_analytics WHERE slug=short_links.slug) as scan_count FROM short_links WHERE slug=?"
        ).bind(slug).first();

        // Check if slug is a trace_point (direct ID match)
        if (!link) {
          const tracePoint = await env.DB.prepare(
            "SELECT id, name, area, qr_type, checklist_items, survey_questions, brand_color, brand_logo FROM trace_points WHERE id=? AND is_active=1"
          ).bind(slug).first();
          if (tracePoint) {
            const checklistItems = JSON.parse(tracePoint.checklist_items || "[]");
            const surveyQuestions = JSON.parse(tracePoint.survey_questions || "[]");
            const qrType = tracePoint.qr_type || "mixed";

            const checklistHtml = (qrType === "checklist" || qrType === "mixed") && checklistItems.length > 0 ? `
              <div class="section">
                <h2 class="section-title">✅ Checklist de verificación</h2>
                ${checklistItems.map(item => `
                  <label class="checklist-item">
                    <input type="checkbox" name="checklist_${item.id}" id="check_${item.id}" ${item.required ? 'data-required="true"' : ''}>
                    <span>${item.label}${item.required ? ' <span class="required-badge">*</span>' : ''}</span>
                  </label>
                `).join("")}
              </div>
            ` : "";

            const surveyHtml = (qrType === "survey" || qrType === "mixed") && surveyQuestions.length > 0 ? `
              <div class="section">
                <h2 class="section-title">📋 Encuesta</h2>
                ${surveyQuestions.map(q => {
                  if (q.type === "nps") return `
                    <div class="question" id="q_${q.id}">
                      <p class="question-label">${q.label}</p>
                      <div class="nps-buttons">
                        ${[1,2,3,4,5,6,7,8,9,10].map(n => `<button type="button" class="nps-btn" data-q="${q.id}" data-val="${n}" onclick="selectNPS('${q.id}',${n},this)">${n}</button>`).join("")}
                      </div>
                      <div class="nps-labels"><span>Muy malo</span><span>Excelente</span></div>
                    </div>`;
                  if (q.type === "rating") return `
                    <div class="question" id="q_${q.id}">
                      <p class="question-label">${q.label}</p>
                      <div class="stars" id="stars_${q.id}">
                        ${[1,2,3,4,5].map(n => `<span class="star" data-q="${q.id}" data-val="${n}" onclick="selectStar('${q.id}',${n})">★</span>`).join("")}
                      </div>
                    </div>`;
                  if (q.type === "yesno") return `
                    <div class="question" id="q_${q.id}">
                      <p class="question-label">${q.label}</p>
                      <div class="yesno-buttons">
                        <button type="button" class="yesno-btn" data-q="${q.id}" data-val="yes" onclick="selectYesNo('${q.id}','yes',this)">👍 Sí</button>
                        <button type="button" class="yesno-btn" data-q="${q.id}" data-val="no" onclick="selectYesNo('${q.id}','no',this)">👎 No</button>
                      </div>
                    </div>`;
                  return `
                    <div class="question" id="q_${q.id}">
                      <p class="question-label">${q.label}</p>
                      <textarea class="text-input" id="text_${q.id}" placeholder="Escribe tu respuesta aquí..." rows="3"></textarea>
                    </div>`;
                }).join("")}
              </div>
            ` : "";

            const htmlPage = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${tracePoint.name} — Intap TRACE</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', sans-serif; background: #f1f5f9; min-height: 100vh; padding: 16px 16px 48px; }
    .logo-bar { text-align: center; margin-bottom: 16px; display: none; }
    .logo-bar img { height: 28px; }
    .logo-text { font-size: 15px; font-weight: 700; color: #2563eb; letter-spacing: -0.3px; }
    @media (min-width: 640px) {
      body { display: flex; align-items: flex-start; justify-content: center; padding: 40px 16px 60px; }
      .page-wrapper { width: 100%; max-width: 560px; }
      .logo-bar { display: block; }
    }
    .container { max-width: 560px; width: 100%; margin: 0 auto; }
    .header { background: linear-gradient(135deg, #2563eb, #1d4ed8); color: white; border-radius: 16px; padding: 24px; margin-bottom: 16px; }
    @media (min-width: 640px) { .header { padding: 32px 28px; margin-bottom: 20px; } }
    .header-badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.2); border-radius: 20px; padding: 4px 12px; font-size: 12px; font-weight: 600; margin-bottom: 12px; }
    .header h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
    @media (min-width: 640px) { .header h1 { font-size: 26px; } }
    .header .area { font-size: 14px; opacity: 0.85; }
    .card { background: white; border-radius: 16px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); }
    @media (min-width: 640px) { .card { padding: 28px; } }
    .section-title { font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 14px; }
    .checklist-item { display: flex; align-items: center; gap: 12px; padding: 14px 0; border-bottom: 1px solid #f1f5f9; cursor: pointer; min-height: 44px; }
    .checklist-item:last-child { border-bottom: none; }
    .checklist-item input[type=checkbox] { width: 22px; height: 22px; accent-color: #2563eb; cursor: pointer; flex-shrink: 0; }
    .checklist-item span { font-size: 14px; color: #374151; }
    .required-badge { color: #ef4444; font-size: 12px; }
    .question { margin-bottom: 20px; }
    .question-label { font-size: 14px; font-weight: 500; color: #1e293b; margin-bottom: 12px; }
    .nps-buttons { display: flex; gap: 8px; flex-wrap: wrap; }
    .nps-btn { min-width: 48px; height: 48px; flex: 1; border: 2px solid #e2e8f0; border-radius: 10px; background: white; font-size: 15px; font-weight: 600; cursor: pointer; transition: all 0.15s; color: #374151; min-height: 44px; }
    @media (min-width: 640px) { .nps-btn { min-width: 44px; flex: none; width: 48px; } }
    .nps-btn:hover { border-color: #2563eb; color: #2563eb; }
    .nps-btn.selected { background: #2563eb; border-color: #2563eb; color: white; }
    .nps-labels { display: flex; justify-content: space-between; margin-top: 6px; font-size: 11px; color: #94a3b8; }
    .stars { display: flex; gap: 8px; }
    .star { font-size: 36px; cursor: pointer; color: #e2e8f0; transition: color 0.15s; min-height: 44px; display: flex; align-items: center; }
    .star.selected, .star:hover { color: #f59e0b; }
    .yesno-buttons { display: flex; gap: 12px; }
    .yesno-btn { flex: 1; padding: 14px; border: 2px solid #e2e8f0; border-radius: 10px; background: white; font-size: 15px; font-weight: 600; cursor: pointer; transition: all 0.15s; min-height: 44px; }
    .yesno-btn:hover { border-color: #2563eb; }
    .yesno-btn.selected { border-color: #2563eb; background: #eff6ff; color: #2563eb; }
    .text-input, .email-input { width: 100%; border: 2px solid #e2e8f0; border-radius: 10px; padding: 14px; font-family: inherit; font-size: 14px; resize: vertical; outline: none; transition: border-color 0.15s; min-height: 44px; }
    .text-input:focus, .email-input:focus { border-color: #2563eb; }
    .submit-btn { width: 100%; padding: 18px; background: #2563eb; color: white; border: none; border-radius: 12px; font-size: 16px; font-weight: 700; cursor: pointer; transition: background 0.2s; margin-top: 8px; min-height: 56px; }
    .submit-btn:hover { background: #1d4ed8; }
    .submit-btn:disabled { background: #93c5fd; cursor: not-allowed; }
    .success-card { background: #f0fdf4; border: 2px solid #86efac; border-radius: 16px; padding: 40px 32px; text-align: center; }
    .success-card .check-anim { font-size: 64px; margin-bottom: 16px; display: block; animation: pop 0.4s cubic-bezier(0.175,0.885,0.32,1.275); }
    @keyframes pop { 0% { transform: scale(0.3); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
    .success-card h2 { color: #166534; font-size: 24px; margin-bottom: 8px; font-weight: 700; }
    .success-card p { color: #15803d; font-size: 14px; margin-top: 6px; }
    .success-contact-msg { margin-top: 16px; padding: 10px 16px; background: #dbeafe; border-radius: 10px; color: #1d4ed8; font-size: 13px; font-weight: 500; display: none; }
    .error-msg { background: #fef2f2; border: 1px solid #fca5a5; border-radius: 8px; padding: 12px; color: #dc2626; font-size: 14px; margin-top: 12px; display: none; }
    .offline-banner { background: #fef3c7; border: 1px solid #fcd34d; border-radius: 10px; padding: 12px 16px; color: #92400e; font-size: 13px; margin-bottom: 16px; display: none; font-weight: 500; }
    .section { margin-bottom: 0; }
    .powered { text-align: center; margin-top: 24px; font-size: 12px; color: #94a3b8; }
    .powered a { color: #2563eb; text-decoration: none; }
    .contact-section { margin-top: 4px; }
    .contact-label { font-size: 13px; font-weight: 500; color: #64748b; margin-bottom: 8px; }
  </style>
</head>
<body>
  <div class="page-wrapper">
  <div class="logo-bar"><span class="logo-text">🎯 Intap TRACE</span></div>
  <div class="container">
    <div id="offlineBanner" class="offline-banner">
      Sin conexion — tus respuestas se guardaran cuando vuelvas
    </div>

    <div class="header">
      <div class="header-badge">🎯 Intap TRACE</div>
      <h1>${tracePoint.name}</h1>
      ${tracePoint.area ? `<p class="area">📍 ${tracePoint.area}</p>` : ""}
    </div>

    <div id="formArea">
      <form id="traceForm">
        ${checklistHtml ? `<div class="card">${checklistHtml}</div>` : ""}
        ${surveyHtml ? `<div class="card">${surveyHtml}</div>` : ""}
        <div class="card contact-section">
          <p class="contact-label">¿Quieres que te contactemos? (opcional)</p>
          <input type="email" id="contactEmail" class="email-input" placeholder="tu@correo.com">
        </div>
        <div id="errorMsg" class="error-msg"></div>
        <button type="submit" class="submit-btn">Enviar respuesta</button>
      </form>
    </div>

    <div id="successArea" style="display:none">
      <div class="success-card">
        <span class="check-anim">✅</span>
        <h2>Gracias por tu respuesta</h2>
        <p>Tu respuesta ha sido registrada correctamente.</p>
        <div id="contactConfirm" class="success-contact-msg">Te contactaremos pronto</div>
      </div>
    </div>

    <p class="powered">Verificacion por <a href="https://code.intaprd.com" target="_blank">Intap Code</a></p>
  </div>
  </div>

  <script>
    const surveyAnswers = {};
    const API_BASE = 'https://api.code.intaprd.com';
    const POINT_ID = '${tracePoint.id}';
    const QUEUE_KEY = 'trace_queue_' + POINT_ID;

    // Offline detection
    function updateOfflineBanner() {
      document.getElementById('offlineBanner').style.display = navigator.onLine ? 'none' : 'block';
    }
    window.addEventListener('online', () => { updateOfflineBanner(); flushQueue(); });
    window.addEventListener('offline', updateOfflineBanner);
    updateOfflineBanner();

    // Auto-detect staff via qr_token
    const qrToken = localStorage.getItem('qr_token');

    function selectNPS(qId, val, btn) {
      document.querySelectorAll('[data-q="'+qId+'"]').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      surveyAnswers[qId] = val;
    }

    function selectStar(qId, val) {
      const stars = document.querySelectorAll('#stars_'+qId+' .star');
      stars.forEach((s, i) => s.classList.toggle('selected', i < val));
      surveyAnswers[qId] = val;
    }

    function selectYesNo(qId, val, btn) {
      document.querySelectorAll('[data-q="'+qId+'"]').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      surveyAnswers[qId] = val;
    }

    async function submitPayload(payload) {
      const res = await fetch(API_BASE+'/api/trace/public/'+POINT_ID+'/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return res.json();
    }

    async function flushQueue() {
      const raw = localStorage.getItem(QUEUE_KEY);
      if (!raw) return;
      const queue = JSON.parse(raw);
      if (!queue.length) return;
      for (const item of queue) {
        try { await submitPayload(item); } catch(e) { return; }
      }
      localStorage.removeItem(QUEUE_KEY);
    }

    // Try flush on load if online
    if (navigator.onLine) flushQueue();

    document.getElementById('traceForm').addEventListener('submit', async function(e) {
      e.preventDefault();
      const btn = document.querySelector('.submit-btn');
      const errEl = document.getElementById('errorMsg');
      btn.disabled = true;
      btn.textContent = 'Enviando...';
      errEl.style.display = 'none';

      const checklistData = {};
      document.querySelectorAll('[name^="checklist_"]').forEach(inp => {
        const id = inp.name.replace('checklist_','');
        checklistData[id] = inp.checked;
      });

      const surveyData = {...surveyAnswers};
      document.querySelectorAll('textarea[id^="text_"]').forEach(ta => {
        const id = ta.id.replace('text_','');
        surveyData[id] = ta.value;
      });

      let npsScore = null;
      ${surveyQuestions.filter(q => q.type === "nps").map(q => `
        if (surveyAnswers['${q.id}'] !== undefined) npsScore = surveyAnswers['${q.id}'];
      `).join("")}

      const contactEmail = document.getElementById('contactEmail').value.trim() || null;
      const respondentType = qrToken ? 'staff' : 'anonymous';

      const payload = { respondent_type: respondentType, checklist_data: checklistData, survey_data: surveyData, nps_score: npsScore, contact_email: contactEmail };

      if (!navigator.onLine) {
        // Queue for later
        const raw = localStorage.getItem(QUEUE_KEY);
        const queue = raw ? JSON.parse(raw) : [];
        queue.push(payload);
        localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
        document.getElementById('formArea').style.display = 'none';
        document.getElementById('successArea').style.display = 'block';
        if (contactEmail) document.getElementById('contactConfirm').style.display = 'block';
        return;
      }

      try {
        const data = await submitPayload(payload);
        if (data.ok) {
          document.getElementById('formArea').style.display = 'none';
          document.getElementById('successArea').style.display = 'block';
          if (contactEmail) document.getElementById('contactConfirm').style.display = 'block';
        } else {
          throw new Error(data.error || 'Error al enviar');
        }
      } catch(ex) {
        errEl.textContent = ex.message;
        errEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Enviar respuesta';
      }
    });
  </script>
</body>
</html>`;

            return new Response(htmlPage, {
              status: 200,
              headers: { "Content-Type": "text/html;charset=UTF-8" },
            });
          }
        }

        // Fallback KV legacy
        if (!link) {
          const raw = await env.QR_LINKS.get(slug);
          if (!raw) return new Response("Enlace no encontrado", { status: 404 });
          let dest;
          try {
            const rec = JSON.parse(raw);
            if (rec.is_active === false) return new Response("Enlace inactivo", { status: 404 });
            dest = rec.url || raw;
          } catch { dest = raw; }
          ctx.waitUntil(Promise.all([
            env.QR_CACHE.put(slug, dest, { expirationTtl: 3600 }),
            saveAnalytics(env.DB, slug, country, city, device, ua),
          ]));
          return Response.redirect(dest, 302);
        }

        // Verificar estado activo
        if (!link.is_active) {
          ctx.waitUntil(env.QR_CACHE.put(slug, "INACTIVE", { expirationTtl: 3600 }));
          return new Response("Enlace inactivo", { status: 404 });
        }

        // Verificar expiración por fecha
        if (link.expires_at && new Date(link.expires_at) < new Date()) {
          ctx.waitUntil(env.QR_CACHE.put(slug, "EXPIRED", { expirationTtl: 3600 }));
          if (link.fallback_url) return Response.redirect(link.fallback_url, 302);
          return new Response("Enlace expirado", { status: 410 });
        }

        // Verificar expiración por escaneos
        if (link.max_scans && link.scan_count >= link.max_scans) {
          ctx.waitUntil(env.QR_CACHE.put(slug, "EXPIRED", { expirationTtl: 3600 }));
          if (link.fallback_url) return Response.redirect(link.fallback_url, 302);
          return new Response("Límite de escaneos alcanzado", { status: 410 });
        }

        // Resolver destino según modo
        const destination = await resolveDestination(link, link.scan_count || 0, country, device);

        // Cache solo si es direct (los otros modos varían)
        if (!link.redirect_mode || link.redirect_mode === "direct") {
          ctx.waitUntil(env.QR_CACHE.put(slug, destination, { expirationTtl: 3600 }));
        }

        ctx.waitUntil(saveAnalytics(env.DB, slug, country, city, device, ua));
        return Response.redirect(destination, 302);
      }

      // ══════════════════════════════════════════
      // POST /api/auth/register
      // ══════════════════════════════════════════
      if (path === "/api/auth/register" && method === "POST") {
        const { email, password, role = "tenant", enterprise_id } = await request.json();
        if (!email || !password) return json({ ok: false, error: "Email y contraseña requeridos" }, 400);
        if (password.length < 6) return json({ ok: false, error: "Contraseña mínima 6 caracteres" }, 400);
        if (!["superadmin","enterprise","tenant"].includes(role)) return json({ ok: false, error: "Rol inválido" }, 400);

        const existing = await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email.toLowerCase()).first();
        if (existing) return json({ ok: false, error: "Email ya registrado" }, 409);

        if (role === "superadmin") {
          const u = await getUser(request, env);
          const err = requireAuth(u, "superadmin");
          if (err) return err;
        }

        const hash = await bcrypt.hash(password, 10);
        const id   = uuid();
        const plan = role === "enterprise" || role === "superadmin" ? "enterprise" : "free";

        await env.DB.prepare(
          "INSERT INTO users (id, email, password_hash, role, plan, enterprise_id) VALUES (?,?,?,?,?,?)"
        ).bind(id, email.toLowerCase(), hash, role, plan, enterprise_id || null).run();

        const token = await signToken({ sub: id, email: email.toLowerCase(), role, plan }, JWT_SECRET);
        return json({ ok: true, token, user: { id, email, role, plan } }, 201);
      }

      // ══════════════════════════════════════════
      // POST /api/auth/login
      // ══════════════════════════════════════════
      if (path === "/api/auth/login" && method === "POST") {
        const { email, password } = await request.json();
        if (!email || !password) return json({ ok: false, error: "Email y contraseña requeridos" }, 400);

        const user = await env.DB.prepare(
          "SELECT id, email, password_hash, role, plan, is_active FROM users WHERE email=?"
        ).bind(email.toLowerCase()).first();

        if (!user || !user.is_active) return json({ ok: false, error: "Credenciales inválidas" }, 401);

        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) return json({ ok: false, error: "Credenciales inválidas" }, 401);

        const token = await signToken(
          { sub: user.id, email: user.email, role: user.role, plan: user.plan },
          JWT_SECRET
        );
        return json({ ok: true, token, user: { id: user.id, email: user.email, role: user.role, plan: user.plan } });
      }

      // ══════════════════════════════════════════
      // POST /api/auth/change-password
      // ══════════════════════════════════════════
      if (path === "/api/auth/change-password" && method === "POST") {
        const user = await getUser(request, env);
        const err  = requireAuth(user);
        if (err) return err;

        const { current_password, new_password } = await request.json();
        if (!current_password || !new_password) return json({ ok: false, error: "Faltan campos" }, 400);
        if (new_password.length < 6) return json({ ok: false, error: "Contraseña mínima 6 caracteres" }, 400);

        const dbUser = await env.DB.prepare("SELECT password_hash FROM users WHERE id=?").bind(user.sub).first();
        if (!dbUser) return json({ ok: false, error: "Usuario no encontrado" }, 404);

        const ok = await bcrypt.compare(current_password, dbUser.password_hash);
        if (!ok) return json({ ok: false, error: "Contraseña actual incorrecta" }, 401);

        const hash = await bcrypt.hash(new_password, 10);
        await env.DB.prepare("UPDATE users SET password_hash=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(hash, user.sub).run();
        return json({ ok: true });
      }

      // ══════════════════════════════════════════
      // GET /api/auth/me
      // ══════════════════════════════════════════
      if (path === "/api/auth/me" && method === "GET") {
        const user = await getUser(request, env);
        const err  = requireAuth(user);
        if (err) return err;
        const dbUser = await env.DB.prepare(
          "SELECT id, email, role, plan, enterprise_id, is_active, created_at FROM users WHERE id=?"
        ).bind(user.sub).first();
        if (!dbUser) return json({ ok: false, error: "Usuario no encontrado" }, 404);
        return json({ ok: true, user: dbUser });
      }

      // ══════════════════════════════════════════
      // GET /api/plan-features — features del plan actual
      // ══════════════════════════════════════════
      if (path === "/api/plan-features" && method === "GET") {
        const user = await getUser(request, env);
        const err  = requireAuth(user);
        if (err) return err;
        return json({ ok: true, features: PLAN_FEATURES[user.plan] || PLAN_FEATURES.free });
      }

      // ══════════════════════════════════════════
      // GET /api/links
      // ══════════════════════════════════════════
      if (path === "/api/links" && method === "GET") {
        const user = await getUser(request, env);
        const err  = requireAuth(user);
        if (err) return err;

        let query, binds;
        if (user.role === "superadmin") {
          query = `SELECT sl.*, u.email as owner_email,
                   (SELECT COUNT(*) FROM qr_analytics WHERE slug=sl.slug) as scan_count
                   FROM short_links sl JOIN users u ON sl.user_id=u.id
                   ORDER BY sl.created_at DESC LIMIT 1000`;
          binds = [];
        } else if (user.role === "enterprise") {
          query = `SELECT sl.*, u.email as owner_email,
                   (SELECT COUNT(*) FROM qr_analytics WHERE slug=sl.slug) as scan_count
                   FROM short_links sl JOIN users u ON sl.user_id=u.id
                   WHERE sl.user_id=? OR u.enterprise_id=?
                   ORDER BY sl.created_at DESC LIMIT 1000`;
          binds = [user.sub, user.sub];
        } else {
          query = `SELECT sl.*,
                   (SELECT COUNT(*) FROM qr_analytics WHERE slug=sl.slug) as scan_count
                   FROM short_links sl WHERE sl.user_id=? ORDER BY sl.created_at DESC LIMIT 1000`;
          binds = [user.sub];
        }

        const stmt   = env.DB.prepare(query);
        const result = await (binds.length ? stmt.bind(...binds) : stmt).all();
        return json({ ok: true, links: result.results });
      }

      // ══════════════════════════════════════════
      // POST /api/links — crear enlace
      // ══════════════════════════════════════════
      if (path === "/api/links" && method === "POST") {
        const user = await getUser(request, env);
        const err  = requireAuth(user);
        if (err) return err;

        const body = await request.json();
        const { slug, destination_url, project_id, qr_style_json,
                redirect_mode = "direct", redirect_rules, expires_at, max_scans, fallback_url } = body;

        if (!slug || !destination_url) return json({ ok: false, error: "slug y destination_url requeridos" }, 400);

        // Verificar feature gates del plan
        if (redirect_mode !== "direct" && !canUseFeature(user.plan, "redirect_mode", redirect_mode) && user.role !== "superadmin") {
          return json({ ok: false, error: `El modo "${redirect_mode}" requiere plan Pro o superior` }, 403);
        }
        if (expires_at && !canUseFeature(user.plan, "expiration") && user.role !== "superadmin") {
          return json({ ok: false, error: "Las fechas de expiración requieren plan Starter o superior" }, 403);
        }
        if (max_scans && !canUseFeature(user.plan, "max_scans") && user.role !== "superadmin") {
          return json({ ok: false, error: "El límite de escaneos requiere plan Pro o superior" }, 403);
        }

        // Verificar límite del plan
        const planConfig = await getPlan(env.DB, user.plan);
        if (planConfig && planConfig.max_qr !== -1) {
          const count = await countUserLinks(env.DB, user.sub);
          if (count >= planConfig.max_qr) {
            return json({ ok: false, error: `Límite de QRs alcanzado para plan ${user.plan} (${planConfig.max_qr})` }, 403);
          }
        }

        const cleanSlug = slug.trim().toLowerCase();
        const existing  = await env.DB.prepare("SELECT slug FROM short_links WHERE slug=?").bind(cleanSlug).first();
        if (existing) return json({ ok: false, error: "Slug ya en uso" }, 409);

        await env.DB.prepare(
          `INSERT INTO short_links
           (slug, destination_url, user_id, project_id, qr_style_json, redirect_mode, redirect_rules, expires_at, max_scans, fallback_url)
           VALUES (?,?,?,?,?,?,?,?,?,?)`
        ).bind(
          cleanSlug, destination_url, user.sub,
          project_id || null, qr_style_json || null,
          redirect_mode, redirect_rules ? JSON.stringify(redirect_rules) : null,
          expires_at || null, max_scans || null, fallback_url || null
        ).run();

        if (redirect_mode === "direct") {
          ctx.waitUntil(env.QR_CACHE.put(cleanSlug, destination_url, { expirationTtl: 3600 }));
        }
        return json({ ok: true, slug: cleanSlug }, 201);
      }

      // ══════════════════════════════════════════
      // PUT /api/links/:slug — actualizar
      // ══════════════════════════════════════════
      if (path.startsWith("/api/links/") && method === "PUT") {
        const user = await getUser(request, env);
        const err  = requireAuth(user);
        if (err) return err;

        const slug = path.split("/api/links/")[1];
        const body = await request.json();
        const { destination_url, project_id, qr_style_json,
                redirect_mode = "direct", redirect_rules, expires_at, max_scans, fallback_url } = body;

        if (!destination_url) return json({ ok: false, error: "destination_url requerido" }, 400);

        const link = await env.DB.prepare("SELECT user_id FROM short_links WHERE slug=?").bind(slug).first();
        if (!link) return json({ ok: false, error: "Enlace no encontrado" }, 404);
        if (user.role !== "superadmin" && link.user_id !== user.sub) return json({ ok: false, error: "Sin permiso" }, 403);

        // Verificar feature gates
        if (redirect_mode !== "direct" && !canUseFeature(user.plan, "redirect_mode", redirect_mode) && user.role !== "superadmin") {
          return json({ ok: false, error: `El modo "${redirect_mode}" requiere plan Pro o superior` }, 403);
        }

        await env.DB.prepare(
          `UPDATE short_links SET
           destination_url=?, project_id=?, qr_style_json=?,
           redirect_mode=?, redirect_rules=?, expires_at=?, max_scans=?, fallback_url=?,
           updated_at=CURRENT_TIMESTAMP
           WHERE slug=?`
        ).bind(
          destination_url, project_id || null, qr_style_json || null,
          redirect_mode, redirect_rules ? JSON.stringify(redirect_rules) : null,
          expires_at || null, max_scans || null, fallback_url || null,
          slug
        ).run();

        ctx.waitUntil(env.QR_CACHE.delete(slug));
        return json({ ok: true });
      }

      // ══════════════════════════════════════════
      // DELETE /api/links/:slug
      // ══════════════════════════════════════════
      if (path.startsWith("/api/links/") && !path.includes("/toggle") && method === "DELETE") {
        const user = await getUser(request, env);
        const err  = requireAuth(user);
        if (err) return err;

        const slug = path.split("/api/links/")[1];
        const link = await env.DB.prepare("SELECT user_id FROM short_links WHERE slug=?").bind(slug).first();
        if (!link) return json({ ok: false, error: "Enlace no encontrado" }, 404);
        if (user.role !== "superadmin" && link.user_id !== user.sub) return json({ ok: false, error: "Sin permiso" }, 403);

        await env.DB.prepare("DELETE FROM short_links WHERE slug=?").bind(slug).run();
        ctx.waitUntil(env.QR_CACHE.delete(slug));
        return json({ ok: true });
      }

      // ══════════════════════════════════════════
      // PATCH /api/links/:slug/toggle
      // ══════════════════════════════════════════
      if (path.match(/^\/api\/links\/.+\/toggle$/) && method === "PATCH") {
        const user = await getUser(request, env);
        const err  = requireAuth(user);
        if (err) return err;

        const slug = path.split("/api/links/")[1].replace("/toggle","");
        const { is_active } = await request.json();
        if (is_active !== 0 && is_active !== 1) return json({ ok: false, error: "is_active debe ser 0 o 1" }, 400);

        const link = await env.DB.prepare("SELECT user_id, destination_url FROM short_links WHERE slug=?").bind(slug).first();
        if (!link) return json({ ok: false, error: "Enlace no encontrado" }, 404);
        if (user.role !== "superadmin" && link.user_id !== user.sub) return json({ ok: false, error: "Sin permiso" }, 403);

        await env.DB.prepare("UPDATE short_links SET is_active=?, updated_at=CURRENT_TIMESTAMP WHERE slug=?").bind(is_active, slug).run();
        const cacheVal = is_active === 0 ? "INACTIVE" : link.destination_url;
        ctx.waitUntil(env.QR_CACHE.put(slug, cacheVal, { expirationTtl: 3600 }));
        return json({ ok: true });
      }

      // ══════════════════════════════════════════
      // POST /api/bulk/upload
      // ══════════════════════════════════════════
      if (path === "/api/bulk/upload" && method === "POST") {
        const user = await getUser(request, env);
        const err  = requireAuth(user);
        if (err) return err;

        const planConfig = await getPlan(env.DB, user.plan);
        if (!planConfig?.has_bulk && user.role !== "superadmin") {
          return json({ ok: false, error: "Carga masiva no disponible en tu plan" }, 403);
        }

        const { batch_name, links } = await request.json();
        if (!batch_name || !Array.isArray(links) || links.length === 0) {
          return json({ ok: false, error: "batch_name y links[] requeridos" }, 400);
        }

        const batchId = uuid();
        await env.DB.prepare("INSERT INTO bulk_batches (id, user_id, name, total_links) VALUES (?,?,?,?)").bind(batchId, user.sub, batch_name, links.length).run();

        let inserted = 0;
        for (const link of links) {
          const slug = (link.slug || "").trim().toLowerCase();
          const dest = link.destination_url || link.url || link.target;
          if (!slug || !dest) continue;
          try {
            await env.DB.prepare(
              "INSERT OR IGNORE INTO short_links (slug, destination_url, user_id, batch_id) VALUES (?,?,?,?)"
            ).bind(slug, dest, user.sub, batchId).run();
            ctx.waitUntil(env.QR_CACHE.put(slug, dest, { expirationTtl: 3600 }));
            inserted++;
          } catch (_) {}
        }

        await env.DB.prepare("UPDATE bulk_batches SET total_links=? WHERE id=?").bind(inserted, batchId).run();
        return json({ ok: true, batch_id: batchId, total_inserted: inserted }, 201);
      }

      // ══════════════════════════════════════════
      // GET /api/analytics/summary?slug=
      // ══════════════════════════════════════════
      if (path === "/api/analytics/summary" && method === "GET") {
        const user = await getUser(request, env);
        const err  = requireAuth(user);
        if (err) return err;

        const planConfig = await getPlan(env.DB, user.plan);
        if (!planConfig?.has_analytics && user.role !== "superadmin") {
          return json({ ok: false, error: "Analytics no disponibles en tu plan" }, 403);
        }

        const slug = url.searchParams.get("slug")?.trim().toLowerCase();
        if (!slug) return json({ ok: false, error: "Falta slug" }, 400);

        const link = await env.DB.prepare("SELECT user_id FROM short_links WHERE slug=?").bind(slug).first();
        if (!link) return json({ ok: false, error: "Enlace no encontrado" }, 404);
        if (user.role !== "superadmin" && link.user_id !== user.sub) return json({ ok: false, error: "Sin permiso" }, 403);

        const [total, countries, devices, daily] = await Promise.all([
          env.DB.prepare("SELECT COUNT(*) as total FROM qr_analytics WHERE slug=?").bind(slug).first(),
          env.DB.prepare("SELECT country, COUNT(*) as count FROM qr_analytics WHERE slug=? GROUP BY country ORDER BY count DESC LIMIT 10").bind(slug).all(),
          env.DB.prepare("SELECT device, COUNT(*) as count FROM qr_analytics WHERE slug=? GROUP BY device").bind(slug).all(),
          env.DB.prepare("SELECT date(scanned_at) as day, COUNT(*) as count FROM qr_analytics WHERE slug=? GROUP BY day ORDER BY day DESC LIMIT 30").bind(slug).all(),
        ]);

        return json({
          ok: true,
          summary: {
            total_scans: total?.total ?? 0,
            top_countries: countries.results,
            devices: devices.results,
            daily: daily.results,
          },
        });
      }

      // ══════════════════════════════════════════
      // GET /api/analytics/global — superadmin
      // ══════════════════════════════════════════
      if (path === "/api/analytics/global" && method === "GET") {
        const user = await getUser(request, env);
        const err  = requireAuth(user, "superadmin");
        if (err) return err;

        const [totalUsers, totalLinks, totalScans, planDist] = await Promise.all([
          env.DB.prepare("SELECT COUNT(*) as c FROM users").first(),
          env.DB.prepare("SELECT COUNT(*) as c FROM short_links").first(),
          env.DB.prepare("SELECT COUNT(*) as c FROM qr_analytics").first(),
          env.DB.prepare("SELECT plan, COUNT(*) as c FROM users GROUP BY plan").all(),
        ]);

        return json({
          ok: true,
          stats: {
            total_users:       totalUsers?.c  ?? 0,
            total_links:       totalLinks?.c  ?? 0,
            total_scans:       totalScans?.c  ?? 0,
            plan_distribution: planDist.results,
          },
        });
      }

      // ══════════════════════════════════════════
      // PROJECTS
      // ══════════════════════════════════════════
      if (path === "/api/projects" && method === "GET") {
        const user = await getUser(request, env);
        const err  = requireAuth(user);
        if (err) return err;
        const result = await env.DB.prepare("SELECT * FROM projects WHERE user_id=? ORDER BY name").bind(user.sub).all();
        return json({ ok: true, projects: result.results });
      }

      if (path === "/api/projects" && method === "POST") {
        const user = await getUser(request, env);
        const err  = requireAuth(user);
        if (err) return err;
        const { name } = await request.json();
        if (!name) return json({ ok: false, error: "Nombre requerido" }, 400);
        const id = uuid();
        await env.DB.prepare("INSERT INTO projects (id, user_id, name) VALUES (?,?,?)").bind(id, user.sub, name).run();
        return json({ ok: true, project: { id, name } }, 201);
      }

      if (path.startsWith("/api/projects/") && method === "DELETE") {
        const user = await getUser(request, env);
        const err  = requireAuth(user);
        if (err) return err;
        const id      = path.split("/api/projects/")[1];
        const project = await env.DB.prepare("SELECT user_id FROM projects WHERE id=?").bind(id).first();
        if (!project) return json({ ok: false, error: "Proyecto no encontrado" }, 404);
        if (user.role !== "superadmin" && project.user_id !== user.sub) return json({ ok: false, error: "Sin permiso" }, 403);
        await env.DB.prepare("DELETE FROM projects WHERE id=?").bind(id).run();
        return json({ ok: true });
      }

      // ══════════════════════════════════════════
      // ENTERPRISE — tenants
      // ══════════════════════════════════════════
      if (path === "/api/enterprise/tenants" && method === "GET") {
        const user = await getUser(request, env);
        const err  = requireAuth(user, "enterprise", "superadmin");
        if (err) return err;
        const enterpriseId = user.role === "superadmin" ? (url.searchParams.get("enterprise_id") || user.sub) : user.sub;
        const result = await env.DB.prepare(
          "SELECT id, email, plan, is_active, created_at FROM users WHERE enterprise_id=? AND role='tenant'"
        ).bind(enterpriseId).all();
        return json({ ok: true, tenants: result.results });
      }

      if (path === "/api/enterprise/tenants" && method === "POST") {
        const user = await getUser(request, env);
        const err  = requireAuth(user, "enterprise", "superadmin");
        if (err) return err;

        const planConfig     = await getPlan(env.DB, user.plan);
        const currentTenants = await env.DB.prepare("SELECT COUNT(*) as c FROM users WHERE enterprise_id=? AND role='tenant'").bind(user.sub).first();
        if (planConfig && planConfig.max_tenants > 0 && (currentTenants?.c ?? 0) >= planConfig.max_tenants) {
          return json({ ok: false, error: `Límite de tenants alcanzado (${planConfig.max_tenants})` }, 403);
        }

        const { email, password } = await request.json();
        if (!email || !password) return json({ ok: false, error: "Email y contraseña requeridos" }, 400);

        const existing = await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email.toLowerCase()).first();
        if (existing) return json({ ok: false, error: "Email ya registrado" }, 409);

        const hash = await bcrypt.hash(password, 10);
        const id   = uuid();
        await env.DB.prepare(
          "INSERT INTO users (id, email, password_hash, role, plan, enterprise_id) VALUES (?,?,?,'tenant','free',?)"
        ).bind(id, email.toLowerCase(), hash, user.sub).run();
        return json({ ok: true, tenant: { id, email, role: "tenant", plan: "free" } }, 201);
      }

      // ══════════════════════════════════════════
      // SUPERADMIN — Usuarios
      // ══════════════════════════════════════════
      if (path === "/api/admin/users" && method === "GET") {
        const user = await getUser(request, env);
        const err  = requireAuth(user, "superadmin");
        if (err) return err;
        const page   = parseInt(url.searchParams.get("page") || "1");
        const limit  = 50;
        const offset = (page - 1) * limit;
        const [users, total] = await Promise.all([
          env.DB.prepare("SELECT id, email, role, plan, is_active, enterprise_id, created_at FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?").bind(limit, offset).all(),
          env.DB.prepare("SELECT COUNT(*) as c FROM users").first(),
        ]);
        return json({ ok: true, users: users.results, total: total?.c ?? 0, page, limit });
      }

      if (path === "/api/admin/users" && method === "POST") {
        const user = await getUser(request, env);
        const err  = requireAuth(user, "superadmin");
        if (err) return err;
        const { email, password, role = "tenant", plan = "free", enterprise_id } = await request.json();
        if (!email || !password) return json({ ok: false, error: "Email y contraseña requeridos" }, 400);
        const existing = await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email.toLowerCase()).first();
        if (existing) return json({ ok: false, error: "Email ya registrado" }, 409);
        const hash = await bcrypt.hash(password, 10);
        const id   = uuid();
        await env.DB.prepare("INSERT INTO users (id, email, password_hash, role, plan, enterprise_id) VALUES (?,?,?,?,?,?)").bind(id, email.toLowerCase(), hash, role, plan, enterprise_id || null).run();
        return json({ ok: true, user: { id, email, role, plan } }, 201);
      }

      if (path.startsWith("/api/admin/users/") && method === "PATCH") {
        const user = await getUser(request, env);
        const err  = requireAuth(user, "superadmin");
        if (err) return err;
        const targetId = path.split("/api/admin/users/")[1];
        const updates  = await request.json();
        const allowed  = ["role","plan","is_active","enterprise_id"];
        const sets = [], vals = [];
        for (const key of allowed) {
          if (key in updates) { sets.push(`${key}=?`); vals.push(updates[key]); }
        }
        if (!sets.length) return json({ ok: false, error: "Sin campos" }, 400);
        sets.push("updated_at=CURRENT_TIMESTAMP");
        vals.push(targetId);
        await env.DB.prepare(`UPDATE users SET ${sets.join(",")} WHERE id=?`).bind(...vals).run();
        return json({ ok: true });
      }

      if (path.startsWith("/api/admin/users/") && method === "DELETE") {
        const user = await getUser(request, env);
        const err  = requireAuth(user, "superadmin");
        if (err) return err;
        const targetId = path.split("/api/admin/users/")[1];
        if (targetId === user.sub) return json({ ok: false, error: "No puedes eliminarte a ti mismo" }, 400);
        await env.DB.prepare("DELETE FROM users WHERE id=?").bind(targetId).run();
        return json({ ok: true });
      }

      // ══════════════════════════════════════════
      // SUPERADMIN — Planes
      // ══════════════════════════════════════════
      // GET /api/admin/stats
      if (path === "/api/admin/stats" && method === "GET") {
        const user = await getUser(request, env);
        const err  = requireAuth(user, "superadmin");
        if (err) return err;
        const totalTenants = await env.DB.prepare("SELECT COUNT(*) as c FROM users").first();
        const activeSubs = await env.DB.prepare("SELECT COUNT(*) as c FROM subscriptions WHERE status='active'").first();
        const trialSubs = await env.DB.prepare("SELECT COUNT(*) as c FROM subscriptions WHERE status='trial'").first();
        const mrr = await env.DB.prepare("SELECT SUM(amount_usd) as total FROM subscriptions WHERE status='active' AND billing_cycle='monthly'").first();
        const sevenDays = new Date(Date.now() + 7 * 86400000).toISOString();
        const churnRisk = await env.DB.prepare("SELECT COUNT(*) as c FROM subscriptions WHERE status='active' AND current_period_end <= ?").bind(sevenDays).first();
        const totalLinks = await env.DB.prepare("SELECT COUNT(*) as c FROM short_links").first();
        return json({
          ok: true,
          stats: {
            total_tenants: totalTenants?.c ?? 0,
            active_subscriptions: activeSubs?.c ?? 0,
            trial_subscriptions: trialSubs?.c ?? 0,
            mrr_usd: mrr?.total ?? 0,
            churn_risk: churnRisk?.c ?? 0,
            total_links: totalLinks?.c ?? 0,
          }
        });
      }

      if (path === "/api/admin/plans" && method === "GET") {
        const user = await getUser(request, env);
        const err  = requireAuth(user, "superadmin");
        if (err) return err;
        const result = await env.DB.prepare("SELECT * FROM plan_configs ORDER BY price_usd").all();
        return json({ ok: true, plans: result.results });
      }

      if (path.startsWith("/api/admin/plans/") && method === "PUT") {
        const user = await getUser(request, env);
        const err  = requireAuth(user, "superadmin");
        if (err) return err;
        const plan = path.split("/api/admin/plans/")[1];
        const body = await request.json();
        const {
          max_qr, max_tenants, has_analytics, has_bulk, has_custom_domain, price_usd,
          billing_cycles, annual_discount_pct, quarterly_discount_pct, semiannual_discount_pct,
          features_json, trial_days,
        } = body;
        await env.DB.prepare(
          `UPDATE plan_configs SET
            max_qr=?, max_tenants=?, has_analytics=?, has_bulk=?, has_custom_domain=?, price_usd=?,
            billing_cycles=?, annual_discount_pct=?, quarterly_discount_pct=?, semiannual_discount_pct=?,
            features_json=?, trial_days=?,
            updated_at=CURRENT_TIMESTAMP
           WHERE plan=?`
        ).bind(
          max_qr ?? -1, max_tenants ?? 0, has_analytics ? 1 : 0, has_bulk ? 1 : 0, has_custom_domain ? 1 : 0, price_usd ?? 0,
          billing_cycles ? JSON.stringify(billing_cycles) : '["monthly","quarterly","semiannual","annual"]',
          annual_discount_pct ?? 20, quarterly_discount_pct ?? 10, semiannual_discount_pct ?? 15,
          features_json ? JSON.stringify(features_json) : '{}',
          trial_days ?? 14,
          plan
        ).run();
        return json({ ok: true });
      }

      // ══════════════════════════════════════════
      // POST /api/admin/migrate-kv
      // ══════════════════════════════════════════
      if (path === "/api/admin/migrate-kv" && method === "POST") {
        const user = await getUser(request, env);
        const err  = requireAuth(user, "superadmin");
        if (err) return err;

        const listed = await env.QR_LINKS.list();
        let migrated = 0, skipped = 0, errors = 0;

        for (const key of listed.keys) {
          if (key.name.startsWith("__")) { skipped++; continue; }
          const existing = await env.DB.prepare("SELECT slug FROM short_links WHERE slug=?").bind(key.name).first();
          if (existing) { skipped++; continue; }
          const raw = await env.QR_LINKS.get(key.name);
          if (!raw) { skipped++; continue; }
          try {
            let destUrl, project = "General", isActive = true, createdAt = new Date().toISOString();
            try {
              const rec = JSON.parse(raw);
              destUrl   = rec.url || rec.destination_url;
              project   = rec.project || "General";
              isActive  = rec.is_active !== false;
              createdAt = rec.date || rec.created_at || createdAt;
            } catch { destUrl = raw; }
            if (!destUrl) { skipped++; continue; }
            await env.DB.prepare(
              "INSERT OR IGNORE INTO short_links (slug, destination_url, user_id, qr_style_json, is_active, created_at) VALUES (?,?,?,?,?,?)"
            ).bind(key.name, destUrl, user.sub, JSON.stringify({ project }), isActive ? 1 : 0, createdAt).run();
            migrated++;
          } catch (e) { console.error(`migrate-kv ${key.name}:`, e); errors++; }
        }
        return json({ ok: true, migrated, skipped, errors });
      }

      // ══════════════════════════════════════════
      // TRACE — public endpoints (no auth)
      // ══════════════════════════════════════════

      // GET /api/trace/public/:pointId — get point config for form rendering
      if (path.match(/^\/api\/trace\/public\/[^/]+$/) && method === "GET") {
        const pointId = path.split("/api/trace/public/")[1];
        const point = await env.DB.prepare(
          "SELECT id, name, area, qr_type, checklist_items, survey_questions FROM trace_points WHERE id=? AND is_active=1"
        ).bind(pointId).first();
        if (!point) return json({ ok: false, error: "Punto no encontrado" }, 404);
        return json({ ok: true, point: {
          ...point,
          checklist_items: JSON.parse(point.checklist_items || "[]"),
          survey_questions: JSON.parse(point.survey_questions || "[]"),
        }});
      }

      // POST /api/trace/public/:pointId/respond — submit response
      if (path.match(/^\/api\/trace\/public\/[^/]+\/respond$/) && method === "POST") {
        const pointId = path.split("/api/trace/public/")[1].replace("/respond", "");
        const point = await env.DB.prepare(
          "SELECT * FROM trace_points WHERE id=? AND is_active=1"
        ).bind(pointId).first();
        if (!point) return json({ ok: false, error: "Punto no encontrado" }, 404);

        const body = await request.json();
        const {
          respondent_type = "anonymous",
          user_id: respondentUserId,
          checklist_data = {},
          survey_data = {},
          nps_score,
          contact_email,
          notes,
        } = body;

        const cf = request.cf || {};
        const ip = request.headers.get("CF-Connecting-IP") || "unknown";
        const country = cf.country || "unknown";
        const ua = request.headers.get("user-agent") || "";
        const device = deviceType(ua);

        const responseId = uuid();
        await env.DB.prepare(
          `INSERT INTO trace_responses
           (id, point_id, respondent_type, user_id, checklist_data, survey_data, nps_score, contact_email, notes, ip, country, device)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
        ).bind(
          responseId, pointId, respondent_type,
          respondentUserId || null,
          JSON.stringify(checklist_data),
          JSON.stringify(survey_data),
          nps_score ?? null,
          contact_email || null,
          notes || null,
          ip, country, device
        ).run();

        // Generate alerts
        const alertConfig = JSON.parse(point.alert_config || "{}");
        const npsThreshold = alertConfig.nps_threshold ?? 7;
        const alertOps = [];

        if (nps_score !== undefined && nps_score !== null && nps_score < npsThreshold) {
          alertOps.push(env.DB.prepare(
            "INSERT INTO trace_alerts (id, point_id, user_id, alert_type, message) VALUES (?,?,?,?,?)"
          ).bind(uuid(), pointId, point.user_id, "low_nps", `NPS score ${nps_score} está por debajo del umbral ${npsThreshold}`).run());
        }

        const checklistItems = JSON.parse(point.checklist_items || "[]");
        const requiredItems = checklistItems.filter(i => i.required);
        const hasMissedRequired = requiredItems.some(i => !checklist_data[i.id]);
        if (requiredItems.length > 0 && hasMissedRequired) {
          alertOps.push(env.DB.prepare(
            "INSERT INTO trace_alerts (id, point_id, user_id, alert_type, message) VALUES (?,?,?,?,?)"
          ).bind(uuid(), pointId, point.user_id, "missed_checklist", "Ítems obligatorios del checklist no completados").run());
        }

        // CRM — UPSERT contact if email provided
        if (contact_email) {
          const crmOp = (async () => {
            const existing = await env.DB.prepare(
              "SELECT id, total_responses, avg_nps FROM trace_contacts WHERE user_id=? AND email=?"
            ).bind(point.user_id, contact_email).first();
            if (existing) {
              const newTotal = (existing.total_responses || 0) + 1;
              const newAvg = nps_score !== null && nps_score !== undefined
                ? (((existing.avg_nps || 0) * (existing.total_responses || 0)) + nps_score) / newTotal
                : existing.avg_nps;
              await env.DB.prepare(
                "UPDATE trace_contacts SET last_seen=datetime('now'), total_responses=?, avg_nps=? WHERE id=?"
              ).bind(newTotal, newAvg, existing.id).run();
            } else {
              await env.DB.prepare(
                `INSERT INTO trace_contacts (id, user_id, email, total_responses, avg_nps, source_point_id)
                 VALUES (?,?,?,?,?,?)`
              ).bind(uuid(), point.user_id, contact_email, 1, nps_score ?? null, pointId).run();
            }
          })();
          alertOps.push(crmOp);
        }

        if (alertOps.length > 0) {
          ctx.waitUntil(Promise.all(alertOps));
        }

        return json({ ok: true, response_id: responseId }, 201);
      }

      // ══════════════════════════════════════════
      // TRACE — authenticated endpoints
      // ══════════════════════════════════════════

      // GET /api/trace/alerts
      if (path === "/api/trace/alerts" && method === "GET") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const result = await env.DB.prepare(
          "SELECT * FROM trace_alerts WHERE user_id=? AND is_resolved=0 ORDER BY created_at DESC LIMIT 100"
        ).bind(user.sub).all();
        return json({ ok: true, alerts: result.results });
      }

      // PATCH /api/trace/alerts/:id/resolve
      if (path.match(/^\/api\/trace\/alerts\/[^/]+\/resolve$/) && method === "PATCH") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const alertId = path.split("/api/trace/alerts/")[1].replace("/resolve", "");
        const alert = await env.DB.prepare("SELECT user_id FROM trace_alerts WHERE id=?").bind(alertId).first();
        if (!alert) return json({ ok: false, error: "Alerta no encontrada" }, 404);
        if (alert.user_id !== user.sub && user.role !== "superadmin") return json({ ok: false, error: "Sin permiso" }, 403);
        await env.DB.prepare("UPDATE trace_alerts SET is_resolved=1 WHERE id=?").bind(alertId).run();
        return json({ ok: true });
      }

      // GET /api/trace/responses — all responses for user's points
      if (path === "/api/trace/responses" && method === "GET") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const limit = parseInt(url.searchParams.get("limit") || "50");
        const offset = parseInt(url.searchParams.get("offset") || "0");
        const result = await env.DB.prepare(
          `SELECT tr.* FROM trace_responses tr
           JOIN trace_points tp ON tr.point_id = tp.id
           WHERE tp.user_id=?
           ORDER BY tr.created_at DESC LIMIT ? OFFSET ?`
        ).bind(user.sub, limit, offset).all();
        return json({ ok: true, responses: result.results });
      }

      // GET /api/trace/points/:id/responses
      if (path.match(/^\/api\/trace\/points\/[^/]+\/responses$/) && method === "GET") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const pointId = path.split("/api/trace/points/")[1].replace("/responses", "");
        const point = await env.DB.prepare("SELECT user_id FROM trace_points WHERE id=?").bind(pointId).first();
        if (!point) return json({ ok: false, error: "Punto no encontrado" }, 404);
        if (point.user_id !== user.sub && user.role !== "superadmin") return json({ ok: false, error: "Sin permiso" }, 403);
        const limit = parseInt(url.searchParams.get("limit") || "50");
        const offset = parseInt(url.searchParams.get("offset") || "0");
        const result = await env.DB.prepare(
          "SELECT * FROM trace_responses WHERE point_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?"
        ).bind(pointId, limit, offset).all();
        return json({ ok: true, responses: result.results });
      }

      // GET /api/trace/points/:id
      if (path.match(/^\/api\/trace\/points\/[^/]+$/) && method === "GET") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const pointId = path.split("/api/trace/points/")[1];
        const point = await env.DB.prepare("SELECT * FROM trace_points WHERE id=?").bind(pointId).first();
        if (!point) return json({ ok: false, error: "Punto no encontrado" }, 404);
        if (point.user_id !== user.sub && user.role !== "superadmin") return json({ ok: false, error: "Sin permiso" }, 403);
        return json({ ok: true, point: {
          ...point,
          checklist_items: JSON.parse(point.checklist_items || "[]"),
          survey_questions: JSON.parse(point.survey_questions || "[]"),
          alert_config: JSON.parse(point.alert_config || "{}"),
        }});
      }

      // PUT /api/trace/points/:id
      if (path.match(/^\/api\/trace\/points\/[^/]+$/) && method === "PUT") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const pointId = path.split("/api/trace/points/")[1];
        const point = await env.DB.prepare("SELECT user_id FROM trace_points WHERE id=?").bind(pointId).first();
        if (!point) return json({ ok: false, error: "Punto no encontrado" }, 404);
        if (point.user_id !== user.sub && user.role !== "superadmin") return json({ ok: false, error: "Sin permiso" }, 403);

        const { name, area, description, template, qr_type, checklist_items, survey_questions, alert_config, is_active } = await request.json();
        await env.DB.prepare(
          `UPDATE trace_points SET
           name=?, area=?, description=?, template=?, qr_type=?,
           checklist_items=?, survey_questions=?, alert_config=?, is_active=?
           WHERE id=?`
        ).bind(
          name, area || null, description || null, template || "custom", qr_type || "mixed",
          JSON.stringify(checklist_items || []),
          JSON.stringify(survey_questions || []),
          JSON.stringify(alert_config || {}),
          is_active !== undefined ? (is_active ? 1 : 0) : 1,
          pointId
        ).run();
        return json({ ok: true });
      }

      // DELETE /api/trace/points/:id
      if (path.match(/^\/api\/trace\/points\/[^/]+$/) && method === "DELETE") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const pointId = path.split("/api/trace/points/")[1];
        const point = await env.DB.prepare("SELECT user_id FROM trace_points WHERE id=?").bind(pointId).first();
        if (!point) return json({ ok: false, error: "Punto no encontrado" }, 404);
        if (point.user_id !== user.sub && user.role !== "superadmin") return json({ ok: false, error: "Sin permiso" }, 403);
        await env.DB.prepare("DELETE FROM trace_points WHERE id=?").bind(pointId).run();
        return json({ ok: true });
      }

      // GET /api/trace/points
      if (path === "/api/trace/points" && method === "GET") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const result = await env.DB.prepare(
          "SELECT * FROM trace_points WHERE user_id=? ORDER BY created_at DESC"
        ).bind(user.sub).all();
        return json({ ok: true, points: result.results.map(p => ({
          ...p,
          checklist_items: JSON.parse(p.checklist_items || "[]"),
          survey_questions: JSON.parse(p.survey_questions || "[]"),
          alert_config: JSON.parse(p.alert_config || "{}"),
        }))});
      }

      // POST /api/trace/points
      if (path === "/api/trace/points" && method === "POST") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;

        // Plan gate
        if (!["pro", "enterprise"].includes(user.plan) && user.role !== "superadmin") {
          return json({ ok: false, error: "TRACE requiere plan Pro o superior" }, 403);
        }

        const { name, area, description, template, qr_type, checklist_items, survey_questions, alert_config } = await request.json();
        if (!name) return json({ ok: false, error: "Nombre requerido" }, 400);

        const id = uuid();
        await env.DB.prepare(
          `INSERT INTO trace_points
           (id, user_id, name, area, description, template, qr_type, checklist_items, survey_questions, alert_config)
           VALUES (?,?,?,?,?,?,?,?,?,?)`
        ).bind(
          id, user.sub, name, area || null, description || null,
          template || "custom", qr_type || "mixed",
          JSON.stringify(checklist_items || []),
          JSON.stringify(survey_questions || []),
          JSON.stringify(alert_config || {})
        ).run();

        return json({ ok: true, point: { id, name } }, 201);
      }

      // ══════════════════════════════════════════
      // TRACE — CRM endpoints
      // ══════════════════════════════════════════

      // GET /api/trace/crm/contacts
      if (path === "/api/trace/crm/contacts" && method === "GET") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const search = url.searchParams.get("search") || "";
        const tag = url.searchParams.get("tag") || "";
        const minNps = url.searchParams.get("min_nps");
        let query = "SELECT * FROM trace_contacts WHERE user_id=?";
        const params = [user.sub];
        if (search) { query += " AND (email LIKE ? OR name LIKE ?)"; params.push(`%${search}%`, `%${search}%`); }
        if (minNps !== null && minNps !== "") { query += " AND avg_nps >= ?"; params.push(parseFloat(minNps)); }
        query += " ORDER BY last_seen DESC LIMIT 200";
        const result = await env.DB.prepare(query).bind(...params).all();
        let contacts = result.results.map(c => ({ ...c, tags: JSON.parse(c.tags || "[]") }));
        if (tag) contacts = contacts.filter(c => c.tags.includes(tag));
        return json({ ok: true, contacts });
      }

      // GET /api/trace/crm/contacts/:id
      if (path.match(/^\/api\/trace\/crm\/contacts\/[^/]+$/) && method === "GET") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const contactId = path.split("/api/trace/crm/contacts/")[1];
        const contact = await env.DB.prepare("SELECT * FROM trace_contacts WHERE id=? AND user_id=?").bind(contactId, user.sub).first();
        if (!contact) return json({ ok: false, error: "Contacto no encontrado" }, 404);
        const responses = await env.DB.prepare(
          "SELECT * FROM trace_responses WHERE contact_email=? ORDER BY created_at DESC LIMIT 100"
        ).bind(contact.email).all();
        return json({ ok: true, contact: { ...contact, tags: JSON.parse(contact.tags || "[]") }, responses: responses.results });
      }

      // PATCH /api/trace/crm/contacts/:id
      if (path.match(/^\/api\/trace\/crm\/contacts\/[^/]+$/) && method === "PATCH") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const contactId = path.split("/api/trace/crm/contacts/")[1];
        const contact = await env.DB.prepare("SELECT user_id FROM trace_contacts WHERE id=?").bind(contactId).first();
        if (!contact) return json({ ok: false, error: "Contacto no encontrado" }, 404);
        if (contact.user_id !== user.sub && user.role !== "superadmin") return json({ ok: false, error: "Sin permiso" }, 403);
        const { tags, notes, name, phone } = await request.json();
        await env.DB.prepare(
          "UPDATE trace_contacts SET tags=?, notes=?, name=?, phone=? WHERE id=?"
        ).bind(
          tags !== undefined ? JSON.stringify(tags) : undefined,
          notes !== undefined ? notes : undefined,
          name !== undefined ? name : undefined,
          phone !== undefined ? phone : undefined,
          contactId
        ).run();
        return json({ ok: true });
      }

      // ══════════════════════════════════════════
      // TRACE — Reports
      // ══════════════════════════════════════════

      // POST /api/trace/report/send — manual trigger (superadmin)
      if (path === "/api/trace/report/send" && method === "POST") {
        const user = await getUser(request, env);
        const err = requireAuth(user, "superadmin");
        if (err) return err;
        ctx.waitUntil(generateWeeklyReports(env));
        return json({ ok: true, message: "Generación de reportes iniciada" });
      }

      // ══════════════════════════════════════════
      // TEAM — Tenant member management
      // ══════════════════════════════════════════

      // GET /api/team/members
      if (path === "/api/team/members" && method === "GET") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        if (["operator","viewer"].includes(user.role)) return json({ ok: false, error: "Acceso denegado" }, 403);
        const result = await env.DB.prepare(
          "SELECT * FROM tenant_members WHERE tenant_owner_id=? ORDER BY invited_at DESC"
        ).bind(user.sub).all();
        return json({ ok: true, members: result.results });
      }

      // POST /api/team/invite
      if (path === "/api/team/invite" && method === "POST") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        if (!["owner","admin","enterprise","superadmin"].includes(user.role)) return json({ ok: false, error: "Acceso denegado" }, 403);
        const { email, role } = await request.json();
        if (!email) return json({ ok: false, error: "Email requerido" }, 400);
        const validRoles = ["admin","manager","operator","viewer"];
        if (!validRoles.includes(role)) return json({ ok: false, error: "Rol inválido" }, 400);
        const id = uuid();
        await env.DB.prepare(
          "INSERT INTO tenant_members (id, tenant_owner_id, email, role, status, invited_by) VALUES (?,?,?,?,?,?)"
        ).bind(id, user.sub, email.toLowerCase(), role, "pending", user.sub).run();
        return json({ ok: true, member: { id, email, role, status: "pending" } }, 201);
      }

      // PATCH /api/team/members/:id
      if (path.match(/^\/api\/team\/members\/[^/]+$/) && method === "PATCH") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        if (!["owner","admin","enterprise","superadmin"].includes(user.role)) return json({ ok: false, error: "Acceso denegado" }, 403);
        const memberId = path.split("/api/team/members/")[1];
        const member = await env.DB.prepare("SELECT * FROM tenant_members WHERE id=? AND tenant_owner_id=?").bind(memberId, user.sub).first();
        if (!member) return json({ ok: false, error: "Miembro no encontrado" }, 404);
        const { role, status } = await request.json();
        if (role) {
          const validRoles = ["admin","manager","operator","viewer"];
          if (!validRoles.includes(role)) return json({ ok: false, error: "Rol inválido" }, 400);
          if (user.role === "admin" && ["owner","admin"].includes(member.role)) return json({ ok: false, error: "No puedes modificar admins" }, 403);
        }
        const updates = [];
        const params = [];
        if (role) { updates.push("role=?"); params.push(role); }
        if (status) { updates.push("status=?"); params.push(status); }
        if (!updates.length) return json({ ok: false, error: "Nada que actualizar" }, 400);
        params.push(memberId);
        await env.DB.prepare(`UPDATE tenant_members SET ${updates.join(",")} WHERE id=?`).bind(...params).run();
        return json({ ok: true });
      }

      // DELETE /api/team/members/:id
      if (path.match(/^\/api\/team\/members\/[^/]+$/) && method === "DELETE") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        if (!["owner","enterprise","superadmin"].includes(user.role)) return json({ ok: false, error: "Solo el owner puede revocar" }, 403);
        const memberId = path.split("/api/team/members/")[1];
        const member = await env.DB.prepare("SELECT id FROM tenant_members WHERE id=? AND tenant_owner_id=?").bind(memberId, user.sub).first();
        if (!member) return json({ ok: false, error: "Miembro no encontrado" }, 404);
        await env.DB.prepare("DELETE FROM tenant_members WHERE id=?").bind(memberId).run();
        return json({ ok: true });
      }

      // ══════════════════════════════════════════
      // SETTINGS — User settings
      // ══════════════════════════════════════════

      // GET /api/settings
      if (path === "/api/settings" && method === "GET") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const u = await env.DB.prepare("SELECT settings FROM users WHERE id=?").bind(user.sub).first();
        const settings = u?.settings ? JSON.parse(u.settings) : {};
        return json({ ok: true, settings });
      }

      // PUT /api/settings
      if (path === "/api/settings" && method === "PUT") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const body = await request.json();
        const u = await env.DB.prepare("SELECT settings FROM users WHERE id=?").bind(user.sub).first();
        const current = u?.settings ? JSON.parse(u.settings) : {};
        const updated = { ...current, ...body };
        await env.DB.prepare("UPDATE users SET settings=? WHERE id=?").bind(JSON.stringify(updated), user.sub).run();
        return json({ ok: true, settings: updated });
      }

      // GET /api/settings/ai — tenant gets own AI config
      if (path === "/api/settings/ai" && method === "GET") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const cfg = await env.DB.prepare("SELECT * FROM tenant_ai_config WHERE user_id=?").bind(user.sub).first().catch(() => null);
        return json({ ok: true, config: cfg || { llm_provider: "claude", weekly_report_enabled: 1 } });
      }

      // PUT /api/settings/ai — tenant updates own AI config
      if (path === "/api/settings/ai" && method === "PUT") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        if (!["pro","enterprise","superadmin"].includes(user.plan || user.role)) {
          return json({ ok: false, error: "El agente IA requiere plan Pro o superior" }, 403);
        }
        const body = await request.json();
        const existing = await env.DB.prepare("SELECT user_id FROM tenant_ai_config WHERE user_id=?").bind(user.sub).first().catch(() => null);
        if (existing) {
          await env.DB.prepare(
            "UPDATE tenant_ai_config SET llm_provider=?, llm_api_key=COALESCE(?,llm_api_key), system_prompt=?, weekly_report_enabled=?, updated_at=datetime('now') WHERE user_id=?"
          ).bind(body.llm_provider || "claude", body.llm_api_key || null, body.system_prompt || null, body.weekly_report_enabled !== false ? 1 : 0, user.sub).run();
        } else {
          await env.DB.prepare(
            "INSERT INTO tenant_ai_config (user_id, llm_provider, llm_api_key, system_prompt, weekly_report_enabled) VALUES (?,?,?,?,?)"
          ).bind(user.sub, body.llm_provider || "claude", body.llm_api_key || null, body.system_prompt || null, body.weekly_report_enabled !== false ? 1 : 0).run();
        }
        return json({ ok: true });
      }

      // ══════════════════════════════════════════
      // SUPER ADMIN — Tenant management
      // ══════════════════════════════════════════

      // GET /api/admin/tenants
      if (path === "/api/admin/tenants" && method === "GET") {
        const user = await getUser(request, env);
        const err = requireAuth(user, "superadmin");
        if (err) return err;
        const search = url.searchParams.get("search") || "";
        const plan = url.searchParams.get("plan") || "";
        const status = url.searchParams.get("status") || "";
        let query = `SELECT u.id, u.email, u.plan, u.role, u.is_active, u.created_at,
          (SELECT COUNT(*) FROM short_links sl WHERE sl.user_id=u.id) as qr_count,
          (SELECT COUNT(*) FROM trace_points tp WHERE tp.user_id=u.id) as trace_points,
          s.status as sub_status, s.trial_ends_at, s.current_period_end, s.amount_usd
          FROM users u
          LEFT JOIN subscriptions s ON s.user_id=u.id
          WHERE 1=1`;
        const params = [];
        if (search) { query += " AND (u.email LIKE ? OR u.id LIKE ?)"; params.push(`%${search}%`, `%${search}%`); }
        if (plan) { query += " AND u.plan=?"; params.push(plan); }
        if (status) { query += " AND s.status=?"; params.push(status); }
        query += " ORDER BY u.created_at DESC LIMIT 100";
        const result = await env.DB.prepare(query).bind(...params).all();
        return json({ ok: true, tenants: result.results });
      }

      // GET /api/admin/tenants/:id
      if (path.match(/^\/api\/admin\/tenants\/[^/]+$/) && method === "GET") {
        const user = await getUser(request, env);
        const err = requireAuth(user, "superadmin");
        if (err) return err;
        const tenantId = path.split("/api/admin/tenants/")[1];
        const tenant = await env.DB.prepare(
          `SELECT u.*, s.status as sub_status, s.plan as sub_plan, s.trial_ends_at, s.current_period_end, s.amount_usd, s.gateway
           FROM users u LEFT JOIN subscriptions s ON s.user_id=u.id WHERE u.id=?`
        ).bind(tenantId).first();
        if (!tenant) return json({ ok: false, error: "Tenant no encontrado" }, 404);
        const qrCount = await env.DB.prepare("SELECT COUNT(*) as c FROM short_links WHERE user_id=?").bind(tenantId).first();
        const traceCount = await env.DB.prepare("SELECT COUNT(*) as c FROM trace_points WHERE user_id=?").bind(tenantId).first();
        return json({ ok: true, tenant: { ...tenant, qr_count: qrCount?.c, trace_points: traceCount?.c } });
      }

      // POST /api/admin/tenants/:id/impersonate
      if (path.match(/^\/api\/admin\/tenants\/[^/]+\/impersonate$/) && method === "POST") {
        const user = await getUser(request, env);
        const err = requireAuth(user, "superadmin");
        if (err) return err;
        const tenantId = path.split("/api/admin/tenants/")[1].replace("/impersonate", "");
        const tenant = await env.DB.prepare("SELECT id, email, plan, role FROM users WHERE id=?").bind(tenantId).first();
        if (!tenant) return json({ ok: false, error: "Tenant no encontrado" }, 404);
        const secret = env.JWT_SECRET || "changeme-set-in-cloudflare-dashboard";
        const token = await signToken({ sub: tenant.id, email: tenant.email, plan: tenant.plan, role: tenant.role, impersonated_by: user.sub, exp: Math.floor(Date.now() / 1000) + 3600 }, secret);
        return json({ ok: true, token, tenant: { id: tenant.id, email: tenant.email } });
      }

      // GET /api/admin/tenants/:id/subscription
      if (path.match(/^\/api\/admin\/tenants\/[^/]+\/subscription$/) && method === "GET") {
        const user = await getUser(request, env);
        const err = requireAuth(user, "superadmin");
        if (err) return err;
        const tenantId = path.split("/api/admin/tenants/")[1].replace("/subscription", "");
        const sub = await env.DB.prepare("SELECT * FROM subscriptions WHERE user_id=? ORDER BY created_at DESC LIMIT 1").bind(tenantId).first();
        return json({ ok: true, subscription: sub || null });
      }

      // PUT /api/admin/tenants/:id/subscription
      if (path.match(/^\/api\/admin\/tenants\/[^/]+\/subscription$/) && method === "PUT") {
        const user = await getUser(request, env);
        const err = requireAuth(user, "superadmin");
        if (err) return err;
        const tenantId = path.split("/api/admin/tenants/")[1].replace("/subscription", "");
        const body = await request.json();
        const existing = await env.DB.prepare("SELECT id FROM subscriptions WHERE user_id=?").bind(tenantId).first();
        if (existing) {
          await env.DB.prepare(
            "UPDATE subscriptions SET plan=?, status=?, amount_usd=?, billing_cycle=?, updated_at=datetime('now') WHERE user_id=?"
          ).bind(body.plan || "free", body.status || "active", body.amount_usd || 0, body.billing_cycle || "monthly", tenantId).run();
        } else {
          const id = uuid();
          await env.DB.prepare(
            "INSERT INTO subscriptions (id, user_id, plan, status, amount_usd, billing_cycle) VALUES (?,?,?,?,?,?)"
          ).bind(id, tenantId, body.plan || "free", body.status || "active", body.amount_usd || 0, body.billing_cycle || "monthly").run();
        }
        if (body.plan) await env.DB.prepare("UPDATE users SET plan=? WHERE id=?").bind(body.plan, tenantId).run();
        return json({ ok: true });
      }

      // POST /api/admin/tenants/:id/extend-trial
      if (path.match(/^\/api\/admin\/tenants\/[^/]+\/extend-trial$/) && method === "POST") {
        const user = await getUser(request, env);
        const err = requireAuth(user, "superadmin");
        if (err) return err;
        const tenantId = path.split("/api/admin/tenants/")[1].replace("/extend-trial", "");
        const { days } = await request.json();
        const d = parseInt(days) || 7;
        const newEnd = new Date(Date.now() + d * 86400000).toISOString();
        await env.DB.prepare("UPDATE subscriptions SET trial_ends_at=?, updated_at=datetime('now') WHERE user_id=?").bind(newEnd, tenantId).run();
        return json({ ok: true, trial_ends_at: newEnd });
      }

      // POST /api/admin/tenants/:id/suspend
      if (path.match(/^\/api\/admin\/tenants\/[^/]+\/suspend$/) && method === "POST") {
        const user = await getUser(request, env);
        const err = requireAuth(user, "superadmin");
        if (err) return err;
        const tenantId = path.split("/api/admin/tenants/")[1].replace("/suspend", "");
        await env.DB.prepare("UPDATE users SET is_active=0 WHERE id=?").bind(tenantId).run();
        await env.DB.prepare("UPDATE subscriptions SET status='suspended', updated_at=datetime('now') WHERE user_id=?").bind(tenantId).run();
        return json({ ok: true });
      }

      // POST /api/admin/tenants/:id/unsuspend
      if (path.match(/^\/api\/admin\/tenants\/[^/]+\/unsuspend$/) && method === "POST") {
        const user = await getUser(request, env);
        const err = requireAuth(user, "superadmin");
        if (err) return err;
        const tenantId = path.split("/api/admin/tenants/")[1].replace("/unsuspend", "");
        await env.DB.prepare("UPDATE users SET is_active=1 WHERE id=?").bind(tenantId).run();
        await env.DB.prepare("UPDATE subscriptions SET status='active', updated_at=datetime('now') WHERE user_id=?").bind(tenantId).run();
        return json({ ok: true });
      }

      // GET /api/admin/notifications
      if (path === "/api/admin/notifications" && method === "GET") {
        const user = await getUser(request, env);
        const err = requireAuth(user, "superadmin");
        if (err) return err;
        const result = await env.DB.prepare("SELECT * FROM admin_notifications ORDER BY created_at DESC LIMIT 100").all();
        return json({ ok: true, notifications: result.results });
      }

      // POST /api/admin/notifications
      if (path === "/api/admin/notifications" && method === "POST") {
        const user = await getUser(request, env);
        const err = requireAuth(user, "superadmin");
        if (err) return err;
        const { title, body: msgBody, segment, channel } = await request.json();
        if (!title || !msgBody) return json({ ok: false, error: "Título y cuerpo requeridos" }, 400);
        const id = uuid();
        await env.DB.prepare(
          "INSERT INTO admin_notifications (id, title, body, segment, channel, created_by) VALUES (?,?,?,?,?,?)"
        ).bind(id, title, msgBody, segment || "all", channel || "in_app", user.sub).run();
        return json({ ok: true, notification: { id, title } }, 201);
      }

      // POST /api/admin/notifications/:id/send
      if (path.match(/^\/api\/admin\/notifications\/[^/]+\/send$/) && method === "POST") {
        const user = await getUser(request, env);
        const err = requireAuth(user, "superadmin");
        if (err) return err;
        const notifId = path.split("/api/admin/notifications/")[1].replace("/send", "");
        await env.DB.prepare(
          "UPDATE admin_notifications SET status='sent', sent_at=datetime('now') WHERE id=?"
        ).bind(notifId).run();
        return json({ ok: true });
      }

      // GET /api/admin/tenants/:id/ai-config
      if (path.match(/^\/api\/admin\/tenants\/[^/]+\/ai-config$/) && method === "GET") {
        const user = await getUser(request, env);
        const err = requireAuth(user, "superadmin");
        if (err) return err;
        const tenantId = path.split("/api/admin/tenants/")[1].replace("/ai-config", "");
        const config = await env.DB.prepare("SELECT * FROM tenant_ai_config WHERE user_id=?").bind(tenantId).first();
        return json({ ok: true, config: config || { user_id: tenantId, llm_provider: "claude", tokens_used_month: 0, max_tokens_month: 50000 } });
      }

      // PUT /api/admin/tenants/:id/ai-config
      if (path.match(/^\/api\/admin\/tenants\/[^/]+\/ai-config$/) && method === "PUT") {
        const user = await getUser(request, env);
        const err = requireAuth(user, "superadmin");
        if (err) return err;
        const tenantId = path.split("/api/admin/tenants/")[1].replace("/ai-config", "");
        const body = await request.json();
        const existing = await env.DB.prepare("SELECT user_id FROM tenant_ai_config WHERE user_id=?").bind(tenantId).first();
        if (existing) {
          await env.DB.prepare(
            "UPDATE tenant_ai_config SET llm_provider=?, system_prompt=?, max_tokens_month=?, weekly_report_enabled=?, updated_at=datetime('now') WHERE user_id=?"
          ).bind(body.llm_provider || "claude", body.system_prompt || null, body.max_tokens_month || 50000, body.weekly_report_enabled !== false ? 1 : 0, tenantId).run();
        } else {
          await env.DB.prepare(
            "INSERT INTO tenant_ai_config (user_id, llm_provider, system_prompt, max_tokens_month, weekly_report_enabled) VALUES (?,?,?,?,?)"
          ).bind(tenantId, body.llm_provider || "claude", body.system_prompt || null, body.max_tokens_month || 50000, body.weekly_report_enabled !== false ? 1 : 0).run();
        }
        return json({ ok: true });
      }

      // GET /api/admin/tenants/:id/ai-config/usage
      if (path.match(/^\/api\/admin\/tenants\/[^/]+\/ai-config\/usage$/) && method === "GET") {
        const user = await getUser(request, env);
        const err = requireAuth(user, "superadmin");
        if (err) return err;
        const tenantId = path.split("/api/admin/tenants/")[1].replace("/ai-config/usage", "");
        const config = await env.DB.prepare("SELECT tokens_used_month, max_tokens_month FROM tenant_ai_config WHERE user_id=?").bind(tenantId).first();
        return json({ ok: true, usage: config || { tokens_used_month: 0, max_tokens_month: 50000 } });
      }

      // ══════════════════════════════════════════
      // TRACE — Projects (independent from regular QR projects)
      // ══════════════════════════════════════════

      if (path === "/api/trace/projects" && method === "GET") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const result = await env.DB.prepare(
          "SELECT * FROM trace_projects WHERE user_id=? ORDER BY created_at DESC"
        ).bind(user.sub).all();
        return json({ ok: true, projects: result.results });
      }

      if (path === "/api/trace/projects" && method === "POST") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const { name, description, color } = await request.json();
        if (!name) return json({ ok: false, error: "Nombre requerido" }, 400);
        const id = uuid();
        await env.DB.prepare(
          "INSERT INTO trace_projects (id, user_id, name, description, color) VALUES (?,?,?,?,?)"
        ).bind(id, user.sub, name, description || null, color || "#2563eb").run();
        return json({ ok: true, project: { id, name, description, color } }, 201);
      }

      if (path.match(/^\/api\/trace\/projects\/[^/]+$/) && method === "PUT") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const projectId = path.split("/api/trace/projects/")[1];
        const project = await env.DB.prepare("SELECT user_id FROM trace_projects WHERE id=?").bind(projectId).first();
        if (!project) return json({ ok: false, error: "Proyecto no encontrado" }, 404);
        if (project.user_id !== user.sub && user.role !== "superadmin") return json({ ok: false, error: "Sin permiso" }, 403);
        const { name, description, color } = await request.json();
        await env.DB.prepare(
          "UPDATE trace_projects SET name=?, description=?, color=? WHERE id=?"
        ).bind(name, description || null, color || "#2563eb", projectId).run();
        return json({ ok: true });
      }

      if (path.match(/^\/api\/trace\/projects\/[^/]+$/) && method === "DELETE") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const projectId = path.split("/api/trace/projects/")[1];
        const project = await env.DB.prepare("SELECT user_id FROM trace_projects WHERE id=?").bind(projectId).first();
        if (!project) return json({ ok: false, error: "Proyecto no encontrado" }, 404);
        if (project.user_id !== user.sub && user.role !== "superadmin") return json({ ok: false, error: "Sin permiso" }, 403);
        await env.DB.prepare("DELETE FROM trace_projects WHERE id=?").bind(projectId).run();
        return json({ ok: true });
      }

      // ══════════════════════════════════════════
      // TRACE — Automations
      // ══════════════════════════════════════════

      if (path === "/api/trace/automations" && method === "GET") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const result = await env.DB.prepare(
          "SELECT * FROM trace_automations WHERE user_id=? ORDER BY created_at DESC"
        ).bind(user.sub).all();
        return json({ ok: true, automations: result.results.map(a => ({
          ...a,
          trigger_value: JSON.parse(a.trigger_value || "{}"),
          action_config: JSON.parse(a.action_config || "{}"),
        })) });
      }

      if (path === "/api/trace/automations" && method === "POST") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const { name, point_id, trigger_type, trigger_value, action_type, action_config, message_template } = await request.json();
        if (!name || !trigger_type || !action_type) return json({ ok: false, error: "Nombre, trigger y acción requeridos" }, 400);
        const id = uuid();
        await env.DB.prepare(
          `INSERT INTO trace_automations (id, point_id, user_id, name, trigger_type, trigger_value, action_type, action_config, message_template)
           VALUES (?,?,?,?,?,?,?,?,?)`
        ).bind(id, point_id || null, user.sub, name, trigger_type,
          JSON.stringify(trigger_value || {}),
          action_type,
          JSON.stringify(action_config || {}),
          message_template || null
        ).run();
        return json({ ok: true, automation: { id, name } }, 201);
      }

      if (path.match(/^\/api\/trace\/automations\/[^/]+$/) && method === "PUT") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const autoId = path.split("/api/trace/automations/")[1];
        const auto = await env.DB.prepare("SELECT user_id FROM trace_automations WHERE id=?").bind(autoId).first();
        if (!auto) return json({ ok: false, error: "Automatización no encontrada" }, 404);
        if (auto.user_id !== user.sub && user.role !== "superadmin") return json({ ok: false, error: "Sin permiso" }, 403);
        const { name, point_id, trigger_type, trigger_value, action_type, action_config, message_template } = await request.json();
        await env.DB.prepare(
          `UPDATE trace_automations SET name=?, point_id=?, trigger_type=?, trigger_value=?, action_type=?, action_config=?, message_template=? WHERE id=?`
        ).bind(name, point_id || null, trigger_type,
          JSON.stringify(trigger_value || {}),
          action_type,
          JSON.stringify(action_config || {}),
          message_template || null, autoId
        ).run();
        return json({ ok: true });
      }

      if (path.match(/^\/api\/trace\/automations\/[^/]+$/) && method === "DELETE") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const autoId = path.split("/api/trace/automations/")[1];
        const auto = await env.DB.prepare("SELECT user_id FROM trace_automations WHERE id=?").bind(autoId).first();
        if (!auto) return json({ ok: false, error: "Automatización no encontrada" }, 404);
        if (auto.user_id !== user.sub && user.role !== "superadmin") return json({ ok: false, error: "Sin permiso" }, 403);
        await env.DB.prepare("DELETE FROM trace_automations WHERE id=?").bind(autoId).run();
        return json({ ok: true });
      }

      if (path.match(/^\/api\/trace\/automations\/[^/]+\/toggle$/) && method === "PATCH") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const autoId = path.split("/api/trace/automations/")[1].replace("/toggle", "");
        const auto = await env.DB.prepare("SELECT user_id, is_active FROM trace_automations WHERE id=?").bind(autoId).first();
        if (!auto) return json({ ok: false, error: "Automatización no encontrada" }, 404);
        if (auto.user_id !== user.sub && user.role !== "superadmin") return json({ ok: false, error: "Sin permiso" }, 403);
        const newState = auto.is_active ? 0 : 1;
        await env.DB.prepare("UPDATE trace_automations SET is_active=? WHERE id=?").bind(newState, autoId).run();
        return json({ ok: true, is_active: newState });
      }

      // ══════════════════════════════════════════
      // TRACE — Templates
      // ══════════════════════════════════════════

      if (path === "/api/trace/templates" && method === "GET") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const result = await env.DB.prepare(
          "SELECT * FROM trace_templates WHERE user_id=? OR is_public=1 ORDER BY created_at DESC"
        ).bind(user.sub).all();
        return json({ ok: true, templates: result.results.map(t => ({
          ...t,
          checklist_items: JSON.parse(t.checklist_items || "[]"),
          survey_questions: JSON.parse(t.survey_questions || "[]"),
        })) });
      }

      if (path === "/api/trace/templates" && method === "POST") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const { name, industry, brand_color, brand_logo, checklist_items, survey_questions, is_public } = await request.json();
        if (!name) return json({ ok: false, error: "Nombre requerido" }, 400);
        const id = uuid();
        await env.DB.prepare(
          `INSERT INTO trace_templates (id, user_id, name, industry, brand_color, brand_logo, checklist_items, survey_questions, is_public)
           VALUES (?,?,?,?,?,?,?,?,?)`
        ).bind(id, user.sub, name, industry || null, brand_color || "#2563eb", brand_logo || null,
          JSON.stringify(checklist_items || []),
          JSON.stringify(survey_questions || []),
          is_public ? 1 : 0
        ).run();
        return json({ ok: true, template: { id, name } }, 201);
      }

      if (path.match(/^\/api\/trace\/templates\/[^/]+$/) && method === "PUT") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const tmplId = path.split("/api/trace/templates/")[1];
        const tmpl = await env.DB.prepare("SELECT user_id FROM trace_templates WHERE id=?").bind(tmplId).first();
        if (!tmpl) return json({ ok: false, error: "Plantilla no encontrada" }, 404);
        if (tmpl.user_id !== user.sub && user.role !== "superadmin") return json({ ok: false, error: "Sin permiso" }, 403);
        const { name, industry, brand_color, brand_logo, checklist_items, survey_questions, is_public } = await request.json();
        await env.DB.prepare(
          `UPDATE trace_templates SET name=?, industry=?, brand_color=?, brand_logo=?, checklist_items=?, survey_questions=?, is_public=? WHERE id=?`
        ).bind(name, industry || null, brand_color || "#2563eb", brand_logo || null,
          JSON.stringify(checklist_items || []),
          JSON.stringify(survey_questions || []),
          is_public ? 1 : 0, tmplId
        ).run();
        return json({ ok: true });
      }

      if (path.match(/^\/api\/trace\/templates\/[^/]+$/) && method === "DELETE") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const tmplId = path.split("/api/trace/templates/")[1];
        const tmpl = await env.DB.prepare("SELECT user_id FROM trace_templates WHERE id=?").bind(tmplId).first();
        if (!tmpl) return json({ ok: false, error: "Plantilla no encontrada" }, 404);
        if (tmpl.user_id !== user.sub && user.role !== "superadmin") return json({ ok: false, error: "Sin permiso" }, 403);
        await env.DB.prepare("DELETE FROM trace_templates WHERE id=?").bind(tmplId).run();
        return json({ ok: true });
      }

      // ══════════════════════════════════════════
      // TRACE — Notification Channels
      // ══════════════════════════════════════════

      if (path === "/api/trace/channels" && method === "GET") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const result = await env.DB.prepare(
          "SELECT * FROM trace_notification_channels WHERE user_id=? ORDER BY created_at DESC"
        ).bind(user.sub).all();
        return json({ ok: true, channels: result.results.map(c => ({
          ...c, config: JSON.parse(c.config || "{}"),
        })) });
      }

      if (path === "/api/trace/channels" && method === "POST") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const { channel_type, config, label } = await request.json();
        if (!channel_type || !config) return json({ ok: false, error: "Tipo y configuración requeridos" }, 400);
        const validTypes = ["email", "whatsapp", "slack", "webhook"];
        if (!validTypes.includes(channel_type)) return json({ ok: false, error: "Tipo de canal inválido" }, 400);
        const id = uuid();
        await env.DB.prepare(
          "INSERT INTO trace_notification_channels (id, user_id, channel_type, config, label) VALUES (?,?,?,?,?)"
        ).bind(id, user.sub, channel_type, JSON.stringify(config), label || null).run();
        return json({ ok: true, channel: { id, channel_type, label } }, 201);
      }

      if (path.match(/^\/api\/trace\/channels\/[^/]+$/) && method === "DELETE") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const channelId = path.split("/api/trace/channels/")[1];
        const channel = await env.DB.prepare("SELECT user_id FROM trace_notification_channels WHERE id=?").bind(channelId).first();
        if (!channel) return json({ ok: false, error: "Canal no encontrado" }, 404);
        if (channel.user_id !== user.sub && user.role !== "superadmin") return json({ ok: false, error: "Sin permiso" }, 403);
        await env.DB.prepare("DELETE FROM trace_notification_channels WHERE id=?").bind(channelId).run();
        return json({ ok: true });
      }

      if (path.match(/^\/api\/trace\/channels\/[^/]+\/test$/) && method === "POST") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const channelId = path.split("/api/trace/channels/")[1].replace("/test", "");
        const channel = await env.DB.prepare("SELECT * FROM trace_notification_channels WHERE id=? AND user_id=?").bind(channelId, user.sub).first();
        if (!channel) return json({ ok: false, error: "Canal no encontrado" }, 404);
        // Simulated test — in production this would call the actual notification service
        return json({ ok: true, message: "Notificación de prueba enviada (simulado)" });
      }

      // Root
      return json({ ok: true, service: "prince-qr-manager", version: "2.1.0" });

    } catch (e) {
      console.error(e);
      return json({ ok: false, error: `Error interno: ${e.message}` }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(generateWeeklyReports(env));
  },
};

// ──────────────────────────────────────────────
// Weekly AI report generator
// ──────────────────────────────────────────────

// ── Multi-LLM router ──────────────────────────────────────────────────────────
// Calls the correct LLM API based on tenant config. Falls back to Claude.
// Each provider uses its own key: tenant's own key takes priority over platform key.
async function callLLM({ provider = "claude", apiKey, systemPrompt, userPrompt, maxTokens = 400, env }) {
  const key = apiKey || env[`${provider.toUpperCase()}_API_KEY`] || env.ANTHROPIC_API_KEY;
  const sys = systemPrompt || "Eres un asistente analítico experto en operaciones y atención al cliente. Responde siempre en español, de forma clara y accionable.";

  try {
    if (provider === "claude" || (!apiKey && !env[`${provider.toUpperCase()}_API_KEY`])) {
      // Anthropic Claude
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: maxTokens,
          system: sys,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });
      const data = await res.json();
      return data.content?.[0]?.text || null;
    }

    if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          max_tokens: maxTokens,
          messages: [{ role: "system", content: sys }, { role: "user", content: userPrompt }],
        }),
      });
      const data = await res.json();
      return data.choices?.[0]?.message?.content || null;
    }

    if (provider === "gemini") {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: sys }] },
          contents: [{ parts: [{ text: userPrompt }] }],
          generationConfig: { maxOutputTokens: maxTokens },
        }),
      });
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
    }

    if (provider === "groq") {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          max_tokens: maxTokens,
          messages: [{ role: "system", content: sys }, { role: "user", content: userPrompt }],
        }),
      });
      const data = await res.json();
      return data.choices?.[0]?.message?.content || null;
    }

    // Fallback: Claude
    return await callLLM({ provider: "claude", apiKey: env.ANTHROPIC_API_KEY, systemPrompt: sys, userPrompt, maxTokens, env });
  } catch (e) {
    console.error(`LLM call failed (${provider}):`, e);
    return null;
  }
}

async function generateWeeklyReports(env) {
  try {
    const users = await env.DB.prepare(
      "SELECT id, email, plan FROM users WHERE plan IN ('pro','enterprise') AND is_active=1"
    ).all();

    for (const u of users.results) {
      try {
        // Load tenant AI config (provider, system_prompt, api_key, enabled flag)
        const aiCfg = await env.DB.prepare(
          "SELECT * FROM tenant_ai_config WHERE user_id=?"
        ).bind(u.id).first().catch(() => null);

        if (aiCfg && !aiCfg.weekly_report_enabled) continue;

        const points = await env.DB.prepare(
          "SELECT * FROM trace_points WHERE user_id=? AND is_active=1"
        ).bind(u.id).all();
        if (!points.results.length) continue;

        const pointIds = points.results.map(p => p.id);
        const placeholders = pointIds.map(() => "?").join(",");
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const responses = await env.DB.prepare(
          `SELECT * FROM trace_responses WHERE point_id IN (${placeholders}) AND created_at >= ?`
        ).bind(...pointIds, sevenDaysAgo).all();

        const alerts = await env.DB.prepare(
          `SELECT * FROM trace_alerts WHERE point_id IN (${placeholders}) AND is_resolved=0 AND created_at >= ?`
        ).bind(...pointIds, sevenDaysAgo).all();

        const responseCount = responses.results.length;
        const npsScores = responses.results.filter(r => r.nps_score !== null).map(r => r.nps_score);
        const avgNps = npsScores.length ? (npsScores.reduce((a, b) => a + b, 0) / npsScores.length).toFixed(1) : null;
        const alertCount = alerts.results.length;
        const missedChecklists = alerts.results.filter(a => a.alert_type === "missed_checklist").length;
        const lowNpsAlerts = alerts.results.filter(a => a.alert_type === "low_nps").length;

        const userPrompt = `Datos operativos de la semana (${sevenDaysAgo.split("T")[0]} al ${new Date().toISOString().split("T")[0]}):
- Puntos de control activos: ${points.results.length} (${points.results.map(p => p.name).join(", ")})
- Total de respuestas recibidas: ${responseCount}
- NPS promedio: ${avgNps ?? "Sin datos suficientes"}
- Alertas abiertas: ${alertCount} (${missedChecklists} checklists incompletos, ${lowNpsAlerts} NPS bajos)

Genera un reporte ejecutivo de máximo 200 palabras con 3 secciones:
1. RESUMEN: situación general de la semana
2. ATENCIÓN: puntos críticos que requieren acción
3. RECOMENDACIÓN: una acción concreta y prioritaria para la próxima semana`;

        const provider = aiCfg?.llm_provider || "claude";
        const reportText = await callLLM({
          provider,
          apiKey: aiCfg?.llm_api_key || null,
          systemPrompt: aiCfg?.system_prompt || null,
          userPrompt,
          maxTokens: 500,
          env,
        }) || `Reporte TRACE — Semana del ${sevenDaysAgo.split("T")[0]}\nRespuestas: ${responseCount} | NPS: ${avgNps ?? "N/A"} | Alertas: ${alertCount}`;

        // Update token usage (approximate)
        if (aiCfg) {
          await env.DB.prepare(
            "UPDATE tenant_ai_config SET tokens_used_month = tokens_used_month + 500 WHERE user_id=?"
          ).bind(u.id).run().catch(() => {});
        }

        console.log(`[TRACE Report][${provider}] ${u.email}: ${reportText.substring(0, 80)}...`);
      } catch (userErr) {
        console.error(`Report error for user ${u.id}:`, userErr);
      }
    }
  } catch (e) {
    console.error("Weekly report generation failed:", e);
  }
}
