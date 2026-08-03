const state = {
  comments: { construction: '', logistics: '' },
  approved: { construction: false, logistics: false },
};

function getScenario() {
  const headerText = document.querySelector('.sim-header')?.textContent || '';
  return headerText.includes('Pedido INT-1048') ? 'logistics' : 'construction';
}

function clickByText(selector, text) {
  const target = [...document.querySelectorAll(selector)].find((node) => node.textContent?.includes(text));
  target?.click();
  return Boolean(target);
}

function openOperatorFinal() {
  clickByText('.role-switcher button', 'Vista del operador');
  window.setTimeout(() => {
    const steps = [...document.querySelectorAll('.step-nav > button')];
    steps.at(-1)?.click();
  }, 80);
}

function syncApprovedState() {
  const scenario = getScenario();
  const successText = [...document.querySelectorAll('.success-note')]
    .map((node) => node.textContent || '')
    .join(' ');
  const approvedButton = [...document.querySelectorAll('.approval-box button')]
    .some((button) => button.textContent?.includes('Corrección aprobada'));

  if (approvedButton || /Despacho liberado|Etapa liberada|Corrección aprobada/i.test(successText)) {
    state.approved[scenario] = true;
  }
}

function sanitizeOperationalCopy() {
  const scenario = getScenario();
  const approved = state.approved[scenario];

  document.querySelectorAll('.operator-hint').forEach((node) => {
    const next = approved
      ? (scenario === 'logistics'
        ? '<span><strong>Corrección aprobada</strong><br>El pedido fue liberado y continúa hacia despacho.</span>'
        : '<span><strong>Corrección aprobada</strong><br>La etapa fue liberada y el avance quedó actualizado.</span>')
      : (scenario === 'logistics'
        ? '<span><strong>En espera de almacén</strong><br>La incidencia fue recibida y el despacho permanece retenido hasta su corrección.</span>'
        : '<span><strong>En espera de supervisión</strong><br>La incidencia fue recibida y la etapa permanece retenida hasta su validación.</span>');
    if (node.innerHTML !== next) node.innerHTML = next;
  });

  document.querySelectorAll('.report-hero p').forEach((paragraph) => {
    const text = paragraph.textContent?.trim() || '';
    if (scenario === 'logistics' && /Consulta la vista de almacén|Almacén recibió la incidencia|operación permanece en espera/i.test(text)) {
      const next = approved
        ? 'La corrección fue aprobada. El pedido quedó liberado para despacho.'
        : 'Almacén recibió la incidencia. El despacho permanece retenido hasta completar la corrección.';
      if (paragraph.textContent !== next) paragraph.textContent = next;
    }
    if (scenario === 'construction' && /Incidencia enviada y en revisión|etapa permanece retenida/i.test(text)) {
      const next = approved
        ? 'La corrección fue aprobada y la etapa quedó liberada.'
        : 'La incidencia fue recibida y la etapa permanece en revisión.';
      if (paragraph.textContent !== next) paragraph.textContent = next;
    }
  });

  document.querySelectorAll('.empty-role p').forEach((paragraph) => {
    const next = scenario === 'logistics'
      ? 'No hay incidencias asignadas a almacén en este momento.'
      : 'No hay incidencias pendientes de revisión en este momento.';
    if (paragraph.textContent !== next) paragraph.textContent = next;
  });

  if (approved) {
    document.querySelectorAll('.review-list > div').forEach((row) => {
      const label = row.querySelector('span')?.textContent?.trim();
      const value = row.querySelector('strong');
      if (label === 'Estado' && value) value.textContent = scenario === 'logistics' ? 'Despacho liberado' : 'Etapa liberada';
    });
  }
}

function enhanceDepartmentView() {
  const approval = document.querySelector('.approval-box');
  if (!approval || approval.dataset.commentsReady === 'true') return;
  approval.dataset.commentsReady = 'true';

  const scenario = getScenario();
  const field = document.createElement('label');
  field.className = 'supervisor-comment-field';
  field.innerHTML = `
    <span>Comentario u observación</span>
    <textarea rows="3" placeholder="Registra una observación antes de aprobar o devolver la corrección."></textarea>
  `;
  const textarea = field.querySelector('textarea');
  textarea.value = state.comments[scenario] || '';
  textarea.addEventListener('input', (event) => {
    state.comments[scenario] = event.target.value;
  });
  approval.parentElement?.insertBefore(field, approval);

  const approveButton = [...approval.querySelectorAll('button')]
    .find((button) => button.textContent.includes('Aprobar corrección'));

  approveButton?.addEventListener('click', () => {
    state.approved[scenario] = true;
    window.setTimeout(() => {
      syncApprovedState();
      sanitizeOperationalCopy();
      const success = document.querySelector('.success-note');
      if (!success || document.querySelector('.return-operator-report')) return;
      const button = document.createElement('button');
      button.className = 'primary return-operator-report';
      button.innerHTML = 'Abrir estado actualizado →';
      button.addEventListener('click', openOperatorFinal);
      success.insertAdjacentElement('afterend', button);
    }, 120);
  }, { once: true });
}

