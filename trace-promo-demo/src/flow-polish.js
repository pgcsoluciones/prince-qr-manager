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
      button.innerHTML = 'Abrir reporte final →';
      button.addEventListener('click', openOperatorFinal);
      success.insertAdjacentElement('afterend', button);
    }, 120);
  }, { once: true });
}

function enhanceOperatorFinal() {
  const heading = document.querySelector('.workspace h1');
  if (!heading || !['Cierre operativo', 'Despacho'].includes(heading.textContent.trim())) return;
  const card = document.querySelector('.screen-frame .enhanced-card');
  if (!card) return;

  const scenario = getScenario();
  const approved = state.approved[scenario];
  const comment = state.comments[scenario];
  card.querySelector('.runtime-final-report')?.remove();

  const report = document.createElement('section');
  report.className = 'runtime-final-report';

  if (scenario === 'logistics') {
    report.innerHTML = `
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
  } else {
    report.innerHTML = `
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

  card.appendChild(report);
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
