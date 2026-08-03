const sectors = [
  {
    title: 'Restaurantes',
    text: 'Controla preparación, tiempos, temperatura, incidencias, despacho y entrega de pedidos.',
    chips: ['Preparación', 'Temperatura', 'Evidencia', 'Despacho'],
    icon: '<path d="M7 2v9M4 2v5a3 3 0 0 0 6 0V2M7 11v11M17 2c-2.2 2.4-3 5.4-3 9h6V2h-3Zm0 9v11"/>'
  },
  {
    title: 'Limpieza y conserjería',
    text: 'Verifica rutinas, áreas atendidas, responsables, evidencias y aprobación del supervisor.',
    chips: ['Rutinas', 'Áreas', 'Evidencia', 'Supervisión'],
    icon: '<path d="m3 21 6-6M9 15l4 4M14 4l6 6M16 2l6 6M14 4 2-2M20 10l2-2M5 17l2 2M3 19l2 2"/><path d="m8 14 6-6 2 2-6 6"/>'
  },
  {
    title: 'Hotelería',
    text: 'Supervisa habitaciones, limpieza, mantenimiento, solicitudes e incidencias de cada servicio.',
    chips: ['Habitaciones', 'Servicio', 'Mantenimiento', 'Incidencias'],
    icon: '<path d="M3 21V3h18v18M3 9h18M8 3v6M16 3v6M7 13h3M14 13h3M7 17h3M14 17h3"/>'
  },
  {
    title: 'Seguridad',
    text: 'Documenta rondas, puestos, novedades, alertas, evidencias y acciones correctivas.',
    chips: ['Rondas', 'Novedades', 'Alertas', 'Evidencia'],
    icon: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>'
  }
];

function makeSectorCard(sector) {
  const card = document.createElement('article');
  card.className = 'solution-card sector-card';
  card.innerHTML = `
    <div class="solution-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${sector.icon}</svg>
    </div>
    <div>
      <h2>${sector.title}</h2>
      <p>${sector.text}</p>
      <div class="chips">${sector.chips.map(chip => `<span>${chip}</span>`).join('')}</div>
      <b>Aplicación por sector</b>
    </div>`;
  return card;
}

function enhanceFacade() {
  const grid = document.querySelector('.home .solution-grid');
  if (!grid || grid.dataset.sectorsReady === 'true') return;

  grid.dataset.sectorsReady = 'true';
  grid.setAttribute('aria-label', 'Sectores de aplicación de INTAP Trace');

  const heading = document.createElement('div');
  heading.className = 'sector-heading';
  heading.innerHTML = '<span>SECTORES DE APLICACIÓN</span><h2>Una misma trazabilidad para distintas operaciones.</h2><p>INTAP Trace adapta responsables, controles, evidencias, incidencias y reportes a la forma real de trabajar de cada sector.</p>';
  grid.parentNode.insertBefore(heading, grid);

  sectors.forEach(sector => grid.appendChild(makeSectorCard(sector)));
}

const observer = new MutationObserver(enhanceFacade);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('DOMContentLoaded', enhanceFacade);
enhanceFacade();
