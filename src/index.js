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

function serveTraceForm(tracePoint, profile = null, staffMode = false) {
  const checklistItems = JSON.parse(tracePoint.checklist_items || "[]");
  const surveyQuestions = JSON.parse(tracePoint.survey_questions || "[]");
  const qrType = tracePoint.qr_type || "mixed";
  const brandColor = profile?.brand_color || tracePoint.brand_color || "#2563eb";
  const brandLogo = profile?.company_logo || tracePoint.brand_logo || null;
  const companyName = profile?.company_name || null;
  const coverImage = profile?.cover_image || null;
  const coverMessage = profile?.cover_message || "¡Gracias por tu visita!";

  // staff_mode logic for mixed points
  const showChecklist = qrType === "checklist" || (qrType === "mixed" && staffMode);
  const showSurvey = qrType === "survey" || (qrType === "mixed" && !staffMode);
  const showReferral = (qrType === "survey" || qrType === "mixed") && !staffMode;

  const checklistHtml = showChecklist && checklistItems.length > 0 ? `
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

  const surveyHtml = showSurvey && surveyQuestions.length > 0 ? `
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
            <p style="font-size:11px;color:#94a3b8;margin-top:6px">Puntuaciones 9-10 = Promotores · 7-8 = Neutros · 0-6 = Detractores</p>
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
        ${showReferral ? `
        <div class="card contact-section">
          <p class="contact-label">¿Cómo te enteraste de nosotros? <span style="color:#94a3b8;font-size:12px">(opcional)</span></p>
          <select id="referralSource" onchange="document.getElementById('otroReferral').style.display=this.value==='otro'?'block':'none'" style="width:100%;border:2px solid #e2e8f0;border-radius:10px;padding:12px 14px;font-family:inherit;font-size:14px;outline:none;background:white;min-height:44px;color:#374151">
            <option value="">Seleccionar...</option>
            <option value="google">Google / búsqueda web</option>
            <option value="ia">Búsqueda con IA (ChatGPT, Gemini, etc.)</option>
            <option value="redes_sociales">Redes sociales</option>
            <option value="anuncio">Anuncio / publicidad</option>
            <option value="recomendacion">Recomendación de un amigo</option>
            <option value="primera_vez">Primera visita</option>
            <option value="recurrente">Soy cliente recurrente</option>
            <option value="otro">Otro</option>
          </select>
          <input type="text" id="otroReferral" placeholder="¿De dónde nos conociste?" style="display:none;margin-top:10px;width:100%;border:2px solid #e2e8f0;border-radius:10px;padding:12px 14px;font-family:inherit;font-size:14px;outline:none;box-sizing:border-box">
        </div>` : ""}
        <div class="card contact-section">
          <p class="contact-label">¿Quieres que te contactemos? <span style="color:#94a3b8;font-size:12px">(opcional)</span></p>
          <div style="display:grid;gap:10px">
            <input type="text" id="contactName" class="email-input" placeholder="Tu nombre completo" style="margin-bottom:0">
            <input type="tel" id="contactPhone" class="email-input" placeholder="Teléfono / WhatsApp" style="margin-bottom:0">
            <input type="email" id="contactEmail" class="email-input" placeholder="tu@correo.com" style="margin-bottom:0">
          </div>
        </div>
        <div id="errorMsg" class="error-msg"></div>
        <button type="submit" class="submit-btn">Enviar respuesta</button>
      </form>
    </div>
    <div id="successArea" style="display:none">
      ${coverImage ? `
      <div style="position:fixed;inset:0;background:url('${coverImage}') center/cover;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:32px;z-index:100">
        <div style="background:rgba(0,0,0,0.45);border-radius:24px;padding:40px 32px;max-width:400px;width:100%">
          ${brandLogo ? `<img src="${brandLogo}" alt="Logo" style="height:56px;object-fit:contain;margin:0 auto 20px;display:block">` : ""}
          <div style="font-size:56px;margin-bottom:16px">✓</div>
          <h2 style="color:white;font-size:26px;font-weight:700;margin-bottom:12px">${coverMessage}</h2>
          <p style="color:rgba(255,255,255,0.8);font-size:14px;margin-bottom:24px">Tu respuesta ha sido registrada. ¡Gracias!</p>
          <div id="contactConfirm" style="display:none;background:rgba(255,255,255,0.15);border-radius:10px;padding:10px 16px;color:white;font-size:13px;margin-bottom:16px">Te contactaremos pronto</div>
          <button onclick="window.close()" style="background:${brandColor};color:white;border:none;border-radius:12px;padding:14px 32px;font-size:15px;font-weight:700;cursor:pointer">Cerrar</button>
        </div>
      </div>` : `
      <div class="success-card">
        <span class="check-anim">&#10003;</span>
        ${brandLogo ? `<img src="${brandLogo}" alt="Logo" style="height:36px;object-fit:contain;margin:0 auto 12px;display:block">` : ""}
        <h2>${coverMessage}</h2>
        <p>Tu respuesta ha sido registrada correctamente.</p>
        ${companyName ? `<p style="margin-top:8px;font-size:12px;color:#15803d;opacity:0.8">${companyName}</p>` : ""}
        <div id="contactConfirm" class="success-contact-msg">Te contactaremos pronto</div>
      </div>`}
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
    function detectBrowser(ua){if(ua.includes('Edg'))return'Edge';if(ua.includes('Chrome'))return'Chrome';if(ua.includes('Firefox'))return'Firefox';if(ua.includes('Safari'))return'Safari';return'Other';}
    function detectOS(ua){if(ua.includes('iPhone')||ua.includes('iPad'))return'iOS';if(ua.includes('Android'))return'Android';if(ua.includes('Windows'))return'Windows';if(ua.includes('Mac'))return'macOS';return'Other';}
    const _ua=navigator.userAgent;
    const _deviceFingerprint=btoa([_ua,screen.width+'x'+screen.height,navigator.language,Intl.DateTimeFormat().resolvedOptions().timeZone].join('|')).slice(0,32);
    const _startTime=Date.now();
    window._scanMeta={
      device_fingerprint:_deviceFingerprint,
      browser:detectBrowser(_ua),
      device_type:/Mobi|Android/i.test(_ua)?'mobile':/Tablet|iPad/i.test(_ua)?'tablet':'desktop',
      os:detectOS(_ua),
      language:navigator.language,
      screen_size:screen.width+'x'+screen.height,
      referrer:document.referrer,
      startTime:_startTime
    };
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
      const contactName=document.getElementById('contactName')?.value.trim()||null;
      const contactPhone=document.getElementById('contactPhone')?.value.trim()||null;
      const contactEmail=document.getElementById('contactEmail').value.trim()||null;
      const referralEl=document.getElementById('referralSource');
      let referralSource=referralEl?referralEl.value||null:null;
      if(referralSource==='otro'){const otroEl=document.getElementById('otroReferral');referralSource=otroEl&&otroEl.value.trim()?otroEl.value.trim():'otro'}
      const respondentType=qrToken?'staff':'anonymous';
      const payload={
        respondent_type:respondentType,checklist_data:checklistData,survey_data:surveyData,nps_score:npsScore,contact_name:contactName,contact_phone:contactPhone,contact_email:contactEmail,referral_source:referralSource,
        device_fingerprint:window._scanMeta.device_fingerprint,
        browser:window._scanMeta.browser,
        device_type:window._scanMeta.device_type,
        os:window._scanMeta.os,
        language:window._scanMeta.language,
        screen_size:window._scanMeta.screen_size,
        referrer:window._scanMeta.referrer,
        time_on_page_seconds:Math.round((Date.now()-window._scanMeta.startTime)/1000)
      };
      if(!navigator.onLine){const raw=localStorage.getItem(QUEUE_KEY);const queue=raw?JSON.parse(raw):[];queue.push(payload);localStorage.setItem(QUEUE_KEY,JSON.stringify(queue));document.getElementById('formArea').style.display='none';document.getElementById('successArea').style.display='block';if(contactName||contactPhone||contactEmail){const cc=document.getElementById('contactConfirm');if(cc)cc.style.display='block';}return}
      try{const data=await submitPayload(payload);if(data.ok){document.getElementById('formArea').style.display='none';document.getElementById('successArea').style.display='block';if(contactEmail){const cc=document.getElementById('contactConfirm');if(cc)cc.style.display='block';}}else{throw new Error(data.error||'Error al enviar')}}catch(ex){errEl.textContent=ex.message;errEl.style.display='block';btn.disabled=false;btn.textContent='Enviar respuesta'}
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

        // Check if slug starts with 't/' — TRACE point URL (qr.intaprd.com/t/:pointId or /t/:slug)
        if (slug.startsWith("t/")) {
          const pointRef = slug.slice(2);
          const staffMode = url.searchParams.get("staff") === "1";
          // Try UUID first, then slug
          let tracePoint = await env.DB.prepare(
            "SELECT tp.*, u.id as owner_id FROM trace_points tp JOIN users u ON tp.user_id=u.id WHERE tp.id=? AND tp.is_active=1"
          ).bind(pointRef).first();
          if (!tracePoint) {
            tracePoint = await env.DB.prepare(
              "SELECT tp.*, u.id as owner_id FROM trace_points tp JOIN users u ON tp.user_id=u.id WHERE tp.point_slug=? AND tp.is_active=1"
            ).bind(pointRef).first();
          }
          if (tracePoint) {
            const profile = await env.DB.prepare("SELECT * FROM tenant_profiles WHERE tenant_id=?").bind(tracePoint.user_id).first().catch(() => null);
            return serveTraceForm(tracePoint, profile, staffMode);
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
            "SELECT * FROM trace_points WHERE id=? AND is_active=1"
          ).bind(slug).first();
          if (tracePoint) {
            const profile = await env.DB.prepare("SELECT * FROM tenant_profiles WHERE tenant_id=?").bind(tracePoint.user_id).first().catch(() => null);
            return serveTraceForm(tracePoint, profile, false);
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
          return new Response(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QR Expirado - Intap Code</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif;background:#f1f5f9;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}.card{background:white;border-radius:20px;padding:48px 40px;text-align:center;max-width:420px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,.08)}.icon{font-size:56px;margin-bottom:16px}.title{font-size:22px;font-weight:700;color:#1e293b;margin-bottom:8px}.msg{font-size:14px;color:#64748b;line-height:1.6;margin-bottom:24px}.brand{font-size:12px;color:#94a3b8;margin-top:32px}a{color:#2563eb}</style></head><body><div class="card"><div class="icon">⏰</div><h1 class="title">Este código QR ha expirado</h1><p class="msg">Este código QR ya no está disponible. Si crees que es un error, contacta al administrador.</p><p class="brand">Powered by <a href="https://intapcode.com">Intap Code</a></p></div></body></html>`, { status: 410, headers: { "Content-Type": "text/html;charset=UTF-8" } });
        }

        // Verificar expiración por escaneos
        if (link.max_scans && link.scan_count >= link.max_scans) {
          ctx.waitUntil(env.QR_CACHE.put(slug, "EXPIRED", { expirationTtl: 3600 }));
          if (link.fallback_url) return Response.redirect(link.fallback_url, 302);
          return new Response(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QR Expirado - Intap Code</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif;background:#f1f5f9;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}.card{background:white;border-radius:20px;padding:48px 40px;text-align:center;max-width:420px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,.08)}.icon{font-size:56px;margin-bottom:16px}.title{font-size:22px;font-weight:700;color:#1e293b;margin-bottom:8px}.msg{font-size:14px;color:#64748b;line-height:1.6;margin-bottom:24px}.brand{font-size:12px;color:#94a3b8;margin-top:32px}a{color:#2563eb}</style></head><body><div class="card"><div class="icon">🔢</div><h1 class="title">Límite de escaneos alcanzado</h1><p class="msg">Este código QR ha alcanzado su límite de escaneos. Contacta al administrador para más información.</p><p class="brand">Powered by <a href="https://intapcode.com">Intap Code</a></p></div></body></html>`, { status: 410, headers: { "Content-Type": "text/html;charset=UTF-8" } });
        }

        // Verificar contraseña QR
        if (link.qr_password) {
          const pw = url.searchParams.get("pw");
          if (!pw || pw !== link.qr_password) {
            return new Response(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Acceso protegido - Intap Code</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif;background:#f1f5f9;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}.card{background:white;border-radius:20px;padding:48px 40px;text-align:center;max-width:420px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,.08)}.icon{font-size:48px;margin-bottom:16px}.title{font-size:20px;font-weight:700;color:#1e293b;margin-bottom:8px}.msg{font-size:14px;color:#64748b;margin-bottom:24px}input{width:100%;border:2px solid #e2e8f0;border-radius:10px;padding:12px 16px;font-size:15px;outline:none;margin-bottom:12px}input:focus{border-color:#2563eb}button{width:100%;background:#2563eb;color:white;border:none;border-radius:10px;padding:14px;font-size:15px;font-weight:600;cursor:pointer}.err{color:#dc2626;font-size:13px;margin-top:8px;display:none}.brand{font-size:12px;color:#94a3b8;margin-top:32px}a{color:#2563eb}</style></head><body><div class="card"><div class="icon">🔒</div><h1 class="title">Contenido protegido</h1><p class="msg">Este QR requiere una contraseña para acceder.</p><input type="password" id="pw" placeholder="Contraseña" onkeydown="if(event.key==='Enter')check()"><button onclick="check()">Acceder</button><p class="err" id="err">Contraseña incorrecta</p><p class="brand">Powered by <a href="https://intapcode.com">Intap Code</a></p></div><script>function check(){const v=document.getElementById('pw').value;if(!v){return;}window.location.href=window.location.pathname+'?pw='+encodeURIComponent(v);}</script></body></html>`, { status: 401, headers: { "Content-Type": "text/html;charset=UTF-8" } });
          }
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

        if (!user) return json({ ok: false, error: "Credenciales inválidas" }, 401);
        if (user.is_active === 0) return json({ ok: false, error: "Cuenta desactivada. Contacta al administrador." }, 401);

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
          contact_name,
          contact_phone,
          contact_email,
          notes,
          device_fingerprint,
          browser,
          device_type: clientDeviceType,
          os,
          language,
          screen_size,
          referrer,
          time_on_page_seconds,
          referral_source,
        } = body;

        // Rate limiting by device_fingerprint
        if (device_fingerprint) {
          const windowHours = point.qr_type === "checklist" ? 1 : 24;
          const recent = await env.DB.prepare(
            `SELECT id FROM trace_responses WHERE point_id=? AND device_fingerprint=? AND created_at > datetime('now', '-${windowHours} hours') LIMIT 1`
          ).bind(pointId, device_fingerprint).first();
          if (recent) {
            return json({ ok: false, error: `Ya enviaste una respuesta recientemente. Intenta de nuevo en ${windowHours === 1 ? "1 hora" : "24 horas"}.` }, 429);
          }
        }

        const cf = request.cf || {};
        const ip = request.headers.get("CF-Connecting-IP") || "unknown";
        const country = cf.country || "unknown";
        const city = cf.city || null;
        const region = cf.region || null;
        const ua = request.headers.get("user-agent") || "";
        const device = clientDeviceType || deviceType(ua);

        // Calculate scan_sequence for this device fingerprint
        let scanSequence = 1;
        if (device_fingerprint) {
          const seqRow = await env.DB.prepare(
            "SELECT COUNT(*) as c FROM trace_responses WHERE point_id=? AND device_fingerprint=?"
          ).bind(pointId, device_fingerprint).first();
          scanSequence = (seqRow?.c ?? 0) + 1;
        }

        const responseId = uuid();
        await env.DB.prepare(
          `INSERT INTO trace_responses
           (id, point_id, respondent_type, user_id, checklist_data, survey_data, nps_score, contact_name, contact_phone, contact_email, notes, ip, country, device,
            city, region, browser, device_type, os, time_on_page_seconds, scan_sequence, device_fingerprint, referrer, language, screen_size, referral_source)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        ).bind(
          responseId, pointId, respondent_type,
          respondentUserId || null,
          JSON.stringify(checklist_data),
          JSON.stringify(survey_data),
          nps_score ?? null,
          contact_name || null,
          contact_phone || null,
          contact_email || null,
          notes || null,
          ip, country, device,
          city, region,
          browser || null,
          device || null,
          os || null,
          time_on_page_seconds ?? null,
          scanSequence,
          device_fingerprint || null,
          referrer || null,
          language || null,
          screen_size || null,
          referral_source || null
        ).run();

        // Update scan_count and last_scan_at on the trace_point
        await env.DB.prepare(
          "UPDATE trace_points SET scan_count = scan_count + 1, last_scan_at = datetime('now') WHERE id=?"
        ).bind(pointId).run();

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
                `INSERT INTO trace_contacts (id, user_id, email, contact_name, contact_phone, total_responses, avg_nps, source_point_id)
                 VALUES (?,?,?,?,?,?,?,?)`
              ).bind(uuid(), point.user_id, contact_email, contact_name || null, contact_phone || null, 1, nps_score ?? null, pointId).run();
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

        const { name, area, description, template, qr_type, checklist_items, survey_questions, alert_config, is_active,
                brand_color, brand_logo, trace_project_id, qr_style_json, responsible_id, notify_collaborator_ids } = await request.json();
        await env.DB.prepare(
          `UPDATE trace_points SET
           name=?, area=?, description=?, template=?, qr_type=?,
           checklist_items=?, survey_questions=?, alert_config=?, is_active=?,
           brand_color=?, brand_logo=?, trace_project_id=?, responsible_id=?, notify_collaborator_ids=?
           WHERE id=?`
        ).bind(
          name, area || null, description || null, template || "custom", qr_type || "mixed",
          JSON.stringify(checklist_items || []),
          JSON.stringify(survey_questions || []),
          JSON.stringify(alert_config || {}),
          is_active !== undefined ? (is_active ? 1 : 0) : 1,
          brand_color || "#2563eb",
          brand_logo || null,
          trace_project_id || null,
          responsible_id || null,
          JSON.stringify(notify_collaborator_ids || []),
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
          `SELECT tp.*, c.name as responsible_name
           FROM trace_points tp
           LEFT JOIN collaborators c ON c.id = tp.responsible_id
           WHERE tp.user_id=? ORDER BY tp.created_at DESC`
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

        const { name, area, description, template, qr_type, checklist_items, survey_questions, alert_config,
                trace_project_id, brand_color, brand_logo } = await request.json();
        if (!name) return json({ ok: false, error: "Nombre requerido" }, 400);

        const id = uuid();
        const slugBase = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,30);
        const slugSuffix = Math.random().toString(36).slice(2,6);
        const pointSlug = `${slugBase}-${slugSuffix}`;
        await env.DB.prepare(
          `INSERT INTO trace_points
           (id, user_id, name, area, description, template, qr_type, checklist_items, survey_questions, alert_config, brand_color, brand_logo, trace_project_id, scan_count, is_active, point_slug)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        ).bind(
          id, user.sub, name, area || null, description || null,
          template || "custom", qr_type || "mixed",
          JSON.stringify(checklist_items || []),
          JSON.stringify(survey_questions || []),
          JSON.stringify(alert_config || {}),
          brand_color || "#2563eb",
          brand_logo || null,
          trace_project_id || null,
          0,
          1,
          pointSlug
        ).run();

        return json({ ok: true, point: { id, name, point_slug: pointSlug } }, 201);
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

      // GET /api/settings/profile
      if (path === "/api/settings/profile" && method === "GET") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const profile = await env.DB.prepare("SELECT * FROM tenant_profiles WHERE tenant_id=?").bind(user.sub).first().catch(() => null);
        return json({ ok: true, profile: profile || {} });
      }

      // PUT /api/settings/profile
      if (path === "/api/settings/profile" && method === "PUT") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const { company_name, company_address, company_phone, company_email, company_logo, brand_color, cover_image, cover_message } = await request.json();
        const existing = await env.DB.prepare("SELECT tenant_id FROM tenant_profiles WHERE tenant_id=?").bind(user.sub).first().catch(() => null);
        if (existing) {
          await env.DB.prepare(
            `UPDATE tenant_profiles SET company_name=?,company_address=?,company_phone=?,company_email=?,company_logo=?,brand_color=?,cover_image=?,cover_message=?,updated_at=datetime('now') WHERE tenant_id=?`
          ).bind(company_name||null,company_address||null,company_phone||null,company_email||null,company_logo||null,brand_color||"#2563eb",cover_image||null,cover_message||"¡Gracias por tu visita!",user.sub).run();
        } else {
          await env.DB.prepare(
            `INSERT INTO tenant_profiles (tenant_id,company_name,company_address,company_phone,company_email,company_logo,brand_color,cover_image,cover_message) VALUES (?,?,?,?,?,?,?,?,?)`
          ).bind(user.sub,company_name||null,company_address||null,company_phone||null,company_email||null,company_logo||null,brand_color||"#2563eb",cover_image||null,cover_message||"¡Gracias por tu visita!").run();
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

      // ══════════════════════════════════════════
      // TRACE — Analytics per point
      // ══════════════════════════════════════════

      // GET /api/trace/points/:id/analytics
      if (path.match(/^\/api\/trace\/points\/[^/]+\/analytics$/) && method === "GET") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const pointId = path.split("/api/trace/points/")[1].replace("/analytics", "");
        const point = await env.DB.prepare("SELECT user_id, scan_count FROM trace_points WHERE id=?").bind(pointId).first();
        if (!point) return json({ ok: false, error: "Punto no encontrado" }, 404);
        if (point.user_id !== user.sub && user.role !== "superadmin") return json({ ok: false, error: "Sin permiso" }, 403);

        const [
          totalResp,
          uniqueDev,
          avgNpsRow,
          avgTimeRow,
          byDevice,
          byBrowser,
          byHour,
          byDay,
          byCountry,
          byCity,
          repeatScan,
          npsDistrib,
          recentResps,
        ] = await Promise.all([
          env.DB.prepare("SELECT COUNT(*) as c FROM trace_responses WHERE point_id=?").bind(pointId).first(),
          env.DB.prepare("SELECT COUNT(DISTINCT device_fingerprint) as c FROM trace_responses WHERE point_id=? AND device_fingerprint IS NOT NULL").bind(pointId).first(),
          env.DB.prepare("SELECT AVG(nps_score) as avg FROM trace_responses WHERE point_id=? AND nps_score IS NOT NULL").bind(pointId).first(),
          env.DB.prepare("SELECT AVG(time_on_page_seconds) as avg FROM trace_responses WHERE point_id=? AND time_on_page_seconds IS NOT NULL").bind(pointId).first(),
          env.DB.prepare("SELECT COALESCE(device_type, device, 'unknown') as dtype, COUNT(*) as c FROM trace_responses WHERE point_id=? GROUP BY dtype").bind(pointId).all(),
          env.DB.prepare("SELECT browser, COUNT(*) as c FROM trace_responses WHERE point_id=? AND browser IS NOT NULL GROUP BY browser").bind(pointId).all(),
          env.DB.prepare("SELECT strftime('%H', created_at) as hr, COUNT(*) as c FROM trace_responses WHERE point_id=? GROUP BY hr").bind(pointId).all(),
          env.DB.prepare("SELECT strftime('%w', created_at) as dw, COUNT(*) as c FROM trace_responses WHERE point_id=? GROUP BY dw").bind(pointId).all(),
          env.DB.prepare("SELECT country, COUNT(*) as c FROM trace_responses WHERE point_id=? GROUP BY country ORDER BY c DESC LIMIT 20").bind(pointId).all(),
          env.DB.prepare("SELECT city, COUNT(*) as c FROM trace_responses WHERE point_id=? AND city IS NOT NULL GROUP BY city ORDER BY c DESC LIMIT 10").bind(pointId).all(),
          env.DB.prepare("SELECT COUNT(*) as c FROM trace_responses WHERE point_id=? AND scan_sequence > 1").bind(pointId).first(),
          env.DB.prepare("SELECT nps_score, COUNT(*) as c FROM trace_responses WHERE point_id=? AND nps_score IS NOT NULL GROUP BY nps_score").bind(pointId).all(),
          env.DB.prepare("SELECT * FROM trace_responses WHERE point_id=? ORDER BY created_at DESC LIMIT 10").bind(pointId).all(),
        ]);

        const totalScans = point.scan_count || totalResp?.c || 0;
        const totalResponses = totalResp?.c || 0;

        // Build by_device map
        const byDeviceMap = {};
        for (const row of byDevice.results) { byDeviceMap[row.dtype] = row.c; }

        // Build by_browser map
        const byBrowserMap = {};
        for (const row of byBrowser.results) { byBrowserMap[row.browser] = row.c; }

        // Build by_hour map (0-23)
        const byHourMap = {};
        for (let h = 0; h < 24; h++) byHourMap[String(h)] = 0;
        for (const row of byHour.results) { byHourMap[String(parseInt(row.hr))] = row.c; }

        // Build by_day map (0=Sun..6=Sat mapped to Mon..Sun labels)
        const dayLabels = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
        const byDayMap = {};
        for (const d of dayLabels) byDayMap[d] = 0;
        for (const row of byDay.results) { byDayMap[dayLabels[parseInt(row.dw)] || "?"] = row.c; }

        // Build by_country map
        const byCountryMap = {};
        for (const row of byCountry.results) { byCountryMap[row.country] = row.c; }

        // Build nps_distribution
        const npsDistribMap = {};
        for (let i = 1; i <= 10; i++) npsDistribMap[String(i)] = 0;
        let lowNpsCount = 0;
        for (const row of npsDistrib.results) {
          npsDistribMap[String(row.nps_score)] = row.c;
          if (row.nps_score < 7) lowNpsCount += row.c;
        }

        // Checklist compliance: fraction of responses where all required items are checked
        const checklistItems = await env.DB.prepare("SELECT checklist_items FROM trace_points WHERE id=?").bind(pointId).first();
        let checklistCompliance = null;
        if (checklistItems?.checklist_items) {
          const items = JSON.parse(checklistItems.checklist_items);
          const required = items.filter(i => i.required);
          if (required.length > 0 && totalResponses > 0) {
            const allResps = await env.DB.prepare("SELECT checklist_data FROM trace_responses WHERE point_id=?").bind(pointId).all();
            let compliant = 0;
            for (const r of allResps.results) {
              const cd = JSON.parse(r.checklist_data || "{}");
              if (required.every(i => cd[i.id] === true)) compliant++;
            }
            checklistCompliance = parseFloat((compliant / totalResponses).toFixed(2));
          }
        }

        return json({
          ok: true,
          analytics: {
            total_scans: totalScans,
            total_responses: totalResponses,
            unique_devices: uniqueDev?.c || 0,
            avg_nps: avgNpsRow?.avg ? parseFloat(avgNpsRow.avg.toFixed(1)) : null,
            avg_time_on_page: avgTimeRow?.avg ? Math.round(avgTimeRow.avg) : null,
            response_rate: totalScans > 0 ? parseFloat((totalResponses / totalScans).toFixed(2)) : 0,
            by_device: byDeviceMap,
            by_browser: byBrowserMap,
            by_hour: byHourMap,
            by_day: byDayMap,
            by_country: byCountryMap,
            by_city: byCity.results,
            repeat_scanners: repeatScan?.c || 0,
            checklist_compliance: checklistCompliance,
            low_nps_count: lowNpsCount,
            nps_distribution: npsDistribMap,
            recent_responses: recentResps.results,
          },
        });
      }

      // GET /api/trace/analytics/summary
      if (path === "/api/trace/analytics/summary" && method === "GET") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;

        const from = url.searchParams.get("from") || new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
        const to = url.searchParams.get("to") || new Date().toISOString().split("T")[0];

        const points = await env.DB.prepare(
          "SELECT id, name, scan_count FROM trace_points WHERE user_id=? ORDER BY scan_count DESC"
        ).bind(user.sub).all();
        const pointIds = points.results.map(p => p.id);

        if (pointIds.length === 0) {
          return json({ ok: true, summary: { total_scans: 0, total_responses: 0, unique_devices: 0, avg_nps: null, response_rate: 0, top_points: [], alert_summary: { total: 0, low_nps: 0, missed_checklist: 0 } } });
        }

        const placeholders = pointIds.map(() => "?").join(",");
        const fromTs = from + " 00:00:00";
        const toTs = to + " 23:59:59";

        const [totalResp, uniqueDev, avgNpsRow, alertsRow] = await Promise.all([
          env.DB.prepare(`SELECT COUNT(*) as c FROM trace_responses WHERE point_id IN (${placeholders}) AND created_at BETWEEN ? AND ?`).bind(...pointIds, fromTs, toTs).first(),
          env.DB.prepare(`SELECT COUNT(DISTINCT device_fingerprint) as c FROM trace_responses WHERE point_id IN (${placeholders}) AND device_fingerprint IS NOT NULL AND created_at BETWEEN ? AND ?`).bind(...pointIds, fromTs, toTs).first(),
          env.DB.prepare(`SELECT AVG(nps_score) as avg FROM trace_responses WHERE point_id IN (${placeholders}) AND nps_score IS NOT NULL AND created_at BETWEEN ? AND ?`).bind(...pointIds, fromTs, toTs).first(),
          env.DB.prepare(`SELECT alert_type, COUNT(*) as c FROM trace_alerts WHERE point_id IN (${placeholders}) AND is_resolved=0 GROUP BY alert_type`).bind(...pointIds).all(),
        ]);

        const totalScans = points.results.reduce((s, p) => s + (p.scan_count || 0), 0);
        const totalResponses = totalResp?.c || 0;

        const alertSummary = { total: 0, low_nps: 0, missed_checklist: 0 };
        for (const a of alertsRow.results) {
          alertSummary.total += a.c;
          if (a.alert_type === "low_nps") alertSummary.low_nps = a.c;
          if (a.alert_type === "missed_checklist") alertSummary.missed_checklist = a.c;
        }

        return json({
          ok: true,
          summary: {
            total_scans: totalScans,
            total_responses: totalResponses,
            unique_devices: uniqueDev?.c || 0,
            avg_nps: avgNpsRow?.avg ? parseFloat(avgNpsRow.avg.toFixed(1)) : null,
            response_rate: totalScans > 0 ? parseFloat((totalResponses / totalScans).toFixed(2)) : 0,
            top_points: points.results.slice(0, 5).map(p => ({ id: p.id, name: p.name, scan_count: p.scan_count || 0 })),
            alert_summary: alertSummary,
          },
        });
      }

      // ══════════════════════════════════════════
      // R2 Image Upload
      // ══════════════════════════════════════════

      // POST /api/upload/image
      if (path === "/api/upload/image" && method === "POST") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;

        if (!env.ASSETS) return json({ ok: false, error: "R2 bucket no configurado" }, 500);

        const sizeLimits = { free: 512 * 1024, starter: 2 * 1024 * 1024, pro: 10 * 1024 * 1024, enterprise: 50 * 1024 * 1024 };
        const maxSize = sizeLimits[user.plan] || sizeLimits.free;

        const formData = await request.formData();
        const file = formData.get("file");
        if (!file || typeof file === "string") return json({ ok: false, error: "Archivo requerido" }, 400);

        const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];
        if (!allowedTypes.includes(file.type)) {
          return json({ ok: false, error: "Formato no permitido. Usa JPG, PNG, WebP o SVG" }, 400);
        }

        if (file.size > maxSize) {
          const maxMB = (maxSize / (1024 * 1024)).toFixed(0);
          return json({ ok: false, error: `Archivo muy grande (máx ${maxMB}MB)` }, 400);
        }

        const extMap = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/svg+xml": "svg" };
        const ext = extMap[file.type] || "bin";
        const key = `uploads/${user.sub}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

        await env.ASSETS.put(key, file.stream(), { httpMetadata: { contentType: file.type } });

        return json({ ok: true, url: `https://assets.intaprd.com/${key}` }, 201);
      }

      // ── Collaborators ────────────────────────────────────────────────────────

      const COLLABORATOR_LIMITS = { free: 5, starter: 20, pro: 100, enterprise: -1 };

      // GET /api/collaborators
      if (path === "/api/collaborators" && method === "GET") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const rows = await env.DB.prepare(
          "SELECT * FROM collaborators WHERE tenant_id = ? ORDER BY name ASC"
        ).bind(user.sub).all();
        return json({ ok: true, collaborators: rows.results });
      }

      // POST /api/collaborators
      if (path === "/api/collaborators" && method === "POST") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const limit = COLLABORATOR_LIMITS[user.plan] ?? 5;
        if (limit !== -1) {
          const count = await env.DB.prepare(
            "SELECT COUNT(*) as c FROM collaborators WHERE tenant_id = ? AND is_active = 1"
          ).bind(user.sub).first();
          if ((count?.c ?? 0) >= limit) {
            return json({ ok: false, error: `Límite de ${limit} colaboradores alcanzado. Mejora tu plan para agregar más.` }, 403);
          }
        }
        const { name, position, department, email, phone } = await request.json();
        if (!name?.trim()) return json({ ok: false, error: "El nombre es requerido" }, 400);
        const id = uuid();
        await env.DB.prepare(
          "INSERT INTO collaborators (id, tenant_id, name, position, department, email, phone) VALUES (?,?,?,?,?,?,?)"
        ).bind(id, user.sub, name.trim(), position || null, department || null, email || null, phone || null).run();
        return json({ ok: true, id }, 201);
      }

      // PUT /api/collaborators/:id
      if (path.match(/^\/api\/collaborators\/[^/]+$/) && method === "PUT") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const collabId = path.split("/")[3];
        const collab = await env.DB.prepare("SELECT tenant_id FROM collaborators WHERE id=?").bind(collabId).first();
        if (!collab) return json({ ok: false, error: "Colaborador no encontrado" }, 404);
        if (collab.tenant_id !== user.sub && user.role !== "superadmin") return json({ ok: false, error: "Sin permiso" }, 403);
        const { name, position, department, email, phone, is_active } = await request.json();
        await env.DB.prepare(
          "UPDATE collaborators SET name=?, position=?, department=?, email=?, phone=?, is_active=? WHERE id=?"
        ).bind(
          name?.trim() || null, position || null, department || null, email || null, phone || null,
          is_active !== undefined ? (is_active ? 1 : 0) : 1,
          collabId
        ).run();
        return json({ ok: true });
      }

      // DELETE /api/collaborators/:id
      if (path.match(/^\/api\/collaborators\/[^/]+$/) && method === "DELETE") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const collabId = path.split("/")[3];
        const collab = await env.DB.prepare("SELECT tenant_id FROM collaborators WHERE id=?").bind(collabId).first();
        if (!collab) return json({ ok: false, error: "Colaborador no encontrado" }, 404);
        if (collab.tenant_id !== user.sub && user.role !== "superadmin") return json({ ok: false, error: "Sin permiso" }, 403);
        await env.DB.prepare("UPDATE collaborators SET is_active=0 WHERE id=?").bind(collabId).run();
        return json({ ok: true });
      }

      // POST /api/collaborators/bulk
      if (path === "/api/collaborators/bulk" && method === "POST") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const { collaborators: items } = await request.json();
        if (!Array.isArray(items) || items.length === 0) return json({ ok: false, error: "Sin datos" }, 400);
        const limit = COLLABORATOR_LIMITS[user.plan] ?? 5;
        if (limit !== -1) {
          const count = await env.DB.prepare(
            "SELECT COUNT(*) as c FROM collaborators WHERE tenant_id = ? AND is_active = 1"
          ).bind(user.sub).first();
          const current = count?.c ?? 0;
          if (current + items.length > limit) {
            return json({ ok: false, error: `Importar ${items.length} colaboradores excedería el límite de ${limit}. Actualmente tienes ${current}.` }, 403);
          }
        }
        const batch = items.slice(0, 50);
        await Promise.all(batch.map(item =>
          env.DB.prepare(
            "INSERT INTO collaborators (id, tenant_id, name, position, department, email, phone) VALUES (?,?,?,?,?,?,?)"
          ).bind(uuid(), user.sub, (item.name || "").trim(), item.position || null, item.department || item.area || null, item.email || null, item.phone || null).run()
        ));
        return json({ ok: true, imported: batch.length }, 201);
      }

      // AI Chat
      if (path === "/api/ai/chat" && method === "POST") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const { message } = await request.json();
        if (!message) return json({ ok: false, error: "Mensaje requerido" }, 400);

        const aiConfig = await env.DB.prepare("SELECT * FROM tenant_ai_config WHERE user_id=?").bind(user.sub).first().catch(() => null);
        const systemPrompt = aiConfig?.system_prompt || "Eres Intap, un asistente de operaciones y calidad. Ayudas a gestores de negocio a interpretar métricas, checklists y feedback. Responde en español, de forma clara y accionable.";
        const provider = aiConfig?.llm_provider || "claude";
        const apiKey = aiConfig?.llm_api_key || null;

        try {
          // Always fall back to platform Claude key if no tenant key
          const effectiveKey = apiKey || env.ANTHROPIC_API_KEY;
          const effectiveProvider = effectiveKey === env.ANTHROPIC_API_KEY ? "claude" : provider;
          const response = await callLLM({ provider: effectiveProvider, apiKey: effectiveKey, systemPrompt, userPrompt: message, maxTokens: 600, env });
          return json({ ok: true, message: response || "Recibí tu mensaje pero no pude generar una respuesta. Intenta de nuevo." });
        } catch (e) {
          console.error("AI chat error:", e);
          return json({ ok: true, message: "En este momento no puedo conectarme con el asistente. Verifica que la clave de IA esté configurada en el panel de administración." });
        }
      }

      // ── TRACE Tracking endpoints ──────────────────────────────────────────────

      // PUBLIC: GET /api/trace/tracking/:id/public
      if (path.startsWith("/api/trace/tracking/") && path.endsWith("/public") && method === "GET") {
        const trackingId = path.split("/api/trace/tracking/")[1].replace("/public", "");
        const record = await env.DB.prepare("SELECT * FROM trace_tracking WHERE id=?").bind(trackingId).first();
        if (!record) return json({ ok: false, error: "Registro no encontrado" }, 404);
        const events = await env.DB.prepare("SELECT * FROM trace_tracking_events WHERE tracking_id=? ORDER BY timestamp ASC").bind(trackingId).all();
        return json({ ok: true, tracking: record, events: events.results || [] });
      }

      // GET /api/trace/tracking/:id/events
      if (path.match(/^\/api\/trace\/tracking\/[^/]+\/events$/) && method === "GET") {
        const user = await getUser(request, env);
        const err = requireAuth(user); if (err) return err;
        const trackingId = path.split("/api/trace/tracking/")[1].replace("/events", "");
        const record = await env.DB.prepare("SELECT * FROM trace_tracking WHERE id=? AND tenant_id=?").bind(trackingId, user.sub).first();
        if (!record) return json({ ok: false, error: "Registro no encontrado" }, 404);
        const events = await env.DB.prepare("SELECT * FROM trace_tracking_events WHERE tracking_id=? ORDER BY timestamp ASC").bind(trackingId).all();
        return json({ ok: true, events: events.results || [] });
      }

      // POST /api/trace/tracking/:id/events
      if (path.match(/^\/api\/trace\/tracking\/[^/]+\/events$/) && method === "POST") {
        const user = await getUser(request, env);
        const err = requireAuth(user); if (err) return err;
        const trackingId = path.split("/api/trace/tracking/")[1].replace("/events", "");
        const record = await env.DB.prepare("SELECT * FROM trace_tracking WHERE id=? AND tenant_id=?").bind(trackingId, user.sub).first();
        if (!record) return json({ ok: false, error: "Registro no encontrado" }, 404);
        const { event_type, description, location, scanned_by, receiver_name, receiver_signature, photo_url } = await request.json();
        if (!event_type) return json({ ok: false, error: "Tipo de evento requerido" }, 400);
        const id = crypto.randomUUID().replace(/-/g, "");
        await env.DB.prepare(
          "INSERT INTO trace_tracking_events (id, tracking_id, event_type, description, location, scanned_by, receiver_name, receiver_signature, photo_url) VALUES (?,?,?,?,?,?,?,?,?)"
        ).bind(id, trackingId, event_type, description || null, location || null, scanned_by || null, receiver_name || null, receiver_signature || null, photo_url || null).run();
        // Auto-update tracking status based on event
        const statusMap = { salida_almacen: "in_transit", en_camino: "in_transit", entregado: "delivered", recibido: "delivered", devuelto: "returned" };
        if (statusMap[event_type]) {
          await env.DB.prepare("UPDATE trace_tracking SET status=?, updated_at=datetime('now') WHERE id=?").bind(statusMap[event_type], trackingId).run();
        }
        return json({ ok: true, id }, 201);
      }

      // GET /api/trace/tracking
      if (path === "/api/trace/tracking" && method === "GET") {
        const user = await getUser(request, env);
        const err = requireAuth(user); if (err) return err;
        const url2 = new URL(request.url);
        const status = url2.searchParams.get("status");
        const type = url2.searchParams.get("type");
        let q = "SELECT * FROM trace_tracking WHERE tenant_id=?";
        const params = [user.sub];
        if (status) { q += " AND status=?"; params.push(status); }
        if (type) { q += " AND tracking_type=?"; params.push(type); }
        q += " ORDER BY created_at DESC LIMIT 100";
        const result = await env.DB.prepare(q).bind(...params).all();
        return json({ ok: true, records: result.results || [] });
      }

      // POST /api/trace/tracking
      if (path === "/api/trace/tracking" && method === "POST") {
        const user = await getUser(request, env);
        const err = requireAuth(user); if (err) return err;
        const { title, tracking_type, item_description, item_code, origin_location, destination_location, assigned_to, notes, project_id } = await request.json();
        if (!title || !tracking_type) return json({ ok: false, error: "Título y tipo requeridos" }, 400);
        const validTypes = ["delivery", "rental", "retail", "custom"];
        if (!validTypes.includes(tracking_type)) return json({ ok: false, error: "Tipo inválido" }, 400);
        const id = crypto.randomUUID().replace(/-/g, "");
        await env.DB.prepare(
          "INSERT INTO trace_tracking (id, tenant_id, project_id, title, tracking_type, item_description, item_code, origin_location, destination_location, assigned_to, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
        ).bind(id, user.sub, project_id || null, title, tracking_type, item_description || null, item_code || null, origin_location || null, destination_location || null, assigned_to || null, notes || null).run();
        return json({ ok: true, id }, 201);
      }

      // PUT /api/trace/tracking/:id
      if (path.match(/^\/api\/trace\/tracking\/[^/]+$/) && method === "PUT") {
        const user = await getUser(request, env);
        const err = requireAuth(user); if (err) return err;
        const trackingId = path.split("/api/trace/tracking/")[1];
        const record = await env.DB.prepare("SELECT * FROM trace_tracking WHERE id=? AND tenant_id=?").bind(trackingId, user.sub).first();
        if (!record) return json({ ok: false, error: "Registro no encontrado" }, 404);
        const body = await request.json();
        const allowed = ["title", "status", "notes", "assigned_to", "origin_location", "destination_location", "item_code", "item_description"];
        const sets = [];
        const vals = [];
        for (const k of allowed) {
          if (body[k] !== undefined) { sets.push(`${k}=?`); vals.push(body[k]); }
        }
        if (sets.length === 0) return json({ ok: false, error: "Sin campos para actualizar" }, 400);
        sets.push("updated_at=datetime('now')");
        vals.push(trackingId);
        await env.DB.prepare(`UPDATE trace_tracking SET ${sets.join(",")} WHERE id=?`).bind(...vals).run();
        return json({ ok: true });
      }

      // DELETE /api/trace/tracking/:id
      if (path.match(/^\/api\/trace\/tracking\/[^/]+$/) && method === "DELETE") {
        const user = await getUser(request, env);
        const err = requireAuth(user); if (err) return err;
        const trackingId = path.split("/api/trace/tracking/")[1];
        const record = await env.DB.prepare("SELECT * FROM trace_tracking WHERE id=? AND tenant_id=?").bind(trackingId, user.sub).first();
        if (!record) return json({ ok: false, error: "Registro no encontrado" }, 404);
        await env.DB.prepare("UPDATE trace_tracking SET status='cancelled', updated_at=datetime('now') WHERE id=?").bind(trackingId).run();
        return json({ ok: true });
      }

      // GET /api/trace/stats
      if (path === "/api/trace/stats" && method === "GET") {
        const user = await getUser(request, env);
        const err = requireAuth(user); if (err) return err;
        const [totalResponses, avgNps, totalContacts, activePoints] = await Promise.all([
          env.DB.prepare("SELECT COUNT(*) as c FROM trace_responses tr JOIN trace_points tp ON tr.point_id=tp.id WHERE tp.tenant_id=?").bind(user.sub).first(),
          env.DB.prepare("SELECT AVG(nps_score) as avg FROM trace_responses tr JOIN trace_points tp ON tr.point_id=tp.id WHERE tp.tenant_id=? AND nps_score IS NOT NULL").bind(user.sub).first(),
          env.DB.prepare("SELECT COUNT(DISTINCT contact_email) as c FROM trace_responses tr JOIN trace_points tp ON tr.point_id=tp.id WHERE tp.tenant_id=? AND contact_email IS NOT NULL").bind(user.sub).first(),
          env.DB.prepare("SELECT COUNT(*) as c FROM trace_points WHERE tenant_id=? AND is_active=1").bind(user.sub).first(),
        ]);
        const last30 = await env.DB.prepare(`
          SELECT DATE(tr.created_at) as day, COUNT(*) as count
          FROM trace_responses tr JOIN trace_points tp ON tr.point_id=tp.id
          WHERE tp.tenant_id=? AND tr.created_at > datetime('now', '-30 days')
          GROUP BY day ORDER BY day ASC
        `).bind(user.sub).all();
        const npsDistrib = await env.DB.prepare(`
          SELECT
            SUM(CASE WHEN nps_score >= 9 THEN 1 ELSE 0 END) as promoters,
            SUM(CASE WHEN nps_score BETWEEN 7 AND 8 THEN 1 ELSE 0 END) as neutrals,
            SUM(CASE WHEN nps_score <= 6 AND nps_score IS NOT NULL THEN 1 ELSE 0 END) as detractors
          FROM trace_responses tr JOIN trace_points tp ON tr.point_id=tp.id WHERE tp.tenant_id=?
        `).bind(user.sub).first();
        const topPoints = await env.DB.prepare(`
          SELECT tp.name, tp.point_type, COUNT(tr.id) as responses, AVG(tr.nps_score) as avg_nps
          FROM trace_points tp LEFT JOIN trace_responses tr ON tr.point_id=tp.id
          WHERE tp.tenant_id=? GROUP BY tp.id ORDER BY responses DESC LIMIT 5
        `).bind(user.sub).all();
        return json({ ok: true, stats: {
          totalResponses: totalResponses?.c || 0,
          avgNps: avgNps?.avg ? Math.round(avgNps.avg * 10) / 10 : null,
          totalContacts: totalContacts?.c || 0,
          activePoints: activePoints?.c || 0,
          last30Days: last30.results || [],
          npsDistribution: npsDistrib || { promoters: 0, neutrals: 0, detractors: 0 },
          topPoints: topPoints.results || [],
        }});
      }

      // GET /api/trace/contacts
      if (path === "/api/trace/contacts" && method === "GET") {
        const user = await getUser(request, env);
        const err = requireAuth(user); if (err) return err;
        const contacts = await env.DB.prepare(`
          SELECT
            contact_email as email,
            contact_name as name,
            contact_phone as phone,
            COUNT(*) as total_visits,
            MAX(tr.created_at) as last_visit,
            MIN(tr.created_at) as first_visit,
            AVG(nps_score) as avg_nps,
            MAX(referral_source) as referral_source
          FROM trace_responses tr
          JOIN trace_points tp ON tr.point_id = tp.id
          WHERE tp.tenant_id = ? AND contact_email IS NOT NULL
          GROUP BY contact_email
          ORDER BY last_visit DESC
          LIMIT 200
        `).bind(user.sub).all();
        return json({ ok: true, contacts: contacts.results || [] });
      }

      // ══════════════════════════════════════════
      // PUT /api/trace/contacts/stage
      // ══════════════════════════════════════════
      if (path === "/api/trace/contacts/stage" && method === "PUT") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const { email, stage } = await request.json();
        const valid = ["nuevo","interesado","recurrente","promotor","inactivo"];
        if (!valid.includes(stage)) return json({ ok: false, error: "Estado inválido" }, 400);
        await env.DB.prepare(
          "INSERT INTO trace_contacts (tenant_id, email, stage) VALUES (?,?,?) ON CONFLICT(tenant_id,email) DO UPDATE SET stage=excluded.stage"
        ).bind(user.sub, email, stage).run().catch(() => null);
        return json({ ok: true });
      }

      // ══════════════════════════════════════════
      // GET /api/analytics/advanced
      // ══════════════════════════════════════════
      if (path === "/api/analytics/advanced" && method === "GET") {
        const user = await getUser(request, env);
        const err = requireAuth(user);
        if (err) return err;
        const qrId = url.searchParams.get("qrId");
        const days = parseInt(url.searchParams.get("days") || "30");

        const baseWhere = qrId
          ? "link_slug = ? AND tenant_id = ?"
          : "tenant_id = ?";
        const baseParams = qrId ? [qrId, user.sub] : [user.sub];

        const timeOfDay = await env.DB.prepare(`
          SELECT
            SUM(CASE WHEN CAST(strftime('%H', scanned_at) AS INTEGER) BETWEEN 6 AND 11 THEN 1 ELSE 0 END) as morning,
            SUM(CASE WHEN CAST(strftime('%H', scanned_at) AS INTEGER) BETWEEN 12 AND 17 THEN 1 ELSE 0 END) as afternoon,
            SUM(CASE WHEN CAST(strftime('%H', scanned_at) AS INTEGER) BETWEEN 18 AND 23 THEN 1 ELSE 0 END) as evening,
            SUM(CASE WHEN CAST(strftime('%H', scanned_at) AS INTEGER) BETWEEN 0 AND 5 THEN 1 ELSE 0 END) as night
          FROM qr_analytics WHERE ${baseWhere} AND scanned_at > datetime('now', '-${days} days')
        `).bind(...baseParams).first().catch(() => null);

        const thisWeekRow = await env.DB.prepare(
          `SELECT COUNT(*) as c FROM qr_analytics WHERE ${baseWhere} AND scanned_at > datetime('now', '-7 days')`
        ).bind(...baseParams).first().catch(() => null);

        const lastWeekRow = await env.DB.prepare(
          `SELECT COUNT(*) as c FROM qr_analytics WHERE ${baseWhere} AND scanned_at BETWEEN datetime('now', '-14 days') AND datetime('now', '-7 days')`
        ).bind(...baseParams).first().catch(() => null);

        const thisWeek = thisWeekRow?.c || 0;
        const lastWeek = lastWeekRow?.c || 0;

        return json({ ok: true, analytics: {
          timeOfDay: timeOfDay || { morning: 0, afternoon: 0, evening: 0, night: 0 },
          thisWeek,
          lastWeek,
          weekTrend: lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null,
        }});
      }

      // ══════════════════════════════════════════
      // BILLING — Invoices, Subscriptions, Gateways
      // ══════════════════════════════════════════

      // GET /api/admin/invoices
      if (path === "/api/admin/invoices" && method === "GET") {
        const user = await getUser(request, env);
        if (user?.role !== "superadmin") return json({ ok: false, error: "Acceso denegado" }, 403);
        const status = url.searchParams.get("status");
        const tenantId = url.searchParams.get("tenant_id");
        let q = "SELECT i.*, u.email as tenant_email FROM invoices i JOIN users u ON u.id=i.tenant_id WHERE 1=1";
        const params = [];
        if (status) { q += " AND i.status=?"; params.push(status); }
        if (tenantId) { q += " AND i.tenant_id=?"; params.push(tenantId); }
        q += " ORDER BY i.created_at DESC LIMIT 200";
        const rows = await env.DB.prepare(q).bind(...params).all();
        return json({ ok: true, invoices: rows.results || [] });
      }

      // POST /api/admin/invoices
      if (path === "/api/admin/invoices" && method === "POST") {
        const user = await getUser(request, env);
        if (user?.role !== "superadmin") return json({ ok: false, error: "Acceso denegado" }, 403);
        const body = await request.json();
        const { tenant_id, plan, billing_cycle, amount_usd, currency, payment_method, payment_gateway, gateway_ref, notes, due_date, status } = body;
        if (!tenant_id || !plan || !amount_usd) return json({ ok: false, error: "Campos requeridos: tenant_id, plan, amount_usd" }, 400);
        const paid_at = status === "paid" ? new Date().toISOString() : null;
        await env.DB.prepare(
          "INSERT INTO invoices (tenant_id, plan, billing_cycle, amount_usd, currency, status, payment_method, payment_gateway, gateway_ref, notes, due_date, paid_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)"
        ).bind(tenant_id, plan, billing_cycle||"monthly", amount_usd, currency||"USD", status||"pending", payment_method||null, payment_gateway||null, gateway_ref||null, notes||null, due_date||null, paid_at).run();
        if (status === "paid") {
          await env.DB.prepare("UPDATE subscriptions SET payment_status='active', last_payment_at=datetime('now'), failed_attempts=0 WHERE tenant_id=?").bind(tenant_id).run();
        }
        return json({ ok: true });
      }

      // PUT /api/admin/invoices/:id
      if (path.startsWith("/api/admin/invoices/") && method === "PUT") {
        const user = await getUser(request, env);
        if (user?.role !== "superadmin") return json({ ok: false, error: "Acceso denegado" }, 403);
        const invoiceId = path.split("/api/admin/invoices/")[1];
        const body = await request.json();
        const { status, payment_method, payment_gateway, gateway_ref, notes, paid_at } = body;
        const effectivePaidAt = status === "paid" ? (paid_at || new Date().toISOString()) : null;
        await env.DB.prepare(
          "UPDATE invoices SET status=COALESCE(?,status), payment_method=COALESCE(?,payment_method), payment_gateway=COALESCE(?,payment_gateway), gateway_ref=COALESCE(?,gateway_ref), notes=COALESCE(?,notes), paid_at=COALESCE(?,paid_at) WHERE id=?"
        ).bind(status||null, payment_method||null, payment_gateway||null, gateway_ref||null, notes||null, effectivePaidAt, invoiceId).run();
        if (status === "paid") {
          const inv = await env.DB.prepare("SELECT tenant_id FROM invoices WHERE id=?").bind(invoiceId).first();
          if (inv) await env.DB.prepare("UPDATE subscriptions SET payment_status='active', last_payment_at=datetime('now'), failed_attempts=0 WHERE tenant_id=?").bind(inv.tenant_id).run();
        }
        return json({ ok: true });
      }

      // GET /api/admin/tenants/:id/invoices
      if (path.match(/^\/api\/admin\/tenants\/[^/]+\/invoices$/) && method === "GET") {
        const user = await getUser(request, env);
        if (user?.role !== "superadmin") return json({ ok: false, error: "Acceso denegado" }, 403);
        const tenantId = path.split("/")[4];
        const rows = await env.DB.prepare(
          "SELECT i.*, u.email as tenant_email FROM invoices i JOIN users u ON u.id=i.tenant_id WHERE i.tenant_id=? ORDER BY i.created_at DESC LIMIT 100"
        ).bind(tenantId).all();
        return json({ ok: true, invoices: rows.results || [] });
      }

      // POST /api/admin/tenants/:id/billing-suspend
      if (path.match(/^\/api\/admin\/tenants\/[^/]+\/billing-suspend$/) && method === "POST") {
        const user = await getUser(request, env);
        if (user?.role !== "superadmin") return json({ ok: false, error: "Acceso denegado" }, 403);
        const tenantId = path.split("/")[4];
        const { reason } = await request.json().catch(() => ({}));
        await env.DB.prepare("UPDATE subscriptions SET payment_status='suspended' WHERE tenant_id=?").bind(tenantId).run();
        await env.DB.prepare("UPDATE users SET plan='free' WHERE id=?").bind(tenantId).run();
        await env.DB.prepare("INSERT INTO admin_notifications (type, title, message, tenant_id) VALUES ('warning','Cuenta suspendida',?,?)").bind(reason||"Cuenta suspendida por falta de pago.", tenantId).run().catch(()=>{});
        return json({ ok: true });
      }

      // POST /api/admin/tenants/:id/billing-reactivate
      if (path.match(/^\/api\/admin\/tenants\/[^/]+\/billing-reactivate$/) && method === "POST") {
        const user = await getUser(request, env);
        if (user?.role !== "superadmin") return json({ ok: false, error: "Acceso denegado" }, 403);
        const tenantId = path.split("/")[4];
        const { plan } = await request.json().catch(() => ({}));
        const targetPlan = plan || "starter";
        await env.DB.prepare("UPDATE subscriptions SET payment_status='active', failed_attempts=0 WHERE tenant_id=?").bind(tenantId).run();
        await env.DB.prepare("UPDATE users SET plan=? WHERE id=?").bind(targetPlan, tenantId).run();
        return json({ ok: true });
      }

      // POST /api/admin/tenants/:id/downgrade
      if (path.match(/^\/api\/admin\/tenants\/[^/]+\/downgrade$/) && method === "POST") {
        const user = await getUser(request, env);
        if (user?.role !== "superadmin") return json({ ok: false, error: "Acceso denegado" }, 403);
        const tenantId = path.split("/")[4];
        await env.DB.prepare("UPDATE users SET plan='free' WHERE id=?").bind(tenantId).run();
        await env.DB.prepare("UPDATE subscriptions SET payment_status='cancelled', updated_at=datetime('now') WHERE tenant_id=?").bind(tenantId).run();
        return json({ ok: true });
      }

      // GET /api/admin/payment-gateways
      if (path === "/api/admin/payment-gateways" && method === "GET") {
        const user = await getUser(request, env);
        if (user?.role !== "superadmin") return json({ ok: false, error: "Acceso denegado" }, 403);
        const rows = await env.DB.prepare("SELECT id, name, provider, is_active, is_default, created_at FROM payment_gateways ORDER BY is_default DESC, name ASC").all();
        return json({ ok: true, gateways: rows.results || [] });
      }

      // POST /api/admin/payment-gateways
      if (path === "/api/admin/payment-gateways" && method === "POST") {
        const user = await getUser(request, env);
        if (user?.role !== "superadmin") return json({ ok: false, error: "Acceso denegado" }, 403);
        const body = await request.json();
        const { name, provider, config_json, is_default } = body;
        if (!name || !provider) return json({ ok: false, error: "name y provider son requeridos" }, 400);
        if (is_default) await env.DB.prepare("UPDATE payment_gateways SET is_default=0").run();
        await env.DB.prepare("INSERT INTO payment_gateways (name, provider, config_json, is_default) VALUES (?,?,?,?)").bind(name, provider, JSON.stringify(config_json||{}), is_default?1:0).run();
        return json({ ok: true });
      }

      // PUT /api/admin/payment-gateways/:id
      if (path.startsWith("/api/admin/payment-gateways/") && method === "PUT") {
        const user = await getUser(request, env);
        if (user?.role !== "superadmin") return json({ ok: false, error: "Acceso denegado" }, 403);
        const gwId = path.split("/api/admin/payment-gateways/")[1];
        const body = await request.json();
        const { name, provider, is_active, is_default, config_json } = body;
        if (is_default) await env.DB.prepare("UPDATE payment_gateways SET is_default=0").run();
        await env.DB.prepare(
          "UPDATE payment_gateways SET name=COALESCE(?,name), provider=COALESCE(?,provider), is_active=COALESCE(?,is_active), is_default=COALESCE(?,is_default), config_json=COALESCE(?,config_json) WHERE id=?"
        ).bind(name||null, provider||null, is_active??null, is_default??null, config_json ? JSON.stringify(config_json) : null, gwId).run();
        return json({ ok: true });
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
