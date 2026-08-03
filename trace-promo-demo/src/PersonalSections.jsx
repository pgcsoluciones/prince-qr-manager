import { ArrowRight, Bot, BookOpenCheck, ContactRound, Network, UserRound } from 'lucide-react';

const projects = [
  {
    icon: Network,
    title: 'INTAP Trace',
    text: 'Trazabilidad operativa para documentar actividades, responsables, evidencias, incidencias y resultados.',
    tags: ['Operaciones', 'Evidencia', 'Seguimiento'],
  },
  {
    icon: ContactRound,
    title: 'INTAP Link',
    text: 'Perfiles digitales conectados con NFC y QR para compartir identidad, contacto, servicios y enlaces.',
    tags: ['NFC', 'QR', 'Perfil digital'],
  },
  {
    icon: BookOpenCheck,
    title: 'INTAP Flip',
    text: 'Catálogos interactivos con fichas, multimedia y recorridos que convierten una presentación en una experiencia útil.',
    tags: ['Catálogos', 'Interacción', 'Ventas'],
  },
  {
    icon: Bot,
    title: 'Soluciones con IA',
    text: 'Automatizaciones, asistentes y herramientas personalizadas para reducir tareas repetitivas y mejorar procesos.',
    tags: ['IA', 'Automatización', 'A medida'],
  },
];

export function AboutAndProjects({ onOpenPlatform, onEvaluate }) {
  return (
    <>
      <section className="about-section" id="sobre-mi">
        <div className="about-visual">
          <div className="portrait-placeholder">
            <UserRound size={54}/>
            <span>Fotografía personal</span>
            <small>Se reemplazará por la imagen definitiva</small>
          </div>
          <div className="about-stamp"><strong>+24 años</strong><span>de experiencia gestionando personas, operaciones y procesos</span></div>
        </div>
        <div className="about-copy">
          <span className="marketing-kicker">SOBRE MÍ</span>
          <h2>Soy Juan Luis Prince. Creo soluciones digitales partiendo de problemas reales.</h2>
          <p>Durante años he trabajado de cerca con equipos, clientes, operaciones y procesos cotidianos. Esa experiencia me enseñó que muchos problemas importantes comienzan con detalles pequeños: una información que no llegó, una evidencia que quedó suelta o una tarea que nadie pudo confirmar.</p>
          <p>Mi forma de trabajar comienza entendiendo cómo funciona hoy la operación. Luego identifico dónde se pierde tiempo, control o información y evalúo qué herramientas existentes podemos aprovechar o qué solución conviene construir.</p>
          <div className="about-principles">
            <span>Lenguaje claro</span><span>Soluciones prácticas</span><span>Tecnología con propósito</span>
          </div>
          <button className="marketing-primary" onClick={onEvaluate}>Hablemos de tu operación <ArrowRight size={18}/></button>
        </div>
      </section>

      <section className="projects-section" id="proyectos">
        <div className="projects-heading"><div><span className="marketing-kicker">MIS PROYECTOS</span><h2>Un ecosistema de soluciones para conectar, presentar y controlar mejor.</h2></div><p>Cada proyecto responde a una necesidad distinta, pero todos comparten la misma idea: hacer que la tecnología sea útil, clara y accesible.</p></div>
        <div className="projects-grid">
          {projects.map(({ icon: Icon, title, text, tags }) => <article className="project-card" key={title}><div className="project-icon"><Icon/></div><h3>{title}</h3><p>{text}</p><div className="project-tags">{tags.map(tag=><span key={tag}>{tag}</span>)}</div>{title === 'INTAP Trace' && <button onClick={onOpenPlatform}>Explorar plataforma <ArrowRight size={16}/></button>}</article>)}
        </div>
      </section>
    </>
  );
}