function buildStatusMarkup(scenario, approved) {
  const isLogistics = scenario === 'logistics';
  const status = approved ? 'Aprobado' : 'En revisión';
  const operation = approved
    ? (isLogistics ? 'Liberado para despacho' : 'Etapa liberada')
    : (isLogistics ? 'Despacho retenido' : 'Etapa retenida');
  const response = approved
    ? (isLogistics ? 'Corrección validada por almacén' : 'Corrección validada por supervisión')
    : (isLogistics ? 'En espera de respuesta de almacén' : 'En espera de validación del supervisor');
  const incidentId = isLogistics ? 'INC-2048' : 'INC-OBRA-031';
  const area = isLogistics ? 'Almacén y empaque' : 'Terminaciones y pintura';

  return `
    <section class="runtime-status-panel" style="margin-top:20px;padding:22px;border:1px solid #dce4ee;border-radius:16px;background:#fff">
      <div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap">
        <div><span style="color:#1458e8;font-weight:800;letter-spacing:.1em;font-size:12px">ESTADO DE LA INCIDENCIA</span><h3 style="margin:7px 0 4px;font-size:26px">${incidentId}</h3><p style="margin:0;color:#66758c">${response}</p></div>
        <span style="padding:8px 12px;border-radius:999px;background:${approved ? '#edf9f1' : '#fff5e8'};color:${approved ? '#257343' : '#9a641c'};font-weight:800">${status}</span>
      </div>
      <div class="runtime-report-grid" style="margin-top:18px">
        <article><span>Área responsable</span><strong>${area}</strong></article>
        <article><span>Estado de operación</span><strong>${operation}</strong></article>
        <article><span>Última actualización</span><strong>${approved ? 'Hoy · 11:18 a. m.' : 'Hoy · 10:51 a. m.'}</strong></article>
        <article><span>Siguiente acción</span><strong>${approved ? 'Continuar recorrido' : 'Esperar respuesta'}</strong></article>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px">
        <button type="button" class="primary runtime-open-report">Ver reporte final →</button>
        <button type="button" class="secondary runtime-share-whatsapp">Compartir por WhatsApp</button>
      </div>
      <p style="margin:12px 0 0;color:#758197;font-size:12px">El mensaje incluye el estado actual y un enlace al registro.</p>
    </section>
  `;
}

