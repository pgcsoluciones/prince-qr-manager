import { useState } from 'react';
import { ArrowRight, CalendarCheck, CheckCircle2, MessageCircle, ShieldCheck } from 'lucide-react';
import App from './App.jsx';
import { AboutAndProjects } from './PersonalSections.jsx';
import './landing.css';

const WHATSAPP_BASE = 'https://wa.me/';

function scrollToId(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function LandingApp() {
  const [showPlatform, setShowPlatform] = useState(false);
  const [form, setForm] = useState({ name: '', company: '', phone: '', operation: '', need: '', interest: 'Solicitar evaluación' });

  if (showPlatform) return <App />;

  const submit = (event) => {
    event.preventDefault();
    const message = [
      'Hola Juan Luis, me interesa conocer más sobre INTAP Trace.',
      `Nombre: ${form.name || 'No indicado'}`,
      `Empresa: ${form.company || 'No indicada'}`,
      `Teléfono: ${form.phone || 'No indicado'}`,
      `Tipo de operación: ${form.operation || 'No indicado'}`,
      `Principal necesidad: ${form.need || 'No indicada'}`,
      `Interés: ${form.interest}`,
    ].join('\n');
    window.open(`${WHATSAPP_BASE}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <main className="marketing-page">
      <header className="marketing-header">
        <div className="marketing-brand"><span>IT</span><div><strong>INTAP Trace</strong><small>Por Juan Luis Prince</small></div></div>
        <nav>
          <button onClick={() => scrollToId('solucion')}>La solución</button>
          <button onClick={() => scrollToId('sobre-mi')}>Sobre mí</button>
          <button onClick={() => scrollToId('proyectos')}>Proyectos</button>
          <button className="header-cta" onClick={() => scrollToId('evaluacion')}>Solicitar evaluación</button>
        </nav>
      </header>

      <section className="marketing-hero">
        <div className="marketing-hero-copy">
          <span className="marketing-kicker">CONTROL · EVIDENCIA · TRAZABILIDAD</span>
          <h1>Convierte cada paso de tu operación en información clara y verificable.</h1>
          <p>INTAP Trace ayuda a registrar actividades, responsables, evidencias, incidencias y resultados en un solo recorrido. Menos llamadas para preguntar qué pasó. Más claridad para decidir y responder.</p>
          <div className="marketing-actions">
            <button className="marketing-primary" onClick={() => scrollToId('evaluacion')}>Solicitar evaluación <ArrowRight size={18}/></button>
            <button className="marketing-secondary" onClick={() => setShowPlatform(true)}>Ver cómo funciona</button>
          </div>
          <div className="trust-row">
            <span><ShieldCheck size={17}/> Evidencia vinculada</span>
            <span><CheckCircle2 size={17}/> Responsables definidos</span>
            <span><CalendarCheck size={17}/> Seguimiento actualizado</span>
          </div>
        </div>
        <div className="visual-story" aria-label="Operación en campo y seguimiento digital">
          <article className="visual-card construction-photo"><div><small>CONSTRUCCIÓN</small><strong>Registro desde el lugar de trabajo</strong></div></article>
          <article className="visual-card logistics-photo"><div><small>LOGÍSTICA</small><strong>Control desde el pedido hasta la entrega</strong></div></article>
          <div className="floating-proof"><span>Evento verificado</span><strong>Responsable + evidencia + hora</strong></div>
        </div>
      </section>

      <section className="problem-section" id="solucion">
        <div><span className="marketing-kicker">EL PROBLEMA COTIDIANO</span><h2>Cuando la operación depende de llamadas, chats y fotos sueltas, supervisar cuesta más.</h2></div>
        <div className="problem-grid">
          {[
            'No queda claro quién realizó cada actividad.',
            'Las fotografías aparecen sin contexto ni ubicación.',
            'Las incidencias se conocen demasiado tarde.',
            'El cliente pregunta constantemente por el estado.',
          ].map((item) => <article key={item}><span>01</span><p>{item}</p></article>)}
        </div>
      </section>

      <section className="workflow-section">
        <span className="marketing-kicker">CÓMO FUNCIONA</span>
        <h2>Un recorrido simple para una operación mejor documentada.</h2>
        <div className="workflow-grid">
          {['Responsable','Control','Evidencia','Supervisión','Resultado'].map((item,index)=><article key={item}><span>{String(index+1).padStart(2,'0')}</span><strong>{item}</strong><p>{['La persona correcta recibe la tarea.','Se registra lo que debe verificarse.','Fotos y datos quedan vinculados.','Se aprueba o solicita corrección.','El cliente consulta un reporte claro.'][index]}</p></article>)}
        </div>
      </section>

      <AboutAndProjects onOpenPlatform={() => setShowPlatform(true)} onEvaluate={() => scrollToId('evaluacion')} />

      <section className="evaluation-section" id="evaluacion">
        <div className="evaluation-copy"><span className="marketing-kicker">EVALUEMOS TU CASO</span><h2>Cuéntame cómo funciona actualmente tu operación.</h2><p>No necesitas cambiarlo todo de una vez. Primero identificamos dónde se pierde tiempo, evidencia o control, y luego evaluamos una solución práctica.</p><div className="evaluation-note"><MessageCircle/><div><strong>Conversación directa</strong><span>La solicitud se prepara para enviarla por WhatsApp.</span></div></div></div>
        <form onSubmit={submit} className="evaluation-form">
          <label><span>Nombre</span><input value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} required/></label>
          <label><span>Empresa</span><input value={form.company} onChange={(e)=>setForm({...form,company:e.target.value})}/></label>
          <label><span>Teléfono</span><input value={form.phone} onChange={(e)=>setForm({...form,phone:e.target.value})} required/></label>
          <label><span>Tipo de operación</span><input value={form.operation} onChange={(e)=>setForm({...form,operation:e.target.value})} placeholder="Construcción, logística, mantenimiento..."/></label>
          <label className="full-field"><span>¿Qué dificultad quieres resolver?</span><textarea value={form.need} onChange={(e)=>setForm({...form,need:e.target.value})} rows="4"/></label>
          <label className="full-field"><span>Me interesa</span><select value={form.interest} onChange={(e)=>setForm({...form,interest:e.target.value})}><option>Solicitar evaluación</option><option>Solicitar presentación</option><option>Recibir información</option></select></label>
          <button className="marketing-primary full-field" type="submit">Enviar solicitud por WhatsApp <ArrowRight size={18}/></button>
        </form>
      </section>

      <footer className="marketing-footer"><div><strong>Juan Luis Prince</strong><span>Soluciones digitales prácticas para operaciones reales.</span></div><button onClick={() => scrollToId('evaluacion')}>Hablemos de tu proceso</button></footer>
    </main>
  );
}
