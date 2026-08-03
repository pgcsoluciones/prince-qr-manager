const state = {
  comments: {
    construction: '',
    logistics: '',
  },
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

function sanitizePresentationCopy() {
  const scenario = getScenario();

  document.querySelectorAll('.operator-hint').forEach((node) => {
    if (node.dataset.operationalCopy === 'true') return;
    node.dataset.operationalCopy = 'true';
    node.innerHTML = scenario === 'logistics'
      ? '<span><strong>Incidencia en proceso</strong><br>Almacén recibió la solicitud y la corrección está pendiente de validación.</span>'
      : '<span><strong>Incidencia en seguimiento</strong><br>La corrección fue asignada al supervisor y la etapa permanece retenida.</span>';
  });

  document.querySelectorAll('.report-hero p').forEach((paragraph) => {
    const text = paragraph.textContent?.trim();
    if (text === 'Consulta la vista de almacén para revisar y aprobar la respuesta.') {
      paragraph.textContent = 'Almacén recibió la incidencia. La operación permanece en espera de validación.';
    }
  });

  document.querySelectorAll('.empty-role p').forEach((paragraph) => {
    paragraph.textContent = scenario === 'logistics'
      ? 'No hay incidencias asignadas a almacén en este momento.'
      : 'No hay incidencias pendientes de revisión en este momento.';
  });
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

  const approveButton = [...approval.querySelectorAll('button')].find((button) => button.textContent.includes('Aprobar corrección'));
  approveButton?.addEventListener('click', () => {
    window.setTimeout(() => {
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
  if (!card || card.querySelector('.runtime-final-report')) return;

  const scenario = getScenario();
  const comment = state.comments[scenario];
  const report = document.createElement('section');
  report.className = 'runtime-final-report';

  if (scenario === 'logistics') {
    report.innerHTML = `
      <div class="runtime-report-head"><span>REPORTE FINAL DEL OPERADOR</span><strong>Pedido liberado y flujo continuado</strong></div>
      <div class="runtime-report-grid">
        <article><span>Incidencia registrada</span><strong>INC-2048</strong></article>
        <article><span>Área responsable</span><strong>Almacén y empaque</strong></article>
        <article><span>Corrección</span><strong>Caja agregada y peso validado</strong></article>
        <article><span>Estado final</span><strong>En ruta a destino</strong></article>
      </div>
      ${comment ? `<div class="runtime-comment"><span>Comentario del área</span><p>${comment.replaceAll('<','&lt;').replaceAll('>','&gt;')}</p></div>` : ''}
      <div class="runtime-timeline">
        <p>✓ Pedido recibido · 9:05 a. m.</p>
        <p>✓ Pago confirmado · 9:12 a. m.</p>
        <p>✓ Preparación iniciada · 10:03 a. m.</p>
        <p>✓ Incidencia INC-2048 registrada · 10:47 a. m.</p>
        <p>✓ Corrección aprobada · 11:02 a. m.</p>
        <p>✓ Despacho confirmado · 11:18 a. m.</p>
        <p>● En ruta a destino · 11:22 a. m.</p>
      </div>
    `;
  } else {
    report.innerHTML = `
      <div class="runtime-report-head"><span>REPORTE FINAL DEL OPERADOR</span><strong>Control de etapa registrado</strong></div>
      <div class="runtime-report-grid">
        <article><span>Incidencia registrada</span><strong>INC-OBRA-031</strong></article>
        <article><span>Área responsable</span><strong>Terminaciones y pintura</strong></article>
        <article><span>Corrección</span><strong>Acabado nivelado y documentado</strong></article>
        <article><span>Estado final</span><strong>Etapa liberada</strong></article>
      </div>
      ${comment ? `<div class="runtime-comment"><span>Comentario del supervisor</span><p>${comment.replaceAll('<','&lt;').replaceAll('>','&gt;')}</p></div>` : ''}
      <div class="runtime-timeline">
        <p>✓ Punto de control identificado · 8:00 a. m.</p>
        <p>✓ Avance y observación registrados · 10:42 a. m.</p>
        <p>✓ Evidencias vinculadas · 10:48 a. m.</p>
        <p>✓ Incidencia INC-OBRA-031 registrada · 10:51 a. m.</p>
        <p>✓ Corrección aprobada por supervisión · 11:18 a. m.</p>
        <p>✓ Etapa liberada para continuar · 11:20 a. m.</p>
      </div>
    `;
  }

  card.appendChild(report);
}

function enhancePublicTimeline() {
  const publicRole = document.querySelector('.public-role');
  if (!publicRole) return;
  const history = publicRole.querySelector('.public-history');
  if (!history || history.dataset.fullUpdates === 'true') return;
  history.dataset.fullUpdates = 'true';

  if (getScenario() === 'logistics') {
    history.innerHTML = `
      <h2>Actualizaciones del pedido</h2>
      <p>✓ Pedido recibido · 9:05 a. m.</p>
      <p>✓ Pago confirmado · 9:12 a. m.</p>
      <p>✓ Preparación completada · 11:02 a. m.</p>
      <p>✓ Despacho confirmado · 11:18 a. m.</p>
      <p>● En ruta a destino · 11:22 a. m.</p>
      <p>○ Próxima actualización: entrega</p>
    `;
  }
}

function enhance() {
  sanitizePresentationCopy();
  enhanceDepartmentView();
  enhanceOperatorFinal();
  enhancePublicTimeline();
}

const observer = new MutationObserver(enhance);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('DOMContentLoaded', enhance);