function buildFinalReportMarkup(scenario, approved, comment) {
  if (scenario === 'logistics') {
    return `
      <div class="runtime-report-head"><span>REPORTE FINAL DEL OPERADOR</span><strong>${approved ? 'Pedido liberado y en ruta' : 'Pedido retenido por incidencia'}</strong></div>
      <div class="runtime-report-grid">
        <article><span>Incidencia registrada</span><strong>INC-2048</strong></article>
        <article><span>Área responsable</span><strong>Almacén y empaque</strong></article>
        <article><span>Corrección</span><strong>${approved ? 'Caja agregada y peso validado' : 'Pendiente de validación'}</strong></article>
        <article><span>Estado final</span><strong>${approved ? 'En ruta a destino' : 'Despacho retenido'}</strong></article>
      </div>
      ${comment ? `<div class="runtime-comment"><span>Comentario del área</span><p>${comment.replaceAll('<','&lt;').replaceAll('>','&gt;')}</p></div>` : ''}
      <div class="runtime-timeline">
        <p>✓ Pedido recibido · 9:05 a. m.</p>
        <p>✓ Pago confirmado · 9:12 a. m.</p>
        <p>✓ Preparación iniciada · 10:03 a. m.</p>
        <p>✓ Incidencia INC-2048 registrada · 10:47 a. m.</p>
        ${approved ? '<p>✓ Corrección aprobada · 11:02 a. m.</p><p>✓ Despacho confirmado · 11:18 a. m.</p><p>● En ruta a destino · 11:22 a. m.</p>' : '<p>○ En espera de corrección de almacén</p>'}
      </div>
    `;
  }

  return `
    <div class="runtime-report-head"><span>REPORTE FINAL DEL OPERADOR</span><strong>${approved ? 'Etapa liberada para continuar' : 'Etapa retenida por incidencia'}</strong></div>
    <div class="runtime-report-grid">
      <article><span>Incidencia registrada</span><strong>INC-OBRA-031</strong></article>
      <article><span>Área responsable</span><strong>Terminaciones y pintura</strong></article>
      <article><span>Corrección</span><strong>${approved ? 'Acabado nivelado y documentado' : 'Pendiente de validación'}</strong></article>
      <article><span>Estado final</span><strong>${approved ? 'Etapa liberada' : 'En revisión'}</strong></article>
    </div>
    ${comment ? `<div class="runtime-comment"><span>Comentario del supervisor</span><p>${comment.replaceAll('<','&lt;').replaceAll('>','&gt;')}</p></div>` : ''}
    <div class="runtime-timeline">
      <p>✓ Punto de control identificado · 8:00 a. m.</p>
      <p>✓ Avance y observación registrados · 10:42 a. m.</p>
      <p>✓ Evidencias vinculadas · 10:48 a. m.</p>
      <p>✓ Incidencia INC-OBRA-031 registrada · 10:51 a. m.</p>
      ${approved ? '<p>✓ Corrección aprobada por supervisión · 11:18 a. m.</p><p>✓ Etapa liberada para continuar · 11:20 a. m.</p>' : '<p>○ En espera de validación del supervisor</p>'}
    </div>
  `;
}

function enhanceOperatorFinal() {
  const heading = document.querySelector('.workspace h1');
  if (!heading || !['Cierre operativo', 'Despacho', 'Estado de incidencia', 'Reporte final'].includes(heading.textContent.trim())) return;
  const card = document.querySelector('.screen-frame .enhanced-card');
  if (!card || card.dataset.statusReady === 'true') return;
  card.dataset.statusReady = 'true';

  const scenario = getScenario();
  const approved = state.approved[scenario];
  const comment = state.comments[scenario];
  heading.textContent = 'Estado de incidencia';

  card.querySelector('.runtime-final-report')?.remove();
  card.insertAdjacentHTML('beforeend', buildStatusMarkup(scenario, approved));

  const report = document.createElement('section');
  report.className = 'runtime-final-report';
  report.style.display = 'none';
  report.innerHTML = buildFinalReportMarkup(scenario, approved, comment);
  card.appendChild(report);

  card.querySelector('.runtime-open-report')?.addEventListener('click', () => {
    const statusPanel = card.querySelector('.runtime-status-panel');
    if (statusPanel) statusPanel.style.display = 'none';
    report.style.display = 'block';
    heading.textContent = 'Reporte final';
    report.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  card.querySelector('.runtime-share-whatsapp')?.addEventListener('click', () => {
    const incidentId = scenario === 'logistics' ? 'INC-2048' : 'INC-OBRA-031';
    const statusText = approved
      ? (scenario === 'logistics' ? 'Corrección aprobada. Pedido liberado para despacho.' : 'Corrección aprobada. Etapa liberada para continuar.')
      : (scenario === 'logistics' ? 'Incidencia en espera de respuesta de almacén.' : 'Incidencia en espera de validación del supervisor.');
    const message = `${incidentId} · ${statusText}\nAbrir registro: ${window.location.href}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  });
}

function enhancePublicTimeline() {
  const publicRole = document.querySelector('.public-role');
  if (!publicRole) return;
  const history = publicRole.querySelector('.public-history');
  if (!history) return;

  if (getScenario() === 'logistics') {
    const next = `
      <h2>Actualizaciones del pedido</h2>
      <p>✓ Pedido recibido · 9:05 a. m.</p>
      <p>✓ Pago confirmado · 9:12 a. m.</p>
      <p>✓ Preparación completada · 11:02 a. m.</p>
      <p>✓ Despacho confirmado · 11:18 a. m.</p>
      <p>● En ruta a destino · 11:22 a. m.</p>
      <p>○ Próxima actualización: entrega</p>
    `;
    if (history.innerHTML !== next) history.innerHTML = next;
  }
}

function enhance() {
  syncApprovedState();
  sanitizeOperationalCopy();
  enhanceDepartmentView();
  enhanceOperatorFinal();
  enhancePublicTimeline();
}

const observer = new MutationObserver(enhance);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('DOMContentLoaded', enhance);
