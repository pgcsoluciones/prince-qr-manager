import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Building2,
  CalendarDays,
  Camera,
  Check,
  ClipboardCheck,
  MessageCircle,
  PackageCheck,
  ShieldCheck,
  Truck,
  UserRound,
} from 'lucide-react';

const pains = [
  'Trabajos reportados solamente por llamadas o WhatsApp.',
  'Fotografías sin saber exactamente a qué tarea pertenecen.',
  'Incidencias que llegan tarde al supervisor.',
  'Clientes preguntando constantemente por el estado.',
];

const flow = [
  ['Responsable', UserRound],
  ['Control', ClipboardCheck],
  ['Evidencia', Camera],
  ['Supervisión', ShieldCheck],
  ['Resultado', Check],
];

function Brand() {
  return <div className="lp-brand"><span>IT</span><div><strong>INTAP Trace</strong><small>Por Juan Luis Prince</small></div></div>;
}

function scrollTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function Landing({ onOpenPlatform }) {
  const [form, setForm] = useState({ name: '', company: '', phone: '', operation: '', challenge: '', interest: 'Solicitar evaluación' });
  const [sent, setSent] = useState(false);

  const message = useMemo(() => {
    return [
      'Hola Juan Luis, me interesa conocer INTAP Trace.',
      `Nombre: ${form.name || 'No indicado'}`,
      `Empresa: ${form.company || 'No indicada'}`,
      `Teléfono: ${form.phone || 'No indicado'}`,
      `Tipo de operación: ${form.operation || 'No indicado'}`,
      `Interés: ${form.interest}`,
      `Principal dificultad: ${form.challenge || 'No indicada'}`,
    ].join('\n');
  }, [form]);

  const submit = event => {
    event.preventDefault();
    setSent(true);
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  const update = event => setForm(current => ({ ...current, [event.target.name]: event.target.value }));

  return <main className="landing-page">
    <header className="lp-header">
      <Brand/>
      <nav>
        <button onClick={() => scrollTo('problema')}>El problema</button>
        <button onClick={() => scrollTo('soluciones')}>Soluciones</button>
        <button onClick={() => scrollTo('proceso')}>Cómo funciona</button>
        <button className="lp-nav-cta" onClick={() => scrollTo('evaluacion')}>Evaluar mi caso</button>
      </nav>
    </header>

    <section className="lp-hero">
      <div className="lp-hero-copy">
        <span className="lp-eyebrow">CONTROL · EVIDENCIA · TRAZABILIDAD</span>
        <h1>Controla mejor tu operación y demuestra cada paso.</h1>
        <p>INTAP Trace convierte actividades, controles, evidencias e incidencias en un recorrido claro para tu equipo, tus supervisores y tus clientes.</p>
        <div className="lp-actions">
          <button className="lp-primary" onClick={() => scrollTo('evaluacion')}>Solicitar evaluación <ArrowRight size={18}/></button>
          <button className="lp-secondary" onClick={() => onOpenPlatform('construction')}>Ver cómo funciona</button>
        </div>
        <div className="lp-trust-row">
          <span><Check size={16}/> Sin instalar aplicaciones</span>
          <span><Check size={16}/> Acceso desde móvil</span>
          <span><Check size={16}/> Adaptable a cada proceso</span>
        </div>
      </div>
      <div className="lp-hero-visual" aria-label="Vista previa de INTAP Trace">
        <div className="lp-dashboard-card">
          <div className="lp-dashboard-head"><strong>Resumen operativo</strong><span>Hoy</span></div>
          <div className="lp-dashboard-stats"><article><small>Operaciones activas</small><strong>24</strong></article><article><small>En supervisión</small><strong>8</strong></article><article><small>Incidencias</small><strong>3</strong></article></div>
          <div className="lp-activity"><b>Actividad reciente</b><p><Check size={14}/> Avance registrado · Apartamento 304</p><p><Camera size={14}/> Evidencia vinculada · 10:48 a. m.</p><p className="warning"><ShieldCheck size={14}/> Corrección solicitada · 11:18 a. m.</p></div>
        </div>
        <div className="lp-phone-card"><small>PEDIDO INT-1048</small><strong>En ruta</strong><div><span className="done">✓</span> Pedido confirmado</div><div><span className="done">✓</span> Empaque validado</div><div><span>3</span> Entrega en proceso</div></div>
      </div>
    </section>

    <section className="lp-problem" id="problema">
      <div className="lp-section-copy"><span className="lp-kicker">EL PROBLEMA COTIDIANO</span><h2>La operación ocurre, pero la información queda dispersa.</h2><p>Cuando los controles dependen de llamadas, mensajes y fotografías sueltas, supervisar toma más tiempo y demostrar lo ocurrido se vuelve difícil.</p></div>
      <div className="lp-pain-grid">{pains.map(item => <article key={item}><span>!</span><p>{item}</p></article>)}</div>
    </section>

    <section className="lp-value" id="proceso">
      <div className="lp-section-copy centered"><span className="lp-kicker">CÓMO LO RESOLVEMOS</span><h2>Cada actividad se convierte en un evento verificable.</h2><p>El QR o enlace abre el proceso. El valor está en conectar quién actuó, qué control realizó, qué evidencia dejó y cuál fue el resultado.</p></div>
      <div className="lp-flow">{flow.map(([label, Icon], index) => <div key={label}><span><Icon size={22}/></span><strong>{label}</strong>{index < flow.length - 1 && <ArrowRight size={18}/>}</div>)}</div>
    </section>

    <section className="lp-solutions" id="soluciones">
      <div className="lp-section-copy"><span className="lp-kicker">APLICACIONES REALES</span><h2>Comienza por el proceso que más necesita claridad.</h2></div>
      <div className="lp-solution-grid">
        <article><div className="lp-solution-icon"><Building2/></div><small>CONSTRUCCIÓN</small><h3>Avance, evidencia e incidencias por área.</h3><p>Registra controles desde el lugar de trabajo, documenta correcciones y ofrece al cliente una vista clara del avance.</p><ul><li>Avance por etapa</li><li>Evidencia fotográfica</li><li>Revisión del supervisor</li><li>Reporte para el cliente</li></ul><button onClick={() => onOpenPlatform('construction')}>Explorar construcción <ArrowRight size={17}/></button></article>
        <article><div className="lp-solution-icon"><Truck/></div><small>LOGÍSTICA</small><h3>Del pedido a la entrega confirmada.</h3><p>Controla picking, empaque, diferencias, despacho y recepción sin perder la historia de cada pedido.</p><ul><li>Registro del pedido</li><li>Controles de preparación</li><li>Evidencia de empaque</li><li>Seguimiento público</li></ul><button onClick={() => onOpenPlatform('logistics')}>Explorar logística <ArrowRight size={17}/></button></article>
      </div>
    </section>

    <section className="lp-about">
      <div className="lp-portrait"><span>JLP</span></div>
      <div><span className="lp-kicker">ACOMPAÑAMIENTO PERSONAL</span><h2>Soy Juan Luis Prince.</h2><p>Trabajo identificando puntos de descontrol dentro de las operaciones y convirtiéndolos en soluciones digitales prácticas. Primero evaluamos cómo funciona tu proceso, dónde se pierde tiempo o información y qué necesita realmente tu equipo.</p><p className="lp-signature">A sus Órdenes Siempre.</p></div>
    </section>

    <section className="lp-evaluation" id="evaluacion">
      <div className="lp-evaluation-copy"><span className="lp-kicker">EVALUEMOS TU CASO</span><h2>Cuéntame cómo funciona actualmente tu operación.</h2><p>No necesitas cambiar todo de una vez. Podemos comenzar por un punto crítico y construir una solución ajustada a tu realidad.</p><div className="lp-eval-benefits"><span><CalendarDays/> Evaluación inicial del proceso</span><span><PackageCheck/> Identificación de oportunidades</span><span><MessageCircle/> Contacto directo por WhatsApp</span></div></div>
      <form className="lp-form" onSubmit={submit}>
        <label>Nombre<input required name="name" value={form.name} onChange={update} placeholder="Tu nombre"/></label>
        <label>Empresa<input name="company" value={form.company} onChange={update} placeholder="Nombre de la empresa"/></label>
        <label>Teléfono o WhatsApp<input required name="phone" value={form.phone} onChange={update} placeholder="809-000-0000"/></label>
        <label>Tipo de operación<select required name="operation" value={form.operation} onChange={update}><option value="">Selecciona una opción</option><option>Construcción</option><option>Logística y entregas</option><option>Mantenimiento</option><option>Limpieza o supervisión</option><option>Otra operación</option></select></label>
        <label className="wide">¿Cuál es la principal dificultad?<textarea required name="challenge" value={form.challenge} onChange={update} placeholder="Describe brevemente qué necesitas controlar o demostrar."/></label>
        <label className="wide">¿Qué deseas solicitar?<select name="interest" value={form.interest} onChange={update}><option>Solicitar evaluación</option><option>Solicitar una demostración</option><option>Recibir más información</option></select></label>
        <button className="lp-primary wide" type="submit">Enviar solicitud por WhatsApp <MessageCircle size={18}/></button>
        {sent && <p className="lp-form-note">Se abrió WhatsApp con la información de tu solicitud. Solo debes elegir el contacto y enviar el mensaje.</p>}
      </form>
    </section>

    <footer className="lp-footer"><Brand/><p>INTAP Trace · Control, evidencia y trazabilidad operativa.</p><button onClick={() => scrollTo('evaluacion')}>Hablemos de tu proceso</button></footer>
  </main>;
}
